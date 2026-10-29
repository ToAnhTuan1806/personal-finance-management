package com.smartexpense.backend;

import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.TransactionRepository.DailyAmountTotal;
import com.smartexpense.backend.service.CalendarService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CalendarServiceTests {

    private TransactionRepository transactions;
    private CalendarService service;

    @BeforeEach
    void prepare() {
        transactions = mock(TransactionRepository.class);
        service = new CalendarService(transactions);
    }

    // Query phải có owner và ranh giới nửa mở; thứ tự trả từ DB không quyết định thứ tự ngày trên API.
    @Test
    void usesOneBoundedOwnerQueryAndBuildsCompleteOrderedMonth() {
        LocalDate start = LocalDate.of(2026, 12, 1);
        LocalDate end = LocalDate.of(2027, 1, 1);
        var rows = List.of(
                row("2026-12-31", TransactionType.EXPENSE, "0.20"),
                row("2026-12-01", TransactionType.INCOME, "0.10"),
                row("2026-12-31", TransactionType.INCOME, "0.20"));
        when(transactions.sumDailyAmountsByUserAndDateRange(7L, start, end)).thenReturn(rows);

        var response = service.getMonth(7L, 2026, 12);
        assertThat(response.days()).hasSize(31);
        assertThat(response.days()).extracting(day -> day.date())
                .containsExactlyElementsOf(start.datesUntil(end).toList());
        assertThat(response.incomeTotal()).isEqualByComparingTo("0.30");
        assertThat(response.expenseTotal()).isEqualByComparingTo("0.20");
        assertThat(response.days().get(1).incomeTotal()).isZero();
        assertThat(response.days().get(1).expenseTotal()).isZero();
        verify(transactions).sumDailyAmountsByUserAndDateRange(7L, start, end);
        verifyNoMoreInteractions(transactions);
    }

    // Input sai phải dừng trước khi chạm DB, không để thành lỗi 500 của YearMonth.
    @ParameterizedTest
    @CsvSource({"1899,1", "2101,1", "-2147483648,1", "2147483647,1", "2026,0", "2026,13", "2026,-1"})
    void rejectsInvalidPeriodBeforeQuerying(int year, int month) {
        assertThatThrownBy(() -> service.getMonth(7L, year, month))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        verifyNoInteractions(transactions);
    }

    private DailyAmountTotal row(String date, TransactionType type, String amount) {
        DailyAmountTotal row = mock(DailyAmountTotal.class);
        when(row.getTransactionDate()).thenReturn(LocalDate.parse(date));
        when(row.getType()).thenReturn(type);
        when(row.getTotalAmount()).thenReturn(new BigDecimal(amount));
        return row;
    }
}
