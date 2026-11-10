package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatResponse.Stats;
import com.smartexpense.backend.enums.CategoryBudgetStatus;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.YearMonth;
import java.util.Locale;

// Chỉ định dạng dữ liệu Backend đã tính; không nhận hoặc sửa văn bản do provider sinh.
@Component
public class AiFinancialReplyFormatter {
    public String format(String intent, String month, AiFinancialContextService.Context context) {
        YearMonth period = YearMonth.parse(month);
        String label = period.getMonthValue() + "/" + period.getYear();
        return switch (intent) {
            case "SUMMARY" -> summary(label, context.stats());
            case "CATEGORIES" -> categories(label, context);
            case "BUDGET" -> budget(label, context);
            default -> throw new IllegalArgumentException("Intent không phải thống kê tài chính");
        };
    }

    private String summary(String period, Stats stats) {
        return "Thống kê tháng " + period + ":\nTổng thu nhập: " + money(stats.totalIncome())
                + ".\nTổng chi tiêu: " + money(stats.totalExpense()) + ".\nSố dư: " + money(stats.balance()) + ".";
    }

    private String categories(String period, AiFinancialContextService.Context context) {
        StringBuilder reply = new StringBuilder(summary(period, context.stats()));
        if (context.stats().totalExpense().signum() == 0) {
            return reply.append("\nKhông có chi tiêu trong tháng này để xác định danh mục cao nhất.").toString();
        }
        if (context.topCategories().isEmpty()) {
            return reply.append("\nChưa có dữ liệu phân bổ danh mục được cung cấp.").toString();
        }
        var highest = context.topCategories().getFirst();
        reply.append("\nDanh mục chi tiêu cao nhất: \"").append(highest.categoryName()).append("\" — ")
                .append(money(highest.totalAmount())).append(" (tỷ trọng ")
                .append(number(highest.sharePercentage())).append("%).");
        for (var category : context.topCategories().subList(1, context.topCategories().size())) {
            reply.append("\nDanh mục \"").append(category.categoryName()).append("\": ")
                    .append(money(category.totalAmount())).append(" (tỷ trọng ")
                    .append(number(category.sharePercentage())).append("%).");
        }
        return reply.toString();
    }

    private String budget(String period, AiFinancialContextService.Context context) {
        StringBuilder reply = new StringBuilder("Ngân sách tháng " + period + ":");
        var budget = context.budget();
        // Ngữ cảnh không có budget không đồng nghĩa với ngân sách chưa được thiết lập.
        if (budget == null) return reply.append("\nChưa có thông tin ngân sách được cung cấp.").toString();
        if (budget.monthly() != null) {
            var monthly = budget.monthly();
            reply.append("\nNgân sách tổng:");
            appendAmounts(reply, monthly.getAmountLimit(), monthly.getSpentAmount(),
                    monthly.getRemainingAmount(), monthly.isExceeded());
        } else if ("NOT_SET".equals(budget.status())) {
            reply.append("\nChưa thiết lập ngân sách tổng cho tháng này.");
        } else {
            reply.append("\nChưa có thông tin ngân sách tổng được cung cấp.");
        }
        if (budget.categories().isEmpty()) {
            reply.append("\nChưa thiết lập ngân sách danh mục cho tháng này.");
        }
        for (var category : budget.categories()) {
            reply.append("\nNgân sách danh mục \"").append(category.getCategoryName()).append("\":");
            appendAmounts(reply, category.getAmountLimit(), category.getSpentAmount(),
                    category.getRemainingAmount(), category.isExceeded());
            reply.append("\nTỷ lệ sử dụng: ").append(number(category.getUsagePercentage())).append("%.");
            if (category.getStatus() == CategoryBudgetStatus.WARNING) {
                reply.append("\nCảnh báo: Sắp đến hạn mức ngân sách danh mục.");
            }
        }
        return reply.toString();
    }

    private void appendAmounts(StringBuilder reply, BigDecimal limit, BigDecimal spent,
                               BigDecimal remaining, boolean exceeded) {
        reply.append("\nHạn mức: ").append(money(limit)).append(".\nĐã chi: ").append(money(spent))
                .append(".\nCòn lại: ").append(money(remaining)).append('.');
        if (exceeded) {
            reply.append("\nĐã vượt hạn mức ").append(money(remaining.abs())).append('.');
        } else if (remaining.signum() == 0) {
            reply.append("\nĐã dùng hết hạn mức, chưa vượt ngân sách.");
        } else {
            reply.append("\nChưa vượt ngân sách.");
        }
    }

    private String money(BigDecimal value) { return number(value) + " ₫"; }

    private String number(BigDecimal value) {
        // DecimalFormat không thread-safe: tạo riêng cho mỗi lần dùng, không chuyển sang double.
        var symbols = new DecimalFormatSymbols(Locale.ROOT);
        symbols.setGroupingSeparator('.');
        symbols.setDecimalSeparator(',');
        var format = new DecimalFormat("#,##0.00", symbols);
        format.setRoundingMode(RoundingMode.UNNECESSARY);
        return format.format(value);
    }
}
