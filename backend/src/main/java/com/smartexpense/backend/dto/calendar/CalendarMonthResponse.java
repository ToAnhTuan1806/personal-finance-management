package com.smartexpense.backend.dto.calendar;

import java.math.BigDecimal;
import java.util.List;

public record CalendarMonthResponse(int year, int month, BigDecimal incomeTotal, BigDecimal expenseTotal,
                                    List<CalendarDayResponse> days) {
}
