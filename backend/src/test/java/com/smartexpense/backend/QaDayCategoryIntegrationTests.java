package com.smartexpense.backend;

import com.smartexpense.backend.dto.auth.*;
import com.smartexpense.backend.dto.category.*;
import com.smartexpense.backend.dto.calendar.CalendarMonthResponse;
import com.smartexpense.backend.dto.transaction.TransactionResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.service.CategoryService;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

// QA D05–D06 đi qua HTTP thật, dùng guard/container/DataSource cô lập sẵn có của D03.
@SpringBootTest(classes = BackendApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.config.location=classpath:/application-d03-test.properties", "server.address=127.0.0.1"})
@ActiveProfiles("d03-test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import({MySqlIntegrationTestSupport.IsolatedDataSource.class, FixedTransactionClockConfiguration.class})
class QaDayCategoryIntegrationTests extends MySqlIntegrationTestSupport {
    @Autowired Environment environment;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtEncoder encoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired MonthlyBudgetRepository budgets;
    @Autowired EntityManagerFactory entityManagerFactory;
    @MockitoSpyBean CategoryService categoryService;
    private HttpClient http;
    private String base, password, tokenA, tokenB;
    private UserResponse a, b;
    private Category incomeA, expenseA, expenseB;

    @BeforeEach
    void setup() throws Exception {
        verifyMySqlConnection();
        assertThat(users.count()).isZero();
        int port = environment.getRequiredProperty("local.server.port", Integer.class);
        assertThat(port).isPositive().isNotEqualTo(8080);
        base = "http://127.0.0.1:" + port;
        http = HttpClient.newBuilder().proxy(new ProxySelector() {
            @Override public List<Proxy> select(URI uri) { return List.of(Proxy.NO_PROXY); }
            @Override public void connectFailed(URI uri, SocketAddress address, IOException error) { }
        }).connectTimeout(Duration.ofSeconds(3)).build();
        password = UUID.randomUUID().toString();
        a = register("qa56-a-" + UUID.randomUUID() + "@example.test");
        b = register("qa56-b-" + UUID.randomUUID() + "@example.test");
        tokenA = login(a);
        tokenB = login(b);
        incomeA = categories.findByUserIdAndType(a.getId(), TransactionType.INCOME).getFirst();
        expenseA = categories.findByUserIdAndType(a.getId(), TransactionType.EXPENSE).getFirst();
        expenseB = categories.findByUserIdAndType(b.getId(), TransactionType.EXPENSE).getFirst();
    }

    @AfterEach
    void cleanup() throws Exception {
        if (http != null) http.close();
        verifyMySqlConnection();
        transactions.deleteAllInBatch(); budgets.deleteAllInBatch(); categories.deleteAllInBatch(); users.deleteAllInBatch();
        assertThat(List.of(users.count(), categories.count(), transactions.count(), budgets.count())).containsExactly(0L, 0L, 0L, 0L);
    }

    @ParameterizedTest
    @ValueSource(strings = {"2026-02-28", "2028-02-29", "2026-04-30", "2026-10-31", "2026-12-31", "2027-01-01"})
    void exactDayEmptySingleAndBoundariesMatchSql(String date) throws Exception {
        assertPage(day(date, 0, 10), 0, 10, 0, 0);
        var saved = transaction(tokenA, incomeA, "1.23", date);
        transaction(tokenB, expenseB, "999.99", date);
        transaction(tokenA, expenseA, "7.77", LocalDate.parse(date).minusDays(1).toString());
        transaction(tokenA, expenseA, "8.88", LocalDate.parse(date).plusDays(1).toString());
        var page = day(date, 0, 10);
        assertPage(page, 0, 10, 1, 1);
        assertThat(((Number) rows(page).getFirst().get("id")).longValue()).isEqualTo(saved.getId());
        assertThat(rows(page).getFirst().get("transactionDate")).isEqualTo(date);
        assertDayAgainstSql(date);
        assertNoOrphans();
    }

    @Test
    void dayPagingHasExactMetadataStableIdsAndNoForeignRows() throws Exception {
        for (int index = 0; index < 27; index++) transaction(tokenA, expenseA, "0.01", "2028-02-29");
        transaction(tokenB, expenseB, "999", "2028-02-29");
        transaction(tokenA, expenseA, "1", "2028-03-01");
        List<Long> ids = new ArrayList<>();
        for (int index = 0; index < 3; index++) {
            var page = day("2028-02-29", index, 10);
            assertPage(page, index, 10, 27, 3);
            assertThat(rows(page)).hasSize(index == 2 ? 7 : 10);
            rows(page).forEach(row -> ids.add(((Number) row.get("id")).longValue()));
        }
        assertThat(ids).hasSize(27).doesNotHaveDuplicates();
        assertThat(ids).isEqualTo(jdbc.queryForList("SELECT id FROM transactions WHERE user_id=? AND transaction_date=? ORDER BY transaction_date DESC,id DESC", Long.class, a.getId(), "2028-02-29"));
        assertPage(day("2028-02-29", 0, 5), 0, 5, 27, 6);
        assertThat(rows(day("2028-02-29", 0, 100))).hasSize(27);
        assertThat(rows(day("2028-02-29", 3, 10))).isEmpty();
        var foreign = dto(call("GET", "/api/transactions?startDate=2028-02-29&endDate=2028-02-29&userId=" + a.getId(), tokenB, null), 200, Map.class);
        assertThat(((Number) foreign.get("totalElements")).intValue()).isEqualTo(1);
        assertDayAgainstSql("2028-02-29");
    }

    @Test
    void selectedDayCreateUpdateDeleteRefreshesCalendarAndShrinksLastPage() throws Exception {
        List<Long> ids = new ArrayList<>();
        for (int index = 0; index < 11; index++) ids.add(transaction(tokenA, expenseA, "1.01", "2026-10-31").getId());
        transaction(tokenA, incomeA, "0.10", "2026-10-31");
        transaction(tokenA, incomeA, "0.20", "2026-10-31");
        assertDayAgainstSql("2026-10-31");
        for (int index = 0; index < 3; index++) assertThat(call("DELETE", "/api/transactions/" + ids.get(index), tokenA, null).statusCode()).isEqualTo(204);
        assertThat(((Number) day("2026-10-31", 1, 10).get("totalElements")).intValue()).isEqualTo(10);
        assertThat(rows(day("2026-10-31", 1, 10))).isEmpty();
        var moved = transactionBody(expenseA, "2.34", "2026-11-01");
        dto(call("PUT", "/api/transactions/" + ids.get(3), tokenA, moved), 200, TransactionResponse.class);
        assertDayAgainstSql("2026-10-31");
        assertDayAgainstSql("2026-11-01");
        assertThat(jdbc.queryForObject("SELECT amount FROM transactions WHERE id=?", BigDecimal.class, ids.get(3))).isEqualByComparingTo("2.34");
    }

    @Test
    void invalidDayQueryPagingAndJwtFailOverHttp() throws Exception {
        for (String query : List.of("startDate=2026-02-30&endDate=2026-02-30", "startDate=2028-02-29", "startDate=2028-02-29&endDate=2028-02-28", "page=-1", "size=0", "size=101", "page=2147483647&size=100"))
            error(call("GET", "/api/transactions?" + query, tokenA, null), 400, "VALIDATION_ERROR");
        String path = "/api/transactions?startDate=2028-02-29&endDate=2028-02-29";
        error(call("GET", path, null, null), 401, "UNAUTHORIZED");
        error(call("GET", path, "not-a-jwt", null), 401, "UNAUTHORIZED");
        var claims = JwtClaimsSet.builder().subject(a.getId().toString()).issuedAt(Instant.now().minusSeconds(7200)).expiresAt(Instant.now().minusSeconds(3600)).build();
        String expired = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        error(call("GET", path, expired, null), 401, "UNAUTHORIZED");
    }

    @Test
    void allTwentyIconsAndPostDefaultsArePersistedOverHttp() throws Exception {
        String[] icons = CategoryAppearance.ICON_PATTERN.split("\\|");
        assertThat(icons).hasSize(20).doesNotHaveDuplicates();
        for (String icon : icons) {
            var input = categoryBody("QA_" + icon, "EXPENSE"); input.put("icon", icon); input.put("color", "#a1B2c3");
            var saved = category(input);
            assertThat(saved.getIcon()).isEqualTo(icon);
            assertThat(saved.getColor()).isEqualTo("#A1B2C3");
            assertThat(jdbc.queryForMap("SELECT icon,color FROM categories WHERE id=?", saved.getId())).containsEntry("icon", icon).containsEntry("color", "#A1B2C3");
        }
        var colorOnly = categoryBody("QA_COLOR", "INCOME"); colorOnly.put("color", "#123abc");
        assertThat(category(colorOnly).getIcon()).isEqualTo("tag");
        var iconOnly = categoryBody("QA_ICON", "INCOME"); iconOnly.put("icon", "gift");
        assertThat(category(iconOnly).getColor()).isEqualTo("#64748B");
        var missing = category(categoryBody("QA_MISSING", "EXPENSE"));
        assertThat(missing.getIcon()).isEqualTo("tag"); assertThat(missing.getColor()).isEqualTo("#64748B");
        var nulls = categoryBody("QA_NULL", "EXPENSE"); nulls.put("icon", null); nulls.put("color", null);
        assertThat(category(nulls).getColor()).isEqualTo("#64748B");
    }

    @Test
    void putOmittedPartialAndNullFieldsHaveDistinctDatabaseEffects() throws Exception {
        var input = categoryBody("QA_METADATA", "EXPENSE"); input.put("icon", "gift"); input.put("color", "#123456");
        var saved = category(input);
        var rename = categoryBody("QA_RENAME", "INCOME");
        saved = updateCategory(saved.getId(), rename);
        assertThat(saved.getIcon()).isEqualTo("gift"); assertThat(saved.getColor()).isEqualTo("#123456");
        rename.put("icon", "clock"); saved = updateCategory(saved.getId(), rename);
        assertThat(saved.getIcon()).isEqualTo("clock"); assertThat(saved.getColor()).isEqualTo("#123456");
        rename.remove("icon"); rename.put("color", "#aabbcc"); saved = updateCategory(saved.getId(), rename);
        assertThat(saved.getIcon()).isEqualTo("clock"); assertThat(saved.getColor()).isEqualTo("#AABBCC");
        rename.remove("color"); rename.put("icon", null); saved = updateCategory(saved.getId(), rename);
        assertThat(saved.getIcon()).isEqualTo("tag"); assertThat(saved.getColor()).isEqualTo("#AABBCC");
        rename.remove("icon"); rename.put("color", null); saved = updateCategory(saved.getId(), rename);
        assertThat(saved.getIcon()).isEqualTo("tag"); assertThat(saved.getColor()).isEqualTo("#64748B");
    }

    @Test
    void legacyNullFallbackAndRenameDoNotBackfillOrDamageTransactions() throws Exception {
        jdbc.update("UPDATE categories SET icon=NULL,color=NULL WHERE id=?", expenseA.getId());
        var read = dto(call("GET", "/api/categories/" + expenseA.getId(), tokenA, null), 200, CategoryResponse.class);
        assertThat(read.getIcon()).isEqualTo("tag"); assertThat(read.getColor()).isEqualTo("#64748B");
        var tx = transaction(tokenA, expenseA, "1.23", "2028-02-29");
        updateCategory(expenseA.getId(), categoryBody("QA_LEGACY_RENAME", "EXPENSE"));
        assertThat(jdbc.queryForObject("SELECT (icon IS NULL AND color IS NULL) FROM categories WHERE id=?", Integer.class, expenseA.getId())).isEqualTo(1);
        var stored = dto(call("GET", "/api/transactions/" + tx.getId(), tokenA, null), 200, TransactionResponse.class);
        assertThat(stored.getCategoryName()).isEqualTo("QA_LEGACY_RENAME");
        assertThat(stored.getAmount()).isEqualByComparingTo("1.23");
        assertNoOrphans();
    }

    // Lỗi tên trùng không được đổi metadata cũ hoặc gây mất giao dịch đã liên kết, qua HTTP thật.
    @ParameterizedTest
    @ValueSource(strings = {"null", "custom"})
    void duplicateNameConflictPreservesLinkedTransactionsAndLegacyMetadata(String metadata) throws Exception {
        var input = categoryBody("QA_NAME_CONFLICT_SOURCE", "EXPENSE");
        input.put("icon", "gift"); input.put("color", "#123456");
        var saved = category(input);
        if (metadata.equals("null")) {
            jdbc.update("UPDATE categories SET icon=NULL,color=NULL WHERE id=?", saved.getId());
        }
        Category source = categories.findById(saved.getId()).orElseThrow();
        var tx = transaction(tokenA, source, "123.45", "2026-11-03");
        var beforeCategories = jdbc.queryForList("SELECT * FROM categories ORDER BY id");
        var beforeTransactions = jdbc.queryForList("SELECT * FROM transactions ORDER BY id");
        var duplicate = categoryBody("  " + expenseA.getName().toUpperCase(Locale.ROOT) + "  ", "EXPENSE");
        duplicate.put("icon", "clock"); duplicate.put("color", "#ABCDEF");

        for (String method : List.of("POST", "PUT")) {
            String path = "/api/categories" + (method.equals("PUT") ? "/" + saved.getId() : "");
            var response = call(method, path, tokenA, duplicate);
            error(response, 409, "CONFLICT");
            var body = json.readTree(response.body());
            assertThat(body.size()).isEqualTo(3);
            assertThat(body.get("status").asInt()).isEqualTo(409);
            assertThat(body.get("message").asString()).isEqualTo("Tên danh mục đã tồn tại với loại này");
            assertThat(jdbc.queryForList("SELECT * FROM categories ORDER BY id")).isEqualTo(beforeCategories);
            assertThat(jdbc.queryForList("SELECT * FROM transactions ORDER BY id")).isEqualTo(beforeTransactions);
        }

        // Self-update thiếu metadata giữ nguyên cả NULL trong DB, không ghi fallback ngược lại.
        updateCategory(saved.getId(), categoryBody("  " + saved.getName() + "  ", "EXPENSE"));
        assertThat(jdbc.queryForList("SELECT * FROM categories ORDER BY id")).isEqualTo(beforeCategories);
        var stored = dto(call("GET", "/api/transactions/" + tx.getId(), tokenA, null), 200, TransactionResponse.class);
        assertThat(stored.getCategoryId()).isEqualTo(saved.getId());
        assertThat(stored.getCategoryName()).isEqualTo(saved.getName());
        assertThat(stored.getAmount()).isEqualByComparingTo("123.45");
        var category = dto(call("GET", "/api/categories/" + saved.getId(), tokenA, null), 200, CategoryResponse.class);
        assertThat(category.getIcon()).isEqualTo(metadata.equals("null") ? "tag" : "gift");
        assertThat(category.getColor()).isEqualTo(metadata.equals("null") ? "#64748B" : "#123456");
        assertDayAgainstSql("2026-11-03");
        assertNoOrphans();
    }

    @Test
    void invalidAppearanceAndTypeConflictDoNotMutateRows() throws Exception {
        var input = categoryBody("QA_ORIGINAL", "EXPENSE"); input.put("icon", "gift"); input.put("color", "#123456");
        var saved = category(input);
        long before = categories.count();
        for (var invalid : List.of(Map.of("icon", "pizza"), Map.of("icon", "Tag"), Map.of("icon", "<svg>"), Map.of("icon", "tag "), Map.of("color", "#fff"), Map.of("color", "red"), Map.of("color", " #123456"), Map.of("color", "#GGGGGG"))) {
            var body = categoryBody("QA_INVALID", "EXPENSE"); body.putAll(invalid);
            error(call("POST", "/api/categories", tokenA, body), 400, "VALIDATION_ERROR");
            error(call("PUT", "/api/categories/" + saved.getId(), tokenA, body), 400, "VALIDATION_ERROR");
        }
        assertThat(categories.count()).isEqualTo(before);
        transaction(tokenA, categories.findById(saved.getId()).orElseThrow(), "1", "2028-02-29");
        var conflict = categoryBody("QA_CONFLICT", "INCOME"); conflict.put("icon", "clock"); conflict.put("color", "#FFFFFF");
        error(call("PUT", "/api/categories/" + saved.getId(), tokenA, conflict), 409, "CONFLICT");
        var row = jdbc.queryForMap("SELECT name,type,icon,color FROM categories WHERE id=?", saved.getId());
        assertThat(row).containsEntry("name", "QA_ORIGINAL").containsEntry("type", "EXPENSE").containsEntry("icon", "gift").containsEntry("color", "#123456");
    }

    @Test
    void categoryOwnershipAndRegistrationMetadataStayPrivate() throws Exception {
        var before = jdbc.queryForMap("SELECT name,icon,color FROM categories WHERE id=?", expenseA.getId());
        for (String method : List.of("GET", "PUT", "DELETE")) error(call(method, "/api/categories/" + expenseA.getId(), tokenB,
                method.equals("PUT") ? categoryBody("QA_FOREIGN", "EXPENSE") : null), 404, "RESOURCE_NOT_FOUND");
        assertThat(jdbc.queryForMap("SELECT name,icon,color FROM categories WHERE id=?", expenseA.getId())).isEqualTo(before);
        for (UserResponse user : List.of(a, b)) {
            var catalog = categories.findByUserId(user.getId());
            assertThat(catalog).hasSize(17);
            assertThat(catalog).allSatisfy(c -> {
                assertThat(c.getIcon()).matches(CategoryAppearance.ICON_PATTERN);
                assertThat(c.getColor()).matches("#[0-9A-F]{6}");
            });
        }
        login(a); login(a);
        assertThat(categories.count()).isEqualTo(34);
    }

    @Test
    void categoryFailureAfterFlushRollsBackWithNeutral500() throws Exception {
        CategoryService target = AopTestUtils.getUltimateTargetObject(categoryService);
        long before = categories.count();
        doAnswer(invocation -> { invocation.callRealMethod(); categories.flush(); throw new IllegalStateException("QA_CATEGORY_FAILURE_AFTER_FLUSH"); })
                .when(target).create(any(CategoryRequest.class), anyLong());
        try {
            var response = call("POST", "/api/categories", tokenA, categoryBody("QA_ROLLBACK", "EXPENSE"));
            error(response, 500, "INTERNAL_ERROR");
            assertThat(response.body().contains("QA_CATEGORY_FAILURE")).isFalse();
            assertThat(categories.count()).isEqualTo(before);
        } finally { doCallRealMethod().when(target).create(any(CategoryRequest.class), anyLong()); }
    }

    @Test
    void schemaAndConstraintsRemainCompatible() {
        assertThat(jdbc.queryForList("SELECT CONCAT(column_name,':',column_type,':',is_nullable) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='categories' AND column_name IN ('icon','color') ORDER BY column_name", String.class))
                .containsExactly("color:varchar(7):YES", "icon:varchar(40):YES");
        ApplicationSchemaAssertions.assertMappedSchema(jdbc, entityManagerFactory);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND index_name='uk_budget_user_year_month' AND non_unique=0", Integer.class)).isEqualTo(3);
        assertNoOrphans();
    }

    private void assertDayAgainstSql(String date) throws Exception {
        LocalDate day = LocalDate.parse(date); YearMonth month = YearMonth.from(day);
        var calendar = dto(call("GET", "/api/calendar/month?year=" + month.getYear() + "&month=" + month.getMonthValue(), tokenA, null), 200, CalendarMonthResponse.class);
        var apiDay = calendar.days().get(day.getDayOfMonth() - 1);
        BigDecimal income = dayTotal(date, "INCOME"), expense = dayTotal(date, "EXPENSE");
        assertThat(apiDay.date()).isEqualTo(day);
        assertThat(apiDay.incomeTotal()).isEqualByComparingTo(income); assertThat(apiDay.expenseTotal()).isEqualByComparingTo(expense);
        System.out.printf("QA_D05_SQL date=%s income=%s expense=%s match=PASS%n", date, income, expense);
    }
    private BigDecimal dayTotal(String date, String type) { return jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=? AND transaction_date=? AND type=?", BigDecimal.class, a.getId(), date, type); }
    private void assertNoOrphans() { assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM transactions t LEFT JOIN users u ON u.id=t.user_id LEFT JOIN categories c ON c.id=t.category_id WHERE u.id IS NULL OR c.id IS NULL OR c.user_id<>t.user_id", Integer.class)).isZero(); }
    private UserResponse register(String email) throws Exception { return dto(call("POST", "/api/auth/register", null, Map.of("email", email, "fullName", "QA D05 D06", "password", password)), 201, UserResponse.class); }
    private String login(UserResponse user) throws Exception { return dto(call("POST", "/api/auth/login", null, Map.of("email", user.getEmail(), "password", password)), 200, AuthResponse.class).getAccessToken(); }
    private Map<String, Object> categoryBody(String name, String type) { return new HashMap<>(Map.of("name", name, "type", type)); }
    private CategoryResponse category(Object body) throws Exception { return dto(call("POST", "/api/categories", tokenA, body), 201, CategoryResponse.class); }
    private CategoryResponse updateCategory(long id, Object body) throws Exception { return dto(call("PUT", "/api/categories/" + id, tokenA, body), 200, CategoryResponse.class); }
    private Map<String, Object> transactionBody(Category category, String amount, String date) { return Map.of("categoryId", category.getId(), "type", category.getType().name(), "amount", new BigDecimal(amount), "transactionDate", date, "note", "QA_56_ONLY"); }
    private TransactionResponse transaction(String token, Category category, String amount, String date) throws Exception { return dto(call("POST", "/api/transactions", token, transactionBody(category, amount, date)), 201, TransactionResponse.class); }
    private Map<?, ?> day(String date, int page, int size) throws Exception { return dto(call("GET", "/api/transactions?startDate=" + date + "&endDate=" + date + "&page=" + page + "&size=" + size, tokenA, null), 200, Map.class); }
    @SuppressWarnings("unchecked") private List<Map<?, ?>> rows(Map<?, ?> page) { return (List<Map<?, ?>>) page.get("content"); }
    private void assertPage(Map<?, ?> result, int page, int size, int total, int pages) {
        for (var expected : Map.of("number", page, "size", size, "totalElements", total, "totalPages", pages).entrySet())
            assertThat(((Number) result.get(expected.getKey())).intValue()).isEqualTo(expected.getValue());
    }
    private HttpResponse<String> call(String method, String path, String token, Object body) throws Exception {
        assertThat(path.startsWith("/api/") && !path.contains("://")).isTrue();
        var request = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(15));
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (body != null) request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    private <T> T dto(HttpResponse<String> response, int expected, Class<T> type) throws Exception { assertThat(response.statusCode()).isEqualTo(expected); return json.readValue(response.body(), type); }
    private void error(HttpResponse<String> response, int expected, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(expected);
        Map<?, ?> body = json.readValue(response.body(), Map.class);
        assertThat(body.get("code")).isEqualTo(code);
    }
}
