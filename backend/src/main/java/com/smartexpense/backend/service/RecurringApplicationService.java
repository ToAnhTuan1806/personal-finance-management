package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.recurring.RecurringApplicationRequest;
import com.smartexpense.backend.dto.recurring.RecurringApplicationResponse;
import com.smartexpense.backend.dto.recurring.RecurringPreviewResponse;
import com.smartexpense.backend.dto.transaction.TransactionResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.RecurringApplication;
import com.smartexpense.backend.entity.RecurringTemplate;
import com.smartexpense.backend.entity.Transaction;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.RecurringApplicationRepository;
import com.smartexpense.backend.repository.RecurringTemplateRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.util.RecurringTemplateDates;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.sql.SQLException;

@Service
@RequiredArgsConstructor
public class RecurringApplicationService {
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private final RecurringTemplateRepository templates;
    private final RecurringApplicationRepository applications;
    private final TransactionRepository transactions;
    private final CategoryRepository categories;
    private final Clock clock;

    @Transactional(readOnly = true)
    public RecurringPreviewResponse preview(Long id, Long userId, Integer year, Integer month) {
        YearMonth period = period(year, month);
        RecurringTemplate template = ownedTemplate(id, userId);
        Category category = matchingCategory(template, userId);
        LocalDate date = RecurringTemplateDates.resolve(period, template.getDayOfMonth());
        boolean applied = applications.existsByTemplateIdAndTemplateUserIdAndYearAndMonth(id, userId, year, month);
        String reason = reason(template, date, applied);
        return new RecurringPreviewResponse(id, year, month, date, category.getId(), category.getName(),
                template.getType(), template.getAmount(), template.getNote(), applied, reason == null, reason);
    }

    @Transactional
    public RecurringApplicationResponse apply(Long id, Long userId, RecurringApplicationRequest request) {
        YearMonth period = period(request.getYear(), request.getMonth());
        RecurringTemplate template = ownedTemplate(id, userId);
        Category category = matchingCategory(template, userId);
        LocalDate date = RecurringTemplateDates.resolve(period, template.getDayOfMonth());
        boolean applied = applications.existsByTemplateIdAndTemplateUserIdAndYearAndMonth(
                id, userId, period.getYear(), period.getMonthValue());
        String reason = reason(template, date, applied);
        if ("FUTURE_DATE".equals(reason)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Ngày giao dịch không được lớn hơn ngày hiện tại.");
        }
        if (reason != null) throw new ResponseStatusException(HttpStatus.CONFLICT, reason);

        Transaction transaction = new Transaction();
        transaction.setUser(template.getUser());
        transaction.setCategory(category);
        transaction.setType(template.getType());
        transaction.setAmount(template.getAmount());
        transaction.setTransactionDate(date);
        transaction.setNote(template.getNote());
        RecurringApplication application = new RecurringApplication();
        application.setTemplate(template);
        application.setYear(period.getYear());
        application.setMonth(period.getMonthValue());
        application.setTransaction(transaction);
        try {
            transactions.saveAndFlush(transaction);
            // UNIQUE V005 là chốt chống race, kể cả khi hai request cùng vượt precheck.
            applications.saveAndFlush(application);
        } catch (DataIntegrityViolationException exception) {
            // Chỉ 1062/23000 là duplicate. Thoát ngay bằng RuntimeException để Spring rollback;
            // không query/retry/tiếp tục ghi trong transaction đã lỗi. Không đổi handler D01–D08.
            throw new ResponseStatusException(isDuplicate(exception) ? HttpStatus.CONFLICT : HttpStatus.INTERNAL_SERVER_ERROR,
                    null, exception);
        }
        var transactionResponse = new TransactionResponse(transaction.getId(), category.getId(), category.getName(),
                transaction.getType(), transaction.getAmount(), date, transaction.getNote());
        return new RecurringApplicationResponse(application.getId(), id, period.getYear(), period.getMonthValue(),
                transaction.getId(), transactionResponse);
    }

    private String reason(RecurringTemplate template, LocalDate date, boolean applied) {
        if (applied) return "ALREADY_APPLIED";
        if (!template.isActive()) return "TEMPLATE_INACTIVE";
        if (date.isAfter(LocalDate.now(clock.withZone(VIETNAM)))) return "FUTURE_DATE";
        return null;
    }

    private boolean isDuplicate(DataIntegrityViolationException exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && sql.getErrorCode() == 1062 && "23000".equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }

    private YearMonth period(Integer year, Integer month) {
        if (year == null || year < 1900 || year > 2100 || month == null || month < 1 || month > 12) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Năm phải từ 1900–2100, tháng phải từ 1–12");
        }
        return YearMonth.of(year, month);
    }

    private RecurringTemplate ownedTemplate(Long id, Long userId) {
        if (id == null || id <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID phải là số nguyên dương");
        return templates.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy mẫu giao dịch định kỳ"));
    }

    private Category matchingCategory(RecurringTemplate template, Long userId) {
        Category category = categories.findByIdAndUserId(template.getCategory().getId(), userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy danh mục"));
        if (category.getType() != template.getType()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Loại giao dịch không khớp với danh mục");
        }
        return category;
    }
}
