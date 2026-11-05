package com.smartexpense.backend;

import com.smartexpense.backend.dto.recurring.RecurringTemplateResponse;
import com.smartexpense.backend.entity.*;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedQueue;

import static org.assertj.core.api.Assertions.*;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Không @Transactional: từng HTTP request phải commit/rollback thật trước SELECT kiểm chứng.
@SpringBootTest(classes = BackendApplication.class, properties = {
        "spring.config.location=optional:classpath:/d08-isolated-test.properties",
        "app.jwt.expiration=600", "spring.sql.init.mode=never", "spring.jpa.generate-ddl=false",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.jakarta.persistence.schema-generation.database.action=none",
        "spring.jpa.open-in-view=false", "spring.jpa.show-sql=false", "logging.level.root=WARN",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=com.smartexpense.backend.RecurringTemplateIntegrationTests$SqlCapture"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import({RecurringTemplateMySqlTestSupport.IsolatedDataSource.class, FixedTransactionClockConfiguration.class})
class RecurringTemplateIntegrationTests extends RecurringTemplateMySqlTestSupport {
    private static final String BASE = "/api/recurring-templates";
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory factory;
    @Autowired Environment environment;
    @Autowired Clock clock;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    private User userA;
    private User userB;
    private Category expenseA;
    private Category otherExpenseA;
    private Category incomeA;
    private Category expenseB;

    @BeforeEach
    void fixtures() {
        verifyTarget();
        assertLegacyRows(jdbc);
        assertThat(environment.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
        assertThat(environment.getProperty("spring.jpa.properties.jakarta.persistence.schema-generation.database.action"))
                .isEqualTo("none");
        userA = owner();
        userB = owner();
        expenseA = category(userA, TransactionType.EXPENSE);
        otherExpenseA = category(userA, TransactionType.EXPENSE);
        incomeA = category(userA, TransactionType.INCOME);
        expenseB = category(userB, TransactionType.EXPENSE);
        Transaction historical = new Transaction();
        historical.setUser(userA);
        historical.setCategory(expenseA);
        historical.setType(TransactionType.EXPENSE);
        historical.setAmount(new BigDecimal("12.34"));
        historical.setTransactionDate(today().minusDays(1));
        historical.setNote("D08 historical transaction");
        transactions.saveAndFlush(historical);
        var period = YearMonth.from(today());
        jdbc.update("INSERT INTO monthly_budgets (user_id,year,month,amount_limit) VALUES (?,?,?,100.00)",
                userA.getId(), period.getYear(), period.getMonthValue());
        jdbc.update("INSERT INTO category_budgets (user_id,category_id,year,month,amount_limit) VALUES (?,?,?,?,50.00)",
                userA.getId(), expenseA.getId(), period.getYear(), period.getMonthValue());
    }

    @AfterEach
    void cleanup() {
        SqlCapture.capture = false;
        SqlCapture.selects.clear();
        verifyTarget();
        if (userA == null || userB == null) return;
        for (String table : List.of("recurring_templates", "category_budgets", "transactions", "monthly_budgets", "categories")) {
            jdbc.update("DELETE FROM " + table + " WHERE user_id IN (?,?)", userA.getId(), userB.getId());
        }
        jdbc.update("DELETE FROM users WHERE id IN (?,?)", userA.getId(), userB.getId());
        assertLegacyRows(jdbc);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_templates", Long.class)).isZero();
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 29, 30, 31})
    void createCommitsExactValuesWithJwtOwnerAndNoTransaction(int day) throws Exception {
        var before = snapshot(jdbc);
        Map<String, Object> input = body(expenseA);
        input.put("dayOfMonth", day);
        input.put("userId", userB.getId()); // Không cho client đổi chủ sở hữu bằng field ngoài DTO.
        var created = create(userA, input);
        assertThat(jdbc.queryForMap("SELECT * FROM recurring_templates WHERE id=?", created.getId()))
                .containsEntry("user_id", userA.getId()).containsEntry("category_id", expenseA.getId())
                .containsEntry("type", "EXPENSE").containsEntry("amount", new BigDecimal("3000000.25"))
                .containsEntry("day_of_month", day).containsEntry("note", "D08 synthetic");
        assertThat(jdbc.queryForObject("SELECT active+0 FROM recurring_templates WHERE id=?", Integer.class, created.getId())).isEqualTo(1);
        assertThat(created.getCategoryName()).isEqualTo(expenseA.getName());
        assertThat(created.getAmount()).isEqualTo(new BigDecimal("3000000.25"));
        assertThat(snapshot(jdbc)).isEqualTo(before);
    }

    @Test
    void detailUpdateAndDeletePreserveOwnerHistoryAndRelatedRows() throws Exception {
        var created = create(userA, body(expenseA));
        var historical = snapshot(jdbc);
        call(userA, HttpMethod.GET, BASE + "/" + created.getId(), null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(created.getId()));
        var update = body(incomeA);
        update.put("amount", new BigDecimal("9999999999999.99"));
        update.put("dayOfMonth", 29);
        update.put("note", "Updated income");
        update.put("active", false);
        update.put("userId", userB.getId());
        call(userA, HttpMethod.PUT, BASE + "/" + created.getId(), update)
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.type").value("INCOME"));
        assertThat(jdbc.queryForMap("SELECT * FROM recurring_templates WHERE id=?", created.getId()))
                .containsEntry("user_id", userA.getId()).containsEntry("category_id", incomeA.getId())
                .containsEntry("type", "INCOME").containsEntry("amount", new BigDecimal("9999999999999.99"))
                .containsEntry("day_of_month", 29).containsEntry("note", "Updated income");
        assertThat(jdbc.queryForObject("SELECT active+0 FROM recurring_templates WHERE id=?", Integer.class, created.getId())).isZero();
        update.put("active", true);
        call(userA, HttpMethod.PUT, BASE + "/" + created.getId(), update)
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(true));
        assertThat(snapshot(jdbc)).isEqualTo(historical);
        call(userA, HttpMethod.DELETE, BASE + "/" + created.getId(), null)
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        error(call(userA, HttpMethod.GET, BASE + "/" + created.getId(), null), 404, "RESOURCE_NOT_FOUND");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_templates WHERE id=?", Long.class, created.getId())).isZero();
        assertThat(snapshot(jdbc)).isEqualTo(historical);
    }

    @ParameterizedTest
    @ValueSource(strings = {"all", "true", "false"})
    void listPaginatesDescendingFiltersOwnerAndLoadsCategoriesWithoutNPlusOne(String active) throws Exception {
        List<Long> filtered = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            var input = body(i % 2 == 0 ? expenseA : otherExpenseA);
            input.put("active", i % 2 == 0);
            long id = create(userA, input).getId();
            if (active.equals("all") || Boolean.parseBoolean(active) == (i % 2 == 0)) filtered.addFirst(id);
        }
        create(userB, body(expenseB));
        String url = BASE + "?size=2" + (active.equals("all") ? "" : "&active=" + active);
        SqlCapture.selects.clear();
        SqlCapture.capture = true;
        String response;
        try {
            response = call(userA, HttpMethod.GET, url, null).andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(filtered.size()))
                    .andExpect(jsonPath("$.content[0].categoryName").isNotEmpty())
                    .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        } finally {
            SqlCapture.capture = false;
        }
        var content = json.readTree(response).get("content");
        assertThat(content.get(0).get("id").asLong()).isEqualTo(filtered.get(0));
        assertThat(content.get(1).get("id").asLong()).isEqualTo(filtered.get(1));
        assertThat(SqlCapture.selects).hasSize(2); // SELECT có JOIN Category + COUNT phân trang.
        assertThat(SqlCapture.selects.stream().filter(sql -> sql.contains(" join categories "))).hasSize(1);
        call(userA, HttpMethod.GET, url + "&page=1", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(filtered.get(2)));
        call(userA, HttpMethod.GET, url + "&page=99", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void bothOwnersCannotAccessEachOthersTemplates(String method) throws Exception {
        var a = create(userA, body(expenseA));
        var b = create(userB, body(expenseB));
        var before = templateRows();
        var history = snapshot(jdbc);
        error(call(userB, HttpMethod.valueOf(method), BASE + "/" + a.getId(), body(expenseB)), 404, "RESOURCE_NOT_FOUND");
        error(call(userA, HttpMethod.valueOf(method), BASE + "/" + b.getId(), body(expenseA)), 404, "RESOURCE_NOT_FOUND");
        assertUnchanged(before, history);
    }

    @ParameterizedTest
    @CsvSource({"GET,false", "DETAIL,false", "POST,false", "PUT,false", "DELETE,false",
            "GET,true", "DETAIL,true", "POST,true", "PUT,true", "DELETE,true"})
    void missingOrInvalidJwtCannotReadOrWrite(String operation, boolean invalid) throws Exception {
        var existing = create(userA, body(expenseA));
        var before = templateRows();
        var history = snapshot(jdbc);
        String method = operation.equals("DETAIL") ? "GET" : operation;
        String url = operation.equals("GET") || operation.equals("POST") ? BASE : BASE + "/" + existing.getId();
        var request = request(HttpMethod.valueOf(method), url).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body(expenseA)));
        if (invalid) request.header(HttpHeaders.AUTHORIZATION, "Bearer invalid.jwt.value");
        error(mvc.perform(request), 401, "UNAUTHORIZED");
        assertUnchanged(before, history);
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "foreign", "type"})
    void unusableCategoryRejectsPostAndPutWithoutChangingDatabase(String kind) throws Exception {
        var existing = create(userA, body(expenseA));
        var before = templateRows();
        var history = snapshot(jdbc);
        var input = body(expenseA);
        input.put("categoryId", kind.equals("foreign") ? expenseB.getId() : kind.equals("type") ? incomeA.getId() : Long.MAX_VALUE);
        int status = kind.equals("type") ? 400 : 404;
        error(call(userA, HttpMethod.POST, BASE, input), status, status == 400 ? "VALIDATION_ERROR" : "RESOURCE_NOT_FOUND");
        error(call(userA, HttpMethod.PUT, BASE + "/" + existing.getId(), input), status, status == 400 ? "VALIDATION_ERROR" : "RESOURCE_NOT_FOUND");
        assertUnchanged(before, history);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "1.9", "abc", "9223372036854775808"})
    void invalidIdsReturn400AndDoNotMutateData(String id) throws Exception {
        var before = templateRows();
        var history = snapshot(jdbc);
        for (HttpMethod method : List.of(HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE)) {
            error(call(userA, method, BASE + "/" + id, body(expenseA)), 400, "VALIDATION_ERROR");
        }
        assertUnchanged(before, history);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void nonexistentTemplateReturns404(String method) throws Exception {
        var history = snapshot(jdbc);
        error(call(userA, HttpMethod.valueOf(method), BASE + "/" + Long.MAX_VALUE, body(expenseA)), 404, "RESOURCE_NOT_FOUND");
        assertUnchanged(List.of(), history);
    }

    @ParameterizedTest
    @CsvSource({"dayOfMonth,0", "dayOfMonth,32", "amount,0", "amount,-1", "amount,10000000000000",
            "amount,0.001", "categoryId,0", "categoryId,-1"})
    void invalidValuesRejectBothWritesWithFieldErrors(String field, String value) throws Exception {
        rejectedBoth(field, value, true);
    }

    @ParameterizedTest
    @CsvSource({"type,1", "type,\"1\"", "type,\"INVALID\"", "dayOfMonth,31.9", "dayOfMonth,31.0",
            "dayOfMonth,\"31\"", "active,1", "active,\"true\"", "categoryId,1.9", "categoryId,\"1\"",
            "categoryId,9223372036854775808", "amount,\"12.34\"", "note,123"})
    void strictJsonRejectsBothWritesWithoutMutation(String field, String raw) throws Exception {
        rejectedBoth(field, raw, false);
    }

    @ParameterizedTest
    @ValueSource(strings = {"categoryId", "type", "amount", "dayOfMonth", "active"})
    void nullOrMissingRequiredFieldsRejectBothWrites(String field) throws Exception {
        var existing = create(userA, body(expenseA));
        var before = templateRows();
        var history = snapshot(jdbc);
        for (boolean missing : List.of(false, true)) {
            var input = body(expenseA);
            if (missing) input.remove(field);
            else input.put(field, null);
            for (HttpMethod method : List.of(HttpMethod.POST, HttpMethod.PUT)) {
                error(call(userA, method, method == HttpMethod.POST ? BASE : BASE + "/" + existing.getId(), input),
                        400, "VALIDATION_ERROR").andExpect(jsonPath("$.errors." + field).isNotEmpty());
            }
        }
        assertUnchanged(before, history);
    }

    @Test
    void noteLengthIsEnforcedButNullAndMaximumLengthAreAllowed() throws Exception {
        rejectedBoth("note", json.writeValueAsString("a".repeat(501)), true);
        var input = body(expenseA);
        input.put("note", "a".repeat(500));
        input.put("active", false);
        var created = create(userA, input);
        assertThat(jdbc.queryForObject("SELECT note FROM recurring_templates WHERE id=?", String.class, created.getId())).hasSize(500);
        input.put("note", null);
        call(userA, HttpMethod.PUT, BASE + "/" + created.getId(), input).andExpect(status().isOk());
        assertThat(jdbc.queryForMap("SELECT note FROM recurring_templates WHERE id=?", created.getId()).get("note")).isNull();
    }

    @ParameterizedTest
    @CsvSource({"page,-1", "size,0", "size,101", "page,2147483647"})
    void invalidPageAndSizeReturn400(String field, String value) throws Exception {
        error(call(userA, HttpMethod.GET, BASE + "?" + field + "=" + value, null), 400, "VALIDATION_ERROR");
    }

    @Test
    void migrationTypesConstraintsAndHibernateValidationMatchRealMysql() throws Exception {
        factory.unwrap(SessionFactory.class).getSchemaManager().validateMappedObjects();
        assertThat(jdbc.queryForList("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'", String.class))
                .containsExactlyInAnyOrder("users", "categories", "transactions", "monthly_budgets", "category_budgets", "recurring_templates");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()", Integer.class)).isEqualTo(8);
        assertThat(jdbc.queryForList("SELECT CONCAT(column_name,':',column_type,':',is_nullable) FROM information_schema.columns "
                + "WHERE table_schema=DATABASE() AND table_name='recurring_templates'", String.class))
                .containsExactlyInAnyOrder("id:bigint:NO", "user_id:bigint:NO", "category_id:bigint:NO",
                        "type:varchar(20):NO", "amount:decimal(15,2):NO", "day_of_month:int:NO", "note:varchar(500):YES", "active:tinyint(1):NO");
        assertThat(jdbc.queryForList("SELECT CONCAT(column_name,'->',referenced_table_name,'.',referenced_column_name) "
                + "FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name='recurring_templates' "
                + "AND referenced_table_name IS NOT NULL", String.class))
                .containsExactlyInAnyOrder("user_id->users.id", "category_id->categories.id");
        assertThat(jdbc.queryForList("SELECT CONCAT(delete_rule,':',update_rule) FROM information_schema.referential_constraints "
                + "WHERE constraint_schema=DATABASE() AND table_name='recurring_templates'", String.class))
                .containsExactly("RESTRICT:RESTRICT", "RESTRICT:RESTRICT");
        assertThat(jdbc.queryForList("SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema=DATABASE() "
                + "AND table_name='recurring_templates' AND constraint_type='CHECK' AND enforced='YES'", String.class))
                .containsExactlyInAnyOrder("chk_recurring_templates_type", "chk_recurring_templates_amount",
                        "chk_recurring_templates_day_of_month", "chk_recurring_templates_active");
        assertThat(jdbc.queryForList("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics "
                + "WHERE table_schema=DATABASE() AND table_name='recurring_templates' GROUP BY index_name", String.class))
                .contains("id", "user_id,active", "category_id");
        insertSql(userA.getId(), otherExpenseA.getId(), "EXPENSE", "0.01", 31, 0);
        for (String sql : List.of("UPDATE recurring_templates SET type='INVALID'",
                "UPDATE recurring_templates SET amount=0", "UPDATE recurring_templates SET day_of_month=32",
                "UPDATE recurring_templates SET active=2")) {
            assertMysqlRejects(sql, 3819); // CHECK: MySQL HY000 không luôn được dịch thành DIVE.
        }
        assertMysqlRejects("UPDATE recurring_templates SET user_id=" + Long.MAX_VALUE, 1452);
        assertMysqlRejects("UPDATE recurring_templates SET category_id=" + Long.MAX_VALUE, 1452);
        assertMysqlRejects("UPDATE recurring_templates SET user_id=NULL", 1048);
        assertMysqlRejects("DELETE FROM categories WHERE id=" + otherExpenseA.getId(), 1451);
        Long id = jdbc.queryForObject("SELECT id FROM recurring_templates", Long.class);
        var read = json.readValue(call(userA, HttpMethod.GET, BASE + "/" + id, null).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8), RecurringTemplateResponse.class);
        assertThat(read.isActive()).isFalse();
        assertThat(read.getType()).isEqualTo(TransactionType.EXPENSE);
        assertThat(read.getAmount()).isEqualByComparingTo("0.01");
    }

    @Test
    void templateDoesNotChangeDashboardBudgetsOrTransactionsAndFutureTransactionStillFails() throws Exception {
        var period = YearMonth.from(today());
        List<String> urls = List.of("/api/dashboard/summary?month=" + period,
                "/api/budgets/" + period.getYear() + "/" + period.getMonthValue(),
                "/api/category-budgets?year=" + period.getYear() + "&month=" + period.getMonthValue(),
                "/api/transactions?month=" + period);
        Map<String, Object> before = new LinkedHashMap<>();
        for (String url : urls) before.put(url, json.readTree(call(userA, HttpMethod.GET, url, null)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)));
        var history = snapshot(jdbc);
        create(userA, body(expenseA)); // Ngày 31 được phép dù hôm nay theo Clock là ngày 15.
        for (String url : urls) {
            assertThat(json.readTree(call(userA, HttpMethod.GET, url, null).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8))).isEqualTo(before.get(url));
        }
        var future = new LinkedHashMap<>(Map.of("categoryId", expenseA.getId(), "type", "EXPENSE",
                "amount", new BigDecimal("1.00"), "transactionDate", today().plusDays(1).toString()));
        error(call(userA, HttpMethod.POST, "/api/transactions", future), 400, "VALIDATION_ERROR")
                .andExpect(jsonPath("$.errors.transactionDate").isNotEmpty());
        Long transaction = jdbc.queryForObject("SELECT id FROM transactions WHERE user_id=?", Long.class, userA.getId());
        error(call(userA, HttpMethod.PUT, "/api/transactions/" + transaction, future), 400, "VALIDATION_ERROR");
        call(userA, HttpMethod.GET, "/api/transactions?startDate=" + today().plusDays(1) + "&endDate=" + today().plusDays(2), null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty());
        assertThat(snapshot(jdbc)).isEqualTo(history);
    }

    private void rejectedBoth(String field, String raw, boolean fieldError) throws Exception {
        var existing = create(userA, body(expenseA));
        var before = templateRows();
        var history = snapshot(jdbc);
        StringJoiner input = new StringJoiner(",", "{", "}");
        for (var entry : body(expenseA).entrySet()) {
            input.add(json.writeValueAsString(entry.getKey()) + ":"
                    + (field.equals(entry.getKey()) ? raw : json.writeValueAsString(entry.getValue())));
        }
        for (HttpMethod method : List.of(HttpMethod.POST, HttpMethod.PUT)) {
            var result = error(call(userA, method, method == HttpMethod.POST ? BASE : BASE + "/" + existing.getId(), input.toString()),
                    400, "VALIDATION_ERROR");
            if (fieldError) result.andExpect(jsonPath("$.errors." + field).isNotEmpty());
        }
        assertUnchanged(before, history);
    }

    private RecurringTemplateResponse create(User owner, Map<String, Object> input) throws Exception {
        var response = call(owner, HttpMethod.POST, BASE, input).andExpect(status().isCreated()).andReturn().getResponse();
        assertThat(json.readTree(response.getContentAsString(StandardCharsets.UTF_8)).size()).isEqualTo(8);
        return json.readValue(response.getContentAsString(StandardCharsets.UTF_8), RecurringTemplateResponse.class);
    }

    private ResultActions call(User owner, HttpMethod method, String url, Object body) throws Exception {
        Instant now = Instant.now();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(owner.getId().toString()).issuedAt(now).expiresAt(now.plusSeconds(600)).build())).getTokenValue();
        var request = request(method, url).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).contentType(MediaType.APPLICATION_JSON);
        if (body != null) request.content(body instanceof String raw ? raw : json.writeValueAsString(body));
        return mvc.perform(request);
    }

    private ResultActions error(ResultActions response, int status, String code) throws Exception {
        return response.andExpect(status().is(status)).andExpect(jsonPath("$.status").value(status))
                .andExpect(jsonPath("$.code").value(code)).andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.trace").doesNotExist()).andExpect(jsonPath("$.exception").doesNotExist())
                .andExpect(content().string(not(containsString("tools.jackson"))));
    }

    private Map<String, Object> body(Category category) {
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("categoryId", category.getId());
        input.put("type", category.getType().name());
        input.put("amount", new BigDecimal("3000000.25"));
        input.put("dayOfMonth", 31);
        input.put("note", "D08 synthetic");
        input.put("active", true);
        return input;
    }

    private void assertUnchanged(List<Map<String, Object>> before, Map<String, List<Map<String, Object>>> history) {
        assertThat(templateRows()).isEqualTo(before);
        assertThat(snapshot(jdbc)).isEqualTo(history);
    }

    private List<Map<String, Object>> templateRows() {
        return jdbc.queryForList("SELECT * FROM recurring_templates ORDER BY id");
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneId.of("Asia/Ho_Chi_Minh")));
    }

    private User owner() {
        User owner = new User();
        owner.setFullName("D08 synthetic owner");
        owner.setEmail(UUID.randomUUID() + "@example.test");
        owner.setPasswordHash(UUID.randomUUID().toString());
        return users.saveAndFlush(owner);
    }

    private Category category(User owner, TransactionType type) {
        Category category = new Category();
        category.setUser(owner);
        category.setName("D08 " + type + " " + UUID.randomUUID());
        category.setType(type);
        return categories.saveAndFlush(category);
    }

    private void insertSql(long user, long category, String type, String amount, int day, int active) {
        jdbc.update("INSERT INTO recurring_templates (user_id,category_id,type,amount,day_of_month,active) VALUES (?,?,?,?,?,?)",
                user, category, type, new BigDecimal(amount), day, active);
    }

    private void assertMysqlRejects(String sql, int vendorCode) {
        var before = templateRows();
        Throwable failure = catchThrowable(() -> jdbc.update(sql));
        assertThat(failure).isInstanceOf(DataAccessException.class);
        SQLException databaseError = null;
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException actual) databaseError = actual;
        }
        assertThat((Throwable) databaseError).isNotNull();
        assertThat(databaseError.getErrorCode()).isEqualTo(vendorCode);
        assertThat(templateRows()).isEqualTo(before);
    }

    public static class SqlCapture implements StatementInspector {
        static volatile boolean capture;
        static final Queue<String> selects = new ConcurrentLinkedQueue<>();

        @Override
        public String inspect(String sql) {
            String normalized = sql.stripLeading().toLowerCase(Locale.ROOT);
            if (capture && normalized.startsWith("select")) selects.add(normalized);
            return sql;
        }
    }
}
