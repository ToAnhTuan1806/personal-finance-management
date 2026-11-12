package com.smartexpense.backend;

import com.smartexpense.backend.service.AiQueryInterpreter;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

// Fixtures D11/D13 ở tháng 11/2026: không để CI đổi kết quả khi lịch thực chuyển tháng.
@TestConfiguration(proxyBeanMethods = false)
class AiNluTestConfiguration {
    @Bean @Primary
    AiQueryInterpreter fixedAiInterpreter() {
        return new AiQueryInterpreter(Clock.fixed(Instant.parse("2026-11-12T05:00:00Z"),
                ZoneId.of("Asia/Ho_Chi_Minh")));
    }
}
