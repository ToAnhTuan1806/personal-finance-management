package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.recurring.RecurringApplicationRequest;
import com.smartexpense.backend.entity.RecurringTemplate;
import com.smartexpense.backend.repository.RecurringApplicationRepository;
import com.smartexpense.backend.repository.RecurringTemplateRepository;
import com.smartexpense.backend.util.RecurringTemplateDates;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;

@Service
@RequiredArgsConstructor
public class RecurringAutomationProcessor {
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private final RecurringTemplateRepository templates;
    private final RecurringApplicationRepository applications;
    private final RecurringApplicationService applicationService;
    private final Clock clock;

    public enum Result { MISSING, INACTIVE, INITIALIZED, NOT_DUE, SKIPPED_PAST, ALREADY_APPLIED, APPLIED }

    // Mỗi lần gọi là một transaction riêng; lỗi một mẫu không rollback các mẫu khác.
    @Transactional
    public Result process(Long templateId) {
        RecurringTemplate template = templates.findByIdForUpdate(templateId).orElse(null);
        if (template == null) return Result.MISSING;
        if (!template.isActive()) return Result.INACTIVE;
        LocalDate today = LocalDate.now(clock.withZone(VIETNAM));
        if (today.getYear() < 1900 || today.getYear() > 2100) return Result.NOT_DUE;
        LocalDate date = template.getNextRunDate();
        boolean initializing = date == null;
        if (initializing || date.isBefore(today)) {
            // Bỏ qua kỳ quá khứ, nhưng vẫn xử lý trong lượt này nếu kỳ hiện tại đến hạn hôm nay.
            date = RecurringTemplateDates.nextOnOrAfter(today, template.getDayOfMonth());
            if (!today.equals(date)) {
                template.setNextRunDate(date);
                templates.saveAndFlush(template);
                return initializing ? Result.INITIALIZED : Result.SKIPPED_PAST;
            }
        }
        if (date.isAfter(today)) return Result.NOT_DUE;
        long ownerId = template.getUser().getId();
        boolean applied = applications.existsByTemplateIdAndTemplateUserIdAndYearAndMonth(
                templateId, ownerId, date.getYear(), date.getMonthValue());
        if (!applied) {
            var request = new RecurringApplicationRequest();
            request.setYear(date.getYear());
            request.setMonth(date.getMonthValue());
            // Dùng cùng luồng lưu giao dịch, owner/category và UNIQUE của thao tác cũ.
            applicationService.apply(templateId, ownerId, request);
        }
        YearMonth nextMonth = YearMonth.from(date).plusMonths(1);
        template.setNextRunDate(nextMonth.getYear() > 2100 ? null
                : RecurringTemplateDates.resolve(nextMonth, template.getDayOfMonth()));
        templates.saveAndFlush(template);
        return applied ? Result.ALREADY_APPLIED : Result.APPLIED;
    }
}
