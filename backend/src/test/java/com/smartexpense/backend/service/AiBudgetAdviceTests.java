package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatResponse.*;
import com.smartexpense.backend.dto.budget.BudgetResponse;
import com.smartexpense.backend.dto.categorybudget.CategoryBudgetResponse;
import com.smartexpense.backend.enums.CategoryBudgetStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AiBudgetAdviceTests {
    private final AiFinancialReplyFormatter formatter = new AiFinancialReplyFormatter();

    @ParameterizedTest
    @CsvSource({"0,0,00,Chưa phát sinh chi tiêu", "79.99,79,99,Đang chi tiêu trong hạn mức",
            "80,80,00,Gần đạt hạn mức", "100,100,00,Đã đạt hạn mức", "100.01,100,01,Đã vượt hạn mức"})
    void monthlyAndCategoryBudgetsUseExactThresholds(String amount, String whole, String fraction, String advice) {
        BigDecimal spent = new BigDecimal(amount);
        BigDecimal limit = new BigDecimal("100.00");
        for (boolean category : List.of(false, true)) {
            String reply = reply(limit, spent, category);
            assertThat(reply).contains("Tỷ lệ sử dụng: " + whole + "," + fraction + "%", advice);
            if (spent.compareTo(new BigDecimal("80")) < 0) assertThat(reply).doesNotContain("Cảnh báo:", "Gần đạt hạn mức");
            if (spent.compareTo(limit) < 0) assertThat(reply).doesNotContain("Đã đạt hạn mức", "Đã vượt hạn mức");
        }
    }

    @ParameterizedTest
    @CsvSource({"1000,799.99,80,00,Đang chi tiêu trong hạn mức", "1000,999.99,100,00,Gần đạt hạn mức",
            "0.03,0.01,33,33,Đang chi tiêu trong hạn mức", "0.03,0.02,66,67,Đang chi tiêu trong hạn mức",
            "10000000000000000.19,8000000000000000.15,80,00,Đang chi tiêu trong hạn mức"})
    void roundedPercentageNeverDeterminesAdvice(String limit, String spent, String whole, String fraction, String advice) {
        String result = reply(new BigDecimal(limit), new BigDecimal(spent), false);
        assertThat(result).contains("Tỷ lệ sử dụng: " + whole + "," + fraction + "%", advice)
                .doesNotContain("Gợi ý: Đã đạt hạn mức", "Gợi ý: Đã vượt hạn mức");
    }

    @Test
    void unsetBudgetUsesActualSpendingWithoutInventingLimit() {
        var stats = new Stats(BigDecimal.ZERO, new BigDecimal("0.30"), new BigDecimal("-0.30"));
        var context = new AiFinancialContextService.Context(stats, List.of(), new Budget("NOT_SET", null, List.of()),
                List.of(new TopCategory(1L, "Ăn uống", new BigDecimal("0.30"), new BigDecimal("100.00"))));
        assertThat(formatter.format("BUDGET", "2026-01", context))
                .contains("1/2026", "Chưa thiết lập ngân sách tổng", "Đã chi trong tháng: 0,30 ₫",
                        "tự đặt hạn mức phù hợp", "Danh mục \"Ăn uống\": 0,30 ₫ (tỷ trọng 100,00%)", "ưu tiên khoản thiết yếu")
                .doesNotContain("Tỷ lệ sử dụng", "Hạn mức:", "tăng hạn mức lên", "giảm hạn mức xuống");
    }

    @Test
    void zeroLegacyLimitDoesNotDivideByZeroOrInventPercentage() {
        assertThat(reply(BigDecimal.ZERO, BigDecimal.ZERO, false))
                .contains("Không tính tỷ lệ sử dụng vì hạn mức không lớn hơn 0")
                .doesNotContain("Tỷ lệ sử dụng:");
    }

    private String reply(BigDecimal limit, BigDecimal spent, boolean category) {
        BigDecimal remaining = limit.subtract(spent);
        boolean exceeded = spent.compareTo(limit) > 0;
        var monthly = new BudgetResponse(1L, 2026, 11, limit, spent, remaining, exceeded);
        var item = new CategoryBudgetResponse(2L, 1L, "Ăn uống", 2026, 11, limit, spent, remaining,
                BigDecimal.ZERO, exceeded, CategoryBudgetStatus.SAFE);
        var budget = new Budget(category ? "NOT_SET" : "SET", category ? null : monthly,
                category ? List.of(item) : List.of());
        return formatter.format("BUDGET", "2026-11", new AiFinancialContextService.Context(
                new Stats(BigDecimal.ZERO, spent, spent.negate()), List.of(), budget));
    }
}
