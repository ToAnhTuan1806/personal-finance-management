package com.smartexpense.backend.dto.report;

import java.math.BigDecimal;

public record MonthlySummaryResponse(String month, BigDecimal totalIncome, BigDecimal totalExpense,
                                     BigDecimal balance) {
}
