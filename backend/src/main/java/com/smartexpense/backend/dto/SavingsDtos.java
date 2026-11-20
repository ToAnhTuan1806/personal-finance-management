package com.smartexpense.backend.dto;

import com.smartexpense.backend.util.SavingsCoverImage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
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
            @NotNull @Pattern(regexp = LEVEL) String level,
            @Size(max = SavingsCoverImage.MAX_DATA_LENGTH) String coverImage) {
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

    public record Withdrawal(
            @NotBlank @Pattern(regexp = KEY) String id,
            @NotNull @Positive @Max(MAX_AMOUNT) Long amount,
            @Size(max = 250) String note) {
        @Override public String toString() { return "Withdrawal[redacted]"; }
    }

    public record Challenge(String id, String title, long target, String level, LocalDate startDate,
                            LocalDate endDate, List<Saving> savings, boolean hasCover,
                            long fundBalance, List<Saving> withdrawals, LocalDate completedOn) {}

    public record Funds(BigDecimal totalBalance, BigDecimal reservedBalance, BigDecimal availableBalance) {}

    public record FundUpdate(Challenge challenge, Funds funds, Reward reward) {}

    public record PreferenceRequest(@NotNull Boolean useGoldenPig) {}
    public record Reward(boolean unlocked, boolean useGoldenPig) {}
    public record Overview(LocalDate today, List<Challenge> challenges, Reward reward,
                           boolean coverUploadEnabled, Funds funds) {}
}
