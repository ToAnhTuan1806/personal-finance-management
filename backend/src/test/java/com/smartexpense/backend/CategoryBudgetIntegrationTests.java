package com.smartexpense.backend;

import com.smartexpense.backend.dto.categorybudget.CategoryBudgetResponse;
import com.smartexpense.backend.entity.*;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.exception.CategoryBudgetExceptionHandler;
import com.smartexpense.backend.repository.*;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Schema do harness JPA tạo chỉ chứng minh API/MySQL; migration có suite riêng, không thay thế nhau.
// Không @Transactional ở lớp test: mỗi request phải commit/rollback thật, kể cả hai request đồng thời.
@SpringBootTest(classes = BackendApplication.class, properties = {
        "spring.config.location=classpath:/application-d03-test.properties",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=com.smartexpense.backend.CategoryBudgetIntegrationTests$BudgetSql"})
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import({MySqlIntegrationTestSupport.IsolatedDataSource.class, FixedTransactionClockConfiguration.class})
class CategoryBudgetIntegrationTests extends MySqlIntegrationTestSupport {

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired MonthlyBudgetRepository monthlyBudgets;

    private User userA;
    private User userB;
    private Category expenseA;
    private Category otherExpenseA;
    private Category incomeA;
    private Category expenseB;
    private MonthlyBudget legacyMonthlyBudget;

    @BeforeEach
    void fixtures() throws Exception {
        verifyMySqlConnection();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users", Long.class)).isZero();
        userA = owner();
        userB = owner();
        expenseA = category(userA, TransactionType.EXPENSE);
        otherExpenseA = category(userA, TransactionType.EXPENSE);
        incomeA = category(userA, TransactionType.INCOME);
        expenseB = category(userB, TransactionType.EXPENSE);
        legacyMonthlyBudget = new MonthlyBudget();
        legacyMonthlyBudget.setUser(userA);
        legacyMonthlyBudget.setYear(2026);
        legacyMonthlyBudget.setMonth(12);
        legacyMonthlyBudget.setAmountLimit(new BigDecimal("7777.77"));
        legacyMonthlyBudget = monthlyBudgets.saveAndFlush(legacyMonthlyBudget);
    }

    @AfterEach
    void cleanup() throws Exception {
        BudgetSql.barrier = null;
        BudgetSql.capture = false;
        BudgetSql.selects.clear();
        verifyMySqlConnection();
        // Kiểm tra ngân sách tổng trước khi dọn; thao tác D07 không được thay hạn mức/danh tính cũ.
        assertThat(jdbc.queryForMap("SELECT user_id, year, month, amount_limit FROM monthly_budgets WHERE id = ?",
                legacyMonthlyBudget.getId())).containsEntry("user_id", userA.getId())
                .containsEntry("year", 2026).containsEntry("month", 12)
                .containsEntry("amount_limit", new BigDecimal("7777.77"));
        for (String table : List.of("category_budgets", "transactions", "monthly_budgets", "categories", "users")) {
            jdbc.update("DELETE FROM " + table);
        }
        assertThat(users.count()).isZero();
    }

    @Test
    void upsertKeepsIdentityAndOneRowPerOwnerCategoryPeriod() throws Exception {
        var first = create(userA, expenseA, 2026, 12, "1000.00");
        var second = create(userA, expenseA, 2026, 12, "2000.00");
        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(second.getAmountLimit()).isEqualByComparingTo("2000.00");
        assertThat(budgetCount(userA, expenseA, 2026, 12)).isEqualTo(1L);
        var foreign = create(userB, expenseB, 2026, 12, "3000.00");
        assertThat(foreign.getId()).isNotEqualTo(first.getId());
        assertThat(budgetCount(userB, expenseB, 2026, 12)).isEqualTo(1L);
        assertThat(read(userA, first.getId()).getCategoryId()).isEqualTo(expenseA.getId());
    }

    @Test
    void listFiltersOwnerYearMonthSortsAndReturnsEmptyMonth() throws Exception {
        create(userA, otherExpenseA, 2026, 12, "200.00");
        create(userA, expenseA, 2026, 12, "100.00");
        create(userA, expenseA, 2026, 11, "300.00");
        create(userA, expenseA, 2025, 12, "400.00");
        create(userB, expenseB, 2026, 12, "500.00");
        var result = call(userA, HttpMethod.GET, "/api/category-budgets?year=2026&month=12", null)
                .andExpect(status().isOk()).andReturn();
        assertThat(Arrays.asList(json.readValue(result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                CategoryBudgetResponse[].class))).extracting(CategoryBudgetResponse::getCategoryId)
                .containsExactly(expenseA.getId(), otherExpenseA.getId());
        call(userA, HttpMethod.GET, "/api/category-budgets?year=2026&month=10", null)
                .andExpect(status().isOk()).andExpect(content().json("[]"));
    }

    @Test
    void putChangesOnlyLimitAndRecalculatesResponseDespiteExtraClientFields() throws Exception {
        transaction(userA, expenseA, TransactionType.EXPENSE, "100.00", "2026-12-01");
        var budget = create(userA, expenseA, 2026, 12, "200.00");
        var response = call(userA, HttpMethod.PUT, "/api/category-budgets/" + budget.getId(),
                Map.of("amountLimit", new BigDecimal("50.00"), "userId", userB.getId(),
                        "categoryId", otherExpenseA.getId(), "year", 2025, "month", 1))
                .andExpect(status().isOk()).andExpect(jsonPath("$.usagePercentage").value(200))
                .andExpect(jsonPath("$.remainingAmount").value(-50))
                .andExpect(jsonPath("$.status").value("OVER_BUDGET")).andReturn();
        var updated = json.readValue(response.getResponse().getContentAsString(StandardCharsets.UTF_8), CategoryBudgetResponse.class);
        assertThat(updated.getId()).isEqualTo(budget.getId());
        assertThat(updated.getCategoryId()).isEqualTo(expenseA.getId());
        assertThat(updated.getYear()).isEqualTo(2026);
        assertThat(updated.getMonth()).isEqualTo(12);
        assertThat(jdbc.queryForObject("SELECT user_id FROM category_budgets WHERE id = ?", Long.class, budget.getId()))
                .isEqualTo(userA.getId());
        assertMatchesSql(userA, expenseA, updated);
    }

    @Test
    void deletingBudgetPreservesCategoryTransactionAndOtherOwner() throws Exception {
        transaction(userA, expenseA, TransactionType.EXPENSE, "12.34", "2026-12-31");
        var budget = create(userA, expenseA, 2026, 12, "100.00");
        var foreign = create(userB, expenseB, 2026, 12, "200.00");
        long categoryCount = categories.count();
        long transactionCount = transactions.count();
        call(userA, HttpMethod.DELETE, "/api/category-budgets/" + budget.getId(), null)
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        error(call(userA, HttpMethod.GET, "/api/category-budgets/" + budget.getId(), null), 404, "RESOURCE_NOT_FOUND");
        assertThat(categories.count()).isEqualTo(categoryCount);
        assertThat(transactions.count()).isEqualTo(transactionCount);
        assertThat(read(userB, foreign.getId()).getAmountLimit()).isEqualByComparingTo("200.00");
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "foreign", "income"})
    void rejectsUnusableCategoriesWithoutWriting(String kind) throws Exception {
        long categoryId = switch (kind) {
            case "foreign" -> expenseB.getId();
            case "income" -> incomeA.getId();
            default -> Long.MAX_VALUE;
        };
        error(call(userA, HttpMethod.POST, "/api/category-budgets", body(categoryId, 2026, 12, "100.00")),
                kind.equals("income") ? 400 : 404, kind.equals("income") ? "VALIDATION_ERROR" : "RESOURCE_NOT_FOUND");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM category_budgets", Long.class)).isZero();
    }

    @ParameterizedTest
    @CsvSource({"year,1899", "year,2101", "month,0", "month,13", "amountLimit,0", "amountLimit,-1",
            "amountLimit,10000000000000.00", "amountLimit,0.001", "amountLimit,1.001"})
    void beanValidationRejectsBadInputsBeforeDatabaseWrite(String field, String value) throws Exception {
        Map<String, Object> body = body(expenseA.getId(), 2026, 12, "100.00");
        body.put(field, new BigDecimal(value));
        error(call(userA, HttpMethod.POST, "/api/category-budgets", body), 400, "VALIDATION_ERROR")
                .andExpect(jsonPath("$.errors." + field).exists());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM category_budgets", Long.class)).isZero();
    }

    @Test
    void missingFieldsBadQueryAndNonpositiveIdsUseExistingErrors() throws Exception {
        error(call(userA, HttpMethod.POST, "/api/category-budgets", Map.of()), 400, "VALIDATION_ERROR")
                .andExpect(jsonPath("$.errors.categoryId").exists()).andExpect(jsonPath("$.errors.amountLimit").exists());
        for (String query : List.of("?year=2026", "?year=2026&month=13", "?year=bad&month=12")) {
            error(call(userA, HttpMethod.GET, "/api/category-budgets" + query, null), 400, "VALIDATION_ERROR");
        }
        for (HttpMethod method : List.of(HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE)) {
            error(call(userA, method, "/api/category-budgets/0", Map.of("amountLimit", 100)), 400, "VALIDATION_ERROR");
            error(call(userA, method, "/api/category-budgets/" + Long.MAX_VALUE, Map.of("amountLimit", 100)),
                    404, "RESOURCE_NOT_FOUND");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "invalid"})
    void allEndpointsRequireValidJwt(String kind) throws Exception {
        String path = "/api/category-budgets";
        var endpoints = List.of(Map.entry(HttpMethod.POST, path), Map.entry(HttpMethod.GET, path + "?year=2026&month=12"),
                Map.entry(HttpMethod.GET, path + "/1"), Map.entry(HttpMethod.PUT, path + "/1"),
                Map.entry(HttpMethod.DELETE, path + "/1"));
        for (var endpoint : endpoints) {
            var request = request(endpoint.getKey(), endpoint.getValue()).contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body(expenseA.getId(), 2026, 12, "100.00")));
            if (kind.equals("invalid")) request.header(HttpHeaders.AUTHORIZATION, "Bearer invalid-d07-test-token");
            error(mvc.perform(request), 401, "UNAUTHORIZED");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void foreignBudgetIsNotFoundAndCannotBeMutated(String method) throws Exception {
        var budget = create(userA, expenseA, 2026, 12, "100.00");
        error(call(userB, HttpMethod.valueOf(method), "/api/category-budgets/" + budget.getId(), Map.of("amountLimit", 999)),
                404, "RESOURCE_NOT_FOUND");
        assertThat(read(userA, budget.getId()).getAmountLimit()).isEqualByComparingTo("100.00");
        call(userB, HttpMethod.GET, "/api/category-budgets?year=2026&month=12", null)
                .andExpect(status().isOk()).andExpect(content().json("[]"));
    }

    @Test
    void spendingMatchesIndependentSqlAcrossCategoriesTypesOwnersBoundariesAndPagination() throws Exception {
        transaction(userA, expenseA, TransactionType.EXPENSE, "10.10", "2026-12-01");
        transaction(userA, expenseA, TransactionType.EXPENSE, "20.20", "2026-12-31");
        for (int i = 0; i < 25; i++) transaction(userA, expenseA, TransactionType.EXPENSE, "1.01", "2026-12-15");
        transaction(userA, expenseA, TransactionType.EXPENSE, "1000.00", "2026-11-30");
        transaction(userA, expenseA, TransactionType.EXPENSE, "2000.00", "2027-01-01");
        transaction(userA, otherExpenseA, TransactionType.EXPENSE, "3000.00", "2026-12-15");
        transaction(userA, incomeA, TransactionType.INCOME, "4000.00", "2026-12-15");
        transaction(userB, expenseB, TransactionType.EXPENSE, "5000.00", "2026-12-15");
        var budget = create(userA, expenseA, 2026, 12, "100.00");
        call(userA, HttpMethod.GET, "/api/transactions?month=2026-12&page=0&size=1", null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(1));
        var response = read(userA, budget.getId());
        assertThat(response.getSpentAmount()).isEqualByComparingTo("55.55");
        assertMatchesSql(userA, expenseA, response);
        assertMatchesSql(userA, expenseA, create(userA, expenseA, 2027, 1, "100.00"));
    }

    @Test
    void transactionEditsMovesAndDeletesAreVisibleOnNextBudgetRead() throws Exception {
        Transaction transaction = transaction(userA, expenseA, TransactionType.EXPENSE, "10.00", "2026-12-31");
        var original = create(userA, expenseA, 2026, 12, "100.00");
        var destination = create(userA, otherExpenseA, 2026, 12, "100.00");
        var january = create(userA, otherExpenseA, 2027, 1, "100.00");
        updateTransaction(transaction, expenseA, "20.00", "2026-12-31");
        assertThat(read(userA, original.getId()).getSpentAmount()).isEqualByComparingTo("20.00");
        updateTransaction(transaction, otherExpenseA, "20.00", "2026-12-31");
        assertMatchesSql(userA, expenseA, read(userA, original.getId()));
        assertThat(read(userA, destination.getId()).getSpentAmount()).isEqualByComparingTo("20.00");
        updateTransaction(transaction, otherExpenseA, "20.00", "2027-01-01");
        assertThat(read(userA, destination.getId()).getSpentAmount()).isEqualByComparingTo("0");
        assertMatchesSql(userA, otherExpenseA, read(userA, january.getId()));
        call(userA, HttpMethod.DELETE, "/api/transactions/" + transaction.getId(), null).andExpect(status().isNoContent());
        assertThat(read(userA, january.getId()).getSpentAmount()).isEqualByComparingTo("0");
    }

    @ParameterizedTest
    @CsvSource({"0,0.00,SAFE,false", "790,79.00,SAFE,false", "800,80.00,WARNING,false",
            "990,99.00,WARNING,false", "1000,100.00,OVER_BUDGET,false", "1200,120.00,OVER_BUDGET,true",
            "799.94,79.99,SAFE,false", "799.95,80.00,SAFE,false", "799.99,80.00,SAFE,false",
            "999.94,99.99,WARNING,false", "999.95,100.00,WARNING,false", "999.99,100.00,WARNING,false"})
    void persistedAmountsUseExactThresholdsAndHalfUpDisplay(String spent, String percentage, String budgetStatus,
                                                         boolean exceeded) throws Exception {
        if (new BigDecimal(spent).signum() > 0) transaction(userA, expenseA, TransactionType.EXPENSE, spent, "2026-12-01");
        var response = create(userA, expenseA, 2026, 12, "1000.00");
        assertMatchesSql(userA, expenseA, response);
        assertThat(response.getUsagePercentage()).isEqualByComparingTo(percentage);
        assertThat(response.getStatus().name()).isEqualTo(budgetStatus);
        assertThat(response.isExceeded()).isEqualTo(exceeded);
    }

    @Test
    void listFetchesCategoriesAndGroupedSpendingWithoutNPlusOne() throws Exception {
        create(userA, expenseA, 2026, 12, "100.00");
        create(userA, otherExpenseA, 2026, 12, "200.00");
        transaction(userA, expenseA, TransactionType.EXPENSE, "10.00", "2026-12-01");
        BudgetSql.selects.clear();
        BudgetSql.capture = true;
        try {
            call(userA, HttpMethod.GET, "/api/category-budgets?year=2026&month=12", null)
                    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[0].spentAmount").value(10));
            // Hai query nghiệp vụ giữ nguyên; D12 thêm đúng một query xác thực theo PK.
            assertThat(BudgetSql.selects).hasSize(3);
            assertThat(BudgetSql.selects.stream().filter(sql -> sql.contains("auth_version"))).hasSize(1);
            assertThat(BudgetSql.selects).anyMatch(sql -> sql.contains("category_budgets") && sql.contains("join"))
                    .anyMatch(sql -> sql.contains("sum(") && sql.contains("group by"));
        } finally {
            BudgetSql.capture = false;
        }
    }

    @Test
    void mysqlUniquenessRejectsActualDuplicateAndPreservesOriginal() throws Exception {
        var original = create(userA, expenseA, 2026, 12, "100.00");
        Throwable failure = catchThrowable(() -> insertBudget(userA.getId(), expenseA.getId()));
        assertSqlFailure(failure, 1062, 409);
        assertThat(budgetCount(userA, expenseA, 2026, 12)).isEqualTo(1L);
        assertThat(read(userA, original.getId()).getAmountLimit()).isEqualByComparingTo("100.00");
    }

    @ParameterizedTest
    @ValueSource(strings = {"user", "category"})
    void actualMissingForeignKeyIsNotTranslatedAsDuplicate(String missing) {
        Throwable failure = catchThrowable(() -> insertBudget(missing.equals("user") ? Long.MAX_VALUE : userA.getId(),
                missing.equals("category") ? Long.MAX_VALUE : expenseA.getId()));
        assertSqlFailure(failure, 1452, 500);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM category_budgets", Long.class)).isZero();
    }

    @Test
    void categoryWithBudgetCannotBeDeletedOrCascadeFinancialRows() throws Exception {
        var budget = create(userA, expenseA, 2026, 12, "100.00");
        error(call(userA, HttpMethod.DELETE, "/api/categories/" + expenseA.getId(), null), 409, "CONFLICT");
        assertThat(categories.findById(expenseA.getId())).isPresent();
        assertThat(read(userA, budget.getId()).getCategoryId()).isEqualTo(expenseA.getId());
    }

    @Test
    void concurrentPostsHitRealUniqueConstraintAndReturn200And409() throws Exception {
        BudgetSql.barrier = new CyclicBarrier(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            Callable<Integer> create = () -> call(userA, HttpMethod.POST, "/api/category-budgets",
                    body(expenseA.getId(), 2026, 12, "100.00")).andReturn().getResponse().getStatus();
            Future<Integer> first = executor.submit(create);
            Future<Integer> second = executor.submit(create);
            assertThat(List.of(first.get(40, TimeUnit.SECONDS), second.get(40, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
            assertThat(budgetCount(userA, expenseA, 2026, 12)).isEqualTo(1L);
        } finally {
            executor.shutdownNow();
            try {
                assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
            } finally {
                BudgetSql.barrier = null;
            }
        }
    }

    private CategoryBudgetResponse create(User user, Category category, int year, int month, String amount) throws Exception {
        var result = call(user, HttpMethod.POST, "/api/category-budgets", body(category.getId(), year, month, amount))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user").doesNotExist())
                .andExpect(jsonPath("$.category").doesNotExist()).andReturn();
        return json.readValue(result.getResponse().getContentAsString(StandardCharsets.UTF_8), CategoryBudgetResponse.class);
    }

    private CategoryBudgetResponse read(User user, Long id) throws Exception {
        var response = call(user, HttpMethod.GET, "/api/category-budgets/" + id, null).andExpect(status().isOk()).andReturn();
        return json.readValue(response.getResponse().getContentAsString(StandardCharsets.UTF_8), CategoryBudgetResponse.class);
    }

    private Map<String, Object> body(long categoryId, int year, int month, String amount) {
        return new HashMap<>(Map.of("categoryId", categoryId, "year", year, "month", month, "amountLimit", new BigDecimal(amount)));
    }

    private ResultActions call(User user, HttpMethod method, String path, Object body) throws Exception {
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder().subject(user.getId().toString()).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        var request = request(method, path).header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        if (body != null) request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        return mvc.perform(request);
    }

    private ResultActions error(ResultActions response, int status, String code) throws Exception {
        return response.andExpect(status().is(status)).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(status)).andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.message").isNotEmpty()).andExpect(jsonPath("$.trace").doesNotExist());
    }

    private void assertMatchesSql(User user, Category category, CategoryBudgetResponse response) {
        YearMonth period = YearMonth.of(response.getYear(), response.getMonth());
        BigDecimal sum = jdbc.queryForObject("""
                SELECT COALESCE(SUM(amount), 0) FROM transactions
                WHERE user_id = ? AND category_id = ? AND type = 'EXPENSE'
                  AND transaction_date >= ? AND transaction_date < ?
                """, BigDecimal.class, user.getId(), category.getId(),
                java.sql.Date.valueOf(period.atDay(1)), java.sql.Date.valueOf(period.plusMonths(1).atDay(1)));
        assertThat(response.getSpentAmount()).isEqualByComparingTo(sum);
        assertThat(response.getRemainingAmount()).isEqualByComparingTo(response.getAmountLimit().subtract(sum));
    }

    private long budgetCount(User user, Category category, int year, int month) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM category_budgets WHERE user_id=? AND category_id=? AND year=? AND month=?",
                Long.class, user.getId(), category.getId(), year, month);
    }

    private void insertBudget(long userId, long categoryId) {
        jdbc.update("INSERT INTO category_budgets (user_id, category_id, year, month, amount_limit) VALUES (?, ?, 2026, 12, 999.00)",
                userId, categoryId);
    }

    private void assertSqlFailure(Throwable failure, int vendorCode, int httpStatus) {
        assertThat(failure).isInstanceOf(DataIntegrityViolationException.class);
        SQLException sql = null;
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException actual) sql = actual;
        }
        assertThat((Throwable) sql).isNotNull();
        assertThat(sql.getErrorCode()).isEqualTo(vendorCode);
        assertThat(sql.getSQLState()).isEqualTo("23000");
        var translated = new CategoryBudgetExceptionHandler().handleDataConflict((DataIntegrityViolationException) failure);
        assertThat(translated.getStatusCode().value()).isEqualTo(httpStatus);
        assertThat(translated.getBody().message()).doesNotContain("INSERT", "FOREIGN KEY", "Duplicate entry");
    }

    private void updateTransaction(Transaction transaction, Category category, String amount, String date) throws Exception {
        call(userA, HttpMethod.PUT, "/api/transactions/" + transaction.getId(), Map.of("categoryId", category.getId(),
                "type", "EXPENSE", "amount", new BigDecimal(amount), "transactionDate", date, "note", "D07 synthetic"))
                .andExpect(status().isOk());
    }

    private User owner() {
        User user = new User();
        user.setFullName("D07 synthetic owner");
        user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash(UUID.randomUUID().toString());
        return users.saveAndFlush(user);
    }

    private Category category(User user, TransactionType type) {
        Category category = new Category();
        category.setUser(user);
        category.setName("D07 " + type + " " + UUID.randomUUID());
        category.setType(type);
        return categories.saveAndFlush(category);
    }

    private Transaction transaction(User user, Category category, TransactionType type, String amount, String date) {
        Transaction transaction = new Transaction();
        transaction.setUser(user);
        transaction.setCategory(category);
        transaction.setType(type);
        transaction.setAmount(new BigDecimal(amount));
        transaction.setTransactionDate(LocalDate.parse(date));
        return transactions.saveAndFlush(transaction);
    }

    // Chỉ đồng bộ hai INSERT sau precheck thật; SQL và kết quả đọc/ghi không bị thay thế.
    public static class BudgetSql implements StatementInspector {
        static volatile CyclicBarrier barrier;
        static volatile boolean capture;
        static final Queue<String> selects = new ConcurrentLinkedQueue<>();

        @Override
        public String inspect(String sql) {
            String normalized = sql.stripLeading().toLowerCase(Locale.ROOT);
            if (capture && normalized.startsWith("select")) selects.add(normalized);
            CyclicBarrier active = barrier;
            if (active != null && normalized.startsWith("insert into category_budgets ")) {
                try {
                    active.await(20, TimeUnit.SECONDS);
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("D07 race interrupted", error);
                } catch (BrokenBarrierException | TimeoutException error) {
                    throw new IllegalStateException("D07 race: both inserts must reach the barrier", error);
                }
            }
            return sql;
        }
    }
}
