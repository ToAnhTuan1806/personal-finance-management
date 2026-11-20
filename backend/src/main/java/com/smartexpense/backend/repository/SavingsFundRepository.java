package com.smartexpense.backend.repository;

import com.smartexpense.backend.dto.SavingsDtos.Funds;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
@RequiredArgsConstructor
public class SavingsFundRepository {
    public record Movement(String key, long amount, LocalDate date, String note, LocalDate completedOn) {}

    private static final String SELECT_MOVEMENTS = """
            SELECT m.challenge_id, m.client_key, m.amount, m.effective_on, m.note, m.completed_on
            FROM savings_fund_movements m
            """;

    private final JdbcTemplate jdbc;

    public boolean available() {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = DATABASE() AND table_name = 'savings_fund_movements'
                )
                """, Boolean.class));
    }

    public Funds balances(long owner, LocalDate through) {
        return jdbc.queryForObject("""
                SELECT
                    COALESCE((SELECT SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END)
                        FROM transactions WHERE user_id = ? AND transaction_date <= ?), 0) AS total,
                    COALESCE((SELECT SUM(m.amount) FROM savings_fund_movements m
                        JOIN savings_challenges c ON c.id = m.challenge_id
                        WHERE c.user_id = ?), 0) AS reserved
                """, (rs, ignored) -> {
            BigDecimal total = rs.getBigDecimal("total");
            BigDecimal reserved = rs.getBigDecimal("reserved");
            return new Funds(total, reserved, total.subtract(reserved));
        }, owner, through, owner);
    }

    public List<Movement> list(long challengeId) {
        return jdbc.query(SELECT_MOVEMENTS + " WHERE m.challenge_id = ? ORDER BY m.id",
                (rs, ignored) -> movement(rs), challengeId);
    }

    public Map<Long, List<Movement>> listForOwner(long owner) {
        return jdbc.query(SELECT_MOVEMENTS + """
                JOIN savings_challenges c ON c.id = m.challenge_id WHERE c.user_id = ? ORDER BY m.id
                """, rs -> {
            Map<Long, List<Movement>> grouped = new HashMap<>();
            while (rs.next()) grouped.computeIfAbsent(rs.getLong("challenge_id"), id -> new ArrayList<>()).add(movement(rs));
            return grouped;
        }, owner);
    }

    public void insert(long challengeId, Movement movement) {
        jdbc.update("""
                INSERT INTO savings_fund_movements (challenge_id, client_key, amount, effective_on, note, completed_on)
                VALUES (?, ?, ?, ?, ?, ?)
                """, challengeId, movement.key(), movement.amount(), movement.date(), movement.note(), movement.completedOn());
    }

    public boolean hasEarnedReward(long owner) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM savings_fund_movements m JOIN savings_challenges c ON c.id = m.challenge_id
                    WHERE c.user_id = ? AND m.completed_on IS NOT NULL
                )
                """, Boolean.class, owner));
    }

    private static Movement movement(ResultSet rs) throws SQLException {
        return new Movement(rs.getString("client_key"), rs.getLong("amount"),
                rs.getObject("effective_on", LocalDate.class), rs.getString("note"),
                rs.getObject("completed_on", LocalDate.class));
    }
}
