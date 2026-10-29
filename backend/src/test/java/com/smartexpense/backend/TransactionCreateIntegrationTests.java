package com.smartexpense.backend;

import com.smartexpense.backend.dto.transaction.TransactionResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.Transaction;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
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
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Dùng MySQL thật và JWT thật; rollback từng test, xóa container sau khi kết thúc lớp.
@SpringBootTest(classes = BackendApplication.class,
        properties = "spring.config.location=classpath:/application-d03-test.properties")
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers(disabledWithoutDocker = true)
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class TransactionCreateIntegrationTests extends MySqlIntegrationTestSupport {

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder jwtEncoder;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired EntityManager entityManager;

    private User userA;
    private User userB;
    private Category expenseA;
    private Category incomeA;
    private Category expenseB;

    @BeforeEach
    void fixtures() throws Exception {
        verifyMySqlConnection();
        assertThat(transactions.count()).isZero();
        assertThat(categories.count()).isZero();
        assertThat(users.count()).isZero();
        String hash = passwordEncoder.encode(UUID.randomUUID().toString());
        userA = user("a", hash);
        userB = user("b", hash);
        expenseA = category(userA, TransactionType.EXPENSE);
        incomeA = category(userA, TransactionType.INCOME);
        expenseB = category(userB, TransactionType.EXPENSE);
        entityManager.flush();
    }

    static Stream<Arguments> invalidInputs() {
        return Stream.of("POST", "PUT").flatMap(method -> Stream.of(
                Arguments.of(method, "amount", null),
                Arguments.of(method, "amount", BigDecimal.ZERO),
                Arguments.of(method, "amount", new BigDecimal("-1")),
                Arguments.of(method, "amount", new BigDecimal("0.001")),
                Arguments.of(method, "amount", new BigDecimal("1.001")),
                Arguments.of(method, "amount", new BigDecimal("10000000000000.00")),
                Arguments.of(method, "transactionDate", null),
                Arguments.of(method, "transactionDate", "29/10/2026"),
                Arguments.of(method, "transactionDate", "2026-02-30"),
                Arguments.of(method, "transactionDate", "2025-02-29"),
                Arguments.of(method, "note", "a".repeat(501)),
                Arguments.of(method, "note", "ệ".repeat(501)),
                Arguments.of(method, "categoryId", null),
                Arguments.of(method, "categoryId", 0),
                Arguments.of(method, "categoryId", -1),
                Arguments.of(method, "categoryId", Long.MAX_VALUE),
                Arguments.of(method, "type", null),
                Arguments.of(method, "type", "INVALID")));
    }

    // Request sai không được thêm bản ghi hoặc làm thay đổi giao dịch đang có.
    @ParameterizedTest
    @MethodSource("invalidInputs")
    void rejectsInvalidInputWithoutWriting(String method, String field, Object value) throws Exception {
        Transaction existing = method.equals("PUT") ? existingTransaction(userA, expenseA) : null;
        long before = transactions.count();
        Map<String, Object> body = validBody(expenseA);
        body.put(field, value);
        expectError(perform(method, existing, body, userA), 400, "VALIDATION_ERROR");
        entityManager.flush();
        entityManager.clear();
        assertThat(transactions.count()).isEqualTo(before);
        if (existing != null) assertUnchanged(existing.getId());
    }

    static Stream<Arguments> validInputs() {
        return Stream.of("POST", "PUT").flatMap(method -> Stream.of(
                Arguments.of(method, "0.01", "2026-10-29", null),
                Arguments.of(method, "9999999999999.99", "2026-10-29", ""),
                Arguments.of(method, "123.45", "2024-02-29", "Ăn trưa tại Đà Nẵng – cà phê"),
                Arguments.of(method, "123.45", "2026-10-29", "a".repeat(500)),
                Arguments.of(method, "123.45", "2026-10-29", "ệ".repeat(500)),
                Arguments.of(method, "123.45", "2099-12-31", "Không tự cấm ngày tương lai")));
    }

    // Flush và clear persistence context để kiểm tra giá trị đọc lại từ MySQL, không từ cache JPA.
    @ParameterizedTest
    @MethodSource("validInputs")
    void savesExactValuesAndPreservesSuccessDto(String method, String amount, String date, String note)
            throws Exception {
        Transaction existing = method.equals("PUT") ? existingTransaction(userA, expenseA) : null;
        Map<String, Object> body = validBody(expenseA);
        body.put("amount", new BigDecimal(amount));
        body.put("transactionDate", date);
        body.put("note", note);
        TransactionResponse response = readSuccess(perform(method, existing, body, userA), method);
        entityManager.flush();
        entityManager.clear();
        Transaction stored = transactions.findByIdAndUserId(response.getId(), userA.getId()).orElseThrow();
        assertThat(transactions.count()).isEqualTo(1);
        assertThat(stored.getAmount()).isEqualByComparingTo(amount).hasScaleOf(2);
        assertThat(response.getAmount()).isEqualByComparingTo(amount);
        assertThat(stored.getTransactionDate()).isEqualTo(LocalDate.parse(date));
        assertThat(stored.getNote()).isEqualTo(note);
        assertThat(stored.getType()).isEqualTo(TransactionType.EXPENSE);
        assertThat(stored.getCategory().getId()).isEqualTo(expenseA.getId());
        if (existing != null) assertThat(response.getId()).isEqualTo(existing.getId());
    }

    @Test
    void createsIncomeWithMatchingCategory() throws Exception {
        Map<String, Object> body = validBody(incomeA);
        body.put("type", "INCOME");
        TransactionResponse response = readSuccess(perform("POST", null, body, userA), "POST");
        entityManager.flush();
        entityManager.clear();
        Transaction stored = transactions.findByIdAndUserId(response.getId(), userA.getId()).orElseThrow();
        assertThat(stored.getType()).isEqualTo(TransactionType.INCOME);
        assertThat(stored.getCategory().getId()).isEqualTo(incomeA.getId());
    }

    // Category đúng ID nhưng sai loại hoặc thuộc người khác đều bị từ chối theo contract cũ.
    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT"})
    void rejectsWrongTypeAndForeignCategory(String method) throws Exception {
        Transaction existing = method.equals("PUT") ? existingTransaction(userA, expenseA) : null;
        long before = transactions.count();
        expectError(perform(method, existing, validBody(incomeA), userA), 400, "VALIDATION_ERROR");
        expectError(perform(method, existing, validBody(expenseB), userA), 400, "VALIDATION_ERROR");
        entityManager.flush();
        entityManager.clear();
        assertThat(transactions.count()).isEqualTo(before);
        if (existing != null) assertUnchanged(existing.getId());
    }

    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT"})
    void ignoresClientUserIdWhenSaving(String method) throws Exception {
        Transaction existing = method.equals("PUT") ? existingTransaction(userA, expenseA) : null;
        Map<String, Object> body = validBody(expenseA);
        body.put("userId", userB.getId());
        TransactionResponse response = readSuccess(perform(method, existing, body, userA), method);
        entityManager.flush();
        entityManager.clear();
        assertThat(transactions.findByIdAndUserId(response.getId(), userA.getId())).isPresent();
        assertThat(transactions.findByIdAndUserId(response.getId(), userB.getId())).isEmpty();
    }

    @Test
    void userBCannotUpdateTransactionOfA() throws Exception {
        Transaction existing = existingTransaction(userA, expenseA);
        expectError(perform("PUT", existing, validBody(expenseB), userB), 404, "RESOURCE_NOT_FOUND");
        entityManager.flush();
        entityManager.clear();
        assertThat(transactions.count()).isEqualTo(1);
        assertUnchanged(existing.getId());
    }

    @Test
    void missingJwtDoesNotCreateTransaction() throws Exception {
        expectError(mvc.perform(post("/api/transactions").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(validBody(expenseA)))), 401, "UNAUTHORIZED");
        entityManager.flush();
        assertThat(transactions.count()).isZero();
    }

    private ResultActions perform(String method, Transaction existing, Map<String, Object> body, User owner)
            throws Exception {
        String path = "/api/transactions" + (existing == null ? "" : "/" + existing.getId());
        MockHttpServletRequestBuilder request = request(HttpMethod.valueOf(method), path)
                .queryParam("userId", userB.getId().toString()).contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token(owner.getId()))
                .content(json.writeValueAsString(body));
        return mvc.perform(request);
    }

    private TransactionResponse readSuccess(ResultActions result, String method) throws Exception {
        var response = result.andExpect(status().is(method.equals("POST") ? 201 : 200))
                .andExpect(jsonPath("$.id").isNumber()).andExpect(jsonPath("$.categoryId").isNumber())
                .andExpect(jsonPath("$.categoryName").isString()).andExpect(jsonPath("$.type").isString())
                .andExpect(jsonPath("$.transactionDate").isString()).andExpect(jsonPath("$.userId").doesNotExist())
                .andExpect(jsonPath("$.code").doesNotExist()).andReturn().getResponse();
        return json.readValue(response.getContentAsString(), TransactionResponse.class);
    }

    private void expectError(ResultActions result, int status, String code) throws Exception {
        result.andExpect(status().is(status)).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(status)).andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.message").isNotEmpty()).andExpect(jsonPath("$.trace").doesNotExist());
    }

    private Map<String, Object> validBody(Category category) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("categoryId", category.getId());
        body.put("type", "EXPENSE");
        body.put("amount", new BigDecimal("123.45"));
        body.put("transactionDate", "2026-10-29");
        body.put("note", "Dữ liệu kiểm thử D03");
        return body;
    }

    private Transaction existingTransaction(User owner, Category category) {
        Transaction transaction = new Transaction();
        transaction.setUser(owner);
        transaction.setCategory(category);
        transaction.setType(TransactionType.EXPENSE);
        transaction.setAmount(new BigDecimal("10.00"));
        transaction.setTransactionDate(LocalDate.of(2026, 10, 1));
        transaction.setNote("Bản ghi gốc");
        return transactions.saveAndFlush(transaction);
    }

    private void assertUnchanged(Long id) {
        Transaction original = transactions.findByIdAndUserId(id, userA.getId()).orElseThrow();
        assertThat(original.getAmount()).isEqualByComparingTo("10.00");
        assertThat(original.getTransactionDate()).isEqualTo(LocalDate.of(2026, 10, 1));
        assertThat(original.getNote()).isEqualTo("Bản ghi gốc");
        assertThat(original.getCategory().getId()).isEqualTo(expenseA.getId());
        assertThat(original.getType()).isEqualTo(TransactionType.EXPENSE);
    }

    private User user(String prefix, String hash) {
        User user = new User();
        user.setEmail(prefix + UUID.randomUUID() + "@example.test");
        user.setFullName("Người dùng test " + prefix);
        user.setPasswordHash(hash);
        return users.saveAndFlush(user);
    }

    private Category category(User owner, TransactionType type) {
        Category category = new Category();
        category.setUser(owner);
        category.setName("Danh mục test " + type);
        category.setType(type);
        return categories.saveAndFlush(category);
    }

    private String token(Long userId) {
        Instant now = Instant.now();
        return jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(userId.toString()).issuedAt(now).expiresAt(now.plusSeconds(600))
                        .build())).getTokenValue();
    }

}
