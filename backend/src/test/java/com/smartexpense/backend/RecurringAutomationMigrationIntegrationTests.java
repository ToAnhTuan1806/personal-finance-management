package com.smartexpense.backend;

import com.github.dockerjava.api.model.*;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptException;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

// SQL thật, MySQL tạm; không khởi động ứng dụng hoặc đọc thông tin đăng nhập VPS.
@Testcontainers
class RecurringAutomationMigrationIntegrationTests {
    private static final String DATABASE="se_v007_"+UUID.randomUUID().toString().replace("-","");
    @Container static final MySQLContainer MYSQL=new MySQLContainer("mysql:8.0") {
        @Override public void start() {
            URI endpoint= DockerClientFactory.instance().getTransportConfig().getDockerHost();
            if (!("unix".equals(endpoint.getScheme()) && endpoint.getHost()==null)
                    && !("npipe".equals(endpoint.getScheme()) && endpoint.getPath().startsWith("//./pipe/")))
                throw new IllegalStateException("Requires local Docker socket");
            super.start();
        }
    }.withDatabaseName(DATABASE).withUsername("v007_test").withPassword(UUID.randomUUID().toString())
            .withReuse(false).withUrlParam("useSSL","false").withUrlParam("allowPublicKeyRetrieval","true")
            .withCreateContainerCmdModifier(cmd -> cmd.getHostConfig().withPortBindings(
                    new PortBinding(Ports.Binding.bindIp("127.0.0.1"),new ExposedPort(3306))));

    @Test void v007AddsOnlyNullableScheduleAndIndexWithoutRewritingLedgerOrMarkers() throws Exception {
        URI target=URI.create(MYSQL.getJdbcUrl().substring(5));
        assertThat(target.getHost()).isIn("localhost","127.0.0.1");
        assertThat(target.getPort()).isEqualTo(MYSQL.getMappedPort(3306)).isNotEqualTo(3306);
        assertThat(target.getPath()).isEqualTo("/"+DATABASE);
        try(Connection c=DriverManager.getConnection(MYSQL.getJdbcUrl(),MYSQL.getUsername(),MYSQL.getPassword())) {
            assertThat(c.getCatalog()).isEqualTo(DATABASE);
            ScriptUtils.executeSqlScript(c,new EncodedResource(new ClassPathResource("d06-legacy-schema.sql"),StandardCharsets.UTF_8));
            for(String name:List.of("V002__category_icon_color.sql","V003__create_category_budgets.sql",
                    "V004__create_recurring_templates.sql","V005__create_recurring_applications.sql",
                    "V006__create_password_reset_tokens.sql")) apply(c,name);
            try(var s=c.createStatement()) {
                s.executeUpdate("INSERT INTO users(id,full_name,email,password_hash,created_at) VALUES(1,'Fixture','v007@example.test','unused','2026-11-01 00:00:00')");
                s.executeUpdate("INSERT INTO categories(id,user_id,name,type,created_at) VALUES(2,1,'Fixture','EXPENSE','2026-11-01 00:00:00')");
                s.executeUpdate("INSERT INTO transactions(id,user_id,category_id,type,amount,transaction_date,created_at) VALUES(3,1,2,'EXPENSE',123456.78,'2026-11-02','2026-11-02 00:00:00')");
                s.executeUpdate("INSERT INTO recurring_templates(id,user_id,category_id,type,amount,day_of_month,note,active) VALUES(4,1,2,'EXPENSE',123456.78,2,'Keep original',1),(5,1,2,'EXPENSE',99.99,31,NULL,0)");
                s.executeUpdate("INSERT INTO recurring_applications(id,template_id,year,month,transaction_id) VALUES(6,4,2026,11,3)");
            }
            var before=snapshot(c);
            apply(c,"V007__recurring_automation_schedule.sql");
            assertThat(snapshot(c)).isEqualTo(before);
            assertThat(rows(c,"SELECT CONCAT(is_nullable,':',COALESCE(column_default,'NULL')) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='recurring_templates' AND column_name='next_run_date'"))
                    .containsExactly(List.of("YES:NULL"));
            assertThat(rows(c,"SELECT COUNT(*) FROM recurring_templates WHERE next_run_date IS NULL")).containsExactly(List.of("2"));
            assertThat(rows(c,"SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='recurring_templates' AND index_name='idx_recurring_templates_active_next_run' GROUP BY index_name"))
                    .containsExactly(List.of("active,next_run_date,id"));
            try(var s=c.createStatement()) {
                assertThatThrownBy(() -> s.executeUpdate("INSERT INTO recurring_applications(template_id,year,month,transaction_id) VALUES(4,2026,11,NULL)"))
                        .isInstanceOfSatisfying(SQLException.class,e -> {assertThat(e.getErrorCode()).isEqualTo(1062); assertThat(e.getSQLState()).isEqualTo("23000");});
            }
            // Migration chạy một lần; lần lặp thất bại mà không thay đổi dữ liệu tài chính.
            assertThatThrownBy(() -> apply(c,"V007__recurring_automation_schedule.sql")).isInstanceOf(ScriptException.class);
            assertThat(snapshot(c)).isEqualTo(before);
        }
    }
    private static void apply(Connection c,String name) {
        Path p=Path.of("../database/migrations",name).toAbsolutePath().normalize();
        assertThat(Files.isRegularFile(p)).as("Requires original SQL: %s",p).isTrue();
        ScriptUtils.executeSqlScript(c,new EncodedResource(new FileSystemResource(p),StandardCharsets.UTF_8));
    }
    private static Map<String,List<List<String>>> snapshot(Connection c) throws SQLException {
        Map<String,List<List<String>>> data=new TreeMap<>();
        for(String table:List.of("users","categories","transactions","monthly_budgets","category_budgets","recurring_applications","password_reset_tokens"))
            data.put(table,rows(c,"SELECT * FROM "+table+" ORDER BY id"));
        data.put("recurring_templates",rows(c,"SELECT id,user_id,category_id,type,amount,day_of_month,note,active FROM recurring_templates ORDER BY id"));
        return data;
    }
    private static List<List<String>> rows(Connection c,String sql) throws SQLException {
        List<List<String>> data=new ArrayList<>();
        try(var s=c.createStatement();var r=s.executeQuery(sql)) {
            while(r.next()) { List<String> row=new ArrayList<>(); for(int i=1;i<=r.getMetaData().getColumnCount();i++) row.add(r.getString(i)); data.add(row); }
        } return data;
    }
}
