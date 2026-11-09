package com.smartexpense.backend;

import com.smartexpense.backend.dto.dashboard.DashboardSummaryResponse;
import com.smartexpense.backend.dto.report.MonthlyReportResponse;
import com.smartexpense.backend.dto.report.MonthlySummaryResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.Transaction;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// JWT/HTTP/JPQL/SQL thật trên MySQL tạm; không kết nối database ứng dụng.
@SpringBootTest(classes = BackendApplication.class, properties = {
        "spring.config.location=classpath:/application-d03-test.properties",
        "spring.jpa.properties.hibernate.generate_statistics=true"
})
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class ReportIntegrationTests extends MySqlIntegrationTestSupport {

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired EntityManager entityManager;
    @Autowired EntityManagerFactory entityManagerFactory;
    @Autowired JdbcTemplate jdbc;

    private User userA;
    private User userB;
    private Category incomeA;
    private Category expenseA;
    private Category expenseB;

    @BeforeEach
    void fixtures() throws Exception {
        verifyMySqlConnection();
        assertThat(transactions.count()).isZero();
        userA = user("A");
        userB = user("B");
        incomeA = category(userA, "Lương", TransactionType.INCOME);
        expenseA = category(userA, "Ăn uống", TransactionType.EXPENSE);
        expenseB = category(userB, "Riêng B", TransactionType.EXPENSE);
    }

    @Test
    void aggregatesMonthAndCategoriesByIdAndMatchesDashboardAndSql() throws Exception {
        Category sameName = category(userA, "Ăn uống", TransactionType.EXPENSE);
        save(incomeA, "2026-09-01", "15000000.10");
        save(incomeA, "2026-09-30", "0.20");
        save(expenseA, "2026-09-01", "10.10");
        save(expenseA, "2026-09-30", "20.20");
        save(sameName, "2026-09-15", "50.05");
        save(expenseB, "2026-09-15", "999.99");

        var response = report(userA, "2026-09", "2026-09");
        assertMonth(response.months().getFirst(), "2026-09", "15000000.30", "80.35");
        assertThat(response.expensesByCategory()).hasSize(2);
        assertThat(response.expensesByCategory()).extracting(value -> value.getCategoryId())
                .containsExactly(sameName.getId(), expenseA.getId());
        assertThat(response.expensesByCategory().get(0).getTotalAmount()).isEqualByComparingTo("50.05");
        assertThat(response.expensesByCategory().get(1).getTotalAmount()).isEqualByComparingTo("30.30");
        assertMatchesDashboardAndSql(userA, response);
    }

    @Test
    void fillsEmptyMiddleMonthAndAggregatesCategoriesAcrossWholeRange() throws Exception {
        save(incomeA, "2026-08-31", "900.00");
        save(incomeA, "2026-09-01", "100.10");
        save(expenseA, "2026-09-30", "20.05");
        save(expenseA, "2026-11-30", "30.15");
        save(expenseA, "2026-12-01", "800.00");
        var response = report(userA, "2026-09", "2026-11");
        assertThat(response.months()).extracting(MonthlySummaryResponse::month)
                .containsExactly("2026-09", "2026-10", "2026-11");
        assertMonth(response.months().get(1), "2026-10", "0", "0");
        assertMonth(response.months().get(2), "2026-11", "0", "30.15");
        assertThat(response.expensesByCategory()).hasSize(1);
        assertThat(response.expensesByCategory().getFirst().getTotalAmount()).isEqualByComparingTo("50.20");
        assertMatchesDashboardAndSql(userA, response);
    }

    @Test
    void sixMonthsUseOnlyTwoSelectsWithoutLoadingTransactionEntities() throws Exception {
        for (int month = 1; month <= 6; month++) {
            for (int count = 0; count < 20; count++) {
                save(expenseA, YearMonth.of(2026, month).atEndOfMonth().toString(), "0.10");
            }
        }
        entityManager.flush();
        entityManager.clear();
        var statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        var response = report(userA, "2026-01", "2026-06");
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
        assertThat(statistics.getEntityLoadCount()).isZero();
        assertThat(response.months()).hasSize(6).allSatisfy(month -> {
            assertThat(month.totalIncome()).isZero();
            assertThat(month.totalExpense()).isEqualByComparingTo("2.00");
        });
        assertThat(response.expensesByCategory().getFirst().getTotalAmount()).isEqualByComparingTo("12.00");
        assertMatchesDashboardAndSql(userA, response);
    }

    @ParameterizedTest
    @CsvSource({"2026-12,2027-01", "1900-01,1900-01", "2100-12,2100-12"})
    void includesBothBoundariesAndExcludesAdjacentMonths(String from, String to) throws Exception {
        YearMonth first = YearMonth.parse(from);
        YearMonth last = YearMonth.parse(to);
        save(incomeA, first.atDay(1).minusDays(1).toString(), "900.00");
        save(incomeA, first.atDay(1).toString(), "1.11");
        save(expenseA, last.atEndOfMonth().toString(), "2.22");
        save(expenseA, last.plusMonths(1).atDay(1).toString(), "800.00");
        var response = report(userA, from, to);
        assertThat(response.months().getFirst().totalIncome()).isEqualByComparingTo("1.11");
        assertThat(response.months().getLast().totalExpense()).isEqualByComparingTo("2.22");
        assertThat(response.expensesByCategory().getFirst().getTotalAmount()).isEqualByComparingTo("2.22");
        assertMatchesDashboardAndSql(userA, response);
    }

    @Test
    void emptyRangeReturnsZeroForEveryMonthAndNoCategories() throws Exception {
        var response = report(userA, "2026-09", "2026-11");
        assertThat(response.months()).hasSize(3).allSatisfy(month -> {
            assertThat(month.totalIncome()).isZero();
            assertThat(month.totalExpense()).isZero();
            assertThat(month.balance()).isZero();
        });
        assertThat(response.expensesByCategory()).isEmpty();
        assertMatchesDashboardAndSql(userA, response);
    }

    @Test
    void jwtOwnerCannotBeOverriddenByClientUserId() throws Exception {
        save(incomeA, "2026-10-01", "100.10");
        save(expenseA, "2026-10-15", "20.02");
        save(expenseB, "2026-10-15", "999.99");
        for (User owner : List.of(userA, userB)) {
            var response = report(owner, "2026-10", "2026-10");
            assertMonth(response.months().getFirst(), "2026-10", owner == userA ? "100.10" : "0",
                    owner == userA ? "20.02" : "999.99");
            assertThat(response.expensesByCategory()).hasSize(1);
            assertThat(response.expensesByCategory().getFirst().getCategoryId())
                    .isEqualTo(owner == userA ? expenseA.getId() : expenseB.getId());
            assertMatchesDashboardAndSql(owner, response);
        }
    }

    @Test
    void keepsCentsAndAggregatesBeyondSingleTransactionLimit() throws Exception {
        save(incomeA, "2026-10-01", "0.10");
        save(incomeA, "2026-10-01", "0.20");
        save(expenseA, "2026-10-31", "9999999999999.99");
        save(expenseA, "2026-10-31", "9999999999999.99");
        var response = report(userA, "2026-10", "2026-10");
        assertMonth(response.months().getFirst(), "2026-10", "0.30", "19999999999999.98");
        assertThat(response.expensesByCategory().getFirst().getTotalAmount())
                .isEqualByComparingTo("19999999999999.98");
        assertMatchesDashboardAndSql(userA, response);
    }

    private MonthlyReportResponse report(User owner, String from, String to) throws Exception {
        entityManager.flush();
        String body = mvc.perform(get("/api/reports/monthly").param("from", from).param("to", to)
                        .param("userId", (owner == userA ? userB : userA).getId().toString())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.from").value(from))
                .andExpect(jsonPath("$.to").value(to)).andReturn().getResponse().getContentAsString();
        return json.readValue(body, MonthlyReportResponse.class);
    }

    private void assertMatchesDashboardAndSql(User owner, MonthlyReportResponse response) throws Exception {
        for (var month : response.months()) {
            YearMonth period = YearMonth.parse(month.month());
            String body = mvc.perform(get("/api/dashboard/summary").param("month", month.month())
                            .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            var dashboard = json.readValue(body, DashboardSummaryResponse.class);
            assertThat(month.totalIncome()).isEqualByComparingTo(dashboard.getTotalIncome());
            assertThat(month.totalExpense()).isEqualByComparingTo(dashboard.getTotalExpense());
            assertThat(month.balance()).isEqualByComparingTo(dashboard.getBalance());
            for (TransactionType type : TransactionType.values()) {
                BigDecimal sql = jdbc.queryForObject("""
                        SELECT COALESCE(SUM(amount), 0) FROM transactions
                        WHERE user_id = ? AND type = ? AND transaction_date >= ? AND transaction_date < ?
                        """, BigDecimal.class, owner.getId(), type.name(), period.atDay(1),
                        period.plusMonths(1).atDay(1));
                assertThat(type == TransactionType.INCOME ? month.totalIncome() : month.totalExpense())
                        .isEqualByComparingTo(sql);
            }
        }
        var expected = jdbc.query("""
                SELECT category_id, SUM(amount) AS total FROM transactions
                WHERE user_id = ? AND type = 'EXPENSE' AND transaction_date >= ? AND transaction_date < ?
                GROUP BY category_id ORDER BY SUM(amount) DESC
                """, (rs, index) -> java.util.Map.entry(rs.getLong("category_id"), rs.getBigDecimal("total")),
                owner.getId(), YearMonth.parse(response.from()).atDay(1),
                YearMonth.parse(response.to()).plusMonths(1).atDay(1));
        assertThat(response.expensesByCategory()).hasSize(expected.size());
        for (int index = 0; index < expected.size(); index++) {
            assertThat(response.expensesByCategory().get(index).getCategoryId()).isEqualTo(expected.get(index).getKey());
            assertThat(response.expensesByCategory().get(index).getTotalAmount())
                    .isEqualByComparingTo(expected.get(index).getValue());
        }
    }

    private void assertMonth(MonthlySummaryResponse month, String period, String income, String expense) {
        assertThat(month.month()).isEqualTo(period);
        assertThat(month.totalIncome()).isEqualByComparingTo(income);
        assertThat(month.totalExpense()).isEqualByComparingTo(expense);
        assertThat(month.balance()).isEqualByComparingTo(new BigDecimal(income).subtract(new BigDecimal(expense)));
    }

    private String bearer(User owner) {
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder().subject(owner.getId().toString())
                .issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return "Bearer " + encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    private User user(String suffix) {
        User user = new User();
        user.setFullName("Report test " + suffix);
        user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash(UUID.randomUUID().toString());
        return users.save(user);
    }

    private Category category(User owner, String name, TransactionType type) {
        Category category = new Category();
        category.setUser(owner);
        category.setName(name);
        category.setType(type);
        return categories.save(category);
    }

    private void save(Category category, String date, String amount) {
        Transaction transaction = new Transaction();
        transaction.setUser(category.getUser());
        transaction.setCategory(category);
        transaction.setType(category.getType());
        transaction.setTransactionDate(LocalDate.parse(date));
        transaction.setAmount(new BigDecimal(amount));
        transactions.save(transaction);
    }
}
