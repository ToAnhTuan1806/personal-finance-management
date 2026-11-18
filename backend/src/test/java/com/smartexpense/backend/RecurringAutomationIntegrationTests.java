package com.smartexpense.backend;

import com.smartexpense.backend.dto.recurring.*;
import com.smartexpense.backend.entity.*;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(classes = BackendApplication.class, properties = {
        "spring.config.location=classpath:/application-d03-test.properties", "GEMINI_API_KEY=", "GEMINI_MODEL="})
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class RecurringAutomationIntegrationTests extends MySqlIntegrationTestSupport {
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired RecurringTemplateService service;
    @Autowired RecurringAutomationProcessor processor;
    @Autowired RecurringApplicationService legacy;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean RecurringTemplateRepository templates;
    @MockitoBean Clock clock;
    private final AtomicReference<Instant> now = new AtomicReference<>();
    private User owner;
    private Category expense;

    @BeforeEach void setup() throws Exception {
        verifyMySqlConnection();
        now.set(Instant.parse("2026-11-17T05:00:00Z"));
        when(clock.withZone(any())).thenAnswer(c -> Clock.fixed(now.get(), c.getArgument(0)));
        owner = user(); expense = category(owner, TransactionType.EXPENSE);
    }

    @Test void dueExpenseAndIncomeChangeOnlyOwnersBalanceWithExactCents() {
        var income = category(owner, TransactionType.INCOME);
        var other = user();
        var otherCategory = category(other, TransactionType.EXPENSE);
        long out = create(expense, "1000000.25",18), in = create(income,"18000000.75",18);
        create(otherCategory,"999.99",18);
        assertThat(templates.findById(out).orElseThrow().getNextRunDate()).hasToString("2026-11-18");
        assertThat(balance(owner)).isEqualByComparingTo("0.00");
        now.set(Instant.parse("2026-11-17T17:00:00Z")); // Vietnam already 18 November.
        assertThat(processor.process(out)).isEqualTo(RecurringAutomationProcessor.Result.APPLIED);
        assertThat(processor.process(in)).isEqualTo(RecurringAutomationProcessor.Result.APPLIED);
        assertThat(balance(owner)).isEqualByComparingTo("17000000.50");
        assertThat(balance(other)).isEqualByComparingTo("0.00");
        var row = jdbc.queryForMap("SELECT t.* FROM transactions t JOIN recurring_applications a ON a.transaction_id=t.id WHERE a.template_id=?",out);
        assertThat(row.get("amount")).isEqualTo(new BigDecimal("1000000.25"));
        assertThat(row.get("category_id")).isEqualTo(expense.getId());
        assertThat(row.get("user_id")).isEqualTo(owner.getId());
        assertThat(row.get("transaction_date").toString()).isEqualTo("2026-11-18");
        assertThat(processor.process(out)).isEqualTo(RecurringAutomationProcessor.Result.NOT_DUE);
        assertThat(countApplications(out)).isEqualTo(1);
    }

    @Test void simultaneousWorkersCommitOnlyOneTransaction() throws Exception {
        long id = create(expense,"99.95",18); due();
        var results = race(() -> processor.process(id), () -> processor.process(id));
        assertThat(results).containsExactlyInAnyOrder(RecurringAutomationProcessor.Result.APPLIED,
                RecurringAutomationProcessor.Result.NOT_DUE);
        assertThat(countApplications(id)).isEqualTo(1);
        assertThat(balance(owner)).isEqualByComparingTo("-99.95");
    }

    @Test void legacyApplyRacingAutomaticRunStillCannotDuplicate() throws Exception {
        long id = create(expense,"55.55",18); due();
        var request = new RecurringApplicationRequest(); request.setYear(2026); request.setMonth(11);
        race(() -> processor.process(id), () -> legacy.apply(id,owner.getId(),request));
        // A loser can be rolled back by UNIQUE/deadlock detection; the next scan sees the committed marker.
        processor.process(id);
        assertThat(countApplications(id)).isEqualTo(1);
        assertThat(balance(owner)).isEqualByComparingTo("-55.55");
        assertThat(templates.findById(id).orElseThrow().getNextRunDate()).hasToString("2026-12-18");
    }

    @Test void failureAfterLedgerInsertRollsBackLedgerMarkerAndScheduleThenRetries() {
        long id = create(expense,"88.88",18); due();
        doThrow(new DataIntegrityViolationException("injected schedule persistence failure"))
                .when(templates).saveAndFlush(any(RecurringTemplate.class));
        assertThatThrownBy(() -> processor.process(id)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(countApplications(id)).isZero();
        assertThat(balance(owner)).isEqualByComparingTo("0.00");
        assertThat(templates.findById(id).orElseThrow().getNextRunDate()).hasToString("2026-11-18");
        reset(templates);
        assertThat(processor.process(id)).isEqualTo(RecurringAutomationProcessor.Result.APPLIED);
        assertThat(balance(owner)).isEqualByComparingTo("-88.88");
        assertThat(countApplications(id)).isEqualTo(1);
    }

    @Test void newAndReenabledTemplatesSkipTodayAndPastDates() {
        long id = create(expense,"10.01",18);
        var request = request(expense,"10.01",18); request.setActive(false);
        service.update(id,request,owner.getId());
        due();
        assertThat(processor.process(id)).isEqualTo(RecurringAutomationProcessor.Result.INACTIVE);
        request.setActive(true);
        assertThat(service.update(id,request,owner.getId()).getNextRunDate()).hasToString("2026-12-18");
        long sameDay = create(expense,"10.01",18);
        assertThat(templates.findById(sameDay).orElseThrow().getNextRunDate()).hasToString("2026-12-18");
        now.set(Instant.parse("2026-12-19T05:00:00Z"));
        assertThat(processor.process(id)).isEqualTo(RecurringAutomationProcessor.Result.SKIPPED_PAST);
        assertThat(templates.findById(id).orElseThrow().getNextRunDate()).hasToString("2027-01-18");
        assertThat(balance(owner)).isEqualByComparingTo("0.00");
    }

    @Test void deletingGeneratedTransactionDoesNotAllowRegeneration() {
        long id=create(expense,"12.34",18); due(); processor.process(id);
        jdbc.update("DELETE t FROM transactions t JOIN recurring_applications a ON a.transaction_id=t.id WHERE a.template_id=?",id);
        jdbc.update("UPDATE recurring_templates SET next_run_date='2026-11-18' WHERE id=?",id);
        assertThat(processor.process(id)).isEqualTo(RecurringAutomationProcessor.Result.ALREADY_APPLIED);
        assertThat(balance(owner)).isEqualByComparingTo("0.00");
        assertThat(countApplications(id)).isEqualTo(1);
    }

    private void due() { now.set(Instant.parse("2026-11-18T05:00:00Z")); }
    private long countApplications(long id) { return jdbc.queryForObject("SELECT COUNT(*) FROM recurring_applications WHERE template_id=?",Long.class,id); }
    private BigDecimal balance(User user) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(CASE WHEN type='INCOME' THEN amount ELSE -amount END),0) FROM transactions WHERE user_id=?",BigDecimal.class,user.getId());
    }
    private long create(Category category,String amount,int day) { return service.create(request(category,amount,day),category.getUser().getId()).getId(); }
    private RecurringTemplateRequest request(Category category,String amount,int day) {
        var r = new RecurringTemplateRequest(); r.setCategoryId(category.getId()); r.setType(category.getType());
        r.setAmount(new BigDecimal(amount)); r.setDayOfMonth(day); r.setActive(true); r.setNote("Recurring test"); return r;
    }
    private User user() {
        var u = new User(); u.setFullName("Automatic test"); u.setEmail(UUID.randomUUID()+"@example.test");
        u.setPasswordHash("unused-fixture-hash"); return users.saveAndFlush(u);
    }
    private Category category(User user,TransactionType type) {
        var c = new Category(); c.setUser(user); c.setType(type); c.setName("Automatic fixture"); return categories.saveAndFlush(c);
    }
    private List<Object> race(Callable<?> first,Callable<?> second) throws Exception {
        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var a=executor.submit(() -> { start.await(); try { return first.call(); } catch(RuntimeException e) { return e; } });
            var b=executor.submit(() -> { start.await(); try { return second.call(); } catch(RuntimeException e) { return e; } });
            start.countDown(); return List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
    }
}
