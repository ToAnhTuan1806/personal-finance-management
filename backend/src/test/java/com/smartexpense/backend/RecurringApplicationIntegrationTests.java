package com.smartexpense.backend;

import com.smartexpense.backend.entity.*;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// HTTP thật qua JWT/Service/JPA; không @Transactional ở test để kiểm chứng commit và rollback.
@SpringBootTest(classes = BackendApplication.class, properties = {
        "spring.config.location=optional:classpath:/d09-isolated-test.properties",
        "app.jwt.expiration=600", "spring.sql.init.mode=never", "spring.jpa.generate-ddl=false",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.jakarta.persistence.schema-generation.database.action=none",
        "spring.jpa.open-in-view=false", "spring.jpa.show-sql=false", "logging.level.root=WARN",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=com.smartexpense.backend.RecurringApplicationIntegrationTests$SqlProbe"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(RecurringApplicationMySqlTestSupport.IsolatedDataSource.class)
@Execution(ExecutionMode.SAME_THREAD)
class RecurringApplicationIntegrationTests extends RecurringApplicationMySqlTestSupport {
    private static final String BASE = "/api/recurring-templates/";
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired RecurringTemplateRepository templates;
    @MockitoBean Clock clock;
    private User owner;
    private User other;
    private Category category;
    private RecurringTemplate template;

    @BeforeEach
    void fixtures() {
        verifyTarget();
        assertLegacyRows(jdbc);
        time("2030-06-15T05:00:00Z");
        owner = user();
        other = user();
        category = category(owner);
        template = new RecurringTemplate();
        template.setUser(owner);
        template.setCategory(category);
        template.setType(TransactionType.EXPENSE);
        template.setAmount(new BigDecimal("3000000.25"));
        template.setDayOfMonth(31);
        template.setNote("D09 synthetic");
        template.setActive(true);
        template = templates.saveAndFlush(template);
    }

    @AfterEach
    void cleanup() {
        SqlProbe.barrier = null;
        SqlProbe.failMarker = false;
        SqlProbe.capture = false;
        SqlProbe.writes.clear();
        verifyTarget();
        if (owner == null || other == null) return;
        jdbc.update("DELETE FROM recurring_applications WHERE template_id IN (SELECT id FROM recurring_templates WHERE user_id IN (?,?))",
                owner.getId(), other.getId());
        for (String table : List.of("recurring_templates", "transactions", "categories")) {
            jdbc.update("DELETE FROM " + table + " WHERE user_id IN (?,?)", owner.getId(), other.getId());
        }
        jdbc.update("DELETE FROM users WHERE id IN (?,?)", owner.getId(), other.getId());
        assertLegacyRows(jdbc);
    }

    @ParameterizedTest
    @CsvSource({"2027,1,31,2027-01-31", "2027,4,31,2027-04-30", "2027,2,31,2027-02-28",
            "2028,2,31,2028-02-29", "2027,2,29,2027-02-28", "1970,1,1,1970-01-01"})
    void previewIsReadOnlyAndApplyCommitsResolvedDate(int year, int month, int day, String expected) throws Exception {
        template.setDayOfMonth(day);
        templates.saveAndFlush(template);
        var before = allRows();
        SqlProbe.capture = true;
        call(owner, HttpMethod.GET, preview(year, month), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.transactionDate").value(expected))
                .andExpect(jsonPath("$.categoryId").value(category.getId()))
                .andExpect(jsonPath("$.alreadyApplied").value(false))
                .andExpect(jsonPath("$.canApply").value(true)).andExpect(jsonPath("$.reasonCode").isEmpty());
        assertThat(SqlProbe.writes).isEmpty();
        assertThat(allRows()).isEqualTo(before);
        SqlProbe.capture = false;
        var result = apply(owner, year, month).andExpect(status().isCreated())
                .andExpect(jsonPath("$.templateId").value(template.getId()))
                .andExpect(jsonPath("$.year").value(year)).andExpect(jsonPath("$.month").value(month))
                .andExpect(jsonPath("$.transaction.transactionDate").value(expected))
                .andExpect(jsonPath("$.transaction.type").value("EXPENSE"))
                .andExpect(jsonPath("$.transaction.amount").value(3000000.25))
                .andExpect(jsonPath("$.transaction.note").value("D09 synthetic")).andReturn();
        var response = json.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(response.size()).isEqualTo(6);
        long transactionId = response.get("transactionId").asLong();
        assertThat(response.get("transaction").get("id").asLong()).isEqualTo(transactionId);
        assertThat(jdbc.queryForMap("SELECT user_id,category_id,amount,transaction_date FROM transactions WHERE id=?", transactionId))
                .containsEntry("user_id", owner.getId()).containsEntry("category_id", category.getId())
                .containsEntry("amount", new BigDecimal("3000000.25"))
                .containsEntry("transaction_date", java.sql.Date.valueOf(expected));
        assertThat(jdbc.queryForObject("SELECT transaction_id FROM recurring_applications WHERE id=?", Long.class,
                response.get("id").asLong())).isEqualTo(transactionId);
    }

    @Test
    void duplicateAndDeletedTransactionRetainReservationAndProtectTemplate() throws Exception {
        var created = apply(owner, 2026, 11).andExpect(status().isCreated()).andReturn();
        long transactionId = json.readTree(created.getResponse().getContentAsString()).get("transactionId").asLong();
        error(call(owner, HttpMethod.DELETE, BASE + template.getId(), null), 409, "CONFLICT")
                .andExpect(jsonPath("$.message").value("TEMPLATE_IN_USE"));
        // Inactive không được che ALREADY_APPLIED, kể cả sau khi giao dịch nguồn đã xóa.
        jdbc.update("UPDATE recurring_templates SET active=false WHERE id=?", template.getId());
        call(owner, HttpMethod.DELETE, "/api/transactions/" + transactionId, null).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_applications WHERE template_id=? AND transaction_id IS NULL",
                Long.class, template.getId())).isEqualTo(1);
        var before = allRows();
        call(owner, HttpMethod.GET, preview(2026, 11), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.alreadyApplied").value(true)).andExpect(jsonPath("$.canApply").value(false))
                .andExpect(jsonPath("$.reasonCode").value("ALREADY_APPLIED"));
        error(apply(owner, 2026, 11), 409, "CONFLICT").andExpect(jsonPath("$.message").value("ALREADY_APPLIED"));
        error(call(owner, HttpMethod.DELETE, BASE + template.getId(), null), 409, "CONFLICT");
        assertThat(allRows()).isEqualTo(before);
    }

    @Test
    void inactivePrecedesFutureDateAndAlreadyAppliedPrecedesBoth() throws Exception {
        jdbc.update("UPDATE recurring_templates SET active=false WHERE id=?", template.getId());
        var before = allRows();
        call(owner, HttpMethod.GET, preview(2031, 1), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.reasonCode").value("TEMPLATE_INACTIVE"));
        error(apply(owner, 2031, 1), 409, "CONFLICT");
        assertThat(allRows()).isEqualTo(before);
        jdbc.update("INSERT INTO recurring_applications (template_id,year,month) VALUES (?,2031,1)", template.getId());
        call(owner, HttpMethod.GET, preview(2031, 1), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.reasonCode").value("ALREADY_APPLIED"));
    }

    @ParameterizedTest
    @CsvSource({"2030-06-14T16:59:59Z,400", "2030-06-14T17:00:00Z,201", "2030-06-15T16:59:59Z,201"})
    void vietnamMidnightOverridesClockZone(String instant, int status) throws Exception {
        time(instant); // Clock gốc mang timezone America/Los_Angeles, khác Việt Nam.
        jdbc.update("UPDATE recurring_templates SET day_of_month=15 WHERE id=?", template.getId());
        var before = allRows();
        call(owner, HttpMethod.GET, preview(2030, 6), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.canApply").value(status == 201))
                .andExpect(jsonPath("$.reasonCode").value(status == 201 ? null : "FUTURE_DATE"));
        if (status == 400) {
            error(apply(owner, 2030, 6), 400, "VALIDATION_ERROR")
                    .andExpect(jsonPath("$.message").value("Ngày giao dịch không được lớn hơn ngày hiện tại."));
            assertThat(allRows()).isEqualTo(before);
        } else apply(owner, 2030, 6).andExpect(status().isCreated());
    }

    @Test
    void ownerAndJwtProtectBothEndpoints() throws Exception {
        var before = allRows();
        error(call(other, HttpMethod.GET, preview(2026, 11), null), 404, "RESOURCE_NOT_FOUND");
        error(apply(other, 2026, 11), 404, "RESOURCE_NOT_FOUND");
        error(call(null, HttpMethod.GET, preview(2026, 11), null), 401, "UNAUTHORIZED");
        error(apply(null, 2026, 11), 401, "UNAUTHORIZED");
        error(call(owner, HttpMethod.GET, BASE + Long.MAX_VALUE + "/preview?year=2026&month=11", null), 404, "RESOURCE_NOT_FOUND");
        error(call(owner, HttpMethod.POST, BASE + Long.MAX_VALUE + "/apply", Map.of("year", 2026, "month", 11)), 404, "RESOURCE_NOT_FOUND");
        assertThat(allRows()).isEqualTo(before);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void categoryOwnerAndTypeAreRechecked(boolean wrongOwner) throws Exception {
        if (wrongOwner) {
            var foreign = category(other);
            jdbc.update("UPDATE recurring_templates SET category_id=? WHERE id=?", foreign.getId(), template.getId());
        } else jdbc.update("UPDATE categories SET type='INCOME' WHERE id=?", category.getId());
        var before = allRows();
        int status = wrongOwner ? 404 : 400;
        String code = wrongOwner ? "RESOURCE_NOT_FOUND" : "VALIDATION_ERROR";
        error(call(owner, HttpMethod.GET, preview(2026, 11), null), status, code);
        error(apply(owner, 2026, 11), status, code);
        assertThat(allRows()).isEqualTo(before);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"year\":null,\"month\":11}", "{\"year\":2026}",
            "{\"year\":1899,\"month\":11}", "{\"year\":2101,\"month\":11}",
            "{\"year\":2026,\"month\":0}", "{\"year\":2026,\"month\":13}",
            "{\"year\":2026.0,\"month\":11}", "{\"year\":2026,\"month\":\"11\"}"})
    void invalidApplyInputDoesNotWrite(String body) throws Exception {
        var before = allRows();
        error(call(owner, HttpMethod.POST, BASE + template.getId() + "/apply", body), 400, "VALIDATION_ERROR");
        assertThat(allRows()).isEqualTo(before);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "?year=2026", "?year=1899&month=11", "?year=2101&month=11",
            "?year=2026&month=0", "?year=2026&month=13", "?year=2026&month=11.5"})
    void invalidPreviewPeriodDoesNotWrite(String query) throws Exception {
        var before = allRows();
        error(call(owner, HttpMethod.GET, BASE + template.getId() + "/preview" + query, null), 400, "VALIDATION_ERROR");
        assertThat(allRows()).isEqualTo(before);
    }

    @Test
    void modifyingTemplateLeavesPreviouslyCreatedTransactionUnchanged() throws Exception {
        apply(owner, 2026, 11).andExpect(status().isCreated());
        var history = jdbc.queryForList("SELECT * FROM transactions ORDER BY id");
        call(owner, HttpMethod.PUT, BASE + template.getId(), Map.of("categoryId", category.getId(), "type", "EXPENSE",
                "amount", new BigDecimal("123.45"), "dayOfMonth", 1, "active", true, "note", "changed"))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForList("SELECT * FROM transactions ORDER BY id")).isEqualTo(history);
        apply(owner, 2026, 12).andExpect(status().isCreated()).andExpect(jsonPath("$.transaction.amount").value(123.45))
                .andExpect(jsonPath("$.transaction.transactionDate").value("2026-12-01"));
    }

    @Test
    void incomeKeepsExactMaximumDecimalAndNullNote() throws Exception {
        jdbc.update("UPDATE categories SET type='INCOME' WHERE id=?", category.getId());
        jdbc.update("UPDATE recurring_templates SET type='INCOME',amount=9999999999999.99,note=NULL WHERE id=?", template.getId());
        var result = apply(owner, 2026, 11).andExpect(status().isCreated())
                .andExpect(jsonPath("$.transaction.type").value("INCOME"))
                .andExpect(jsonPath("$.transaction.note").isEmpty()).andReturn();
        long transactionId = json.readTree(result.getResponse().getContentAsString()).get("transactionId").asLong();
        assertThat(jdbc.queryForObject("SELECT amount FROM transactions WHERE id=?", BigDecimal.class, transactionId))
                .isEqualTo(new BigDecimal("9999999999999.99"));
    }

    @Test
    void unusedTemplateCanStillBeDeleted() throws Exception {
        var history = jdbc.queryForList("SELECT * FROM transactions ORDER BY id");
        call(owner, HttpMethod.DELETE, BASE + template.getId(), null).andExpect(status().isNoContent());
        assertThat(jdbc.queryForList("SELECT * FROM transactions ORDER BY id")).isEqualTo(history);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_templates WHERE id=?", Long.class,
                template.getId())).isZero();
    }

    @Test
    void schemaAssertionsRejectMissingV005Check() throws Exception {
        try (var connection = jdbc.getDataSource().getConnection()) {
            ApplicationSchemaAssertions.assertSchema(connection, true, true, true, true);
            jdbc.execute("ALTER TABLE recurring_applications DROP CHECK chk_recurring_applications_month");
            try {
                org.assertj.core.api.Assertions.assertThatThrownBy(
                                () -> ApplicationSchemaAssertions.assertSchema(connection, true, true, true, true))
                        .isInstanceOf(AssertionError.class).hasMessageContaining("chk_recurring_applications_month");
            } finally {
                jdbc.execute("ALTER TABLE recurring_applications ADD CONSTRAINT chk_recurring_applications_month CHECK (month BETWEEN 1 AND 12)");
            }
            ApplicationSchemaAssertions.assertSchema(connection, true, true, true, true);
        }
    }

    @Test
    void failureAfterTransactionInsertRollsBackBothRows() throws Exception {
        var before = allRows();
        SqlProbe.failMarker = true;
        try {
            error(apply(owner, 2026, 11), 500, "INTERNAL_ERROR");
        } finally {
            SqlProbe.failMarker = false;
        }
        assertThat(allRows()).isEqualTo(before);
    }

    @ParameterizedTest
    @CsvSource({"transaction_id,9223372036854775807,1452", "month,13,3819", "template_id,NULL,1048"})
    void nonDuplicateDatabaseFailuresAreInternalErrorsAndRollback(String column, String value, int mysqlCode) throws Exception {
        var before = allRows();
        // Fault injection chỉ trong DB container: không sửa migration, FK/CHECK vẫn được MySQL thực thi.
        jdbc.execute("CREATE TRIGGER d09_test_marker_fault BEFORE INSERT ON recurring_applications "
                + "FOR EACH ROW SET NEW." + column + "=" + value);
        MvcResult result;
        try {
            result = error(apply(owner, 2026, 11), 500, "INTERNAL_ERROR").andReturn();
        } finally {
            jdbc.execute("DROP TRIGGER d09_test_marker_fault");
        }
        assertThat(databaseCause(result).getErrorCode()).isEqualTo(mysqlCode);
        assertThat(result.getResponse().getContentAsString()).doesNotContain(
                "recurring_applications", "foreign key", "constraint", "SQLException", "d09_test_marker_fault");
        assertThat(allRows()).isEqualTo(before);
    }

    @RepeatedTest(10)
    void concurrentRequestsReachUniqueConstraintAndLosingTransactionRollsBack() throws Exception {
        long before = jdbc.queryForObject("SELECT COUNT(*) FROM transactions", Long.class);
        // Barrier ở SQL INSERT marker, sau khi CẢ HAI request đã vượt precheck và INSERT transaction thật.
        SqlProbe.barrier = new CyclicBarrier(2);
        List<MvcResult> results;
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> apply(owner, 2026, 11).andReturn());
            var second = executor.submit(() -> apply(owner, 2026, 11).andReturn());
            results = List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));
        } finally {
            SqlProbe.barrier = null;
        }
        assertThat(results).extracting(r -> r.getResponse().getStatus()).containsExactlyInAnyOrder(201, 409);
        var loser = results.stream().filter(r -> r.getResponse().getStatus() == 409).findFirst().orElseThrow();
        assertThat(json.readTree(loser.getResponse().getContentAsString()).get("code").asString()).isEqualTo("CONFLICT");
        SQLException duplicate = databaseCause(loser);
        assertThat(duplicate.getErrorCode()).isEqualTo(1062);
        assertThat(duplicate.getSQLState()).isEqualTo("23000");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM transactions", Long.class)).isEqualTo(before + 1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_applications WHERE template_id=?", Long.class,
                template.getId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_applications a JOIN transactions t ON t.id=a.transaction_id "
                + "WHERE a.template_id=? AND t.user_id=?", Long.class, template.getId(), owner.getId())).isEqualTo(1);
    }

    private SQLException databaseCause(MvcResult result) {
        SQLException databaseError = null;
        for (Throwable cause = result.getResolvedException(); cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) databaseError = sql;
        }
        assertThat((Throwable) databaseError).isNotNull();
        return databaseError;
    }

    private ResultActions apply(User user, int year, int month) throws Exception {
        return call(user, HttpMethod.POST, BASE + template.getId() + "/apply", Map.of("year", year, "month", month));
    }

    private String preview(int year, int month) {
        return BASE + template.getId() + "/preview?year=" + year + "&month=" + month;
    }

    private ResultActions call(User user, HttpMethod method, String url, Object body) throws Exception {
        var input = request(method, url).contentType(MediaType.APPLICATION_JSON);
        if (user != null) {
            Instant now = Instant.now();
            var token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                    JwtClaimsSet.builder().subject(user.getId().toString()).issuedAt(now).expiresAt(now.plusSeconds(600)).build()));
            input.header(HttpHeaders.AUTHORIZATION, "Bearer " + token.getTokenValue());
        }
        if (body != null) input.content(body instanceof String raw ? raw : json.writeValueAsString(body));
        return mvc.perform(input);
    }

    private ResultActions error(ResultActions result, int status, String code) throws Exception {
        return result.andExpect(status().is(status)).andExpect(jsonPath("$.status").value(status))
                .andExpect(jsonPath("$.code").value(code)).andExpect(jsonPath("$.trace").doesNotExist())
                .andExpect(jsonPath("$.exception").doesNotExist());
    }

    private Map<String, List<Map<String, Object>>> allRows() {
        var rows = snapshot(jdbc);
        rows.put("recurring_applications", jdbc.queryForList("SELECT * FROM recurring_applications ORDER BY id"));
        return rows;
    }

    private void time(String instant) {
        Clock source = Clock.fixed(Instant.parse(instant), ZoneId.of("America/Los_Angeles"));
        when(clock.withZone(any(ZoneId.class))).thenAnswer(call -> source.withZone(call.getArgument(0)));
    }

    private User user() {
        var user = new User();
        user.setFullName("D09 synthetic owner");
        user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash(UUID.randomUUID().toString());
        return users.saveAndFlush(user);
    }

    private Category category(User user) {
        var category = new Category();
        category.setUser(user);
        category.setName("D09 synthetic " + UUID.randomUUID());
        category.setType(TransactionType.EXPENSE);
        return categories.saveAndFlush(category);
    }

    public static class SqlProbe implements StatementInspector {
        static volatile CyclicBarrier barrier;
        static volatile boolean failMarker;
        static volatile boolean capture;
        static final Queue<String> writes = new ConcurrentLinkedQueue<>();

        @Override
        public String inspect(String sql) {
            String normalized = sql.stripLeading().toLowerCase(Locale.ROOT);
            if (capture && (normalized.startsWith("insert") || normalized.startsWith("update") || normalized.startsWith("delete"))) {
                writes.add(normalized);
            }
            if (normalized.startsWith("insert into recurring_applications")) {
                if (failMarker) throw new IllegalStateException("D09 test fault before marker write");
                var gate = barrier;
                if (gate != null) {
                    try {
                        gate.await(10, TimeUnit.SECONDS);
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException("D09 concurrency test interrupted", exception);
                    } catch (BrokenBarrierException | TimeoutException exception) {
                        throw new IllegalStateException("D09 requests did not both reach marker INSERT", exception);
                    }
                }
            }
            return sql;
        }
    }
}
