package com.smartexpense.backend;

import com.smartexpense.backend.dto.ai.*;
import com.smartexpense.backend.entity.*;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(classes=BackendApplication.class,properties={
        "spring.config.location=classpath:/application-d03-test.properties","GEMINI_API_KEY=","GEMINI_MODEL="})
@Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class AiFinancialAnalysisIntegrationTests extends MySqlIntegrationTestSupport {
    @Autowired AiFinancialAnalysisService analyses;
    @Autowired UserRepository users; @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions; @Autowired MonthlyBudgetRepository budgets;
    @Autowired RecurringTemplateRepository templates; @Autowired RecurringApplicationRepository applications;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean Clock clock;
    @MockitoBean AiProvider provider;
    private User owner,other; private Category food,otherFood;
    @BeforeEach void setup() throws Exception {
        verifyMySqlConnection();
        when(clock.withZone(any())).thenReturn(Clock.fixed(Instant.parse("2026-11-10T05:00:00Z"),ZoneOffset.UTC));
        owner=user();other=user();food=category(owner);otherFood=category(other);
    }
    @Test void sqlEvidenceIsBoundedOwnerScopedAndUsesMatchingDays() {
        expense(food,"2026-10-05","50.25");expense(food,"2026-10-30","999999.99");
        expense(food,"2026-11-02","60.25");expense(food,"2026-11-04","80.50");expense(food,"2026-11-08","40.25");expense(food,"2026-11-09","10.00");
        expense(food,"2026-11-25","888888.88");expense(otherFood,"2026-11-05","777777.77");
        var a=analyze("SPENDING_INSIGHT",null);
        assertThat(a.metrics().get(0).value()).isEqualByComparingTo("191.00");
        assertThat(a.metrics().get(1).value()).isEqualByComparingTo("50.25");
        assertThat(a.metrics().get(2).value()).isEqualByComparingTo("140.75");
        assertThat(a.evidence()).hasSize(3).extracting(AiAnalysis.Evidence::amount)
                .containsExactly(new BigDecimal("80.50"),new BigDecimal("60.25"),new BigDecimal("40.25"));
        for(var e:a.evidence()) assertThat(transactions.findByIdAndUserId(e.id(),other.getId())).isEmpty();
        verifyNoInteractions(provider);
    }
    @Test void sqlExcludesAppliedRecurringFromDailyRateAndCountsOnlyEligiblePendingSchedules() {
        budget("1000.50");
        var fixed=template(food,"500.25","2026-12-03",true);
        var booked=expense(food,"2026-11-03","500.25");
        var marker=new RecurringApplication();marker.setTemplate(fixed);marker.setYear(2026);marker.setMonth(11);marker.setTransaction(booked);applications.saveAndFlush(marker);
        expense(food,"2026-11-01","30.05");expense(food,"2026-11-05","40.10");expense(food,"2026-11-09","30.10");
        template(food,"200.25","2026-11-20",true);
        template(food,"900000","2026-11-04",true); // missed day: policy skips, never backfills
        template(food,"800000","2026-11-25",false);
        template(food,"700000",null,true);
        template(otherFood,"600000","2026-11-25",true);
        jdbc.update("UPDATE recurring_templates SET next_run_date='2026-11-25' WHERE id=?",fixed.getId()); // already applied marker still excludes it
        var counts=counts();var a=analyze("BUDGET_FORECAST",null);
        assertThat(a.status()).isEqualTo("READY");
        assertThat(a.metrics().getFirst().value()).isEqualByComparingTo("1001.25"); // 600.50 + 200.25 + 100.25*20/10
        assertThat(a.metrics().get(1).value()).isEqualByComparingTo("-0.75");
        var simulated=analyze("PURCHASE_SIMULATION","100.01");
        assertThat(simulated.metrics().get(1).value()).isEqualByComparingTo("99.74");
        assertThat(simulated.metrics().get(2).value()).isEqualByComparingTo("-100.76");
        assertThat(counts()).isEqualTo(counts);verifyNoInteractions(provider);
    }
    @Test void vietnamMidnightIsUsedAndNoBudgetDoesNotInventHeadroom() {
        when(clock.withZone(any())).thenReturn(Clock.fixed(Instant.parse("2026-11-09T17:00:00Z"),ZoneId.of("Asia/Ho_Chi_Minh")));
        expense(food,"2026-11-10","0.25");
        var a=analyze("PURCHASE_SIMULATION","0.01");
        assertThat(a.asOf()).hasToString("2026-11-10");assertThat(a.status()).isEqualTo("BUDGET_NOT_SET");
        assertThat(a.metrics()).hasSize(2);assertThat(a.metrics().getLast().value()).isEqualByComparingTo("0.25");
    }
    private AiAnalysis analyze(String intent,String amount) { return analyses.analyze(owner.getId(),new AiQueryInterpreter.Query(intent,"2026-11",null,false,null,amount==null?null:new AiQueryInterpreter.Purchase(new BigDecimal(amount)))); }
    private Map<String,Long> counts(){var r=new HashMap<String,Long>();for(String table:List.of("transactions","recurring_applications","recurring_templates","monthly_budgets"))r.put(table,jdbc.queryForObject("SELECT COUNT(*) FROM "+table,Long.class));return r;}
    private User user(){var u=new User();u.setEmail(UUID.randomUUID()+"@example.test");u.setFullName("Analysis fixture");u.setPasswordHash("unused-fixture");return users.saveAndFlush(u);}
    private Category category(User u){var c=new Category();c.setUser(u);c.setName("Analysis "+u.getId());c.setType(TransactionType.EXPENSE);return categories.saveAndFlush(c);}
    private Transaction expense(Category c,String date,String amount){var t=new Transaction();t.setUser(c.getUser());t.setCategory(c);t.setType(TransactionType.EXPENSE);t.setAmount(new BigDecimal(amount));t.setTransactionDate(LocalDate.parse(date));t.setNote("Fixture only");return transactions.saveAndFlush(t);}
    private RecurringTemplate template(Category c,String amount,String date,boolean active){var t=new RecurringTemplate();t.setUser(c.getUser());t.setCategory(c);t.setType(TransactionType.EXPENSE);t.setAmount(new BigDecimal(amount));t.setDayOfMonth(20);t.setActive(active);t.setNextRunDate(date==null?null:LocalDate.parse(date));return templates.saveAndFlush(t);}
    private void budget(String limit){var b=new MonthlyBudget();b.setUser(owner);b.setYear(2026);b.setMonth(11);b.setAmountLimit(new BigDecimal(limit));budgets.saveAndFlush(b);}
}
