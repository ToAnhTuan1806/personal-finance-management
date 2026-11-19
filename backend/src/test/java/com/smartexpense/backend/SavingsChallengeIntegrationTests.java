package com.smartexpense.backend;

import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.repository.UserRepository;
import com.smartexpense.backend.service.SavingsChallengeService;
import com.smartexpense.backend.dto.SavingsDtos.Saving;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.time.*;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;
import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = BackendApplication.class, properties = {
    "spring.config.location=classpath:/application-d03-test.properties", "GEMINI_API_KEY=", "GEMINI_MODEL="
})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import(MySqlIntegrationTestSupport.IsolatedDataSource.class)
class SavingsChallengeIntegrationTests extends MySqlIntegrationTestSupport {
    private static final String ENDPOINT = "/api/savings-challenges";
    private static final String START = """
            {"id":"challenge-1","title":"Quỹ mua sách","target":500000,"days":30,"level":"medium"}
            """;
    @Autowired DataSource dataSource;
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired SavingsChallengeService service;
    @MockitoBean Clock clock;
    private User owner;

    @BeforeEach void setup() throws Exception {
        verifyMySqlConnection();
        new ResourceDatabasePopulator(new FileSystemResource(
                "../database/migrations/V008__create_savings_challenges.sql")).execute(dataSource);
        today("2026-11-19T17:00:00Z");
        owner = newUser();
    }

    @Test void startsImmediatelyAndPersistsProgressAndRewardForAnotherSession() throws Exception {
        mvc.perform(get(ENDPOINT)).andExpect(status().isUnauthorized());
        start();
        start(); // Retry uses the same key and returns the original challenge.
        mvc.perform(put(ENDPOINT + "/reward").with(auth(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"useGoldenPig\":true}")).andExpect(status().isConflict());

        save(owner, "entry-1", 300000, "2026-11-20").andExpect(status().isOk())
                .andExpect(jsonPath("$.savings.length()").value(1));
        save(owner, "entry-1", 300000, "2026-11-20").andExpect(status().isOk())
                .andExpect(jsonPath("$.savings.length()").value(1));
        save(owner, "entry-2", 200000, "2026-11-20").andExpect(status().isOk())
                .andExpect(jsonPath("$.savings.length()").value(2));
        save(owner, "entry-3", 1, "2026-11-20").andExpect(status().isConflict());

        mvc.perform(put(ENDPOINT + "/reward").with(auth(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"useGoldenPig\":true}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.unlocked").value(true));
        mvc.perform(get(ENDPOINT).with(auth(owner))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.challenges.length()").value(1))
                .andExpect(jsonPath("$.challenges[0].savings[0].amount").value(300000))
                .andExpect(jsonPath("$.reward.useGoldenPig").value(true));
        mvc.perform(get(ENDPOINT + "/reward").with(auth(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.useGoldenPig").value(true));
    }

    @Test void isolatesAccountsAndRejectsFutureOrExpiredRecords() throws Exception {
        start();
        User other = newUser();
        save(other, "foreign", 1, "2026-11-20").andExpect(status().isNotFound());
        mvc.perform(get(ENDPOINT).with(auth(other))).andExpect(status().isOk())
                .andExpect(jsonPath("$.challenges.length()").value(0));
        save(owner, "future", 10, "2026-11-21").andExpect(status().isBadRequest());
        save(owner, "before-start", 10, "2026-11-19").andExpect(status().isBadRequest());
        today("2026-12-19T17:00:00Z");
        save(owner, "late", 10, "2026-12-19").andExpect(status().isConflict());
        assertThat(service.overview(owner.getId()).challenges().getFirst().savings()).isEmpty();
    }

    @Test void mergesLegacyEntriesIdempotentlyAndRollsBackInvalidImports() throws Exception {
        String legacy = """
                {"id":"old-1","title":"Mục tiêu cũ","target":500000,"level":"hard",
                 "startDate":"2026-10-01","endDate":"2026-10-30","savings":[
                  {"id":"old-entry","amount":300000,"date":"2026-10-15","note":"Đã để dành"}
                 ]}
                """;
        for (int repetition = 0; repetition < 2; repetition++) {
            mvc.perform(post(ENDPOINT + "/import").with(auth(owner)).contentType(MediaType.APPLICATION_JSON).content(legacy))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.startDate").value("2026-10-01"))
                    .andExpect(jsonPath("$.savings.length()").value(1));
        }
        String invalid = legacy.replace("old-1", "invalid-2").replace("2026-10-15", "2026-10-31");
        mvc.perform(post(ENDPOINT + "/import").with(auth(owner)).contentType(MediaType.APPLICATION_JSON).content(invalid))
                .andExpect(status().isBadRequest());
        assertThat(service.overview(owner.getId()).challenges()).extracting("id").containsExactly("old-1");
    }

    @Test void concurrentRetryRecordsOneContribution() throws Exception {
        start();
        var entered = new CountDownLatch(1);
        var saving = new Saving("same-key", 100_000L, LocalDate.of(2026, 11, 20), "");
        try (var executor = Executors.newFixedThreadPool(2)) {
            var calls = java.util.stream.IntStream.range(0, 2).mapToObj(i -> executor.submit(() -> {
                entered.await();
                return service.record(owner.getId(), "challenge-1", saving);
            })).toList();
            entered.countDown();
            for (var call : calls) assertThat(call.get(15, SECONDS).savings()).hasSize(1);
        }
        assertThat(service.overview(owner.getId()).challenges().getFirst().savings()).hasSize(1);
    }

    private void start() throws Exception {
        mvc.perform(post(ENDPOINT).with(auth(owner)).contentType(MediaType.APPLICATION_JSON).content(START))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.startDate").value("2026-11-20"))
                .andExpect(jsonPath("$.endDate").value("2026-12-19"));
    }

    private org.springframework.test.web.servlet.ResultActions save(User user, String key, long amount, String date) throws Exception {
        String json = """
                {"id":"%s","amount":%d,"date":"%s","note":"để dành"}
                """.formatted(key, amount, date);
        return mvc.perform(post(ENDPOINT + "/challenge-1/savings").with(auth(user))
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private void today(String instant) {
        when(clock.withZone(any(ZoneId.class))).thenAnswer(call -> Clock.fixed(Instant.parse(instant), call.getArgument(0)));
    }

    private User newUser() {
        var user = new User();
        user.setFullName("Savings test");
        user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash("unused-test-hash");
        return users.saveAndFlush(user);
    }

    private static RequestPostProcessor auth(User user) {
        return jwt().jwt(token -> token.subject(user.getId().toString()));
    }
}
