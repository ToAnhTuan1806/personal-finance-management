package com.smartexpense.backend.exception;

import com.smartexpense.backend.controller.AuthController;
import com.smartexpense.backend.dto.ApiError;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = AuthController.class)
public class PasswordResetExceptionHandler {
    @ExceptionHandler(PasswordResetException.class)
    public ResponseEntity<ApiError> handle(PasswordResetException exception) {
        var response = ResponseEntity.status(exception.getStatusCode()).cacheControl(CacheControl.noStore());
        if (exception.getStatusCode().value() == 429) response.header("Retry-After", "900");
        return response.body(new ApiError(exception.getStatusCode().value(), exception.getCode(),
                exception.getReason(), null));
    }
}
