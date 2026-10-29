package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.calendar.CalendarDayResponse;
import com.smartexpense.backend.dto.calendar.CalendarMonthResponse;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Ghép số liệu tổng hợp từ DB với các ngày trống để FE luôn nhận đủ một tháng.
@Service
@RequiredArgsConstructor
public class CalendarService {

    private final TransactionRepository transactionRepository;

    @Transactional(readOnly = true)
    public CalendarMonthResponse getMonth(Long userId, int year, int month) {
        // Giới hạn theo FR-04 và thống nhất với kỳ của Dashboard/Budget hiện tại.
        if (year < 1900 || year > 2100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Năm phải nằm trong khoảng 1900-2100");
        }
        if (month < 1 || month > 12) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tháng phải nằm trong khoảng 1-12");
        }
        YearMonth period = YearMonth.of(year, month);
        Map<LocalDate, Map<TransactionType, BigDecimal>> totals = new HashMap<>();

        // DATE không đổi qua UTC; khoảng nửa mở loại đúng giao dịch tháng kế tiếp, kể cả tháng 12.
        for (var row : transactionRepository.sumDailyAmountsByUserAndDateRange(
                userId, period.atDay(1), period.plusMonths(1).atDay(1))) {
            totals.computeIfAbsent(row.getTransactionDate(), date -> new EnumMap<>(TransactionType.class))
                    .put(row.getType(), row.getTotalAmount());
        }

        List<CalendarDayResponse> days = new ArrayList<>(period.lengthOfMonth());
        BigDecimal incomeTotal = BigDecimal.ZERO;
        BigDecimal expenseTotal = BigDecimal.ZERO;
        for (int day = 1; day <= period.lengthOfMonth(); day++) {
            LocalDate date = period.atDay(day);
            Map<TransactionType, BigDecimal> amounts = totals.getOrDefault(date, Map.of());
            BigDecimal income = amounts.getOrDefault(TransactionType.INCOME, BigDecimal.ZERO);
            BigDecimal expense = amounts.getOrDefault(TransactionType.EXPENSE, BigDecimal.ZERO);
            days.add(new CalendarDayResponse(date, income, expense));
            // Tổng tháng dùng cùng dữ liệu ngày, không truy vấn riêng gây lệch khi có ghi đồng thời.
            incomeTotal = incomeTotal.add(income);
            expenseTotal = expenseTotal.add(expense);
        }
        return new CalendarMonthResponse(year, month, incomeTotal, expenseTotal, List.copyOf(days));
    }
}
