package com.smartexpense.backend;

import com.smartexpense.backend.config.SecurityConfig;
import com.smartexpense.backend.controller.AuthController;
import com.smartexpense.backend.dto.auth.*;
import com.smartexpense.backend.exception.PasswordResetException;
import com.smartexpense.backend.repository.UserRepository;
import com.smartexpense.backend.security.*;
import com.smartexpense.backend.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.*;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import java.security.SecureRandom;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({SecurityConfig.class, JwtConfig.class, ApiSecurityExceptionHandler.class})
@ExtendWith(OutputCaptureExtension.class)
class PasswordResetApiTests {
    private static final String KEY = randomKey();
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @MockitoBean AuthService auth;
    @MockitoBean PasswordResetService reset;
    @MockitoBean UserRepository users;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) { registry.add("app.jwt.secret", () -> KEY); }

    @Test
    void forgotEmailExistingAndUnknownHaveIdenticalPublicResponse() throws Exception {
        String first = forgot("private@example.test"); String second = forgot("unknown@example.test");
        assertThat(first).isEqualTo(second);
        assertThat(json.readTree(first).size()).isEqualTo(1);
        assertThat(json.readTree(first).get("message").asText()).isEqualTo(AuthMessageResponse.FORGOT.message());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "bad-email", "user@", "<user@example.test>"})
    void invalidEmailReturnsSafeValidationError(String email, CapturedOutput output) throws Exception {
        mvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        verifyNoInteractions(reset);
        if (!email.isEmpty()) assertThat(output.getAll()).doesNotContain("rejected value [" + email + "]");
    }

    @Test
    void resetIsPublicAndDoesNotReturnJwtOrAccount() throws Exception {
        String response = mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("token", "a".repeat(43), "newPassword", "NewPassword123!"))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(response).size()).isEqualTo(1);
        assertThat(json.readTree(response).get("message").asText()).isEqualTo(AuthMessageResponse.RESET.message());
        verify(reset).resetPassword("a".repeat(43), "NewPassword123!", "127.0.0.1");
    }

    @Test
    void invalidTokenUsesExactContractAndDoesNotLeakRequest(CapturedOutput output) throws Exception {
        doThrow(PasswordResetException.invalidToken()).when(reset).resetPassword(any(), any(), any());
        String body = mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"PRIVATE_RESET_TOKEN\",\"newPassword\":\"PRIVATE_PASSWORD\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("INVALID_RESET_TOKEN"))
                .andExpect(jsonPath("$.message").value("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."))
                .andReturn().getResponse().getContentAsString();
        assertThat(body + output.getAll()).doesNotContain("PRIVATE_RESET_TOKEN", "PRIVATE_PASSWORD");
    }

    @ParameterizedTest
    @ValueSource(strings = {"short", "", "                                                                        a", "ệệệệệệệệệệệệệệệệệệệệệệệệệ"})
    void passwordPolicyRejectsShortBlankAndOver72Utf8Bytes(String password, CapturedOutput output) throws Exception {
        mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("token", "a".repeat(43), "newPassword", password))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.newPassword").isString());
        verifyNoInteractions(reset);
        if (!password.isEmpty()) assertThat(output.getAll()).doesNotContain("rejected value [" + password + "]");
    }

    @Test
    void exact72Utf8BytesAreAccepted() throws Exception {
        mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("token", "a".repeat(43), "newPassword", "ệ".repeat(24)))))
                .andExpect(status().isOk());
    }

    @Test
    void forwardedIpCannotReplaceSocketAddress() throws Exception {
        mvc.perform(post("/api/auth/forgot-password").header("X-Forwarded-For", "203.0.113.1")
                        .header("Origin", "https://attacker.example").header("Host", "attacker.example")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"private@example.test\"}"))
                .andExpect(status().isForbidden()); // Origin ngoài allowlist bị CORS chặn.
        mvc.perform(post("/api/auth/forgot-password").header("X-Forwarded-For", "203.0.113.1")
                        .header("Host", "attacker.example").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"private@example.test\"}"))
                .andExpect(status().isOk());
        verify(reset).requestReset("private@example.test", "127.0.0.1");
    }

    @Test
    void rateLimitUsesApiErrorAndRetryAfter() throws Exception {
        doThrow(PasswordResetException.rateLimited()).when(reset).requestReset(any(), any());
        mvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"private@example.test\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "900"))
                .andExpect(jsonPath("$.status").value(429)).andExpect(jsonPath("$.code").value("AUTH_RATE_LIMITED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/auth/other", "/api/auth/logout", "/api/users/me", "/api/transactions", "/api/ai/chat", "/api/reports/monthly", "/api/transactions/export", "/api/budgets/2026/11", "/api/recurring-templates"})
    void otherPathsStayProtected(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void getMethodOnResetPathIsNotPublic() throws Exception {
        mvc.perform(get("/api/auth/reset-password")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/forgot-password")).andExpect(status().isUnauthorized());
    }

    @Test
    void sensitiveDtoToStringExcludesEmailPasswordAndToken() {
        ForgotPasswordRequest forgot = new ForgotPasswordRequest(); forgot.setEmail("private@example.test");
        ResetPasswordRequest resetDto = new ResetPasswordRequest(); resetDto.setToken("private-token"); resetDto.setNewPassword("private-password");
        LoginRequest login = new LoginRequest(); login.setEmail("private@example.test"); login.setPassword("private-password");
        RegisterRequest register = new RegisterRequest(); register.setEmail("private@example.test"); register.setPassword("private-password");
        AuthResponse authDto = new AuthResponse("private-token", "Bearer", new UserResponse(1L, "Test", "private@example.test"));
        assertThat(forgot + " " + resetDto + " " + login + " " + register + " " + authDto)
                .doesNotContain("private@example.test", "private-token", "private-password");
    }

    private String forgot(String email) throws Exception {
        return mvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();
    }

    private static String randomKey() {
        byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }
}
