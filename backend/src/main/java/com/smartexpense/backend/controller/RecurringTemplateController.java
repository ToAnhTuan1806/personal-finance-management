package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.recurring.RecurringTemplateRequest;
import com.smartexpense.backend.dto.recurring.RecurringTemplateResponse;
import com.smartexpense.backend.dto.recurring.RecurringApplicationRequest;
import com.smartexpense.backend.dto.recurring.RecurringApplicationResponse;
import com.smartexpense.backend.dto.recurring.RecurringPreviewResponse;
import com.smartexpense.backend.service.RecurringApplicationService;
import com.smartexpense.backend.service.RecurringTemplateService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/recurring-templates")
@RequiredArgsConstructor
public class RecurringTemplateController {

    private final RecurringTemplateService templateService;
    private final RecurringApplicationService applicationService;

    @GetMapping("/{id}/preview")
    public ResponseEntity<RecurringPreviewResponse> preview(
            @PathVariable Long id, @RequestParam Integer year, @RequestParam Integer month,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(applicationService.preview(id, Long.valueOf(jwt.getSubject()), year, month));
    }

    @PostMapping("/{id}/apply")
    public ResponseEntity<RecurringApplicationResponse> apply(
            @PathVariable Long id, @Valid @RequestBody RecurringApplicationRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(applicationService.apply(id, Long.valueOf(jwt.getSubject()), request));
    }

    @GetMapping
    public ResponseEntity<Page<RecurringTemplateResponse>> getAll(
            @RequestParam(required = false) Boolean active,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(templateService.getAll(Long.valueOf(jwt.getSubject()), active, page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<RecurringTemplateResponse> getById(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(templateService.getById(id, Long.valueOf(jwt.getSubject())));
    }

    @PostMapping
    public ResponseEntity<RecurringTemplateResponse> create(
            @Valid @RequestBody RecurringTemplateRequest request, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(templateService.create(request, Long.valueOf(jwt.getSubject())));
    }

    @PutMapping("/{id}")
    public ResponseEntity<RecurringTemplateResponse> update(
            @PathVariable Long id, @Valid @RequestBody RecurringTemplateRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(templateService.update(id, request, Long.valueOf(jwt.getSubject())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        templateService.delete(id, Long.valueOf(jwt.getSubject()));
        return ResponseEntity.noContent().build();
    }
}
