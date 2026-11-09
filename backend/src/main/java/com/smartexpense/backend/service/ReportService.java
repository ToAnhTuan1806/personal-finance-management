package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.report.MonthlyReportResponse;
import com.smartexpense.backend.dto.report.MonthlySummaryResponse;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ReportService {

    private final TransactionRepository transactionRepository;

    // D11 có thể dùng lại DTO tổng hợp; không cần đọc các giao dịch riêng lẻ.
    @Transactional(readOnly = true)
    public MonthlyReportResponse getMonthlyReport(Long userId, String from, String to) {
        YearMonth firstMonth = parseMonth(from);
        YearMonth lastMonth = parseMonth(to);
        long monthCount = ChronoUnit.MONTHS.between(firstMonth, lastMonth) + 1;
        if (monthCount < 1 || monthCount > 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Khoảng báo cáo phải từ 1 đến 6 tháng, from không được lớn hơn to");
        }

        var startDate = firstMonth.atDay(1);
        // Khoảng nửa mở giữ đúng tháng cuối, kể cả tháng 12 và năm 2100.
        var endExclusive = lastMonth.plusMonths(1).atDay(1);
        Map<YearMonth, Map<TransactionType, BigDecimal>> totals = new HashMap<>();
        for (var row : transactionRepository.sumMonthlyAmountsByUserAndDateRange(
                userId, startDate, endExclusive)) {
            totals.computeIfAbsent(YearMonth.of(row.getYear(), row.getMonth()),
                            month -> new EnumMap<>(TransactionType.class))
                    .put(row.getType(), row.getTotalAmount());
        }

        List<MonthlySummaryResponse> months = new ArrayList<>((int) monthCount);
        for (YearMonth month = firstMonth; !month.isAfter(lastMonth); month = month.plusMonths(1)) {
            var amounts = totals.getOrDefault(month, Map.of());
            BigDecimal income = amounts.getOrDefault(TransactionType.INCOME, BigDecimal.ZERO);
            BigDecimal expense = amounts.getOrDefault(TransactionType.EXPENSE, BigDecimal.ZERO);
            months.add(new MonthlySummaryResponse(month.toString(), income, expense, income.subtract(expense)));
        }

        // Dùng lại query Dashboard: nhóm theo ID danh mục và sắp tổng chi giảm dần tại DB.
        var categories = transactionRepository.sumExpensesByCategory(
                userId, TransactionType.EXPENSE, startDate, endExclusive);
        return new MonthlyReportResponse(from, to, List.copyOf(months), List.copyOf(categories));
    }

    private YearMonth parseMonth(String month) {
        if (month == null || !month.matches("[0-9]{4}-(0[1-9]|1[0-2])")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tháng phải có định dạng YYYY-MM");
        }
        YearMonth parsed = YearMonth.parse(month);
        if (parsed.getYear() < 1900 || parsed.getYear() > 2100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Năm phải nằm trong khoảng 1900-2100");
        }
        return parsed;
    }
}
