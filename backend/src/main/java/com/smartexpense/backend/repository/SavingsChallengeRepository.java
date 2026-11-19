package com.smartexpense.backend.repository;

import com.smartexpense.backend.dto.SavingsDtos.Saving;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
public class SavingsChallengeRepository {
    public record ChallengeRow(long id, String key, String title, long target, String level,
                               LocalDate startDate, LocalDate endDate) {}

    private static final String SELECT_CHALLENGES = """
            SELECT id, client_key, title, target, difficulty, start_date, end_date
            FROM savings_challenges WHERE user_id = ?
            """;
    private static final RowMapper<ChallengeRow> CHALLENGE = (rs, ignored) -> new ChallengeRow(
            rs.getLong("id"), rs.getString("client_key"), rs.getString("title"), rs.getLong("target"),
            rs.getString("difficulty"), rs.getObject("start_date", LocalDate.class),
            rs.getObject("end_date", LocalDate.class));

    private final JdbcTemplate jdbc;

    public boolean lockOwner(long owner) {
        return !jdbc.queryForList("SELECT id FROM users WHERE id = ? FOR UPDATE", Long.class, owner).isEmpty();
    }

    public List<ChallengeRow> list(long owner) {
        return jdbc.query(SELECT_CHALLENGES + " ORDER BY id DESC", CHALLENGE, owner);
    }

    public Optional<ChallengeRow> find(long owner, String key) {
        return jdbc.query(SELECT_CHALLENGES + " AND client_key = ?", CHALLENGE, owner, key).stream().findFirst();
    }

    public void insertChallenge(long owner, String key, String title, long target, String level,
                                LocalDate start, LocalDate end) {
        jdbc.update("""
                INSERT INTO savings_challenges (user_id, client_key, title, target, difficulty, start_date, end_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, owner, key, title, target, level, start, end);
    }

    public List<Saving> listSavings(long challengeId) {
        return jdbc.query("""
                SELECT client_key, amount, saved_on, note FROM savings_records WHERE challenge_id = ? ORDER BY id
                """, (rs, ignored) -> saving(rs), challengeId);
    }

    public Map<Long, List<Saving>> listSavingsForOwner(long owner) {
        return jdbc.query("""
                SELECT r.challenge_id, r.client_key, r.amount, r.saved_on, r.note
                FROM savings_records r JOIN savings_challenges c ON c.id = r.challenge_id
                WHERE c.user_id = ? ORDER BY r.id
                """, rs -> {
            Map<Long, List<Saving>> grouped = new HashMap<>();
            while (rs.next()) grouped.computeIfAbsent(rs.getLong("challenge_id"), id -> new ArrayList<>()).add(saving(rs));
            return grouped;
        }, owner);
    }

    public void insertSaving(long challengeId, Saving saving) {
        jdbc.update("INSERT INTO savings_records (challenge_id, client_key, amount, saved_on, note) VALUES (?, ?, ?, ?, ?)",
                challengeId, saving.id(), saving.amount(), saving.date(), saving.note());
    }

    public boolean hasCompletedChallenge(long owner) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM savings_challenges c JOIN savings_records r ON r.challenge_id = c.id
                    WHERE c.user_id = ? GROUP BY c.id, c.target HAVING SUM(r.amount) >= c.target
                )
                """, Boolean.class, owner));
    }

    public boolean usesGoldenPig(long owner) {
        return jdbc.query("SELECT use_golden_pig FROM savings_preferences WHERE user_id = ?",
                (rs, ignored) -> rs.getBoolean(1), owner).stream().findFirst().orElse(false);
    }

    public void savePreference(long owner, boolean enabled) {
        jdbc.update("""
                INSERT INTO savings_preferences (user_id, use_golden_pig) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE use_golden_pig = ?
                """, owner, enabled, enabled);
    }

    private static Saving saving(ResultSet rs) throws SQLException {
        return new Saving(rs.getString("client_key"), rs.getLong("amount"),
                rs.getObject("saved_on", LocalDate.class), rs.getString("note"));
    }
}
