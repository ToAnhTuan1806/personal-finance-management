package com.smartexpense.backend.dto.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AiChatRequest(
        @NotBlank(message = "Vui lòng nhập câu hỏi")
        @Size(max = 500, message = "Câu hỏi tối đa 500 ký tự") String message,
        @NotBlank(message = "Vui lòng chọn tháng")
        @Pattern(regexp = "[0-9]{4}-(0[1-9]|1[0-2])", message = "Tháng phải có định dạng YYYY-MM") String month) {
    // Spring MVC DEBUG có thể gọi toString khi đọc body; không để prompt/PII lọt vào log.
    @Override public String toString() { return "AiChatRequest[redacted]"; }
}
