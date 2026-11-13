package com.smartexpense.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

// Chỉ dành cho API D11; không đổi mã lỗi của các API hiện có.
public class D11Exception extends ResponseStatusException {
    private final String code;

    public D11Exception(HttpStatus status, String code, String message) {
        super(status, message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
