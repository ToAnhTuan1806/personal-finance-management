package com.smartexpense.backend.dto.transaction;

import com.smartexpense.backend.enums.TransactionType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class TransactionRequest {

    @NotNull(message = "Danh mục không được để trống")
    private Long categoryId;

    @NotNull(message = "Loại giao dịch không được để trống")
    private TransactionType type;

    @NotNull(message = "Số tiền không được để trống")
    @DecimalMin(value = "0.01", message = "Số tiền phải lớn hơn 0")
    @Digits(integer = 13, fraction = 2)
    private BigDecimal amount;

    @NotNull(message = "Ngày giao dịch không được để trống")
    private LocalDate transactionDate;

    @Size(max = 500)
    private String note;
}
