package com.smartexpense.backend.controller;

import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.service.TransactionExportService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class TransactionExportController {
    private final TransactionExportService exports;

    @GetMapping("/api/transactions/export")
    public ResponseEntity<ByteArrayResource> export(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) TransactionType type,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String month,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String keyword,
            @RequestParam Map<String, String> parameters) {
        if (parameters.containsKey("page") || parameters.containsKey("size") || parameters.containsKey("sort")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CSV không nhận page, size hoặc sort");
        }
        byte[] csv = exports.export(Long.valueOf(jwt.getSubject()), type, categoryId,
                month, startDate, endDate, keyword);
        String date = LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")).format(DateTimeFormatter.BASIC_ISO_DATE);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("smart-expense-" + date + ".csv").build().toString())
                .cacheControl(CacheControl.noStore()).body(new ByteArrayResource(csv, "CSV export"));
    }
}
