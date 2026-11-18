package com.smartexpense.backend;

import com.smartexpense.backend.config.RecurringSchedulingConfiguration;
import com.smartexpense.backend.repository.RecurringTemplateRepository;
import com.smartexpense.backend.service.RecurringAutomationProcessor;
import com.smartexpense.backend.service.RecurringAutomationScheduler;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import java.time.*;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RecurringAutomationSchedulerTests {
    @Test void springActuallyRunsTheTimerWithoutAUserRequest() throws Exception {
        var templates = mock(RecurringTemplateRepository.class);
        var processor = mock(RecurringAutomationProcessor.class);
        var ran = new CountDownLatch(1);
        when(templates.findAutomaticCandidateIds(eq(LocalDate.of(2026,11,18)), eq(0L), any())).thenReturn(List.of(7L));
        when(processor.process(7L)).thenAnswer(call -> { ran.countDown(); return RecurringAutomationProcessor.Result.APPLIED; });
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", Map.of(
                    "app.recurring.delay-ms", "25", "app.recurring.initial-delay-ms", "1")));
            context.registerBean(RecurringTemplateRepository.class, () -> templates);
            context.registerBean(RecurringAutomationProcessor.class, () -> processor);
            context.registerBean(Clock.class, () -> Clock.fixed(Instant.parse("2026-11-17T17:00:00Z"),ZoneOffset.UTC));
            context.register(RecurringSchedulingConfiguration.class, RecurringAutomationScheduler.class);
            context.refresh();
            assertThat(ran.await(3, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test void disabledPropertyRemovesBothTimerAndScheduler() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", Map.of(
                    "app.recurring.automatic-enabled", "false")));
            context.register(RecurringSchedulingConfiguration.class, RecurringAutomationScheduler.class);
            context.refresh();
            assertThat(context.getBeansOfType(RecurringAutomationScheduler.class)).isEmpty();
            assertThat(context.containsBean("org.springframework.context.annotation.internalScheduledAnnotationProcessor")).isFalse();
        }
    }

    @Test void failedBatchDoesNotStarveLaterTemplates() {
        var templates = mock(RecurringTemplateRepository.class);
        var processor = mock(RecurringAutomationProcessor.class);
        var firstBatch = java.util.stream.LongStream.rangeClosed(1,200).boxed().toList();
        when(templates.findAutomaticCandidateIds(any(), eq(0L), any())).thenReturn(firstBatch);
        when(templates.findAutomaticCandidateIds(any(), eq(200L), any())).thenReturn(List.of(201L));
        when(processor.process(anyLong())).thenThrow(new IllegalStateException("private financial data"));
        new RecurringAutomationScheduler(templates, processor, Clock.fixed(
                Instant.parse("2026-11-18T05:00:00Z"), ZoneOffset.UTC)).runDueTemplates();
        verify(processor).process(201L);
        verify(processor, times(201)).process(anyLong());
    }
}
