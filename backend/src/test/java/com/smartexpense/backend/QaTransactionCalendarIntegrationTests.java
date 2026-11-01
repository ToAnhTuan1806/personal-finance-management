package com.smartexpense.backend;

import com.smartexpense.backend.dto.auth.AuthResponse;
import com.smartexpense.backend.dto.auth.UserResponse;
import com.smartexpense.backend.dto.calendar.CalendarMonthResponse;
import com.smartexpense.backend.dto.dashboard.DashboardSummaryResponse;
import com.smartexpense.backend.dto.transaction.TransactionRequest;
import com.smartexpense.backend.dto.transaction.TransactionResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.service.TransactionService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import javax.sql.DataSource;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.*;
import java.net.http.*;
import java.sql.Connection;
import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

// D03–D04: HTTP server và MySQL thật trên loopback; không dùng repository mock hoặc DB ứng dụng.
@SpringBootTest(classes = BackendApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.config.location=classpath:/application-d03-test.properties", "server.address=127.0.0.1"})
@ActiveProfiles("d03-test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class QaTransactionCalendarIntegrationTests extends MySqlIntegrationTestSupport {
    @Autowired Environment environment;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired MonthlyBudgetRepository budgets;
    @MockitoSpyBean TransactionService transactionService;

    private HttpClient http;
    private String base, password, tokenA, tokenB;
    private UserResponse a, b;
    private Category incomeA, expenseA, expenseB;

    @BeforeEach
    void prepareIsolatedHttpAndTwoOwners() throws Exception {
        verifyMySqlConnection();
        assertThat(users.count()).isZero();
        int port = environment.getRequiredProperty("local.server.port", Integer.class);
        assertThat(port).isPositive().isNotEqualTo(8080);
        base = "http://127.0.0.1:" + port;
        http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).proxy(new ProxySelector() {
            @Override public List<Proxy> select(URI uri) { return List.of(Proxy.NO_PROXY); }
            @Override public void connectFailed(URI uri, SocketAddress address, IOException error) { }
        }).build();
        password = UUID.randomUUID().toString();
        a = register("qa-d03-a-" + UUID.randomUUID() + "@example.test");
        b = register("qa-d03-b-" + UUID.randomUUID() + "@example.test");
        tokenA = login(a);
        tokenB = login(b);
        incomeA = categories.findByUserIdAndType(a.getId(), TransactionType.INCOME).getFirst();
        expenseA = categories.findByUserIdAndType(a.getId(), TransactionType.EXPENSE).getFirst();
        expenseB = categories.findByUserIdAndType(b.getId(), TransactionType.EXPENSE).getFirst();
    }

    @AfterEach
    void cleanupTestRowsAndSockets() throws Exception {
        if (http != null) http.close();
        verifyMySqlConnection();
        transactions.deleteAllInBatch();
        budgets.deleteAllInBatch();
        categories.deleteAllInBatch();
        users.deleteAllInBatch();
        assertThat(List.of(users.count(), categories.count(), transactions.count(), budgets.count()))
                .containsExactly(0L, 0L, 0L, 0L);
    }

    @Test
    void httpCrudPersistsExactDtoAndCalendarDashboardFollowSqlAfterRelogin() throws Exception {
        TransactionResponse income = create(tokenA, body(incomeA, "0.10", "2026-10-01", "Thu tiếng Việt"));
        TransactionResponse expense = create(tokenA, body(expenseA, "12.34", "2026-10-31", "Chi cuối tháng"));
        assertThat(income.getCategoryId()).isEqualTo(incomeA.getId());
        assertThat(income.getType()).isEqualTo(TransactionType.INCOME);
        assertThat(expense.getTransactionDate()).isEqualTo(LocalDate.of(2026, 10, 31));
        assertThat(expense.getNote()).isEqualTo("Chi cuối tháng");
        assertThat(sqlAmount(expense.getId())).isEqualByComparingTo("12.34");
        String discarded = tokenA;
        tokenA = null; // Logout client bỏ token; Backend stateless không có endpoint revoke.
        tokenA = login(a);
        assertThat(dto(call("GET", "/api/transactions/" + expense.getId(), tokenA, null), 200, TransactionResponse.class).getAmount())
                .isEqualByComparingTo("12.34");
        assertThat(call("GET", "/api/users/me", discarded, null).statusCode()).isEqualTo(200);
        assertMonthAgainstIndependentSql(a.getId(), tokenA, YearMonth.of(2026, 10));
        dto(call("PUT", "/api/transactions/" + expense.getId(), tokenA, body(expenseA, "13.45", "2026-10-31", "Đã sửa")), 200, TransactionResponse.class);
        assertThat(sqlAmount(expense.getId())).isEqualByComparingTo("13.45");
        assertMonthAgainstIndependentSql(a.getId(), tokenA, YearMonth.of(2026, 10));
        assertThat(call("DELETE", "/api/transactions/" + expense.getId(), tokenA, null).statusCode()).isEqualTo(204);
        assertThat(transactions.existsById(expense.getId())).isFalse();
        assertMonthAgainstIndependentSql(a.getId(), tokenA, YearMonth.of(2026, 10));
        assertNoOrphans();
    }

    @Test
    void identicalValidHttpPostsAreTwoWritesBecauseBackendHasNoIdempotencyKey() throws Exception {
        var payload = body(expenseA, "1.23", "2026-10-29", "Cùng nội dung");
        var first = create(tokenA, payload);
        var second = create(tokenA, payload);
        assertThat(first.getId()).isNotEqualTo(second.getId());
        assertThat(transactions.count()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM transactions", BigDecimal.class)).isEqualByComparingTo("2.46");
    }

    @Test
    void filtersPagingAndCalendarUseAllCommittedRowsWithoutMixingOwners() throws Exception {
        for (int index = 0; index < 25; index++) create(tokenA, body(expenseA, "1.01", "2026-10-31", "QA_PAGING_" + index));
        create(tokenA, body(incomeA, "0.10", "2026-10-01", "QA_THU"));
        create(tokenA, body(incomeA, "0.20", "2026-10-01", "QA_THU"));
        create(tokenB, body(expenseB, "999.99", "2026-10-31", "QA_PAGING_B"));
        List<Long> ids = new ArrayList<>();
        for (int page = 0; page < 3; page++) {
            var response = page("month=2026-10&page=" + page + "&size=10", tokenA);
            assertThat(((Number) response.get("totalElements")).intValue()).isEqualTo(27);
            for (var row : rows(response)) ids.add(((Number) row.get("id")).longValue());
        }
        assertThat(ids).hasSize(27).doesNotHaveDuplicates();
        assertThat(ids).isEqualTo(jdbc.queryForList("SELECT id FROM transactions WHERE user_id=? ORDER BY transaction_date DESC,id DESC", Long.class, a.getId()));
        assertThat(rows(page("month=2026-10&page=3&size=10", tokenA))).isEmpty();
        assertThat(((Number) page("startDate=2026-10-31&endDate=2026-10-31&type=EXPENSE&categoryId=" + expenseA.getId() + "&keyword=qa_paging&size=100", tokenA).get("totalElements")).intValue()).isEqualTo(25);
        assertThat(((Number) page("month=2026-10&type=INCOME&keyword=qa_thu", tokenA).get("totalElements")).intValue()).isEqualTo(2);
        assertThat(rows(page("month=2026-10&categoryId=" + expenseB.getId(), tokenA))).isEmpty();
        assertMonthAgainstIndependentSql(a.getId(), tokenA, YearMonth.of(2026, 10));
        assertMonthAgainstIndependentSql(b.getId(), tokenB, YearMonth.of(2026, 10));
        assertNoOrphans();
    }

    @ParameterizedTest
    @CsvSource({"2026,2", "2028,2", "2026,4", "2026,10", "2026,12", "2027,1"})
    void calendarMonthBoundariesAndEveryDayMatchIndependentSql(int year, int month) throws Exception {
        YearMonth period = YearMonth.of(year, month);
        assertMonthAgainstIndependentSql(a.getId(), tokenA, period); // Tháng rỗng vẫn đủ ngày.
        create(tokenA, body(incomeA, "0.10", period.atDay(1).toString(), "Thu A"));
        create(tokenA, body(incomeA, "0.20", period.atDay(1).toString(), "Thu A"));
        create(tokenA, body(expenseA, "1.01", period.atEndOfMonth().toString(), "Chi A"));
        create(tokenB, body(expenseB, "777.77", period.atEndOfMonth().toString(), "Riêng B"));
        create(tokenA, body(expenseA, "7.77", period.atDay(1).minusDays(1).toString(), "Ngoài tháng trước"));
        create(tokenA, body(expenseA, "8.88", period.atEndOfMonth().plusDays(1).toString(), "Ngoài tháng sau"));
        assertMonthAgainstIndependentSql(a.getId(), tokenA, period);
        assertMonthAgainstIndependentSql(b.getId(), tokenB, period);
        System.out.printf("QA_CALENDAR_SQL period=%s days=%d A=0.30/1.01 B=0/777.77 matched=PASS%n", period, period.lengthOfMonth());
    }

    @Test
    void validationAndOwnershipErrorsOverHttpDoNotWriteOrMutateRows() throws Exception {
        var saved = create(tokenA, body(expenseA, "12.34", "2026-10-29", "Giữ nguyên"));
        for (Object invalidAmount : List.of(BigDecimal.ZERO, new BigDecimal("-1"), new BigDecimal("10000000000000"), new BigDecimal("1.001"))) {
            var invalid = new HashMap<>(body(expenseA, "1", "2026-10-29", "Không lưu"));
            invalid.put("amount", invalidAmount);
            error(call("POST", "/api/transactions", tokenA, invalid), 400, "VALIDATION_ERROR");
        }
        var missing = new HashMap<>(body(expenseA, "1", "2026-10-29", "Không lưu"));
        missing.remove("amount");
        error(call("POST", "/api/transactions", tokenA, missing), 400, "VALIDATION_ERROR");
        error(call("POST", "/api/transactions", tokenA, body(expenseB, "1", "2026-10-29", "Không lưu")), 400, "VALIDATION_ERROR");
        var absent = new HashMap<>(body(expenseA, "1", "2026-10-29", "Không lưu"));
        absent.put("categoryId", Long.MAX_VALUE);
        error(call("POST", "/api/transactions", tokenA, absent), 400, "VALIDATION_ERROR");
        for (String method : List.of("GET", "PUT", "DELETE")) error(call(method, "/api/transactions/" + saved.getId(), tokenB,
                method.equals("PUT") ? body(expenseB, "9", "2026-10-29", "Không được sửa") : null), 404, "RESOURCE_NOT_FOUND");
        error(call("POST", "/api/transactions", null, body(expenseA, "1", "2026-10-29", "Không lưu")), 401, "UNAUTHORIZED");
        assertThat(transactions.count()).isEqualTo(1);
        assertThat(sqlAmount(saved.getId())).isEqualByComparingTo("12.34");
        assertNoOrphans();
    }

    @Test
    void failureAfterRealFlushRollsBackAndReturnsNeutral500() throws Exception {
        TransactionService target = AopTestUtils.getUltimateTargetObject(transactionService);
        // Chỉ chèn lỗi trong test sau khi SQL đã chạy, giữ nguyên repository/MySQL và transaction thật.
        doAnswer(invocation -> {
            invocation.callRealMethod();
            transactions.flush();
            throw new IllegalStateException("QA_INTERNAL_FAILURE_AFTER_FLUSH");
        }).when(target).create(any(TransactionRequest.class), anyLong());
        try {
            var response = call("POST", "/api/transactions", tokenA, body(expenseA, "5.67", "2026-10-29", "Rollback test"));
            error(response, 500, "INTERNAL_ERROR");
            assertThat(response.body().contains("QA_INTERNAL_FAILURE")).isFalse();
            assertThat(transactions.count()).isZero();
            assertMonthAgainstIndependentSql(a.getId(), tokenA, YearMonth.of(2026, 10));
        } finally { doCallRealMethod().when(target).create(any(TransactionRequest.class), anyLong()); }
        assertThat(create(tokenA, body(expenseA, "5.67", "2026-10-29", "Thử lại có chủ ý")).getId()).isPositive();
    }

    @Test
    void repeatableReadPreventsDirtyReadsAndRetainsSnapshotUntilCommit() throws Exception {
        long id = create(tokenA, body(expenseA, "1.00", "2026-10-29", "Isolation test")).getId();
        String defaultIsolation = jdbc.queryForObject("SELECT @@transaction_isolation", String.class);
        try (var reader = dataSource.getConnection(); var writer = dataSource.getConnection()) {
            reader.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
            reader.setAutoCommit(false);
            writer.setAutoCommit(false);
            assertThat(amount(reader, id)).isEqualByComparingTo("1.00");
            try (var update = writer.prepareStatement("UPDATE transactions SET amount=2.00 WHERE id=?")) {
                update.setLong(1, id);
                update.executeUpdate();
            }
            assertThat(amount(reader, id)).isEqualByComparingTo("1.00");
            writer.commit();
            assertThat(amount(reader, id)).isEqualByComparingTo("1.00");
            reader.commit();
            assertThat(amount(reader, id)).isEqualByComparingTo("2.00");
            reader.rollback();
        }
        System.out.printf("QA_ISOLATION default=%s tested=REPEATABLE_READ dirtyRead=NONE snapshotUntilCommit=PASS%n", defaultIsolation);
    }

    private void assertMonthAgainstIndependentSql(long owner, String token, YearMonth period) throws Exception {
        CalendarMonthResponse calendar = dto(call("GET", "/api/calendar/month?year=" + period.getYear() + "&month=" + period.getMonthValue(), token, null), 200, CalendarMonthResponse.class);
        var grouped = jdbc.queryForList("SELECT transaction_date,type,SUM(amount) AS total_amount FROM transactions WHERE user_id=? AND transaction_date>=? AND transaction_date<? GROUP BY transaction_date,type", owner, period.atDay(1), period.plusMonths(1).atDay(1));
        assertThat(calendar.days()).hasSize(period.lengthOfMonth());
        BigDecimal dailyIncome = BigDecimal.ZERO, dailyExpense = BigDecimal.ZERO;
        for (int index = 0; index < calendar.days().size(); index++) {
            var day = calendar.days().get(index);
            assertThat(day.date()).isEqualTo(period.atDay(index + 1));
            BigDecimal income = BigDecimal.ZERO, expense = BigDecimal.ZERO;
            for (var row : grouped) if (row.get("transaction_date").toString().equals(day.date().toString())) {
                if (row.get("type").toString().equals("INCOME")) income = (BigDecimal) row.get("total_amount");
                else expense = (BigDecimal) row.get("total_amount");
            }
            assertThat(day.incomeTotal()).isEqualByComparingTo(income);
            assertThat(day.expenseTotal()).isEqualByComparingTo(expense);
            dailyIncome = dailyIncome.add(day.incomeTotal());
            dailyExpense = dailyExpense.add(day.expenseTotal());
        }
        BigDecimal sqlIncome = total(owner, "INCOME", period), sqlExpense = total(owner, "EXPENSE", period);
        assertThat(calendar.incomeTotal()).isEqualByComparingTo(sqlIncome).isEqualByComparingTo(dailyIncome);
        assertThat(calendar.expenseTotal()).isEqualByComparingTo(sqlExpense).isEqualByComparingTo(dailyExpense);
        DashboardSummaryResponse dashboard = dto(call("GET", "/api/dashboard/summary?month=" + period, token, null), 200, DashboardSummaryResponse.class);
        assertThat(dashboard.getTotalIncome()).isEqualByComparingTo(sqlIncome);
        assertThat(dashboard.getTotalExpense()).isEqualByComparingTo(sqlExpense);
        assertThat(dashboard.getBalance()).isEqualByComparingTo(sqlIncome.subtract(sqlExpense));
    }

    private BigDecimal total(long owner, String type, YearMonth period) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=? AND type=? AND transaction_date>=? AND transaction_date<?", BigDecimal.class, owner, type, period.atDay(1), period.plusMonths(1).atDay(1));
    }
    private BigDecimal sqlAmount(long id) { return jdbc.queryForObject("SELECT amount FROM transactions WHERE id=?", BigDecimal.class, id); }
    private BigDecimal amount(Connection connection, long id) throws Exception {
        try (var query = connection.prepareStatement("SELECT amount FROM transactions WHERE id=?")) {
            query.setLong(1, id);
            try (var result = query.executeQuery()) { assertThat(result.next()).isTrue(); return result.getBigDecimal(1); }
        }
    }
    private void assertNoOrphans() {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM transactions t LEFT JOIN users u ON u.id=t.user_id LEFT JOIN categories c ON c.id=t.category_id WHERE u.id IS NULL OR c.id IS NULL OR c.user_id<>t.user_id", Integer.class)).isZero();
    }
    private UserResponse register(String email) throws Exception {
        return dto(call("POST", "/api/auth/register", null, Map.of("fullName", "QA D03 D04", "email", email, "password", password)), 201, UserResponse.class);
    }
    private String login(UserResponse user) throws Exception {
        return dto(call("POST", "/api/auth/login", null, Map.of("email", user.getEmail(), "password", password)), 200, AuthResponse.class).getAccessToken();
    }
    private Map<String, Object> body(Category category, String amount, String date, String note) {
        return Map.of("categoryId", category.getId(), "type", category.getType().name(), "amount", new BigDecimal(amount), "transactionDate", date, "note", note);
    }
    private TransactionResponse create(String token, Object body) throws Exception { return dto(call("POST", "/api/transactions", token, body), 201, TransactionResponse.class); }
    private HttpResponse<String> call(String method, String path, String token, Object body) throws Exception {
        assertThat(path.startsWith("/api/") && !path.contains("://")).isTrue();
        var request = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(15));
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (body != null) request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    private <T> T dto(HttpResponse<String> response, int status, Class<T> type) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        return json.readValue(response.body(), type);
    }
    private Map<?, ?> page(String query, String token) throws Exception { return dto(call("GET", "/api/transactions?" + query, token, null), 200, Map.class); }
    @SuppressWarnings("unchecked") private List<Map<?, ?>> rows(Map<?, ?> page) { return (List<Map<?, ?>>) page.get("content"); }
    private void error(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        Map<?, ?> data = json.readValue(response.body(), Map.class);
        assertThat(((Number) data.get("status")).intValue()).isEqualTo(status);
        assertThat(data.get("code")).isEqualTo(code);
    }
}
