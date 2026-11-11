-- D12-DB: apply to the verified schema after V005; never use this file as a baseline.
-- If password_reset_tokens already exists or users.auth_version already exists, stop and compare schema/history.
-- Do not rerun with --force or bypass schema verification.
SET SESSION lock_wait_timeout = 10;

-- 1. Cap nhat bang users: bo sung cot auth_version quan ly phien dang nhap va thu hoi JWT
ALTER TABLE users
    ADD COLUMN auth_version BIGINT NOT NULL DEFAULT 0;

-- 2. Tao bang password_reset_tokens luu tru token dat lai mat khau duoi dang SHA-256 hash
CREATE TABLE password_reset_tokens (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    used_at DATETIME(6) NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_password_reset_tokens_token_hash
        UNIQUE (token_hash),
    CONSTRAINT fk_password_reset_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_password_reset_tokens_user_id
        (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

