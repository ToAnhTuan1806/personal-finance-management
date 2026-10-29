package com.smartexpense.backend;

import com.smartexpense.backend.dto.calendar.CalendarDayResponse;
import com.smartexpense.backend.dto.calendar.CalendarMonthResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.Test;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Đo truy vấn trên dữ liệu tổng hợp trong container riêng; không dùng ngưỡng thời gian dễ làm CI chập chờn.
@SpringBootTest(classes = BackendApplication.class, properties = {
        "spring.config.location=classpath:/application-d03-test.properties",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=com.smartexpense.backend.CalendarQueryIntegrationTests$CaptureSql"})
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
public class CalendarQueryIntegrationTests extends MySqlIntegrationTestSupport {

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder jwtEncoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired EntityManager entityManager;
    @Autowired JdbcTemplate jdbc;

    @Test
    void explainsRealCalendarSqlAndMeasuresNinetyThousandIsolatedRows() throws Exception {
        verifyMySqlConnection();
        assertThat(transactions.count()).isZero();
        assertThat(users.count()).isZero();
        assertThat(categories.count()).isZero();
        YearMonth selected = YearMonth.of(2026, 10);
        List<User> owners = new ArrayList<>();
        for (int ownerIndex = 0; ownerIndex < 3; ownerIndex++) {
            User owner = user();
            owners.add(owner);
            Category income = category(owner, TransactionType.INCOME);
            Category expense = category(owner, TransactionType.EXPENSE);
            entityManager.flush();
            for (int delta = -1; delta <= 1; delta++) {
                seedTenThousand(owner, income, expense, selected.plusMonths(delta), 2 * ownerIndex + 1);
            }
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM transactions", Long.class)).isEqualTo(90_000L);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM transactions
                WHERE user_id = ? AND transaction_date >= ? AND transaction_date < ?
                """, Long.class, owners.getFirst().getId(), selected.atDay(1),
                selected.plusMonths(1).atDay(1))).isEqualTo(10_000L);

        // Làm nóng hai lần, sau đó đo năm lần query Repository gồm cả đọc projection; không gồm tạo dữ liệu.
        for (int i = 0; i < 2; i++) query(owners.getFirst(), selected);
        double[] milliseconds = new double[5];
        for (int i = 0; i < milliseconds.length; i++) {
            long start = System.nanoTime();
            var rows = query(owners.getFirst(), selected);
            milliseconds[i] = (System.nanoTime() - start) / 1_000_000.0;
            assertThat(rows).hasSize(62);
        }

        CalendarMonthResponse response;
        List<String> statements;
        CaptureSql.begin();
        try {
            response = calendar(owners.getFirst(), selected, owners.get(1).getId());
            statements = CaptureSql.snapshot();
        } finally {
            CaptureSql.end();
        }
        // Kiểm chứng API chỉ gọi một SELECT tổng hợp, không N+1 hoặc tải toàn bộ Transaction.
        assertThat(statements).hasSize(1);
        String sql = statements.getFirst();
        assertThat(sql.toLowerCase(Locale.ROOT)).contains("sum(", "group by", "transaction_date");
        assertThat(response.days()).hasSize(31);
        assertExpectedDays(response, selected);
        for (int i = 0; i < owners.size(); i++) {
            int multiplier = 2 * i + 1;
            CalendarMonthResponse own = calendar(owners.get(i), selected, owners.get((i + 1) % 3).getId());
            assertThat(own.incomeTotal()).isEqualByComparingTo(new BigDecimal("250000.00")
                    .multiply(BigDecimal.valueOf(multiplier)));
            assertThat(own.expenseTotal()).isEqualByComparingTo(new BigDecimal("250050.00")
                    .multiply(BigDecimal.valueOf(multiplier)));
        }

        // EXPLAIN đúng SQL Hibernate vừa thực thi với cùng owner/khoảng ngày, không thêm FORCE INDEX.
        List<Map<String, Object>> plan = jdbc.queryForList("EXPLAIN " + sql,
                owners.getFirst().getId(), selected.atDay(1), selected.plusMonths(1).atDay(1));
        assertThat(plan).isNotEmpty();
        assertThat(plan).anySatisfy(row ->
                assertThat(String.valueOf(row.get("possible_keys"))).contains("idx_transactions_user_date"));
        List<String> indexColumns = jdbc.queryForList("SHOW INDEX FROM transactions").stream()
                .filter(row -> "idx_transactions_user_date".equals(row.get("Key_name")))
                .sorted(Comparator.comparingInt(row -> ((Number) row.get("Seq_in_index")).intValue()))
                .map(row -> row.get("Column_name").toString()).toList();
        assertThat(indexColumns).containsExactly("user_id", "transaction_date");
        double[] sorted = milliseconds.clone();
        Arrays.sort(sorted);
        System.out.printf(Locale.ROOT,
                "D05 CALENDAR mysql=%s users=3 monthsPerUser=3 totalRows=90000 selectedRows=10000 groups=62 "
                        + "warmup=2 samples=5 queryMs=%s minMs=%.3f medianMs=%.3f maxMs=%.3f%n",
                jdbc.queryForObject("SELECT VERSION()", String.class), Arrays.toString(milliseconds),
                sorted[0], sorted[2], sorted[4]);
        System.out.println("D05 CALENDAR SQL " + sql);
        System.out.println("D05 CALENDAR EXPLAIN " + json.writeValueAsString(plan));
    }

    private List<TransactionRepository.DailyAmountTotal> query(User owner, YearMonth period) {
        return transactions.sumDailyAmountsByUserAndDateRange(owner.getId(),
                period.atDay(1), period.plusMonths(1).atDay(1));
    }

    // Chèn 10.000 dòng bằng SQL vào schema test đã xác nhận; mỗi owner có mức tiền khác nhau.
    private void seedTenThousand(User owner, Category income, Category expense, YearMonth period, int multiplier) {
        String digits = IntStream.range(0, 10).mapToObj(i -> "SELECT " + i + " AS n")
                .collect(Collectors.joining(" UNION ALL "));
        String sql = """
                INSERT INTO transactions (user_id, category_id, type, amount, transaction_date, created_at)
                SELECT ?, CASE WHEN MOD(s.n, 2) = 0 THEN ? ELSE ? END,
                       CASE WHEN MOD(s.n, 2) = 0 THEN 'INCOME' ELSE 'EXPENSE' END,
                       (s.n + 1) * ? / 100,
                       DATE_ADD(?, INTERVAL MOD(FLOOR(s.n / 2), ?) DAY), CURRENT_TIMESTAMP
                FROM (
                    SELECT a.n + 10 * b.n + 100 * c.n + 1000 * d.n AS n
                    FROM (%s) a CROSS JOIN (%s) b CROSS JOIN (%s) c CROSS JOIN (%s) d
                ) s
                """.formatted(digits, digits, digits, digits);
        assertThat(jdbc.update(sql, owner.getId(), income.getId(), expense.getId(),
                multiplier, period.atDay(1), period.lengthOfMonth())).isEqualTo(10_000);
    }

    private void assertExpectedDays(CalendarMonthResponse response, YearMonth period) {
        Map<LocalDate, BigDecimal> income = new HashMap<>();
        Map<LocalDate, BigDecimal> expense = new HashMap<>();
        for (int i = 0; i < 10_000; i++) {
            LocalDate date = period.atDay(1 + (i / 2) % period.lengthOfMonth());
            BigDecimal amount = BigDecimal.valueOf(i + 1, 2);
            (i % 2 == 0 ? income : expense).merge(date, amount, BigDecimal::add);
        }
        assertThat(response.days()).extracting(CalendarDayResponse::date)
                .containsExactlyElementsOf(period.atDay(1).datesUntil(period.plusMonths(1).atDay(1)).toList());
        for (CalendarDayResponse day : response.days()) {
            assertThat(day.incomeTotal()).isEqualByComparingTo(income.getOrDefault(day.date(), BigDecimal.ZERO));
            assertThat(day.expenseTotal()).isEqualByComparingTo(expense.getOrDefault(day.date(), BigDecimal.ZERO));
        }
    }

    private CalendarMonthResponse calendar(User owner, YearMonth period, Long fakeOwner) throws Exception {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(owner.getId().toString())
                .issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        String body = mvc.perform(get("/api/calendar/month")
                        .param("year", String.valueOf(period.getYear()))
                        .param("month", String.valueOf(period.getMonthValue()))
                        .param("userId", fakeOwner.toString())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readValue(body, CalendarMonthResponse.class);
    }

    private User user() {
        User owner = new User();
        owner.setFullName("D05 performance test");
        owner.setEmail(UUID.randomUUID() + "@example.test");
        owner.setPasswordHash(UUID.randomUUID().toString());
        return users.save(owner);
    }

    private Category category(User owner, TransactionType type) {
        Category category = new Category();
        category.setUser(owner);
        category.setName("D05 " + type);
        category.setType(type);
        return categories.save(category);
    }

    // Chỉ giữ SQL có placeholder trong đúng luồng đo, không ghi tham số hoặc JWT.
    public static class CaptureSql implements StatementInspector {
        private static final ThreadLocal<List<String>> ACTIVE = new ThreadLocal<>();

        static void begin() { ACTIVE.set(new ArrayList<>()); }
        static List<String> snapshot() { return List.copyOf(ACTIVE.get()); }
        static void end() { ACTIVE.remove(); }

        @Override
        public String inspect(String sql) {
            List<String> statements = ACTIVE.get();
            if (statements != null) statements.add(sql);
            return sql;
        }
    }
}
