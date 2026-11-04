package com.smartexpense.backend.exception;

import com.smartexpense.backend.controller.CategoryBudgetController;
import com.smartexpense.backend.dto.ApiError;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.sql.SQLException;

// Chỉ phân loại lỗi ghi của D07; không đổi cách xử lý lỗi các API hiện có.
@RestControllerAdvice(assignableTypes = CategoryBudgetController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CategoryBudgetExceptionHandler {

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleDataConflict(DataIntegrityViolationException exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            // MySQL 1062/23000 là duplicate key, khác lỗi FK/null/range và các lỗi DB khác.
            if (cause instanceof SQLException sql && sql.getErrorCode() == 1062 && "23000".equals(sql.getSQLState())) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.of(HttpStatus.CONFLICT));
            }
        }
        return ResponseEntity.internalServerError().body(ApiError.of(HttpStatus.INTERNAL_SERVER_ERROR));
    }
}
