package com.smartexpense.backend;

import com.smartexpense.backend.dto.calendar.CalendarDayResponse;
import com.smartexpense.backend.dto.calendar.CalendarMonthResponse;
import com.smartexpense.backend.dto.dashboard.DashboardSummaryResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.Transaction;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import jakarta.persistence.EntityManager;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Query, JWT và SQL đều chạy thật trên MySQL tạm; rollback dữ liệu và xóa container sau lớp test.
@SpringBootTest(classes = BackendApplication.class,
        properties = "spring.config.location=classpath:/application-d03-test.properties")
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class CalendarIntegrationTests extends MySqlIntegrationTestSupport {

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder jwtEncoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired EntityManager entityManager;
    @Autowired JdbcTemplate jdbc;

    private User userA;
    private User userB;
    private Category incomeA;
    private Category expenseA;
    private Category incomeB;
    private Category expenseB;

    @BeforeEach
    void fixtures() throws Exception {
        verifyMySqlConnection();
        assertThat(users.count()).isZero();
        assertThat(categories.count()).isZero();
        assertThat(transactions.count()).isZero();
        userA = user("a");
        userB = user("b");
        incomeA = category(userA, TransactionType.INCOME);
        expenseA = category(userA, TransactionType.EXPENSE);
        incomeB = category(userB, TransactionType.INCOME);
        expenseB = category(userB, TransactionType.EXPENSE);
        entityManager.flush();
    }

    // Đối chiếu mỗi ngày với SQL độc lập và tổng tháng với Dashboard hiện có.
    @Test
    void aggregatesMultipleTransactionsAndMatchesSqlAndDashboard() throws Exception {
        save(incomeA, "2026-10-01", "100.10");
        save(incomeA, "2026-10-01", "200.20");
        save(expenseA, "2026-10-01", "30.05");
        save(category(userA, TransactionType.EXPENSE), "2026-10-01", "40.10");
        save(incomeA, "2026-10-15", "5.55");
        save(expenseA, "2026-10-31", "1.01");
        save(incomeB, "2026-10-01", "999.99");

        CalendarMonthResponse response = calendar(userA, 2026, 10);
        assertDay(response, 1, "300.30", "70.15");
        assertDay(response, 2, "0", "0");
        assertDay(response, 31, "0", "1.01");
        assertThat(response.incomeTotal()).isEqualByComparingTo("305.85");
        assertThat(response.expenseTotal()).isEqualByComparingTo("71.16");
        assertMatchesSqlAndDashboard(userA, response);
    }

    @Test
    void emptyMonthStillReturnsAllDaysAndZeroTotals() throws Exception {
        CalendarMonthResponse response = calendar(userA, 2026, 10);
        assertThat(response.days()).hasSize(31);
        assertThat(response.days()).allSatisfy(day -> {
            assertThat(day.incomeTotal()).isZero();
            assertThat(day.expenseTotal()).isZero();
        });
        assertThat(response.incomeTotal()).isZero();
        assertThat(response.expenseTotal()).isZero();
        assertMatchesSqlAndDashboard(userA, response);
    }

    // Kiểm tra năm nhuận thế kỷ và khoảng [đầu tháng, đầu tháng sau), không lọt dữ liệu ngoài kỳ.
    @ParameterizedTest
    @CsvSource({"2026,2,28", "2024,2,29", "1900,2,28", "2000,2,29", "2100,2,28",
            "2026,4,30", "2100,12,31"})
    void includesLastDayAndExcludesAdjacentMonths(int year, int month, int length) throws Exception {
        YearMonth period = YearMonth.of(year, month);
        save(incomeA, period.atDay(1).minusDays(1).toString(), "900.00");
        save(incomeA, period.atDay(1).toString(), "1.11");
        save(expenseA, period.atEndOfMonth().toString(), "2.22");
        save(expenseA, period.plusMonths(1).atDay(1).toString(), "800.00");
        entityManager.flush();
        entityManager.clear();

        CalendarMonthResponse response = calendar(userA, year, month);
        assertThat(response.days()).hasSize(length);
        assertThat(response.days()).extracting(CalendarDayResponse::date)
                .containsExactlyElementsOf(period.atDay(1).datesUntil(period.plusMonths(1).atDay(1)).toList());
        assertDay(response, 1, "1.11", "0");
        assertDay(response, length, "0", "2.22");
        assertThat(response.incomeTotal()).isEqualByComparingTo("1.11");
        assertThat(response.expenseTotal()).isEqualByComparingTo("2.22");
        assertMatchesSqlAndDashboard(userA, response);
    }

    // Query userId giả không thể thay owner lấy từ JWT, kể cả khi cả hai user cùng có giao dịch.
    @Test
    void eachJwtOnlySeesItsOwnDataAndIgnoresClientUserId() throws Exception {
        save(incomeA, "2026-10-01", "10.01");
        save(expenseA, "2026-10-02", "20.02");
        save(incomeB, "2026-10-01", "100.10");
        save(expenseB, "2026-10-03", "200.20");
        for (User owner : List.of(userA, userB)) {
            User other = owner == userA ? userB : userA;
            String body = mvc.perform(auth(get("/api/calendar/month")
                            .param("year", "2026").param("month", "10")
                            .param("userId", other.getId().toString()), owner))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            CalendarMonthResponse response = json.readValue(body, CalendarMonthResponse.class);
            assertThat(response.incomeTotal()).isEqualByComparingTo(owner == userA ? "10.01" : "100.10");
            assertThat(response.expenseTotal()).isEqualByComparingTo(owner == userA ? "20.02" : "200.20");
            assertMatchesSqlAndDashboard(owner, response);
        }
    }

    @Test
    void preservesCentsAndAllowsAggregateLargerThanOneTransactionLimit() throws Exception {
        save(incomeA, "2026-10-01", "0.10");
        save(incomeA, "2026-10-01", "0.20");
        save(expenseA, "2026-10-02", "9999999999999.99");
        save(expenseA, "2026-10-02", "9999999999999.99");
        entityManager.flush();
        entityManager.clear();

        CalendarMonthResponse response = calendar(userA, 2026, 10);
        assertDay(response, 1, "0.30", "0");
        assertDay(response, 2, "0", "19999999999999.98");
        assertThat(response.expenseTotal()).isEqualByComparingTo("19999999999999.98");
        assertMatchesSqlAndDashboard(userA, response);
    }

    // DATE phải giữ nguyên khi timezone phiên MySQL khác JVM; khôi phục phiên trước khi trả kết nối.
    @ParameterizedTest
    @ValueSource(strings = {"+00:00", "+07:00", "-08:00"})
    void datesRemainStableAcrossTimeZones(String zone) throws Exception {
        String previous = jdbc.queryForObject("SELECT @@session.time_zone", String.class);
        try {
            jdbc.update("SET SESSION time_zone = ?", zone);
            assertThat(jdbc.queryForObject("SELECT @@session.time_zone", String.class)).isEqualTo(zone);
            save(incomeA, "2024-02-29", "1.23");
            save(expenseA, "2024-03-01", "4.56");
            entityManager.flush();
            entityManager.clear();
            CalendarMonthResponse february = calendar(userA, 2024, 2);
            assertDay(february, 29, "1.23", "0");
            assertThat(february.expenseTotal()).isZero();
            CalendarMonthResponse march = calendar(userA, 2024, 3);
            assertDay(march, 1, "0", "4.56");
            assertThat(march.incomeTotal()).isZero();
            assertMatchesSqlAndDashboard(userA, february);
            assertMatchesSqlAndDashboard(userA, march);
        } finally {
            jdbc.update("SET SESSION time_zone = ?", previous);
        }
    }

    @Test
    void rejectsMissingJwtWithD02Error() throws Exception {
        mvc.perform(get("/api/calendar/month").param("year", "2026").param("month", "10"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void rejectsInvalidJwtWithD02Error() throws Exception {
        mvc.perform(get("/api/calendar/month").param("year", "2026").param("month", "10")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @ParameterizedTest
    @CsvSource(value = {"NULL,10", "2026,NULL", "NULL,NULL", "'',10", "2026,''", "bad,10",
            "2026,bad", "2026.5,10", "2026,1.5", "2147483648,10", "1899,10", "2101,10",
            "2026,0", "2026,13", "2026,-1"}, nullValues = "NULL")
    void rejectsInvalidPeriodWithD02Error(String year, String month) throws Exception {
        var request = get("/api/calendar/month");
        if (year != null) request.param("year", year);
        if (month != null) request.param("month", month);
        mvc.perform(auth(request, userA)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.trace").doesNotExist());
        assertThat(transactions.count()).isZero();
    }

    // Calendar phải phản ánh CRUD hiện có ngay sau thay đổi, không cache tổng cũ.
    @Test
    void reflectsCreateUpdateAndDeleteThroughExistingTransactionApi() throws Exception {
        String body = json.writeValueAsString(Map.of("categoryId", incomeA.getId(), "type", "INCOME",
                "amount", new BigDecimal("12.34"), "transactionDate", "2026-10-01"));
        String created = mvc.perform(auth(post("/api/transactions").contentType(MediaType.APPLICATION_JSON)
                        .content(body), userA)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long id = json.readTree(created).get("id").asLong();
        assertDay(calendar(userA, 2026, 10), 1, "12.34", "0");

        String updated = json.writeValueAsString(Map.of("categoryId", expenseA.getId(), "type", "EXPENSE",
                "amount", new BigDecimal("56.78"), "transactionDate", "2026-10-31"));
        mvc.perform(auth(put("/api/transactions/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content(updated), userA)).andExpect(status().isOk());
        CalendarMonthResponse afterUpdate = calendar(userA, 2026, 10);
        assertDay(afterUpdate, 1, "0", "0");
        assertDay(afterUpdate, 31, "0", "56.78");

        mvc.perform(auth(delete("/api/transactions/" + id), userA)).andExpect(status().isNoContent());
        CalendarMonthResponse afterDelete = calendar(userA, 2026, 10);
        assertThat(afterDelete.incomeTotal()).isZero();
        assertThat(afterDelete.expenseTotal()).isZero();
    }

    private CalendarMonthResponse calendar(User owner, int year, int month) throws Exception {
        entityManager.flush();
        String body = mvc.perform(auth(get("/api/calendar/month").param("year", String.valueOf(year))
                        .param("month", String.valueOf(month)), owner))
                .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.year").value(year)).andExpect(jsonPath("$.month").value(month))
                .andReturn().getResponse().getContentAsString();
        var tree = json.readTree(body);
        assertThat(tree.size()).isEqualTo(5);
        assertThat(tree.get("incomeTotal").isNumber()).isTrue();
        assertThat(tree.get("expenseTotal").isNumber()).isTrue();
        assertThat(tree.get("days").get(0).size()).isEqualTo(3);
        assertThat(tree.get("days").get(0).get("date").asString())
                .isEqualTo(YearMonth.of(year, month).atDay(1).toString());
        return json.readValue(body, CalendarMonthResponse.class);
    }

    private void assertMatchesSqlAndDashboard(User owner, CalendarMonthResponse response) throws Exception {
        entityManager.flush();
        YearMonth period = YearMonth.of(response.year(), response.month());
        var rows = jdbc.query("""
                SELECT transaction_date,
                       SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) AS income,
                       SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) AS expense
                FROM transactions
                WHERE user_id = ? AND transaction_date >= ? AND transaction_date < ?
                GROUP BY transaction_date
                """, (rs, index) -> new CalendarDayResponse(rs.getObject("transaction_date", LocalDate.class),
                        rs.getBigDecimal("income"), rs.getBigDecimal("expense")),
                owner.getId(), period.atDay(1), period.plusMonths(1).atDay(1));
        var byDate = rows.stream().collect(Collectors.toMap(CalendarDayResponse::date, Function.identity()));
        BigDecimal income = BigDecimal.ZERO;
        BigDecimal expense = BigDecimal.ZERO;
        for (var day : response.days()) {
            var expected = byDate.getOrDefault(day.date(),
                    new CalendarDayResponse(day.date(), BigDecimal.ZERO, BigDecimal.ZERO));
            assertThat(day.incomeTotal()).isEqualByComparingTo(expected.incomeTotal());
            assertThat(day.expenseTotal()).isEqualByComparingTo(expected.expenseTotal());
            income = income.add(day.incomeTotal());
            expense = expense.add(day.expenseTotal());
        }
        assertThat(response.incomeTotal()).isEqualByComparingTo(income);
        assertThat(response.expenseTotal()).isEqualByComparingTo(expense);
        String body = mvc.perform(auth(get("/api/dashboard/summary").param("month", period.toString()), owner))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var dashboard = json.readValue(body, DashboardSummaryResponse.class);
        assertThat(response.incomeTotal()).isEqualByComparingTo(dashboard.getTotalIncome());
        assertThat(response.expenseTotal()).isEqualByComparingTo(dashboard.getTotalExpense());
        assertThat(dashboard.getBalance()).isEqualByComparingTo(income.subtract(expense));
    }

    private void assertDay(CalendarMonthResponse response, int day, String income, String expense) {
        var value = response.days().get(day - 1);
        assertThat(value.date()).isEqualTo(LocalDate.of(response.year(), response.month(), day));
        assertThat(value.incomeTotal()).isEqualByComparingTo(income);
        assertThat(value.expenseTotal()).isEqualByComparingTo(expense);
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request, User owner) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(owner.getId().toString())
                .issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private User user(String name) {
        User user = new User();
        user.setFullName("Calendar test " + name);
        user.setEmail(name + UUID.randomUUID() + "@example.test");
        user.setPasswordHash(UUID.randomUUID().toString());
        return users.save(user);
    }

    private Category category(User owner, TransactionType type) {
        Category category = new Category();
        category.setUser(owner);
        category.setName("Calendar " + type + " " + UUID.randomUUID());
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
