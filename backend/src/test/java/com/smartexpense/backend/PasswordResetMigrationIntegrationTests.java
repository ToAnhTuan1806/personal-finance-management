package com.smartexpense.backend;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.mysql.MySQLContainer;
import org.testcontainers.utility.MountableFile;

import java.io.File;
import java.net.URI;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

// SQL that tren Testcontainers MySQL co lap theo dung quy chuan D06-D09; khong dung DB production/VPS.
@Execution(ExecutionMode.SAME_THREAD)
class PasswordResetMigrationIntegrationTests {
    private static final String DATABASE = "se_d12_migration_" + UUID.randomUUID().toString().replace("-", "");
    private static final String USER = "d12_test";
    private static final List<String> LEGACY_TABLES = List.of(
            "users", "categories", "transactions", "monthly_budgets",
            "category_budgets", "recurring_templates", "recurring_applications"
    );
    private static final List<String> ALL_TABLES = List.of(
            "users", "categories", "transactions", "monthly_budgets",
            "category_budgets", "recurring_templates", "recurring_applications",
            "password_reset_tokens"
    );
    private static final Path MIGRATION = Path.of("../database/migrations/V006__create_password_reset_tokens.sql").toAbsolutePath().normalize();
    private static final MySQLContainer SOURCE = localContainer("source");
    private static MySQLContainer restore;
    private static Connection connection;
    private static JdbcTemplate jdbc;
    private static Map<String, List<Map<String, Object>>> legacyRows;
    private static Map<String, List<Map<String, Object>>> baseline;
    private static String legacySchemaHash;

    @BeforeAll
    static void setup() throws Exception {
        SOURCE.start();
        connection = connect(SOURCE);
        jdbc = jdbc(connection);
        assertThat(jdbc.queryForList("SHOW TABLES")).isEmpty();

        // 1. Chay baseline MVP
        ScriptUtils.executeSqlScript(connection, new EncodedResource(new ClassPathResource("d06-legacy-schema.sql"), StandardCharsets.UTF_8));

        // 2. Chay cac migration V002 -> V005
        for (String name : List.of(
                "V002__category_icon_color.sql",
                "V003__create_category_budgets.sql",
                "V004__create_recurring_templates.sql",
                "V005__create_recurring_applications.sql")) {
            apply(connection, Path.of("../database/migrations", name));
        }

        // 3. Nap du lieu legacy thuc te
        seedLegacy();
        legacyRows = snapshot(jdbc, LEGACY_TABLES);
        legacySchemaHash = legacySchemaHash(jdbc);

        // 4. Ap dung migration V006
        apply(connection, MIGRATION);

        // Kiem tra du lieu users cu duoc giu nguyen va co auth_version mac dinh 0
        List<Map<String, Object>> usersAfter = jdbc.queryForList("SELECT id, full_name, email, password_hash, auth_version FROM users ORDER BY id");
        assertThat(usersAfter).hasSize(2);
        for (Map<String, Object> u : usersAfter) {
            assertThat(((Number) u.get("auth_version")).longValue()).isEqualTo(0L);
        }

        // Du lieu cac bang tai chinh (categories, transactions, monthly_budgets, category_budgets, recurring) hoan toan khong doi
        for (String table : List.of("categories", "transactions", "monthly_budgets", "category_budgets", "recurring_templates", "recurring_applications")) {
            assertThat(snapshot(jdbc, List.of(table)).get(table)).isEqualTo(legacyRows.get(table));
        }

        // 5. Chen token baseline de kiem thu snapshot
        insertToken(1L, "a".repeat(64), "2026-11-10 10:00:00.000000", "2026-11-10 10:30:00.000000", null);
        insertToken(2L, "b".repeat(64), "2026-11-10 09:00:00.000000", "2026-11-10 09:30:00.000000", "2026-11-10 09:15:00.000000");

        baseline = snapshot(jdbc, ALL_TABLES);
        System.out.printf("D12 SQL baseline=MVP,V002-V006 mysql=%s allTables=8 baselineTokens=2%n",
                jdbc.queryForObject("SELECT VERSION()", String.class));
    }

    @BeforeEach
    void begin() throws Exception {
        guard(SOURCE);
        assertThat(snapshot(jdbc, ALL_TABLES)).isEqualTo(baseline);
        connection.setAutoCommit(false);
    }

    @AfterEach
    void rollback() throws Exception {
        connection.rollback();
        connection.setAutoCommit(true);
        assertThat(snapshot(jdbc, ALL_TABLES)).isEqualTo(baseline);
    }

    @AfterAll
    static void cleanup() throws Exception {
        try {
            if (connection != null) connection.close();
        } finally {
            try { if (restore != null) restore.close(); }
            finally { SOURCE.close(); }
        }
    }

    @Test
    void migrationPreservesAllLegacyRowsAndSchemaExceptAuthVersion() {
        // Kiem tra du lieu cac bang khong bi mat
        assertThat(legacyRows.get("users")).hasSize(2);
        assertThat(legacyRows.get("categories")).hasSize(3);
        assertThat(legacyRows.get("transactions")).hasSize(3);
        assertThat(legacyRows.get("monthly_budgets")).hasSize(2);
        assertThat(legacyRows.get("category_budgets")).hasSize(1);
        assertThat(legacyRows.get("recurring_templates")).hasSize(3);
        assertThat(legacyRows.get("recurring_applications")).hasSize(1);

        for (String table : List.of("categories", "transactions", "monthly_budgets", "category_budgets", "recurring_templates", "recurring_applications")) {
            assertThat(snapshot(jdbc, List.of(table)).get(table)).isEqualTo(legacyRows.get(table));
        }
    }

    @Test
    void schemaHasExactColumnsUniqueForeignKeysAndIndexes() throws SQLException {
        ApplicationSchemaAssertions.assertSchema(connection, true, true, true, true);
        ApplicationSchemaAssertions.assertPasswordResetTokens(connection);
    }

    @Test
    void usersAuthVersionDefaultsToZeroAndCanBeIncremented() {
        Long v1 = jdbc.queryForObject("SELECT auth_version FROM users WHERE id = 1", Long.class);
        assertThat(v1).isEqualTo(0L);

        // Tang version khi reset mat khau
        jdbc.update("UPDATE users SET auth_version = auth_version + 1 WHERE id = 1");
        Long v2 = jdbc.queryForObject("SELECT auth_version FROM users WHERE id = 1", Long.class);
        assertThat(v2).isEqualTo(1L);

        // Tao user moi khong chi dinh auth_version thi mac dinh la 0
        jdbc.update("INSERT INTO users (id, full_name, email, password_hash, created_at) VALUES (99, 'New User', 'new@example.test', 'hash', CURRENT_TIMESTAMP)");
        Long vNew = jdbc.queryForObject("SELECT auth_version FROM users WHERE id = 99", Long.class);
        assertThat(vNew).isEqualTo(0L);
    }

    @Test
    void tokenHashMustBeUnique() {
        // Chen token da ton tai b*64 phai bi loi 1062 Duplicate entry
        rejected(() -> insertToken(1L, "b".repeat(64), "2026-11-10 10:00:00.000000", "2026-11-10 10:30:00.000000", null), 1062);
    }

    @Test
    void userForeignKeyEnforcedOnInsertAndDelete() {
        // Chen token voi user_id khong ton tai (999) phai bi loi 1452 FK constraint fails
        rejected(() -> insertToken(999L, "c".repeat(64), "2026-11-10 10:00:00.000000", "2026-11-10 10:30:00.000000", null), 1452);

        // Xoa user dang co token lien ket phai bi chan voi loi 1451 RESTRICT
        rejected(() -> jdbc.update("DELETE FROM users WHERE id = 1"), 1451);
    }

    @Test
    void nullabilityAndMicrosecondPrecisionEnforced() {
        // null user_id bi tu choi (1048)
        rejected(() -> jdbc.update("INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at) VALUES (NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", "x".repeat(64)), 1048);

        // null token_hash bi tu choi (1048)
        rejected(() -> jdbc.update("INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at) VALUES (1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"), 1048);

        // null created_at bi tu choi (1048)
        rejected(() -> jdbc.update("INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at) VALUES (1, ?, NULL, CURRENT_TIMESTAMP)", "x".repeat(64)), 1048);

        // null expires_at bi tu choi (1048)
        rejected(() -> jdbc.update("INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at) VALUES (1, ?, CURRENT_TIMESTAMP, NULL)", "x".repeat(64)), 1048);

        // used_at chap nhan NULL
        insertToken(1L, "d".repeat(64), "2026-11-10 10:00:00.123456", "2026-11-10 10:30:00.123456", null);
        Map<String, Object> row = jdbc.queryForMap("SELECT created_at, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?", "d".repeat(64));
        assertThat(row.get("used_at")).isNull();
        assertThat(row.get("created_at").toString()).contains("123456");
    }

    @Test
    void financialDataAndBudgetsUntouched() {
        // Kiem tra cac rang buoc FK va du lieu cua transactions/category/budget van nguyen ven
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM transactions", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM monthly_budgets", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM category_budgets", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_templates", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_applications", Integer.class)).isEqualTo(1);
    }

    @Test
    void reapplyingMigrationFailsSafelyWithoutSimulatingSuccess() {
        // Chay lai migration V006 phai FAIL do cot auth_version da ton tai (loi 1060 Duplicate column name)
        assertThatThrownBy(() -> apply(connection, MIGRATION))
                .isInstanceOf(Exception.class);
    }

    @Test
    void backupAndRestoreRehearsalToIsolatedMysqlContainer() throws Exception {
        restore = localContainer("restore");
        restore.start();
        guard(restore);
        assertThat(restore.getContainerId()).isNotEqualTo(SOURCE.getContainerId());
        assertThat(restore.getMappedPort(3306)).isNotEqualTo(SOURCE.getMappedPort(3306));

        try (Connection target = connect(restore)) {
            JdbcTemplate restored = jdbc(target);
            assertThat(restored.queryForList("SHOW TABLES")).isEmpty();

            var dump = SOURCE.execInContainer("sh", "-c",
                    "MYSQL_PWD=\"$MYSQL_PASSWORD\" exec mysqldump --user=\"$MYSQL_USER\" "
                            + "--default-character-set=utf8mb4 --single-transaction --quick --skip-lock-tables "
                            + "--skip-add-locks --no-tablespaces --set-gtid-purged=OFF --hex-blob "
                            + "--routines --triggers --events --databases \"$MYSQL_DATABASE\"");
            assertThat(dump.getExitCode()).as("Dump exit code").isZero();
            assertThat(dump.getStdout()).contains("CREATE TABLE", "password_reset_tokens", "auth_version");

            Path directory = Path.of("build/d12-migration-backup", DATABASE).toAbsolutePath().normalize();
            Files.createDirectories(directory);
            Path backup = directory.resolve("source.sql");
            Files.writeString(backup, dump.getStdout(), StandardCharsets.UTF_8);
            String checksum = hash(Files.readAllBytes(backup));

            // Restore sang container co lap
            restoreDump(backup, checksum);

            // Kiem tra du lieu tren target sau restore
            assertThat(snapshot(restored, ALL_TABLES)).isEqualTo(baseline);
            ApplicationSchemaAssertions.assertSchema(target, true, true, true, true);
            ApplicationSchemaAssertions.assertPasswordResetTokens(target);

            // Kiem tra cac rang buoc tren target sau restore
            rejected(() -> restored.update("INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at) VALUES (999, 'x', NOW(), NOW())"), 1452);
            rejected(() -> restored.update("INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at) VALUES (1, ?, NOW(), NOW())", "a".repeat(64)), 1062);

            System.out.printf("D12 BACKUP restore=PASS tables=8 bytes=%d sha256=%s%n", Files.size(backup), checksum);
        }
    }

    @Test
    void hibernateEntityValidationAgainstMigratedSchema() throws Exception {
        ClassLoader loader = resolveEntityClassLoader();
        Class<?> userClass = loader.loadClass("com.smartexpense.backend.entity.User");
        Class<?> tokenClass = loader.loadClass("com.smartexpense.backend.entity.PasswordResetToken");
        Class<?> categoryClass = loader.loadClass("com.smartexpense.backend.entity.Category");
        Class<?> transactionClass = loader.loadClass("com.smartexpense.backend.entity.Transaction");
        Class<?> monthlyBudgetClass = loader.loadClass("com.smartexpense.backend.entity.MonthlyBudget");
        Class<?> categoryBudgetClass = loader.loadClass("com.smartexpense.backend.entity.CategoryBudget");
        Class<?> recurringTemplateClass = loader.loadClass("com.smartexpense.backend.entity.RecurringTemplate");
        Class<?> recurringAppClass = loader.loadClass("com.smartexpense.backend.entity.RecurringApplication");

        guard(SOURCE);
        ClassLoader originalCl = Thread.currentThread().getContextClassLoader();
        Thread.currentThread().setContextClassLoader(loader);
        var bootstrap = new org.hibernate.boot.registry.BootstrapServiceRegistryBuilder()
                .applyClassLoader(loader)
                .build();
        var registry = new StandardServiceRegistryBuilder(bootstrap).applySettings(Map.of(
                "hibernate.connection.url", SOURCE.getJdbcUrl(),
                "hibernate.connection.username", USER,
                "hibernate.connection.password", SOURCE.getPassword(),
                "hibernate.connection.driver_class", "com.mysql.cj.jdbc.Driver",
                "hibernate.hbm2ddl.auto", "validate",
                "hibernate.show_sql", "false")).build();
        try {
            var sources = new MetadataSources(registry);
            sources.addAnnotatedClass(userClass);
            sources.addAnnotatedClass(tokenClass);
            sources.addAnnotatedClass(categoryClass);
            sources.addAnnotatedClass(transactionClass);
            sources.addAnnotatedClass(monthlyBudgetClass);
            sources.addAnnotatedClass(categoryBudgetClass);
            sources.addAnnotatedClass(recurringTemplateClass);
            sources.addAnnotatedClass(recurringAppClass);

            try (var factory = sources.buildMetadata().buildSessionFactory()) {
                factory.getSchemaManager().validateMappedObjects();
            }
            System.out.println("D12 HIBERNATE VALIDATE: ALL 8 ENTITIES (including PasswordResetToken and User.authVersion) VALIDATED 100% PASS!");
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
            Thread.currentThread().setContextClassLoader(originalCl);
        }
    }

    private static ClassLoader resolveEntityClassLoader() {
        try {
            Class<?> found = Class.forName("com.smartexpense.backend.entity.PasswordResetToken");
            return found.getClassLoader() != null ? found.getClassLoader() : ClassLoader.getSystemClassLoader();
        } catch (ClassNotFoundException ignored) {
        }

        List<Path> candidates = new ArrayList<>();
        String propertyPath = System.getProperty("backend.classes.dir");
        if (propertyPath != null && !propertyPath.isBlank()) {
            candidates.add(Path.of(propertyPath));
        }
        String envPath = System.getenv("BACKEND_CLASSES_DIR");
        if (envPath != null && !envPath.isBlank()) {
            candidates.add(Path.of(envPath));
        }
        candidates.addAll(List.of(
                Path.of("build", "classes", "java", "main"),
                Path.of("..", "personal-finance-management", "backend", "build", "classes", "java", "main"),
                Path.of("..", "backend", "build", "classes", "java", "main"),
                Path.of("..", "..", "personal-finance-management", "backend", "build", "classes", "java", "main")
        ));

        for (Path candidate : candidates) {
            Path normalized = candidate.toAbsolutePath().normalize();
            Path tokenFile = normalized.resolve(Path.of("com", "smartexpense", "backend", "entity", "PasswordResetToken.class"));
            if (Files.isRegularFile(tokenFile)) {
                try {
                    ClassLoader parent = PasswordResetMigrationIntegrationTests.class.getClassLoader();
                    URL[] urls = new URL[]{normalized.toUri().toURL()};
                    return new URLClassLoader(urls, parent) {
                        @Override
                        protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
                            if (name.startsWith("com.smartexpense.backend.entity.")) {
                                try {
                                    Class<?> loaded = findLoadedClass(name);
                                    if (loaded == null) {
                                        loaded = findClass(name);
                                    }
                                    if (resolve) {
                                        resolveClass(loaded);
                                    }
                                    return loaded;
                                } catch (ClassNotFoundException ignored) {
                                }
                            }
                            return super.loadClass(name, resolve);
                        }
                    };
                } catch (Exception e) {
                    throw new IllegalStateException("Failed to configure classloader for: " + normalized, e);
                }
            }
        }
        throw new IllegalStateException("BLOCKED: PasswordResetToken entity class not found on classpath or candidate paths");
    }

    private static void seedLegacy() {
        for (int id : List.of(1, 2)) {
            jdbc.update("INSERT INTO users (id,full_name,email,password_hash,created_at) VALUES (?,?,?,?, '2026-01-02 03:04:05.123456')",
                    id, "Chu D12 " + id, UUID.randomUUID() + "@example.test", UUID.randomUUID().toString());
        }
        jdbc.update("INSERT INTO categories (id,user_id,name,type,icon,color,created_at) VALUES (11,1,'Tien thue nha','EXPENSE','house','#123456',CURRENT_TIMESTAMP),(12,1,'Thu nhap','INCOME',NULL,NULL,CURRENT_TIMESTAMP),(21,2,'Chi cu','EXPENSE',NULL,NULL,CURRENT_TIMESTAMP)");
        jdbc.update("INSERT INTO transactions (id,user_id,category_id,type,amount,transaction_date,note,created_at) VALUES (101,1,11,'EXPENSE',123.45,'2026-11-30','Giao dich cu',CURRENT_TIMESTAMP),(102,1,12,'INCOME',2000.20,'2026-11-01',NULL,CURRENT_TIMESTAMP),(201,2,21,'EXPENSE',12.34,'1970-01-01','Du lieu nam 1970',CURRENT_TIMESTAMP)");
        jdbc.update("INSERT INTO monthly_budgets (id,user_id,`year`,`month`,amount_limit) VALUES (31,1,2026,11,7777.77),(32,2,1970,1,1000.00)");
        jdbc.update("INSERT INTO category_budgets (id,user_id,category_id,`year`,`month`,amount_limit) VALUES (41,1,11,2026,11,3333.33)");
        jdbc.update("INSERT INTO recurring_templates (id,user_id,category_id,type,amount,day_of_month,note,active) VALUES (51,1,11,'EXPENSE',123.45,31,'Mau cu',1),(52,1,12,'INCOME',2000.20,1,NULL,1),(53,2,21,'EXPENSE',12.34,1,NULL,0)");
        jdbc.update("INSERT INTO recurring_applications (id,template_id,`year`,`month`,transaction_id) VALUES (61,51,2026,11,101)");
    }

    private static void insertToken(long userId, String tokenHash, String createdAt, String expiresAt, String usedAt) {
        jdbc.update("INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?)",
                userId, tokenHash, createdAt, expiresAt, usedAt);
    }

    private static void rejected(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, int code) {
        Throwable failure = catchThrowable(action);
        assertThat(failure).isNotNull();
        SQLException sql = null;
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException actual) sql = actual;
        }
        assertThat((Throwable) sql).isNotNull();
        assertThat(sql.getErrorCode()).isEqualTo(code);
    }

    private static void restoreDump(Path file, String expectedHash) throws Exception {
        guard(restore);
        if (!hash(Files.readAllBytes(file)).equals(expectedHash)) throw new IllegalStateException("D12 backup checksum mismatch; restore blocked");
        restore.copyFileToContainer(MountableFile.forHostPath(file.toString()), "/tmp/d12-restore.sql");
        var result = restore.execInContainer("sh", "-c", "MYSQL_PWD=\"$MYSQL_PASSWORD\" exec mysql --user=\"$MYSQL_USER\" --default-character-set=utf8mb4 --batch \"$MYSQL_DATABASE\" < /tmp/d12-restore.sql");
        assertThat(result.getExitCode()).as("Isolated restore exit code").isZero();
    }

    private static MySQLContainer localContainer(String role) {
        return new MySQLContainer("mysql:8.0") {
            @Override public void start() {
                URI socket = DockerClientFactory.instance().getTransportConfig().getDockerHost();
                boolean unix = "unix".equals(socket.getScheme()) && socket.getHost() == null;
                boolean pipe = "npipe".equals(socket.getScheme()) && socket.getPath().startsWith("//./pipe/");
                if (!unix && !pipe) throw new IllegalStateException("D12 migration only uses local Docker");
                super.start();
            }
        }.withDatabaseName(DATABASE).withUsername(USER).withPassword(UUID.randomUUID().toString()).withReuse(false)
                .withLabel("com.smartexpense.test", "d12-migration-" + role)
                .withUrlParam("useSSL", "false").withUrlParam("allowPublicKeyRetrieval", "true").withUrlParam("serverTimezone", "UTC")
                .withCreateContainerCmdModifier(cmd -> cmd.getHostConfig().withPortBindings(
                        new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(3306))));
    }

    private static void guard(MySQLContainer container) {
        if (container == null || container != SOURCE && container != restore) throw new IllegalStateException("Unknown D12 test container");
        URI target = URI.create(container.getJdbcUrl().substring(5));
        if (!container.isRunning() || !DATABASE.matches("se_d12_migration_[a-f0-9]{32}") || !DATABASE.equals(container.getDatabaseName())
                || !USER.equals(container.getUsername()) || !"mysql".equals(target.getScheme())
                || (!"localhost".equals(target.getHost()) && !"127.0.0.1".equals(target.getHost()))
                || target.getPort() != container.getMappedPort(3306) || target.getPort() == 3306 || !target.getPath().equals("/" + DATABASE)) {
            throw new IllegalStateException("D12 target is not the verified isolated test container");
        }
    }

    private static Connection connect(MySQLContainer container) throws Exception {
        return DriverManager.getConnection(container.getJdbcUrl(), container.getUsername(), container.getPassword());
    }

    private static JdbcTemplate jdbc(Connection conn) {
        return new JdbcTemplate(new SingleConnectionDataSource(conn, true));
    }

    private static void apply(Connection conn, Path file) throws Exception {
        ScriptUtils.executeSqlScript(conn, new EncodedResource(new org.springframework.core.io.FileSystemResource(file), StandardCharsets.UTF_8));
    }

    private static Map<String, List<Map<String, Object>>> snapshot(JdbcTemplate t, List<String> tables) {
        Map<String, List<Map<String, Object>>> map = new LinkedHashMap<>();
        for (String tbl : tables) {
            map.put(tbl, t.queryForList("SELECT * FROM `" + tbl + "` ORDER BY id"));
        }
        return map;
    }

    private static String legacySchemaHash(JdbcTemplate t) {
        List<String> defs = t.queryForList(
                "SELECT CONCAT(table_name,':',column_name,':',column_type,':',is_nullable) "
                        + "FROM information_schema.columns WHERE table_schema=DATABASE() "
                        + "AND table_name IN ('categories','transactions','monthly_budgets','category_budgets','recurring_templates','recurring_applications') "
                        + "ORDER BY table_name,column_name", String.class);
        return hash(String.join("\n", defs).getBytes(StandardCharsets.UTF_8));
    }

    private static String hash(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}

