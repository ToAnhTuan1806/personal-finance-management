package com.smartexpense.backend;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.mysql.MySQLContainer;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.*;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

// Gate riêng: không dùng fixture D06 hoặc Hibernate create/update để thay migration còn thiếu.
class CategoryBudgetMigrationIntegrationTests {

    private static final String DATABASE = "se_d07_migration_" + UUID.randomUUID().toString().replace("-", "");
    private static final String USER = "d07_migration";
    private static final String PASSWORD = UUID.randomUUID().toString();
    private static MySQLContainer mysql;

    @Test
    void approvedMigrationsCreateFreshSchemaValidateHibernateAndPreserveMonthlyBudget() throws Exception {
        // Kiểm tra dependency trước khi tạo container hay kết nối DB; thiếu migration phải FAIL rõ BLOCKED.
        List<Path> migrations = approvedMigrationSequence();
        try (MySQLContainer container = localContainer()) {
            mysql = container;
            container.start();
            verifyTarget();
            Map<String, Object> legacyBudget;
            try (Connection connection = connect()) {
                assertThat(connection.getMetaData().getTables(DATABASE, null, "%", new String[]{"TABLE"}).next()).isFalse();
                apply(connection, migrations.get(0));
                apply(connection, migrations.get(1));
                JdbcTemplate jdbc = new JdbcTemplate(dataSource());
                try {
                    jdbc.update("INSERT INTO users (full_name,email,password_hash,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)",
                            "D07 legacy fixture", UUID.randomUUID() + "@example.test", UUID.randomUUID().toString());
                    Long owner = jdbc.queryForObject("SELECT id FROM users WHERE full_name = ?", Long.class, "D07 legacy fixture");
                    jdbc.update("INSERT INTO monthly_budgets (user_id,year,month,amount_limit) VALUES (?,2026,12,7777.77)", owner);
                    legacyBudget = jdbc.queryForMap("SELECT * FROM monthly_budgets WHERE user_id = ?", owner);
                } finally {
                    ((HikariDataSource) jdbc.getDataSource()).close();
                }
                apply(connection, migrations.get(2));
            }
            byte[] key = new byte[32];
            new SecureRandom().nextBytes(key);
            // Cấu hình chỉ tồn tại trong context test; DataSource không bind credential/URL của môi trường.
            try (var context = new SpringApplicationBuilder(BackendApplication.class, IsolatedDataSource.class)
                    .properties(Map.of("app.jwt.secret", Base64.getEncoder().encodeToString(key),
                            "app.jwt.expiration", "600", "logging.level.root", "WARN"))
                    .run("--spring.config.location=optional:classpath:/d07-unused.properties", "--server.port=0",
                            "--server.address=127.0.0.1", "--spring.jpa.hibernate.ddl-auto=validate",
                            "--spring.jpa.generate-ddl=false", "--spring.sql.init.mode=never",
                            "--spring.jpa.properties.jakarta.persistence.schema-generation.database.action=none",
                            "--spring.jpa.open-in-view=false")) {
                assertThat(context.getEnvironment().getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
                assertThat(context.getEnvironment().getProperty(
                        "spring.jpa.properties.jakarta.persistence.schema-generation.database.action")).isEqualTo("none");
                assertThat(context.getBean(EntityManagerFactory.class).isOpen()).isTrue();
                // Validate tường minh, kể cả khi JPA action=none có ưu tiên hơn legacy ddl-auto.
                context.getBean(EntityManagerFactory.class).unwrap(org.hibernate.SessionFactory.class)
                        .getSchemaManager().validateMappedObjects();
                JdbcTemplate jdbc = context.getBean(JdbcTemplate.class);
                assertSchema(jdbc);
                assertThat(jdbc.queryForMap("SELECT * FROM monthly_budgets WHERE id = ?", legacyBudget.get("id")))
                        .isEqualTo(legacyBudget);
            }
        } finally {
            mysql = null;
        }
    }

    private static List<Path> approvedMigrationSequence() throws Exception {
        Path directory = Path.of("../database/migrations").toAbsolutePath().normalize();
        Pattern name = Pattern.compile("V(\\d+)__.+\\.sql");
        Map<Integer, Path> versions = new TreeMap<>();
        try (var paths = Files.list(directory)) {
            for (Path path : paths.filter(Files::isRegularFile).toList()) {
                var match = name.matcher(path.getFileName().toString());
                if (match.matches()) {
                    int version = Integer.parseInt(match.group(1));
                    assertThat(versions.put(version, path)).as("One approved SQL artifact per version").isNull();
                }
            }
        }
        assertThat(versions.keySet()).as("BLOCKED D07-DB: require approved V001 baseline, V002 metadata and V003 category_budgets; no substitute DDL")
                .contains(1, 2, 3);
        return List.of(versions.get(1), versions.get(2), versions.get(3));
    }

    private static MySQLContainer localContainer() {
        return new MySQLContainer("mysql:8.0") {
            @Override
            public void start() {
                URI endpoint = DockerClientFactory.instance().getTransportConfig().getDockerHost();
                boolean unix = "unix".equals(endpoint.getScheme()) && endpoint.getHost() == null;
                boolean pipe = "npipe".equals(endpoint.getScheme()) && endpoint.getPath().startsWith("//./pipe/");
                if (!unix && !pipe) throw new IllegalStateException("D07 migration requires a local Docker socket");
                super.start();
            }
        }.withDatabaseName(DATABASE).withUsername(USER).withPassword(PASSWORD).withReuse(false)
                .withLabel("com.smartexpense.test", "d07-migration")
                .withUrlParam("useSSL", "false").withUrlParam("allowPublicKeyRetrieval", "true")
                .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                        new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(3306))));
    }

    private static void verifyTarget() {
        URI target = URI.create(mysql.getJdbcUrl().substring(5));
        if (!mysql.isRunning() || !DATABASE.matches("se_d07_migration_[a-f0-9]{32}")
                || !DATABASE.equals(mysql.getDatabaseName()) || !USER.equals(mysql.getUsername())
                || !PASSWORD.equals(mysql.getPassword()) || !"mysql".equals(target.getScheme())
                || (!"localhost".equals(target.getHost()) && !"127.0.0.1".equals(target.getHost()))
                || target.getPort() != mysql.getMappedPort(3306) || target.getPort() == 3306
                || !target.getPath().equals("/" + DATABASE)) {
            throw new IllegalStateException("D07 migration target is not the verified isolated container");
        }
    }

    private static Connection connect() throws Exception {
        verifyTarget();
        Connection connection = DriverManager.getConnection(mysql.getJdbcUrl(), USER, PASSWORD);
        assertThat(connection.getCatalog()).isEqualTo(DATABASE);
        assertThat(connection.getMetaData().getDatabaseProductName()).isEqualTo("MySQL");
        assertThat(connection.getMetaData().getDatabaseMajorVersion()).isEqualTo(8);
        return connection;
    }

    private static HikariDataSource dataSource() {
        verifyTarget();
        HikariDataSource pool = new HikariDataSource();
        pool.setJdbcUrl(mysql.getJdbcUrl());
        pool.setUsername(USER);
        pool.setPassword(PASSWORD);
        pool.setDriverClassName("com.mysql.cj.jdbc.Driver");
        pool.setMaximumPoolSize(2);
        return pool;
    }

    private static void apply(Connection connection, Path migration) {
        ScriptUtils.executeSqlScript(connection, new EncodedResource(new FileSystemResource(migration), StandardCharsets.UTF_8));
    }

    private static void assertSchema(JdbcTemplate jdbc) {
        var columns = jdbc.queryForList("""
                SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale, extra
                FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'category_budgets'
                ORDER BY ordinal_position
                """);
        assertThat(columns).extracting(row -> row.get("COLUMN_NAME").toString())
                .containsExactlyInAnyOrder("id", "user_id", "category_id", "year", "month", "amount_limit");
        for (var column : columns) {
            String name = column.get("COLUMN_NAME").toString();
            assertThat(column.get("IS_NULLABLE")).isEqualTo("NO");
            assertThat(column.get("DATA_TYPE")).isEqualTo(switch (name) {
                case "year", "month" -> "int";
                case "amount_limit" -> "decimal";
                default -> "bigint";
            });
            if (name.equals("id")) assertThat(column.get("EXTRA").toString()).contains("auto_increment");
            if (name.equals("amount_limit")) {
                assertThat(((Number) column.get("NUMERIC_PRECISION")).intValue()).isEqualTo(15);
                assertThat(((Number) column.get("NUMERIC_SCALE")).intValue()).isEqualTo(2);
            }
        }
        assertThat(jdbc.queryForList("""
                SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics
                WHERE table_schema = DATABASE() AND table_name = 'category_budgets' AND non_unique = 0 GROUP BY index_name
                """, String.class)).contains("id", "user_id,category_id,year,month");
        assertThat(jdbc.queryForList("""
                SELECT CONCAT(column_name, '->', referenced_table_name, '.', referenced_column_name)
                FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = 'category_budgets'
                  AND referenced_table_name IS NOT NULL
                """, String.class)).contains("user_id->users.id", "category_id->categories.id");
        assertThat(jdbc.queryForObject("""
                SELECT delete_rule FROM information_schema.referential_constraints
                WHERE constraint_schema = DATABASE() AND table_name = 'category_budgets' AND referenced_table_name = 'categories'
                """, String.class)).isIn("RESTRICT", "NO ACTION");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class IsolatedDataSource {
        @Bean(destroyMethod = "close")
        HikariDataSource migrationDataSource() {
            return dataSource();
        }
    }
}
