package com.smartexpense.backend.security;

import org.springframework.stereotype.Component;
import java.time.*;
import java.util.HashMap;
import java.util.Map;

// Giới hạn theo instance; không khóa tài khoản và không lưu email plaintext.
@Component
public class PasswordResetRateLimiter {
    private static final int CAPACITY = 10_000;
    private static final Duration WINDOW = Duration.ofMinutes(15);
    private final Clock clock;
    private final Map<String, Counter> counters = new HashMap<>();

    public PasswordResetRateLimiter(Clock clock) { this.clock = clock; }

    public synchronized boolean allow(String key, int limit) {
        Instant now = clock.instant();
        Counter counter = counters.get(key);
        if (counter == null || !now.isBefore(counter.until)) {
            counters.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().until));
            if (counters.size() >= CAPACITY) return false;
            counter = new Counter(now.plus(WINDOW));
            counters.put(key, counter);
        }
        if (counter.count >= limit) return false;
        counter.count++;
        return true;
    }

    private static final class Counter {
        private final Instant until;
        private int count;
        private Counter(Instant until) { this.until = until; }
    }
}
