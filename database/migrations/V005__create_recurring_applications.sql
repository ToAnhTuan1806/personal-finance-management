-- D09-DB: apply to the verified schema after V004; never use this file as a baseline.
-- If recurring_applications already exists, stop and compare schema/history; do not rerun with --force.
-- Owner is resolved through recurring_templates.user_id; Backend enforces owner and atomic apply.
-- Deleting a transaction keeps its marker, including the unique template/year/month reservation.
SET SESSION lock_wait_timeout = 10;

CREATE TABLE recurring_applications (
    id BIGINT NOT NULL AUTO_INCREMENT,
    template_id BIGINT NOT NULL,
    `year` INT NOT NULL,
    `month` INT NOT NULL,
    transaction_id BIGINT NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_recurring_application_template_year_month
        UNIQUE (template_id, `year`, `month`),
    CONSTRAINT fk_recurring_applications_template
        FOREIGN KEY (template_id) REFERENCES recurring_templates(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_recurring_applications_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT chk_recurring_applications_year
        CHECK (`year` BETWEEN 1900 AND 2100),
    CONSTRAINT chk_recurring_applications_month
        CHECK (`month` BETWEEN 1 AND 12),
    INDEX idx_recurring_applications_transaction (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
