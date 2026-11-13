package com.smartexpense.backend.service;

import com.smartexpense.backend.exception.D11Exception;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.Flow;

@Component
public class GeminiAiProvider implements AiProvider {
    private static final int MAX_BODY_BYTES = 65_536;
    private static final int MAX_REPLY_CHARS = 4_000;
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(25);
    private static final String INSTRUCTION = """
            Bạn là trợ lý quản lý chi tiêu cá nhân. Trả lời ngắn gọn bằng tiếng Việt.
            Chỉ tư vấn chung về quản lý chi tiêu, lập kế hoạch ngân sách và tiết kiệm.
            Không có dữ liệu tài khoản, ngân sách hoặc giao dịch nào được cung cấp cho bạn.
            Không nêu số tiền, tỷ lệ hoặc kết luận về tình hình tài chính cá nhân của người dùng.
            Không nói đã kiểm tra tài khoản, không suy ra ngân sách chưa thiết lập từ dữ liệu vắng mặt.
            Không cam kết lợi nhuận, không khẳng định kết quả tài chính chắc chắn.
            Không có quyền truy cập tài khoản khác hoặc tạo/sửa/xóa dữ liệu. Không gọi công cụ.
            Khuyến nghị chỉ là tham khảo. Không đưa lời khuyên đầu tư cụ thể.
            """;
    private final HttpClient client;
    private final JsonMapper json;
    private final String key;
    private final String model;
    private final URI endpoint;
    private final Duration timeout;
    private final Semaphore requests = new Semaphore(8);

    @Autowired
    public GeminiAiProvider(JsonMapper json, @Value("${GEMINI_API_KEY:}") String key,
                            @Value("${GEMINI_MODEL:}") String model) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                        .followRedirects(HttpClient.Redirect.NEVER).build(), json, key, model,
                URI.create("https://generativelanguage.googleapis.com/v1/interactions"));
    }

    // Constructor package-private cho HTTP stub local; endpoint không nhận từ client/runtime config.
    GeminiAiProvider(HttpClient client, JsonMapper json, String key, String model, URI endpoint) {
        this(client, json, key, model, endpoint, REQUEST_TIMEOUT);
    }

    GeminiAiProvider(HttpClient client, JsonMapper json, String key, String model, URI endpoint, Duration timeout) {
        this.client = client;
        this.json = json;
        this.key = key;
        this.model = model;
        this.endpoint = endpoint;
        this.timeout = timeout;
    }

    @Override
    public String explain(String intent, AiFinancialContextService.Context context) {
        if (key.isBlank() || model.isBlank()) {
            throw error(HttpStatus.SERVICE_UNAVAILABLE, "AI_NOT_CONFIGURED", "Dịch vụ AI chưa được cấu hình");
        }
        if (!requests.tryAcquire()) {
            throw error(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE", "Dịch vụ AI đang bận");
        }
        CompletableFuture<HttpResponse<byte[]>> pending = null;
        try {
            // Chỉ ADVICE đi qua provider; financial facts luôn do Backend định dạng.
            // Không gửi context, raw prompt, ID, note, email hoặc JWT; không có tools/history.
            String input = "Hãy đưa ra vài gợi ý chung, ngắn gọn bằng tiếng Việt về quản lý chi tiêu, "
                    + "lập kế hoạch ngân sách và tiết kiệm. Đây không phải đánh giá tài khoản của người dùng.";
            String body = json.writeValueAsString(Map.of("model", model, "store", false,
                    "input", input, "system_instruction", INSTRUCTION,
                    "generation_config", Map.of("max_output_tokens", 1024, "thinking_level", "low")));
            var request = HttpRequest.newBuilder(endpoint).timeout(timeout)
                    .header("Content-Type", "application/json").header("x-goog-api-key", key)
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            pending = client.sendAsync(request, info -> new LimitedBodySubscriber());
            // Deadline bao gồm cả thời gian nhận body; không chỉ chờ response headers.
            var response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (response.statusCode() == 429) {
                throw error(HttpStatus.TOO_MANY_REQUESTS, "AI_QUOTA_EXCEEDED", "Dịch vụ AI đã hết hạn mức; vui lòng thử lại sau");
            }
            if (response.statusCode() >= 500) {
                throw error(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE", "Dịch vụ AI tạm thời không khả dụng");
            }
            if (response.statusCode() != 200) {
                throw error(HttpStatus.BAD_GATEWAY, "AI_PROVIDER_ERROR", "Không thể nhận phản hồi từ dịch vụ AI");
            }
            var root = json.readTree(response.body());
            if (!root.path("status").asString().equals("completed")) {
                throw error(HttpStatus.BAD_GATEWAY, "AI_INVALID_RESPONSE", "Dịch vụ AI chưa trả lời hoàn chỉnh");
            }
            var reply = new StringBuilder();
            for (var step : root.path("steps")) {
                if (!step.path("type").asString().equals("model_output")) continue;
                for (var content : step.path("content")) {
                    if (content.path("type").asString().equals("text")) {
                        if (!reply.isEmpty()) reply.append('\n');
                        reply.append(content.path("text").asString());
                    }
                }
            }
            if (reply.toString().isBlank() || reply.length() > MAX_REPLY_CHARS) {
                throw error(HttpStatus.BAD_GATEWAY, "AI_INVALID_RESPONSE", "Phản hồi AI không hợp lệ hoặc quá dài");
            }
            return reply.toString();
        } catch (D11Exception exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw error(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE", "Yêu cầu AI đã bị gián đoạn");
        } catch (Exception exception) {
            Throwable cause = exception;
            while (cause.getCause() != null) cause = cause.getCause();
            if (cause instanceof TimeoutException || cause instanceof HttpTimeoutException) {
                throw error(HttpStatus.GATEWAY_TIMEOUT, "AI_TIMEOUT", "Dịch vụ AI phản hồi quá thời gian cho phép");
            }
            // Không trả/log body provider, exception hay request chứa key/dữ liệu tài chính.
            throw error(HttpStatus.BAD_GATEWAY, "AI_PROVIDER_ERROR", "Không thể nhận phản hồi hợp lệ từ dịch vụ AI");
        } finally {
            if (pending != null && !pending.isDone()) pending.cancel(true);
            requests.release();
        }
    }

    private static D11Exception error(HttpStatus status, String code, String message) {
        return new D11Exception(status, code, message);
    }

    private static class LimitedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream body = new ByteArrayOutputStream();
        private Flow.Subscription subscription;

        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            subscription.request(1);
        }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                if (buffer.remaining() > MAX_BODY_BYTES - body.size()) {
                    subscription.cancel();
                    result.completeExceptionally(new IllegalStateException("Provider response too large"));
                    return;
                }
                byte[] bytes = new byte[buffer.remaining()];
                buffer.get(bytes);
                body.writeBytes(bytes);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable throwable) { result.completeExceptionally(throwable); }
        @Override public void onComplete() { result.complete(body.toByteArray()); }
    }
}
