package com.smartexpense.backend.dto.calendar;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CalendarDayResponse(LocalDate date, BigDecimal incomeTotal, BigDecimal expenseTotal) {
}
