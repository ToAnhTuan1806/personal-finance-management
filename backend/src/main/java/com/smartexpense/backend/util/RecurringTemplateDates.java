package com.smartexpense.backend.util;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Objects;

// Quy tắc lịch thuần túy để D09 tái sử dụng; không tạo Transaction hoặc tự áp dụng mẫu.
public final class RecurringTemplateDates {
    private RecurringTemplateDates() { }

    // Lượt đầu/bật lại luôn sau hôm nay: không tự ghi bù kỳ cũ hoặc ngày vừa bật.
    public static LocalDate nextAfter(LocalDate today, int dayOfMonth) {
        Objects.requireNonNull(today, "today");
        YearMonth month = YearMonth.from(today);
        LocalDate date = resolve(month, dayOfMonth);
        if (!date.isAfter(today)) date = resolve(month.plusMonths(1), dayOfMonth);
        return date.getYear() > 2100 ? null : date;
    }

    public static LocalDate resolve(YearMonth month, int dayOfMonth) {
        Objects.requireNonNull(month, "month");
        if (dayOfMonth < 1 || dayOfMonth > 31) {
            throw new IllegalArgumentException("Ngày lặp phải từ 1 đến 31");
        }
        return month.atDay(Math.min(dayOfMonth, month.lengthOfMonth()));
    }
}
