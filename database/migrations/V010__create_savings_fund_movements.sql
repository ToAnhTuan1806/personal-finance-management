-- Quỹ tiết kiệm tách khỏi giao dịch thu chi và các ghi nhận tiến độ trước V010.
CREATE TABLE IF NOT EXISTS savings_fund_movements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    challenge_id BIGINT NOT NULL,
    client_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount BIGINT NOT NULL,
    effective_on DATE NOT NULL,
    note VARCHAR(250) NOT NULL,
    completed_on DATE NULL,
    UNIQUE KEY uq_savings_fund_movement_key (challenge_id, client_key),
    CONSTRAINT fk_savings_fund_challenge FOREIGN KEY (challenge_id) REFERENCES savings_challenges(id) ON DELETE CASCADE,
    CONSTRAINT chk_savings_fund_amount CHECK (amount <> 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
