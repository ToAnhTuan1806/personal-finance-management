package com.smartexpense.backend.dto.recurring;

import com.smartexpense.backend.enums.TransactionType;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

import java.math.BigDecimal;

// Chỉ dùng trên RecurringTemplateRequest; không đăng ký module hoặc thay đổi Jackson toàn cục.
// Null giữ nguyên để @NotNull/@Size xử lý, không biến null/missing thành false hoặc 0.
public final class RecurringTemplateJsonDeserializers {

    private RecurringTemplateJsonDeserializers() { }

    public static final class CategoryId extends ValueDeserializer<Long> {
        @Override
        public Long deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) {
                return context.reportInputMismatch(Long.class, "ID danh mục phải là JSON integer trong miền Long");
            }
            // Parser kiểm tra tràn Long; không cắt phần thập phân hoặc đọc từ string.
            return parser.getLongValue();
        }
    }

    public static final class Type extends ValueDeserializer<TransactionType> {
        @Override
        public TransactionType deserialize(JsonParser parser, DeserializationContext context) {
            if (parser.hasToken(JsonToken.VALUE_STRING)) {
                try {
                    return TransactionType.valueOf(parser.getString());
                } catch (IllegalArgumentException ignored) {
                    // Không trả lại giá trị client gửi trong thông báo lỗi.
                }
            }
            return context.reportInputMismatch(TransactionType.class,
                    "Loại giao dịch phải là JSON string INCOME hoặc EXPENSE");
        }
    }

    public static final class Amount extends ValueDeserializer<BigDecimal> {
        @Override
        public BigDecimal deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT) && !parser.hasToken(JsonToken.VALUE_NUMBER_FLOAT)) {
                return context.reportInputMismatch(BigDecimal.class, "Số tiền phải là JSON number");
            }
            return parser.getDecimalValue();
        }
    }

    public static final class DayOfMonth extends ValueDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) {
                return context.reportInputMismatch(Integer.class, "Ngày lặp phải là JSON integer");
            }
            return parser.getIntValue();
        }
    }

    public static final class Note extends ValueDeserializer<String> {
        @Override
        public String deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_STRING)) {
                return context.reportInputMismatch(String.class, "Ghi chú phải là JSON string hoặc null");
            }
            return parser.getString();
        }
    }

    public static final class Active extends ValueDeserializer<Boolean> {
        @Override
        public Boolean deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_TRUE) && !parser.hasToken(JsonToken.VALUE_FALSE)) {
                return context.reportInputMismatch(Boolean.class, "Trạng thái mẫu phải là JSON boolean true hoặc false");
            }
            return parser.hasToken(JsonToken.VALUE_TRUE);
        }
    }
}
