package com.smartexpense.backend.service;

import com.smartexpense.backend.entity.PasswordResetToken;
import com.smartexpense.backend.exception.PasswordResetException;
import com.smartexpense.backend.repository.PasswordResetTokenRepository;
import com.smartexpense.backend.repository.UserRepository;
import com.smartexpense.backend.security.PasswordResetRateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

@Service
public class PasswordResetService {
    private static final Logger LOG = LoggerFactory.getLogger(PasswordResetService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final PasswordEncoder passwords;
    private final PasswordResetEmailSender email;
    private final PasswordResetRateLimiter limiter;
    private final Clock clock;
    private final Executor executor;
    private final TransactionTemplate transaction;

    public PasswordResetService(UserRepository users, PasswordResetTokenRepository tokens,
            PasswordEncoder passwords, PasswordResetEmailSender email, PasswordResetRateLimiter limiter,
            Clock clock, @Qualifier("passwordResetExecutor") Executor executor,
            PlatformTransactionManager transactionManager) {
        this.users = users;
        this.tokens = tokens;
        this.passwords = passwords;
        this.email = email;
        this.limiter = limiter;
        this.clock = clock;
        this.executor = executor;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public void requestReset(String requestedEmail, String remoteAddress) {
        if (!limiter.allow("forgot-ip:" + remoteAddress, 10)) throw PasswordResetException.rateLimited();
        String normalized = AuthService.normalizeEmail(requestedEmail);
        // Email bị giới hạn vẫn trả cùng 200; không cho suy ra tài khoản từ bộ đếm.
        if (!limiter.allow("forgot-email:" + hash(normalized), 3)) return;
        try {
            // Cả email có/không tồn tại đều chỉ enqueue; không query DB/SMTP trên HTTP thread.
            executor.execute(() -> processRequest(normalized));
        } catch (RejectedExecutionException exception) {
            LOG.warn("password_reset_queue_full");
        }
    }

    private void processRequest(String normalized) {
        try {
            if (!email.isConfigured()) {
                LOG.warn("password_reset_email_not_configured");
                return;
            }
            byte[] bytes = new byte[32];
            RANDOM.nextBytes(bytes);
            String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            String tokenHash = hash(raw);
            // Khóa User trước token trong tất cả transaction cấp/reset để tránh deadlock.
            String recipient = transaction.execute(status -> {
                var user = users.findByEmailForPasswordReset(normalized).orElse(null);
                if (user == null) return null;
                LocalDateTime now = utcNow();
                tokens.invalidateAll(user.getId(), now);
                PasswordResetToken token = new PasswordResetToken();
                token.setUser(user);
                token.setTokenHash(tokenHash);
                token.setCreatedAt(now);
                token.setExpiresAt(now.plusMinutes(30));
                tokens.saveAndFlush(token);
                return user.getEmail();
            });
            if (recipient == null) return;
            try {
                // Chỉ gửi sau commit; không giữ khóa User trong thời gian kết nối SMTP.
                email.sendResetLink(recipient, raw);
            } catch (RuntimeException exception) {
                LOG.warn("password_reset_email_delivery_failed");
                // Chỉ vô hiệu đúng token gửi lỗi, không ảnh hưởng yêu cầu mới hơn.
                transaction.executeWithoutResult(status -> tokens.invalidateUndelivered(tokenHash, utcNow()));
            }
        } catch (RuntimeException exception) {
            // Không log exception/cause: SMTP và DB có thể chứa recipient/link hoặc cấu hình.
            LOG.error("password_reset_processing_failed");
        }
    }

    public void resetPassword(String rawToken, String newPassword, String remoteAddress) {
        if (!limiter.allow("reset-ip:" + remoteAddress, 30)) throw PasswordResetException.rateLimited();
        if (rawToken == null || !rawToken.matches("[A-Za-z0-9_-]{43}")) throw PasswordResetException.invalidToken();
        if (newPassword == null || newPassword.isBlank() || newPassword.length() < 8
                || newPassword.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new PasswordResetException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "Mật khẩu phải có tối thiểu 8 ký tự và tối đa 72 bytes UTF-8.");
        }
        String tokenHash = hash(rawToken);
        transaction.executeWithoutResult(status -> {
            Long userId = tokens.findUserIdByTokenHash(tokenHash).orElseThrow(PasswordResetException::invalidToken);
            var user = users.findByIdForPasswordReset(userId).orElseThrow(PasswordResetException::invalidToken);
            var token = tokens.findByTokenHashForUpdate(tokenHash).orElseThrow(PasswordResetException::invalidToken);
            LocalDateTime now = utcNow();
            if (token.getUsedAt() != null || !now.isBefore(token.getExpiresAt())
                    || !userId.equals(token.getUser().getId())) throw PasswordResetException.invalidToken();
            if (passwords.matches(newPassword, user.getPasswordHash())) {
                throw new PasswordResetException(HttpStatus.BAD_REQUEST, "PASSWORD_REUSE",
                        "Mật khẩu mới phải khác mật khẩu hiện tại.");
            }
            user.setPasswordHash(passwords.encode(newPassword));
            user.setAuthVersion(Math.incrementExact(user.getAuthVersion()));
            token.setUsedAt(now);
            // Flush thay đổi password/version/token trước bulk update; tất cả rollback cùng nhau.
            tokens.invalidateAll(userId, now);
            users.flush();
        });
    }

    private LocalDateTime utcNow() {
        return LocalDateTime.ofInstant(clock.instant().truncatedTo(ChronoUnit.MICROS), ZoneOffset.UTC);
    }

    static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable");
        }
    }
}
