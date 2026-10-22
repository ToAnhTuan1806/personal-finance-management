package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.transaction.*;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.service.TransactionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/transactions")
@RequiredArgsConstructor
public class TransactionController {

    private final TransactionService transactionService;

    // GET /api/transactions - Lọc theo tháng hoặc khoảng ngày
    @GetMapping
    public ResponseEntity<Page<TransactionResponse>> getAll(
            @AuthenticationPrincipal Jwt jwt,

            @RequestParam(required = false) TransactionType type,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String month,

            // Bộ lọc khoảng ngày cho Date Range Picker #030
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate startDate,

            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate endDate,

            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {

        Long userId = Long.valueOf(jwt.getSubject());

        return ResponseEntity.ok(
                transactionService.getAll(
                        userId,
                        type,
                        categoryId,
                        month,
                        startDate,
                        endDate,
                        keyword,
                        page,
                        size
                )
        );
    }

    // GET /api/transactions/{id} - Xem chi tiết
    @GetMapping("/{id}")
    public ResponseEntity<TransactionResponse> getById(
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(
                transactionService.getById(id, userId)
        );
    }

    // POST /api/transactions - Tạo giao dịch
    @PostMapping
    public ResponseEntity<TransactionResponse> create(
            @Valid @RequestBody TransactionRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(transactionService.create(request, userId));
    }

    // PUT /api/transactions/{id} - Cập nhật
    @PutMapping("/{id}")
    public ResponseEntity<TransactionResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody TransactionRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        return ResponseEntity.ok(
                transactionService.update(id, request, userId)
        );
    }

    // DELETE /api/transactions/{id} - Xóa
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        transactionService.delete(id, userId);
        return ResponseEntity.noContent().build();
    }
}
