package com.smartexpense.backend.dto.categorybudget;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CategoryBudgetRequest extends CategoryBudgetLimitRequest {

    @NotNull(message = "Danh mục không được để trống")
    @Positive
    private Long categoryId;

    @NotNull(message = "Năm không được để trống")
    @Min(1900)
    @Max(2100)
    private Integer year;

    @NotNull(message = "Tháng không được để trống")
    @Min(1)
    @Max(12)
    private Integer month;
}
