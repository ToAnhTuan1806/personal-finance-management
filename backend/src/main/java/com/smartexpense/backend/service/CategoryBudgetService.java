package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.categorybudget.CategoryBudgetLimitRequest;
import com.smartexpense.backend.dto.categorybudget.CategoryBudgetRequest;
import com.smartexpense.backend.dto.categorybudget.CategoryBudgetResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.CategoryBudget;
import com.smartexpense.backend.enums.CategoryBudgetStatus;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryBudgetRepository;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CategoryBudgetService {

    private static final BigDecimal MAX_AMOUNT = new BigDecimal("9999999999999.99");
    private static final BigDecimal WARNING_RATIO = new BigDecimal("0.80");

    private final CategoryBudgetRepository budgetRepository;
    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;

    @Transactional(readOnly = true)
    public List<CategoryBudgetResponse> getAll(Long userId, int year, int month) {
        validatePeriod(year, month);
        List<CategoryBudget> budgets = budgetRepository.findAllByUserIdAndYearAndMonth(userId, year, month);
        if (budgets.isEmpty()) return List.of();

        // Một query tổng hợp cho cả kỳ, không query SUM riêng cho từng ngân sách.
        Map<Long, BigDecimal> spending = spendingByCategory(userId, year, month);
        return budgets.stream()
                .sorted(Comparator.comparing(budget -> budget.getCategory().getId()))
                .map(budget -> toResponse(budget, spending))
                .toList();
    }

    @Transactional(readOnly = true)
    public CategoryBudgetResponse getById(Long id, Long userId) {
        return responseWithCurrentSpending(findOwnedBudget(id, userId), userId);
    }

    @Transactional
    public CategoryBudgetResponse saveBudget(CategoryBudgetRequest request, Long userId) {
        validatePeriod(request.getYear(), request.getMonth());
        validateAmount(request.getAmountLimit());
        Category category = findExpenseCategory(request.getCategoryId(), userId);
        CategoryBudget budget = budgetRepository.findByUserIdAndCategoryIdAndYearAndMonth(
                userId, category.getId(), request.getYear(), request.getMonth()).orElseGet(() -> {
                    CategoryBudget created = new CategoryBudget();
                    created.setUser(category.getUser());
                    created.setCategory(category);
                    created.setYear(request.getYear());
                    created.setMonth(request.getMonth());
                    return created;
                });
        budget.setAmountLimit(request.getAmountLimit());
        // UNIQUE tại MySQL quyết định race tạo mới; không retry trong transaction đã lỗi.
        return responseWithCurrentSpending(budgetRepository.saveAndFlush(budget), userId);
    }

    @Transactional
    public CategoryBudgetResponse update(Long id, CategoryBudgetLimitRequest request, Long userId) {
        CategoryBudget budget = findOwnedBudget(id, userId);
        validateAmount(request.getAmountLimit());
        findExpenseCategory(budget.getCategory().getId(), userId);
        // Chỉ sửa hạn mức; giữ nguyên owner, category và kỳ của bản ghi.
        budget.setAmountLimit(request.getAmountLimit());
        return responseWithCurrentSpending(budgetRepository.saveAndFlush(budget), userId);
    }

    @Transactional
    public void delete(Long id, Long userId) {
        budgetRepository.delete(findOwnedBudget(id, userId));
    }

    private CategoryBudget findOwnedBudget(Long id, Long userId) {
        validateId(id);
        return budgetRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy ngân sách danh mục"));
    }

    private Category findExpenseCategory(Long categoryId, Long userId) {
        validateId(categoryId);
        Category category = categoryRepository.findByIdAndUserId(categoryId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy danh mục"));
        if (category.getType() != TransactionType.EXPENSE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chỉ thiết lập ngân sách cho danh mục Chi");
        }
        return category;
    }

    private CategoryBudgetResponse responseWithCurrentSpending(CategoryBudget budget, Long userId) {
        return toResponse(budget, spendingByCategory(userId, budget.getYear(), budget.getMonth()));
    }

    private Map<Long, BigDecimal> spendingByCategory(Long userId, int year, int month) {
        YearMonth period = YearMonth.of(year, month);
        Map<Long, BigDecimal> spending = new HashMap<>();
        for (var total : transactionRepository.sumExpensesByCategory(
                userId, TransactionType.EXPENSE, period.atDay(1), period.plusMonths(1).atDay(1))) {
            spending.put(total.getCategoryId(), total.getTotalAmount());
        }
        return spending;
    }

    private CategoryBudgetResponse toResponse(CategoryBudget budget, Map<Long, BigDecimal> spending) {
        BigDecimal spent = spending.getOrDefault(budget.getCategory().getId(), BigDecimal.ZERO);
        BigDecimal limit = budget.getAmountLimit();
        // So sánh bằng tiền chính xác trước khi làm tròn phần trăm hiển thị.
        CategoryBudgetStatus status = spent.compareTo(limit) >= 0 ? CategoryBudgetStatus.OVER_BUDGET
                : spent.compareTo(limit.multiply(WARNING_RATIO)) >= 0 ? CategoryBudgetStatus.WARNING
                : CategoryBudgetStatus.SAFE;
        BigDecimal percentage = spent.multiply(new BigDecimal("100")).divide(limit, 2, RoundingMode.HALF_UP);
        return new CategoryBudgetResponse(budget.getId(), budget.getCategory().getId(), budget.getCategory().getName(),
                budget.getYear(), budget.getMonth(), limit, spent, limit.subtract(spent), percentage,
                spent.compareTo(limit) > 0, status);
    }

    private void validatePeriod(Integer year, Integer month) {
        if (year == null || month == null || year < 1900 || year > 2100 || month < 1 || month > 12) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Năm phải từ 1900-2100, tháng phải từ 1-12");
        }
    }

    private void validateId(Long id) {
        if (id == null || id <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID phải là số nguyên dương");
        }
    }

    private void validateAmount(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0 || amount.compareTo(MAX_AMOUNT) > 0 || amount.scale() > 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ngân sách phải từ 0.01-9999999999999.99, tối đa 2 số thập phân");
        }
    }
}
