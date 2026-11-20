-- Ảnh mục tiêu tùy chọn. Quyền đọc được kiểm tra qua chủ sở hữu thử thách.
CREATE TABLE IF NOT EXISTS savings_challenge_covers (
    challenge_id BIGINT PRIMARY KEY,
    image_bytes MEDIUMBLOB NOT NULL,
    CONSTRAINT fk_savings_cover_challenge
        FOREIGN KEY (challenge_id) REFERENCES savings_challenges(id) ON DELETE CASCADE
) ENGINE=InnoDB;
