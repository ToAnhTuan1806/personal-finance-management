package com.smartexpense.backend.service;

public interface PasswordResetEmailSender {
    boolean isConfigured();
    void sendResetLink(String email, String rawToken);
}
