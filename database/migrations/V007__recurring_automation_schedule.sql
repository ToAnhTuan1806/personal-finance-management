-- V007: durable date for automatic monthly ledger entries.
-- Apply once after V006 on the verified schema. Does not generate transactions or backfill dates.
SET SESSION lock_wait_timeout = 10;
ALTER TABLE recurring_templates
    ADD COLUMN next_run_date DATE NULL DEFAULT NULL,
    ADD INDEX idx_recurring_templates_active_next_run (active, next_run_date, id);
