package com.smartexpense.backend;

import com.smartexpense.backend.entity.RecurringTemplate;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.repository.RecurringApplicationRepository;
import com.smartexpense.backend.repository.RecurringTemplateRepository;
import com.smartexpense.backend.service.RecurringApplicationService;
import com.smartexpense.backend.service.RecurringAutomationProcessor;
import com.smartexpense.backend.util.RecurringTemplateDates;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.time.*;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RecurringAutomationProcessorTests {
    private final RecurringTemplateRepository templates = mock(RecurringTemplateRepository.class);
    private final RecurringApplicationRepository applications = mock(RecurringApplicationRepository.class);
    private final RecurringApplicationService ledger = mock(RecurringApplicationService.class);
    private final RecurringTemplate template = new RecurringTemplate();

    private RecurringAutomationProcessor processor(String instant, String next, int day) {
        var user = new User(); user.setId(42L);
        template.setUser(user); template.setId(7L); template.setActive(true); template.setDayOfMonth(day);
        template.setNextRunDate(next == null ? null : LocalDate.parse(next));
        when(templates.findByIdForUpdate(7L)).thenReturn(Optional.of(template));
        return new RecurringAutomationProcessor(templates, applications, ledger,
                Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
    }

    @ParameterizedTest
    @CsvSource({"2026-11-18,18,2026-12-18", "2026-11-18,2,2026-12-02", "2026-11-18,19,2026-11-19",
            "2027-01-31,31,2027-02-28", "2028-02-29,31,2028-03-31", "2026-12-31,1,2027-01-01"})
    void nextDateIsStrictlyFutureAndUsesOriginalDay(String today, int day, String next) {
        assertThat(RecurringTemplateDates.nextAfter(LocalDate.parse(today), day)).hasToString(next);
    }

    @Test void existingTemplateStartsInFutureWithoutLedgerWrites() {
        var p = processor("2026-11-18T05:00:00Z", null, 2);
        assertThat(p.process(7L)).isEqualTo(RecurringAutomationProcessor.Result.INITIALIZED);
        assertThat(template.getNextRunDate()).hasToString("2026-12-02");
        verifyNoInteractions(ledger, applications);
    }

    @Test void missedDateSkipsBacklog() {
        var p = processor("2026-11-18T05:00:00Z", "2026-10-02", 2);
        assertThat(p.process(7L)).isEqualTo(RecurringAutomationProcessor.Result.SKIPPED_PAST);
        assertThat(template.getNextRunDate()).hasToString("2026-12-02");
        verifyNoInteractions(ledger, applications);
    }

    @Test void dueUsesVietnamDateAndRestoresOriginalDayAfterFebruary() {
        var p = processor("2028-02-28T17:00:00Z", "2028-02-29", 31);
        assertThat(p.process(7L)).isEqualTo(RecurringAutomationProcessor.Result.APPLIED);
        verify(ledger).apply(eq(7L), eq(42L), argThat(r -> r.getYear() == 2028 && r.getMonth() == 2));
        assertThat(template.getNextRunDate()).hasToString("2028-03-31");
    }

    @Test void markerPreventsRecreationEvenWhenTransactionWasDeleted() {
        var p = processor("2026-11-18T05:00:00Z", "2026-11-18", 18);
        when(applications.existsByTemplateIdAndTemplateUserIdAndYearAndMonth(7L, 42L, 2026, 11)).thenReturn(true);
        assertThat(p.process(7L)).isEqualTo(RecurringAutomationProcessor.Result.ALREADY_APPLIED);
        assertThat(template.getNextRunDate()).hasToString("2026-12-18");
        verifyNoInteractions(ledger);
    }

    @Test void futureAndInactiveAndDeletedAreNeverApplied() {
        var p = processor("2026-11-18T05:00:00Z", "2026-11-19", 19);
        assertThat(p.process(7L)).isEqualTo(RecurringAutomationProcessor.Result.NOT_DUE);
        template.setActive(false);
        assertThat(p.process(7L)).isEqualTo(RecurringAutomationProcessor.Result.INACTIVE);
        assertThat(p.process(99L)).isEqualTo(RecurringAutomationProcessor.Result.MISSING);
        verifyNoInteractions(ledger, applications);
        verify(templates, never()).saveAndFlush(any());
    }
}
