package com.smartexpense.backend.dto.ai;

import com.smartexpense.backend.dto.budget.BudgetResponse;
import com.smartexpense.backend.dto.categorybudget.CategoryBudgetResponse;
import java.math.BigDecimal;
import java.util.List;

public record AiChatResponse(String reply, String period, String intent, Stats stats,
                             List<TopCategory> topCategories, Budget budget) {
    @Override public String toString() { return "AiChatResponse[redacted]"; }
    public record Stats(BigDecimal totalIncome, BigDecimal totalExpense, BigDecimal balance) { }
    public record TopCategory(Long categoryId, String categoryName, BigDecimal totalAmount,
                              BigDecimal sharePercentage) { }
    // monthly=null nghĩa là chưa đặt; không tạo ngân sách hạn mức 0 giả.
    public record Budget(String status, BudgetResponse monthly, List<CategoryBudgetResponse> categories) { }
}
