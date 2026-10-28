package com.smartexpense.backend;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.smartexpense.backend.dto.auth.AuthResponse;
import com.smartexpense.backend.dto.auth.LoginRequest;
import com.smartexpense.backend.dto.auth.RegisterRequest;
import com.smartexpense.backend.dto.dashboard.CategoryExpenseResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.MonthlyBudget;
import com.smartexpense.backend.entity.Transaction;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.MonthlyBudgetRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.ApplicationContext;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.spec.SecretKeySpec;
import javax.sql.DataSource;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Kiểm thử controller/service, BCrypt và JWT thật; mock repository và tắt kết nối database.
@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
        "spring.datasource.url=jdbc:disabled:d02-tests",
        "spring.jpa.hibernate.ddl-auto=none"
})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class BackendApplicationTests {

    private static final byte[] TEST_KEY = randomKey();
    private static final String PRIVATE_DETAIL = "D02_PRIVATE_EXCEPTION_DETAIL";

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired JwtDecoder decoder;
    @Autowired PasswordEncoder passwords;
    @Autowired ApplicationContext context;
    @MockitoBean UserRepository users;
    @MockitoBean CategoryRepository categories;
    @MockitoBean TransactionRepository transactions;
    @MockitoBean MonthlyBudgetRepository budgets;

    private String password;
    private User userA;
    private User userB;
    private Category categoryA;
    private Category categoryB;
    private Transaction transactionA;
    private Transaction transactionB;
    private MonthlyBudget budgetA;

    @DynamicPropertySource
    static void testProperties(DynamicPropertyRegistry registry) {
        // Khóa sinh riêng cho bộ test, không sử dụng JWT secret của môi trường thật.
        registry.add("app.jwt.secret", () -> Base64.getEncoder().encodeToString(TEST_KEY));
    }

    @BeforeEach
    void fixtures() {
        // Tạo dữ liệu riêng cho A/B để phát hiện truy cập chéo chủ sở hữu.
        password = UUID.randomUUID().toString();
        userA = user(1L, "a@example.test", passwords.encode(password));
        userB = user(2L, "b@example.test", userA.getPasswordHash());
        when(users.findById(1L)).thenReturn(Optional.of(userA));
        when(users.findById(2L)).thenReturn(Optional.of(userB));
        when(users.findByEmail("a@example.test")).thenReturn(Optional.of(userA));
        when(users.save(any(User.class))).thenAnswer(call -> {
            User user = call.getArgument(0);
            user.setId(3L);
            return user;
        });
        categoryA = category(101L, userA);
        categoryB = category(202L, userB);
        when(categories.findByIdAndUserId(101L, 1L)).thenReturn(Optional.of(categoryA));
        when(categories.findByIdAndUserId(202L, 2L)).thenReturn(Optional.of(categoryB));
        when(categories.findByUserId(2L)).thenReturn(List.of(categoryB));
        when(categories.save(any(Category.class))).thenAnswer(call -> {
            Category category = call.getArgument(0);
            if (category.getId() == null) category.setId(303L);
            return category;
        });
        transactionA = transaction(501L, userA, categoryA);
        transactionB = transaction(502L, userB, categoryB);
        when(transactions.findByIdAndUserId(501L, 1L)).thenReturn(Optional.of(transactionA));
        when(transactions.findByIdAndUserId(502L, 2L)).thenReturn(Optional.of(transactionB));
        when(transactions.save(any(Transaction.class))).thenAnswer(call -> {
            Transaction transaction = call.getArgument(0);
            if (transaction.getId() == null) transaction.setId(503L);
            return transaction;
        });
        budgetA = new MonthlyBudget();
        budgetA.setId(31L);
        budgetA.setUser(userA);
        budgetA.setYear(2026);
        budgetA.setMonth(10);
        budgetA.setAmountLimit(new BigDecimal("1000.00"));
        when(budgets.findByUserIdAndYearAndMonth(1L, 2026, 10)).thenReturn(Optional.of(budgetA));
        when(budgets.save(any(MonthlyBudget.class))).thenAnswer(call -> {
            MonthlyBudget budget = call.getArgument(0);
            if (budget.getId() == null) budget.setId(32L);
            return budget;
        });
    }

    @Test
    void testContextHasNoDataSource() {
        // Bảo đảm cấu hình test không vô tình mở kết nối tới database bên ngoài.
        assertThat(context.getBeansOfType(DataSource.class)).isEmpty();
    }

    @Test
    void dtoStringRepresentationsNeverExposePasswordsOrTokens() {
        // Log có thể gọi toString() của DTO nên không được chứa thông tin đăng nhập.
        LoginRequest login = new LoginRequest();
        login.setPassword(password);
        RegisterRequest registration = new RegisterRequest();
        registration.setPassword(password);
        AuthResponse auth = new AuthResponse(password, "Bearer", null);

        assertThat(login.toString()).doesNotContain(password, "password=");
        assertThat(registration.toString()).doesNotContain(password, "password=");
        assertThat(auth.toString()).doesNotContain(password, "accessToken=");
    }

    @Test
    void publicRegistrationHashesPasswordAndKeepsSuccessResponse() throws Exception {
        // Giữ luồng đăng ký công khai: lưu mật khẩu đã băm, trả User và không tự cấp JWT.
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Test User", "email",
                                "new@example.test", "password", password))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(3))
                .andExpect(jsonPath("$.email").value("new@example.test"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.accessToken").doesNotExist());
        verify(users).save(argThat(user -> passwords.matches(password, user.getPasswordHash())
                && !password.equals(user.getPasswordHash())));
    }

    @Test
    void publicLoginReturnsVerifiableTokenAndNoSession() throws Exception {
        // Kiểm tra token trả về dùng được và đăng nhập không tạo session/cookie ở server.
        var result = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("A@example.test", password)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.user.id").value(1))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist()).andReturn();
        Map<?, ?> body = json.readValue(result.getResponse().getContentAsString(), Map.class);
        Jwt jwt = decoder.decode((String) body.get("accessToken"));
        assertThat(jwt.getSubject()).isEqualTo("1");
        assertThat(jwt.getExpiresAt()).isAfter(Instant.now());
        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(result.getResponse().getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void rejectsWrongPasswordOrUnknownEmail(boolean wrongPassword) throws Exception {
        // Cả hai trường hợp đều trả 401 để không phân biệt tài khoản có tồn tại hay không.
        expectError(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(loginBody(wrongPassword ? "a@example.test" : "unknown@example.test",
                        wrongPassword ? UUID.randomUUID().toString() : password))), 401, "UNAUTHORIZED");
    }

    @Test
    void duplicateEmailReturns409() throws Exception {
        when(users.existsByEmail("a@example.test")).thenReturn(true);
        expectError(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("fullName", "Test", "email", "a@example.test",
                        "password", password)))), 409, "CONFLICT");
        verify(users, never()).save(any());
    }

    @Test
    void databaseConflictAfterPrecheckReturns409WithoutSqlDetails() throws Exception {
        // Mô phỏng request đồng thời: email trùng ở bước lưu vẫn trả 409, không lộ lỗi SQL.
        when(users.save(any())).thenThrow(new DataIntegrityViolationException(PRIVATE_DETAIL));
        expectError(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("fullName", "Test", "email", "new@example.test",
                        "password", password)))), 409, "CONFLICT");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/users/me", "/api/categories", "/api/categories/101",
            "/api/transactions", "/api/transactions/501", "/api/budgets/2026/10",
            "/api/dashboard/summary?month=2026-10", "/api/dashboard/expenses-by-category?month=2026-10"})
    void missingTokenReturns401BeforeReadingData(String path) throws Exception {
        // Chặn ở bộ lọc xác thực trước khi controller/service có thể đọc dữ liệu.
        expectError(mvc.perform(get(path)), 401, "UNAUTHORIZED")
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"));
        verifyNoInteractions(users, categories, transactions, budgets);
    }

    @Test
    void missingTokenCannotWriteEvenWithMalformedBody() throws Exception {
        // Thiếu xác thực phải trả 401 trước cả bước đọc và kiểm tra JSON của request.
        expectError(mvc.perform(post("/api/transactions").contentType(MediaType.APPLICATION_JSON)
                .content("{")), 401, "UNAUTHORIZED");
        verifyNoInteractions(users, categories, transactions, budgets);
    }

    @ParameterizedTest
    @ValueSource(strings = {"expired", "signature", "malformed", "missing-exp", "missing-sub",
            "invalid-sub", "negative-sub", "zero-sub", "overflow-sub", "future-nbf"})
    void invalidTokensReturn401BeforeController(String kind) throws Exception {
        // Bao phủ token sai chữ ký, sai thời gian và claim không phù hợp với ID người dùng.
        String subject = switch (kind) {
            case "missing-sub" -> null;
            case "invalid-sub" -> "not-a-user-id";
            case "negative-sub" -> "-1";
            case "zero-sub" -> "0";
            case "overflow-sub" -> "9223372036854775808";
            default -> "1";
        };
        var claims = JwtClaimsSet.builder().issuedAt(Instant.now().minusSeconds(600));
        if (subject != null) claims.subject(subject);
        if (!kind.equals("missing-exp")) {
            // Cho token hết hạn vượt khoảng dung sai đồng hồ mặc định của Spring.
            claims.expiresAt(Instant.now().plusSeconds(kind.equals("expired") ? -120 : 600));
        }
        if (kind.equals("future-nbf")) claims.notBefore(Instant.now().plusSeconds(300));
        JwtEncoder signer = kind.equals("signature")
                ? new NimbusJwtEncoder(new ImmutableSecret<>(new SecretKeySpec(randomKey(), "HmacSHA256")))
                : encoder;
        String token = kind.equals("malformed") ? "not-a-jwt" : signed(signer, claims.build());
        expectError(mvc.perform(get("/api/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)),
                401, "UNAUTHORIZED").andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"));
        verifyNoInteractions(users, categories, transactions, budgets);
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void beanValidationReturnsFieldErrorsWithoutRejectedPassword(CapturedOutput output) throws Exception {
        // Phản hồi 400 và log chỉ được chứa thông báo lỗi, không chứa mật khẩu bị từ chối.
        expectError(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "", "email", "invalid",
                                "password", "short")))), 400, "VALIDATION_ERROR")
                .andExpect(jsonPath("$.errors.email").isString())
                .andExpect(jsonPath("$.errors.password").isString())
                .andExpect(content().string(not(containsString("short"))));
        verify(users, never()).save(any());
        assertThat(output.getAll()).doesNotContain("rejected value [short]", "password=short");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{", "{\"email\":", "{\"email\":\"x\",\"password\":{}}"})
    void malformedJsonReturns400(String body) throws Exception {
        expectError(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(body)), 400, "VALIDATION_ERROR");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/transactions?page=oops", "/api/transactions?type=INVALID",
            "/api/transactions?startDate=bad-date", "/api/dashboard/summary",
            "/api/budgets/not-a-year/10", "/api/transactions?page=-1", "/api/transactions?size=101"})
    void invalidQueryOrMissingParameterReturns400(String path) throws Exception {
        expectError(performAs(get(path), 1), 400, "VALIDATION_ERROR");
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void userBCannotReadUpdateOrDeleteCategoryA(String method) throws Exception {
        // Trả 404 cho cả đọc/sửa/xóa để không tiết lộ danh mục riêng tư của A.
        var request = request(HttpMethod.valueOf(method), "/api/categories/101?userId=1");
        if (method.equals("PUT")) request.contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Changed\",\"type\":\"EXPENSE\"}");
        expectError(performAs(request, 2), 404, "RESOURCE_NOT_FOUND");
        verify(categories).findByIdAndUserId(101L, 2L);
        verify(categories, never()).save(any());
        verify(categories, never()).delete(any());
        assertThat(categoryA.getName()).isEqualTo("Category 101");
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void userBCannotReadUpdateOrDeleteTransactionA(String method) throws Exception {
        // Khi sửa, dùng danh mục hợp lệ của B để kiểm tra riêng quyền sở hữu giao dịch.
        var request = request(HttpMethod.valueOf(method), "/api/transactions/501?userId=1");
        if (method.equals("PUT")) request.contentType(MediaType.APPLICATION_JSON).content(transactionBody(202));
        expectError(performAs(request, 2), 404, "RESOURCE_NOT_FOUND");
        verify(transactions).findByIdAndUserId(501L, 2L);
        verify(transactions, never()).save(any());
        verify(transactions, never()).delete(any());
        assertThat(transactionA.getAmount()).isEqualByComparingTo("100.00");
    }

    @Test
    void userBCannotUseCategoryAForNewTransaction() throws Exception {
        // Giữ ngoại lệ 400 của contract khi category trong request sai chủ sở hữu.
        expectError(performAs(post("/api/transactions").contentType(MediaType.APPLICATION_JSON)
                .content(transactionBody(101)), 2), 400, "VALIDATION_ERROR");
        verify(categories).findByIdAndUserId(101L, 2L);
        verify(transactions, never()).save(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "DELETE"})
    void userBCannotReadOrDeleteBudgetAThroughClientUserId(String method) throws Exception {
        // Cùng năm/tháng vẫn phải lọc theo JWT; userId trên query không được đổi chủ sở hữu.
        expectError(performAs(request(HttpMethod.valueOf(method), "/api/budgets/2026/10?userId=1"), 2),
                404, "RESOURCE_NOT_FOUND");
        verify(budgets).findByUserIdAndYearAndMonth(2L, 2026, 10);
        verify(budgets, never()).delete(any());
    }

    @Test
    void budgetUpsertForBDoesNotChangeBudgetA() throws Exception {
        // Upsert ở cùng kỳ phải tạo ngân sách cho B, không ghi đè ngân sách của A.
        performAs(put("/api/budgets/2026/10?userId=1").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountLimit\":2500}"), 2)
                .andExpect(status().isOk()).andExpect(jsonPath("$.amountLimit").value(2500))
                .andExpect(jsonPath("$.spentAmount").value(0))
                .andExpect(jsonPath("$.remainingAmount").value(2500));
        verify(budgets).save(argThat(budget -> budget.getUser().getId() == 2L));
        assertThat(budgetA.getAmountLimit()).isEqualByComparingTo("1000.00");
    }

    @Test
    void profileAndCategoryListIgnoreClientUserId() throws Exception {
        // Tham số userId giả mạo không được thay thế danh tính đã xác thực từ JWT.
        var result = performAs(get("/api/users/me?userId=1"), 2)
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(2)).andReturn();
        assertThat(result.getRequest().getSession(false)).isNull();
        performAs(get("/api/categories?userId=1"), 2).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(202));
        verify(users).findById(2L);
        verify(categories).findByUserId(2L);
    }

    @Test
    void transactionListUsesJwtOwner() throws Exception {
        when(transactions.searchTransactions(eq(2L), isNull(), isNull(), isNull(), isNull(),
                isNull(), any())).thenReturn(new PageImpl<>(List.of(transactionB)));
        performAs(get("/api/transactions?userId=1"), 2).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(502))
                .andExpect(jsonPath("$.totalElements").value(1));
        verify(transactions).searchTransactions(eq(2L), isNull(), isNull(), isNull(), isNull(),
                isNull(), any());
    }

    @Test
    void dashboardOnlyAggregatesJwtOwner() throws Exception {
        // Cả tổng thu/chi và biểu đồ danh mục đều phải truy vấn theo người dùng trong JWT.
        when(transactions.sumAmountByUserAndTypeAndDateRange(eq(2L), eq(TransactionType.INCOME),
                any(), any())).thenReturn(new BigDecimal("3000.00"));
        when(transactions.sumAmountByUserAndTypeAndDateRange(eq(2L), eq(TransactionType.EXPENSE),
                any(), any())).thenReturn(new BigDecimal("100.00"));
        when(transactions.sumExpensesByCategory(eq(2L), eq(TransactionType.EXPENSE), any(), any()))
                .thenReturn(List.of(new CategoryExpenseResponse(202L, "Category 202", new BigDecimal("100"))));
        performAs(get("/api/dashboard/summary?month=2026-10&userId=1"), 2).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalIncome").value(3000)).andExpect(jsonPath("$.totalExpense").value(100))
                .andExpect(jsonPath("$.balance").value(2900));
        performAs(get("/api/dashboard/expenses-by-category?month=2026-10&userId=1"), 2)
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].categoryId").value(202))
                .andExpect(jsonPath("$[0].totalAmount").value(100));
        verify(transactions, never()).sumAmountByUserAndTypeAndDateRange(eq(1L), any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"DELETE", "PUT"})
    void categoryInUseReturns409(String method) throws Exception {
        when(transactions.existsByCategoryId(101L)).thenReturn(true);
        var request = request(HttpMethod.valueOf(method), "/api/categories/101");
        if (method.equals("PUT")) request.contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Changed\",\"type\":\"INCOME\"}");
        expectError(performAs(request, 1), 409, "CONFLICT");
        verify(categories, never()).save(any());
        verify(categories, never()).delete(any());
    }

    @Test
    void ownedCrudKeepsExistingSuccessStatusesAndFields() throws Exception {
        // Kiểm tra chuẩn hóa lỗi không làm thay đổi status và DTO của luồng CRUD thành công.
        performAs(post("/api/categories").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"New category\",\"type\":\"EXPENSE\"}"), 1)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("New category"));
        performAs(put("/api/categories/101").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Updated\",\"type\":\"EXPENSE\"}"), 1)
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(101));
        performAs(post("/api/transactions").contentType(MediaType.APPLICATION_JSON)
                        .content(transactionBody(101)), 1)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.categoryName").value("Updated"));
        performAs(put("/api/transactions/501").contentType(MediaType.APPLICATION_JSON)
                        .content(transactionBody(101)), 1)
                .andExpect(status().isOk()).andExpect(jsonPath("$.amount").value(123));
        performAs(delete("/api/transactions/501"), 1).andExpect(status().isNoContent());
        performAs(delete("/api/categories/101"), 1).andExpect(status().isNoContent());
        performAs(get("/api/budgets/2026/10"), 1).andExpect(status().isOk())
                .andExpect(jsonPath("$.amountLimit").value(1000)).andExpect(jsonPath("$.exceeded").value(false));
        performAs(delete("/api/budgets/2026/10"), 1).andExpect(status().isNoContent());
    }

    @Test
    void missingResourceReturns404() throws Exception {
        expectError(performAs(get("/api/not-an-endpoint"), 1), 404, "RESOURCE_NOT_FOUND");
    }

    @Test
    void unsupportedMethodPreserves405AndAllowHeader() throws Exception {
        // Khi chuẩn hóa body lỗi vẫn phải giữ header mô tả phương thức được hỗ trợ.
        expectError(performAs(post("/api/users/me"), 1), 405, "METHOD_NOT_ALLOWED")
                .andExpect(header().string(HttpHeaders.ALLOW, containsString("GET")));
    }

    @Test
    void unsupportedContentTypePreserves415() throws Exception {
        expectError(mvc.perform(post("/api/auth/register").contentType(MediaType.TEXT_PLAIN)
                .content("not-json")), 415, "UNSUPPORTED_MEDIA_TYPE");
    }

    @Test
    void mvcAccessDeniedReturns403Not500() throws Exception {
        // Lỗi phân quyền trong service cũng cần được phân loại đúng như ở Security filter.
        when(users.findById(1L)).thenThrow(new AccessDeniedException(PRIVATE_DETAIL));
        expectError(performAs(get("/api/users/me"), 1), 403, "FORBIDDEN");
    }

    @Test
    void mvcAuthenticationFailureReturns401Not500() throws Exception {
        when(users.findById(1L)).thenThrow(new BadCredentialsException(PRIVATE_DETAIL));
        expectError(performAs(get("/api/users/me"), 1), 401, "UNAUTHORIZED");
    }

    @Test
    void unexpectedServerErrorDoesNotExposeDetails() throws Exception {
        when(users.findById(1L)).thenThrow(new IllegalStateException(PRIVATE_DETAIL));
        expectError(performAs(get("/api/users/me"), 1), 500, "INTERNAL_ERROR");
    }

    @Test
    void explicitServerErrorDoesNotExposeReason() throws Exception {
        // Reason do ứng dụng gán cho lỗi 500 cũng phải được che như ngoại lệ ngoài dự kiến.
        when(users.findById(1L)).thenThrow(new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                PRIVATE_DETAIL));
        expectError(performAs(get("/api/users/me"), 1), 500, "INTERNAL_ERROR");
    }

    private ResultActions performAs(MockHttpServletRequestBuilder request, long userId) throws Exception {
        // Gửi JWT đã ký qua bộ lọc thật, không bỏ qua cơ chế xác thực khi kiểm thử ownership.
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(userId)));
    }

    private String tokenFor(long userId) {
        return signed(encoder, JwtClaimsSet.builder().subject(Long.toString(userId))
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build());
    }

    private static String signed(JwtEncoder signer, JwtClaimsSet claims) {
        return signer.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }

    private ResultActions expectError(ResultActions result, int status, String code) throws Exception {
        // Dùng chung kiểm tra cấu trúc lỗi và bảo đảm không trả chi tiết nhạy cảm.
        return result.andExpect(status().is(status)).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(status)).andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.message").isNotEmpty()).andExpect(jsonPath("$.exception").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist()).andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(content().string(not(containsString(PRIVATE_DETAIL))));
    }

    private String loginBody(String email, String password) {
        return json.writeValueAsString(Map.of("email", email, "password", password));
    }

    private String transactionBody(long categoryId) {
        return json.writeValueAsString(Map.of("categoryId", categoryId, "type", "EXPENSE", "amount", 123,
                "transactionDate", "2026-10-29", "note", "D02 synthetic test"));
    }

    private static byte[] randomKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return bytes;
    }

    private static User user(long id, String email, String hash) {
        User user = new User();
        user.setId(id);
        user.setFullName("Test User " + id);
        user.setEmail(email);
        user.setPasswordHash(hash);
        return user;
    }

    private static Category category(long id, User user) {
        Category category = new Category();
        category.setId(id);
        category.setUser(user);
        category.setName("Category " + id);
        category.setType(TransactionType.EXPENSE);
        return category;
    }

    private static Transaction transaction(long id, User user, Category category) {
        Transaction transaction = new Transaction();
        transaction.setId(id);
        transaction.setUser(user);
        transaction.setCategory(category);
        transaction.setType(TransactionType.EXPENSE);
        transaction.setAmount(new BigDecimal("100.00"));
        transaction.setTransactionDate(LocalDate.of(2026, 10, 29));
        return transaction;
    }
}
