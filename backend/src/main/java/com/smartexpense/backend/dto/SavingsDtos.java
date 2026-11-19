package com.smartexpense.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.List;

public final class SavingsDtos {
    private SavingsDtos() {}

    public static final long MAX_AMOUNT = 9_999_999_999_999L;
    private static final String KEY = "[a-z0-9-]{1,64}";
    private static final String LEVEL = "easy|medium|hard";

    public record CreateChallenge(
            @NotBlank @Pattern(regexp = KEY) String id,
            @NotBlank @Size(max = 80) String title,
            @NotNull @Positive @Max(MAX_AMOUNT) Long target,
            @NotNull @Min(1) @Max(365) Integer days,
            @NotNull @Pattern(regexp = LEVEL) String level) {
        @Override public String toString() { return "CreateChallenge[redacted]"; }
    }

    public record Saving(
            @NotBlank @Pattern(regexp = KEY) String id,
            @NotNull @Positive @Max(MAX_AMOUNT) Long amount,
            @NotNull LocalDate date,
            @Size(max = 250) String note) {
        @Override public String toString() { return "Saving[redacted]"; }
    }

    public record ImportChallenge(
            @NotBlank @Pattern(regexp = KEY) String id,
            @NotBlank @Size(max = 80) String title,
            @NotNull @Positive @Max(MAX_AMOUNT) Long target,
            @NotNull @Pattern(regexp = LEVEL) String level,
            @NotNull LocalDate startDate,
            @NotNull LocalDate endDate,
            @NotNull @Size(max = 10000) List<@NotNull @Valid Saving> savings) {
        @Override public String toString() { return "ImportChallenge[redacted]"; }
    }

    public record Challenge(String id, String title, long target, String level,
                            LocalDate startDate, LocalDate endDate, List<Saving> savings) {}

    public record PreferenceRequest(@NotNull Boolean useGoldenPig) {}
    public record Reward(boolean unlocked, boolean useGoldenPig) {}
    public record Overview(LocalDate today, List<Challenge> challenges, Reward reward) {}
}
