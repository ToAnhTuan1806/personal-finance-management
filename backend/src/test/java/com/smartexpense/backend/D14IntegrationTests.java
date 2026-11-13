package com.smartexpense.backend;

import com.smartexpense.backend.dto.ai.AiChatResponse;
import com.smartexpense.backend.entity.*;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.service.AiProvider;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.Import;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// MySQL 8 tạm, JWT/HTTP/SQL thật. Không đọc cấu hình hoặc dữ liệu MySQL ứng dụng.
@SpringBootTest(classes = BackendApplication.class, properties = {
        "spring.config.location=classpath:/application-d03-test.properties",
        "spring.jpa.properties.hibernate.generate_statistics=true", "GEMINI_API_KEY=", "GEMINI_MODEL="
})
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import({MySqlIntegrationTestSupport.IsolatedDataSource.class, AiNluTestConfiguration.class})
class D14IntegrationTests extends MySqlIntegrationTestSupport {
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired MonthlyBudgetRepository monthlyBudgets;
    @Autowired CategoryBudgetRepository categoryBudgets;
    @Autowired EntityManager entityManager;
    @Autowired EntityManagerFactory entityManagerFactory;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean AiProvider provider;
    private User ownerA;
    private User ownerB;
    private Category expenseA;
    private Category expenseB;

    @BeforeEach
    void setup() throws Exception {
        verifyMySqlConnection();
        ownerA = user(); ownerB = user();
        expenseA = category(ownerA, "Ăn uống");
        expenseB = category(ownerB, "B_PRIVATE");
    }

    @ParameterizedTest
    @CsvSource({"0,0,00,Chưa phát sinh chi tiêu", "79.99,79,99,Đang chi tiêu trong hạn mức",
            "80,80,00,Gần đạt hạn mức", "100,100,00,Đã đạt hạn mức", "100.01,100,01,Đã vượt hạn mức"})
    void exactSqlAmountsDriveMonthlyAndCategoryAdvice(String amount, String whole, String fraction, String advice) throws Exception {
        budget(ownerA, expenseA, "2026-11", "100.00");
        budget(ownerB, expenseB, "2026-11", "999.99");
        if (!amount.equals("0")) save(expenseA, "2026-11-30", amount);
        save(expenseB, "2026-11-30", "999.99");
        var response = chat(ownerA, "Gợi ý ngân sách", "2026-11");
        assertBudgetAgainstSql(response, ownerA, expenseA, "100.00");
        assertThat(response.reply()).contains(advice, "Tỷ lệ sử dụng: " + whole + "," + fraction + "%")
                .doesNotContain("B_PRIVATE", "999,99");
        assertThat(response.topCategories()).isEmpty(); // Giữ contract D13.
        if (!amount.equals("0")) assertThat(response.reply()).contains("Danh mục \"Ăn uống\"");
        if (new BigDecimal(amount).compareTo(new BigDecimal("80")) < 0) {
            assertThat(response.reply()).doesNotContain("Cảnh báo:", "Gần đạt hạn mức");
        }
        var b = chat(ownerB, "Ngân sách", "2026-11");
        assertBudgetAgainstSql(b, ownerB, expenseB, "999.99");
        assertThat(b.reply()).doesNotContain("Ăn uống");
        verifyNoInteractions(provider);
    }

    @Test
    void sumsCentsExactlyAndDoesNotRoundBeforeThresholdComparison() throws Exception {
        budget(ownerA, expenseA, "2026-11", "1000.00");
        save(expenseA, "2026-11-01", "799.69");
        save(expenseA, "2026-11-30", "0.10"); save(expenseA, "2026-11-30", "0.20");
        var response = chat(ownerA, "Ngân sách", "2026-11");
        assertBudgetAgainstSql(response, ownerA, expenseA, "1000.00");
        assertThat(response.reply()).contains("Đã chi: 799,99 ₫", "Còn lại: 200,01 ₫", "Tỷ lệ sử dụng: 80,00%",
                "Đang chi tiêu trong hạn mức").doesNotContain("Cảnh báo:", "Gần đạt hạn mức");
        verifyNoInteractions(provider);
    }

    @ParameterizedTest
    @ValueSource(strings = {"2025-12", "2026-01", "2024-02"})
    void requestedPeriodOverridesPickerAndExcludesAdjacentMonths(String month) throws Exception {
        YearMonth period = YearMonth.parse(month);
        budget(ownerA, expenseA, month, "1.00");
        save(expenseA, period.atDay(1).minusDays(1).toString(), "777.77");
        save(expenseA, period.atDay(1).toString(), "0.10");
        save(expenseA, period.atEndOfMonth().toString(), "0.20");
        save(expenseA, period.plusMonths(1).atDay(1).toString(), "888.88");
        var result = chat(ownerA, "Gợi ý ngân sách tháng " + period.getMonthValue() + "/" + period.getYear(), "2026-11");
        assertThat(result.period()).isEqualTo(month);
        assertBudgetAgainstSql(result, ownerA, expenseA, "1.00");
        assertThat(result.reply()).contains("Đã chi: 0,30 ₫", "Còn lại: 0,70 ₫", "30,00%")
                .doesNotContain("777,77", "888,88");
    }

    @Test
    void emptyUnsetMonthIsExplicitAndDoesNotInventLimitOrHighSpendingCategory() throws Exception {
        budget(ownerB, expenseB, "2026-11", "999.99");
        save(expenseB, "2026-11-01", "999.99");
        var result = chat(ownerA, "Gợi ý ngân sách", "2026-11");
        assertThat(result.budget().status()).isEqualTo("NOT_SET");
        assertThat(result.budget().monthly()).isNull();
        assertThat(result.budget().categories()).isEmpty();
        assertThat(result.stats().totalExpense()).isZero();
        assertThat(result.reply()).contains("Chưa thiết lập ngân sách tổng", "Đã chi trong tháng: 0,00 ₫", "Chưa phát sinh chi tiêu")
                .doesNotContain("Tỷ lệ sử dụng:", "Hạn mức:", "B_PRIVATE", "Các danh mục chi nhiều nhất");
        verifyNoInteractions(provider);
    }

    @Test
    void highSpendingIncludesUnbudgetedCategoriesInStableTopFiveWithoutChangingDto() throws Exception {
        List<Category> tied = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            var item = category(ownerA, "Chi " + i); tied.add(item);
            save(item, "2026-11-01", "0.10");
        }
        save(expenseB, "2026-11-01", "999.99");
        var result = chat(ownerA, "Gợi ý ngân sách", "2026-11");
        assertThat(result.budget().monthly()).isNull();
        assertThat(result.topCategories()).isEmpty();
        assertThat(result.stats().totalExpense()).isEqualByComparingTo("0.70");
        String reply = result.reply();
        assertThat(reply).contains("Đã chi trong tháng: 0,70 ₫", "ưu tiên khoản thiết yếu")
                .doesNotContain("B_PRIVATE", "Chi 5", "Chi 6", "tăng hạn mức lên", "giảm hạn mức xuống");
        int previous = -1;
        for (var item : tied.subList(0, 5)) {
            String text = "Danh mục \"" + item.getName() + "\": 0,10 ₫ (tỷ trọng 14,29%)";
            assertThat(reply).contains(text);
            assertThat(reply.indexOf(text)).isGreaterThan(previous);
            previous = reply.indexOf(text);
        }
        verifyNoInteractions(provider);
    }

    @Test
    void categoryOnlyBudgetStillReceivesAdviceWithoutInferringMonthlyLimit() throws Exception {
        budget(ownerA, expenseA, "2026-11", "100.00");
        monthlyBudgets.findByUserIdAndYearAndMonth(ownerA.getId(), 2026, 11).ifPresent(monthlyBudgets::delete);
        save(expenseA, "2026-11-01", "80.00");
        var result = chat(ownerA, "Ngân sách", "2026-11");
        assertThat(result.budget().monthly()).isNull();
        assertThat(result.budget().categories()).hasSize(1);
        assertThat(result.reply()).contains("Chưa thiết lập ngân sách tổng", "Ngân sách danh mục \"Ăn uống\"",
                "Gần đạt hạn mức", "80,00%");
    }

    @ParameterizedTest
    @CsvSource({"Xin chào,UNKNOWN", "Sửa ngân sách,UNSUPPORTED", "Ngân sách; DROP TABLE transactions,UNSUPPORTED",
            "Ngân sách tài khoản khác,UNSUPPORTED", "Ngân sách' OR 1=1 --,BUDGET"})
    void unknownUnsupportedAndInjectionNeverWriteOrExposeOtherOwner(String prompt, String intent) throws Exception {
        save(expenseA, "2026-11-01", "0.30"); save(expenseB, "2026-11-01", "999.99");
        var result = chat(ownerA, prompt, "2026-11");
        assertThat(result.intent()).isEqualTo(intent);
        assertThat(result.reply()).doesNotContain("B_PRIVATE", "999,99", "stackTrace");
        if (intent.equals("BUDGET")) assertThat(result.stats().totalExpense()).isEqualByComparingTo("0.30");
        else assertThat(result.stats()).isNull();
        verifyNoInteractions(provider);
    }

    private void assertBudgetAgainstSql(AiChatResponse response, User owner, Category category, String limit) {
        YearMonth period = YearMonth.parse(response.period());
        BigDecimal sql = jdbc.queryForObject("""
                SELECT COALESCE(SUM(amount),0) FROM transactions
                WHERE user_id=? AND type='EXPENSE' AND transaction_date>=? AND transaction_date<?
                """, BigDecimal.class, owner.getId(), period.atDay(1), period.plusMonths(1).atDay(1));
        assertThat(response.stats().totalExpense()).isEqualByComparingTo(sql);
        assertThat(response.budget().monthly().getSpentAmount()).isEqualByComparingTo(sql);
        assertThat(response.budget().monthly().getRemainingAmount()).isEqualByComparingTo(new BigDecimal(limit).subtract(sql));
        assertThat(response.budget().categories()).hasSize(1);
        var item = response.budget().categories().getFirst();
        assertThat(item.getCategoryId()).isEqualTo(category.getId());
        assertThat(item.getSpentAmount()).isEqualByComparingTo(sql);
        assertThat(item.getRemainingAmount()).isEqualByComparingTo(new BigDecimal(limit).subtract(sql));
    }

    private AiChatResponse chat(User owner, String prompt, String month) throws Exception {
        entityManager.flush();
        Map<String, List<Map<String, Object>>> before = snapshot();
        var statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics(); statistics.clear();
        String result = mvc.perform(post("/api/ai/chat").header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                                "message", prompt, "month", month, "userId", owner == ownerA ? ownerB.getId() : ownerA.getId()))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.*", org.hamcrest.Matchers.hasSize(6)))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        entityManager.flush(); // Phát hiện cả dirty checking sau request.
        assertThat(statistics.getEntityInsertCount()).isZero();
        assertThat(statistics.getEntityUpdateCount()).isZero();
        assertThat(statistics.getEntityDeleteCount()).isZero();
        assertThat(snapshot()).isEqualTo(before);
        return json.readValue(result, AiChatResponse.class);
    }

    private Map<String, List<Map<String, Object>>> snapshot() {
        Map<String, List<Map<String, Object>>> result = new LinkedHashMap<>();
        for (String table : List.of("users", "categories", "transactions", "monthly_budgets", "category_budgets")) {
            result.put(table, jdbc.queryForList("SELECT * FROM " + table + " ORDER BY id")); // Allowlist cố định.
        }
        return result;
    }

    private User user() {
        User user = new User(); user.setFullName("D14 test"); user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash(UUID.randomUUID().toString()); return users.save(user);
    }

    private Category category(User owner, String name) {
        Category category = new Category(); category.setUser(owner); category.setName(name); category.setType(TransactionType.EXPENSE);
        return categories.save(category);
    }

    private void budget(User owner, Category category, String month, String limit) {
        YearMonth period = YearMonth.parse(month);
        MonthlyBudget monthly = new MonthlyBudget(); monthly.setUser(owner); monthly.setYear(period.getYear());
        monthly.setMonth(period.getMonthValue()); monthly.setAmountLimit(new BigDecimal(limit)); monthlyBudgets.save(monthly);
        CategoryBudget item = new CategoryBudget(); item.setUser(owner); item.setCategory(category);
        item.setYear(period.getYear()); item.setMonth(period.getMonthValue()); item.setAmountLimit(new BigDecimal(limit)); categoryBudgets.save(item);
    }

    private void save(Category category, String date, String amount) {
        Transaction transaction = new Transaction(); transaction.setUser(category.getUser()); transaction.setCategory(category);
        transaction.setType(category.getType()); transaction.setTransactionDate(LocalDate.parse(date));
        transaction.setAmount(new BigDecimal(amount)); transactions.save(transaction);
    }

    private String bearer(User owner) {
        Instant now = Instant.now();
        return "Bearer " + encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(owner.getId().toString()).issuedAt(now).expiresAt(now.plusSeconds(600)).build())).getTokenValue();
    }
}
