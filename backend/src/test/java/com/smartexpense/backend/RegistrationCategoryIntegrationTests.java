package com.smartexpense.backend;

import com.smartexpense.backend.dto.auth.AuthResponse;
import com.smartexpense.backend.dto.auth.UserResponse;
import com.smartexpense.backend.dto.category.CategoryResponse;
import com.smartexpense.backend.dto.transaction.TransactionResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.MonthlyBudgetRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import com.smartexpense.backend.service.CategoryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doCallRealMethod;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Không bọc test trong transaction để quan sát commit/rollback thực của API đăng ký.
@SpringBootTest(classes = BackendApplication.class,
        properties = "spring.config.location=classpath:/application-d03-test.properties")
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers(disabledWithoutDocker = true)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class RegistrationCategoryIntegrationTests extends MySqlIntegrationTestSupport {

    private static final List<String> EXPENSE_NAMES = List.of(
            "Ăn uống", "Chi tiêu hằng ngày", "Quần áo", "Mỹ phẩm", "Phí giao lưu", "Y tế",
            "Giáo dục", "Tiền điện", "Đi lại", "Phí liên lạc", "Tiền nhà");
    private static final List<String> INCOME_NAMES = List.of(
            "Tiền lương", "Tiền phụ cấp", "Tiền thưởng", "Thu nhập phụ", "Đầu tư", "Thu nhập tạm thời");

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired MonthlyBudgetRepository budgets;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired PlatformTransactionManager transactionManager;
    @MockitoSpyBean CategoryService categoryService;

    private String password;

    @BeforeEach
    void prepare() throws Exception {
        verifyMySqlConnection();
        assertThat(users.count()).isZero();
        assertThat(categories.count()).isZero();
        assertThat(transactions.count()).isZero();
        password = UUID.randomUUID().toString();
    }

    @AfterEach
    void cleanup() throws Exception {
        // Chỉ dọn schema container đã xác nhận; xóa theo thứ tự khóa ngoại sau mỗi test.
        verifyMySqlConnection();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            transactions.deleteAllInBatch();
            budgets.deleteAllInBatch();
            categories.deleteAllInBatch();
            users.deleteAllInBatch();
        });
        assertThat(users.count()).isZero();
        assertThat(categories.count()).isZero();
        assertThat(transactions.count()).isZero();
    }

    @Test
    void registrationCreatesSeventeenPrivateCategoriesForEachUserAndFiltersByType() throws Exception {
        UserResponse a = register(email("a"));
        UserResponse b = register(email("b"));
        assertCatalog(a.getId());
        assertCatalog(b.getId());
        assertThat(categories.count()).isEqualTo(34);
        assertThat(categories.findByUserId(a.getId())).extracting(Category::getId)
                .doesNotContainAnyElementsOf(categories.findByUserId(b.getId()).stream().map(Category::getId).toList());
        for (UserResponse owner : List.of(a, b)) {
            String token = login(owner.getEmail());
            assertThat(list(token, null)).hasSize(17);
            assertThat(list(token, "EXPENSE")).extracting(CategoryResponse::getName)
                    .containsExactlyInAnyOrderElementsOf(EXPENSE_NAMES);
            assertThat(list(token, "INCOME")).extracting(CategoryResponse::getName)
                    .containsExactlyInAnyOrderElementsOf(INCOME_NAMES);
            assertThat(list(token, "EXPENSE")).allSatisfy(category ->
                    assertThat(category.getType()).isEqualTo(TransactionType.EXPENSE));
            assertThat(list(token, "INCOME")).allSatisfy(category ->
                    assertThat(category.getType()).isEqualTo(TransactionType.INCOME));
        }
    }

    // ID danh mục của B không thể dùng để đọc/sửa/xóa bằng JWT của A.
    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void userACannotAccessCategoriesOfB(String method) throws Exception {
        UserResponse a = register(email("a"));
        UserResponse b = register(email("b"));
        Category original = categories.findByUserId(b.getId()).getFirst();
        var request = request(HttpMethod.valueOf(method), "/api/categories/" + original.getId())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + login(a.getEmail()));
        if (method.equals("PUT")) request.contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", "Không được sửa", "type", original.getType())));
        expectError(mvc.perform(request), 404, "RESOURCE_NOT_FOUND");
        Category unchanged = categories.findByIdAndUserId(original.getId(), b.getId()).orElseThrow();
        assertThat(unchanged.getName()).isEqualTo(original.getName());
        assertThat(unchanged.getType()).isEqualTo(original.getType());
        assertCatalog(a.getId());
        assertCatalog(b.getId());
    }

    @Test
    void repeatedLoginDoesNotCreateMoreCategories() throws Exception {
        UserResponse owner = register(email("a"));
        List<Long> ids = categories.findByUserId(owner.getId()).stream().map(Category::getId).toList();
        for (int attempt = 0; attempt < 3; attempt++) login(owner.getEmail());
        assertThat(categories.findByUserId(owner.getId())).extracting(Category::getId)
                .containsExactlyInAnyOrderElementsOf(ids);
        assertCatalog(owner.getId());
    }

    @Test
    void invalidRegistrationCreatesNeitherUserNorCategories() throws Exception {
        expectError(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("fullName", "", "email", "invalid", "password", "short")))),
                400, "VALIDATION_ERROR");
        assertThat(users.count()).isZero();
        assertThat(categories.count()).isZero();
    }

    @Test
    void duplicateRegistrationDoesNotDuplicateCategories() throws Exception {
        UserResponse owner = register(email("a"));
        expectError(registration(owner.getEmail().toUpperCase(Locale.ROOT)), 409, "CONFLICT");
        assertThat(users.count()).isEqualTo(1);
        assertThat(categories.count()).isEqualTo(17);
        assertCatalog(owner.getId());
    }

    @Test
    void failureAfterSavingCategoriesRollsBackUserAndCategoriesAndAllowsRetry() throws Exception {
        // Repository vẫn ghi MySQL thật; chỉ chèn lỗi service sau khi flush để kiểm chứng rollback.
        CategoryService target = AopTestUtils.getUltimateTargetObject(categoryService);
        doAnswer(invocation -> {
            invocation.callRealMethod();
            categories.flush();
            assertThat(users.count()).isEqualTo(1);
            assertThat(categories.count()).isEqualTo(17);
            throw new IllegalStateException("Lỗi giả lập sau khi ghi danh mục test");
        }).when(target).createDefaultCategories(any(User.class));
        String email = email("retry");
        expectError(registration(email), 500, "INTERNAL_ERROR");
        assertThat(users.findByEmail(email)).isEmpty();
        assertThat(users.count()).isZero();
        assertThat(categories.count()).isZero();
        doCallRealMethod().when(target).createDefaultCategories(any(User.class));
        UserResponse owner = register(email);
        assertCatalog(owner.getId());
        assertThat(users.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @EnumSource(TransactionType.class)
    void defaultCategoryCanBeUsedForTransaction(TransactionType type) throws Exception {
        UserResponse owner = register(email("a"));
        Category category = categories.findByUserIdAndType(owner.getId(), type).getFirst();
        Long transactionId = createTransaction(login(owner.getEmail()), category);
        var saved = transactions.findByIdAndUserId(transactionId, owner.getId()).orElseThrow();
        assertThat(saved.getCategory().getId()).isEqualTo(category.getId());
        assertThat(saved.getType()).isEqualTo(type);
        assertThat(saved.getAmount()).isEqualByComparingTo("12345.67");
    }

    @Test
    void categoryCrudStillAllowsEditingDeletingAndCreatingCategories() throws Exception {
        UserResponse owner = register(email("a"));
        String token = login(owner.getEmail());
        Category original = categories.findByUserIdAndType(owner.getId(), TransactionType.EXPENSE).getFirst();
        mvc.perform(put("/api/categories/" + original.getId()).contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .content(json.writeValueAsString(Map.of("name", "Ăn uống đã sửa", "type", "EXPENSE"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Ăn uống đã sửa"));
        mvc.perform(delete("/api/categories/" + original.getId())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).andExpect(status().isNoContent());
        expectError(mvc.perform(get("/api/categories/" + original.getId())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)), 404, "RESOURCE_NOT_FOUND");
        mvc.perform(post("/api/categories").contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .content(json.writeValueAsString(Map.of("name", "Danh mục tự thêm", "type", "INCOME"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Danh mục tự thêm"));
        assertThat(categories.findByUserId(owner.getId())).hasSize(17);
    }

    @Test
    void categoryInUseStillCannotBeDeletedOrChangeType() throws Exception {
        UserResponse owner = register(email("a"));
        String token = login(owner.getEmail());
        Category category = categories.findByUserIdAndType(owner.getId(), TransactionType.EXPENSE).getFirst();
        createTransaction(token, category);
        expectError(mvc.perform(delete("/api/categories/" + category.getId())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)), 409, "CONFLICT");
        expectError(mvc.perform(put("/api/categories/" + category.getId()).contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .content(json.writeValueAsString(Map.of("name", category.getName(), "type", "INCOME")))),
                409, "CONFLICT");
        assertThat(categories.findByIdAndUserId(category.getId(), owner.getId()).orElseThrow().getType())
                .isEqualTo(TransactionType.EXPENSE);
    }

    @Test
    void oldAccountKeepsItsExistingCategoriesWithoutBackfill() throws Exception {
        User oldUser = new User();
        oldUser.setEmail(email("old"));
        oldUser.setFullName("Tài khoản cũ");
        oldUser.setPasswordHash(passwordEncoder.encode(password));
        users.saveAndFlush(oldUser);
        Category custom = new Category();
        custom.setName("Danh mục cũ");
        custom.setType(TransactionType.INCOME);
        custom.setUser(oldUser);
        categories.saveAndFlush(custom);
        assertThat(list(login(oldUser.getEmail()), null)).extracting(CategoryResponse::getName)
                .containsExactly("Danh mục cũ");
        register(email("new"));
        assertThat(categories.findByUserId(oldUser.getId())).extracting(Category::getId)
                .containsExactly(custom.getId());
        assertThat(categories.count()).isEqualTo(18);
    }

    private void assertCatalog(Long ownerId) {
        List<Category> owned = categories.findByUserId(ownerId);
        assertThat(owned).hasSize(17).allSatisfy(category -> assertThat(category.getUser().getId()).isEqualTo(ownerId));
        assertThat(owned).filteredOn(category -> category.getType() == TransactionType.EXPENSE)
                .extracting(Category::getName).containsExactlyInAnyOrderElementsOf(EXPENSE_NAMES);
        assertThat(owned).filteredOn(category -> category.getType() == TransactionType.INCOME)
                .extracting(Category::getName).containsExactlyInAnyOrderElementsOf(INCOME_NAMES);
    }

    private ResultActions registration(String email) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("fullName", "Người dùng test", "email", email, "password", password))));
    }

    private UserResponse register(String email) throws Exception {
        var response = registration(email).andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber()).andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.fullName").value("Người dùng test"))
                .andExpect(jsonPath("$.accessToken").doesNotExist()).andReturn().getResponse();
        String body = response.getContentAsString(StandardCharsets.UTF_8);
        assertThat(json.readTree(body).size()).isEqualTo(3);
        return json.readValue(body, UserResponse.class);
    }

    private String login(String email) throws Exception {
        var response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email, "password", password))))
                .andExpect(status().isOk()).andReturn().getResponse();
        return json.readValue(response.getContentAsString(StandardCharsets.UTF_8), AuthResponse.class).getAccessToken();
    }

    private List<CategoryResponse> list(String token, String type) throws Exception {
        var request = get("/api/categories").header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        if (type != null) request.queryParam("type", type);
        String body = mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return Arrays.asList(json.readValue(body, CategoryResponse[].class));
    }

    private Long createTransaction(String token, Category category) throws Exception {
        String body = json.writeValueAsString(Map.of("categoryId", category.getId(), "type", category.getType(),
                "amount", new BigDecimal("12345.67"), "transactionDate", "2026-10-29", "note", "Test danh mục mặc định"));
        var response = mvc.perform(post("/api/transactions").contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse();
        return json.readValue(response.getContentAsString(StandardCharsets.UTF_8), TransactionResponse.class).getId();
    }

    private void expectError(ResultActions result, int status, String code) throws Exception {
        result.andExpect(status().is(status)).andExpect(jsonPath("$.status").value(status))
                .andExpect(jsonPath("$.code").value(code)).andExpect(jsonPath("$.message").isNotEmpty());
    }

    private String email(String prefix) {
        return prefix + UUID.randomUUID() + "@example.test";
    }
}
