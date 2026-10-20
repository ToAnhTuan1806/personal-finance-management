package com.smartexpense.backend.dto.dashboard;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DashboardSummaryResponse {

    private Integer year;
    private Integer month;

    // Tổng khoản thu
    private BigDecimal totalIncome;

    // Tổng khoản chi
    private BigDecimal totalExpense;

    // Chênh lệch = tổng thu - tổng chi
    private BigDecimal balance;
}
