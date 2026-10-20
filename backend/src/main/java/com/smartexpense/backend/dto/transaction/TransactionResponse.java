package com.smartexpense.backend.dto.transaction;

import com.smartexpense.backend.enums.TransactionType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TransactionResponse {

    private Long id;

    private Long categoryId;

    private String categoryName;

    private TransactionType type;

    private BigDecimal amount;

    private LocalDate transactionDate;

    private String note;
}
