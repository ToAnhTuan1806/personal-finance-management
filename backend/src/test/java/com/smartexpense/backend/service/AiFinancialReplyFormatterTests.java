package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatResponse.*;
import com.smartexpense.backend.dto.budget.BudgetResponse;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AiFinancialReplyFormatterTests {
    private final AiFinancialReplyFormatter formatter = new AiFinancialReplyFormatter();

    @Test
    void formatsVeryLargeMoneyAndSingleCentWithoutDoublePrecisionLoss() {
        var context = context(new Stats(new BigDecimal("10000000000000000.19"), new BigDecimal("0.01"),
                new BigDecimal("10000000000000000.18")), null);
        assertThat(formatter.format("SUMMARY", "2026-11", context)).contains(
                "10.000.000.000.000.000,19 ₫", "0,01 ₫", "10.000.000.000.000.000,18 ₫");
    }

    @Test
    void summaryWithNoBudgetContextDoesNotDeclareItUnset() {
        assertThat(formatter.format("SUMMARY", "2026-11", context(zeros(), null)))
                .doesNotContain("ngân sách", "Chưa thiết lập");
    }

    @Test
    void missingBudgetContextIsDifferentFromExplicitNotSet() {
        assertThat(formatter.format("BUDGET", "2026-11", context(zeros(), null)))
                .contains("Chưa có thông tin ngân sách được cung cấp")
                .doesNotContain("Chưa thiết lập", "Hạn mức: 0");
        assertThat(formatter.format("BUDGET", "2026-11", context(zeros(), new Budget("NOT_SET", null, List.of()))))
                .contains("Chưa thiết lập ngân sách tổng").doesNotContain("Hạn mức: 0");
    }

    @Test
    void exactlyAtMonthlyLimitDoesNotBecomeExceeded() {
        var monthly = new BudgetResponse(1L, 2026, 11, new BigDecimal("10.00"), new BigDecimal("10.00"), BigDecimal.ZERO, false);
        assertThat(formatter.format("BUDGET", "2026-11", context(zeros(), new Budget("SET", monthly, List.of()))))
                .contains("Còn lại: 0,00 ₫", "Đã dùng hết hạn mức, chưa vượt ngân sách")
                .doesNotContain("Đã vượt hạn mức");
    }

    @Test
    void positiveRemainingAmountIsNotAnOverrun() {
        var monthly = new BudgetResponse(1L, 2026, 11, new BigDecimal("50.00"), new BigDecimal("0.15"), new BigDecimal("49.85"), false);
        assertThat(formatter.format("BUDGET", "2026-11", context(zeros(), new Budget("SET", monthly, List.of()))))
                .contains("Còn lại: 49,85 ₫", "Chưa vượt ngân sách")
                .doesNotContain("Đã vượt hạn mức");
    }

    @Test
    void emptyExpenseMonthHasNoInventedTopCategoryOrPercentage() {
        assertThat(formatter.format("CATEGORIES", "2026-11", context(zeros(), null)))
                .contains("Tổng chi tiêu: 0,00 ₫", "Không có chi tiêu")
                .doesNotContain("tỷ trọng", "%", "Danh mục chi tiêu cao nhất:");
    }

    private Stats zeros() { return new Stats(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO); }
    private AiFinancialContextService.Context context(Stats stats, Budget budget) {
        return new AiFinancialContextService.Context(stats, List.of(), budget);
    }
}
