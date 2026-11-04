package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.categorybudget.CategoryBudgetLimitRequest;
import com.smartexpense.backend.dto.categorybudget.CategoryBudgetRequest;
import com.smartexpense.backend.dto.categorybudget.CategoryBudgetResponse;
import com.smartexpense.backend.service.CategoryBudgetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/category-budgets")
@RequiredArgsConstructor
public class CategoryBudgetController {

    private final CategoryBudgetService budgetService;

    @PostMapping
    public ResponseEntity<CategoryBudgetResponse> saveBudget(
            @Valid @RequestBody CategoryBudgetRequest request, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(budgetService.saveBudget(request, Long.valueOf(jwt.getSubject())));
    }

    @GetMapping
    public ResponseEntity<List<CategoryBudgetResponse>> getAll(
            @RequestParam int year, @RequestParam int month, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(budgetService.getAll(Long.valueOf(jwt.getSubject()), year, month));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CategoryBudgetResponse> getById(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(budgetService.getById(id, Long.valueOf(jwt.getSubject())));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CategoryBudgetResponse> update(
            @PathVariable Long id, @Valid @RequestBody CategoryBudgetLimitRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(budgetService.update(id, request, Long.valueOf(jwt.getSubject())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        budgetService.delete(id, Long.valueOf(jwt.getSubject()));
        return ResponseEntity.noContent().build();
    }
}
