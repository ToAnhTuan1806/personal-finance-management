package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.category.CategoryRequest;
import com.smartexpense.backend.dto.category.CategoryResponse;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.service.CategoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    // GET /api/categories?type=EXPENSE
    @GetMapping
    public ResponseEntity<List<CategoryResponse>> getAll(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) TransactionType type) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(
                categoryService.getAll(userId, type)
        );
    }

    // GET /api/categories/{id}
    @GetMapping("/{id}")
    public ResponseEntity<CategoryResponse> getById(
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(
                categoryService.getById(id, userId)
        );
    }

    // POST /api/categories
    @PostMapping
    public ResponseEntity<CategoryResponse> create(
            @Valid @RequestBody CategoryRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(categoryService.create(request, userId));
    }

    // PUT /api/categories/{id}
    @PutMapping("/{id}")
    public ResponseEntity<CategoryResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody CategoryRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(
                categoryService.update(id, request, userId)
        );
    }

    // DELETE /api/categories/{id}
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        categoryService.delete(id, userId);
        return ResponseEntity.noContent().build();
    }
}
