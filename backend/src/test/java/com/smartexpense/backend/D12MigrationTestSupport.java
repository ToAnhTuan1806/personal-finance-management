package com.smartexpense.backend;

import com.github.dockerjava.api.model.*;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.springframework.core.io.*;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.mysql.MySQLContainer;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;

// Chỉ SQL được sở hữu bởi DB; không có DDL thay thế hoặc fallback Hibernate create/update.
final class D12MigrationTestSupport {
    private D12MigrationTestSupport() { }

    static void apply(Connection connection) {
        applyFile(connection, Path.of("../database/migrations/V006__create_password_reset_tokens.sql"));
    }

    private static void applyFile(Connection connection, Path path) {
        assertThat(Files.isRegularFile(path)).as("BLOCKED: approved SQL required: %s", path.getFileName()).isTrue();
        ScriptUtils.executeSqlScript(connection, new EncodedResource(new FileSystemResource(path), StandardCharsets.UTF_8));
    }

    // Test migration lịch sử vẫn giữ nguyên schema/snapshot của version đó.
    // Chỉ phần validate Entity hiện tại dùng container mới với toàn bộ chuỗi V002 -> V006.
    static void validateCurrentMappings(List<Class<?>> entities) throws Exception {
        String database = "se_d12_validation_" + UUID.randomUUID().toString().replace("-", "");
        String password = UUID.randomUUID().toString();
        try (MySQLContainer mysql = new MySQLContainer("mysql:8.0") {
            @Override public void start() {
                URI socket = DockerClientFactory.instance().getTransportConfig().getDockerHost();
                boolean unix = "unix".equals(socket.getScheme()) && socket.getHost() == null;
                boolean pipe = "npipe".equals(socket.getScheme()) && socket.getPath().startsWith("//./pipe/");
                if (!unix && !pipe) throw new IllegalStateException("D12 validation requires a local Docker socket");
                super.start();
            }
        }.withDatabaseName(database).withUsername("d12_validation").withPassword(password).withReuse(false)
                .withLabel("com.smartexpense.test", "d12-validation")
                .withUrlParam("useSSL", "false").withUrlParam("allowPublicKeyRetrieval", "true")
                .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                        new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(3306))))) {
            mysql.start();
            URI target = URI.create(mysql.getJdbcUrl().substring(5));
            if (!mysql.isRunning() || !database.matches("se_d12_validation_[a-f0-9]{32}")
                    || !("localhost".equals(target.getHost()) || "127.0.0.1".equals(target.getHost()))
                    || !"mysql".equals(target.getScheme()) || !target.getPath().equals("/" + database)
                    || target.getPort() == 3306 || target.getPort() != mysql.getMappedPort(3306))
                throw new IllegalStateException("D12 validation target is not an isolated MySQL container");
            try (Connection connection = DriverManager.getConnection(mysql.getJdbcUrl(), mysql.getUsername(), password)) {
                assertThat(connection.getCatalog()).isEqualTo(database);
                assertThat(connection.getMetaData().getDatabaseMajorVersion()).isEqualTo(8);
                assertThat(connection.getMetaData().getUserName()).startsWith("d12_validation@");
                ScriptUtils.executeSqlScript(connection, new EncodedResource(new ClassPathResource("d06-legacy-schema.sql"), StandardCharsets.UTF_8));
                for (String file : List.of("V002__category_icon_color.sql", "V003__create_category_budgets.sql",
                        "V004__create_recurring_templates.sql", "V005__create_recurring_applications.sql"))
                    applyFile(connection, Path.of("../database/migrations", file));
                apply(connection);
                ApplicationSchemaAssertions.assertSchema(connection, true, true, true, true);
            }
            var registry = new StandardServiceRegistryBuilder().applySettings(Map.of(
                    "hibernate.connection.url", mysql.getJdbcUrl(), "hibernate.connection.username", mysql.getUsername(),
                    "hibernate.connection.password", password, "hibernate.connection.driver_class", "com.mysql.cj.jdbc.Driver",
                    "hibernate.hbm2ddl.auto", "validate", "hibernate.show_sql", "false")).build();
            try {
                MetadataSources sources = new MetadataSources(registry);
                entities.forEach(sources::addAnnotatedClass);
                try (var factory = sources.buildMetadata().buildSessionFactory()) {
                    factory.getSchemaManager().validateMappedObjects();
                }
            } finally { StandardServiceRegistryBuilder.destroy(registry); }
        }
    }
}
