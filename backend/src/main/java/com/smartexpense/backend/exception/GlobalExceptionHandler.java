package com.smartexpense.backend.exception;

import com.smartexpense.backend.dto.ApiError;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.LinkedHashMap;
import java.util.Map;

// Chuẩn hóa lỗi MVC và nghiệp vụ, giữ HTTP status nhưng không lộ chi tiết hệ thống.
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    // Giữ lỗi nghiệp vụ như 404 khi không tìm thấy/khác chủ sở hữu và 409 khi xung đột.
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Object> handleBusinessException(ResponseStatusException exception) {
        return new ResponseEntity<>(ApiError.of(exception.getStatusCode(), exception.getReason(), null),
                exception.getHeaders(), exception.getStatusCode());
    }

    // Gom lỗi Bean Validation thành phản hồi 400 với thông báo theo từng trường.
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException exception, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError error : exception.getBindingResult().getFieldErrors()) {
            // Chỉ trả thông báo validation, không trả giá trị bị từ chối như mật khẩu.
            errors.putIfAbsent(error.getField(), error.getDefaultMessage() == null
                    ? "Dữ liệu không hợp lệ" : error.getDefaultMessage());
        }
        return new ResponseEntity<>(ApiError.of(status, null, errors), headers, status);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception exception, Object body, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        // Chuẩn hóa lỗi JSON/tham số sai (400), đường dẫn thiếu (404) và lỗi MVC khác.
        // Không trả nguyên ProblemDetail hoặc thông báo ngoại lệ của framework.
        return new ResponseEntity<>(ApiError.of(status), headers, status);
    }

    // Lỗi xác thực phát sinh trong MVC vẫn trả 401 như lỗi ở bộ lọc Security.
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Object> handleAuthenticationException(AuthenticationException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Bearer")
                .body(ApiError.of(HttpStatus.UNAUTHORIZED));
    }

    // Giữ lỗi thiếu quyền là 403, tránh bị xử lý nhầm thành lỗi máy chủ 500.
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Object> handleAccessDeniedException(AccessDeniedException exception) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiError.of(HttpStatus.FORBIDDEN));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Object> handleDataConflict(DataIntegrityViolationException exception) {
        // Trả 409 cả khi request đồng thời gây vi phạm unique/khóa ngoại sau bước kiểm tra.
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.of(HttpStatus.CONFLICT));
    }

    // Lỗi ngoài dự kiến trả 500 trung lập, không gửi stack trace hay chi tiết nội bộ.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpectedException(Exception exception) {
        return ResponseEntity.internalServerError().body(ApiError.of(HttpStatus.INTERNAL_SERVER_ERROR));
    }
}
