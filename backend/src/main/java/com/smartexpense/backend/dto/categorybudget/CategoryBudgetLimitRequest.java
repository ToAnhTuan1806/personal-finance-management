package com.smartexpense.backend.dto.categorybudget;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
public class CategoryBudgetLimitRequest {

    @NotNull(message = "Giới hạn ngân sách không được để trống")
    @DecimalMin(value = "0.01", message = "Ngân sách phải lớn hơn 0")
    @Digits(integer = 13, fraction = 2)
    private BigDecimal amountLimit;
}
