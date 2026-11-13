package com.smartexpense.backend;

import com.smartexpense.backend.dto.auth.*;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.*;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Test hành vi/khóa/rollback MySQL bằng schema JPA tạm; KHÔNG chứng minh migration V006.
@SpringBootTest(classes = BackendApplication.class, properties = {"spring.main.allow-bean-definition-overriding=true"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@ActiveProfiles("d03-test")
@Import({MySqlIntegrationTestSupport.IsolatedDataSource.class, PasswordResetIntegrationTests.TestClockConfig.class})
@Testcontainers(disabledWithoutDocker = true)
class PasswordResetIntegrationTests extends MySqlIntegrationTestSupport {
    private static final Instant NOW = Instant.parse("2026-11-10T10:00:00Z");
    @Autowired AuthService auth;
    @Autowired PasswordResetService reset;
    @Autowired JwtEncoder encoder;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired MutableClock clock;
    @MockitoBean PasswordResetEmailSender mail;
    @MockitoBean(name = "passwordResetExecutor") Executor executor;
    @MockitoSpyBean UserRepository users;
    private final AtomicReference<String> raw = new AtomicReference<>();
    private Long owner;
    private String email;
    private String ip;
    private String oldJwt;

    @BeforeEach
    void setup() throws Exception {
        verifyMySqlConnection(); clock.now.set(NOW);
        email = UUID.randomUUID() + "@example.test"; ip = UUID.randomUUID().toString();
        RegisterRequest register = new RegisterRequest(); register.setFullName("D12 Synthetic");
        register.setEmail(email); register.setPassword("OldPassword123!");
        owner = auth.register(register).getId(); oldJwt = login("OldPassword123!");
        when(mail.isConfigured()).thenReturn(true);
        doAnswer(call -> { raw.set(call.getArgument(1)); return null; }).when(mail).sendResetLink(anyString(), anyString());
        doAnswer(call -> { ((Runnable) call.getArgument(0)).run(); return null; }).when(executor).execute(any());
    }

    @Test
    void resetChangesPasswordRevokesBothSessionsAndLegacyJwtButPreservesOtherAccount() throws Exception {
        String sessionB = login("OldPassword123!"); String legacy = legacyJwt();
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + legacy)).andExpect(status().isOk());
        String other = registerOther();
        issue(); String token = raw.get();
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + oldJwt)).andExpect(status().isOk());
        reset.resetPassword(token, "NewPassword123!", ip);
        assertThatThrownBy(() -> login("OldPassword123!")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        String fresh = login("NewPassword123!");
        for (String revoked : List.of(oldJwt, sessionB, legacy)) {
            mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + revoked))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
            mvc.perform(get("/api/transactions").header("Authorization", "Bearer " + revoked)).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + fresh)).andExpect(status().isOk());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + other)).andExpect(status().isOk());
        assertThat(users.findById(owner).orElseThrow().getAuthVersion()).isEqualTo(1);
        assertThatThrownBy(() -> reset.resetPassword(token, "OtherPassword123!", ip)).isInstanceOf(com.smartexpense.backend.exception.PasswordResetException.class);
        mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized()); // logout phía client không giữ session.
    }

    @Test
    void exactlyOneOfTwoConcurrentRequestsCanConsumeToken() throws Exception {
        issue(); String token = raw.get();
        try (ExecutorService workers = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Integer>> requests = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                final String password = "ConcurrentPassword" + i + "!";
                requests.add(workers.submit(() -> {
                    start.await();
                    try { reset.resetPassword(token, password, ip); return 200; }
                    catch (com.smartexpense.backend.exception.PasswordResetException ex) { return ex.getStatusCode().value(); }
                }));
            }
            start.countDown();
            assertThat(List.of(requests.get(0).get(10, TimeUnit.SECONDS), requests.get(1).get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 400);
        }
        assertThat(users.findById(owner).orElseThrow().getAuthVersion()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id=? AND used_at IS NOT NULL", Integer.class, owner)).isEqualTo(1);
    }

    @Test
    void concurrentReissueLeavesOnlyOneActiveToken() throws Exception {
        try (ExecutorService workers = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1); List<Future<?>> requests = new ArrayList<>();
            for (int i = 0; i < 2; i++) requests.add(workers.submit(() -> { start.await(); issue(); return null; }));
            start.countDown(); for (var request : requests) request.get(10, TimeUnit.SECONDS);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL", Integer.class, owner)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id=?", Integer.class, owner)).isEqualTo(2);
    }

    @Test
    void reissueInvalidatesPreviousToken() {
        issue(); String previous = raw.get(); issue(); String latest = raw.get();
        assertThat(previous).isNotEqualTo(latest);
        assertThatThrownBy(() -> reset.resetPassword(previous, "NewPassword123!", ip)).isInstanceOf(com.smartexpense.backend.exception.PasswordResetException.class);
        reset.resetPassword(latest, "NewPassword123!", ip);
    }

    @Test
    void exactExpiryBoundaryRejectsAndOneMicrosecondBeforeAccepts() {
        issue(); String first = raw.get();
        clock.now.set(NOW.plusSeconds(1800));
        assertThatThrownBy(() -> reset.resetPassword(first, "NewPassword123!", ip)).isInstanceOf(com.smartexpense.backend.exception.PasswordResetException.class);
        clock.now.set(NOW); issue(); String second = raw.get();
        clock.now.set(NOW.plusSeconds(1800).minusNanos(1000));
        reset.resetPassword(second, "NewPassword123!", ip);
        assertThat(login("NewPassword123!")).isNotBlank();
    }

    @Test
    void failureAfterFlushRollsBackPasswordVersionAndTokenTogether() {
        issue(); String token = raw.get(); String before = users.findById(owner).orElseThrow().getPasswordHash();
        doThrow(new DataAccessResourceFailureException("D12 synthetic failure after token flush")).when(users).flush();
        assertThatThrownBy(() -> reset.resetPassword(token, "NewPassword123!", ip)).isInstanceOf(DataAccessResourceFailureException.class);
        org.mockito.Mockito.reset(users); // Khôi phục delegate thật của Spring Data proxy sau fault injection.
        var unchanged = users.findById(owner).orElseThrow();
        assertThat(unchanged.getPasswordHash()).isEqualTo(before); assertThat(unchanged.getAuthVersion()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL", Integer.class, owner)).isEqualTo(1);
        reset.resetPassword(token, "NewPassword123!", ip);
        assertThat(login("NewPassword123!")).isNotBlank();
    }

    @Test
    void financialDataAndUserProfileRemainUnchanged() {
        Long category = jdbc.queryForObject("SELECT MIN(id) FROM categories WHERE user_id=? AND type='EXPENSE'", Long.class, owner);
        jdbc.update("INSERT INTO transactions(user_id,category_id,type,amount,transaction_date,note,created_at) VALUES (?,?,'EXPENSE',12.34,'2026-11-10','D12 synthetic',CURRENT_TIMESTAMP)", owner, category);
        jdbc.update("INSERT INTO monthly_budgets(user_id,year,month,amount_limit) VALUES (?,2026,11,1000)", owner);
        jdbc.update("INSERT INTO category_budgets(user_id,category_id,year,month,amount_limit) VALUES (?,?,2026,11,500)", owner, category);
        jdbc.update("INSERT INTO recurring_templates(user_id,category_id,type,amount,day_of_month,active) VALUES (?,?,'EXPENSE',12.34,10,true)", owner, category);
        var before = financialSnapshot(); var profile = jdbc.queryForMap("SELECT id,full_name,email,created_at FROM users WHERE id=?", owner);
        issue(); reset.resetPassword(raw.get(), "NewPassword123!", ip);
        assertThat(financialSnapshot()).isEqualTo(before);
        assertThat(jdbc.queryForMap("SELECT id,full_name,email,created_at FROM users WHERE id=?", owner)).isEqualTo(profile);
    }

    @Test
    void smtpFailureLeavesPasswordAndVersionUnchangedAndTokenUnusable() {
        doThrow(new IllegalStateException("synthetic SMTP timeout")).when(mail).sendResetLink(anyString(), anyString());
        issue();
        assertThat(login("OldPassword123!")).isNotBlank();
        assertThat(users.findById(owner).orElseThrow().getAuthVersion()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL", Integer.class, owner)).isZero();
    }

    private void issue() { reset.requestReset(email.toUpperCase(Locale.ROOT), ip); }
    private String login(String password) {
        LoginRequest request = new LoginRequest(); request.setEmail(email); request.setPassword(password);
        return auth.login(request).getAccessToken();
    }
    private String registerOther() {
        RegisterRequest request = new RegisterRequest(); request.setFullName("Other D12");
        request.setEmail(UUID.randomUUID() + "@example.test"); request.setPassword("OtherPassword123!"); auth.register(request);
        LoginRequest login = new LoginRequest(); login.setEmail(request.getEmail()); login.setPassword(request.getPassword());
        return auth.login(login).getAccessToken();
    }
    private String legacyJwt() {
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(owner.toString()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build())).getTokenValue();
    }
    private Map<String, Object> financialSnapshot() {
        Map<String, Object> rows = new LinkedHashMap<>();
        for (String table : List.of("categories", "transactions", "monthly_budgets", "category_budgets", "recurring_templates"))
            rows.put(table, jdbc.queryForList("SELECT * FROM " + table + " WHERE user_id=? ORDER BY id", owner));
        return rows;
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TestClockConfig {
        @Bean @Primary MutableClock passwordResetTestClock() { return new MutableClock(); }
    }
    static class MutableClock extends Clock {
        final AtomicReference<Instant> now = new AtomicReference<>(NOW);
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now.get(); }
    }
}
