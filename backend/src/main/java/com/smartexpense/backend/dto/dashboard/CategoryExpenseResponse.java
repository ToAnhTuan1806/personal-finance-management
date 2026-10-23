package com.smartexpense.backend.dto.dashboard;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CategoryExpenseResponse {

    private Long categoryId;

    private String categoryName;

    // Tổng chi tiêu của danh mục trong tháng
    private BigDecimal totalAmount;
}
