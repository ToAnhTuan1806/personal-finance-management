-- Lưu thử thách, các khoản đã để dành và lựa chọn linh vật theo tài khoản.
CREATE TABLE IF NOT EXISTS savings_challenges (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    client_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(80) NOT NULL,
    target BIGINT NOT NULL,
    difficulty VARCHAR(6) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    UNIQUE KEY uq_savings_owner_key (user_id, client_key),
    CONSTRAINT fk_savings_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_savings_target CHECK (target > 0),
    CONSTRAINT chk_savings_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_savings_level CHECK (difficulty IN ('easy', 'medium', 'hard'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS savings_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    challenge_id BIGINT NOT NULL,
    client_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount BIGINT NOT NULL,
    saved_on DATE NOT NULL,
    note VARCHAR(250) NOT NULL,
    UNIQUE KEY uq_savings_record_key (challenge_id, client_key),
    CONSTRAINT fk_savings_record_challenge FOREIGN KEY (challenge_id) REFERENCES savings_challenges(id) ON DELETE CASCADE,
    CONSTRAINT chk_savings_record_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS savings_preferences (
    user_id BIGINT PRIMARY KEY,
    use_golden_pig BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_savings_preference_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
