package com.smartexpense.backend.service;

import com.smartexpense.backend.exception.D11Exception;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

@Component
public class AiRateLimiter {
    private record Window(long started, int count) { }
    private final Map<Long, Window> windows = new HashMap<>();
    private final Clock clock;

    public AiRateLimiter() { this(Clock.systemUTC()); }
    public AiRateLimiter(Clock clock) { this.clock = clock; }

    // 10 request/phút/owner/instance; map hữu hạn, không loại entry còn hiệu lực để lách hạn mức.
    public synchronized void acquire(Long userId) {
        long now = clock.millis();
        windows.entrySet().removeIf(e -> now - e.getValue().started() >= 60_000);
        Window window = windows.get(userId);
        if (window != null && window.count() >= 10) {
            throw new D11Exception(HttpStatus.TOO_MANY_REQUESTS, "AI_RATE_LIMITED",
                    "Tối đa 10 câu hỏi mỗi phút; vui lòng thử lại sau");
        }
        if (window == null && windows.size() >= 10_000) {
            throw new D11Exception(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE", "Dịch vụ AI đang bận");
        }
        windows.put(userId, new Window(window == null ? now : window.started(),
                window == null ? 1 : window.count() + 1));
    }
}
