package com.smartexpense.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

// Kiểm tra trực tiếp handler vì lỗi ở bộ lọc Security không đi qua controller advice.
class ApiSecurityExceptionHandlerTests {

    private final ApiSecurityExceptionHandler handler = new ApiSecurityExceptionHandler(JsonMapper.builder().build());

    @Test
    void authenticationEntryPointPreservesBearerChallengeWithoutPrivateDetails() throws Exception {
        // Phản hồi 401 giữ header Bearer nhưng không trả nguyên thông báo ngoại lệ.
        var response = new MockHttpServletResponse();
        handler.commence(new MockHttpServletRequest(), response, new BadCredentialsException("private detail"));
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getHeader(HttpHeaders.WWW_AUTHENTICATE)).isEqualTo("Bearer");
        assertThat(response.getContentAsString()).contains("\"code\":\"UNAUTHORIZED\"")
                .doesNotContain("private detail");
    }

    @Test
    void securityAccessDeniedHandlerReturnsJson403WithoutPrivateDetails() throws Exception {
        // Phản hồi 403 dùng JSON chung và không tiết lộ chi tiết lỗi phân quyền.
        var response = new MockHttpServletResponse();
        handler.handle(new MockHttpServletRequest(), response, new AccessDeniedException("private detail"));
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString()).contains("\"code\":\"FORBIDDEN\"")
                .doesNotContain("private detail");
    }
}
