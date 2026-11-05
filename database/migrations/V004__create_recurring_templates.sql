-- D08-DB: apply to the verified schema after V003; never use this file as a baseline.
-- If recurring_templates already exists, stop and compare its schema/history; do not rerun with --force.
-- Owner/category type and input validation remain in the Backend; foreign keys only enforce existence.
SET SESSION lock_wait_timeout = 10;

CREATE TABLE recurring_templates (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    type VARCHAR(20) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    day_of_month INT NOT NULL,
    note VARCHAR(500) NULL DEFAULT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    CONSTRAINT fk_recurring_templates_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_recurring_templates_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_recurring_templates_type
        CHECK (type IN ('INCOME', 'EXPENSE')),
    CONSTRAINT chk_recurring_templates_amount
        CHECK (amount > 0),
    CONSTRAINT chk_recurring_templates_day_of_month
        CHECK (day_of_month BETWEEN 1 AND 31),
    CONSTRAINT chk_recurring_templates_active
        CHECK (active IN (0, 1)),
    INDEX idx_recurring_templates_user_active
        (user_id, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
