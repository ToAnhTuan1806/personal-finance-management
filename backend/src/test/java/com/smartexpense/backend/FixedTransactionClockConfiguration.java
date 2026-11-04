package com.smartexpense.backend;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

// Các fixture lịch/ngân sách 2026–2028 là dữ liệu quá khứ tại thời điểm test này.
@TestConfiguration(proxyBeanMethods = false)
class FixedTransactionClockConfiguration {

    @Bean
    @Primary
    Clock fixedTransactionClock() {
        return Clock.fixed(Instant.parse("2030-06-15T05:00:00Z"), ZoneOffset.UTC);
    }
}
