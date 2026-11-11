package com.smartexpense.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class PasswordResetException extends ResponseStatusException {
    private final String code;

    public PasswordResetException(HttpStatus status, String code, String message) {
        super(status, message);
        this.code = code;
    }

    public String getCode() { return code; }

    public static PasswordResetException invalidToken() {
        return new PasswordResetException(HttpStatus.BAD_REQUEST, "INVALID_RESET_TOKEN",
                "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
    }

    public static PasswordResetException rateLimited() {
        return new PasswordResetException(HttpStatus.TOO_MANY_REQUESTS, "AUTH_RATE_LIMITED",
                "Quá nhiều yêu cầu. Vui lòng thử lại sau.");
    }
}
