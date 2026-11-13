package com.smartexpense.backend.dto.ai;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.smartexpense.backend.dto.budget.BudgetResponse;
import com.smartexpense.backend.dto.categorybudget.CategoryBudgetResponse;
import java.math.BigDecimal;
import java.util.List;

public record AiChatResponse(String reply, String period, String intent, Stats stats,
                             List<TopCategory> topCategories, Budget budget,
                             @JsonInclude(JsonInclude.Include.NON_NULL) Comparison comparison) {
    public AiChatResponse(String reply, String period, String intent, Stats stats,
                          List<TopCategory> topCategories, Budget budget) {
        this(reply, period, intent, stats, topCategories, budget, null);
    }
    @Override public String toString() { return "AiChatResponse[redacted]"; }
    public record Stats(BigDecimal totalIncome, BigDecimal totalExpense, BigDecimal balance) { }
    public record Comparison(String baseMonth, String targetMonth, Stats base, Stats target, Stats delta,
                             BigDecimal expenseChangePercent, List<CategoryTrend> categoryTrends) { }
    public record CategoryTrend(Long categoryId, String categoryName, BigDecimal baseExpense,
                                BigDecimal targetExpense, BigDecimal delta, BigDecimal changePercent) { }
    public record TopCategory(Long categoryId, String categoryName, BigDecimal totalAmount,
                              BigDecimal sharePercentage) { }
    // monthly=null nghĩa là chưa đặt; không tạo ngân sách hạn mức 0 giả.
    public record Budget(String status, BudgetResponse monthly, List<CategoryBudgetResponse> categories) { }
}
