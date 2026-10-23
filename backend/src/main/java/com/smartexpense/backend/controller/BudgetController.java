package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.budget.BudgetRequest;
import com.smartexpense.backend.dto.budget.BudgetResponse;
import com.smartexpense.backend.service.BudgetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/budgets")
@RequiredArgsConstructor
public class BudgetController {

    private final BudgetService budgetService;

    // GET - Xem ngân sách theo năm và tháng
    @GetMapping("/{year}/{month}")
    public ResponseEntity<BudgetResponse> getBudget(
            @PathVariable int year,
            @PathVariable int month,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(
                budgetService.getBudget(userId, year, month)
        );
    }

    // PUT - Tạo mới hoặc cập nhật ngân sách
    @PutMapping("/{year}/{month}")
    public ResponseEntity<BudgetResponse> saveBudget(
            @PathVariable int year,
            @PathVariable int month,
            @Valid @RequestBody BudgetRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(
                budgetService.saveBudget(userId, year, month, request)
        );
    }

    // DELETE - Xóa ngân sách của tháng
    @DeleteMapping("/{year}/{month}")
    public ResponseEntity<Void> deleteBudget(
            @PathVariable int year,
            @PathVariable int month,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        budgetService.deleteBudget(userId, year, month);
        return ResponseEntity.noContent().build();
    }
}
