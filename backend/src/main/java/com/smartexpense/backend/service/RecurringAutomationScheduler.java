package com.smartexpense.backend.service;

import com.smartexpense.backend.repository.RecurringTemplateRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.recurring.automatic-enabled", havingValue = "true", matchIfMissing = true)
public class RecurringAutomationScheduler {
    private static final Logger LOG = LoggerFactory.getLogger(RecurringAutomationScheduler.class);
    private static final int BATCH_SIZE = 200;
    private final RecurringTemplateRepository templates;
    private final RecurringAutomationProcessor processor;
    private final Clock clock;

    @Scheduled(fixedDelayString = "${app.recurring.delay-ms:60000}",
            initialDelayString = "${app.recurring.initial-delay-ms:1000}")
    public void runDueTemplates() {
        try {
            LocalDate today = LocalDate.now(clock.withZone(ZoneId.of("Asia/Ho_Chi_Minh")));
            if (today.getYear() < 1900 || today.getYear() > 2100) return;
            long afterId = 0;
            while (true) {
                var ids = templates.findAutomaticCandidateIds(today, afterId, PageRequest.of(0, BATCH_SIZE));
                if (ids.isEmpty()) break;
                for (Long id : ids) {
                    try { processor.process(id); }
                    catch (RuntimeException exception) {
                        // Không ghi thông tin tài chính; kỳ lỗi được thử lại ở lượt quét sau.
                        LOG.warn("recurring_automatic_template_failed");
                    }
                }
                // Tiến theo ID, không bỏ sót khi xử lý làm thay đổi danh sách và không để mẫu lỗi chặn mẫu sau.
                afterId = ids.getLast();
                if (ids.size() < BATCH_SIZE) break;
            }
        } catch (RuntimeException exception) {
            LOG.warn("recurring_automatic_scan_failed");
        }
    }
}
