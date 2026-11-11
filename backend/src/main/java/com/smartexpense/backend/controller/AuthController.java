package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.auth.*;
import com.smartexpense.backend.service.AuthService;
import com.smartexpense.backend.service.PasswordResetService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;

    @PostMapping("/forgot-password")
    public ResponseEntity<AuthMessageResponse> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request, HttpServletRequest http) {
        // Không dùng X-Forwarded-For/Origin/Host do client gửi.
        passwordResetService.requestReset(request.getEmail(), http.getRemoteAddr());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(AuthMessageResponse.FORGOT);
    }

    @PostMapping("/reset-password")
    public ResponseEntity<AuthMessageResponse> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request, HttpServletRequest http) {
        passwordResetService.resetPassword(request.getToken(), request.getNewPassword(), http.getRemoteAddr());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(AuthMessageResponse.RESET);
    }

    // POST /api/auth/register
    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody RegisterRequest request) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(authService.register(request));
    }

    // POST /api/auth/login
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(
                authService.login(request)
        );
    }
}
