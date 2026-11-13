package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.transaction.TransactionResponse;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.exception.D11Exception;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

@Service
@RequiredArgsConstructor
public class TransactionExportService {
    private static final int LIMIT = 10_000;
    private static final int BATCH_SIZE = 100;
    private final TransactionService transactions;

    // MySQL REPEATABLE_READ giữ count và các batch cùng snapshot. Chỉ gửi HTTP sau khi hoàn tất.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public byte[] export(Long userId, TransactionType type, Long categoryId, String month,
                         LocalDate startDate, LocalDate endDate, String keyword) {
        var batch = transactions.getAll(userId, type, categoryId, month, startDate, endDate,
                keyword, 0, BATCH_SIZE);
        if (batch.getTotalElements() > LIMIT) {
            throw new D11Exception(HttpStatus.UNPROCESSABLE_ENTITY, "EXPORT_LIMIT_EXCEEDED",
                    "Chỉ được xuất tối đa 10.000 giao dịch; vui lòng thu hẹp bộ lọc");
        }
        var csv = new StringBuilder("\uFEFF");
        csv.append("\"Mã giao dịch\",\"Ngày giao dịch\",\"Loại\",\"Danh mục\",\"Số tiền\",\"Ghi chú\"\r\n");
        int rows = 0;
        while (true) {
            for (TransactionResponse row : batch) {
                if (++rows > LIMIT) {
                    throw new D11Exception(HttpStatus.UNPROCESSABLE_ENTITY, "EXPORT_LIMIT_EXCEEDED",
                            "Chỉ được xuất tối đa 10.000 giao dịch");
                }
                csv.append(quote(row.getId().toString())).append(',')
                        .append(quote(row.getTransactionDate().toString())).append(',')
                        .append(quote(row.getType().name())).append(',')
                        .append(safeText(row.getCategoryName())).append(',')
                        .append(quote(row.getAmount().toPlainString())).append(',')
                        .append(safeText(row.getNote())).append("\r\n");
            }
            if (!batch.hasNext()) break;
            batch = transactions.getAll(userId, type, categoryId, month, startDate, endDate,
                    keyword, batch.getNumber() + 1, BATCH_SIZE);
        }
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static String quote(String value) {
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private static String safeText(String value) {
        if (value == null) return quote("");
        // Kiểm tra cả ký tự ẩn/điều khiển và biến thể fullwidth trước khi escape CSV.
        boolean dangerous = value.codePoints().anyMatch(c -> Character.isISOControl(c)
                || Character.getType(c) == Character.FORMAT);
        String normalized = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFKC);
        int first = normalized.codePoints().filter(c -> !Character.isWhitespace(c)
                && !Character.isSpaceChar(c) && Character.getType(c) != Character.FORMAT)
                .findFirst().orElse(0);
        if (dangerous || first == '=' || first == '+' || first == '-' || first == '@') value = "'" + value;
        return quote(value);
    }
}
