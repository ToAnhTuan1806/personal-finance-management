package com.smartexpense.backend.service;

import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.mail.*;
import org.springframework.mail.javamail.*;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Properties;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SmtpPasswordResetEmailSenderTests {
    @Test
    void mailContainsConfiguredHeadersAndUtf8PlainTextAndHtmlAlternatives() throws Exception {
        JavaMailSender mail = mockMimeMail();
        sender(mail, "https://finance.example.test/").sendResetLink("private@example.test", "reset-token");
        ArgumentCaptor<MimeMessage> captured = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mail).send(captured.capture());
        MimeMessage message = captured.getValue();
        message.saveChanges();
        assertThat(((InternetAddress) message.getFrom()[0]).getAddress()).isEqualTo("noreply@example.test");
        assertThat(((InternetAddress) message.getFrom()[0]).getPersonal()).isEqualTo("SmartExpense");
        assertThat(message.getAllRecipients()).extracting(Object::toString).containsExactly("private@example.test");
        assertThat(message.getSubject()).isEqualTo("Đặt lại mật khẩu SmartExpense");
        assertThat(body(message, "text/plain")).contains("https://finance.example.test/reset-password?token=reset-token",
                "30 phút", "bỏ qua email").doesNotContain("password_hash", "<html");
        assertThat(body(message, "text/html")).contains("lang=\"vi\"", "Đặt lại mật khẩu", "30 phút", "Dùng một lần",
                "href=\"https://finance.example.test/reset-password?token=reset-token\"", "Mật khẩu hiện tại vẫn được giữ nguyên.")
                .doesNotContain("{{resetLink}}", "private@example.test", "password_hash", "<script", "<img");
        verify(mail, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void htmlEscapesLinkWithoutChangingPlainTextFallback() throws Exception {
        JavaMailSender mail = mockMimeMail();
        String token = "qa<token>\"&";
        sender(mail, "https://finance.example.test").sendResetLink("private@example.test", token);
        ArgumentCaptor<MimeMessage> captured = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mail).send(captured.capture());
        captured.getValue().saveChanges();
        assertThat(body(captured.getValue(), "text/html")).contains("qa&lt;token&gt;&quot;&amp;")
                .doesNotContain("qa<token>", "{{resetLink}}");
        assertThat(body(captured.getValue(), "text/plain")).contains("?token=" + token);
    }

    @Test
    void smtpFailureDoesNotExposeRecipientTokenOrCause() {
        JavaMailSender mail = mockMimeMail();
        doThrow(new MailSendException("private@example.test reset-token internal connection"))
                .when(mail).send(any(MimeMessage.class));
        assertThatThrownBy(() -> sender(mail, "https://finance.example.test")
                .sendResetLink("private@example.test", "reset-token"))
                .isInstanceOf(IllegalStateException.class).hasMessage("Password reset email delivery failed").hasNoCause();
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://finance.example.test", "https://user:secret@finance.example.test", "https://finance.example.test/?redirect=evil", "https://finance.example.test/#evil", "https://finance.example.test/path", "//evil.test", "invalid"})
    void rejectsUntrustedOrInsecureConfigurationWithoutExposingIt(String url) {
        JavaMailSender mail = mock(JavaMailSender.class);
        assertThatThrownBy(() -> sender(mail, url).sendResetLink("private@example.test", "reset-token"))
                .isInstanceOf(IllegalStateException.class).hasMessageNotContaining(url)
                .hasMessageNotContaining("private@example.test").hasMessageNotContaining("reset-token");
        verifyNoInteractions(mail);
    }

    @Test
    void localhostHttpAllowedOnlyOutsideProduction() {
        JavaMailSender mail = mockMimeMail();
        assertThatCode(() -> sender(mail, "http://localhost:5173").sendResetLink("private@example.test", "reset-token"))
                .doesNotThrowAnyException();
        StandardEnvironment env = new StandardEnvironment(); env.setActiveProfiles("production");
        var sender = sender(mail, "http://localhost:5173", env);
        assertThatThrownBy(() -> sender.sendResetLink("private@example.test", "reset-token")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void missingSmtpDoesNotPretendEmailWasSent() {
        JavaMailSender mail = mock(JavaMailSender.class);
        var service = new SmtpPasswordResetEmailSender(provider(mail), "", "", "", new StandardEnvironment());
        assertThat(service.isConfigured()).isFalse();
        assertThatThrownBy(() -> service.sendResetLink("private@example.test", "reset-token")).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(mail);
    }

    @Test
    void actualJavaMailTransportDeliversToIsolatedLoopbackSmtpStub() throws Exception {
        try (SmtpStub stub = new SmtpStub(false)) {
            JavaMailSenderImpl transport = transport(stub.port(), 2000);
            sender(transport, "http://localhost:5173").sendResetLink("private@example.test", "reset-token");
            String received = stub.received.get(3, TimeUnit.SECONDS);
            assertThat(received).contains("RCPT TO:<private@example.test>");
            String mime = received.substring(received.indexOf("DATA\n") + 5);
            var message = new jakarta.mail.internet.MimeMessage(jakarta.mail.Session.getInstance(new java.util.Properties()),
                    new ByteArrayInputStream(mime.getBytes(StandardCharsets.UTF_8)));
            assertThat(body(message, "text/plain")).contains("http://localhost:5173/reset-password?token=reset-token", "30 phút");
            assertThat(body(message, "text/html")).contains("href=\"http://localhost:5173/reset-password?token=reset-token\"", "Đặt lại mật khẩu")
                    .doesNotContain("{{resetLink}}");
        }
    }

    @Test
    void actualSmtpReadTimeoutIsBounded() throws Exception {
        try (SmtpStub stub = new SmtpStub(true)) {
            JavaMailSenderImpl transport = transport(stub.port(), 200);
            org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(Duration.ofSeconds(3), () ->
                    assertThatThrownBy(() -> sender(transport, "http://localhost:5173")
                            .sendResetLink("private@example.test", "reset-token"))
                            .isInstanceOf(IllegalStateException.class).hasMessage("Password reset email delivery failed")
                            .hasNoCause());
        }
    }

    private static JavaMailSender mockMimeMail() {
        JavaMailSender mail = mock(JavaMailSender.class);
        when(mail.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        return mail;
    }

    private static String body(Part part, String type) throws Exception {
        if (part.isMimeType(type)) return (String) part.getContent();
        if (part.isMimeType("multipart/*")) {
            Multipart parts = (Multipart) part.getContent();
            for (int index = 0; index < parts.getCount(); index++) {
                String found = body(parts.getBodyPart(index), type);
                if (!found.isEmpty()) return found;
            }
        }
        return "";
    }

    private static JavaMailSenderImpl transport(int port, int timeout) {
        JavaMailSenderImpl transport = new JavaMailSenderImpl();
        transport.setHost("127.0.0.1"); transport.setPort(port); transport.setDefaultEncoding("UTF-8");
        var props = transport.getJavaMailProperties();
        props.setProperty("mail.smtp.auth", "false"); props.setProperty("mail.smtp.starttls.enable", "false");
        props.setProperty("mail.smtp.connectiontimeout", Integer.toString(timeout));
        props.setProperty("mail.smtp.timeout", Integer.toString(timeout));
        props.setProperty("mail.smtp.writetimeout", Integer.toString(timeout));
        props.setProperty("mail.debug", "false");
        return transport;
    }

    private static SmtpPasswordResetEmailSender sender(JavaMailSender mail, String url) {
        return sender(mail, url, new StandardEnvironment());
    }

    private static SmtpPasswordResetEmailSender sender(JavaMailSender mail, String url, StandardEnvironment env) {
        return new SmtpPasswordResetEmailSender(provider(mail), "127.0.0.1", "noreply@example.test", url, env);
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<JavaMailSender> provider(JavaMailSender mail) {
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(mail); when(provider.getObject()).thenReturn(mail);
        return provider;
    }

    // Không thêm dependency/server ngoài; chỉ bind loopback ở port ngẫu nhiên và luôn đóng sau test.
    private static final class SmtpStub implements AutoCloseable {
        private final ServerSocket server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
        private final ExecutorService worker = Executors.newSingleThreadExecutor();
        private final CompletableFuture<String> received = new CompletableFuture<>();
        private volatile Socket client;

        SmtpStub(boolean stall) throws IOException {
            worker.execute(() -> {
                try (Socket socket = server.accept()) {
                    client = socket;
                    if (stall) { while (socket.getInputStream().read() != -1) { } return; }
                    BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    BufferedWriter output = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));
                    reply(output, "220 localhost SMTP stub");
                    StringBuilder captured = new StringBuilder(); boolean data = false;
                    for (String line; (line = input.readLine()) != null;) {
                        captured.append(line).append('\n');
                        if (data) {
                            if (line.equals(".")) { data = false; reply(output, "250 accepted"); received.complete(captured.toString()); }
                        } else if (line.startsWith("DATA")) { data = true; reply(output, "354 enter data"); }
                        else if (line.startsWith("QUIT")) { reply(output, "221 bye"); break; }
                        else reply(output, "250 OK");
                    }
                } catch (Exception exception) { received.completeExceptionally(exception); }
            });
        }

        int port() { return server.getLocalPort(); }
        private static void reply(BufferedWriter writer, String line) throws IOException { writer.write(line + "\r\n"); writer.flush(); }
        @Override public void close() throws Exception {
            server.close(); if (client != null) client.close(); worker.shutdownNow();
            assertThat(worker.awaitTermination(3, TimeUnit.SECONDS)).isTrue();
        }
    }
}
