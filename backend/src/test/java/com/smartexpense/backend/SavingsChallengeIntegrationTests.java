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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.imageio.ImageIO;
import javax.sql.DataSource;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.math.BigDecimal;
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
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired SavingsChallengeService service;
    @MockitoBean Clock clock;
    private User owner;

    @BeforeEach void setup() throws Exception {
        verifyMySqlConnection();
        applyMigration("V008__create_savings_challenges.sql");
        // Fixture MySQL cô lập: mỗi ca tự chọn thời điểm áp dụng migration tùy chọn.
        jdbc.execute("DROP TABLE IF EXISTS savings_challenge_covers");
        jdbc.execute("DROP TABLE IF EXISTS savings_fund_movements");
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


    @Test void optionalCoverUsesPrivateEndpointAndCanBeRetried() throws Exception {
        applyMigration("V009__create_savings_challenge_covers.sql");
        mvc.perform(get(ENDPOINT).with(auth(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.coverUploadEnabled").value(true));
        String cover = jpegData(40, 30);
        String payload = withCover(START, cover);
        for (int repeat = 0; repeat < 2; repeat++) {
            mvc.perform(post(ENDPOINT).with(auth(owner)).contentType(MediaType.APPLICATION_JSON).content(payload))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.hasCover").value(true))
                    .andExpect(jsonPath("$.coverImage").doesNotExist());
        }
        mvc.perform(post(ENDPOINT).with(auth(owner)).contentType(MediaType.APPLICATION_JSON)
                .content(withCover(START, jpegData(41, 30)))).andExpect(status().isConflict());

        var result = mvc.perform(get(ENDPOINT + "/challenge-1/cover").with(auth(owner)))
                .andExpect(status().isOk()).andExpect(content().contentType(MediaType.IMAGE_JPEG))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn();
        assertThat(ImageIO.read(new ByteArrayInputStream(result.getResponse().getContentAsByteArray())).getWidth())
                .isEqualTo(40);
        mvc.perform(get(ENDPOINT + "/challenge-1/cover")).andExpect(status().isUnauthorized());
        mvc.perform(get(ENDPOINT + "/challenge-1/cover").with(auth(newUser()))).andExpect(status().isNotFound());
        mvc.perform(get(ENDPOINT).with(auth(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.challenges.length()").value(1))
                .andExpect(jsonPath("$.challenges[0].hasCover").value(true));
        save(owner, "entry-with-cover", 100, "2026-11-20")
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasCover").value(true));
    }

    @Test void invalidCoverDoesNotCreateChallenge() throws Exception {
        applyMigration("V009__create_savings_challenge_covers.sql");
        for (String cover : new String[]{"data:image/jpeg;base64,bm90IGFuIGltYWdl", jpegData(961, 3)}) {
            mvc.perform(post(ENDPOINT).with(auth(owner)).contentType(MediaType.APPLICATION_JSON)
                    .content(withCover(START, cover))).andExpect(status().isBadRequest());
        }
        assertThat(service.overview(owner.getId()).challenges()).isEmpty();
    }

    @Test void creationWithoutCoverWorksBeforeV009() throws Exception {
        mvc.perform(get(ENDPOINT).with(auth(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.coverUploadEnabled").value(false));
        mvc.perform(post(ENDPOINT).with(auth(owner)).contentType(MediaType.APPLICATION_JSON)
                .content(withCover(START, jpegData(40, 30)))).andExpect(status().isServiceUnavailable());
        assertThat(service.overview(owner.getId()).challenges()).isEmpty();
        start();
        mvc.perform(get(ENDPOINT).with(auth(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.challenges[0].hasCover").value(false));
    }

    @Test void tracksFundsSeparatelyFromLegacyProgressAndIncomeExpense() throws Exception {
        start();
        save(owner, "legacy", 100_000, "2026-11-20").andExpect(status().isOk());
        mvc.perform(get(ENDPOINT + "/funds").with(auth(owner))).andExpect(status().isNoContent());
        deposit("pre-migration", 1).andExpect(status().isServiceUnavailable());

        applyMigration("V010__create_savings_fund_movements.sql");
        applyMigration("V010__create_savings_fund_movements.sql");
        ledger(owner, "INCOME", "6000000.25", "2026-10-10");
        ledger(owner, "EXPENSE", "1000000", "2026-11-20");
        ledger(owner, "INCOME", "9999999", "2027-01-01");
        mvc.perform(get(ENDPOINT + "/funds")).andExpect(status().isUnauthorized());
        mvc.perform(get(ENDPOINT + "/funds").with(auth(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalBalance").value(5000000.25))
                .andExpect(jsonPath("$.reservedBalance").value(0));
        var other = newUser();
        withdraw(other, "foreign", 1).andExpect(status().isNotFound());
        deposit("too-large", 6_000_000).andExpect(status().isConflict());

        for (int retry = 0; retry < 2; retry++) {
            deposit("fund-1", 400_000).andExpect(status().isOk())
                    .andExpect(jsonPath("$.challenge.fundBalance").value(400_000))
                    .andExpect(jsonPath("$.challenge.savings.length()").value(2))
                    .andExpect(jsonPath("$.funds.availableBalance").value(4600000.25))
                    .andExpect(jsonPath("$.reward.unlocked").value(true));
        }
        deposit("fund-1", 400_001).andExpect(status().isConflict());
        withdraw(owner, "over-limit", 400_001).andExpect(status().isConflict());

        today("2026-12-19T17:00:00Z");
        withdraw(owner, "withdraw-1", 400_000).andExpect(status().isOk())
                .andExpect(jsonPath("$.challenge.fundBalance").value(0))
                .andExpect(jsonPath("$.challenge.completedOn").value("2026-11-20"))
                .andExpect(jsonPath("$.challenge.withdrawals[0].date").value("2026-12-20"))
                .andExpect(jsonPath("$.challenge.withdrawals[0].amount").value(400_000))
                .andExpect(jsonPath("$.funds.availableBalance").value(5000000.25))
                .andExpect(jsonPath("$.reward.unlocked").value(true));
        today("2026-12-20T17:00:00Z");
        withdraw(owner, "withdraw-1", 400_000).andExpect(status().isOk())
                .andExpect(jsonPath("$.challenge.withdrawals.length()").value(1))
                .andExpect(jsonPath("$.challenge.withdrawals[0].date").value("2026-12-20"));
        mvc.perform(get(ENDPOINT).with(auth(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.challenges[0].savings[0].amount").value(100_000))
                .andExpect(jsonPath("$.funds.reservedBalance").value(0))
                .andExpect(jsonPath("$.reward.unlocked").value(true));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM transactions WHERE user_id = ?", Long.class, owner.getId()))
                .isEqualTo(3L);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM savings_fund_movements", Long.class))
                .isEqualTo(2L);
    }

    @Test void concurrentDepositsAcrossChallengesCannotSpendTheSameBalance() throws Exception {
        applyMigration("V010__create_savings_fund_movements.sql");
        start();
        mvc.perform(post(ENDPOINT).with(auth(owner)).contentType(MediaType.APPLICATION_JSON)
                .content(START.replace("challenge-1", "challenge-2"))).andExpect(status().isOk());
        ledger(owner, "INCOME", "500000", "2026-11-20");
        var entered = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var calls = java.util.stream.IntStream.rangeClosed(1, 2).mapToObj(i -> executor.submit(() -> {
                entered.await();
                try {
                    service.deposit(owner.getId(), "challenge-" + i,
                            new Saving("deposit-" + i, 300_000L, LocalDate.of(2026, 11, 20), ""));
                    return 200;
                } catch (org.springframework.web.server.ResponseStatusException rejected) {
                    return rejected.getStatusCode().value();
                }
            })).toList();
            entered.countDown();
            assertThat(java.util.List.of(calls.get(0).get(15, SECONDS), calls.get(1).get(15, SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
        }
        assertThat(service.funds(owner.getId()).availableBalance()).isEqualByComparingTo("200000");
    }

    private org.springframework.test.web.servlet.ResultActions deposit(String key, long amount) throws Exception {
        return mvc.perform(post(ENDPOINT + "/challenge-1/fund/deposits").with(auth(owner))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"id":"%s","amount":%d,"date":"2026-11-20","note":"để dành"}
                        """.formatted(key, amount)));
    }

    private org.springframework.test.web.servlet.ResultActions withdraw(User user, String key, long amount) throws Exception {
        return mvc.perform(post(ENDPOINT + "/challenge-1/fund/withdrawals").with(auth(user))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"id":"%s","amount":%d,"note":"về số dư"}
                        """.formatted(key, amount)));
    }

    private void ledger(User user, String type, String amount, String date) {
        jdbc.update("INSERT INTO categories (user_id, name, type, created_at) VALUES (?, ?, ?, NOW())",
                user.getId(), "Savings " + date, type);
        Long category = jdbc.queryForObject("SELECT id FROM categories WHERE user_id = ? AND name = ?", Long.class,
                user.getId(), "Savings " + date);
        jdbc.update("""
                INSERT INTO transactions (user_id, category_id, type, amount, transaction_date, note, created_at)
                VALUES (?, ?, ?, ?, ?, '', NOW())
                """, user.getId(), category, type, new BigDecimal(amount), LocalDate.parse(date));
    }

    private void applyMigration(String filename) {
        new ResourceDatabasePopulator(new FileSystemResource("../database/migrations/" + filename)).execute(dataSource);
    }

    private static String withCover(String payload, String dataUrl) {
        int end = payload.lastIndexOf('}');
        return payload.substring(0, end) + ",\"coverImage\":\"" + dataUrl + "\"}";
    }

    private static String jpegData(int width, int height) throws Exception {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(image, "jpeg", bytes);
        return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(bytes.toByteArray());
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
