package com.smartexpense.backend.dto.recurring;

import com.smartexpense.backend.dto.transaction.TransactionResponse;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RecurringApplicationResponse {
    private Long id;
    private Long templateId;
    private Integer year;
    private Integer month;
    private Long transactionId;
    private TransactionResponse transaction;
}
