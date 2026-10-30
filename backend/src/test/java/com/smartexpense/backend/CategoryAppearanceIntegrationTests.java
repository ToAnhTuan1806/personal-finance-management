package com.smartexpense.backend;

import com.smartexpense.backend.dto.auth.UserResponse;
import com.smartexpense.backend.dto.category.CategoryResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.service.CategoryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.Arguments;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doCallRealMethod;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Không bọc cả test trong transaction: quan sát commit/rollback thật của API và dọn schema test sau mỗi lần.
@SpringBootTest(classes = BackendApplication.class,
        properties = "spring.config.location=classpath:/application-d03-test.properties")
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class CategoryAppearanceIntegrationTests extends MySqlIntegrationTestSupport {

    private static final String EXPECTED_CATALOG = """
            EXPENSE|Ăn uống|utensils|#F59E0B
            EXPENSE|Chi tiêu hằng ngày|shopping-bag|#3B82F6
            EXPENSE|Quần áo|shirt|#8B5CF6
            EXPENSE|Mỹ phẩm|sparkles|#EC4899
            EXPENSE|Phí giao lưu|users|#F97316
            EXPENSE|Y tế|heart|#EF4444
            EXPENSE|Giáo dục|graduation-cap|#6366F1
            EXPENSE|Tiền điện|zap|#EAB308
            EXPENSE|Đi lại|car|#06B6D4
            EXPENSE|Phí liên lạc|phone|#14B8A6
            EXPENSE|Tiền nhà|home|#A855F7
            INCOME|Tiền lương|wallet|#22C55E
            INCOME|Tiền phụ cấp|hand-coins|#10B981
            INCOME|Tiền thưởng|gift|#84CC16
            INCOME|Thu nhập phụ|briefcase|#0EA5E9
            INCOME|Đầu tư|trending-up|#059669
            INCOME|Thu nhập tạm thời|clock|#64748B
            """;

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder jwtEncoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired MonthlyBudgetRepository budgets;
    @Autowired PlatformTransactionManager transactionManager;
    @MockitoSpyBean CategoryService categoryService;

    @BeforeEach
    void verifyEmptyDatabase() throws Exception {
        verifyMySqlConnection();
        assertThat(users.count()).isZero();
        assertThat(categories.count()).isZero();
        assertThat(transactions.count()).isZero();
    }

    @AfterEach
    void cleanup() throws Exception {
        verifyMySqlConnection();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            transactions.deleteAllInBatch();
            budgets.deleteAllInBatch();
            categories.deleteAllInBatch();
            users.deleteAllInBatch();
        });
    }

    @Test
    void newRegistrationsGetExactPrivateCatalogAndRenamingPreservesAppearance() throws Exception {
        String password = UUID.randomUUID().toString();
        UserResponse a = register(password);
        UserResponse b = register(password);
        assertCatalog(a.getId());
        assertCatalog(b.getId());
        assertThat(categories.count()).isEqualTo(34);
        String token = json.readTree(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", a.getEmail(), "password", password))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .get("accessToken").asString();
        mvc.perform(get("/api/categories").param("type", "EXPENSE")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(11))
                .andExpect(jsonPath("$[0].icon").isNotEmpty()).andExpect(jsonPath("$[0].color").isNotEmpty());
        Category first = categories.findByUserId(a.getId()).getFirst();
        mvc.perform(put("/api/categories/" + first.getId()).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                                Map.of("name", "Tên người dùng tự đổi", "type", first.getType()))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.icon").value(first.getIcon()))
                .andExpect(jsonPath("$.color").value(first.getColor()));
        assertCatalog(b.getId());
        assertThat(categories.count()).isEqualTo(34);
    }

    @Test
    void createsReadsFiltersAndDeletesCategoryWithMetadataAndJwtOwner() throws Exception {
        User a = owner();
        User b = owner();
        Map<String, Object> body = body("Custom", TransactionType.EXPENSE);
        body.put("icon", "gift");
        body.put("color", "#a1b2c3");
        body.put("userId", b.getId());
        var result = mvc.perform(auth(post("/api/categories").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)), a))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.icon").value("gift"))
                .andExpect(jsonPath("$.color").value("#A1B2C3")).andReturn().getResponse();
        CategoryResponse created = json.readValue(result.getContentAsString(), CategoryResponse.class);
        assertThat(categories.findByIdAndUserId(created.getId(), a.getId())).isPresent();
        assertThat(categories.findByUserId(b.getId())).isEmpty();
        assertThat(json.readTree(result.getContentAsString()).size()).isEqualTo(5);
        mvc.perform(auth(get("/api/categories/" + created.getId()), a))
                .andExpect(status().isOk()).andExpect(jsonPath("$.icon").value("gift"));
        mvc.perform(auth(get("/api/categories").param("type", "EXPENSE"), a))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].color").value("#A1B2C3"));
        mvc.perform(auth(delete("/api/categories/" + created.getId()), a)).andExpect(status().isNoContent());
        assertThat(categories.findById(created.getId())).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"omitted", "null"})
    void postUsesNeutralDefaults(String mode) throws Exception {
        User a = owner();
        Map<String, Object> body = body("Legacy client", TransactionType.EXPENSE);
        if (mode.equals("null")) { body.put("icon", null); body.put("color", null); }
        String response = mvc.perform(auth(post("/api/categories").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)), a))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.icon").value("tag"))
                .andExpect(jsonPath("$.color").value("#64748B")).andReturn().getResponse().getContentAsString();
        Category saved = categories.findById(json.readTree(response).get("id").asLong()).orElseThrow();
        assertThat(saved.getIcon()).isEqualTo("tag");
        assertThat(saved.getColor()).isEqualTo("#64748B");
    }

    // Bao gồm request giả mạo cờ nội bộ: chỉ field icon/color thực sự có mặt mới được quyết định cập nhật.
    @ParameterizedTest
    @ValueSource(strings = {"omitted", "icon-only", "color-only", "icon-null", "color-null", "both-null",
            "forged-flags", "flags-only"})
    void putDistinguishesOmissionNullAndPartialUpdates(String mode) throws Exception {
        User a = owner();
        Category existing = legacy(a, "wallet", "#112233");
        Map<String, Object> body = body("Renamed", TransactionType.EXPENSE);
        switch (mode) {
            case "icon-only" -> body.put("icon", "gift");
            case "color-only" -> body.put("color", "#abcdef");
            case "icon-null" -> body.put("icon", null);
            case "color-null" -> body.put("color", null);
            case "both-null" -> { body.put("icon", null); body.put("color", null); }
            case "forged-flags" -> { body.put("icon", "gift"); body.put("iconProvided", false); body.put("colorProvided", false); }
            case "flags-only" -> { body.put("iconProvided", true); body.put("colorProvided", true); }
            default -> { }
        }
        String icon = switch (mode) {
            case "icon-only", "forged-flags" -> "gift";
            case "icon-null", "both-null" -> "tag";
            default -> "wallet";
        };
        String color = switch (mode) {
            case "color-only" -> "#ABCDEF";
            case "color-null", "both-null" -> "#64748B";
            default -> "#112233";
        };
        mvc.perform(auth(put("/api/categories/" + existing.getId()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)), a))
                .andExpect(status().isOk()).andExpect(jsonPath("$.icon").value(icon))
                .andExpect(jsonPath("$.color").value(color)).andExpect(jsonPath("$.name").value("Renamed"));
        Category stored = categories.findById(existing.getId()).orElseThrow();
        assertThat(stored.getIcon()).isEqualTo(icon);
        assertThat(stored.getColor()).isEqualTo(color);
        assertThat(categories.count()).isEqualTo(1);
    }

    static Stream<Arguments> invalidAppearance() {
        return Stream.of("POST", "PUT").flatMap(method -> Stream.of(
                Arguments.of(method, "icon", ""), Arguments.of(method, "icon", " "),
                Arguments.of(method, "icon", "<svg>"), Arguments.of(method, "icon", "https://example.test/icon"),
                Arguments.of(method, "icon", "unknown"), Arguments.of(method, "icon", "UTENSILS"),
                Arguments.of(method, "icon", "utensils "), Arguments.of(method, "icon", "x".repeat(41)),
                Arguments.of(method, "color", ""), Arguments.of(method, "color", "red"),
                Arguments.of(method, "color", "#fff"), Arguments.of(method, "color", "#1234567"),
                Arguments.of(method, "color", "112233"), Arguments.of(method, "color", "#GG0000"),
                Arguments.of(method, "color", "#112233\n")));
    }

    @ParameterizedTest
    @MethodSource("invalidAppearance")
    void invalidAppearanceReturns400WithoutWriting(String method, String field, Object value) throws Exception {
        User a = owner();
        Category existing = method.equals("PUT") ? legacy(a, "wallet", "#112233") : null;
        long before = categories.count();
        Map<String, Object> body = body("Changed", TransactionType.EXPENSE);
        body.put(field, value);
        String path = "/api/categories" + (existing == null ? "" : "/" + existing.getId());
        mvc.perform(auth(request(HttpMethod.valueOf(method), path).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)), a))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors." + field).isNotEmpty());
        assertThat(categories.count()).isEqualTo(before);
        if (existing != null) {
            Category stored = categories.findById(existing.getId()).orElseThrow();
            assertThat(stored.getIcon()).isEqualTo("wallet");
            assertThat(stored.getColor()).isEqualTo("#112233");
            assertThat(stored.getName()).isEqualTo(existing.getName());
        }
    }

    // Fallback chỉ xử lý NULL sau migration; không ghi metadata và không backfill 17 danh mục cho user cũ.
    @Test
    void legacyNullMetadataAndLinkedTransactionsStillWork() throws Exception {
        User a = owner();
        Category old = legacy(a, null, null);
        mvc.perform(auth(get("/api/categories/" + old.getId()), a)).andExpect(status().isOk())
                .andExpect(jsonPath("$.icon").value("tag")).andExpect(jsonPath("$.color").value("#64748B"));
        mvc.perform(auth(put("/api/categories/" + old.getId()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body("Renamed legacy", TransactionType.EXPENSE))), a))
                .andExpect(status().isOk()).andExpect(jsonPath("$.icon").value("tag"));
        Category stored = categories.findById(old.getId()).orElseThrow();
        assertThat(stored.getIcon()).isNull();
        assertThat(stored.getColor()).isNull();
        assertThat(categories.count()).isEqualTo(1);
        mvc.perform(auth(post("/api/transactions").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("categoryId", old.getId(), "type", "EXPENSE",
                                "amount", new BigDecimal("12.34"), "transactionDate", "2026-10-31"))), a))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.categoryName").value("Renamed legacy"));
        mvc.perform(auth(get("/api/transactions").param("startDate", "2026-10-31").param("endDate", "2026-10-31"), a))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(auth(get("/api/calendar/month").param("year", "2026").param("month", "10"), a))
                .andExpect(status().isOk()).andExpect(jsonPath("$.expenseTotal").value(12.34));
        mvc.perform(auth(delete("/api/categories/" + old.getId()), a))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFLICT"));
        mvc.perform(auth(put("/api/categories/" + old.getId()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body("Attempt", TransactionType.INCOME))), a))
                .andExpect(status().isConflict());
        assertThat(categories.findById(old.getId()).orElseThrow().getType()).isEqualTo(TransactionType.EXPENSE);
    }

    @Test
    void legacyUnsafeMetadataIsNotReturnedOrRewritten() throws Exception {
        User a = owner();
        Category old = legacy(a, "<svg>", "red");
        mvc.perform(auth(get("/api/categories/" + old.getId()), a)).andExpect(status().isOk())
                .andExpect(jsonPath("$.icon").value("tag")).andExpect(jsonPath("$.color").value("#64748B"));
        Category stored = categories.findById(old.getId()).orElseThrow();
        assertThat(stored.getIcon()).isEqualTo("<svg>");
        assertThat(stored.getColor()).isEqualTo("red");
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void foreignCategoryKeeps404AndMetadataUnchanged(String method) throws Exception {
        User a = owner();
        User b = owner();
        Category foreign = legacy(b, "wallet", "#112233");
        var request = request(HttpMethod.valueOf(method), "/api/categories/" + foreign.getId());
        if (method.equals("PUT")) request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("name", "Attempt", "type", "EXPENSE", "icon", "gift", "color", "#ABCDEF", "userId", b.getId())));
        mvc.perform(auth(request, a)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        Category stored = categories.findById(foreign.getId()).orElseThrow();
        assertThat(stored.getIcon()).isEqualTo("wallet");
        assertThat(stored.getColor()).isEqualTo("#112233");
    }

    @Test
    void registrationFailureRollsBackAllMetadataAndAllowsRetry() throws Exception {
        // Chỉ chèn lỗi sau khi repository đã flush đủ 17 metadata; transaction thực phải rollback cả User.
        CategoryService target = AopTestUtils.getUltimateTargetObject(categoryService);
        doAnswer(invocation -> {
            invocation.callRealMethod();
            categories.flush();
            assertThat(categories.findAll()).hasSize(17).allSatisfy(category -> {
                assertThat(category.getIcon()).isNotBlank();
                assertThat(category.getColor()).matches("#[0-9A-F]{6}");
            });
            throw new IllegalStateException("D06 test failure after metadata flush");
        }).when(target).createDefaultCategories(any(User.class));
        String password = UUID.randomUUID().toString();
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Rollback", "email", email(), "password", password))))
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
        assertThat(users.count()).isZero();
        assertThat(categories.count()).isZero();
        doCallRealMethod().when(target).createDefaultCategories(any(User.class));
        UserResponse retry = register(password);
        assertCatalog(retry.getId());
    }

    @Test
    void protectedCategoryApiStillRequiresJwt() throws Exception {
        mvc.perform(post("/api/categories").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Test\",\"type\":\"EXPENSE\",\"icon\":\"gift\",\"color\":\"#ABCDEF\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        assertThat(categories.count()).isZero();
    }

    private void assertCatalog(Long userId) {
        List<Category> catalog = categories.findByUserId(userId);
        assertThat(catalog).hasSize(17);
        for (String line : EXPECTED_CATALOG.lines().toList()) {
            String[] fields = line.split("\\|");
            assertThat(catalog).filteredOn(category -> category.getName().equals(fields[1])).singleElement()
                    .satisfies(category -> {
                        assertThat(category.getType().name()).isEqualTo(fields[0]);
                        assertThat(category.getIcon()).isEqualTo(fields[2]);
                        assertThat(category.getColor()).isEqualTo(fields[3]);
                    });
        }
    }

    private UserResponse register(String password) throws Exception {
        var response = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "D06 user", "email", email(), "password", password))))
                .andExpect(status().isCreated()).andReturn().getResponse();
        String body = response.getContentAsString(StandardCharsets.UTF_8);
        assertThat(json.readTree(body).size()).isEqualTo(3);
        return json.readValue(body, UserResponse.class);
    }

    private Map<String, Object> body(String name, TransactionType type) {
        return new HashMap<>(Map.of("name", name, "type", type));
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request, User owner) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(owner.getId().toString())
                .issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return request.header(HttpHeaders.AUTHORIZATION, "Bearer " + jwtEncoder.encode(
                JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue());
    }

    private User owner() {
        User user = new User();
        user.setFullName("D06 legacy owner");
        user.setEmail(email());
        user.setPasswordHash(UUID.randomUUID().toString());
        return users.saveAndFlush(user);
    }

    private Category legacy(User owner, String icon, String color) {
        Category category = new Category();
        category.setUser(owner);
        category.setName("Existing name");
        category.setType(TransactionType.EXPENSE);
        category.setIcon(icon);
        category.setColor(color);
        return categories.saveAndFlush(category);
    }

    private String email() {
        return UUID.randomUUID() + "@example.test";
    }
}
