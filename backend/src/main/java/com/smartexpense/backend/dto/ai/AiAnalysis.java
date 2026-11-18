package com.smartexpense.backend.dto.ai;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Kết quả chỉ đọc; mọi số liệu được tính tại Backend theo JWT owner. */
public record AiAnalysis(String kind, String status, String title, String summary,
                         LocalDate asOf, LocalDate startDate, LocalDate endDate,
                         List<Metric> metrics, List<String> highlights, List<Driver> drivers,
                         List<Evidence> evidence, TransactionFilter transactionFilter,
                         List<String> assumptions) {
    @Override public String toString() { return "AiAnalysis[redacted]"; }
    public record Metric(String label, BigDecimal value, String format) { }
    public record Driver(Long categoryId, String categoryName, BigDecimal previousAmount,
                         BigDecimal currentAmount, BigDecimal delta) { }
    public record Evidence(Long id, LocalDate date, String categoryName, String note, BigDecimal amount) {
        @Override public String toString() { return "AiEvidence[redacted]"; }
    }
    public record TransactionFilter(LocalDate startDate, LocalDate endDate, Long categoryId) { }
}
