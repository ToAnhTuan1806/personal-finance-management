package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.dashboard.CategoryExpenseResponse;
import com.smartexpense.backend.dto.dashboard.DashboardSummaryResponse;
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
import java.time.format.DateTimeParseException;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final TransactionRepository transactionRepository;

    // Lấy tổng thu, tổng chi và số dư của tháng
    @Transactional(readOnly = true)
    public DashboardSummaryResponse getSummary(Long userId, String month) {
        YearMonth yearMonth = parseMonth(month);
        LocalDate startDate = yearMonth.atDay(1);
        LocalDate endDate = yearMonth.plusMonths(1).atDay(1);

        // Tính tổng thu nhập
        BigDecimal totalIncome = transactionRepository
                .sumAmountByUserAndTypeAndDateRange(
                        userId,
                        TransactionType.INCOME,
                        startDate,
                        endDate
                );

        // Tính tổng chi tiêu
        BigDecimal totalExpense = transactionRepository
                .sumAmountByUserAndTypeAndDateRange(
                        userId,
                        TransactionType.EXPENSE,
                        startDate,
                        endDate
                );

        // SUM trả null nếu tháng chưa có giao dịch
        if (totalIncome == null) {
            totalIncome = BigDecimal.ZERO;
        }
        if (totalExpense == null) {
            totalExpense = BigDecimal.ZERO;
        }

        // Số dư trong tháng = Tổng thu - Tổng chi
        BigDecimal balance = totalIncome.subtract(totalExpense);

        return new DashboardSummaryResponse(
                yearMonth.getYear(),
                yearMonth.getMonthValue(),
                totalIncome,
                totalExpense,
                balance
        );
    }

    // Lấy tổng chi tiêu của từng danh mục
    @Transactional(readOnly = true)
    public List<CategoryExpenseResponse> getExpensesByCategory(Long userId, String month) {
        YearMonth yearMonth = parseMonth(month);
        LocalDate startDate = yearMonth.atDay(1);
        LocalDate endDate = yearMonth.plusMonths(1).atDay(1);

        // Chỉ thống kê các giao dịch EXPENSE
        return transactionRepository.sumExpensesByCategory(
                userId,
                TransactionType.EXPENSE,
                startDate,
                endDate
        );
    }

    // Kiểm tra tháng đúng định dạng YYYY-MM
    private YearMonth parseMonth(String month) {
        if (month == null || !month.matches("\\d{4}-(0[1-9]|1[0-2])")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Tháng phải có định dạng YYYY-MM"
            );
        }

        try {
            YearMonth yearMonth = YearMonth.parse(month);

            // Đồng bộ giới hạn năm với BudgetService
            if (yearMonth.getYear() < 1900 || yearMonth.getYear() > 2100) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Năm phải nằm trong khoảng 1900-2100"
                );
            }

            return yearMonth;
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Tháng không hợp lệ"
            );
        }
    }
}
