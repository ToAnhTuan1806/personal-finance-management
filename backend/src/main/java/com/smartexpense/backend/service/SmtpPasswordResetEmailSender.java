package com.smartexpense.backend.service;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.Set;

@Service
public class SmtpPasswordResetEmailSender implements PasswordResetEmailSender {
    private final ObjectProvider<JavaMailSender> mail;
    private final String host;
    private final String from;
    private final String frontendUrl;
    private final Environment environment;

    public SmtpPasswordResetEmailSender(ObjectProvider<JavaMailSender> mail,
            @Value("${spring.mail.host:}") String host,
            @Value("${app.mail.from:}") String from,
            @Value("${app.frontend-url:}") String frontendUrl, Environment environment) {
        this.mail = mail;
        this.host = host;
        this.from = from;
        this.frontendUrl = frontendUrl;
        this.environment = environment;
    }

    @Override
    public boolean isConfigured() {
        return !host.isBlank() && !from.isBlank() && !frontendUrl.isBlank() && mail.getIfAvailable() != null;
    }

    @Override
    public void sendResetLink(String email, String rawToken) {
        if (!isConfigured()) throw new IllegalStateException("Password reset email is not configured");
        String link = trustedBaseUrl() + "/reset-password?token=" + rawToken;
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Đặt lại mật khẩu SmartExpense");
        message.setText("Bạn đã yêu cầu đặt lại mật khẩu SmartExpense.\n\n"
                + "Mở liên kết sau để đặt mật khẩu mới:\n" + link + "\n\n"
                + "Liên kết có hiệu lực 30 phút và chỉ được sử dụng một lần.\n"
                + "Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu hiện tại vẫn được giữ nguyên.");
        try {
            mail.getObject().send(message);
        } catch (MailException exception) {
            // MailSendException có thể giữ failed message chứa recipient/link. Không truyền cause này ra ngoài.
            throw new IllegalStateException("Password reset email delivery failed");
        }
    }

    private String trustedBaseUrl() {
        try {
            URI uri = URI.create(frontendUrl);
            boolean local = Set.of("localhost", "127.0.0.1", "[::1]").contains(uri.getHost() == null ? "" : uri.getHost());
            boolean secure = "https".equalsIgnoreCase(uri.getScheme());
            boolean localHttp = local && "http".equalsIgnoreCase(uri.getScheme())
                    && !environment.matchesProfiles("prod", "production");
            if ((!secure && !localHttp) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) {
                throw new IllegalArgumentException();
            }
            return frontendUrl.endsWith("/") ? frontendUrl.substring(0, frontendUrl.length() - 1) : frontendUrl;
        } catch (IllegalArgumentException exception) {
            // Không đưa cấu hình URL, recipient hoặc token vào exception.
            throw new IllegalStateException("APP_FRONTEND_URL must be a trusted HTTPS origin (HTTP localhost in development only)");
        }
    }
}
