package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.SavingsDtos.*;
import com.smartexpense.backend.repository.SavingsChallengeRepository;
import com.smartexpense.backend.repository.SavingsChallengeRepository.ChallengeRow;
import com.smartexpense.backend.repository.SavingsFundRepository;
import com.smartexpense.backend.repository.SavingsFundRepository.Movement;
import com.smartexpense.backend.util.SavingsCoverImage;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SavingsChallengeService {
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private final SavingsChallengeRepository repository;
    private final SavingsFundRepository fundRepository;
    private final Clock clock;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Overview overview(long owner) {
        var challenges = repository.list(owner);
        var savings = repository.listSavingsForOwner(owner);
        boolean coversAvailable = repository.coversAvailable();
        Set<Long> coverIds = coversAvailable ? repository.listCoverIds(owner) : Set.of();
        boolean fundsAvailable = fundRepository.available();
        Map<Long, List<Movement>> movements = fundsAvailable ? fundRepository.listForOwner(owner) : Map.of();
        LocalDate today = today();
        return new Overview(today, challenges.stream()
                .map(row -> response(row, savings.getOrDefault(row.id(), List.of()), coverIds.contains(row.id()),
                        movements.getOrDefault(row.id(), List.of())))
                .toList(), reward(owner, fundsAvailable), coversAvailable,
                fundsAvailable ? fundRepository.balances(owner, today) : null);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Reward reward(long owner) {
        return reward(owner, fundRepository.available());
    }

    private Reward reward(long owner, boolean fundsAvailable) {
        boolean unlocked = rewardUnlocked(owner, fundsAvailable);
        return new Reward(unlocked, unlocked && repository.usesGoldenPig(owner),
                Math.max(unlocked ? 1 : 0, repository.completedCount(owner, fundsAvailable)));
    }

    private boolean rewardUnlocked(long owner, boolean fundsAvailable) {
        return repository.hasCompletedChallenge(owner) || (fundsAvailable && fundRepository.hasEarnedReward(owner));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Funds funds(long owner) {
        return fundRepository.available() ? fundRepository.balances(owner, today()) : null;
    }

    @Transactional
    public Challenge start(long owner, CreateChallenge request) {
        byte[] cover = SavingsCoverImage.decode(request.coverImage());
        lockOwner(owner);
        boolean coversAvailable = repository.coversAvailable();
        if (cover != null && !coversAvailable) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Máy chủ chưa sẵn sàng lưu ảnh mục tiêu.");
        }
        String title = request.title().strip();
        var existing = repository.find(owner, request.id());
        if (existing.isPresent()) {
            var row = existing.get();
            if (!matches(row, title, request.target(), request.level())
                    || ChronoUnit.DAYS.between(row.startDate(), row.endDate()) + 1 != request.days()) {
                throw conflict("Yêu cầu này đã được dùng để tạo một thử thách khác.");
            }
            byte[] savedCover = coversAvailable ? repository.findCover(row.id()).orElse(null) : null;
            if (!Arrays.equals(cover, savedCover)) throw conflict("Yêu cầu này đã được lưu với ảnh khác.");
            return response(row, repository.listSavings(row.id()), savedCover != null, movements(row));
        }
        LocalDate start = today();
        repository.insertChallenge(owner, request.id(), title, request.target(), request.level(),
                start, start.plusDays(request.days() - 1L));
        var created = ownedChallenge(owner, request.id());
        if (cover != null) repository.insertCover(created.id(), cover);
        return response(created, List.of(), cover != null, List.of());
    }

    @Transactional
    public Challenge record(long owner, String key, Saving input) {
        lockOwner(owner);
        var row = ownedChallenge(owner, key);
        var records = repository.listSavings(row.id());
        var movements = movements(row);
        var saving = clean(input);
        var existing = records.stream().filter(record -> record.id().equals(saving.id())).findFirst();
        if (existing.isPresent()) {
            if (!existing.get().equals(saving)) throw conflict("Lần ghi nhận này đã được lưu với nội dung khác.");
            return response(row, records, hasCover(row), movements);
        }
        if (movements.stream().anyMatch(movement -> movement.key().equals(saving.id()))) {
            throw conflict("Mã ghi nhận này đã được dùng trong quỹ tiết kiệm.");
        }
        LocalDate today = today();
        if (today.isAfter(row.endDate()) || sum(records) + reserved(movements) >= row.target()) {
            throw conflict("Thử thách đã kết thúc.");
        }
        if (saving.amount() > row.target() - sum(records) - reserved(movements)) {
            throw conflict("Số tiền vượt quá phần còn thiếu của thử thách.");
        }
        validateDate(row, saving.date(), today);
        repository.insertSaving(row.id(), saving);
        if (sum(records) + reserved(movements) + saving.amount() >= row.target()) repository.savePreference(owner, true);
        return load(row);
    }

    @Transactional
    public FundUpdate deposit(long owner, String key, Saving input) {
        return moveFunds(owner, key, input.id(), input.amount(), input.date(), input.note());
    }

    @Transactional
    public FundUpdate withdraw(long owner, String key, Withdrawal input) {
        return moveFunds(owner, key, input.id(), -input.amount(), null, input.note());
    }

    private FundUpdate moveFunds(long owner, String key, String movementKey, long amount, LocalDate depositDate,
                                 String inputNote) {
        lockOwner(owner);
        var row = ownedChallenge(owner, key);
        if (!fundRepository.available()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Máy chủ chưa sẵn sàng lưu quỹ tiết kiệm.");
        }

        LocalDate today = today();
        boolean depositing = amount > 0;
        LocalDate date = depositing ? depositDate : today;
        String note = inputNote == null ? "" : inputNote.strip();
        var records = repository.listSavings(row.id());
        var movements = fundRepository.list(row.id());
        var existing = movements.stream().filter(movement -> movement.key().equals(movementKey)).findFirst();
        if (existing.isPresent()) {
            Movement saved = existing.get();
            if (saved.amount() != amount || !saved.note().equals(note) || (depositing && !saved.date().equals(date))) {
                throw conflict("Mã yêu cầu này đã được lưu với nội dung khác.");
            }
            return fundUpdate(owner, row, records, movements, today);
        }
        if (records.stream().anyMatch(record -> record.id().equals(movementKey))) {
            throw conflict("Mã yêu cầu này đã được dùng cho một lần ghi nhận trước đó.");
        }

        long fundBalance = reserved(movements);
        long progress = sum(records) + fundBalance;
        if (depositing) {
            if (today.isAfter(row.endDate()) || progress >= row.target()) throw conflict("Thử thách đã kết thúc.");
            if (amount > row.target() - progress) {
                throw conflict("Số tiền nạp vượt quá phần còn thiếu của thử thách.");
            }
            validateDate(row, date, today);
            if (fundRepository.balances(owner, today).availableBalance().compareTo(BigDecimal.valueOf(amount)) < 0) {
                throw conflict("Số tiền nạp vượt quá số dư khả dụng.");
            }
        } else if (-amount > fundBalance) {
            throw conflict("Số tiền rút vượt quá số tiền trong quỹ này.");
        }

        LocalDate completedOn = null;
        if (Math.max(progress, progress + amount) >= row.target()
                && movements.stream().noneMatch(movement -> movement.completedOn() != null)) {
            completedOn = today.isAfter(row.endDate()) ? row.endDate() : today;
        }
        Movement movement = new Movement(movementKey, amount, date, note, completedOn);
        fundRepository.insert(row.id(), movement);
        if (completedOn != null) repository.savePreference(owner, true);
        var updated = new ArrayList<>(movements);
        updated.add(movement);
        return fundUpdate(owner, row, records, updated, today);
    }

    private FundUpdate fundUpdate(long owner, ChallengeRow row, List<Saving> records, List<Movement> movements,
                                  LocalDate today) {
        return new FundUpdate(response(row, records, hasCover(row), movements),
                fundRepository.balances(owner, today), reward(owner, true));
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
        Set<String> withdrawalKeys = new HashSet<>();
        for (Movement movement : movements(row)) {
            if (movement.amount() > 0) records.put(movement.key(), asSaving(movement));
            else withdrawalKeys.add(movement.key());
        }
        for (Saving entry : input.savings()) {
            var saving = clean(entry);
            validateDate(row, saving.date(), today);
            if (withdrawalKeys.contains(saving.id())) throw conflict("Mã ghi nhận đã được dùng cho một khoản rút.");
            var previous = records.putIfAbsent(saving.id(), saving);
            if (previous == null) repository.insertSaving(row.id(), saving);
            else if (!previous.equals(saving)) throw conflict("Có khoản ghi nhận cùng mã với thông tin khác.");
        }
        return load(row);
    }

    @Transactional
    public Reward selectMascot(long owner, boolean enabled) {
        lockOwner(owner);
        boolean unlocked = rewardUnlocked(owner, fundRepository.available());
        if (enabled && !unlocked) throw conflict("Bạn chưa mở khóa Heo Vàng.");
        repository.savePreference(owner, enabled);
        return reward(owner, fundRepository.available());
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

    @Transactional(readOnly = true)
    public byte[] cover(long owner, String key) {
        var row = ownedChallenge(owner, key);
        if (!repository.coversAvailable()) throw coverNotFound();
        return repository.findCover(row.id()).orElseThrow(SavingsChallengeService::coverNotFound);
    }

    private boolean hasCover(ChallengeRow row) {
        return repository.coversAvailable() && repository.hasCover(row.id());
    }

    private List<Movement> movements(ChallengeRow row) {
        return fundRepository.available() ? fundRepository.list(row.id()) : List.of();
    }

    private Challenge load(ChallengeRow row) {
        return response(row, repository.listSavings(row.id()), hasCover(row), movements(row));
    }

    private static Challenge response(ChallengeRow row, List<Saving> records, boolean hasCover, List<Movement> movements) {
        var deposits = new ArrayList<>(records);
        var withdrawals = new ArrayList<Saving>();
        LocalDate completedOn = null;
        for (Movement movement : movements) {
            if (movement.amount() > 0) deposits.add(asSaving(movement));
            else withdrawals.add(asSaving(movement));
            if (movement.completedOn() != null && (completedOn == null || movement.completedOn().isBefore(completedOn))) {
                completedOn = movement.completedOn();
            }
        }
        return new Challenge(row.key(), row.title(), row.target(), row.level(), row.startDate(), row.endDate(),
                deposits, hasCover, reserved(movements), withdrawals, completedOn);
    }

    private static long reserved(List<Movement> movements) {
        return movements.stream().mapToLong(Movement::amount).sum();
    }

    private static Saving asSaving(Movement movement) {
        return new Saving(movement.key(), Math.abs(movement.amount()), movement.date(), movement.note());
    }

    private static ResponseStatusException coverNotFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy ảnh mục tiêu.");
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
