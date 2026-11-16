package com.smartexpense.backend;

import com.smartexpense.backend.config.SecurityConfig;
import com.smartexpense.backend.controller.BudgetController;
import com.smartexpense.backend.dto.budget.BudgetResponse;
import com.smartexpense.backend.entity.MonthlyBudget;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.MonthlyBudgetRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import com.smartexpense.backend.security.ApiSecurityExceptionHandler;
import com.smartexpense.backend.security.JwtConfig;
import com.smartexpense.backend.service.BudgetService;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.Base64;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Controller/service/JSON thật; JWT signature và SQL được kiểm tra ở integration test.
@WebMvcTest(BudgetController.class)
@Import({BudgetService.class, SecurityConfig.class, JwtConfig.class, ApiSecurityExceptionHandler.class})
class MonthlyBudgetApiTests {

    private static final String JWT_KEY = randomKey();

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @MockitoBean MonthlyBudgetRepository budgets;
    @MockitoBean TransactionRepository transactions;
    @MockitoBean UserRepository users;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.jwt.secret", () -> JWT_KEY);
    }

    @ParameterizedTest
    @CsvSource({"79.99,20.01,false", "80.00,20.00,false", "100.00,0.00,false", "100.01,-0.01,true"})
    void preservesExactCentsAndStrictExceededWithoutAddingStatus(String spent, String remaining,
                                                               boolean exceeded) throws Exception {
        budget(2026, 12);
        when(transactions.sumAmountByUserAndTypeAndDateRange(7L, TransactionType.EXPENSE,
                LocalDate.of(2026, 12, 1), LocalDate.of(2027, 1, 1))).thenReturn(new BigDecimal(spent));

        String body = read(2026, 12);
        var response = json.readValue(body, BudgetResponse.class);
        assertThat(response.getAmountLimit()).isEqualByComparingTo("100.00");
        assertThat(response.getSpentAmount()).isEqualByComparingTo(spent);
        assertThat(response.getRemainingAmount()).isEqualByComparingTo(remaining);
        assertThat(response.isExceeded()).isEqualTo(exceeded);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = "0.00")
    void emptySumReturnsZeroSpendingAndFullRemainingLimit(String sum) throws Exception {
        budget(2026, 12);
        when(transactions.sumAmountByUserAndTypeAndDateRange(7L, TransactionType.EXPENSE,
                LocalDate.of(2026, 12, 1), LocalDate.of(2027, 1, 1)))
                .thenReturn(sum == null ? null : new BigDecimal(sum));
        var response = json.readValue(read(2026, 12), BudgetResponse.class);
        assertThat(response.getSpentAmount()).isZero();
        assertThat(response.getRemainingAmount()).isEqualByComparingTo("100.00");
        assertThat(response.isExceeded()).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"2026,12,2026-12-01,2027-01-01", "2027,1,2027-01-01,2027-02-01"})
    void queriesOnlyJwtOwnerExpensesInHalfOpenMonth(int year, int month, String start, String end)
            throws Exception {
        budget(year, month);
        read(year, month);
        verify(budgets).findByUserIdAndYearAndMonth(7L, year, month);
        verify(transactions).sumAmountByUserAndTypeAndDateRange(7L, TransactionType.EXPENSE,
                LocalDate.parse(start), LocalDate.parse(end));
        verifyNoMoreInteractions(budgets, transactions);
    }

    private void budget(int year, int month) {
        var budget = new MonthlyBudget();
        budget.setId(31L);
        budget.setYear(year);
        budget.setMonth(month);
        budget.setAmountLimit(new BigDecimal("100.00"));
        when(budgets.findByUserIdAndYearAndMonth(7L, year, month)).thenReturn(Optional.of(budget));
    }

    private String read(int year, int month) throws Exception {
        String body = mvc.perform(get("/api/budgets/{year}/{month}", year, month)
                        .with(jwt().jwt(token -> token.subject("7"))).param("userId", "999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountLimit").isNumber())
                .andExpect(jsonPath("$.spentAmount").isNumber())
                .andExpect(jsonPath("$.remainingAmount").isNumber())
                .andExpect(jsonPath("$.status").doesNotExist())
                .andExpect(jsonPath("$.usagePercentage").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(body).propertyNames()).containsExactlyInAnyOrder(
                "id", "year", "month", "amountLimit", "spentAmount", "remainingAmount", "exceeded");
        return body;
    }

    private static String randomKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }
}
