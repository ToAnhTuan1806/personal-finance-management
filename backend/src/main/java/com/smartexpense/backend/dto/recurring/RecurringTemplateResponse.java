package com.smartexpense.backend.dto.recurring;

import com.smartexpense.backend.enums.TransactionType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RecurringTemplateResponse {

    private Long id;
    private Long categoryId;
    private String categoryName;
    private TransactionType type;
    private BigDecimal amount;
    private Integer dayOfMonth;
    private String note;
    private boolean active;
}
