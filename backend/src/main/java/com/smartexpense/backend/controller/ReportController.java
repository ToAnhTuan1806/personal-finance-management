package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.report.MonthlyReportResponse;
import com.smartexpense.backend.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/monthly")
    public ResponseEntity<MonthlyReportResponse> getMonthlyReport(
            @RequestParam String from,
            @RequestParam String to,
            @AuthenticationPrincipal Jwt jwt) {
        // Owner chỉ lấy từ JWT đã qua bộ lọc xác thực hiện có.
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(reportService.getMonthlyReport(userId, from, to));
    }
}
