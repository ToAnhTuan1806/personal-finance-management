package com.smartexpense.backend.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

@Documented
@Target(FIELD)
@Retention(RUNTIME)
@Constraint(validatedBy = NotFutureTransactionDateValidator.class)
public @interface NotFutureTransactionDate {

    String message() default "Ngày giao dịch không được lớn hơn ngày hiện tại.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
