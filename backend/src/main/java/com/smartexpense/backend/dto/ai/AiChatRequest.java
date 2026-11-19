package com.smartexpense.backend.dto.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;

public record AiChatRequest(
        @NotBlank(message = "Vui lòng nhập câu hỏi")
        @Size(max = 500, message = "Câu hỏi tối đa 500 ký tự") String message,
        @NotBlank(message = "Vui lòng chọn tháng")
        @Pattern(regexp = "[0-9]{4}-(0[1-9]|1[0-2])", message = "Tháng phải có định dạng YYYY-MM") String month,
        @Pattern(regexp = "[0-9]{4}-(0[1-9]|1[0-2])", message = "compareMonth phải có định dạng YYYY-MM")
        String compareMonth, @Valid Context context, Boolean previewOpenQuestions, Boolean autoSendGemini) {
    public record Context(
            @NotBlank @Pattern(regexp = "SUMMARY|CATEGORIES|BUDGET|ADVICE|COMPARISON|CATEGORY_TREND|SPENDING_INSIGHT|BUDGET_FORECAST|PURCHASE_SIMULATION") String intent,
            @NotBlank @Pattern(regexp = "[0-9]{4}-(0[1-9]|1[0-2])") String month,
            @Pattern(regexp = "[0-9]{4}-(0[1-9]|1[0-2])") String compareMonth) {
        @Override public String toString() { return "AiChatContext[redacted]"; }
    }
    public AiChatRequest(String message, String month, String compareMonth, Context context, Boolean previewOpenQuestions) {
        this(message, month, compareMonth, context, previewOpenQuestions, false);
    }
    public AiChatRequest(String message, String month, String compareMonth, Context context) {
        this(message, month, compareMonth, context, false);
    }
    public AiChatRequest(String message, String month, String compareMonth) { this(message, month, compareMonth, null); }
    public AiChatRequest(String message, String month) { this(message, month, null); }
    // Spring MVC DEBUG có thể gọi toString khi đọc body; không để prompt/PII lọt vào log.
    @Override public String toString() { return "AiChatRequest[redacted]"; }
}
