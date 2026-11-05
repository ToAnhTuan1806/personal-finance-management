package com.smartexpense.backend;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import com.zaxxer.hikari.HikariDataSource;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.mysql.MySQLContainer;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.*;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * D08-DB: Suite kiểm thử tích hợp Migration V004 và các ràng buộc dữ liệu của bảng recurring_templates.
 * Tuân thủ quy tắc kiểm thử an toàn:
 * - Chỉ chạy trên database test độc lập (Testcontainers hoặc MySQL testbed riêng), không chạy trên production.
 * - Áp dụng tuần tự MVP fixture -> V002 -> V003 -> V004.
 * - Kiểm tra tính toàn vẹn của dữ liệu cũ D01-D07 sau migration.
 * - Kiểm tra dữ liệu biên hợp lệ, dữ liệu sai bị từ chối bởi CHECK/FK constraints.
 * - Khi thiếu Backend Entity, dùng JUnit Assumptions để đánh dấu SKIPPED/ABORTED đúng thực tế.
 */
@TestMethodOrder(MethodOrderer.MethodName.class)
public class RecurringTemplateMigrationIntegrationTests {

    private static final Logger log = LoggerFactory.getLogger(RecurringTemplateMigrationIntegrationTests.class);

    private static final String DATABASE = "se_d08_migration_" + UUID.randomUUID().toString().replace("-", "");
    private static String jdbcUrl;
    private static String dbUser;
    private static String dbPassword;
    private static MySQLContainer mysqlContainer;
    private static boolean isLocalMysql = false;

    private static HikariDataSource dataSource;
    private static JdbcTemplate jdbc;

    // Snapshot dữ liệu cũ để đối chiếu sau migration
    private static int legacyUserCount;
    private static int legacyCategoryCount;
    private static int legacyTransactionCount;
    private static BigDecimal legacyTransactionSum;
    private static int legacyMonthlyBudgetCount;
    private static int legacyCategoryBudgetCount;

    private static Long testUserId;
    private static Long testExpenseCategoryId;
    private static Long testIncomeCategoryId;

    @BeforeAll
    static void setUpAll() throws Exception {
        List<Path> migrations = approvedUpgradeMigrations();

        // 1. Khởi tạo môi trường database test độc lập
        if (isDockerRunning()) {
            log.info("Khởi chạy MySQL Testcontainers cho D08 migration test...");
            mysqlContainer = new MySQLContainer("mysql:8.0")
                    .withDatabaseName(DATABASE)
                    .withUsername("d08_test")
                    .withPassword("d08_secret_" + UUID.randomUUID())
                    .withUrlParam("useSSL", "false")
                    .withUrlParam("allowPublicKeyRetrieval", "true")
                    .withUrlParam("serverTimezone", "UTC");
            mysqlContainer.start();
            jdbcUrl = mysqlContainer.getJdbcUrl();
            dbUser = mysqlContainer.getUsername();
            dbPassword = mysqlContainer.getPassword();
        } else {
            log.info("Docker không khả dụng, sử dụng MySQL testbed độc lập tại localhost:3306...");
            isLocalMysql = true;
            String baseAdminUrl = "jdbc:mysql://127.0.0.1:3306/?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC";
            dbUser = "root";
            dbPassword = "12345";

            // Kiểm tra kết nối trước khi tạo database test
            try (Connection conn = DriverManager.getConnection(baseAdminUrl, dbUser, dbPassword)) {
                verifyDatabaseIsolation(DATABASE, baseAdminUrl);
                conn.createStatement().execute("CREATE DATABASE `" + DATABASE + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            }
            jdbcUrl = "jdbc:mysql://127.0.0.1:3306/" + DATABASE + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC";
        }

        verifyDatabaseIsolation(DATABASE, jdbcUrl);

        // 2. Tạo connection pool Hikari
        dataSource = new HikariDataSource();
        dataSource.setJdbcUrl(jdbcUrl);
        dataSource.setUsername(dbUser);
        dataSource.setPassword(dbPassword);
        dataSource.setDriverClassName("com.mysql.cj.jdbc.Driver");
        dataSource.setMaximumPoolSize(3);
        jdbc = new JdbcTemplate(dataSource);

        // 3. Nạp MVP Fixture và dữ liệu mẫu cũ (D01 - D07)
        try (Connection conn = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(conn, new EncodedResource(
                    new ClassPathResource("d06-legacy-schema.sql"), StandardCharsets.UTF_8));

            // Nạp dữ liệu users, categories, transactions, monthly_budgets
            jdbc.update("INSERT INTO users (full_name, email, password_hash, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                    "D08 QA User", "d08_qa_" + UUID.randomUUID() + "@smartexpense.test", "hash_secret");
            testUserId = jdbc.queryForObject("SELECT id FROM users WHERE email LIKE 'd08_qa_%'", Long.class);

            jdbc.update("INSERT INTO categories (name, type, user_id, created_at) VALUES (?, 'EXPENSE', ?, CURRENT_TIMESTAMP)",
                    "Ăn uống D08", testUserId);
            testExpenseCategoryId = jdbc.queryForObject("SELECT id FROM categories WHERE name = 'Ăn uống D08' AND user_id = ?",
                    Long.class, testUserId);

            jdbc.update("INSERT INTO categories (name, type, user_id, created_at) VALUES (?, 'INCOME', ?, CURRENT_TIMESTAMP)",
                    "Lương D08", testUserId);
            testIncomeCategoryId = jdbc.queryForObject("SELECT id FROM categories WHERE name = 'Lương D08' AND user_id = ?",
                    Long.class, testUserId);

            jdbc.update("INSERT INTO transactions (amount, transaction_date, note, type, user_id, category_id, created_at) " +
                    "VALUES (?, '2026-11-01', 'Giao dịch mẫu 1', 'EXPENSE', ?, ?, CURRENT_TIMESTAMP)",
                    new BigDecimal("150000.00"), testUserId, testExpenseCategoryId);
            jdbc.update("INSERT INTO transactions (amount, transaction_date, note, type, user_id, category_id, created_at) " +
                    "VALUES (?, '2026-11-02', 'Giao dịch mẫu 2', 'INCOME', ?, ?, CURRENT_TIMESTAMP)",
                    new BigDecimal("20000000.00"), testUserId, testIncomeCategoryId);

            jdbc.update("INSERT INTO monthly_budgets (user_id, year, month, amount_limit) VALUES (?, 2026, 11, ?)",
                    testUserId, new BigDecimal("10000000.00"));

            // Áp dụng V002 và V003
            apply(conn, migrations.get(0)); // V002
            apply(conn, migrations.get(1)); // V003

            jdbc.update("INSERT INTO category_budgets (user_id, category_id, year, month, amount_limit) VALUES (?, ?, 2026, 11, ?)",
                    testUserId, testExpenseCategoryId, new BigDecimal("3000000.00"));

            // Lưu snapshot dữ liệu cũ
            legacyUserCount = jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
            legacyCategoryCount = jdbc.queryForObject("SELECT COUNT(*) FROM categories", Integer.class);
            legacyTransactionCount = jdbc.queryForObject("SELECT COUNT(*) FROM transactions", Integer.class);
            legacyTransactionSum = jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM transactions", BigDecimal.class);
            legacyMonthlyBudgetCount = jdbc.queryForObject("SELECT COUNT(*) FROM monthly_budgets", Integer.class);
            legacyCategoryBudgetCount = jdbc.queryForObject("SELECT COUNT(*) FROM category_budgets", Integer.class);

            // 4. Áp dụng V004 thực tế
            apply(conn, migrations.get(2)); // V004
        }
    }

    @AfterAll
    static void tearDownAll() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
        }
        if (mysqlContainer != null) {
            mysqlContainer.stop();
        } else if (isLocalMysql && DATABASE.matches("^se_d08_migration_[a-f0-9]{32}$")) {
            // Chỉ dọn dẹp đúng database test do bài kiểm thử tạo ra
            try (Connection conn = DriverManager.getConnection(
                    "jdbc:mysql://127.0.0.1:3306/?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC", "root", "12345")) {
                conn.createStatement().execute("DROP DATABASE IF EXISTS `" + DATABASE + "`");
                log.info("Đã dọn dẹp database test: {}", DATABASE);
            } catch (Exception e) {
                log.warn("Không thể drop database test: {}", e.getMessage());
            }
        }
    }

    @Test
    void test01_verifyLegacyDataPreservedAfterV004Migration() {
        // Kiểm tra sau khi chạy V004, toàn bộ dữ liệu D01-D07 được giữ nguyên vẹn
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class))
                .isEqualTo(legacyUserCount);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM categories", Integer.class))
                .isEqualTo(legacyCategoryCount);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM transactions", Integer.class))
                .isEqualTo(legacyTransactionCount);
        assertThat(jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM transactions", BigDecimal.class))
                .isEqualByComparingTo(legacyTransactionSum);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM monthly_budgets", Integer.class))
                .isEqualTo(legacyMonthlyBudgetCount);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM category_budgets", Integer.class))
                .isEqualTo(legacyCategoryBudgetCount);
    }

    @Test
    void test02_verifyRecurringTemplatesSchemaAndColumns() {
        var columns = jdbc.queryForList("""
                SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale, extra, character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = 'recurring_templates'
                ORDER BY ordinal_position
                """);

        assertThat(columns).extracting(r -> r.get("COLUMN_NAME").toString())
                .containsExactlyInAnyOrder("id", "user_id", "category_id", "type", "amount", "day_of_month", "note", "active");

        for (var col : columns) {
            String name = col.get("COLUMN_NAME").toString();
            String type = col.get("DATA_TYPE").toString().toLowerCase();
            String nullable = col.get("IS_NULLABLE").toString();

            if ("note".equals(name)) {
                assertThat(nullable).isEqualTo("YES");
                assertThat(type).isEqualTo("varchar");
                assertThat(((Number) col.get("CHARACTER_MAXIMUM_LENGTH")).longValue()).isEqualTo(500L);
            } else {
                assertThat(nullable).isEqualTo("NO");
                switch (name) {
                    case "id" -> {
                        assertThat(type).isEqualTo("bigint");
                        assertThat(col.get("EXTRA").toString()).contains("auto_increment");
                    }
                    case "user_id", "category_id" -> assertThat(type).isEqualTo("bigint");
                    case "type" -> {
                        assertThat(type).isEqualTo("varchar");
                        assertThat(((Number) col.get("CHARACTER_MAXIMUM_LENGTH")).longValue()).isEqualTo(20L);
                    }
                    case "amount" -> {
                        assertThat(type).isEqualTo("decimal");
                        assertThat(((Number) col.get("NUMERIC_PRECISION")).intValue()).isEqualTo(15);
                        assertThat(((Number) col.get("NUMERIC_SCALE")).intValue()).isEqualTo(2);
                    }
                    case "day_of_month" -> assertThat(type).isEqualTo("int");
                    case "active" -> assertThat(type).isEqualTo("tinyint");
                }
            }
        }
    }

    @Test
    void test03_verifyForeignKeysAndIndexes() {
        // Kiểm tra Foreign Keys
        var fks = jdbc.queryForList("""
                SELECT CONCAT(k.COLUMN_NAME, '->', k.REFERENCED_TABLE_NAME, '.', k.REFERENCED_COLUMN_NAME) AS ref,
                       r.DELETE_RULE, r.UPDATE_RULE
                FROM information_schema.KEY_COLUMN_USAGE k
                JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                  ON k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA
                 AND k.CONSTRAINT_NAME = r.CONSTRAINT_NAME
                 AND k.TABLE_NAME = r.TABLE_NAME
                WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'recurring_templates'
                  AND k.REFERENCED_TABLE_NAME IS NOT NULL
                """);

        assertThat(fks).extracting(r -> r.get("ref").toString())
                .containsExactlyInAnyOrder("user_id->users.id", "category_id->categories.id");

        for (var fk : fks) {
            assertThat(fk.get("DELETE_RULE").toString()).isIn("RESTRICT", "NO ACTION");
            assertThat(fk.get("UPDATE_RULE").toString()).isIn("RESTRICT", "NO ACTION");
        }

        // Kiểm tra Indexes
        var indexes = jdbc.queryForList("""
                SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols, non_unique
                FROM information_schema.statistics
                WHERE table_schema = DATABASE() AND table_name = 'recurring_templates'
                GROUP BY index_name, non_unique
                """);

        assertThat(indexes).extracting(r -> r.get("cols").toString())
                .contains("id", "user_id,active", "category_id");
    }

    @Test
    void test04_verifyValidDataInsertions() {
        // 1. amount = 0.01 (giá trị tối thiểu hợp lệ)
        jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'EXPENSE', 0.01, 1, 'Min amount', 1)", testUserId, testExpenseCategoryId);

        // 2. amount = 3,000,000.00
        jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'EXPENSE', 3000000.00, 28, 'Standard amount', 1)", testUserId, testExpenseCategoryId);

        // 3. amount = 9999999999999.99 (giới hạn tối đa DECIMAL(15,2))
        BigDecimal maxAmount = new BigDecimal("9999999999999.99");
        jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'INCOME', ?, 29, 'Max decimal amount', 0)", testUserId, testIncomeCategoryId, maxAmount);

        // 4. dayOfMonth = 30 và 31
        jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'EXPENSE', 50000.00, 30, 'Day 30', 1)", testUserId, testExpenseCategoryId);
        jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'EXPENSE', 75000.00, 31, 'Day 31', 1)", testUserId, testExpenseCategoryId);

        // 5. note = null
        jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'INCOME', 100000.00, 15, NULL, 1)", testUserId, testIncomeCategoryId);

        // 6. note = 500 ký tự Unicode (Tiếng Việt)
        String base = "Tiền thuê nhà và chi phí dịch vụ định kỳ hàng tháng; ";
        String longUnicodeNote = base.repeat(500 / base.length() + 1).substring(0, 500);
        jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'EXPENSE', 12500000.00, 5, ?, 1)", testUserId, testExpenseCategoryId, longUnicodeNote);

        // 7. active = false (0)
        jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'EXPENSE', 200000.00, 10, 'Inactive template', 0)", testUserId, testExpenseCategoryId);

        // Xác nhận dữ liệu đã được lưu và đọc chính xác
        var row = jdbc.queryForMap("SELECT * FROM recurring_templates WHERE amount = ?", maxAmount);
        assertThat(new BigDecimal(row.get("amount").toString())).isEqualByComparingTo(maxAmount);

        var unicodeRow = jdbc.queryForMap("SELECT * FROM recurring_templates WHERE day_of_month = 5");
        assertThat(unicodeRow.get("note").toString()).isEqualTo(longUnicodeNote);
    }

    @Test
    void test05_verifyRejectionOfInvalidAmount() {
        // amount = 0 bị từ chối bởi CHECK chk_recurring_templates_amount
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'EXPENSE', 0.00, 10, 1)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("chk_recurring_templates_amount");

        // amount âm bị từ chối bởi CHECK chk_recurring_templates_amount
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'EXPENSE', -100.00, 10, 1)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("chk_recurring_templates_amount");
    }

    @Test
    void test06_verifyRejectionOfInvalidDayOfMonth() {
        // day_of_month = 0 bị từ chối bởi CHECK chk_recurring_templates_day_of_month
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'EXPENSE', 1000.00, 0, 1)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("chk_recurring_templates_day_of_month");

        // day_of_month = 32 bị từ chối bởi CHECK chk_recurring_templates_day_of_month
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'EXPENSE', 1000.00, 32, 1)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("chk_recurring_templates_day_of_month");
    }

    @Test
    void test07_verifyRejectionOfInvalidActive() {
        // active = 2 bị từ chối bởi CHECK chk_recurring_templates_active
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'EXPENSE', 1000.00, 15, 2)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("chk_recurring_templates_active");

        // active = -1 bị từ chối bởi CHECK chk_recurring_templates_active
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'EXPENSE', 1000.00, 15, -1)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("chk_recurring_templates_active");
    }

    @Test
    void test08_verifyRejectionOfInvalidType() {
        // type = 'INVALID' bị từ chối bởi CHECK chk_recurring_templates_type
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'INVESTMENT', 1000.00, 15, 1)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class)
                .hasMessageContaining("chk_recurring_templates_type");
    }

    @Test
    void test09_verifyRejectionOfInvalidForeignKeys() {
        // user_id không tồn tại bị từ chối bởi FK fk_recurring_templates_user
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (9999999, ?, 'EXPENSE', 1000.00, 15, 1)", testExpenseCategoryId))
                .isInstanceOf(Exception.class);

        // category_id không tồn tại bị từ chối bởi FK fk_recurring_templates_category
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, 9999999, 'EXPENSE', 1000.00, 15, 1)", testUserId))
                .isInstanceOf(Exception.class);
    }

    @Test
    void test10_verifyRejectionOfNullMandatoryColumns() {
        // user_id NULL
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (NULL, ?, 'EXPENSE', 1000.00, 15, 1)", testExpenseCategoryId))
                .isInstanceOf(Exception.class);

        // category_id NULL
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, NULL, 'EXPENSE', 1000.00, 15, 1)", testUserId))
                .isInstanceOf(Exception.class);

        // type NULL
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, NULL, 1000.00, 15, 1)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class);

        // amount NULL
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'EXPENSE', NULL, 15, 1)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class);

        // day_of_month NULL
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'EXPENSE', 1000.00, NULL, 1)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class);

        // active NULL bị từ chối bởi NOT NULL constraint
        assertThatThrownBy(() -> jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, active) " +
                "VALUES (?, ?, 'EXPENSE', 1000.00, 15, NULL)", testUserId, testExpenseCategoryId))
                .isInstanceOf(Exception.class);
    }

    @Test
    void test11_verifyMultipleTemplatesSameUserCategoryDayAllowed() {
        // Kiểm tra không có ràng buộc UNIQUE nào cản trở người dùng tạo nhiều mẫu khác nhau
        // trong cùng một danh mục và cùng một ngày trong tháng.
        int id1 = jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'EXPENSE', 100000.00, 25, 'Mẫu chi 1 ngày 25', 1)", testUserId, testExpenseCategoryId);
        int id2 = jdbc.update("INSERT INTO recurring_templates (user_id, category_id, type, amount, day_of_month, note, active) " +
                "VALUES (?, ?, 'EXPENSE', 200000.00, 25, 'Mẫu chi 2 ngày 25', 1)", testUserId, testExpenseCategoryId);

        assertThat(id1).isEqualTo(1);
        assertThat(id2).isEqualTo(1);
    }

    @Test
    void test12_backendEntityJpaValidation() throws Exception {
        Class<?> entityClass = null;
        try {
            entityClass = Class.forName("com.smartexpense.backend.entity.RecurringTemplate");
        } catch (ClassNotFoundException e) {
            // Khi thiếu RecurringTemplate trong classpath, sử dụng JUnit Assumptions để đánh dấu ABORTED/SKIPPED theo đúng thực tế
            Assumptions.abort(
                    "BLOCKED: Backend Entity 'com.smartexpense.backend.entity.RecurringTemplate' " +
                    "chưa có mặt trên nhánh feature/quynh (chờ tích hợp mã nguồn Backend D08 từ feature/tuan). " +
                    "Kiểm thử JPA validation bị tạm hoãn cho đến khi Entity được tích hợp.");
        }

        // Khi Entity có mặt, bắt buộc thực thi kiểm tra tương thích JPA/Hibernate thực tế với schema V004 thật
        Map<String, Object> settings = new HashMap<>();
        settings.put("hibernate.connection.url", jdbcUrl);
        settings.put("hibernate.connection.username", dbUser);
        settings.put("hibernate.connection.password", dbPassword);
        settings.put("hibernate.connection.driver_class", "com.mysql.cj.jdbc.Driver");
        settings.put("hibernate.dialect", "org.hibernate.dialect.MySQLDialect");

        StandardServiceRegistry registry = new StandardServiceRegistryBuilder().applySettings(settings).build();
        try {
            MetadataSources sources = new MetadataSources(registry);
            sources.addAnnotatedClass(Class.forName("com.smartexpense.backend.entity.User"));
            sources.addAnnotatedClass(Class.forName("com.smartexpense.backend.entity.Category"));
            sources.addAnnotatedClass(entityClass);

            var metadata = sources.buildMetadata();
            var sessionFactory = metadata.buildSessionFactory();
            sessionFactory.getSchemaManager().validateMappedObjects();
            log.info("Hibernate validateMappedObjects() THÀNH CÔNG cho Entity RecurringTemplate trên bảng V004 thực tế!");
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    private static List<Path> approvedUpgradeMigrations() throws Exception {
        Path directory = Path.of("../database/migrations").toAbsolutePath().normalize();
        Pattern name = Pattern.compile("V(\\d+)__.+\\.sql");
        Map<Integer, Path> versions = new TreeMap<>();
        try (var paths = Files.list(directory)) {
            for (Path path : paths.filter(Files::isRegularFile).toList()) {
                var match = name.matcher(path.getFileName().toString());
                if (match.matches()) {
                    int version = Integer.parseInt(match.group(1));
                    assertThat(versions.put(version, path)).as("Một SQL artifact duy nhất cho mỗi version").isNull();
                }
            }
        }
        assertThat(versions.keySet()).as("BLOCKED D08-DB: Bắt buộc đủ migration V002, V003 và V004")
                .contains(2, 3, 4);
        return List.of(versions.get(2), versions.get(3), versions.get(4));
    }

    private static boolean isDockerRunning() {
        try {
            return DockerClientFactory.instance().isDockerAvailable();
        } catch (Throwable t) {
            return false;
        }
    }

    private static void verifyDatabaseIsolation(String databaseName, String url) {
        if (!databaseName.matches("^se_d08_migration_[a-f0-9]{32}$")) {
            throw new IllegalStateException("CẢNH BÁO AN TOÀN: Tên database không đúng định dạng test cô lập: " + databaseName);
        }
        String lowerUrl = url.toLowerCase();
        if (lowerUrl.contains("duckdns.org") || lowerUrl.contains("personal_finance_db")) {
            throw new IllegalStateException("CẢNH BÁO AN TOÀN: Tuyệt đối không được kết nối đến VPS hoặc database ứng dụng chính: " + url);
        }
        if (!lowerUrl.contains("localhost") && !lowerUrl.contains("127.0.0.1") && !lowerUrl.contains("testcontainers")) {
            throw new IllegalStateException("CẢNH BÁO AN TOÀN: Môi trường đích không phải local test cô lập: " + url);
        }
    }

    private static void apply(Connection connection, Path migration) {
        ScriptUtils.executeSqlScript(connection, new EncodedResource(new FileSystemResource(migration), StandardCharsets.UTF_8));
    }
}
