package com.smartexpense.backend;

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
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Đọc nhiều trang trên dữ liệu MySQL cố định, không mock repository và rollback sau từng test.
@SpringBootTest(classes = BackendApplication.class,
        properties = "spring.config.location=classpath:/application-d03-test.properties")
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class TransactionDayIntegrationTests extends MySqlIntegrationTestSupport {

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder jwtEncoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired EntityManager entityManager;

    private User userA;
    private User userB;
    private Category expenseA;
    private Category expenseB;

    @BeforeEach
    void fixtures() throws Exception {
        verifyMySqlConnection();
        assertThat(transactions.count()).isZero();
        assertThat(categories.count()).isZero();
        assertThat(users.count()).isZero();
        userA = user("a");
        userB = user("b");
        expenseA = category(userA);
        expenseB = category(userB);
        entityManager.flush();
    }

    // ID chính xác trên từng trang chứng minh không lẫn ngày/owner, không trùng hoặc thiếu bản ghi.
    @Test
    void pagesOneDayWithoutDuplicatesAndIgnoresClientOwner() throws Exception {
        List<Long> expected = new ArrayList<>();
        for (int i = 0; i < 27; i++) expected.add(save(expenseA, "2026-10-31"));
        Collections.reverse(expected);
        save(expenseA, "2026-10-30");
        save(expenseA, "2026-11-01");
        save(expenseB, "2026-10-31");
        entityManager.flush();
        entityManager.clear();

        List<Long> actual = new ArrayList<>();
        for (int page = 0; page < 3; page++) {
            JsonNode result = read(auth(dayRequest(page, 10).param("userId", userB.getId().toString()), userA));
            assertThat(result.get("totalElements").asLong()).isEqualTo(27);
            assertThat(result.get("totalPages").asInt()).isEqualTo(3);
            assertThat(result.get("number").asInt()).isEqualTo(page);
            assertThat(result.get("size").asInt()).isEqualTo(10);
            assertThat(result.get("content").size()).isEqualTo(page < 2 ? 10 : 7);
            for (JsonNode item : result.get("content")) {
                actual.add(item.get("id").asLong());
                assertThat(item.get("transactionDate").asString()).isEqualTo("2026-10-31");
                assertThat(item.get("categoryId").asLong()).isEqualTo(expenseA.getId());
            }
        }
        assertThat(actual).containsExactlyElementsOf(expected).doesNotHaveDuplicates();
        JsonNode outside = read(auth(dayRequest(3, 10), userA));
        assertThat(outside.get("content").isEmpty()).isTrue();
        assertThat(outside.get("totalElements").asLong()).isEqualTo(27);
    }

    @Test
    void sortsRangeByDateThenIdAcrossPageBoundaries() throws Exception {
        long middleFirst = save(expenseA, "2026-10-31");
        long firstDayFirst = save(expenseA, "2026-10-30");
        long lastDay = save(expenseA, "2026-11-01");
        long middleLast = save(expenseA, "2026-10-31");
        long firstDayLast = save(expenseA, "2026-10-30");
        save(expenseB, "2026-11-01");
        entityManager.flush();
        entityManager.clear();
        List<Long> actual = new ArrayList<>();
        for (int page = 0; page < 3; page++) {
            JsonNode result = read(auth(get("/api/transactions")
                    .param("startDate", "2026-10-30").param("endDate", "2026-11-01")
                    .param("page", String.valueOf(page)).param("size", "2"), userA));
            assertThat(result.get("totalElements").asLong()).isEqualTo(5);
            for (JsonNode item : result.get("content")) actual.add(item.get("id").asLong());
        }
        assertThat(actual).containsExactly(lastDay, middleLast, middleFirst, firstDayLast, firstDayFirst);
    }

    @Test
    void emptyDayDoesNotExposeOtherUsersTransactions() throws Exception {
        save(expenseB, "2026-10-31");
        JsonNode result = read(auth(dayRequest(0, 10).param("userId", userB.getId().toString()), userA));
        assertThat(result.get("content").isEmpty()).isTrue();
        assertThat(result.get("totalElements").asLong()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "?startDate=2026-10-31", "?endDate=2026-10-31",
            "?startDate=2026-02-30&endDate=2026-02-30",
            "?startDate=31-10-2026&endDate=31-10-2026",
            "?startDate=2026-11-01&endDate=2026-10-31",
            "?month=2026-10&startDate=2026-10-31&endDate=2026-10-31",
            "?page=-1", "?size=0", "?size=101", "?page=bad", "?size=bad",
            "?page=2147483648", "?size=2147483648", "?startDate=&endDate=2026-10-31",
            "?month=bad", "?categoryId=bad"})
    void invalidFiltersReturnD02Error(String query) throws Exception {
        mvc.perform(auth(get("/api/transactions" + query), userA))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").isNotEmpty()).andExpect(jsonPath("$.trace").doesNotExist());
        assertThat(transactions.count()).isZero();
    }

    // Hồi quy lỗi từng trả 500: offset vượt int phải thành 400, không clamp hoặc đổi page client.
    @ParameterizedTest
    @CsvSource({"2147483647,2", "21474837,100"})
    void rejectsOffsetBeyondJpaLimit(int page, int size) throws Exception {
        mvc.perform(auth(dayRequest(page, size), userA))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").isNotEmpty());
        assertThat(transactions.count()).isZero();
    }

    @ParameterizedTest
    @CsvSource({"2147483647,1", "21474836,100"})
    void supportedOffsetsBeyondDataStillReturnEmptyPage(int page, int size) throws Exception {
        save(expenseA, "2026-10-31");
        JsonNode result = read(auth(dayRequest(page, size), userA));
        assertThat(result.get("content").isEmpty()).isTrue();
        assertThat(result.get("totalElements").asLong()).isEqualTo(1);
        assertThat(result.get("number").asInt()).isEqualTo(page);
        assertThat(result.get("size").asInt()).isEqualTo(size);
    }

    @Test
    void missingJwtStillReturns401() throws Exception {
        mvc.perform(dayRequest(0, 10)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    private MockHttpServletRequestBuilder dayRequest(int page, int size) {
        return get("/api/transactions").param("startDate", "2026-10-31").param("endDate", "2026-10-31")
                .param("page", String.valueOf(page)).param("size", String.valueOf(size));
    }

    private JsonNode read(MockHttpServletRequestBuilder request) throws Exception {
        entityManager.flush();
        return json.readTree(mvc.perform(request).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request, User owner) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(owner.getId().toString())
                .issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private User user(String suffix) {
        User user = new User();
        user.setFullName("D05 test " + suffix);
        user.setEmail(suffix + UUID.randomUUID() + "@example.test");
        user.setPasswordHash(UUID.randomUUID().toString());
        return users.save(user);
    }

    private Category category(User owner) {
        Category category = new Category();
        category.setUser(owner);
        category.setName("D05 " + UUID.randomUUID());
        category.setType(TransactionType.EXPENSE);
        return categories.save(category);
    }

    private Long save(Category category, String date) {
        Transaction transaction = new Transaction();
        transaction.setUser(category.getUser());
        transaction.setCategory(category);
        transaction.setType(category.getType());
        transaction.setTransactionDate(LocalDate.parse(date));
        transaction.setAmount(new BigDecimal("1.23"));
        return transactions.save(transaction).getId();
    }
}
