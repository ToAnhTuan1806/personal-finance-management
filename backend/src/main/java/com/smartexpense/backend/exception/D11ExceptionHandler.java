package com.smartexpense.backend.exception;

import com.smartexpense.backend.controller.AiChatController;
import com.smartexpense.backend.controller.TransactionExportController;
import com.smartexpense.backend.dto.ApiError;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = {AiChatController.class, TransactionExportController.class})
public class D11ExceptionHandler {
    @ExceptionHandler(D11Exception.class)
    public ResponseEntity<ApiError> handle(D11Exception exception) {
        var response = ResponseEntity.status(exception.getStatusCode()).contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore());
        if (exception.getStatusCode().value() == 429) response.header("Retry-After", "60");
        return response.body(new ApiError(exception.getStatusCode().value(), exception.getCode(),
                exception.getReason(), null));
    }
}
