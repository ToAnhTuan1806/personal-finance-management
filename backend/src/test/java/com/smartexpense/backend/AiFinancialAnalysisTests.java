package com.smartexpense.backend;

import com.smartexpense.backend.dto.ai.*;
import com.smartexpense.backend.dto.dashboard.CategoryExpenseResponse;
import com.smartexpense.backend.entity.MonthlyBudget;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiFinancialAnalysisTests {
    private final TransactionRepository transactions = mock(TransactionRepository.class);
    private final MonthlyBudgetRepository budgets = mock(MonthlyBudgetRepository.class);
    private final RecurringTemplateRepository recurring = mock(RecurringTemplateRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-10T05:00:00Z"), ZoneOffset.UTC);
    private final AiFinancialAnalysisService service = new AiFinancialAnalysisService(transactions, budgets, recurring, clock);
    private AiQueryInterpreter.Query query(String kind, String amount) {
        return new AiQueryInterpreter.Query(kind,"2026-11",null,false,null,
                amount == null ? null : new AiQueryInterpreter.Purchase(new BigDecimal(amount)));
    }
    private void plan(String limit,String spent,String pending,String variable,long days) {
        var b = new MonthlyBudget(); b.setAmountLimit(new BigDecimal(limit));
        when(budgets.findByUserIdAndYearAndMonth(7L,2026,11)).thenReturn(Optional.of(b));
        when(transactions.sumAmountByUserAndTypeAndDateRange(eq(7L),any(),any(),any())).thenReturn(new BigDecimal(spent));
        when(recurring.sumPendingExpenses(eq(7L),any(),any(),eq(2026),eq(11))).thenReturn(new BigDecimal(pending));
        var v=mock(TransactionRepository.VariableSpending.class);
        when(v.getAmount()).thenReturn(new BigDecimal(variable));when(v.getActiveDays()).thenReturn(days);
        when(transactions.summarizeVariableSpending(eq(7L),any(),any())).thenReturn(v);
    }
    @Test void forecastCountsFutureRecurringOnceAndDoesNotExtrapolateAppliedRecurring() {
        plan("1000","600","200","100",3);
        var a=service.analyze(7L,query("BUDGET_FORECAST",null));
        assertThat(a.status()).isEqualTo("READY");
        assertThat(a.metrics()).extracting(AiAnalysis.Metric::value)
                .containsExactly(new BigDecimal("1000.00"),new BigDecimal("0.00"),new BigDecimal("10.00"));
        verify(recurring).sumPendingExpenses(7L,LocalDate.of(2026,11,10),LocalDate.of(2026,12,1),2026,11);
        verify(transactions).summarizeVariableSpending(7L,LocalDate.of(2026,11,1),LocalDate.of(2026,11,11));
    }
    @Test void simulationShowsKnownAndForecastImpactWithoutSaving() {
        plan("1000","600","200","100",3);
        var a=service.analyze(7L,query("PURCHASE_SIMULATION","100.25"));
        assertThat(a.metrics()).extracting(AiAnalysis.Metric::value)
                .containsExactly(new BigDecimal("100.25"),new BigDecimal("99.75"),new BigDecimal("-100.25"));
        assertThat(a.summary()).contains("nguy cơ");
        verify(transactions,never()).save(any());verify(recurring,never()).save(any());verify(budgets,never()).save(any());
    }
    @Test void sparseHistoryDoesNotInventAProjection() {
        plan("1000","60.25","20","10.25",2);
        var a=service.analyze(7L,query("BUDGET_FORECAST",null));
        assertThat(a.status()).isEqualTo("INSUFFICIENT_DATA");
        assertThat(a.metrics()).extracting(AiAnalysis.Metric::label).doesNotContain("Ước chi cuối tháng");
        var s=service.analyze(7L,query("PURCHASE_SIMULATION","10.25"));
        assertThat(s.metrics()).hasSize(2);
        assertThat(s.metrics().getLast().value()).isEqualByComparingTo("909.50");
    }
    @Test void noBudgetIsDifferentFromZeroBudget() {
        var a=service.analyze(7L,query("BUDGET_FORECAST",null));
        assertThat(a.status()).isEqualTo("BUDGET_NOT_SET");
        assertThat(a.metrics()).hasSize(2);
        plan("0","1","0","1",3);
        assertThat(service.analyze(7L,query("BUDGET_FORECAST",null)).summary()).contains("vượt ngân sách");
    }
    @Test void simulationRequiresOneExplicitAmountAndNeverReusesAnEarlierAmount() {
        assertThat(service.analyze(7L,query("PURCHASE_SIMULATION",null)).status()).isEqualTo("NEEDS_AMOUNT");
        verifyNoInteractions(transactions,budgets,recurring);
    }
    @ParameterizedTest @ValueSource(strings={"2026-10","2026-12"})
    void projectionForOtherMonthsIsExplicitlyUnavailable(String month) {
        var a=service.analyze(7L,new AiQueryInterpreter.Query("BUDGET_FORECAST",month,null,false));
        assertThat(a.status()).isEqualTo("NOT_CURRENT_MONTH");verifyNoInteractions(transactions,budgets,recurring);
    }
    @Test void insightComparesSameDaysAndKeepsDecreaseSigned() {
        when(transactions.sumExpensesByCategory(eq(7L),any(),eq(LocalDate.of(2026,11,1)),eq(LocalDate.of(2026,11,11))))
                .thenReturn(List.of(new CategoryExpenseResponse(1L,"Ăn uống",new BigDecimal("200.25"))));
        when(transactions.sumExpensesByCategory(eq(7L),any(),eq(LocalDate.of(2026,10,1)),eq(LocalDate.of(2026,10,11))))
                .thenReturn(List.of(new CategoryExpenseResponse(1L,"Ăn uống",new BigDecimal("500.75"))));
        var a=service.analyze(7L,query("SPENDING_INSIGHT",null));
        assertThat(a.metrics().getLast().value()).isEqualByComparingTo("-300.50");
        assertThat(a.drivers().getFirst().delta()).isEqualByComparingTo("-300.50");
        assertThat(a.summary()).contains("giảm");assertThat(a.transactionFilter().categoryId()).isEqualTo(1L);
    }
    @Test void emptyInsightAndEarliestMonthAreNotFabricated() {
        assertThat(service.analyze(7L,query("SPENDING_INSIGHT",null)).status()).isEqualTo("NO_DATA");
        assertThat(service.analyze(7L,new AiQueryInterpreter.Query("SPENDING_INSIGHT","1900-01",null,false)).status()).isEqualTo("NO_DATA");
    }
    @Test void shortMonthBaselineIsClampedAndFutureMonthIsNotRead() {
        var march=new AiFinancialAnalysisService(transactions,budgets,recurring,
                Clock.fixed(Instant.parse("2028-03-31T05:00:00Z"),ZoneOffset.UTC));
        march.analyze(7L,new AiQueryInterpreter.Query("SPENDING_INSIGHT","2028-03",null,false));
        verify(transactions).sumExpensesByCategory(eq(7L),any(),eq(LocalDate.of(2028,2,1)),eq(LocalDate.of(2028,3,1)));
        clearInvocations(transactions);
        assertThat(march.analyze(7L,new AiQueryInterpreter.Query("SPENDING_INSIGHT","2028-04",null,false)).status()).isEqualTo("NO_DATA");
        verifyNoInteractions(transactions);
    }
    @ParameterizedTest
    @CsvSource(delimiter=';', value={"Vì sao tháng này tôi chi nhiều?;SPENDING_INSIGHT", "Sao tôi tiêu nhiều thế?;SPENDING_INSIGHT",
            "Dự báo ngân sách tháng này;BUDGET_FORECAST", "Tôi còn được chi bao nhiêu mỗi ngày?;BUDGET_FORECAST",
            "Nếu mua tai nghe 1,2 triệu thì sao?;PURCHASE_SIMULATION", "Mô phỏng một khoản mua;PURCHASE_SIMULATION"})
    void routesNaturalQuestionsBeforeExpenseCreation(String message,String intent) {
        var result=new AiQueryInterpreter(clock).interpret(new AiChatRequest(message,"2026-11"));
        assertThat(result.intent()).isEqualTo(intent);
    }
    @ParameterizedTest @ValueSource(strings={"1.2 triệu","1,2tr","1200k","1.200.000","1200000 đồng"})
    void parsesMultipleDenominationsForSimulation(String amount) {
        var q=new AiQueryInterpreter(clock).interpret(new AiChatRequest("Nếu mua tai nghe "+amount+" thì sao?","2026-11"));
        assertThat(q.intent()).isEqualTo("PURCHASE_SIMULATION");assertThat(q.purchase().amount()).isEqualByComparingTo("1200000");
    }
    @ParameterizedTest @ValueSource(strings={"Nếu mua đồ -100k thì sao?","Nếu mua đồ 0 đồng thì sao?","Nếu mua 100k và 200k thì sao?","Nếu mua đồ 10000000000000 đồng thì sao?"})
    void rejectsAmbiguousOrInvalidSimulationAmount(String text) {
        assertThat(new AiQueryInterpreter(clock).interpret(new AiChatRequest(text,"2026-11")).purchase().amount()).isNull();
    }
}
