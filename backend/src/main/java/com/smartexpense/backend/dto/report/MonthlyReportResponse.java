package com.smartexpense.backend.dto.report;

import com.smartexpense.backend.dto.dashboard.CategoryExpenseResponse;

import java.util.List;

public record MonthlyReportResponse(String from, String to, List<MonthlySummaryResponse> months,
                                    List<CategoryExpenseResponse> expensesByCategory) {
}
