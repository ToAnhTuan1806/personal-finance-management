package com.smartexpense.backend;

import com.smartexpense.backend.config.SecurityConfig;
import com.smartexpense.backend.controller.ReportController;
import com.smartexpense.backend.dto.dashboard.CategoryExpenseResponse;
import com.smartexpense.backend.dto.report.MonthlyReportResponse;
import com.smartexpense.backend.dto.report.MonthlySummaryResponse;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.TransactionRepository.MonthlyAmountTotal;
import com.smartexpense.backend.security.ApiSecurityExceptionHandler;
import com.smartexpense.backend.security.JwtConfig;
import com.smartexpense.backend.service.ReportService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Controller, service, JSON và bộ lọc JWT thật; query được xác minh riêng trên MySQL.
@WebMvcTest(ReportController.class)
@Import({ReportService.class, SecurityConfig.class, JwtConfig.class, ApiSecurityExceptionHandler.class})
class ReportApiTests {

    private static final String ENDPOINT = "/api/reports/monthly";
    private static final String JWT_KEY = randomKey();

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @MockitoBean TransactionRepository transactions;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.jwt.secret", () -> JWT_KEY);
    }

    @Test
    void returnsOrderedMonthsIncludingZerosAndUsesTwoBoundedOwnerQueries() throws Exception {
        var start = LocalDate.of(2026, 9, 1);
        var end = LocalDate.of(2026, 12, 1);
        var rows = List.of(
                row(2026, 11, TransactionType.EXPENSE, "9999999999999.99"),
                row(2026, 9, TransactionType.EXPENSE, "0.20"),
                row(2026, 9, TransactionType.INCOME, "0.30"));
        when(transactions.sumMonthlyAmountsByUserAndDateRange(7L, start, end)).thenReturn(rows);
        when(transactions.sumExpensesByCategory(7L, TransactionType.EXPENSE, start, end)).thenReturn(
                List.of(new CategoryExpenseResponse(12L, "Ăn uống", new BigDecimal("10000000000000.19"))));

        String body = mvc.perform(get(ENDPOINT).param("from", "2026-09").param("to", "2026-11")
                        .param("userId", "999").header(HttpHeaders.AUTHORIZATION, bearer("7", false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value("2026-09"))
                .andExpect(jsonPath("$.to").value("2026-11"))
                .andExpect(jsonPath("$.months[0].totalIncome").isNumber())
                .andExpect(jsonPath("$.expensesByCategory[0].totalAmount").isNumber())
                .andExpect(jsonPath("$.user").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        var response = json.readValue(body, MonthlyReportResponse.class);
        assertThat(response.months()).extracting(MonthlySummaryResponse::month)
                .containsExactly("2026-09", "2026-10", "2026-11");
        assertThat(response.months().get(0).balance()).isEqualByComparingTo("0.10");
        assertThat(response.months().get(1).totalIncome()).isZero();
        assertThat(response.months().get(1).totalExpense()).isZero();
        assertThat(response.months().get(1).balance()).isZero();
        assertThat(response.months().get(2).balance()).isEqualByComparingTo("-9999999999999.99");
        assertThat(json.readTree(body).size()).isEqualTo(4);
        assertThat(json.readTree(body).get("months").get(0).size()).isEqualTo(4);
        verify(transactions).sumMonthlyAmountsByUserAndDateRange(7L, start, end);
        verify(transactions).sumExpensesByCategory(7L, TransactionType.EXPENSE, start, end);
        verifyNoMoreInteractions(transactions);
    }

    @ParameterizedTest
    @CsvSource({"2026-10,2026-10,1", "2026-07,2026-12,6", "2026-12,2027-01,2",
            "1900-01,1900-01,1", "2100-12,2100-12,1"})
    void acceptsInclusiveRangesAndEmptyData(String from, String to, int count) throws Exception {
        mvc.perform(get(ENDPOINT).param("from", from).param("to", to)
                        .header(HttpHeaders.AUTHORIZATION, bearer("7", false)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.months.length()").value(count))
                .andExpect(jsonPath("$.months[0].month").value(from))
                .andExpect(jsonPath("$.months[" + (count - 1) + "].month").value(to))
                .andExpect(jsonPath("$.months[0].balance").value(0))
                .andExpect(jsonPath("$.expensesByCategory").isEmpty());
        verify(transactions).sumMonthlyAmountsByUserAndDateRange(7L,
                java.time.YearMonth.parse(from).atDay(1), java.time.YearMonth.parse(to).plusMonths(1).atDay(1));
    }

    @ParameterizedTest
    @CsvSource(value = {"NULL,2026-10", "2026-10,NULL", "NULL,NULL", "'',2026-10", "2026-10,''",
            "2026-1,2026-10", "2026-00,2026-10", "2026-13,2026-10", "bad,2026-10",
            "2026-01-01,2026-10", "2026-01,2026-1", "2026-01,2026-13", "2026-01,bad",
            "' 2026-01',2026-02", "2026-01,'2026-02 '", "1899-12,1900-01", "2100-12,2101-01",
            "0000-01,0000-02", "+2026-01,2026-02", "2026-11,2026-10", "2026-01,2026-07",
            "2026-10,2027-04", "1900-01,2100-12"}, nullValues = "NULL")
    void rejectsInvalidOrMissingPeriodBeforeQuerying(String from, String to) throws Exception {
        var request = get(ENDPOINT).header(HttpHeaders.AUTHORIZATION, bearer("7", false));
        if (from != null) request.param("from", from);
        if (to != null) request.param("to", to);
        mvc.perform(request).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.trace").doesNotExist());
        verifyNoInteractions(transactions);
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "invalid", "expired", "invalid-subject"})
    void rejectsUnauthenticatedRequestsBeforeQuerying(String kind) throws Exception {
        var request = get(ENDPOINT).param("from", "2026-10").param("to", "2026-10");
        if (!kind.equals("missing")) {
            String token = kind.equals("invalid") ? "Bearer not-a-jwt"
                    : bearer(kind.equals("invalid-subject") ? "other-user" : "7", kind.equals("expired"));
            request.header(HttpHeaders.AUTHORIZATION, token);
        }
        mvc.perform(request).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        verifyNoInteractions(transactions);
    }

    private String bearer(String subject, boolean expired) {
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder().subject(subject).issuedAt(now.minusSeconds(1200))
                .expiresAt(expired ? now.minusSeconds(600) : now.plusSeconds(600)).build();
        return "Bearer " + encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    private MonthlyAmountTotal row(int year, int month, TransactionType type, String amount) {
        var row = mock(MonthlyAmountTotal.class);
        when(row.getYear()).thenReturn(year);
        when(row.getMonth()).thenReturn(month);
        when(row.getType()).thenReturn(type);
        when(row.getTotalAmount()).thenReturn(new BigDecimal(amount));
        return row;
    }

    private static String randomKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }
}
