package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.dashboard.CategoryExpenseResponse;
import com.smartexpense.backend.dto.dashboard.DashboardSummaryResponse;
import com.smartexpense.backend.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    // GET /api/dashboard/summary?month=2026-10
    @GetMapping("/summary")
    public ResponseEntity<DashboardSummaryResponse> getSummary(
            @RequestParam String month,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(
                dashboardService.getSummary(userId, month)
        );
    }

    // GET /api/dashboard/expenses-by-category?month=2026-10
    @GetMapping("/expenses-by-category")
    public ResponseEntity<List<CategoryExpenseResponse>> getExpensesByCategory(
            @RequestParam String month,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(
                dashboardService.getExpensesByCategory(userId, month)
        );
    }
}
