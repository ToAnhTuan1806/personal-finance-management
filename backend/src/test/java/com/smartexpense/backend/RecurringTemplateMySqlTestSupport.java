package com.smartexpense.backend;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.mysql.MySQLContainer;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// D08 không kế thừa harness JPA-create: bắt buộc SQL MVP -> V002 -> V003 -> V004 trước Spring.
abstract class RecurringTemplateMySqlTestSupport {
    static final List<String> LEGACY_TABLES = List.of("users", "categories", "transactions", "monthly_budgets", "category_budgets");
    private static final String DATABASE = "se_d08_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String USER = "d08_test";
    private static final String PASSWORD = UUID.randomUUID().toString();
    private static final String JWT_KEY = randomKey();
    private static Map<String, List<Map<String, Object>>> legacyRows;

    @Container
    static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.0") {
        @Override
        public void start() {
            approvedMigrations(); // Thiếu V004 phải báo BLOCKED rõ, không thay bằng Hibernate DDL.
            URI endpoint = DockerClientFactory.instance().getTransportConfig().getDockerHost();
            boolean unix = "unix".equals(endpoint.getScheme()) && endpoint.getHost() == null;
            boolean pipe = "npipe".equals(endpoint.getScheme()) && endpoint.getPath().startsWith("//./pipe/");
            if (!unix && !pipe) throw new IllegalStateException("D08 tests require a local Docker socket");
            super.start();
        }
    }.withDatabaseName(DATABASE).withUsername(USER).withPassword(PASSWORD).withReuse(false)
            .withLabel("com.smartexpense.test", "d08")
            .withUrlParam("useSSL", "false").withUrlParam("allowPublicKeyRetrieval", "true")
            .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                    new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(3306))));

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) throws Exception {
        prepareSchema();
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", () -> USER);
        registry.add("spring.datasource.password", () -> PASSWORD);
        registry.add("app.jwt.secret", () -> JWT_KEY);
    }

    private static synchronized void prepareSchema() throws Exception {
        if (legacyRows != null) return;
        List<Path> migrations = approvedMigrations();
        verifyTarget();
        try (Connection connection = DriverManager.getConnection(MYSQL.getJdbcUrl(), USER, PASSWORD)) {
            assertThat(connection.getCatalog()).isEqualTo(DATABASE);
            assertThat(connection.getMetaData().getDatabaseMajorVersion()).isEqualTo(8);
            assertThat(connection.getMetaData().getUserName()).startsWith(USER + "@");
            JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
            assertThat(jdbc.queryForList("SHOW TABLES")).isEmpty();
            ScriptUtils.executeSqlScript(connection, new EncodedResource(
                    new ClassPathResource("d06-legacy-schema.sql"), StandardCharsets.UTF_8));
            apply(connection, migrations.get(0));
            apply(connection, migrations.get(1));
            // Dữ liệu cũ có cả giao dịch và hai loại ngân sách trước khi chạy V004.
            jdbc.update("INSERT INTO users (full_name,email,password_hash,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)",
                    "D08 legacy", UUID.randomUUID() + "@example.test", UUID.randomUUID().toString());
            Long owner = jdbc.queryForObject("SELECT id FROM users", Long.class);
            jdbc.update("INSERT INTO categories (user_id,name,type,created_at) VALUES (?,?,'EXPENSE',CURRENT_TIMESTAMP)", owner, "D08 legacy category");
            Long category = jdbc.queryForObject("SELECT id FROM categories", Long.class);
            jdbc.update("INSERT INTO transactions (user_id,category_id,type,amount,transaction_date,note,created_at) "
                    + "VALUES (?,?,'EXPENSE',12.34,'1970-01-01',NULL,CURRENT_TIMESTAMP)", owner, category);
            jdbc.update("INSERT INTO monthly_budgets (user_id,year,month,amount_limit) VALUES (?,2026,12,7777.77)", owner);
            jdbc.update("INSERT INTO category_budgets (user_id,category_id,year,month,amount_limit) VALUES (?,?,2026,12,3333.33)", owner, category);
            var before = snapshot(jdbc);
            apply(connection, migrations.get(2));
            // Context D09 nạp thêm RecurringApplication; cần V005 thật trước Hibernate validate.
            apply(connection, migrations.get(3));
            assertThat(snapshot(jdbc)).isEqualTo(before);
            D12MigrationTestSupport.apply(connection);
            legacyRows = snapshot(jdbc);
        }
    }

    static void assertLegacyRows(JdbcTemplate jdbc) {
        assertThat(snapshot(jdbc)).isEqualTo(legacyRows);
    }

    static Map<String, List<Map<String, Object>>> snapshot(JdbcTemplate jdbc) {
        Map<String, List<Map<String, Object>>> rows = new LinkedHashMap<>();
        for (String table : LEGACY_TABLES) rows.put(table, jdbc.queryForList("SELECT * FROM " + table + " ORDER BY id"));
        return rows;
    }

    static void verifyTarget() {
        URI target = URI.create(MYSQL.getJdbcUrl().substring(5));
        if (!MYSQL.isRunning() || !DATABASE.equals(MYSQL.getDatabaseName())
                || !DATABASE.matches("se_d08_test_[a-f0-9]{32}")
                || !USER.equals(MYSQL.getUsername()) || !PASSWORD.equals(MYSQL.getPassword())
                || !"mysql".equals(target.getScheme())
                || (!"localhost".equals(target.getHost()) && !"127.0.0.1".equals(target.getHost()))
                || target.getPort() != MYSQL.getMappedPort(3306) || target.getPort() == 3306
                || !target.getPath().equals("/" + DATABASE)) {
            throw new IllegalStateException("D08 target is not the verified isolated MySQL container");
        }
    }

    private static List<Path> approvedMigrations() {
        var paths = List.of("V002__category_icon_color.sql", "V003__create_category_budgets.sql",
                "V004__create_recurring_templates.sql", "V005__create_recurring_applications.sql").stream()
                .map(name -> Path.of("../database/migrations", name).toAbsolutePath().normalize()).toList();
        for (Path path : paths) {
            assertThat(Files.isRegularFile(path)).as("BLOCKED D08-DB: approved SQL required: %s; no substitute DDL", path).isTrue();
        }
        return paths;
    }

    private static void apply(Connection connection, Path path) {
        ScriptUtils.executeSqlScript(connection, new EncodedResource(new FileSystemResource(path), StandardCharsets.UTF_8));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class IsolatedDataSource {
        @Bean(destroyMethod = "close")
        HikariDataSource dataSource() {
            verifyTarget();
            HikariDataSource pool = new HikariDataSource();
            pool.setJdbcUrl(MYSQL.getJdbcUrl());
            pool.setUsername(USER);
            pool.setPassword(PASSWORD);
            pool.setDriverClassName("com.mysql.cj.jdbc.Driver");
            pool.setMaximumPoolSize(2);
            return pool;
        }
    }

    private static String randomKey() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }
}
