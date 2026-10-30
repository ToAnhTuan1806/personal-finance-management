-- DE XUAT D06-DB: Quynh can chot version/checksum va phe duyet truoc khi ap dung.
-- Chon dung database bang mysql --database; categories phai la InnoDB, chua co ca hai cot.
-- Neu da co cot: dung, doi chieu README; khong chay --force hoac tu doi SQL da ap dung.
SET SESSION lock_wait_timeout = 10;

-- Mot ALTER, them cuoi bang, khong UPDATE/backfill; INSTANT khong duoc ho tro thi fail, khong tu COPY.
ALTER TABLE categories
    ADD COLUMN icon VARCHAR(40) NULL DEFAULT NULL,
    ADD COLUMN color VARCHAR(7) NULL DEFAULT NULL,
    ALGORITHM=INSTANT;
