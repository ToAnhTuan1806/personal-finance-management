package com.smartexpense.backend.service;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import jakarta.mail.MessagingException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
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
        try {
            JavaMailSender sender = mail.getObject();
            var message = sender.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(from, "SmartExpense");
            helper.setTo(email);
            helper.setSubject("Đặt lại mật khẩu SmartExpense");
            String plainText = "Bạn đã yêu cầu đặt lại mật khẩu SmartExpense.\n\n"
                    + "Mở liên kết sau để đặt mật khẩu mới:\n" + link + "\n\n"
                    + "Liên kết có hiệu lực 30 phút và chỉ được sử dụng một lần.\n"
                    + "Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu hiện tại vẫn được giữ nguyên.";
            String html = new ClassPathResource("mail/password-reset.html")
                    .getContentAsString(StandardCharsets.UTF_8)
                    .replace("{{resetLink}}", HtmlUtils.htmlEscape(link, StandardCharsets.UTF_8.name()));
            helper.setText(plainText, html);
            sender.send(message);
        } catch (MailException | MessagingException | IOException exception) {
            // MIME/SMTP errors can contain recipient/link/configuration; do not expose their cause.
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
