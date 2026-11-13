package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatResponse.Stats;
import com.smartexpense.backend.dto.ai.AiChatResponse.Comparison;
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
    public String formatComparison(String intent, Comparison comparison) {
        StringBuilder reply = new StringBuilder("So sánh từ tháng ").append(comparison.baseMonth())
                .append(" đến tháng ").append(comparison.targetMonth()).append(':');
        reply.append('\n').append(summary(comparison.baseMonth(), comparison.base()));
        reply.append('\n').append(summary(comparison.targetMonth(), comparison.target()));
        reply.append("\nChênh lệch tổng thu: ").append(money(comparison.delta().totalIncome()))
                .append(".\nChênh lệch tổng chi: ").append(money(comparison.delta().totalExpense()))
                .append(".\nChênh lệch số dư: ").append(money(comparison.delta().balance())).append('.');
        reply.append("\nChi tiêu ").append(direction(comparison.delta().totalExpense())).append("; ")
                .append(percent(comparison.expenseChangePercent())).append('.');
        if (intent.equals("CATEGORY_TREND")) {
            if (comparison.categoryTrends().isEmpty()) {
                reply.append("\nKhông có chi tiêu theo danh mục trong cả hai tháng.");
            } else {
                var highest = comparison.categoryTrends().getFirst();
                if (highest.delta().signum() > 0) {
                    reply.append("\nDanh mục tăng chi tiêu nhiều nhất: \"").append(highest.categoryName())
                            .append("\" — tăng ").append(money(highest.delta())).append('.');
                } else {
                    reply.append("\nKhông có danh mục tăng chi tiêu.");
                }
                for (var category : comparison.categoryTrends()) {
                    reply.append("\nDanh mục \"").append(category.categoryName()).append("\": ")
                            .append(money(category.baseExpense())).append(" → ").append(money(category.targetExpense()))
                            .append("; ").append(direction(category.delta())).append(" ")
                            .append(money(category.delta().abs())).append("; ")
                            .append(percent(category.changePercent())).append('.');
                }
            }
        }
        return reply.toString();
    }

    private String direction(BigDecimal delta) {
        return delta.signum() > 0 ? "tăng" : delta.signum() < 0 ? "giảm" : "không đổi";
    }

    private String percent(BigDecimal value) {
        return value == null ? "không tính tỷ lệ vì chi tiêu kỳ gốc bằng 0" : "tỷ lệ thay đổi " + number(value) + "%";
    }

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
            appendBudgetAdvice(reply, monthly.getAmountLimit(), monthly.getSpentAmount());
        } else if ("NOT_SET".equals(budget.status())) {
            reply.append("\nChưa thiết lập ngân sách tổng cho tháng này.");
            reply.append("\nĐã chi trong tháng: ").append(money(context.stats().totalExpense())).append('.');
            reply.append("\nGợi ý: Xem lại chi tiêu thực tế và các khoản thiết yếu trước khi tự đặt hạn mức phù hợp.");
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
            appendBudgetAdvice(reply, category.getAmountLimit(), category.getSpentAmount());
        }
        if (context.stats().totalExpense().signum() == 0) {
            reply.append("\nChưa phát sinh chi tiêu trong tháng này; chưa có cơ sở xác định danh mục cần điều chỉnh.");
        } else if (!context.budgetSpending().isEmpty()) {
            reply.append("\nCác danh mục chi nhiều nhất trong tháng (không đồng nghĩa với chi không cần thiết):");
            for (var category : context.budgetSpending()) {
                reply.append("\nDanh mục \"").append(category.categoryName()).append("\": ")
                        .append(money(category.totalAmount())).append(" (tỷ trọng ")
                        .append(number(category.sharePercentage())).append("%).");
            }
            reply.append("\nGợi ý: Rà soát các khoản có thể trì hoãn trong các danh mục trên, ưu tiên khoản thiết yếu; "
                    + "chỉ cân nhắc điều chỉnh phân bổ sau khi đối chiếu nhu cầu thực tế.");
        }
        return reply.toString();
    }

    private void appendBudgetAdvice(StringBuilder reply, BigDecimal limit, BigDecimal spent) {
        // Không chia 0 hoặc dùng tỷ lệ đã làm tròn để phân loại ngưỡng 80%/100%.
        if (limit.signum() <= 0) {
            reply.append("\nKhông tính tỷ lệ sử dụng vì hạn mức không lớn hơn 0; hãy kiểm tra lại ngân sách.");
            return;
        }
        BigDecimal usage = spent.multiply(new BigDecimal("100")).divide(limit, 2, RoundingMode.HALF_UP);
        reply.append("\nTỷ lệ sử dụng: ").append(number(usage)).append("%.");
        if (spent.signum() == 0) {
            reply.append("\nGợi ý: Chưa phát sinh chi tiêu; hãy theo dõi các khoản sắp đến hạn trước khi quyết định chi thêm.");
        } else if (spent.compareTo(limit) > 0) {
            reply.append("\nGợi ý: Đã vượt hạn mức; rà soát các khoản có thể trì hoãn và ưu tiên nhu cầu thiết yếu, "
                    + "không tăng hạn mức chỉ để bù phần vượt.");
        } else if (spent.compareTo(limit) == 0) {
            reply.append("\nGợi ý: Đã đạt hạn mức; cân nhắc hoãn khoản chưa cần thiết trước khi phát sinh chi thêm.");
        } else if (spent.compareTo(limit.multiply(new BigDecimal("0.80"))) >= 0) {
            reply.append("\nCảnh báo: Sắp đến hạn mức ngân sách.");
            reply.append("\nGợi ý: Gần đạt hạn mức; đối chiếu phần còn lại với các khoản thiết yếu sắp tới, hạn chế khoản có thể trì hoãn.");
        } else {
            reply.append("\nGợi ý: Đang chi tiêu trong hạn mức; tiếp tục theo dõi phần còn lại trước các khoản chi mới.");
        }
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
