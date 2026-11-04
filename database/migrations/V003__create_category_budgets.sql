-- D07-DB: apply to the verified MVP schema after V002; never use this file as a baseline.
-- If category_budgets already exists, stop and compare its schema/history; do not rerun with --force.
-- Owner/category type and input validation remain in the Backend; foreign keys only enforce existence.
SET SESSION lock_wait_timeout = 10;

CREATE TABLE category_budgets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    `year` INT NOT NULL,
    `month` INT NOT NULL,
    amount_limit DECIMAL(15,2) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_category_budget_user_category_year_month
        UNIQUE (user_id, category_id, `year`, `month`),
    CONSTRAINT fk_category_budgets_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_category_budgets_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
