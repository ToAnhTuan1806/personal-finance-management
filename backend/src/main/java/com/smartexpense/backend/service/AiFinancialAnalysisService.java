package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiAnalysis;
import com.smartexpense.backend.dto.ai.AiAnalysis.*;
import com.smartexpense.backend.dto.dashboard.CategoryExpenseResponse;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.*;
import java.util.*;

@Service
@RequiredArgsConstructor
public class AiFinancialAnalysisService {
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private final TransactionRepository transactions;
    private final MonthlyBudgetRepository budgets;
    private final RecurringTemplateRepository recurring;
    private final Clock clock;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AiAnalysis analyze(Long owner, AiQueryInterpreter.Query query) {
        LocalDate today = LocalDate.now(clock.withZone(VIETNAM));
        YearMonth month = YearMonth.parse(query.month());
        String kind = query.intent();
        if (kind.equals("SPENDING_INSIGHT")) return insight(owner, month, query.compareMonth(), today);
        if (!month.equals(YearMonth.from(today))) return result(kind, "NOT_CURRENT_MONTH",
                kind.equals("PURCHASE_SIMULATION") ? "Thử trước khi mua" : "Dự báo ngân sách",
                "Hãy chọn tháng hiện tại để tính các khoản còn lại và ngày đến hạn.", today,
                month.atDay(1), month.atEndOfMonth(), List.of(), List.of(), List.of(), List.of(), null,
                List.of("Dự báo và mô phỏng chỉ áp dụng cho tháng hiện tại theo giờ Việt Nam."));
        BigDecimal amount = query.purchase() == null ? null : query.purchase().amount();
        if (kind.equals("PURCHASE_SIMULATION") && amount == null) return result(kind, "NEEDS_AMOUNT",
                "Thử trước khi mua", "Bạn định mua gì và giá bao nhiêu? Hãy nêu một số tiền cho mỗi lần mô phỏng.",
                today, month.atDay(1), today, List.of(), List.of(), List.of(), List.of(), null,
                List.of("Chưa tạo hoặc thay đổi giao dịch nào."));
        return plan(owner, month, today, amount);
    }

    private AiAnalysis insight(Long owner, YearMonth month, String comparison, LocalDate today) {
        LocalDate start = month.atDay(1);
        if (month.isAfter(YearMonth.from(today))) return result("SPENDING_INSIGHT", "NO_DATA", "Vì sao chi tiêu thay đổi?",
                "Tháng này chưa bắt đầu nên chưa thể giải thích chi tiêu thực tế.", today, start, month.atEndOfMonth(),
                List.of(), List.of(), List.of(), List.of(), null, List.of());
        LocalDate end = month.equals(YearMonth.from(today)) ? today : month.atEndOfMonth();
        YearMonth base = comparison == null ? month.minusMonths(1) : YearMonth.parse(comparison);
        if (base.getYear() < 1900 || base.isAfter(YearMonth.from(today))) return result("SPENDING_INSIGHT", "NO_DATA",
                "Vì sao chi tiêu thay đổi?", "Chưa có kỳ so sánh hợp lệ để phân tích.", today, start, end,
                List.of(), List.of(), List.of(), List.of(), null, List.of());
        // Tháng hiện tại so với cùng số ngày, không so nửa tháng với cả tháng.
        LocalDate baseEnd = month.equals(YearMonth.from(today))
                ? base.atDay(Math.min(end.getDayOfMonth(), base.lengthOfMonth())) : base.atEndOfMonth();
        List<CategoryExpenseResponse> current = transactions.sumExpensesByCategory(owner, TransactionType.EXPENSE, start, end.plusDays(1));
        List<CategoryExpenseResponse> previous = transactions.sumExpensesByCategory(owner, TransactionType.EXPENSE, base.atDay(1), baseEnd.plusDays(1));
        BigDecimal now = total(current), before = total(previous), delta = now.subtract(before);
        Map<Long, CategoryExpenseResponse> old = new HashMap<>(), latest = new HashMap<>();
        previous.forEach(c -> old.put(c.getCategoryId(), c)); current.forEach(c -> latest.put(c.getCategoryId(), c));
        Map<Long, CategoryExpenseResponse> union = new HashMap<>(old); union.putAll(latest);
        Comparator<Driver> order = delta.signum() < 0 ? Comparator.comparing(Driver::delta)
                : delta.signum() > 0 ? Comparator.comparing(Driver::delta).reversed()
                : Comparator.comparing((Driver d) -> d.delta().abs()).reversed();
        List<Driver> drivers = union.values().stream().map(c -> {
            BigDecimal a = old.containsKey(c.getCategoryId()) ? old.get(c.getCategoryId()).getTotalAmount() : BigDecimal.ZERO;
            BigDecimal b = latest.containsKey(c.getCategoryId()) ? latest.get(c.getCategoryId()).getTotalAmount() : BigDecimal.ZERO;
            return new Driver(c.getCategoryId(), c.getCategoryName(), a, b, b.subtract(a));
        }).filter(d -> d.delta().signum() != 0).sorted(order.thenComparing(Driver::categoryId)).limit(3).toList();
        Long category = drivers.isEmpty() ? null : drivers.getFirst().categoryId();
        List<Evidence> evidence = category == null || drivers.getFirst().currentAmount().signum() == 0 ? List.of()
                : transactions.findAnalysisEvidence(owner, category, start, end.plusDays(1), PageRequest.of(0, 3)).stream()
                .map(t -> new Evidence(t.getId(), t.getDate(), t.getCategoryName(), t.getNote(), t.getAmount())).toList();
        String summary = delta.signum() == 0 ? "Tổng chi không đổi so với kỳ đối chiếu."
                : "Chi tiêu " + (delta.signum() > 0 ? "tăng " : "giảm ") + money(delta.abs()) + " so với kỳ đối chiếu.";
        List<String> highlights = new ArrayList<>();
        if (!drivers.isEmpty()) highlights.add(drivers.getFirst().categoryName() + " thay đổi nhiều nhất theo hướng "
                + (delta.signum() == 0 ? "biến động: " : delta.signum() > 0 ? "tăng: " : "giảm: ") + money(drivers.getFirst().delta()) + ".");
        if (before.signum() == 0 && now.signum() > 0) highlights.add("Kỳ gốc chưa có chi tiêu; không tính phần trăm tăng từ 0.");
        if (!evidence.isEmpty()) highlights.add("Bên dưới là tối đa 3 giao dịch lớn trong danh mục đứng đầu để bạn kiểm tra.");
        boolean empty = now.signum() == 0 && before.signum() == 0;
        return result("SPENDING_INSIGHT", empty ? "NO_DATA" : "READY", "Vì sao chi tiêu thay đổi?",
                empty ? "Hai giai đoạn chưa có khoản chi nào được ghi nhận." : summary, today, start, end,
                List.of(metric("Đã chi", now), metric("Kỳ đối chiếu", before), metric("Chênh lệch", delta)),
                highlights, drivers, evidence, empty ? null : new TransactionFilter(start, end, category),
                List.of("Đối chiếu " + start + " → " + end + " với " + base.atDay(1) + " → " + baseEnd + ".",
                        "Giải thích theo số liệu đã ghi; các giao dịch lớn là bằng chứng để rà soát, không khẳng định nguyên nhân ngoài dữ liệu."));
    }

    private AiAnalysis plan(Long owner, YearMonth month, LocalDate today, BigDecimal purchase) {
        String kind = purchase == null ? "BUDGET_FORECAST" : "PURCHASE_SIMULATION";
        String title = purchase == null ? "Dự báo đến cuối tháng" : "Thử trước khi mua";
        LocalDate start = month.atDay(1), exclusive = today.plusDays(1);
        BigDecimal spent = zero(transactions.sumAmountByUserAndTypeAndDateRange(owner, TransactionType.EXPENSE, start, exclusive));
        BigDecimal pending = zero(recurring.sumPendingExpenses(owner, today, month.plusMonths(1).atDay(1), month.getYear(), month.getMonthValue()));
        var budget = budgets.findByUserIdAndYearAndMonth(owner, month.getYear(), month.getMonthValue());
        List<String> assumptions = new ArrayList<>(List.of(
                "Theo các khoản đã ghi trong SmartExpense; đây không phải số dư tài khoản ngân hàng.",
                "Chỉ tính mẫu chi đang bật, đã có ngày chạy trong tháng và chưa có dấu ghi nhận; không ghi bù lịch quá hạn.",
                "Khoản định kỳ đã ghi được loại khỏi mức chi thường ngày để tránh nhân lặp; khoản nhập tay chưa liên kết mẫu vẫn được coi là chi thường ngày."));
        if (purchase != null) assumptions.add("Mô phỏng theo ngân sách tổng tháng, chưa xét ngân sách danh mục hoặc mục tiêu tiết kiệm; không lưu giao dịch.");
        TransactionFilter filter = new TransactionFilter(start, today, null);
        if (budget.isEmpty()) return result(kind, "BUDGET_NOT_SET", title,
                "Bạn chưa đặt ngân sách tổng tháng để đánh giá mức chi này.", today, start, today,
                purchase == null ? List.of(metric("Đã ghi", spent), metric("Định kỳ còn lại", pending))
                        : List.of(metric("Khoản mua dự kiến", purchase), metric("Đã ghi", spent)),
                List.of("Đặt hạn mức tháng rồi hỏi lại để xem phần ngân sách còn lại."), List.of(), List.of(), filter, assumptions);
        BigDecimal limit = budget.get().getAmountLimit();
        int elapsed = today.getDayOfMonth(), remainingDays = month.lengthOfMonth() - elapsed;
        var variable = transactions.summarizeVariableSpending(owner, start, exclusive);
        boolean enough = remainingDays == 0 || (elapsed >= 7 && variable != null && variable.getActiveDays() != null
                && variable.getActiveDays() >= 3 && zero(variable.getAmount()).signum() > 0);
        BigDecimal projected = enough ? spent.add(pending).add(remainingDays == 0 ? BigDecimal.ZERO
                : zero(variable.getAmount()).multiply(BigDecimal.valueOf(remainingDays)).divide(BigDecimal.valueOf(elapsed), 2, RoundingMode.HALF_UP)) : null;
        assumptions.add("Ước tính giữ nguyên mức chi thường ngày bình quân từ đầu tháng, gồm ngày hiện tại; tối thiểu 7 ngày trong tháng và 3 ngày có chi thường ngày. Khoản chưa ghi có thể làm kết quả thay đổi.");
        if (purchase != null) {
            BigDecimal afterKnown = limit.subtract(spent).subtract(pending).subtract(purchase);
            BigDecimal afterForecast = projected == null ? null : limit.subtract(projected).subtract(purchase);
            String summary = afterKnown.signum() < 0 ? "Khoản mua vượt phần ngân sách còn lại sau khi dành cho chi định kỳ."
                    : afterForecast != null && afterForecast.signum() < 0 ? "Khoản mua có nguy cơ làm vượt ngân sách nếu giữ nhịp chi hiện tại."
                    : "Sau khoản mua, còn " + money(afterKnown) + " trước các khoản chi thường ngày sắp tới.";
            List<Metric> metrics = new ArrayList<>(List.of(metric("Khoản mua", purchase), metric("Còn sau mua & định kỳ", afterKnown)));
            if (afterForecast != null) metrics.add(metric("Ước còn cuối tháng", afterForecast));
            return result(kind, enough ? "READY" : "INSUFFICIENT_DATA", title, summary, today, start, today, metrics,
                    List.of("Đã dành " + money(pending) + " cho khoản định kỳ chưa ghi.",
                            enough ? "Dự báo có tính thêm nhịp chi thường ngày." : "Chưa đủ dữ liệu dự báo nhịp chi; số còn lại chỉ trừ các khoản đã biết.",
                            "Đây là phép thử ngân sách, chưa tạo giao dịch."), List.of(), List.of(), filter, assumptions);
        }
        if (!enough) return result(kind, "INSUFFICIENT_DATA", title,
                "Chưa đủ dữ liệu để ước tính nhịp chi đến cuối tháng.", today, start, today,
                List.of(metric("Đã ghi", spent), metric("Định kỳ còn lại", pending), metric("Hạn mức", limit)),
                List.of("Cần ít nhất 7 ngày trong tháng và 3 ngày có khoản chi thường ngày.",
                        "Các khoản chi định kỳ đã ghi không được dùng để nhân ra phần chi còn lại."), List.of(), List.of(), filter, assumptions);
        BigDecimal forecastRemaining = limit.subtract(projected);
        BigDecimal daily = limit.subtract(spent).subtract(pending).max(BigDecimal.ZERO);
        if (remainingDays > 0) daily = daily.divide(BigDecimal.valueOf(remainingDays), 2, RoundingMode.DOWN);
        else daily = BigDecimal.ZERO;
        return result(kind, "READY", title, forecastRemaining.signum() < 0
                        ? "Có nguy cơ vượt ngân sách khoảng " + money(forecastRemaining.abs()) + " nếu giữ nhịp chi hiện tại."
                        : "Theo nhịp chi đã ghi, cuối tháng dự kiến còn " + money(forecastRemaining) + " trong hạn mức.",
                today, start, today, List.of(metric("Ước chi cuối tháng", projected), metric("Ước còn trong hạn mức", forecastRemaining), metric("Còn/ngày sau định kỳ", daily)),
                List.of("Đã ghi " + money(spent) + "; còn " + money(pending) + " khoản định kỳ chưa ghi.",
                        "Còn " + remainingDays + " ngày sau hôm nay; đây là ước tính, không phải cam kết số dư."),
                List.of(), List.of(), filter, assumptions);
    }

    private AiAnalysis result(String kind, String status, String title, String summary, LocalDate asOf,
                              LocalDate start, LocalDate end, List<Metric> metrics, List<String> highlights,
                              List<Driver> drivers, List<Evidence> evidence, TransactionFilter filter, List<String> assumptions) {
        return new AiAnalysis(kind, status, title, summary, asOf, start, end, List.copyOf(metrics),
                List.copyOf(highlights), List.copyOf(drivers), List.copyOf(evidence), filter, List.copyOf(assumptions));
    }
    private Metric metric(String label, BigDecimal amount) { return new Metric(label, amount, "MONEY"); }
    private BigDecimal total(List<CategoryExpenseResponse> values) { return values.stream().map(CategoryExpenseResponse::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add); }
    private BigDecimal zero(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    private String money(BigDecimal amount) {
        var format = NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN"));
        format.setMaximumFractionDigits(2); return format.format(amount) + " ₫";
    }
}
