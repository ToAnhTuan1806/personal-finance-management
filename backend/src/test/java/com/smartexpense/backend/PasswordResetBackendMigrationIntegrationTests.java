package com.smartexpense.backend;

import com.github.dockerjava.api.model.*;
import com.zaxxer.hikari.HikariDataSource;
import com.smartexpense.backend.service.PasswordResetService;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.io.*;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.sql.*;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

@Testcontainers
class PasswordResetBackendMigrationIntegrationTests {
    private static final Path V006 = Path.of("../database/migrations/V006__create_password_reset_tokens.sql").toAbsolutePath().normalize();
    private static final String DATABASE = "se_d12_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String USER = "d12_test";
    private static final String PASSWORD = UUID.randomUUID().toString();
    private static MySQLContainer mysql;

    @Test
    void approvedSqlUpgradesLegacyDataMatchesJpaAndSupportsAtomicReset() throws Exception {
        try (MySQLContainer container = new MySQLContainer("mysql:8.0") {
            @Override public void start() {
                URI endpoint = DockerClientFactory.instance().getTransportConfig().getDockerHost();
                if (!("unix".equals(endpoint.getScheme()) && endpoint.getHost() == null)
                        && !("npipe".equals(endpoint.getScheme()) && endpoint.getPath().startsWith("//./pipe/")))
                    throw new IllegalStateException("D12 migration tests require a verified local Docker socket");
                super.start();
            }
        }.withDatabaseName(DATABASE).withUsername(USER).withPassword(PASSWORD).withReuse(false)
                .withLabel("com.smartexpense.test", "d12-migration")
                .withUrlParam("useSSL", "false").withUrlParam("allowPublicKeyRetrieval", "true")
                .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                        new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(3306))))) {
            mysql = container; container.start(); guard();
            String raw = randomToken(); Long owner; Map<String, Object> legacy;
            try (Connection connection = DriverManager.getConnection(mysql.getJdbcUrl(), USER, PASSWORD)) {
                assertThat(connection.getCatalog()).isEqualTo(DATABASE);
                assertThat(connection.getMetaData().getDatabaseMajorVersion()).isEqualTo(8);
                assertThat(connection.getMetaData().getUserName()).startsWith(USER + "@");
                JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
                assertThat(jdbc.queryForList("SHOW TABLES")).isEmpty();
                ScriptUtils.executeSqlScript(connection, new EncodedResource(new ClassPathResource("d06-legacy-schema.sql"), StandardCharsets.UTF_8));
                for (String file : List.of("V002__category_icon_color.sql", "V003__create_category_budgets.sql", "V004__create_recurring_templates.sql", "V005__create_recurring_applications.sql"))
                    apply(connection, Path.of("../database/migrations", file));
                jdbc.update("INSERT INTO users(full_name,email,password_hash,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)",
                        "D12 legacy", UUID.randomUUID() + "@example.test", new BCryptPasswordEncoder(4).encode("OldPassword123!"));
                owner = jdbc.queryForObject("SELECT id FROM users", Long.class);
                legacy = jdbc.queryForMap("SELECT id,full_name,email,password_hash,created_at FROM users WHERE id=?", owner);
                apply(connection, V006);
                assertThat(jdbc.queryForMap("SELECT id,full_name,email,password_hash,created_at FROM users WHERE id=?", owner)).isEqualTo(legacy);
                assertThat(jdbc.queryForObject("SELECT auth_version FROM users WHERE id=?", Long.class, owner)).isZero();
                assertThat(jdbc.queryForList("SELECT column_name,column_type,is_nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='password_reset_tokens'")).hasSize(6);
                assertThat(jdbc.queryForObject("SELECT column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='password_reset_tokens' AND column_name='token_hash'", String.class)).isEqualTo("char(64)");
                assertThat(jdbc.queryForList("SELECT datetime_precision FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='password_reset_tokens' AND column_name IN ('created_at','expires_at','used_at')", Integer.class)).containsOnly(6);
                jdbc.update("INSERT INTO password_reset_tokens(user_id,token_hash,created_at,expires_at) VALUES (?,?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 30 MINUTE))", owner, hash(raw));
                assertThatThrownBy(() -> jdbc.update("INSERT INTO password_reset_tokens(user_id,token_hash,created_at,expires_at) VALUES (?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))", owner, hash(raw)))
                        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
                assertThatThrownBy(() -> jdbc.update("INSERT INTO password_reset_tokens(user_id,token_hash,created_at,expires_at) VALUES (?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))", Long.MAX_VALUE, hash(randomToken())))
                        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            }
            byte[] key = new byte[32]; new SecureRandom().nextBytes(key);
            try (var context = new SpringApplicationBuilder(BackendApplication.class, IsolatedDataSource.class)
                    .properties(Map.of("app.jwt.secret", Base64.getEncoder().encodeToString(key), "app.jwt.expiration", "600", "logging.level.root", "WARN"))
                    .run("--spring.config.location=optional:classpath:/d12-migration-isolated.properties", "--server.address=127.0.0.1", "--server.port=0",
                            "--spring.jpa.hibernate.ddl-auto=validate", "--spring.jpa.generate-ddl=false", "--spring.sql.init.mode=never",
                            "--spring.jpa.properties.jakarta.persistence.schema-generation.database.action=none", "--spring.jpa.open-in-view=false")) {
                context.getBean(EntityManagerFactory.class).unwrap(org.hibernate.SessionFactory.class).getSchemaManager().validateMappedObjects();
                var reset = context.getBean(PasswordResetService.class); reset.resetPassword(raw, "NewPassword123!", "127.0.0.1");
                var jdbc = context.getBean(JdbcTemplate.class);
                assertThat(jdbc.queryForObject("SELECT auth_version FROM users WHERE id=?", Long.class, owner)).isEqualTo(1);
                assertThat(new BCryptPasswordEncoder().matches("NewPassword123!", jdbc.queryForObject("SELECT password_hash FROM users WHERE id=?", String.class, owner))).isTrue();
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL", Integer.class, owner)).isZero();
                assertThatThrownBy(() -> reset.resetPassword(raw, "OtherPassword123!", "127.0.0.1")).isInstanceOf(com.smartexpense.backend.exception.PasswordResetException.class);
            }
        } finally { mysql = null; }
    }

    private static void guard() {
        URI target = URI.create(mysql.getJdbcUrl().substring(5));
        if (!mysql.isRunning() || !DATABASE.equals(mysql.getDatabaseName()) || !DATABASE.matches("se_d12_test_[a-f0-9]{32}")
                || !USER.equals(mysql.getUsername()) || !PASSWORD.equals(mysql.getPassword())
                || !("localhost".equals(target.getHost()) || "127.0.0.1".equals(target.getHost()))
                || !"mysql".equals(target.getScheme()) || !target.getPath().equals("/" + DATABASE)
                || target.getPort() == 3306 || target.getPort() != mysql.getMappedPort(3306))
            throw new IllegalStateException("D12 target is not the verified isolated MySQL container");
    }
    private static void apply(Connection connection, Path path) {
        assertThat(Files.isRegularFile(path)).as("Approved migration is required: %s", path.getFileName()).isTrue();
        ScriptUtils.executeSqlScript(connection, new EncodedResource(new FileSystemResource(path), StandardCharsets.UTF_8));
    }
    private static String randomToken() {
        byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private static String hash(String raw) throws NoSuchAlgorithmException {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class IsolatedDataSource {
        @Bean(destroyMethod = "close") HikariDataSource dataSource() {
            guard(); HikariDataSource pool = new HikariDataSource(); pool.setJdbcUrl(mysql.getJdbcUrl());
            pool.setUsername(USER); pool.setPassword(PASSWORD); pool.setMaximumPoolSize(2); return pool;
        }
    }
}
