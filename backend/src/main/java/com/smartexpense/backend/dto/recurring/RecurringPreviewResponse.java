package com.smartexpense.backend.dto.recurring;

import com.smartexpense.backend.enums.TransactionType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RecurringPreviewResponse {
    private Long templateId;
    private Integer year;
    private Integer month;
    private LocalDate transactionDate;
    private Long categoryId;
    private String categoryName;
    private TransactionType type;
    private BigDecimal amount;
    private String note;
    private boolean alreadyApplied;
    private boolean canApply;
    private String reasonCode;
}
