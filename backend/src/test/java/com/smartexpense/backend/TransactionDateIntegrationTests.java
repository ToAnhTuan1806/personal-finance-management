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
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.*;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = BackendApplication.class,
        properties = "spring.config.location=classpath:/application-d03-test.properties")
@ActiveProfiles("d03-test")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@Transactional
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import({MySqlIntegrationTestSupport.IsolatedDataSource.class, TransactionDateIntegrationTests.TestClockConfig.class})
class TransactionDateIntegrationTests extends MySqlIntegrationTestSupport {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final String DATE_ERROR = "Ngày giao dịch không được lớn hơn ngày hiện tại.";

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired TransactionRepository transactions;
    @Autowired EntityManager entityManager;
    @Autowired AdjustableClock clock;

    private User owner;
    private Category category;

    @BeforeEach
    void fixtures() throws Exception {
        verifyMySqlConnection();
        assertThat(transactions.count()).isZero();
        clock.set(Instant.parse("2030-06-15T05:00:00Z"));
        owner = new User();
        owner.setEmail(UUID.randomUUID() + "@example.test");
        owner.setFullName("Date validation test");
        owner.setPasswordHash(UUID.randomUUID().toString());
        owner = users.saveAndFlush(owner);
        category = new Category();
        category.setUser(owner);
        category.setName("Date validation category");
        category.setType(TransactionType.EXPENSE);
        category = categories.saveAndFlush(category);
    }

    @ParameterizedTest
    @CsvSource({"POST,0", "POST,-1", "PUT,0", "PUT,-1"})
    void acceptsTodayAndYesterday(String method, int days) throws Exception {
        assertSaved(method, today().plusDays(days));
    }

    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT"})
    void accepts1970WithoutMinimumYear(String method) throws Exception {
        assertSaved(method, LocalDate.of(1970, 1, 1));
    }

    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT"})
    void rejectsTomorrowWithoutWriting(String method) throws Exception {
        Transaction existing = method.equals("PUT") ? existingTransaction() : null;
        rejectDate(method, existing, today().plusDays(1).toString(), true);
    }

    @ParameterizedTest
    @CsvSource({"POST,2030-02-30", "PUT,2030-02-30", "POST,2030-02-29", "PUT,2030-02-29",
            "POST,15/06/2030", "PUT,15/06/2030"})
    void rejectsImpossibleOrMalformedDatesWithoutWriting(String method, String date) throws Exception {
        rejectDate(method, method.equals("PUT") ? existingTransaction() : null, date, false);
    }

    @Test
    void vietnamMidnightUsesInjectedClockWithoutCachingToday() throws Exception {
        System.out.println("DATE VALIDATION serverZone=" + ZoneId.systemDefault());
        // 23:59:59 tại Việt Nam: ngày kế tiếp vẫn bị từ chối, dù Clock có zone UTC.
        clock.set(Instant.parse("2030-06-14T16:59:59Z"));
        assertThat(today()).isEqualTo(LocalDate.of(2030, 6, 14));
        rejectDate("POST", null, "2030-06-15", true);
        Transaction existing = existingTransaction();
        rejectDate("PUT", existing, "2030-06-15", true);

        // Cùng application/validator, qua 00:00:00: ngày đó được chấp nhận ngay.
        clock.set(Instant.parse("2030-06-14T17:00:00Z"));
        assertSaved("POST", LocalDate.of(2030, 6, 15));
        perform("PUT", existing, "2030-06-15").andExpect(status().isOk())
                .andExpect(jsonPath("$.transactionDate").value("2030-06-15"));
        entityManager.flush();
        entityManager.clear();
        assertThat(transactions.findById(existing.getId()).orElseThrow().getTransactionDate())
                .isEqualTo(LocalDate.of(2030, 6, 15));
    }

    @Test
    void getAndDeleteStillAcceptStoredHistoricalOrFutureDates() throws Exception {
        Transaction existing = existingTransaction();
        existing.setTransactionDate(today().plusDays(10));
        transactions.saveAndFlush(existing);
        entityManager.clear();
        mvc.perform(get("/api/transactions/{id}", existing.getId()).header("Authorization", "Bearer " + token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transactionDate").value(existing.getTransactionDate().toString()));
        mvc.perform(get("/api/transactions").param("startDate", existing.getTransactionDate().toString())
                        .param("endDate", existing.getTransactionDate().toString())
                        .header("Authorization", "Bearer " + token()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(delete("/api/transactions/{id}", existing.getId()).header("Authorization", "Bearer " + token()))
                .andExpect(status().isNoContent());
        entityManager.flush();
        assertThat(transactions.count()).isZero();
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(VIETNAM));
    }

    private void assertSaved(String method, LocalDate date) throws Exception {
        Transaction existing = method.equals("PUT") ? existingTransaction() : null;
        var response = perform(method, existing, date.toString())
                .andExpect(status().is(method.equals("POST") ? 201 : 200))
                .andExpect(jsonPath("$.transactionDate").value(date.toString())).andReturn().getResponse();
        long id = json.readTree(response.getContentAsString()).get("id").asLong();
        entityManager.flush();
        entityManager.clear();
        assertThat(transactions.findById(id).orElseThrow().getTransactionDate()).isEqualTo(date);
    }

    private void rejectDate(String method, Transaction existing, String date, boolean fieldError) throws Exception {
        long count = transactions.count();
        var result = perform(method, existing, date).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        if (fieldError) result.andExpect(jsonPath("$.errors.transactionDate").value(DATE_ERROR));
        entityManager.flush();
        entityManager.clear();
        assertThat(transactions.count()).isEqualTo(count);
        if (existing != null) {
            Transaction stored = transactions.findById(existing.getId()).orElseThrow();
            assertThat(stored.getTransactionDate()).isEqualTo(LocalDate.of(1970, 1, 1));
            assertThat(stored.getAmount()).isEqualByComparingTo("10.00");
            assertThat(stored.getNote()).isEqualTo("Original");
            assertThat(stored.getCategory().getId()).isEqualTo(category.getId());
            assertThat(stored.getType()).isEqualTo(TransactionType.EXPENSE);
            assertThat(stored.getUser().getId()).isEqualTo(owner.getId());
        }
    }

    private ResultActions perform(String method, Transaction existing, String date) throws Exception {
        var request = method.equals("POST") ? post("/api/transactions")
                : put("/api/transactions/{id}", existing.getId());
        return mvc.perform(request.header("Authorization", "Bearer " + token())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                        "categoryId", category.getId(), "type", "EXPENSE", "amount", new BigDecimal("123.45"),
                        "transactionDate", date, "note", "Updated"))));
    }

    private Transaction existingTransaction() {
        Transaction transaction = new Transaction();
        transaction.setUser(owner);
        transaction.setCategory(category);
        transaction.setType(TransactionType.EXPENSE);
        transaction.setAmount(new BigDecimal("10.00"));
        transaction.setTransactionDate(LocalDate.of(1970, 1, 1));
        transaction.setNote("Original");
        return transactions.saveAndFlush(transaction);
    }

    private String token() {
        Instant now = Instant.now();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(owner.getId().toString()).issuedAt(now)
                        .expiresAt(now.plusSeconds(600)).build())).getTokenValue();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TestClockConfig {
        @Bean
        @Primary
        AdjustableClock adjustableTransactionClock() {
            return new AdjustableClock();
        }
    }

    static class AdjustableClock extends Clock {
        private final AtomicReference<Instant> now = new AtomicReference<>();

        void set(Instant instant) { now.set(instant); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(instant(), zone); }
        @Override public Instant instant() { return now.get(); }
    }
}
