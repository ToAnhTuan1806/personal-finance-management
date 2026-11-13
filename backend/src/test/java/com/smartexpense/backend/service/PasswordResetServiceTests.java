package com.smartexpense.backend.service;

import com.smartexpense.backend.entity.*;
import com.smartexpense.backend.exception.PasswordResetException;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.security.PasswordResetRateLimiter;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.system.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.*;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(OutputCaptureExtension.class)
class PasswordResetServiceTests {
    private static final Instant NOW = Instant.parse("2026-11-10T10:00:00Z");
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordResetTokenRepository tokens = mock(PasswordResetTokenRepository.class);
    private final PasswordResetEmailSender mail = mock(PasswordResetEmailSender.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(4);
    private final List<Runnable> queued = new ArrayList<>();
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private PasswordResetService service;
    private User user;

    @BeforeEach
    void setup() {
        when(manager.getTransaction(any())).thenAnswer(call -> new SimpleTransactionStatus());
        when(mail.isConfigured()).thenReturn(true);
        service = create(queued::add);
        user = new User(); user.setId(1L); user.setEmail("private@example.test");
        user.setPasswordHash(passwords.encode("OldPassword123!"));
        when(users.findByEmailForPasswordReset(user.getEmail())).thenReturn(Optional.of(user));
        when(users.findByIdForPasswordReset(1L)).thenReturn(Optional.of(user));
    }

    private PasswordResetService create(Executor executor) {
        return new PasswordResetService(users, tokens, passwords, mail,
                new PasswordResetRateLimiter(clock), clock, executor, manager);
    }

    @Test
    void bothExistingAndUnknownEmailsOnlyQueueWorkWithoutAccountLookup() {
        service.requestReset("PRIVATE@EXAMPLE.TEST", "ip-a");
        service.requestReset("unknown@example.test", "ip-b");
        assertThat(queued).hasSize(2);
        verifyNoInteractions(users, tokens, mail, manager);
        queued.forEach(Runnable::run);
        verify(users).findByEmailForPasswordReset("private@example.test");
        verify(users).findByEmailForPasswordReset("unknown@example.test");
        verify(mail, times(1)).sendResetLink(eq(user.getEmail()), anyString());
    }

    @Test
    void responsePathDoesNotWaitForBlockedWorker() throws Exception {
        ExecutorService worker = Executors.newSingleThreadExecutor();
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch entered = new CountDownLatch(1);
        try {
            worker.execute(() -> { entered.countDown(); try { release.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } });
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            var async = create(worker);
            assertTimeoutPreemptively(Duration.ofSeconds(1), () -> {
                async.requestReset(user.getEmail(), "ip-a");
                async.requestReset("unknown@example.test", "ip-b");
            });
            verifyNoInteractions(users, tokens, mail);
        } finally { release.countDown(); worker.shutdown(); assertThat(worker.awaitTermination(5, TimeUnit.SECONDS)).isTrue(); }
    }

    @Test
    void randomTokenOnlySentByMailHashStoredWithExactlyThirtyMinutes(CapturedOutput output) {
        service.requestReset(user.getEmail(), "ip"); queued.removeFirst().run();
        ArgumentCaptor<PasswordResetToken> stored = ArgumentCaptor.forClass(PasswordResetToken.class);
        ArgumentCaptor<String> raw = ArgumentCaptor.forClass(String.class);
        verify(tokens).saveAndFlush(stored.capture());
        verify(mail).sendResetLink(eq(user.getEmail()), raw.capture());
        assertThat(Base64.getUrlDecoder().decode(raw.getValue())).hasSize(32);
        assertThat(raw.getValue()).matches("[A-Za-z0-9_-]{43}");
        assertThat(stored.getValue().getTokenHash()).matches("[a-f0-9]{64}")
                .isEqualTo(PasswordResetService.hash(raw.getValue())).isNotEqualTo(raw.getValue());
        assertThat(stored.getValue().getExpiresAt()).isEqualTo(LocalDateTime.ofInstant(NOW.plusSeconds(1800), ZoneOffset.UTC));
        assertThat(stored.getValue().getCreatedAt()).isEqualTo(LocalDateTime.ofInstant(NOW, ZoneOffset.UTC));
        assertThat(stored.getValue().getUsedAt()).isNull();
        var order = inOrder(tokens, manager, mail);
        order.verify(tokens).saveAndFlush(any()); order.verify(manager).commit(any()); order.verify(mail).sendResetLink(anyString(), anyString());
        assertThat(passwords.matches("OldPassword123!", user.getPasswordHash())).isTrue();
        assertThat(user.getAuthVersion()).isZero();
        assertThat(output.getAll()).doesNotContain(raw.getValue(), user.getEmail());
    }

    @Test
    void reissueProducesDifferentRandomTokenAndInvalidatesPrevious() {
        service.requestReset(user.getEmail(), "ip"); queued.removeFirst().run();
        service.requestReset(user.getEmail(), "ip"); queued.removeFirst().run();
        ArgumentCaptor<String> raw = ArgumentCaptor.forClass(String.class);
        verify(mail, times(2)).sendResetLink(eq(user.getEmail()), raw.capture());
        assertThat(raw.getAllValues()).doesNotHaveDuplicates();
        verify(tokens, times(2)).invalidateAll(eq(1L), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"wrong", "", "abc?token=secret"})
    void malformedTokenRejectedBeforeSql(String raw) {
        assertThatThrownBy(() -> service.resetPassword(raw, "NewPassword123!", "ip"))
                .isInstanceOf(PasswordResetException.class).hasMessageContaining("Liên kết");
        verifyNoInteractions(tokens);
    }

    @Test
    void missingTokenRejectedBeforeSql() {
        assertThatThrownBy(() -> service.resetPassword(null, "NewPassword123!", "ip")).isInstanceOf(PasswordResetException.class);
        verifyNoInteractions(tokens);
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 0})
    void expiryBoundaryIsExclusive(int seconds) {
        String raw = prepareToken(seconds);
        assertThatThrownBy(() -> service.resetPassword(raw, "NewPassword123!", "ip"))
                .isInstanceOf(PasswordResetException.class);
        verify(users, never()).flush(); verify(manager).rollback(any());
    }

    @Test
    void validTokenUpdatesOnlyPasswordVersionAndConsumesAllTokens() {
        String raw = prepareToken(1);
        service.resetPassword(raw, "NewPassword123!", "ip");
        assertThat(passwords.matches("NewPassword123!", user.getPasswordHash())).isTrue();
        assertThat(passwords.matches("OldPassword123!", user.getPasswordHash())).isFalse();
        assertThat(user.getAuthVersion()).isEqualTo(1);
        assertThat(user.getEmail()).isEqualTo("private@example.test");
        verify(tokens).invalidateAll(1L, LocalDateTime.ofInstant(NOW, ZoneOffset.UTC));
        verify(manager).commit(any());
        var order = inOrder(users, tokens);
        order.verify(tokens).findUserIdByTokenHash(anyString());
        order.verify(users).findByIdForPasswordReset(1L);
        order.verify(tokens).findByTokenHashForUpdate(anyString());
    }

    @Test
    void reusedTokenIsRejected() {
        String raw = prepareToken(60);
        service.resetPassword(raw, "NewPassword123!", "ip");
        assertThatThrownBy(() -> service.resetPassword(raw, "OtherPassword123!", "ip")).isInstanceOf(PasswordResetException.class);
        assertThat(user.getAuthVersion()).isEqualTo(1);
        verify(users, times(1)).flush();
    }

    @Test
    void samePasswordIsRejectedWithoutConsumingToken() {
        String raw = prepareToken(60);
        assertThatThrownBy(() -> service.resetPassword(raw, "OldPassword123!", "ip"))
                .isInstanceOfSatisfying(PasswordResetException.class, ex -> assertThat(ex.getCode()).isEqualTo("PASSWORD_REUSE"));
        service.resetPassword(raw, "NewPassword123!", "ip");
        verify(tokens, times(1)).invalidateAll(eq(1L), any());
    }

    @Test
    void unknownWellFormedTokenIsRejected() {
        assertThatThrownBy(() -> service.resetPassword(randomToken(), "NewPassword123!", "ip"))
                .isInstanceOf(PasswordResetException.class);
        verify(users, never()).findByIdForPasswordReset(anyLong());
    }

    @Test
    void mailErrorInvalidatesOnlyUndeliveredHashAndLogsNoSecret(CapturedOutput output) {
        doThrow(new IllegalStateException("SMTP_SECRET private@example.test reset-token"))
                .when(mail).sendResetLink(anyString(), anyString());
        service.requestReset(user.getEmail(), "ip"); queued.removeFirst().run();
        verify(tokens).invalidateUndelivered(matches("[a-f0-9]{64}"), any());
        assertThat(output.getAll()).contains("password_reset_email_delivery_failed")
                .doesNotContain("SMTP_SECRET", user.getEmail(), "reset-token");
    }

    @Test
    void missingSmtpDoesNotCreateTokenOrAffectOtherAuth() {
        when(mail.isConfigured()).thenReturn(false);
        service.requestReset(user.getEmail(), "ip"); queued.removeFirst().run();
        verifyNoInteractions(users, tokens); verify(mail, never()).sendResetLink(anyString(), anyString());
    }

    @Test
    void failedDatabaseWriteRollsBackAndDoesNotSendEmail(CapturedOutput output) {
        when(tokens.saveAndFlush(any())).thenThrow(new IllegalStateException("private-db-detail"));
        service.requestReset(user.getEmail(), "ip"); queued.removeFirst().run();
        verify(manager).rollback(any()); verify(manager, never()).commit(any());
        verify(mail, never()).sendResetLink(anyString(), anyString());
        assertThat(output.getAll()).contains("password_reset_processing_failed").doesNotContain("private-db-detail");
    }

    @Test
    void emailLimitUsesSameNormalizationAndSuppressesWithoutDisclosure() {
        for (int i = 0; i < 5; i++) service.requestReset(i % 2 == 0 ? user.getEmail() : " PRIVATE@EXAMPLE.TEST ", "ip-" + i);
        assertThat(queued).hasSize(3); verifyNoInteractions(users, tokens);
    }

    @Test
    void ipLimitCannotBeBypassedWithDifferentEmails() {
        for (int i = 0; i < 10; i++) service.requestReset("x" + i + "@example.test", "ip");
        assertThatThrownBy(() -> service.requestReset("other@example.test", "ip"))
                .isInstanceOfSatisfying(PasswordResetException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(429));
        assertThat(queued).hasSize(10);
    }

    @Test
    void resetAttemptsAreLimitedIncludingMalformedTokens() {
        for (int i = 0; i < 30; i++) assertThatThrownBy(() -> service.resetPassword("wrong", "NewPassword123!", "ip"))
                .isInstanceOf(PasswordResetException.class);
        assertThatThrownBy(() -> service.resetPassword("wrong", "NewPassword123!", "ip"))
                .isInstanceOfSatisfying(PasswordResetException.class, ex -> assertThat(ex.getCode()).isEqualTo("AUTH_RATE_LIMITED"));
    }

    @Test
    void queueRejectionDoesNotRunWorkOnRequestThread() {
        var rejected = create(task -> { throw new RejectedExecutionException("private-queue-detail"); });
        assertThatCode(() -> rejected.requestReset(user.getEmail(), "ip")).doesNotThrowAnyException();
        verifyNoInteractions(users, tokens);
    }

    private String prepareToken(int seconds) {
        String raw = randomToken(); String hash = PasswordResetService.hash(raw);
        PasswordResetToken token = new PasswordResetToken(); token.setUser(user); token.setTokenHash(hash);
        token.setExpiresAt(LocalDateTime.ofInstant(NOW.plusSeconds(seconds), ZoneOffset.UTC));
        when(tokens.findUserIdByTokenHash(hash)).thenReturn(Optional.of(1L));
        when(tokens.findByTokenHashForUpdate(hash)).thenReturn(Optional.of(token));
        return raw;
    }

    private static String randomToken() {
        byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static void assertTimeoutPreemptively(Duration duration, org.junit.jupiter.api.function.Executable executable) {
        Assertions.assertTimeoutPreemptively(duration, executable);
    }
}
