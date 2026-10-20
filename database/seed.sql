-- SmartExpense - Dữ liệu mẫu dùng CHỈ cho môi trường phát triển / demo.
-- Chạy sau khi Spring Boot (ddl-auto=update) đã tạo 4 bảng.
-- MySQL 8+, database: personal_finance_db
-- Demo login: demo@smartexpense.local / Demo@123456
-- KHÔNG dùng tài khoản và mật khẩu demo ở production.
-- Script idempotent theo khóa email, danh mục, ngân sách và ghi chú seed giao dịch.

USE personal_finance_db;
START TRANSACTION;

-- 1. Tài khoản mẫu: password_hash là BCrypt, KHÔNG phải mật khẩu thuần.
INSERT INTO users (full_name, email, password_hash, created_at)
SELECT 'Người dùng Demo', 'demo@smartexpense.local', '$2y$10$uFcBWHYXRxg9GPJBYDOfmuvBwsAQCbeVXjEko5YURJ7Lsp/KgUfbe', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE email = 'demo@smartexpense.local'
);

SET @demo_user_id := (
  SELECT id FROM users WHERE email = 'demo@smartexpense.local' LIMIT 1
);

-- 2. Danh mục: chỉ thêm các danh mục mẫu còn thiếu.
INSERT INTO categories (user_id, name, type, created_at)
SELECT @demo_user_id, d.name, d.type, NOW()
FROM (
  SELECT 'Lương' AS name, 'INCOME' AS type UNION ALL
  SELECT 'Thưởng', 'INCOME' UNION ALL
  SELECT 'Ăn uống', 'EXPENSE' UNION ALL
  SELECT 'Đi lại', 'EXPENSE' UNION ALL
  SELECT 'Mua sắm', 'EXPENSE' UNION ALL
  SELECT 'Hóa đơn', 'EXPENSE'
) AS d
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.user_id = @demo_user_id AND c.name = d.name AND c.type = d.type
);

-- 3. Giao dịch tháng 10/2026; nhãn [SEED] giúp chống thêm trùng khi chạy lại.
INSERT INTO transactions
    (user_id, category_id, type, amount, transaction_date, note, created_at)
SELECT @demo_user_id, c.id, t.type, t.amount, t.transaction_date, t.note, NOW()
FROM (
  SELECT 'Lương' AS category_name, 'INCOME' AS type, 12000000.00 AS amount,
         DATE('2026-10-01') AS transaction_date, '[SEED] Lương tháng 10' AS note UNION ALL
  SELECT 'Thưởng', 'INCOME', 1500000.00, DATE('2026-10-05'), '[SEED] Thưởng dự án' UNION ALL
  SELECT 'Ăn uống', 'EXPENSE', 120000.00, DATE('2026-10-02'), '[SEED] Ăn trưa' UNION ALL
  SELECT 'Đi lại', 'EXPENSE', 60000.00, DATE('2026-10-03'), '[SEED] Xăng xe' UNION ALL
  SELECT 'Mua sắm', 'EXPENSE', 850000.00, DATE('2026-10-06'), '[SEED] Mua đồ dùng' UNION ALL
  SELECT 'Hóa đơn', 'EXPENSE', 420000.00, DATE('2026-10-08'), '[SEED] Tiền điện' UNION ALL
  SELECT 'Ăn uống', 'EXPENSE', 90000.00, DATE('2026-10-12'), '[SEED] Cà phê' UNION ALL
  SELECT 'Đi lại', 'EXPENSE', 45000.00, DATE('2026-10-15'), '[SEED] Gửi xe'
) AS t
JOIN (
  SELECT MIN(id) AS id, user_id, name, type
  FROM categories
  GROUP BY user_id, name, type
) c ON c.user_id = @demo_user_id
    AND c.name = t.category_name AND c.type = t.type
WHERE NOT EXISTS (
  SELECT 1 FROM transactions x
  WHERE x.user_id = @demo_user_id AND x.note = t.note
    AND x.transaction_date = t.transaction_date AND x.type = t.type
);

-- 4. Ngân sách chung tháng 10/2026: một người dùng / một tháng.
INSERT INTO monthly_budgets (user_id, year, month, amount_limit)
SELECT @demo_user_id, 2026, 10, 3000000.00
WHERE NOT EXISTS (
  SELECT 1 FROM monthly_budgets b
  WHERE b.user_id = @demo_user_id AND b.year = 2026 AND b.month = 10
);

COMMIT;

-- Kiểm tra nhanh:
SELECT id, full_name, email FROM users WHERE id = @demo_user_id;
SELECT id, name, type FROM categories WHERE user_id = @demo_user_id ORDER BY type, name;
SELECT type, COUNT(*) AS so_giao_dich, SUM(amount) AS tong_tien
FROM transactions WHERE user_id = @demo_user_id AND transaction_date BETWEEN '2026-10-01' AND '2026-10-31'
GROUP BY type;
SELECT year, month, amount_limit FROM monthly_budgets WHERE user_id = @demo_user_id;
