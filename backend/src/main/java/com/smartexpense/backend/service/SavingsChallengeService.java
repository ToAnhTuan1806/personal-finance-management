package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.SavingsDtos.*;
import com.smartexpense.backend.repository.SavingsChallengeRepository;
import com.smartexpense.backend.repository.SavingsChallengeRepository.ChallengeRow;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SavingsChallengeService {
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private final SavingsChallengeRepository repository;
    private final Clock clock;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Overview overview(long owner) {
        var challenges = repository.list(owner);
        var savings = repository.listSavingsForOwner(owner);
        return new Overview(today(), challenges.stream()
                .map(row -> response(row, savings.getOrDefault(row.id(), List.of()))).toList(), reward(owner));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Reward reward(long owner) {
        boolean unlocked = repository.hasCompletedChallenge(owner);
        return new Reward(unlocked, unlocked && repository.usesGoldenPig(owner));
    }

    @Transactional
    public Challenge start(long owner, CreateChallenge request) {
        lockOwner(owner);
        String title = request.title().strip();
        var existing = repository.find(owner, request.id());
        if (existing.isPresent()) {
            var row = existing.get();
            if (!matches(row, title, request.target(), request.level())
                    || ChronoUnit.DAYS.between(row.startDate(), row.endDate()) + 1 != request.days()) {
                throw conflict("Yêu cầu này đã được dùng để tạo một thử thách khác.");
            }
            return load(row);
        }
        LocalDate start = today();
        repository.insertChallenge(owner, request.id(), title, request.target(), request.level(),
                start, start.plusDays(request.days() - 1L));
        return load(ownedChallenge(owner, request.id()));
    }

    @Transactional
    public Challenge record(long owner, String key, Saving input) {
        lockOwner(owner);
        var row = ownedChallenge(owner, key);
        var records = repository.listSavings(row.id());
        var saving = clean(input);
        var existing = records.stream().filter(record -> record.id().equals(saving.id())).findFirst();
        if (existing.isPresent()) {
            if (!existing.get().equals(saving)) throw conflict("Lần ghi nhận này đã được lưu với nội dung khác.");
            return response(row, records);
        }
        LocalDate today = today();
        if (today.isAfter(row.endDate()) || sum(records) >= row.target()) {
            throw conflict("Thử thách đã kết thúc.");
        }
        validateDate(row, saving.date(), today);
        repository.insertSaving(row.id(), saving);
        return load(row);
    }

    @Transactional
    public Challenge importChallenge(long owner, ImportChallenge input) {
        lockOwner(owner);
        LocalDate today = today();
        long duration = ChronoUnit.DAYS.between(input.startDate(), input.endDate()) + 1;
        if (duration < 1 || duration > 365 || input.startDate().isAfter(today)) {
            throw badRequest("Thời hạn của thử thách trên trình duyệt không hợp lệ.");
        }
        String title = input.title().strip();
        var existing = repository.find(owner, input.id());
        if (existing.isEmpty()) {
            repository.insertChallenge(owner, input.id(), title, input.target(), input.level(),
                    input.startDate(), input.endDate());
        }
        var row = existing.orElseGet(() -> ownedChallenge(owner, input.id()));
        if (!matches(row, title, input.target(), input.level()) || !row.startDate().equals(input.startDate())
                || !row.endDate().equals(input.endDate())) {
            throw conflict("Đã có thử thách cùng mã với thông tin khác.");
        }
        Map<String, Saving> records = repository.listSavings(row.id()).stream()
                .collect(Collectors.toMap(Saving::id, Function.identity()));
        for (Saving entry : input.savings()) {
            var saving = clean(entry);
            validateDate(row, saving.date(), today);
            var previous = records.putIfAbsent(saving.id(), saving);
            if (previous == null) repository.insertSaving(row.id(), saving);
            else if (!previous.equals(saving)) throw conflict("Có khoản ghi nhận cùng mã với thông tin khác.");
        }
        return load(row);
    }

    @Transactional
    public Reward selectMascot(long owner, boolean enabled) {
        lockOwner(owner);
        boolean unlocked = repository.hasCompletedChallenge(owner);
        if (enabled && !unlocked) throw conflict("Bạn chưa mở khóa Heo Vàng.");
        repository.savePreference(owner, enabled);
        return new Reward(unlocked, unlocked && enabled);
    }

    private void lockOwner(long owner) {
        if (!repository.lockOwner(owner)) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    }

    private ChallengeRow ownedChallenge(long owner, String key) {
        return repository.find(owner, key).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy thử thách."));
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(VIETNAM));
    }

    private Challenge load(ChallengeRow row) {
        return response(row, repository.listSavings(row.id()));
    }

    private static Challenge response(ChallengeRow row, List<Saving> records) {
        return new Challenge(row.key(), row.title(), row.target(), row.level(), row.startDate(), row.endDate(), records);
    }

    private static long sum(List<Saving> savings) {
        return savings.stream().mapToLong(Saving::amount).sum();
    }

    private static boolean matches(ChallengeRow row, String title, long target, String level) {
        return row.title().equals(title) && row.target() == target && row.level().equals(level);
    }

    private static Saving clean(Saving saving) {
        return new Saving(saving.id(), saving.amount(), saving.date(), saving.note() == null ? "" : saving.note().strip());
    }

    private static void validateDate(ChallengeRow row, LocalDate date, LocalDate today) {
        if (date.isBefore(row.startDate()) || date.isAfter(row.endDate()) || date.isAfter(today)) {
            throw badRequest("Ngày ghi nhận phải từ ngày bắt đầu đến hôm nay và nằm trong thời hạn thử thách.");
        }
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
