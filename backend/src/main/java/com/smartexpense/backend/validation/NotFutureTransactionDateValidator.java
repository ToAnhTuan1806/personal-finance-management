package com.smartexpense.backend.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

public class NotFutureTransactionDateValidator
        implements ConstraintValidator<NotFutureTransactionDate, LocalDate> {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private final Clock clock;

    public NotFutureTransactionDateValidator(Clock clock) {
        this.clock = clock;
    }

    @Override
    public boolean isValid(LocalDate value, ConstraintValidatorContext context) {
        // Null thuộc @NotNull; tính lại hôm nay mỗi lần để không giữ ngày cũ qua nửa đêm.
        return value == null || !value.isAfter(LocalDate.now(clock.withZone(VIETNAM)));
    }
}
