package com.smartexpense.backend;

import com.smartexpense.backend.util.RecurringTemplateDates;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class RecurringTemplateDatesTests {
    @ParameterizedTest
    @CsvSource({"2027-01,31,2027-01-31", "2027-04,31,2027-04-30", "2027-02,31,2027-02-28",
            "2028-02,31,2028-02-29", "2027-02,29,2027-02-28", "2028-02,29,2028-02-29",
            "2027-02,30,2027-02-28", "2027-04,1,2027-04-01"})
    void resolvesShortMonthsWithoutDependingOnToday(String month, int day, String expected) {
        assertThat(RecurringTemplateDates.resolve(YearMonth.parse(month), day)).hasToString(expected);
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 0, 32})
    void rejectsDaysOutsideTemplateDomain(int day) {
        assertThatIllegalArgumentException().isThrownBy(() -> RecurringTemplateDates.resolve(YearMonth.of(2027, 2), day));
    }
}
