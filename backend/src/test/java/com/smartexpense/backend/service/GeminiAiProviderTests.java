package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatResponse.*;
import com.smartexpense.backend.exception.D11Exception;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.net.*;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

// Chỉ HTTP loopback, không gọi Google và không đọc key thật từ môi trường.
@ExtendWith(OutputCaptureExtension.class)
class GeminiAiProviderTests {
    private HttpServer server;
    private ExecutorService executor;
    private final JsonMapper json = JsonMapper.builder().build();
    private final AtomicInteger calls = new AtomicInteger();
    private final AtomicReference<String> body = new AtomicReference<>();
    private final AtomicReference<String> auth = new AtomicReference<>();
    private int responseStatus = 200;
    private String response = "{\"status\":\"completed\",\"steps\":[{\"type\":\"model_output\",\"content\":[{\"type\":\"text\",\"text\":\"Hãy theo dõi chi tiêu.\"}]}]}";

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newCachedThreadPool(); server.setExecutor(executor);
        server.createContext("/interactions", exchange -> {
            calls.incrementAndGet();
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            auth.set(exchange.getRequestHeaders().getFirst("x-goog-api-key"));
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(responseStatus, bytes.length);
            exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stop() { server.stop(0); executor.shutdownNow(); }

    @Test
    void sendsGeneralAdviceOnlyWithoutFinancialContextOrIdentifiers() throws Exception {
        assertThat(provider("fake-test-key", "test-model", Duration.ofSeconds(3)).explain("CATEGORIES", context()))
                .isEqualTo("Hãy theo dõi chi tiêu.");
        assertThat(auth.get()).isEqualTo("fake-test-key");
        var request = json.readTree(body.get());
        assertThat(request.path("model").asString()).isEqualTo("test-model");
        assertThat(request.path("store").asBoolean()).isFalse();
        assertThat(request.path("generation_config").path("max_output_tokens").asInt()).isEqualTo(1024);
        assertThat(request.path("generation_config").path("thinking_level").asString()).isEqualTo("low");
        assertThat(request.has("tools")).isFalse();
        assertThat(request.has("previous_interaction_id")).isFalse();
        assertThat(request.path("input").asString()).doesNotContain("SECRET CATEGORY", "categoryId", "userId", "fake-test-key",
                "100.10", "20.05", "80.05", "topCategories", "stats", "NOT_SET");
        assertThat(calls).hasValue(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"key", "model"})
    void missingConfigurationFailsWithoutHttp(String missing) {
        var provider = provider(missing.equals("key") ? "" : "test-key", missing.equals("model") ? "" : "test-model", Duration.ofSeconds(3));
        assertThatThrownBy(() -> provider.explain("SUMMARY", context())).isInstanceOfSatisfying(D11Exception.class, e -> {
            assertThat(e.getCode()).isEqualTo("AI_NOT_CONFIGURED"); assertThat(e.getStatusCode().value()).isEqualTo(503);
        });
        assertThat(calls).hasValue(0);
    }

    @ParameterizedTest
    @CsvSource({"429,429,AI_QUOTA_EXCEEDED", "500,503,AI_UNAVAILABLE", "503,503,AI_UNAVAILABLE", "401,502,AI_PROVIDER_ERROR"})
    void mapsUpstreamErrorsWithoutRetryOrLeakingBody(int upstream, int status, String code) {
        responseStatus = upstream; response = "SECRET PROVIDER ERROR";
        assertThatThrownBy(() -> provider("test-key", "test-model", Duration.ofSeconds(3)).explain("SUMMARY", context()))
                .isInstanceOfSatisfying(D11Exception.class, e -> {
                    assertThat(e.getCode()).isEqualTo(code); assertThat(e.getStatusCode().value()).isEqualTo(status);
                    assertThat(e.getReason()).doesNotContain("SECRET", "test-key");
                });
        assertThat(calls).hasValue(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "not-json", "{\"status\":\"in_progress\"}", "{\"status\":\"completed\",\"steps\":[]}"})
    void rejectsMalformedIncompleteAndEmptyResponses(String upstream) {
        response = upstream;
        assertThatThrownBy(() -> provider("test-key", "test-model", Duration.ofSeconds(3)).explain("SUMMARY", context()))
                .isInstanceOfSatisfying(D11Exception.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(502));
    }

    @Test
    void capsResponseBytesBeforeJsonParsing() {
        response = "x".repeat(70000);
        assertThatThrownBy(() -> provider("test-key", "test-model", Duration.ofSeconds(3)).explain("SUMMARY", context()))
                .isInstanceOfSatisfying(D11Exception.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(502));
    }

    @Test
    void capsReplyCharacters() {
        response = "{\"status\":\"completed\",\"steps\":[{\"type\":\"model_output\",\"content\":[{\"type\":\"text\",\"text\":\""
                + "x".repeat(4001) + "\"}]}]}";
        assertThatThrownBy(() -> provider("test-key", "test-model", Duration.ofSeconds(3)).explain("SUMMARY", context()))
                .isInstanceOfSatisfying(D11Exception.class, e -> assertThat(e.getCode()).isEqualTo("AI_INVALID_RESPONSE"));
    }

    @Test
    void deadlineAlsoCoversStalledResponseBody() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        server.removeContext("/interactions");
        server.createContext("/interactions", exchange -> {
            exchange.getRequestBody().readAllBytes(); calls.incrementAndGet();
            exchange.sendResponseHeaders(200, 100);
            exchange.getResponseBody().write('{'); exchange.getResponseBody().flush();
            try { release.await(4, TimeUnit.SECONDS); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            finally { exchange.close(); }
        });
        try {
            assertThatThrownBy(() -> provider("test-key", "test-model", Duration.ofMillis(750)).explain("SUMMARY", context()))
                    .isInstanceOfSatisfying(D11Exception.class, e -> assertThat(e.getCode()).isEqualTo("AI_TIMEOUT"));
            assertThat(calls).hasValue(1);
        } finally { release.countDown(); }
    }

    @Test
    @SuppressWarnings("unchecked")
    void defaultDeadlineIs25SecondsAndCancelsTimedOutRequestWithoutRetry() throws Exception {
        HttpClient client = mock(HttpClient.class);
        CompletableFuture<HttpResponse<byte[]>> pending = mock(CompletableFuture.class);
        when(client.sendAsync(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenAnswer(call -> {
            HttpRequest request = call.getArgument(0);
            assertThat(request.timeout()).contains(Duration.ofSeconds(25));
            return pending;
        });
        when(pending.get(25_000L, TimeUnit.MILLISECONDS)).thenThrow(new TimeoutException());
        var provider = new GeminiAiProvider(client, json, "test-key", "test-model",
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/interactions"));

        assertThatThrownBy(() -> provider.explain("SUMMARY", context()))
                .isInstanceOfSatisfying(D11Exception.class, e -> {
                    assertThat(e.getCode()).isEqualTo("AI_TIMEOUT");
                    assertThat(e.getStatusCode().value()).isEqualTo(504);
                });
        verify(pending).get(25_000L, TimeUnit.MILLISECONDS);
        verify(pending).cancel(true);
        verify(client, times(1)).sendAsync(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void doesNotLogSensitiveKeyContextOrProviderErrorBody(CapturedOutput output) {
        String privateKey = "D11_PRIVATE_FAKE_PROVIDER_KEY";
        responseStatus = 503;
        response = "SECRET CATEGORY " + privateKey;
        assertThatThrownBy(() -> provider(privateKey, "test-model", Duration.ofSeconds(3)).explain("SUMMARY", context()))
                .isInstanceOfSatisfying(D11Exception.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(503);
                    assertThat(e.getCode()).isEqualTo("AI_UNAVAILABLE");
                    assertThat(e.getMessage()).doesNotContain(privateKey, "SECRET CATEGORY");
                });
        assertThat(output).doesNotContain(privateKey, "SECRET CATEGORY");
        assertThat(calls).hasValue(1);
    }

    @Test
    void limiterIsPerOwnerExpiresAndCountsConcurrentRequests() throws Exception {
        AtomicLong millis = new AtomicLong(0);
        Clock clock = new Clock() {
            public ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(ZoneId zone) { return this; }
            public Instant instant() { return Instant.ofEpochMilli(millis.get()); }
        };
        var limiter = new AiRateLimiter(clock);
        AtomicInteger accepted = new AtomicInteger();
        var tasks = new java.util.ArrayList<Future<?>>();
        for (int i = 0; i < 30; i++) tasks.add(executor.submit(() -> {
            try { limiter.acquire(7L); accepted.incrementAndGet(); }
            catch (D11Exception e) { assertThat(e.getCode()).isEqualTo("AI_RATE_LIMITED"); }
        }));
        for (var task : tasks) task.get(3, TimeUnit.SECONDS);
        assertThat(accepted).hasValue(10);
        assertThatCode(() -> limiter.acquire(8L)).doesNotThrowAnyException();
        millis.set(60000);
        assertThatCode(() -> limiter.acquire(7L)).doesNotThrowAnyException();
    }

    private GeminiAiProvider provider(String key, String model, Duration timeout) {
        return new GeminiAiProvider(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build(), json, key, model,
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/interactions"), timeout);
    }

    private AiFinancialContextService.Context context() {
        return new AiFinancialContextService.Context(new Stats(new BigDecimal("100.10"), new BigDecimal("20.05"), new BigDecimal("80.05")),
                List.of(new TopCategory(999L, "SECRET CATEGORY", new BigDecimal("20.05"), new BigDecimal("100.00"))), null);
    }
}
