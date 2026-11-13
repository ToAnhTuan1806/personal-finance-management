package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatResponse.*;
import com.smartexpense.backend.dto.budget.BudgetResponse;
import com.smartexpense.backend.dto.dashboard.CategoryExpenseResponse;
import com.smartexpense.backend.repository.MonthlyBudgetRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AiFinancialContextService {
    private final ReportService reports;
    private final BudgetService monthlyBudgets;
    private final CategoryBudgetService categoryBudgets;
    private final MonthlyBudgetRepository budgetRepository;

    public record Context(Stats stats, List<TopCategory> topCategories, Budget budget,
                          List<TopCategory> budgetSpending) {
        public Context(Stats stats, List<TopCategory> topCategories, Budget budget) {
            this(stats, topCategories, budget, List.of());
        }
    }

    // Hai kỳ dùng chung snapshot; chỉ đọc aggregate SQL, không tải entity giao dịch/ngân sách.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Comparison loadComparison(Long userId, String targetMonth, String baseMonth) {
        var baseReport = reports.getMonthlyReport(userId, baseMonth, baseMonth);
        var targetReport = reports.getMonthlyReport(userId, targetMonth, targetMonth);
        var baseSummary = baseReport.months().getFirst();
        var targetSummary = targetReport.months().getFirst();
        Stats base = new Stats(baseSummary.totalIncome(), baseSummary.totalExpense(), baseSummary.balance());
        Stats target = new Stats(targetSummary.totalIncome(), targetSummary.totalExpense(), targetSummary.balance());
        Stats delta = new Stats(target.totalIncome().subtract(base.totalIncome()),
                target.totalExpense().subtract(base.totalExpense()), target.balance().subtract(base.balance()));
        Map<Long, CategoryExpenseResponse> baseCategories = new HashMap<>();
        Map<Long, CategoryExpenseResponse> targetCategories = new HashMap<>();
        baseReport.expensesByCategory().forEach(c -> baseCategories.put(c.getCategoryId(), c));
        targetReport.expensesByCategory().forEach(c -> targetCategories.put(c.getCategoryId(), c));
        Map<Long, CategoryExpenseResponse> union = new HashMap<>(baseCategories);
        union.putAll(targetCategories);
        List<CategoryTrend> trends = union.values().stream().map(category -> {
            var before = baseCategories.get(category.getCategoryId());
            var after = targetCategories.get(category.getCategoryId());
            BigDecimal baseExpense = before == null ? BigDecimal.ZERO : before.getTotalAmount();
            BigDecimal targetExpense = after == null ? BigDecimal.ZERO : after.getTotalAmount();
            BigDecimal change = targetExpense.subtract(baseExpense);
            return new CategoryTrend(category.getCategoryId(), category.getCategoryName(),
                    baseExpense, targetExpense, change, changePercent(change, baseExpense));
        }).sorted(Comparator.comparing(CategoryTrend::delta).reversed()
                .thenComparing(CategoryTrend::categoryId)).toList();
        return new Comparison(baseMonth, targetMonth, base, target, delta,
                changePercent(delta.totalExpense(), base.totalExpense()), trends);
    }

    private BigDecimal changePercent(BigDecimal delta, BigDecimal base) {
        return base.signum() == 0 ? null
                : delta.multiply(new BigDecimal("100")).divide(base, 2, RoundingMode.HALF_UP);
    }

    // Kết thúc transaction trước khi gọi mạng tới Gemini.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Context load(Long userId, String month, String intent) {
        var report = reports.getMonthlyReport(userId, month, month);
        var summary = report.months().getFirst();
        Stats stats = new Stats(summary.totalIncome(), summary.totalExpense(), summary.balance());
        List<TopCategory> categories = List.of();
        if (intent.equals("CATEGORIES") || intent.equals("BUDGET")) {
            categories = report.expensesByCategory().stream()
                    .sorted(Comparator.comparing(CategoryExpenseResponse::getTotalAmount).reversed()
                            .thenComparing(CategoryExpenseResponse::getCategoryId))
                    .limit(5)
                    .map(c -> new TopCategory(c.getCategoryId(), c.getCategoryName(), c.getTotalAmount(),
                            summary.totalExpense().signum() == 0 ? BigDecimal.ZERO
                                    : c.getTotalAmount().multiply(new BigDecimal("100"))
                                    .divide(summary.totalExpense(), 2, RoundingMode.HALF_UP))).toList();
        }
        Budget budget = null;
        if (intent.equals("BUDGET")) {
            YearMonth period = YearMonth.parse(month);
            // Tránh bắt 404 từ transaction con rồi tiếp tục một transaction đã rollback-only.
            BudgetResponse monthly = budgetRepository.findByUserIdAndYearAndMonth(
                    userId, period.getYear(), period.getMonthValue()).isEmpty() ? null
                    : monthlyBudgets.getBudget(userId, period.getYear(), period.getMonthValue());
            budget = new Budget(monthly == null ? "NOT_SET" : "SET", monthly,
                    categoryBudgets.getAll(userId, period.getYear(), period.getMonthValue()));
        }
        // BUDGET dùng phân bổ SQL nội bộ; topCategories trong response vẫn chỉ dành cho CATEGORIES.
        return new Context(stats, intent.equals("CATEGORIES") ? categories : List.of(), budget,
                intent.equals("BUDGET") ? categories : List.of());
    }
}
