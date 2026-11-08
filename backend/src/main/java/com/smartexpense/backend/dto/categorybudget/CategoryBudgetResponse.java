package com.smartexpense.backend.dto.categorybudget;

import com.smartexpense.backend.enums.CategoryBudgetStatus;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CategoryBudgetResponse {

    private Long id;
    private Long categoryId;
    private String categoryName;
    private Integer year;
    private Integer month;
    private BigDecimal amountLimit;
    private BigDecimal spentAmount;
    private BigDecimal remainingAmount;
    private BigDecimal usagePercentage;
    private boolean exceeded;
    private CategoryBudgetStatus status;
}
