package com.smartexpense.backend;

import com.smartexpense.backend.dto.category.CategoryResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.UserRepository;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.BrokenBarrierException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// HTTP qua MockMvc, JWT/Service/Repository/MySQL thật; từng request commit hoặc rollback riêng.
@SpringBootTest(classes = BackendApplication.class, properties = {
        "spring.config.location=classpath:/application-d03-test.properties",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=com.smartexpense.backend.CategoryNameIntegrationTests$PauseCategoryInsert"})
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class CategoryNameIntegrationTests extends MySqlIntegrationTestSupport {

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired UserRepository users;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;
    @Autowired CategoryRepository categories;

    private User userA;
    private User userB;

    @BeforeEach
    void prepareIsolatedOwners() throws Exception {
        verifyMySqlConnection();
        assertThat(users.count()).isZero();
        assertThat(categories.count()).isZero();
        userA = owner();
        userB = owner();
    }

    @AfterEach
    void cleanupCommittedRows() throws Exception {
        verifyMySqlConnection();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            categories.deleteAllInBatch();
            users.deleteAllInBatch();
        });
        assertThat(categories.count()).isZero();
        assertThat(users.count()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Ăn uống", "ĂN UỐNG", "  ăn uống  ", "\tĂn uống\n"})
    void createRejectsDuplicateAfterTrimmingAndIgnoringCase(String name) throws Exception {
        CategoryResponse original = create(userA, "  Ăn uống  ", TransactionType.EXPENSE);
        assertThat(original.getName()).isEqualTo("Ăn uống");
        conflict(write(userA, HttpMethod.POST, "/api/categories", Map.of(
                "name", name, "type", "EXPENSE", "icon", "wallet", "color", "#ABCDEF")));
        assertThat(categories.count()).isEqualTo(1);
        assertStored(original);
    }

    @Test
    void createAllowsSameNameForDifferentTypes() throws Exception {
        create(userA, "Quà tặng", TransactionType.INCOME);
        CategoryResponse expense = create(userA, "  QUÀ TẶNG  ", TransactionType.EXPENSE);
        assertThat(expense.getName()).isEqualTo("QUÀ TẶNG");
        assertThat(categories.findByUserId(userA.getId())).hasSize(2);
    }

    @Test
    void createAllowsOtherOwnerAndIgnoresClientUserId() throws Exception {
        create(userB, "Ăn uống", TransactionType.EXPENSE);
        String response = write(userA, HttpMethod.POST, "/api/categories", Map.of(
                "name", "  ĂN UỐNG  ", "type", "EXPENSE", "userId", userB.getId()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        CategoryResponse own = json.readValue(response, CategoryResponse.class);
        assertThat(categories.findByIdAndUserId(own.getId(), userA.getId())).isPresent();
        assertThat(categories.findByUserId(userA.getId())).hasSize(1);
        assertThat(categories.findByUserId(userB.getId())).hasSize(1);
    }

    @Test
    void preservesInternalWhitespaceRatherThanCollapsingDifferentNames() throws Exception {
        create(userA, "Ăn uống", TransactionType.EXPENSE);
        CategoryResponse distinct = create(userA, "  Ăn  uống  ", TransactionType.EXPENSE);
        assertThat(distinct.getName()).isEqualTo("Ăn  uống");
        assertThat(categories.count()).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Ăn uống", "ĂN UỐNG", "  ăn uống  ", "\tĂn uống\n"})
    void updateRejectsOtherCategoryAndPreservesBothRows(String name) throws Exception {
        CategoryResponse duplicate = create(userA, "Ăn uống", TransactionType.EXPENSE);
        CategoryResponse original = create(userA, "Đi lại", TransactionType.EXPENSE);
        Category before = categories.findById(original.getId()).orElseThrow();
        conflict(write(userA, HttpMethod.PUT, "/api/categories/" + original.getId(), Map.of(
                "name", name, "type", "EXPENSE", "icon", "wallet", "color", "#ABCDEF")));
        assertStored(original);
        assertStored(duplicate);
        Category after = categories.findById(original.getId()).orElseThrow();
        assertThat(after.getCreatedAt()).isEqualTo(before.getCreatedAt());
        assertThat(categories.count()).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Ăn uống", "ĂN UỐNG", "  Ăn uống  "})
    void updateExcludesOwnIdAndKeepsOmittedMetadata(String name) throws Exception {
        CategoryResponse original = create(userA, "Ăn uống", TransactionType.EXPENSE);
        Category before = categories.findById(original.getId()).orElseThrow();
        write(userA, HttpMethod.PUT, "/api/categories/" + original.getId(),
                Map.of("name", name, "type", "EXPENSE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(original.getId()))
                .andExpect(jsonPath("$.icon").value("gift")).andExpect(jsonPath("$.color").value("#112233"));
        Category after = categories.findById(original.getId()).orElseThrow();
        assertThat(after.getName()).isEqualTo(name.trim());
        assertThat(after.getUser().getId()).isEqualTo(userA.getId());
        assertThat(after.getCreatedAt()).isEqualTo(before.getCreatedAt());
        assertThat(after.getIcon()).isEqualTo("gift");
        assertThat(after.getColor()).isEqualTo("#112233");
        assertThat(categories.count()).isEqualTo(1);
    }

    @Test
    void updateAllowsNameUsedByDifferentType() throws Exception {
        create(userA, "Quà tặng", TransactionType.INCOME);
        CategoryResponse original = create(userA, "Đi lại", TransactionType.EXPENSE);
        write(userA, HttpMethod.PUT, "/api/categories/" + original.getId(),
                Map.of("name", "  QUÀ TẶNG  ", "type", "EXPENSE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.icon").value("gift"));
        assertThat(categories.findById(original.getId()).orElseThrow().getName()).isEqualTo("QUÀ TẶNG");
        assertThat(categories.count()).isEqualTo(2);
    }

    @Test
    void updateAllowsNameUsedByDifferentOwner() throws Exception {
        CategoryResponse foreign = create(userB, "Ăn uống", TransactionType.EXPENSE);
        CategoryResponse original = create(userA, "Đi lại", TransactionType.EXPENSE);
        write(userA, HttpMethod.PUT, "/api/categories/" + original.getId(),
                Map.of("name", "  ĂN UỐNG  ", "type", "EXPENSE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.color").value("#112233"));
        assertThat(categories.findById(original.getId()).orElseThrow().getName()).isEqualTo("ĂN UỐNG");
        assertStored(foreign);
    }

    @Test
    void updateChecksTargetTypeEvenWhenNameIsUnchanged() throws Exception {
        CategoryResponse income = create(userA, "Quà tặng", TransactionType.INCOME);
        CategoryResponse expense = create(userA, "Quà tặng", TransactionType.EXPENSE);
        conflict(write(userA, HttpMethod.PUT, "/api/categories/" + expense.getId(),
                Map.of("name", "Quà tặng", "type", "INCOME", "icon", "wallet", "color", "#ABCDEF")));
        assertStored(income);
        assertStored(expense);
    }

    @Test
    void selfUpdateStillDetectsAnotherLegacyDuplicate() throws Exception {
        CategoryResponse original = create(userA, "Ăn uống", TransactionType.EXPENSE);
        // Dữ liệu trùng có thể tồn tại từ trước validation; không sửa hoặc xóa tự động.
        Category legacy = new Category();
        legacy.setUser(userA);
        legacy.setName("ĂN UỐNG");
        legacy.setType(TransactionType.EXPENSE);
        categories.saveAndFlush(legacy);
        conflict(write(userA, HttpMethod.PUT, "/api/categories/" + original.getId(),
                Map.of("name", original.getName(), "type", "EXPENSE")));
        assertStored(original);
        assertThat(categories.count()).isEqualTo(2);
    }

    // Characterization của rủi ro đã biết: không có UNIQUE thì precheck không bảo đảm khi ghi đồng thời.
    @Test
    void concurrentCreatesCanBothPassTheRealPrecheckWithoutDatabaseUniqueness() throws Exception {
        // Dừng ngay trước INSERT: cả hai precheck phải kết thúc trước khi một bản ghi được ghi/commit.
        PauseCategoryInsert.barrier = new CyclicBarrier(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var body = Map.<String, Object>of("name", "Race", "type", "EXPENSE");
            var first = executor.submit(() -> write(userA, HttpMethod.POST, "/api/categories", body)
                    .andReturn().getResponse().getStatus());
            var second = executor.submit(() -> write(userA, HttpMethod.POST, "/api/categories", body)
                    .andReturn().getResponse().getStatus());
            assertThat(List.of(first.get(40, TimeUnit.SECONDS), second.get(40, TimeUnit.SECONDS)))
                    .containsExactly(201, 201);
            assertThat(jdbc.queryForObject("""
                    SELECT COUNT(*) FROM categories WHERE user_id = ? AND type = 'EXPENSE' AND UPPER(name) = 'RACE'
                    """, Long.class, userA.getId())).isEqualTo(2L);
        } finally {
            executor.shutdownNow();
            try {
                assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
            } finally {
                PauseCategoryInsert.barrier = null;
            }
        }
    }

    private CategoryResponse create(User owner, String name, TransactionType type) throws Exception {
        String response = write(owner, HttpMethod.POST, "/api/categories",
                Map.of("name", name, "type", type, "icon", "gift", "color", "#112233"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return json.readValue(response, CategoryResponse.class);
    }

    private void conflict(ResultActions response) throws Exception {
        response.andExpect(status().isConflict()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(409)).andExpect(jsonPath("$.code").value("CONFLICT"))
                .andExpect(jsonPath("$.message").value("Tên danh mục đã tồn tại với loại này"))
                .andExpect(jsonPath("$.errors").doesNotExist()).andExpect(jsonPath("$.trace").doesNotExist());
        assertThat(json.readTree(response.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).size())
                .isEqualTo(3);
    }

    private void assertStored(CategoryResponse original) {
        Category stored = categories.findById(original.getId()).orElseThrow();
        assertThat(stored.getName()).isEqualTo(original.getName());
        assertThat(stored.getType()).isEqualTo(original.getType());
        assertThat(stored.getIcon()).isEqualTo(original.getIcon());
        assertThat(stored.getColor()).isEqualTo(original.getColor());
    }

    private ResultActions write(User owner, HttpMethod method, String path, Map<String, Object> body) throws Exception {
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder().subject(owner.getId().toString()).issuedAt(now)
                .expiresAt(now.plusSeconds(600)).build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return mvc.perform(request(method, path).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private User owner() {
        User owner = new User();
        owner.setFullName("D06 name validation");
        owner.setEmail(UUID.randomUUID() + "@example.test");
        owner.setPasswordHash(UUID.randomUUID().toString());
        return users.saveAndFlush(owner);
    }

    // Chỉ đồng bộ thời điểm INSERT trong ca race; không đổi SQL, tham số hoặc kết quả SELECT.
    public static class PauseCategoryInsert implements StatementInspector {
        private static volatile CyclicBarrier barrier;

        @Override
        public String inspect(String sql) {
            CyclicBarrier active = barrier;
            if (active != null && sql.stripLeading().toLowerCase(Locale.ROOT).startsWith("insert into categories ")) {
                try {
                    active.await(20, TimeUnit.SECONDS);
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Đã ngắt đồng bộ INSERT của test race", error);
                } catch (BrokenBarrierException | TimeoutException error) {
                    throw new IllegalStateException("Không đồng bộ được hai INSERT của test race", error);
                }
            }
            return sql;
        }
    }
}
