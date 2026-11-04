package com.smartexpense.backend;

import com.smartexpense.backend.dto.auth.AuthResponse;
import com.smartexpense.backend.dto.auth.UserResponse;
import com.smartexpense.backend.dto.transaction.TransactionResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// QA D01–D02: API/filter/repository thật trên MySQL mới; thiếu Docker phải FAIL, không bỏ qua.
@SpringBootTest(classes = BackendApplication.class,
        properties = "spring.config.location=classpath:/application-d03-test.properties")
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class QaBaselineAuthIntegrationTests extends MySqlIntegrationTestSupport {
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired MonthlyBudgetRepository budgets;
    @Autowired PasswordEncoder passwords;
    @Autowired JwtEncoder encoder;
    @Autowired EntityManagerFactory entityManagerFactory;

    private String password, tokenA, tokenB;
    private UserResponse a, b;
    private Category categoryB;
    private long transactionB;

    @BeforeEach
    void prepareTwoTestAccounts() throws Exception {
        verifyMySqlConnection();
        assertThat(users.count()).isZero();
        password = UUID.randomUUID().toString();
        a = register("qa-a-" + UUID.randomUUID() + "@example.test");
        b = register("qa-b-" + UUID.randomUUID() + "@example.test");
        tokenA = login(a.getEmail());
        tokenB = login(b.getEmail());
        categoryB = categories.findByUserId(b.getId()).stream()
                .filter(category -> category.getType() == TransactionType.EXPENSE).findFirst().orElseThrow();
        transactionB = json.readValue(mvc.perform(post("/api/transactions")
                .header("Authorization", bearer(tokenB)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(transactionBody(categoryB.getId()))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), TransactionResponse.class).getId();
        mvc.perform(put("/api/budgets/2026/10").header("Authorization", bearer(tokenB))
                .contentType(MediaType.APPLICATION_JSON).content("{\"amountLimit\":100}"))
                .andExpect(status().isOk());
    }

    @AfterEach
    void cleanupOnlyVerifiedTestDatabase() throws Exception {
        verifyMySqlConnection();
        transactions.deleteAllInBatch();
        budgets.deleteAllInBatch();
        categories.deleteAllInBatch();
        users.deleteAllInBatch();
        assertThat(counts()).containsExactly(0L, 0L, 0L, 0L);
    }

    @Test
    void schemaHasMappedTablesLegacyKeysAndD06Columns() {
        ApplicationSchemaAssertions.assertMappedSchema(jdbc, entityManagerFactory);
        assertThat(jdbc.queryForList("SELECT column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='categories' AND column_name IN ('icon','color') ORDER BY column_name", String.class))
                .containsExactly("varchar(7)", "varchar(40)");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='categories' AND column_name IN ('icon','color') AND is_nullable='YES'", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='transactions' AND column_name='amount'", String.class)).isEqualTo("decimal(15,2)");
        assertThat(jdbc.queryForObject("SELECT data_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='transactions' AND column_name='transaction_date'", String.class)).isEqualTo("date");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='monthly_budgets' AND index_name='uk_budget_user_year_month' AND non_unique=0", Integer.class)).isEqualTo(3);
    }

    @Test
    void baselineCountsUnicodeOwnershipAndMoneyAreConsistent() {
        assertThat(counts()).containsExactly(2L, 34L, 1L, 1L);
        assertThat(categories.findByUserId(a.getId())).hasSize(17).extracting(Category::getName).contains("Ăn uống", "Tiền lương");
        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM transactions", BigDecimal.class)).isEqualByComparingTo("12.34");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM categories c LEFT JOIN users u ON u.id=c.user_id WHERE u.id IS NULL", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM transactions t LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN users u ON u.id=t.user_id WHERE c.id IS NULL OR u.id IS NULL OR c.user_id<>t.user_id", Integer.class)).isZero();
    }

    @Test
    void foreignKeysAndUniqueBudgetRejectInvalidRows() {
        assertThatThrownBy(() -> jdbc.update("INSERT INTO categories(name,type,user_id,created_at) VALUES ('QA_INVALID','EXPENSE',-1,CURRENT_TIMESTAMP)"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO monthly_budgets(user_id,`year`,`month`,amount_limit) VALUES (?,2026,10,1)", b.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(counts()).containsExactly(2L, 34L, 1L, 1L);
    }

    @Test
    void historicalSeedIsRepeatableWhenRetargetedOnlyInMemoryToTestDatabase() throws Exception {
        verifyMySqlConnection();
        String seed = Files.readString(Path.of("../database/seed.sql"), StandardCharsets.UTF_8);
        // Chỉ đổi đích/owner của bản sao trong RAM; không sửa seed gốc hoặc chạy vào DB mẫu/VPS.
        seed = seed.replaceAll("(?im)^\\s*USE\\s+personal_finance_db\\s*;", "USE " + MYSQL.getDatabaseName() + ";")
                .replaceAll("(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}", a.getEmail());
        assertThat(seed.contains("USE personal_finance_db")).isFalse();
        EncodedResource script = new EncodedResource(new ByteArrayResource(seed.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
        try (var connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection, script);
            List<Long> afterFirst = counts();
            BigDecimal total = jdbc.queryForObject("SELECT SUM(amount) FROM transactions", BigDecimal.class);
            ScriptUtils.executeSqlScript(connection, script);
            assertThat(counts()).isEqualTo(afterFirst);
            assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM transactions", BigDecimal.class)).isEqualByComparingTo(total);
            assertThat(connection.getCatalog()).isEqualTo(MYSQL.getDatabaseName());
        }
    }

    @Test
    void registrationHashesPasswordsAndNeverExposesThemOrCreatesSession() throws Exception {
        assertThat(passwords.matches(password, users.findById(a.getId()).orElseThrow().getPasswordHash())).isTrue();
        var result = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", a.getEmail(), "password", password))))
                .andExpect(status().isOk()).andReturn();
        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(result.getResponse().getHeader("Set-Cookie")).isNull();
        assertThat(result.getResponse().getContentAsString().contains(password)).isFalse();
        assertThat(result.getResponse().getContentAsString().contains("passwordHash")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"fullName", "email", "password"})
    void invalidRegistrationReturns400AndDoesNotWrite(String field) throws Exception {
        var body = new java.util.HashMap<String, Object>(Map.of("fullName", "QA", "email", UUID.randomUUID() + "@example.test", "password", password));
        body.put(field, field.equals("email") ? "invalid" : field.equals("password") ? "123" : " ");
        error(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))), 400, "VALIDATION_ERROR");
        assertThat(counts()).containsExactly(2L, 34L, 1L, 1L);
    }

    @Test
    void duplicateRegistrationReturns409WithoutExtraCategories() throws Exception {
        error(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("fullName", "QA DUPLICATE", "email", a.getEmail().toUpperCase(), "password", password)))), 409, "CONFLICT");
        assertThat(counts()).containsExactly(2L, 34L, 1L, 1L);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void wrongPasswordOrUnknownEmailReturns401(boolean wrongPassword) throws Exception {
        error(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("email", wrongPassword ? a.getEmail() : UUID.randomUUID() + "@example.test", "password", wrongPassword ? UUID.randomUUID().toString() : password)))), 401, "UNAUTHORIZED");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/users/me", "/api/categories", "/api/transactions", "/api/budgets/2026/10", "/api/dashboard/summary?month=2026-10", "/api/calendar/month?year=2026&month=10"})
    void missingJwtReturns401OnEveryProtectedArea(String path) throws Exception {
        error(mvc.perform(get(path)), 401, "UNAUTHORIZED");
    }

    @ParameterizedTest
    @ValueSource(strings = {"expired", "wrong-signature", "malformed", "missing-expiration", "wrong-subject"})
    void invalidJwtReturns401BeforeReadingPrivateData(String kind) throws Exception {
        String token = switch (kind) {
            case "malformed" -> "qa-not-a-jwt";
            case "wrong-signature" -> {
                int start = tokenA.lastIndexOf('.') + 1;
                yield tokenA.substring(0, start) + (tokenA.charAt(start) == 'A' ? "B" : "A") + tokenA.substring(start + 1);
            }
            default -> {
                var claims = JwtClaimsSet.builder().subject(kind.equals("wrong-subject") ? "invalid" : a.getId().toString())
                        .issuedAt(Instant.now().minusSeconds(7200));
                if (!kind.equals("missing-expiration")) claims.expiresAt(Instant.now().plusSeconds(kind.equals("expired") ? -3600 : 600));
                yield encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims.build())).getTokenValue();
            }
        };
        error(mvc.perform(get("/api/users/me").header("Authorization", bearer(token))), 401, "UNAUTHORIZED");
    }

    @Test
    void forbiddenCorsDoesNotWriteData() throws Exception {
        mvc.perform(post("/api/transactions").header("Authorization", bearer(tokenA))
                .header("Origin", "http://qa-forbidden.invalid").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(transactionBody(categoryB.getId())))).andExpect(status().isForbidden());
        assertThat(transactions.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void accountACannotReadUpdateOrDeleteCategoryB(String method) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method), "/api/categories/" + categoryB.getId())
                .header("Authorization", bearer(tokenA));
        if (method.equals("PUT")) request.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"QA_FORBIDDEN\",\"type\":\"EXPENSE\",\"icon\":\"gift\",\"color\":\"#123456\"}");
        error(mvc.perform(request), 404, "RESOURCE_NOT_FOUND");
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void accountACannotReadUpdateOrDeleteTransactionB(String method) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method), "/api/transactions/" + transactionB)
                .header("Authorization", bearer(tokenA));
        if (method.equals("PUT")) request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(transactionBody(categoryB.getId())));
        error(mvc.perform(request), 404, "RESOURCE_NOT_FOUND");
        assertThat(transactions.count()).isEqualTo(1);
    }

    @Test
    void listsProfileBudgetDashboardAndCalendarIgnoreClientOwner() throws Exception {
        mvc.perform(get("/api/users/me").param("userId", b.getId().toString()).header("Authorization", bearer(tokenA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(a.getId()));
        mvc.perform(get("/api/categories").param("userId", b.getId().toString()).header("Authorization", bearer(tokenA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(17));
        mvc.perform(get("/api/transactions").param("userId", b.getId().toString()).header("Authorization", bearer(tokenA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(get("/api/dashboard/summary?month=2026-10").param("userId", b.getId().toString()).header("Authorization", bearer(tokenA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalExpense").value(0));
        mvc.perform(get("/api/calendar/month?year=2026&month=10").param("userId", b.getId().toString()).header("Authorization", bearer(tokenA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.expenseTotal").value(0));
        error(mvc.perform(get("/api/budgets/2026/10").param("userId", b.getId().toString()).header("Authorization", bearer(tokenA))), 404, "RESOURCE_NOT_FOUND");
        var foreignCategoryRequest = post("/api/transactions").header("Authorization", bearer(tokenA)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(transactionBody(categoryB.getId())));
        error(mvc.perform(foreignCategoryRequest), 400, "VALIDATION_ERROR");
    }

    private UserResponse register(String email) throws Exception {
        var response = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("fullName", "Tài khoản QA", "email", email, "password", password))))
                .andExpect(status().isCreated()).andReturn().getResponse();
        assertThat(response.getContentAsString().contains(password)).isFalse();
        return json.readValue(response.getContentAsString(), UserResponse.class);
    }

    private String login(String email) throws Exception {
        var response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", password))))
                .andExpect(status().isOk()).andReturn().getResponse();
        return json.readValue(response.getContentAsString(), AuthResponse.class).getAccessToken();
    }

    private Map<String, Object> transactionBody(long categoryId) {
        return Map.of("categoryId", categoryId, "type", "EXPENSE", "amount", new BigDecimal("12.34"),
                "transactionDate", "2026-10-28", "note", "Ghi chú kiểm thử riêng");
    }

    private List<Long> counts() { return List.of(users.count(), categories.count(), transactions.count(), budgets.count()); }
    private String bearer(String token) { return "Bearer " + token; }
    private void error(ResultActions result, int status, String code) throws Exception {
        result.andExpect(status().is(status)).andExpect(jsonPath("$.status").value(status)).andExpect(jsonPath("$.code").value(code));
    }
}
