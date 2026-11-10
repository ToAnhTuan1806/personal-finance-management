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

@Service
@RequiredArgsConstructor
public class AiFinancialContextService {
    private final ReportService reports;
    private final BudgetService monthlyBudgets;
    private final CategoryBudgetService categoryBudgets;
    private final MonthlyBudgetRepository budgetRepository;

    public record Context(Stats stats, List<TopCategory> topCategories, Budget budget) { }

    // Kết thúc transaction trước khi gọi mạng tới Gemini.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Context load(Long userId, String month, String intent) {
        var report = reports.getMonthlyReport(userId, month, month);
        var summary = report.months().getFirst();
        Stats stats = new Stats(summary.totalIncome(), summary.totalExpense(), summary.balance());
        List<TopCategory> categories = List.of();
        if (intent.equals("CATEGORIES")) {
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
        return new Context(stats, categories, budget);
    }
}
