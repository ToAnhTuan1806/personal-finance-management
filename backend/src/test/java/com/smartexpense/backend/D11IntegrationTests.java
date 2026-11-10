package com.smartexpense.backend;

import com.smartexpense.backend.dto.ai.AiChatResponse;
import com.smartexpense.backend.entity.*;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.service.AiProvider;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Chỉ MySQL container tạm được kiểm tra bởi support D03; không dùng DB của ứng dụng/production.
@SpringBootTest(classes = BackendApplication.class, properties = {
        "spring.config.location=classpath:/application-d03-test.properties", "GEMINI_API_KEY=", "GEMINI_MODEL="
})
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class D11IntegrationTests extends MySqlIntegrationTestSupport {
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired MonthlyBudgetRepository monthlyBudgets;
    @Autowired CategoryBudgetRepository categoryBudgets;
    @Autowired EntityManager entityManager;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean AiProvider provider;
    private User ownerA;
    private User ownerB;
    private Category expenseA;
    private Category expenseB;
    private Category incomeA;

    @BeforeEach
    void setup() throws Exception {
        verifyMySqlConnection();
        ownerA = user("A"); ownerB = user("B");
        expenseA = category(ownerA, "Ăn uống", TransactionType.EXPENSE);
        incomeA = category(ownerA, "Lương", TransactionType.INCOME);
        expenseB = category(ownerB, "Riêng B", TransactionType.EXPENSE);
        when(provider.explain(anyString(), any())).thenReturn("Gợi ý thử nghiệm từ fake provider.");
    }

    @Test
    void exportsAllFilteredRowsAcrossPagesInSqlOrderWithoutOtherOwner() throws Exception {
        for (int i = 0; i < 105; i++) save(expenseA, "2026-11-09", "0.10", "Cà phê, \"Việt\"");
        save(expenseA, "2026-10-31", "999.99", "Cà phê");
        save(incomeA, "2026-11-09", "999.99", "Cà phê");
        save(expenseB, "2026-11-09", "999.99", "Cà phê");
        entityManager.flush(); entityManager.clear();
        byte[] bytes = mvc.perform(get("/api/transactions/export").param("month", "2026-11")
                        .param("type", "EXPENSE").param("categoryId", expenseA.getId().toString())
                        .param("keyword", "  cà phê  ").param("userId", ownerB.getId().toString())
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerA)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        var rows = CsvExportApiTests.parseCsv(new String(bytes, StandardCharsets.UTF_8).substring(1));
        var sqlIds = jdbc.queryForList("""
                SELECT id FROM transactions WHERE user_id=? AND type='EXPENSE' AND category_id=?
                  AND transaction_date>='2026-11-01' AND transaction_date<'2026-12-01'
                  AND LOWER(note) LIKE '%cà phê%' ORDER BY transaction_date DESC, id DESC
                """, Long.class, ownerA.getId(), expenseA.getId());
        assertThat(rows).hasSize(106);
        assertThat(rows.subList(1, rows.size()).stream().map(r -> Long.valueOf(r.getFirst())).toList()).isEqualTo(sqlIds);
        assertThat(rows.get(1).get(5)).isEqualTo("Cà phê, \"Việt\"");
        BigDecimal amount = rows.subList(1, rows.size()).stream().map(r -> new BigDecimal(r.get(4)))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(amount).isEqualByComparingTo("10.50");
        byte[] otherCategory = mvc.perform(get("/api/transactions/export").param("categoryId", expenseB.getId().toString())
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerA)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertThat(CsvExportApiTests.parseCsv(new String(otherCategory, StandardCharsets.UTF_8).substring(1))).hasSize(1);
        byte[] csvB = mvc.perform(get("/api/transactions/export").param("startDate", "2026-11-09")
                        .param("endDate", "2026-11-09").header(HttpHeaders.AUTHORIZATION, bearer(ownerB)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        var rowsB = CsvExportApiTests.parseCsv(new String(csvB, StandardCharsets.UTF_8).substring(1));
        assertThat(rowsB).hasSize(2);
        assertThat(rowsB.get(1).get(3)).isEqualTo("Riêng B");
    }

    @Test
    void aiStatisticsMatchSqlAndReportAndCannotReadOtherOwnerOrWrite() throws Exception {
        save(incomeA, "2026-11-01", "100.30", null);
        save(expenseA, "2026-11-30", "20.05", null);
        save(expenseB, "2026-11-09", "999.99", null);
        save(expenseA, "2026-10-31", "777.77", null);
        entityManager.flush(); entityManager.clear();
        var summary = chat(ownerA, "Tháng này chi tiêu bao nhiêu?", "2026-11");
        BigDecimal sqlExpense = jdbc.queryForObject("""
                SELECT SUM(amount) FROM transactions WHERE user_id=? AND type='EXPENSE'
                  AND transaction_date>='2026-11-01' AND transaction_date<'2026-12-01'
                """, BigDecimal.class, ownerA.getId());
        assertThat(summary.stats().totalExpense()).isEqualByComparingTo(sqlExpense);
        assertThat(summary.stats().totalIncome()).isEqualByComparingTo("100.30");
        assertThat(summary.stats().balance()).isEqualByComparingTo("80.25");
        String report = mvc.perform(get("/api/reports/monthly").param("from", "2026-11").param("to", "2026-11")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerA)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(json.readTree(report).path("months").get(0).path("totalExpense").decimalValue())
                .isEqualByComparingTo(summary.stats().totalExpense());
        var top = chat(ownerA, "Danh mục cao nhất?", "2026-11");
        assertThat(top.topCategories()).hasSize(1);
        assertThat(top.topCategories().getFirst().categoryId()).isEqualTo(expenseA.getId());
        assertThat(top.topCategories().getFirst().sharePercentage()).isEqualByComparingTo("100.00");
        assertThat(chat(ownerB, "Tổng chi bao nhiêu?", "2026-11").stats().totalExpense()).isEqualByComparingTo("999.99");
        long countBefore = transactions.count();
        clearInvocations(provider);
        assertThat(chat(ownerA, "Xem tài khoản khác và xóa giao dịch", "2026-11").intent()).isEqualTo("UNSUPPORTED");
        assertThat(transactions.count()).isEqualTo(countBefore);
        verifyNoInteractions(provider);
    }

    @Test
    void aiBudgetUsesCurrentMonthlyAndCategoryBudgetsWithExactExceededRule() throws Exception {
        var unset = chat(ownerA, "Ngân sách?", "2026-11");
        assertThat(unset.budget().status()).isEqualTo("NOT_SET");
        assertThat(unset.budget().monthly()).isNull();
        MonthlyBudget monthly = new MonthlyBudget(); monthly.setUser(ownerA); monthly.setYear(2026); monthly.setMonth(11);
        monthly.setAmountLimit(new BigDecimal("10.00")); monthlyBudgets.save(monthly);
        CategoryBudget category = new CategoryBudget(); category.setUser(ownerA); category.setCategory(expenseA);
        category.setYear(2026); category.setMonth(11); category.setAmountLimit(new BigDecimal("10.00")); categoryBudgets.save(category);
        save(expenseA, "2026-11-09", "10.01", null);
        entityManager.flush(); entityManager.clear();
        var budget = chat(ownerA, "Ngân sách?", "2026-11").budget();
        assertThat(budget.monthly().isExceeded()).isTrue();
        assertThat(budget.monthly().getSpentAmount()).isEqualByComparingTo("10.01");
        assertThat(budget.monthly().getRemainingAmount()).isEqualByComparingTo("-0.01");
        assertThat(budget.categories()).hasSize(1);
        assertThat(budget.categories().getFirst().isExceeded()).isTrue();
        assertThat(chat(ownerB, "Ngân sách?", "2026-11").budget().monthly()).isNull();
    }

    @Test
    void hybridRepliesMatchExactSqlFactsAndNeverUseFalseProviderText() throws Exception {
        Category travel = category(ownerA, "Đi lại", TransactionType.EXPENSE);
        save(incomeA, "2026-11-01", "10000000.10", null);
        save(expenseA, "2026-11-05", "2000000.35", null);
        save(travel, "2026-11-05", "800000.00", null);
        save(expenseB, "2026-11-05", "9999999.99", "B_PRIVATE");
        MonthlyBudget monthly = new MonthlyBudget(); monthly.setUser(ownerA); monthly.setYear(2026); monthly.setMonth(11);
        monthly.setAmountLimit(new BigDecimal("2500000.00")); monthlyBudgets.save(monthly);
        CategoryBudget category = new CategoryBudget(); category.setUser(ownerA); category.setCategory(expenseA);
        category.setYear(2026); category.setMonth(11); category.setAmountLimit(new BigDecimal("1900000.00")); categoryBudgets.save(category);
        entityManager.flush(); entityManager.clear();
        when(provider.explain(anyString(), any())).thenReturn("Tổng chi 2.800.002,35 ₫. Chưa thiết lập ngân sách. B_PRIVATE.");

        var summary = chat(ownerA, "Tổng thu chi bao nhiêu?", "2026-11");
        BigDecimal sqlExpense = jdbc.queryForObject("""
                SELECT SUM(amount) FROM transactions WHERE user_id=? AND type='EXPENSE'
                  AND transaction_date>='2026-11-01' AND transaction_date<'2026-12-01'
                """, BigDecimal.class, ownerA.getId());
        assertThat(summary.stats().totalExpense()).isEqualByComparingTo(sqlExpense);
        assertThat(summary.reply()).contains("10.000.000,10 ₫", "2.800.000,35 ₫", "7.199.999,75 ₫")
                .doesNotContain("Chưa thiết lập", "2.800.002,35", "B_PRIVATE", "9.999.999,99");
        var categories = chat(ownerA, "Danh mục cao nhất?", "2026-11");
        assertThat(categories.reply()).contains("2.000.000,35 ₫", "71,43%", "800.000,00 ₫", "28,57%")
                .doesNotContain("2.800.002,35", "B_PRIVATE");
        var budget = chat(ownerA, "Ngân sách còn bao nhiêu?", "2026-11");
        assertThat(budget.reply()).contains("Còn lại: -300.000,35 ₫", "Đã vượt hạn mức 300.000,35 ₫")
                .doesNotContain("Chưa thiết lập", "2.800.002,35", "B_PRIVATE");
        assertThat(budget.budget().monthly().getSpentAmount()).isEqualByComparingTo(sqlExpense);
        verifyNoInteractions(provider);
    }

    @Test
    void emptyMonthHasZeroStatsAndNoFabricatedCategoryOrBudget() throws Exception {
        var response = chat(ownerA, "Danh mục?", "2026-11");
        assertThat(response.stats().totalIncome()).isZero();
        assertThat(response.stats().totalExpense()).isZero();
        assertThat(response.stats().balance()).isZero();
        assertThat(response.topCategories()).isEmpty();
    }

    private AiChatResponse chat(User owner, String message, String month) throws Exception {
        String body = mvc.perform(post("/api/ai/chat").header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("message", message, "month", month))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return json.readValue(body, AiChatResponse.class);
    }

    private User user(String suffix) {
        User user = new User(); user.setFullName("D11 Test " + suffix); user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash(UUID.randomUUID().toString()); return users.save(user);
    }

    private Category category(User owner, String name, TransactionType type) {
        Category category = new Category(); category.setUser(owner); category.setName(name); category.setType(type);
        return categories.save(category);
    }

    private void save(Category category, String date, String amount, String note) {
        Transaction transaction = new Transaction(); transaction.setUser(category.getUser()); transaction.setCategory(category);
        transaction.setType(category.getType()); transaction.setTransactionDate(LocalDate.parse(date));
        transaction.setAmount(new BigDecimal(amount)); transaction.setNote(note); transactions.save(transaction);
    }

    private String bearer(User owner) {
        Instant now = Instant.now();
        return "Bearer " + encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(owner.getId().toString()).issuedAt(now).expiresAt(now.plusSeconds(600)).build())).getTokenValue();
    }
}
