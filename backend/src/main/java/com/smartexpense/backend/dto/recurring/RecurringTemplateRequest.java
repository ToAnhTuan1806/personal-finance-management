package com.smartexpense.backend.dto.recurring;

import com.smartexpense.backend.enums.TransactionType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;
import tools.jackson.databind.annotation.JsonDeserialize;

import java.math.BigDecimal;

@Getter
@Setter
public class RecurringTemplateRequest {

    @NotNull(message = "Danh mục không được để trống")
    @Positive(message = "ID danh mục phải là số nguyên dương")
    @JsonDeserialize(using = RecurringTemplateJsonDeserializers.CategoryId.class)
    private Long categoryId;

    @NotNull(message = "Loại giao dịch không được để trống")
    @JsonDeserialize(using = RecurringTemplateJsonDeserializers.Type.class)
    private TransactionType type;

    @NotNull(message = "Số tiền không được để trống")
    @DecimalMin(value = "0.01", message = "Số tiền phải lớn hơn 0")
    @Digits(integer = 13, fraction = 2)
    @JsonDeserialize(using = RecurringTemplateJsonDeserializers.Amount.class)
    private BigDecimal amount;

    @NotNull(message = "Ngày lặp không được để trống")
    @Min(value = 1, message = "Ngày lặp phải từ 1 đến 31")
    @Max(value = 31, message = "Ngày lặp phải từ 1 đến 31")
    @JsonDeserialize(using = RecurringTemplateJsonDeserializers.DayOfMonth.class)
    private Integer dayOfMonth;

    @Size(max = 500, message = "Ghi chú tối đa 500 ký tự")
    @JsonDeserialize(using = RecurringTemplateJsonDeserializers.Note.class)
    private String note;

    @NotNull(message = "Trạng thái mẫu không được để trống")
    @JsonDeserialize(using = RecurringTemplateJsonDeserializers.Active.class)
    private Boolean active;
}
