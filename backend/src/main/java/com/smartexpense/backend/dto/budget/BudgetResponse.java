package com.smartexpense.backend.dto.budget;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BudgetResponse {

    private Long id;

    private Integer year;

    private Integer month;

    // Ngân sách đã thiết lập
    private BigDecimal amountLimit;

    // Tổng chi trong tháng
    private BigDecimal spentAmount;

    // Số tiền còn lại, có thể âm nếu vượt
    private BigDecimal remainingAmount;

    // true khi chi tiêu vượt ngân sách
    private boolean exceeded;
}
