package com.smartexpense.backend.dto.recurring;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

// Giới hạn trên DTO D09, không thay đổi coercion của các API hiện có.
public final class RecurringPeriodIntegerDeserializer extends ValueDeserializer<Integer> {
    @Override
    public Integer deserialize(JsonParser parser, DeserializationContext context) {
        if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) {
            return context.reportInputMismatch(Integer.class, "Năm/tháng phải là JSON integer");
        }
        return parser.getIntValue();
    }
}
