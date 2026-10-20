package com.smartexpense.backend.dto.budget;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class BudgetRequest {

    @NotNull(message = "Giới hạn ngân sách không được để trống")
    @DecimalMin(value = "0.01", message = "Ngân sách phải lớn hơn 0")
    @Digits(integer = 13, fraction = 2)
    private BigDecimal amountLimit;
}
