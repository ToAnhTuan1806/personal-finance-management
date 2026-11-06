package com.smartexpense.backend.dto.recurring;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import tools.jackson.databind.annotation.JsonDeserialize;

@Getter
@Setter
public class RecurringApplicationRequest {

    @NotNull(message = "Năm không được để trống")
    @Min(value = 1900, message = "Năm phải từ 1900 đến 2100")
    @Max(value = 2100, message = "Năm phải từ 1900 đến 2100")
    @JsonDeserialize(using = RecurringPeriodIntegerDeserializer.class)
    private Integer year;

    @NotNull(message = "Tháng không được để trống")
    @Min(value = 1, message = "Tháng phải từ 1 đến 12")
    @Max(value = 12, message = "Tháng phải từ 1 đến 12")
    @JsonDeserialize(using = RecurringPeriodIntegerDeserializer.class)
    private Integer month;
}
