package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.budget.BudgetRequest;
import com.smartexpense.backend.dto.budget.BudgetResponse;
import com.smartexpense.backend.entity.MonthlyBudget;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.MonthlyBudgetRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;

@Service
@RequiredArgsConstructor
public class BudgetService {

    private final MonthlyBudgetRepository budgetRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;

    // Xem ngân sách của một tháng
    @Transactional(readOnly = true)
    public BudgetResponse getBudget(Long userId, int year, int month) {
        validateYearMonth(year, month);

        MonthlyBudget budget = budgetRepository
                .findByUserIdAndYearAndMonth(userId, year, month)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Chưa thiết lập ngân sách cho tháng này"
                ));

        return toResponse(budget, userId);
    }

    // Tạo mới hoặc cập nhật ngân sách tháng
    @Transactional
    public BudgetResponse saveBudget(Long userId, int year, int month, BudgetRequest request) {
        validateYearMonth(year, month);

        // Kiểm tra giới hạn tiền ở tầng nghiệp vụ
        if (request.getAmountLimit() == null || request.getAmountLimit().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Ngân sách phải lớn hơn 0"
            );
        }

        // Nếu đã có ngân sách thì cập nhật
        MonthlyBudget budget = budgetRepository
                .findByUserIdAndYearAndMonth(userId, year, month)
                .orElseGet(() -> {
                    User user = userRepository.findById(userId)
                            .orElseThrow(() -> new ResponseStatusException(
                                    HttpStatus.UNAUTHORIZED,
                                    "Tài khoản không tồn tại"
                            ));

                    MonthlyBudget newBudget = new MonthlyBudget();
                    newBudget.setUser(user);
                    newBudget.setYear(year);
                    newBudget.setMonth(month);
                    return newBudget;
                });

        budget.setAmountLimit(request.getAmountLimit());
        MonthlyBudget saved = budgetRepository.save(budget);

        return toResponse(saved, userId);
    }

    // Xóa ngân sách của tháng
    @Transactional
    public void deleteBudget(Long userId, int year, int month) {
        validateYearMonth(year, month);

        MonthlyBudget budget = budgetRepository
                .findByUserIdAndYearAndMonth(userId, year, month)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Không tìm thấy ngân sách"
                ));

        budgetRepository.delete(budget);
    }

    // Tính thông tin ngân sách để trả cho Frontend
    private BudgetResponse toResponse(MonthlyBudget budget, Long userId) {
        YearMonth yearMonth = YearMonth.of(budget.getYear(), budget.getMonth());
        LocalDate startDate = yearMonth.atDay(1);
        LocalDate endDate = yearMonth.plusMonths(1).atDay(1);

        // Chỉ cộng các giao dịch EXPENSE của tháng
        BigDecimal spentAmount = transactionRepository
                .sumAmountByUserAndTypeAndDateRange(
                        userId,
                        TransactionType.EXPENSE,
                        startDate,
                        endDate
                );

        // SUM có thể trả về null nếu chưa có giao dịch
        if (spentAmount == null) {
            spentAmount = BigDecimal.ZERO;
        }

        BigDecimal remainingAmount = budget.getAmountLimit().subtract(spentAmount);
        boolean exceeded = spentAmount.compareTo(budget.getAmountLimit()) > 0;

        return new BudgetResponse(
                budget.getId(),
                budget.getYear(),
                budget.getMonth(),
                budget.getAmountLimit(),
                spentAmount,
                remainingAmount,
                exceeded
        );
    }

    // Kiểm tra năm và tháng hợp lệ
    private void validateYearMonth(int year, int month) {
        if (year < 1900 || year > 2100 || month < 1 || month > 12) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Năm hoặc tháng không hợp lệ"
            );
        }
    }
}
