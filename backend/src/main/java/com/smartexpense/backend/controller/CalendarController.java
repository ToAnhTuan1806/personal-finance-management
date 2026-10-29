package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.calendar.CalendarMonthResponse;
import com.smartexpense.backend.service.CalendarService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// Trả lịch tháng của tài khoản đăng nhập, giữ nguyên các API Dashboard hiện có.
@RestController
@RequestMapping("/api/calendar")
@RequiredArgsConstructor
public class CalendarController {

    private final CalendarService calendarService;

    @GetMapping("/month")
    public ResponseEntity<CalendarMonthResponse> getMonth(
            @RequestParam int year, @RequestParam int month, @AuthenticationPrincipal Jwt jwt) {
        // Chỉ dùng subject đã xác thực; userId gửi qua query không quyết định chủ sở hữu.
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(calendarService.getMonth(userId, year, month));
    }
}
