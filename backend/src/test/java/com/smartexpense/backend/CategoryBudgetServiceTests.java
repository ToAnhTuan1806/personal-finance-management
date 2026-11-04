package com.smartexpense.backend;

import com.smartexpense.backend.dto.categorybudget.CategoryBudgetLimitRequest;
import com.smartexpense.backend.dto.categorybudget.CategoryBudgetRequest;
import com.smartexpense.backend.dto.dashboard.CategoryExpenseResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.CategoryBudget;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.CategoryBudgetStatus;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryBudgetRepository;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.service.CategoryBudgetService;
import jakarta.validation.Validation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CategoryBudgetServiceTests {

    private final CategoryBudgetRepository budgets = mock(CategoryBudgetRepository.class);
    private final CategoryRepository categories = mock(CategoryRepository.class);
    private final TransactionRepository transactions = mock(TransactionRepository.class);
    private final CategoryBudgetService service = new CategoryBudgetService(budgets, categories, transactions);
    private Category category;
    private CategoryBudget budget;

    @BeforeEach
    void fixtures() {
        User user = new User();
        user.setId(1L);
        category = new Category();
        category.setId(11L);
        category.setUser(user);
        category.setName("Ăn uống");
        category.setType(TransactionType.EXPENSE);
        budget = new CategoryBudget();
        budget.setId(31L);
        budget.setUser(user);
        budget.setCategory(category);
        budget.setYear(2026);
        budget.setMonth(12);
        budget.setAmountLimit(new BigDecimal("100.00"));
        when(budgets.findByIdAndUserId(31L, 1L)).thenReturn(Optional.of(budget));
        when(categories.findByIdAndUserId(11L, 1L)).thenReturn(Optional.of(category));
        when(budgets.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @ParameterizedTest
    @CsvSource({
            "0,0.00,SAFE,false", "79.994,79.99,SAFE,false", "79.999,80.00,SAFE,false",
            "80,80.00,WARNING,false", "99.999,100.00,WARNING,false",
            "100,100.00,OVER_BUDGET,false", "120,120.00,OVER_BUDGET,true"
    })
    void usesExactThresholdsBeforeRounding(String spent, String percentage, CategoryBudgetStatus status, boolean exceeded) {
        // Tổng tiền thực tế có 2 số lẻ; hạn mức lớn hơn để tạo tỷ lệ sát ngưỡng.
        budget.setAmountLimit(new BigDecimal("1000.00"));
        BigDecimal actualSpent = new BigDecimal(spent).multiply(BigDecimal.TEN);
        spending(actualSpent);
        var response = service.getById(31L, 1L);
        assertThat(response.getUsagePercentage()).isEqualByComparingTo(percentage);
        assertThat(response.getStatus()).isEqualTo(status);
        assertThat(response.isExceeded()).isEqualTo(exceeded);
        assertThat(response.getRemainingAmount()).isEqualByComparingTo(budget.getAmountLimit().subtract(actualSpent));
    }

    @Test
    void listUsesOneGroupedQueryAndSortsByCategory() {
        Category otherCategory = new Category();
        otherCategory.setId(22L);
        otherCategory.setName("Đi lại");
        CategoryBudget other = new CategoryBudget();
        other.setCategory(otherCategory);
        other.setAmountLimit(new BigDecimal("50.00"));
        when(budgets.findAllByUserIdAndYearAndMonth(1L, 2026, 12)).thenReturn(List.of(other, budget));
        spending(new BigDecimal("120.00"));
        var response = service.getAll(1L, 2026, 12);
        assertThat(response).extracting("categoryId").containsExactly(11L, 22L);
        assertThat(response.get(1).getSpentAmount()).isEqualByComparingTo("0");
        verify(transactions, times(1)).sumExpensesByCategory(1L, TransactionType.EXPENSE,
                LocalDate.of(2026, 12, 1), LocalDate.of(2027, 1, 1));
    }

    @Test
    void emptyMonthDoesNotQueryTransactions() {
        assertThat(service.getAll(1L, 2026, 12)).isEmpty();
        verifyNoInteractions(transactions);
    }

    @Test
    void readsCurrentSpendingAgainAfterTransactionsChange() {
        spending(new BigDecimal("120.00"));
        assertThat(service.getById(31L, 1L).getSpentAmount()).isEqualByComparingTo("120.00");
        spending(BigDecimal.ZERO);
        assertThat(service.getById(31L, 1L).getStatus()).isEqualTo(CategoryBudgetStatus.SAFE);
    }

    @Test
    void createUsesCategoryOwnerAndExistingPeriodUpdatesSameBudget() {
        CategoryBudgetRequest request = request("200.00");
        service.saveBudget(request, 1L);
        var created = org.mockito.ArgumentCaptor.forClass(CategoryBudget.class);
        verify(budgets).saveAndFlush(created.capture());
        assertThat(created.getValue().getUser()).isSameAs(category.getUser());
        assertThat(created.getValue().getCategory()).isSameAs(category);
        assertThat(created.getValue().getYear()).isEqualTo(2026);
        assertThat(created.getValue().getMonth()).isEqualTo(12);

        when(budgets.findByUserIdAndCategoryIdAndYearAndMonth(1L, 11L, 2026, 12)).thenReturn(Optional.of(budget));
        assertThat(service.saveBudget(request, 1L).getId()).isEqualTo(31L);
        verify(budgets).saveAndFlush(budget);
    }

    @Test
    void deniesForeignBudgetReadsUpdatesAndDeletes() {
        CategoryBudgetLimitRequest request = new CategoryBudgetLimitRequest();
        request.setAmountLimit(BigDecimal.TEN);
        assertNotFound(() -> service.getById(31L, 2L));
        assertNotFound(() -> service.update(31L, request, 2L));
        assertNotFound(() -> service.delete(31L, 2L));
        verify(budgets, never()).saveAndFlush(any());
        verify(budgets, never()).delete(any());
    }

    @Test
    void rejectsForeignCategoryAndIncomeBeforeWriting() {
        assertNotFound(() -> service.saveBudget(request("10.00"), 2L));
        category.setType(TransactionType.INCOME);
        assertThatThrownBy(() -> service.saveBudget(request("10.00"), 1L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        verify(budgets, never()).saveAndFlush(any());
    }

    @Test
    void updateOnlyChangesLimitAndDeleteOnlyDeletesBudget() {
        CategoryBudgetLimitRequest request = new CategoryBudgetLimitRequest();
        request.setAmountLimit(new BigDecimal("250.00"));
        service.update(31L, request, 1L);
        assertThat(budget.getAmountLimit()).isEqualByComparingTo("250.00");
        assertThat(budget.getUser().getId()).isEqualTo(1L);
        assertThat(budget.getCategory()).isSameAs(category);
        assertThat(budget.getYear()).isEqualTo(2026);
        assertThat(budget.getMonth()).isEqualTo(12);
        clearInvocations(categories, transactions);
        service.delete(31L, 1L);
        verify(budgets).delete(budget);
        verifyNoInteractions(categories, transactions);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "0.001", "1.001", "10000000000000.00"})
    void rejectsInvalidMoneyInValidationAndService(String amount) {
        var request = request(amount);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(request)).isNotEmpty();
        }
        assertThatThrownBy(() -> service.saveBudget(request, 1L)).isInstanceOf(ResponseStatusException.class);
        verify(budgets, never()).saveAndFlush(any());
    }

    @ParameterizedTest
    @CsvSource({"1899,12", "2101,1", "2026,0", "2026,13"})
    void rejectsInvalidPeriodsBeforeQuerying(int year, int month) {
        assertThatThrownBy(() -> service.getAll(1L, year, month)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(budgets, transactions);
    }

    private CategoryBudgetRequest request(String amount) {
        CategoryBudgetRequest request = new CategoryBudgetRequest();
        request.setCategoryId(11L);
        request.setYear(2026);
        request.setMonth(12);
        request.setAmountLimit(new BigDecimal(amount));
        return request;
    }

    private void spending(BigDecimal amount) {
        when(transactions.sumExpensesByCategory(1L, TransactionType.EXPENSE,
                LocalDate.of(2026, 12, 1), LocalDate.of(2027, 1, 1)))
                .thenReturn(List.of(new CategoryExpenseResponse(11L, category.getName(), amount)));
    }

    private void assertNotFound(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }
}
