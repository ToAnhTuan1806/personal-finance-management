package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatRequest;
import java.text.Normalizer;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class AiGeminiReviews {
    private static final Pattern SECRET_TERMS = Pattern.compile(
            "\\b(?:mat khau|password|passcode|otp|ma pin|cccd|cmnd|ho chieu|can cuoc|dia chi nha"
                    + "|so (?:tai khoan|the|dien thoai)|api[ _-]?key|access[ _-]?token|bearer|jwt|private[ _-]?key)\\b");
    private static final Pattern EMAIL = Pattern.compile("[\\p{L}\\p{N}._%+\\-]+@[\\p{L}\\p{N}.\\-]+\\.[\\p{L}\\p{N}]{2,}");
    private static final Pattern LINK = Pattern.compile("(?i)\\b(?:https?://|www\\.)\\S+");
    private static final Pattern IDENTIFIER = Pattern.compile(
            "(?i)\\b(?:eyJ[\\w.-]{16,}|AIza[\\w-]{16,}|sk-[\\w-]{12,}|[a-z0-9_\\-]{25,})\\b");
    private static final Pattern LONG_NUMBER = Pattern.compile("(?<!\\d)\\d(?:[ .()\\-]*\\d){7,}(?!\\d)");
    private static final Pattern AMOUNT = Pattern.compile(
            "(?iu)(?<![\\p{L}\\p{N}])\\d+(?:[.,]\\d+)*(?:\\h*(?:triệu|tr|nghìn|ngàn|k|đồng|vnd|₫|đ))(?![\\p{L}\\p{N}])");

    private final Map<Long, Pending> pending = new HashMap<>();

    public static final class ApprovedQuestion {
        private final String text;

        private ApprovedQuestion(String text) { this.text = text; }

        String text() { return text; }

        @Override public String toString() { return "ApprovedQuestion[redacted]"; }
    }

    public record Preview(UUID id, String text) {
        @Override public String toString() { return "GeminiPreview[redacted]"; }
    }

    record Pending(Preview preview, String month, String compareMonth, Instant expiresAt) {
        ApprovedQuestion approvedQuestion() { return new ApprovedQuestion(preview.text()); }
    }

    private static String filter(String message, boolean automatic) {
        String text = Normalizer.normalize(message, Normalizer.Form.NFKC)
                .replaceAll("\\p{Cf}", "").replaceAll("[\\p{Cc}\\s]+", " ").strip();
        if (SECRET_TERMS.matcher(AiQueryInterpreter.normalize(text)).find()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hãy bỏ thông tin đăng nhập hoặc định danh trước khi hỏi Gemini");
        }
        if (automatic && (EMAIL.matcher(text).find() || LINK.matcher(text).find()
                || IDENTIFIER.matcher(text).find() || LONG_NUMBER.matcher(text).find())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Hãy bỏ email, liên kết và dãy số hoặc mã định danh trước khi hỏi Gemini");
        }
        text = EMAIL.matcher(text).replaceAll("[email đã ẩn]");
        text = LINK.matcher(text).replaceAll("[liên kết đã ẩn]");
        text = IDENTIFIER.matcher(text).replaceAll("[mã đã ẩn]");
        text = LONG_NUMBER.matcher(text).replaceAll("[số đã ẩn]");
        return AMOUNT.matcher(text).replaceAll("[số tiền đã ẩn]");
    }

    ApprovedQuestion filterForAutomaticSend(String message) {
        return new ApprovedQuestion(filter(message, true));
    }

    synchronized Preview prepare(Long userId, AiChatRequest request, Instant now) {
        String text = filter(request.message(), false);
        pending.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(now));
        if (pending.size() >= 10_000 && !pending.containsKey(userId)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Hiện chưa thể tạo bản xem trước. Vui lòng thử lại");
        }
        var preview = new Preview(UUID.randomUUID(), text);
        pending.put(userId, new Pending(preview, request.month(), request.compareMonth(), now.plusSeconds(120)));
        return preview;
    }

    synchronized Pending consume(Long userId, UUID previewId, Instant now) {
        var item = pending.get(userId);
        if (item == null || !item.expiresAt().isAfter(now) || !item.preview().id().equals(previewId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bản xem trước đã hết hạn hoặc không hợp lệ. Hãy xem lại câu hỏi");
        }
        pending.remove(userId);
        return item;
    }
}
