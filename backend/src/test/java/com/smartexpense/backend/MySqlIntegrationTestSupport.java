package com.smartexpense.backend;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.mysql.MySQLContainer;

import javax.sql.DataSource;
import java.net.URI;
import java.security.SecureRandom;
import java.sql.Connection;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Dùng lại cấu hình MySQL cô lập của D03; mỗi lớp test khởi động container mới và xóa khi kết thúc.
abstract class MySqlIntegrationTestSupport {

    private static final String DATABASE = "se_d03_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String PASSWORD = UUID.randomUUID().toString();
    private static final String JWT_KEY = randomJwtKey();

    @Container
    protected static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.0") {
        @Override
        public void start() {
            // Chỉ cho phép socket Docker local, không tạo tài nguyên trên Docker host từ xa.
            URI endpoint = DockerClientFactory.instance().getTransportConfig().getDockerHost();
            boolean localUnix = "unix".equals(endpoint.getScheme()) && endpoint.getHost() == null;
            boolean localPipe = "npipe".equals(endpoint.getScheme())
                    && endpoint.getPath().startsWith("//./pipe/");
            if (!localUnix && !localPipe) {
                throw new IllegalStateException("Chỉ chạy integration test trên Docker socket local đã xác nhận");
            }
            super.start();
        }
    }.withDatabaseName(DATABASE).withUsername("d03_test").withPassword(PASSWORD)
            .withReuse(false).withLabel("com.smartexpense.test", "d03")
            .withUrlParam("useSSL", "false").withUrlParam("allowPublicKeyRetrieval", "true")
            .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                    new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(3306))));

    @Autowired private DataSource dataSource;
    @Autowired private Environment environment;

    @DynamicPropertySource
    static void isolatedProperties(DynamicPropertyRegistry registry) {
        verifyIsolatedContainer();
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("app.jwt.secret", () -> JWT_KEY);
        registry.add("spring.sql.init.mode", () -> "never");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        registry.add("spring.jpa.properties.jakarta.persistence.schema-generation.database.action", () -> "create");
    }

    private static void verifyIsolatedContainer() {
        // Kiểm tra đích kết nối trước khi Spring/Hibernate có thể khởi tạo DataSource hoặc DDL.
        URI target = URI.create(MYSQL.getJdbcUrl().substring("jdbc:".length()));
        if (!MYSQL.isRunning() || !"mysql".equals(target.getScheme())
                || (!"localhost".equals(target.getHost()) && !"127.0.0.1".equals(target.getHost()))
                || target.getPort() != MYSQL.getMappedPort(3306)
                || target.getPort() == 3306 || !target.getPath().equals("/" + DATABASE)
                || !DATABASE.matches("se_d03_test_[a-f0-9]{32}")
                || !"d03_test".equals(MYSQL.getUsername()) || !PASSWORD.equals(MYSQL.getPassword())) {
            throw new IllegalStateException("Không xác nhận được MySQL test cô lập; dừng trước kết nối");
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class IsolatedDataSource {
        @Bean(destroyMethod = "close")
        HikariDataSource dataSource() {
            // Không bind thuộc tính Hikari từ môi trường; pool chỉ được dùng container đã kiểm tra.
            verifyIsolatedContainer();
            HikariDataSource pool = new HikariDataSource();
            pool.setJdbcUrl(MYSQL.getJdbcUrl());
            pool.setUsername(MYSQL.getUsername());
            pool.setPassword(MYSQL.getPassword());
            pool.setDriverClassName("com.mysql.cj.jdbc.Driver");
            pool.setMaximumPoolSize(2);
            return pool;
        }
    }

    protected void verifyMySqlConnection() throws Exception {
        // Đối chiếu metadata thật trước khi tạo hoặc dọn dữ liệu trong database test.
        try (Connection connection = dataSource.getConnection()) {
            assertThat(connection.getCatalog()).isEqualTo(DATABASE);
            assertThat(connection.getMetaData().getURL()).isEqualTo(MYSQL.getJdbcUrl());
            assertThat(connection.getMetaData().getDatabaseProductName()).isEqualTo("MySQL");
            assertThat(connection.getMetaData().getDatabaseMajorVersion()).isEqualTo(8);
            assertThat(connection.getMetaData().getUserName()).startsWith("d03_test@");
        }
        assertThat(environment.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("none");
        assertThat(environment.getProperty("spring.jpa.properties.jakarta.persistence.schema-generation.database.action"))
                .isEqualTo("create");
    }

    private static String randomJwtKey() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }
}
