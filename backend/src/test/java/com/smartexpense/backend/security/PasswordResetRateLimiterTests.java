package com.smartexpense.backend.security;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.assertj.core.api.Assertions.*;

class PasswordResetRateLimiterTests {
    @Test
    void windowExpiresAtExactlyFifteenMinutes() {
        AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-10T00:00:00Z"));
        Clock clock = new Clock() {
            public ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(ZoneId zone) { return this; }
            public Instant instant() { return now.get(); }
        };
        var limiter = new PasswordResetRateLimiter(clock);
        assertThat(limiter.allow("ip", 1)).isTrue(); assertThat(limiter.allow("ip", 1)).isFalse();
        now.updateAndGet(time -> time.plusSeconds(899)); assertThat(limiter.allow("ip", 1)).isFalse();
        now.updateAndGet(time -> time.plusSeconds(1)); assertThat(limiter.allow("ip", 1)).isTrue();
    }

    @Test
    void countersStayBoundedAndDoNotEvictActiveLimits() {
        var limiter = new PasswordResetRateLimiter(Clock.fixed(Instant.now(), ZoneOffset.UTC));
        for (int i = 0; i < 10_000; i++) assertThat(limiter.allow("ip" + i, 1)).isTrue();
        assertThat(limiter.allow("over-capacity", 1)).isFalse();
        assertThat(limiter.allow("ip0", 1)).isFalse();
    }

    @Test
    void concurrentAttemptsDoNotExceedQuota() throws Exception {
        var limiter = new PasswordResetRateLimiter(Clock.systemUTC());
        try (ExecutorService workers = Executors.newFixedThreadPool(8)) {
            CountDownLatch start = new CountDownLatch(1); AtomicInteger allowed = new AtomicInteger();
            var tasks = new java.util.ArrayList<Future<?>>();
            for (int i = 0; i < 100; i++) tasks.add(workers.submit(() -> {
                start.await(); if (limiter.allow("same-ip", 10)) allowed.incrementAndGet(); return null;
            }));
            start.countDown(); for (var task : tasks) task.get(3, TimeUnit.SECONDS);
            assertThat(allowed.get()).isEqualTo(10);
        }
    }
}
