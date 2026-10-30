package com.smartexpense.backend;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.MonthlyBudget;
import com.smartexpense.backend.entity.Transaction;
import com.smartexpense.backend.entity.User;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManager;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;
import org.testcontainers.utility.MountableFile;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Tạo schema MVP trước khi Spring chạy; Backup -> V002 -> Hibernate validate, không create/update ngầm.
@SpringBootTest(classes = BackendApplication.class,
        properties = "spring.config.location=classpath:/application-d06-migration-test.properties")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(D06MigrationIntegrationTests.TestDataSource.class)
class D06MigrationIntegrationTests {

    private static final String DATABASE = "se_d06_migration_" + UUID.randomUUID().toString().replace("-", "");
    private static final String USER = "d06_test";
    private static final Path MIGRATION = Path.of("../database/migrations/V002__category_icon_color.sql")
            .toAbsolutePath().normalize();
    private static final Path BACKUP = Path.of("build/d06-migration-backup/pre-migration.sql").toAbsolutePath();
    private static final String JWT_KEY = randomJwtKey();
    private static String beforeData;
    private static String beforeKeys;
    private static String backupHash;
    private static String migrationHash;
    private static String mysqlVersion;
    private static boolean initialized;

    @Container static final MySQLContainer SOURCE = localContainer("source");
    @Container static final MySQLContainer RESTORE = localContainer("restore");

    @Autowired MockMvc mvc;
    @Autowired JwtEncoder jwtEncoder;
    @Autowired EntityManager entityManager;
    @Autowired Environment environment;

    private static MySQLContainer localContainer(String role) {
        return new MySQLContainer("mysql:8.0") {
            @Override
            public void start() {
                URI endpoint = DockerClientFactory.instance().getTransportConfig().getDockerHost();
                boolean unix = "unix".equals(endpoint.getScheme()) && endpoint.getHost() == null;
                boolean pipe = "npipe".equals(endpoint.getScheme()) && endpoint.getPath().startsWith("//./pipe/");
                if (!unix && !pipe) throw new IllegalStateException("D06 migration test chỉ dùng Docker socket local");
                super.start();
            }
        }.withDatabaseName(DATABASE).withUsername(USER).withPassword(UUID.randomUUID().toString())
                .withReuse(false).withLabel("com.smartexpense.test", "d06-migration-" + role)
                .withUrlParam("useSSL", "false").withUrlParam("allowPublicKeyRetrieval", "true")
                .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                        new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(3306))));
    }

    private static void guard(MySQLContainer container) {
        URI target = URI.create(container.getJdbcUrl().substring(5));
        if ((container != SOURCE && container != RESTORE) || !container.isRunning()
                || !DATABASE.matches("se_d06_migration_[a-f0-9]{32}") || !DATABASE.equals(container.getDatabaseName())
                || !USER.equals(container.getUsername()) || !"mysql".equals(target.getScheme())
                || (!"localhost".equals(target.getHost()) && !"127.0.0.1".equals(target.getHost()))
                || target.getPort() != container.getMappedPort(3306) || target.getPort() == 3306
                || !target.getPath().equals("/" + DATABASE)) {
            throw new IllegalStateException("Không xác nhận được đích MySQL migration test cô lập");
        }
    }

    private static Connection connect(MySQLContainer container) throws Exception {
        guard(container);
        Connection connection = DriverManager.getConnection(container.getJdbcUrl(), USER, container.getPassword());
        if (!DATABASE.equals(connection.getCatalog()) || connection.getMetaData().getDatabaseMajorVersion() != 8
                || !connection.getMetaData().getUserName().startsWith(USER + "@")) {
            connection.close();
            throw new IllegalStateException("Metadata kết nối không thuộc MySQL test đã xác nhận");
        }
        return connection;
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) throws Exception {
        prepareLegacyBackupAndMigration();
        registry.add("spring.datasource.url", SOURCE::getJdbcUrl);
        registry.add("spring.datasource.username", SOURCE::getUsername);
        registry.add("spring.datasource.password", SOURCE::getPassword);
        registry.add("app.jwt.secret", () -> JWT_KEY);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.jpa.generate-ddl", () -> false);
        registry.add("spring.sql.init.mode", () -> "never");
    }

    private static synchronized void prepareLegacyBackupAndMigration() throws Exception {
        if (initialized) return;
        guard(SOURCE);
        guard(RESTORE);
        assertThat(SOURCE.getContainerId()).isNotEqualTo(RESTORE.getContainerId());
        assertThat(SOURCE.getMappedPort(3306)).isNotEqualTo(RESTORE.getMappedPort(3306));
        try (Connection connection = connect(SOURCE)) {
            assertThat(rows(connection, "SHOW TABLES")).isEmpty();
            mysqlVersion = rows(connection, "SELECT VERSION()").getFirst().getFirst();
            ScriptUtils.executeSqlScript(connection,
                    new EncodedResource(new ClassPathResource("d06-legacy-schema.sql"), StandardCharsets.UTF_8));
            seedLegacy(connection);
            assertThat(appearanceColumns(connection)).isEmpty();
            beforeData = dataHash(connection);
            beforeKeys = keysHash(connection);
        }

        // Credential chỉ lấy từ ENV của container do test tạo; không ghép giá trị vào command/log.
        var dump = SOURCE.execInContainer("sh", "-c",
                "MYSQL_PWD=\"$MYSQL_PASSWORD\" exec mysqldump --user=\"$MYSQL_USER\" "
                        + "--default-character-set=utf8mb4 --single-transaction --quick --skip-lock-tables "
                        + "--skip-add-locks --no-tablespaces --set-gtid-purged=OFF --hex-blob "
                        + "--routines --triggers --events --databases \"$MYSQL_DATABASE\"");
        if (dump.getExitCode() != 0) throw new IllegalStateException("mysqldump thất bại: " + dump.getExitCode());
        assertThat(dump.getStdout()).contains("CREATE TABLE", "Ăn uống cũ");
        Files.createDirectories(BACKUP.getParent());
        Files.writeString(BACKUP, dump.getStdout(), StandardCharsets.UTF_8);
        assertThat(Files.size(BACKUP)).isPositive();
        backupHash = sha256(Files.readAllBytes(BACKUP));
        migrationHash = sha256(Files.readAllBytes(MIGRATION));
        try (Connection connection = connect(SOURCE)) {
            applyMigration(connection);
            assertAppearanceColumns(connection);
            assertThat(dataHash(connection)).isEqualTo(beforeData);
            assertThat(keysHash(connection)).isEqualTo(beforeKeys);
        }
        initialized = true;
    }

    private static void seedLegacy(Connection connection) throws Exception {
        try (var insert = connection.prepareStatement(
                "INSERT INTO users VALUES (?, ?, ?, ?, '2026-10-15 12:00:00')")) {
            for (int id = 1; id <= 2; id++) {
                insert.setInt(1, id);
                insert.setString(2, "Người dùng cũ " + id);
                insert.setString(3, UUID.randomUUID() + "@example.test");
                insert.setString(4, UUID.randomUUID().toString());
                insert.executeUpdate();
            }
        }
        try (var statement = connection.createStatement()) {
            statement.executeUpdate("""
                    INSERT INTO categories (id,name,type,user_id,created_at) VALUES
                    (1,'Lương cũ','INCOME',1,'2026-10-15 12:00:00'),
                    (2,'Ăn uống cũ','EXPENSE',1,'2026-10-15 12:00:00'),
                    (3,'Lương B','INCOME',2,'2026-10-15 12:00:00'),
                    (4,'Chi B','EXPENSE',2,'2026-10-15 12:00:00')
                    """);
            statement.executeUpdate("""
                    INSERT INTO transactions (id,amount,transaction_date,note,type,user_id,category_id,created_at) VALUES
                    (1,1000.10,'2026-10-01','Lương tháng','INCOME',1,1,'2026-10-15 12:00:00'),
                    (2,200.20,'2026-10-02','Cà phê Đà Nẵng','EXPENSE',1,2,'2026-10-15 12:00:00'),
                    (3,999.99,'2026-10-02','Riêng user B','EXPENSE',2,4,'2026-10-15 12:00:00')
                    """);
            statement.executeUpdate("INSERT INTO monthly_budgets VALUES (1,1,2026,10,500.00)");
        }
    }

    private static void applyMigration(Connection connection) {
        ScriptUtils.executeSqlScript(connection,
                new EncodedResource(new FileSystemResource(MIGRATION), StandardCharsets.UTF_8));
    }

    @Test
    void migrationPreservesAllLegacyValuesKeysAndNullMetadata() throws Exception {
        assertThat(environment.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
        assertThat(environment.getProperty("spring.jpa.properties.jakarta.persistence.schema-generation.database.action")).isNull();
        try (Connection connection = connect(SOURCE)) {
            assertAppearanceColumns(connection);
            assertThat(dataHash(connection)).isEqualTo(beforeData);
            assertThat(keysHash(connection)).isEqualTo(beforeKeys);
            assertThat(rows(connection, "SELECT COUNT(*) FROM categories WHERE icon IS NULL AND color IS NULL"))
                    .containsExactly(List.of("4"));
        }
    }

    @Test
    void newBackendReadsLegacyCategoriesTransactionsBudgetsAndCalendar() throws Exception {
        mvc.perform(get("/api/categories/2").header(HttpHeaders.AUTHORIZATION, token(1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Ăn uống cũ"))
                .andExpect(jsonPath("$.icon").value("tag")).andExpect(jsonPath("$.color").value("#64748B"));
        mvc.perform(get("/api/categories/4").header(HttpHeaders.AUTHORIZATION, token(1)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/transactions").param("month", "2026-10")
                        .header(HttpHeaders.AUTHORIZATION, token(1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2));
        mvc.perform(get("/api/budgets/2026/10").header(HttpHeaders.AUTHORIZATION, token(1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.spentAmount").value(200.20));
        mvc.perform(get("/api/calendar/month").param("year", "2026").param("month", "10")
                        .header(HttpHeaders.AUTHORIZATION, token(1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.incomeTotal").value(1000.10))
                .andExpect(jsonPath("$.expenseTotal").value(200.20));
    }

    @Test
    void oldColumnWritesRemainValidAndNewBackendCanRegisterWithMetadata() throws Exception {
        // Mô phỏng INSERT theo cột cũ sau nâng cấp; không phải chứng nhận toàn bộ binary MVP cũ.
        entityManager.createNativeQuery("""
                INSERT INTO categories (id,name,type,user_id,created_at)
                VALUES (42,'Client cũ vẫn ghi','EXPENSE',1,'2026-10-15 12:00:00')
                """).executeUpdate();
        mvc.perform(get("/api/categories/42").header(HttpHeaders.AUTHORIZATION, token(1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.icon").value("tag"));
        String email = UUID.randomUUID() + "@example.test";
        String password = UUID.randomUUID().toString();
        String body = "{\"fullName\":\"Migration test\",\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        entityManager.flush();
        assertThat(entityManager.createNativeQuery("""
                SELECT COUNT(*) FROM categories c JOIN users u ON u.id=c.user_id
                WHERE u.email=:email AND c.icon IS NOT NULL AND c.color IS NOT NULL
                """, Long.class).setParameter("email", email).getSingleResult()).isEqualTo(17L);
    }

    @Test
    void repeatedSqlFailsClosedWithoutChangingLegacyData() throws Exception {
        try (Connection connection = connect(SOURCE)) {
            assertThatThrownBy(() -> applyMigration(connection))
                    .isInstanceOf(org.springframework.jdbc.datasource.init.ScriptException.class);
            assertAppearanceColumns(connection);
            assertThat(dataHash(connection)).isEqualTo(beforeData);
        }
    }

    @Test
    void backupRestoresToDifferentServerAndRecoversFromPartialSchemaDrift() throws Exception {
        guard(RESTORE);
        assertThatThrownBy(() -> restoreBackup("incorrect-checksum")).isInstanceOf(IllegalStateException.class);
        restoreBackup(backupHash);
        try (Connection connection = connect(RESTORE)) {
            assertThat(appearanceColumns(connection)).isEmpty();
            assertThat(dataHash(connection)).isEqualTo(beforeData);
            assertThat(keysHash(connection)).isEqualTo(beforeKeys);
            // Mô phỏng drift trên server restore riêng: một ALTER lỗi không được để lại nửa migration.
            try (var statement = connection.createStatement()) {
                statement.execute("ALTER TABLE categories ADD COLUMN color VARCHAR(7) NULL");
            }
            assertThatThrownBy(() -> applyMigration(connection))
                    .isInstanceOf(org.springframework.jdbc.datasource.init.ScriptException.class);
            assertThat(appearanceColumns(connection)).hasSize(1);
            assertThat(appearanceColumns(connection).getFirst().getFirst()).isEqualTo("color");
            assertThat(dataHash(connection)).isEqualTo(beforeData);
        }
        // Restore lại chỉ trên container thử nghiệm; không sửa hoặc drop cột trên source.
        restoreBackup(backupHash);
        try (Connection connection = connect(RESTORE)) {
            applyMigration(connection);
            assertAppearanceColumns(connection);
            assertThat(dataHash(connection)).isEqualTo(beforeData);
            assertThat(keysHash(connection)).isEqualTo(beforeKeys);
        }
        try (HikariDataSource pool = pool(RESTORE)) {
            var registry = new StandardServiceRegistryBuilder()
                    .applySetting("hibernate.connection.datasource", pool)
                    .applySetting("hibernate.hbm2ddl.auto", "validate").build();
            try (var factory = new MetadataSources(registry).addAnnotatedClass(User.class)
                    .addAnnotatedClass(Category.class).addAnnotatedClass(Transaction.class)
                    .addAnnotatedClass(MonthlyBudget.class).buildMetadata().buildSessionFactory();
                 var session = factory.openSession()) {
                assertThat(session.find(Category.class, 2L).getName()).isEqualTo("Ăn uống cũ");
            } finally {
                StandardServiceRegistryBuilder.destroy(registry);
            }
        }
        System.out.printf("D06 MIGRATION mysql=%s backupBytes=%d backupSHA256=%s migrationSHA256=%s "
                        + "legacyRows=2users/4categories/3transactions/1budget restore=PASS validate=PASS%n",
                mysqlVersion, Files.size(BACKUP), backupHash, migrationHash);
    }

    private static void restoreBackup(String expectedHash) throws Exception {
        guard(RESTORE);
        if (!sha256(Files.readAllBytes(BACKUP)).equals(expectedHash))
            throw new IllegalStateException("Checksum backup không khớp; dừng trước restore");
        RESTORE.copyFileToContainer(MountableFile.forHostPath(BACKUP.toString()), "/tmp/d06-restore.sql");
        var result = RESTORE.execInContainer("sh", "-c",
                "MYSQL_PWD=\"$MYSQL_PASSWORD\" exec mysql --user=\"$MYSQL_USER\" "
                        + "--default-character-set=utf8mb4 --batch \"$MYSQL_DATABASE\" < /tmp/d06-restore.sql");
        if (result.getExitCode() != 0) throw new IllegalStateException("Restore test thất bại: " + result.getExitCode());
    }

    private static List<List<String>> appearanceColumns(Connection connection) throws Exception {
        return rows(connection, """
                SELECT COLUMN_NAME,DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,IS_NULLABLE,COLUMN_DEFAULT
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='categories' AND COLUMN_NAME IN ('icon','color')
                ORDER BY ORDINAL_POSITION
                """);
    }

    private static void assertAppearanceColumns(Connection connection) throws Exception {
        assertThat(appearanceColumns(connection)).containsExactly(
                Arrays.asList("icon", "varchar", "40", "YES", null),
                Arrays.asList("color", "varchar", "7", "YES", null));
    }

    private static String dataHash(Connection connection) throws Exception {
        StringBuilder data = new StringBuilder();
        for (String query : List.of(
                "SELECT id,full_name,email,password_hash,created_at FROM users WHERE id<=2 ORDER BY id",
                "SELECT id,name,type,user_id,created_at FROM categories WHERE id<=4 ORDER BY id",
                "SELECT id,amount,transaction_date,note,type,user_id,category_id,created_at FROM transactions WHERE id<=3 ORDER BY id",
                "SELECT id,user_id,year,month,amount_limit FROM monthly_budgets WHERE id<=1 ORDER BY id")) {
            data.append(rows(connection, query));
        }
        return sha256(data.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String keysHash(Connection connection) throws Exception {
        return sha256(rows(connection, """
                SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION
                """).toString().getBytes(StandardCharsets.UTF_8));
    }

    private static List<List<String>> rows(Connection connection, String sql) throws Exception {
        List<List<String>> rows = new ArrayList<>();
        try (var statement = connection.createStatement(); var result = statement.executeQuery(sql)) {
            while (result.next()) {
                List<String> row = new ArrayList<>();
                for (int column = 1; column <= result.getMetaData().getColumnCount(); column++)
                    row.add(result.getString(column));
                rows.add(row);
            }
        }
        return rows;
    }

    private String token(long userId) {
        Instant now = Instant.now();
        return "Bearer " + jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(String.valueOf(userId)).issuedAt(now)
                        .expiresAt(now.plusSeconds(600)).build())).getTokenValue();
    }

    private static String sha256(byte[] data) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
    }

    private static String randomJwtKey() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }

    private static HikariDataSource pool(MySQLContainer container) {
        guard(container);
        HikariDataSource pool = new HikariDataSource();
        pool.setJdbcUrl(container.getJdbcUrl());
        pool.setUsername(container.getUsername());
        pool.setPassword(container.getPassword());
        pool.setMaximumPoolSize(2);
        return pool;
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TestDataSource {
        @Bean(destroyMethod = "close")
        HikariDataSource dataSource(Environment environment) {
            if (!"validate".equals(environment.getProperty("spring.jpa.hibernate.ddl-auto"))
                    || environment.getProperty("spring.jpa.properties.jakarta.persistence.schema-generation.database.action") != null
                    || environment.getProperty("spring.jpa.generate-ddl", Boolean.class, true)) {
                throw new IllegalStateException("Migration test không cho phép Hibernate tự tạo/sửa schema");
            }
            return pool(SOURCE);
        }
    }
}
