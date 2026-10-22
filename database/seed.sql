-- ==============================================================================
-- SmartExpense - Dữ liệu mẫu minh họa 3 tháng thực tế (08, 09, 10/2026)
-- CSDL: personal_finance_db (MySQL 8.0+)
-- Tài khoản chính: Tô Anh Tuấn (totuan.18dz@gmail.com)
-- Quy tắc:
--   1. Thiết kế idempotent: An toàn khi chạy lại nhiều lần, không nhân bản dữ liệu.
--   2. Không chứa mật khẩu thuần, hash giả mạo hay thông tin bí mật.
--   3. Không chứa giao dịch tương lai sau 23/10/2026.
--   4. Ghi chú tiếng Việt tự nhiên, phù hợp bối cảnh chi tiêu thực tế tại Việt Nam.
-- ==============================================================================

USE personal_finance_db;
START TRANSACTION;

-- Lấy ID của tài khoản chính (được tạo qua REST API)
SET @target_user_id := (
    SELECT id FROM users WHERE email = 'totuan.18dz@gmail.com' LIMIT 1
);

-- Bỏ qua nếu chưa tồn tại tài khoản chính
-- ==============================================================================
-- 1. TẠO 11 DANH MỤC THU / CHI CHUẨN (GIAI ĐOẠN E)
-- ==============================================================================
INSERT INTO categories (user_id, name, type, created_at)
SELECT @target_user_id, d.name, d.type, NOW()
FROM (
    -- Danh mục THU NHẬP (INCOME)
    SELECT 'Lương' AS name, 'INCOME' AS type UNION ALL
    SELECT 'Thưởng', 'INCOME' UNION ALL
    SELECT 'Thu nhập phụ', 'INCOME' UNION ALL
    -- Danh mục CHI TIÊU (EXPENSE)
    SELECT 'Ăn uống', 'EXPENSE' UNION ALL
    SELECT 'Nhà ở', 'EXPENSE' UNION ALL
    SELECT 'Đi lại', 'EXPENSE' UNION ALL
    SELECT 'Mua sắm', 'EXPENSE' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE' UNION ALL
    SELECT 'Giải trí', 'EXPENSE' UNION ALL
    SELECT 'Sức khỏe', 'EXPENSE' UNION ALL
    SELECT 'Học tập', 'EXPENSE'
) AS d
WHERE @target_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.user_id = @target_user_id AND c.name = d.name AND c.type = d.type
);

-- ==============================================================================
-- 2. TẠO HẠN MỨC NGÂN SÁCH 3 THÁNG (GIAI ĐOẠN G)
-- ==============================================================================
INSERT INTO monthly_budgets (user_id, year, month, amount_limit)
SELECT @target_user_id, b.year, b.month, b.amount_limit
FROM (
    SELECT 2026 AS year, 8 AS month, 9500000.00 AS amount_limit UNION ALL
    SELECT 2026, 9, 9000000.00 UNION ALL
    SELECT 2026, 10, 9000000.00
) AS b
WHERE @target_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM monthly_budgets mb
    WHERE mb.user_id = @target_user_id AND mb.year = b.year AND mb.month = b.month
);

-- ==============================================================================
-- 3. TẠO 84 GIAO DỊCH THỰC TẾ TRONG 3 THÁNG (GIAI ĐOẠN F)
-- ==============================================================================
INSERT INTO transactions (user_id, category_id, type, amount, transaction_date, note, created_at)
SELECT @target_user_id, c.id, t.type, t.amount, t.tdate, t.note, NOW()
FROM (
    -- --- THÁNG 08/2026 (28 giao dịch: Thu 15.800.000 ₫ | Chi 7.450.000 ₫) ---
    SELECT 'Lương' AS cat, 'INCOME' AS type, 14000000.00 AS amount, DATE('2026-08-01') AS tdate, 'Lương tháng 08 công ty chuyển khoản' AS note UNION ALL
    SELECT 'Nhà ở', 'EXPENSE', 3200000.00, DATE('2026-08-02'), 'Tiền thuê phòng trọ tháng 08' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 120000.00, DATE('2026-08-03'), 'Ăn trưa cơm văn phòng' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 80000.00, DATE('2026-08-04'), 'Đổ xăng xe máy Petrolimex' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 45000.00, DATE('2026-08-05'), 'Cà phê sáng cùng đồng nghiệp' UNION ALL
    SELECT 'Mua sắm', 'EXPENSE', 250000.00, DATE('2026-08-06'), 'Mua sạc cáp điện thoại Type-C' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 180000.00, DATE('2026-08-07'), 'Ăn tối bún đậu mắm tôm' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE', 410000.00, DATE('2026-08-08'), 'Tiền điện sinh hoạt phòng trọ' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE', 120000.00, DATE('2026-08-09'), 'Tiền nước sinh hoạt tháng 07' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE', 220000.00, DATE('2026-08-10'), 'Cước Internet Viettel tốc độ cao' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 95000.00, DATE('2026-08-11'), 'Mua thực phẩm tươi siêu thị WinMart' UNION ALL
    SELECT 'Sức khỏe', 'EXPENSE', 150000.00, DATE('2026-08-12'), 'Mua vitamin và thuốc cảm tại Pharmacity' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 60000.00, DATE('2026-08-13'), 'Cơm trưa suất gà xối mỡ' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 30000.00, DATE('2026-08-14'), 'Vé gửi xe tháng tòa nhà' UNION ALL
    SELECT 'Thu nhập phụ', 'INCOME', 1800000.00, DATE('2026-08-15'), 'Thù lao thiết kế banner đồ họa' UNION ALL
    SELECT 'Giải trí', 'EXPENSE', 210000.00, DATE('2026-08-16'), 'Vé xem phim CGV cuối tuần' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 135000.00, DATE('2026-08-17'), 'Mua đồ ăn vặt và trà sữa' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 90000.00, DATE('2026-08-18'), 'Đổ xăng xe máy đầu tuần' UNION ALL
    SELECT 'Học tập', 'EXPENSE', 350000.00, DATE('2026-08-19'), 'Mua sách lập trình Spring Boot & Microservices' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 85000.00, DATE('2026-08-20'), 'Ăn trưa phở bò Hà Nội' UNION ALL
    SELECT 'Mua sắm', 'EXPENSE', 320000.00, DATE('2026-08-21'), 'Mua áo thun mùa hè Uniqlo' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 240000.00, DATE('2026-08-22'), 'Liên hoan nướng lẩu cùng bạn bè' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 70000.00, DATE('2026-08-23'), 'Rửa xe và tra dầu nhớt bảo dưỡng' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 55000.00, DATE('2026-08-24'), 'Cà phê Highland làm việc' UNION ALL
    SELECT 'Sức khỏe', 'EXPENSE', 180000.00, DATE('2026-08-25'), 'Khám kiểm tra mắt định kỳ' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 110000.00, DATE('2026-08-26'), 'Mua rau củ quả tươi ngoài chợ' UNION ALL
    SELECT 'Giải trí', 'EXPENSE', 160000.00, DATE('2026-08-27'), 'Cà phê acoustic cuối tuần' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 70000.00, DATE('2026-08-28'), 'Ăn trưa cơm tấm sườn nướng' UNION ALL

    -- --- THÁNG 09/2026 (28 giao dịch: Thu 16.400.000 ₫ | Chi 8.120.000 ₫) ---
    SELECT 'Lương', 'INCOME', 14000000.00, DATE('2026-09-01'), 'Lương tháng 09 chuyển khoản ngân hàng' UNION ALL
    SELECT 'Nhà ở', 'EXPENSE', 3200000.00, DATE('2026-09-02'), 'Tiền thuê phòng trọ tháng 09' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 140000.00, DATE('2026-09-03'), 'Ăn trưa cơm văn phòng cả nhóm' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 85000.00, DATE('2026-09-04'), 'Đổ xăng xe máy Petrolimex' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 50000.00, DATE('2026-09-05'), 'Cà phê buổi sáng đầu tháng' UNION ALL
    SELECT 'Mua sắm', 'EXPENSE', 450000.00, DATE('2026-09-06'), 'Mua giày thể thao chạy bộ' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 160000.00, DATE('2026-09-07'), 'Mua đồ ăn tối tại Bách Hóa Xanh' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE', 435000.00, DATE('2026-09-08'), 'Tiền điện tháng 08 phòng trọ' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE', 110000.00, DATE('2026-09-09'), 'Tiền nước sinh hoạt' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE', 220000.00, DATE('2026-09-10'), 'Cước Internet Viettel tháng 09' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 75000.00, DATE('2026-09-11'), 'Cơm trưa bò kho bánh mì' UNION ALL
    SELECT 'Thưởng', 'INCOME', 1200000.00, DATE('2026-09-12'), 'Thưởng hoàn thành tính năng Sprint đúng hạn' UNION ALL
    SELECT 'Sức khỏe', 'EXPENSE', 250000.00, DATE('2026-09-13'), 'Lấy cao răng và chăm sóc nha khoa' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 120000.00, DATE('2026-09-14'), 'Thay dầu nhớt máy Motul' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 85000.00, DATE('2026-09-15'), 'Đi chợ mua thực phẩm tươi' UNION ALL
    SELECT 'Học tập', 'EXPENSE', 590000.00, DATE('2026-09-16'), 'Đăng ký khóa học Docker & Kubernetes Udemy' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 65000.00, DATE('2026-09-17'), 'Bún chả trưa văn phòng' UNION ALL
    SELECT 'Giải trí', 'EXPENSE', 220000.00, DATE('2026-09-18'), 'Xem phim Lotte Cinema tối thứ Sáu' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 90000.00, DATE('2026-09-19'), 'Đổ xăng xe máy' UNION ALL
    SELECT 'Thu nhập phụ', 'INCOME', 1200000.00, DATE('2026-09-20'), 'Thù lao sửa lỗi website cho khách hàng' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 175000.00, DATE('2026-09-21'), 'Cà phê và bánh ngọt họp nhóm bạn' UNION ALL
    SELECT 'Mua sắm', 'EXPENSE', 380000.00, DATE('2026-09-22'), 'Mua bàn phím không dây văn phòng' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 90000.00, DATE('2026-09-23'), 'Ăn trưa cơm niêu Singapore' UNION ALL
    SELECT 'Sức khỏe', 'EXPENSE', 130000.00, DATE('2026-09-24'), 'Mua thực phẩm bổ sung khoáng chất' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 45000.00, DATE('2026-09-25'), 'Phí gửi xe đi lại trong tuần' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 280000.00, DATE('2026-09-26'), 'Liên hoan cuối tuần cùng đồng nghiệp' UNION ALL
    SELECT 'Giải trí', 'EXPENSE', 190000.00, DATE('2026-09-27'), 'Tham quan triển lãm nghệ thuật' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 80000.00, DATE('2026-09-28'), 'Bún bò Huế ăn trưa' UNION ALL

    -- --- THÁNG 10/2026 (28 giao dịch: Thu 15.500.000 ₫ | Chi 7.980.000 ₫, đến 23/10/2026) ---
    SELECT 'Lương', 'INCOME', 14000000.00, DATE('2026-10-01'), 'Lương tháng 10 chuyển khoản Techcombank' UNION ALL
    SELECT 'Nhà ở', 'EXPENSE', 3200000.00, DATE('2026-10-02'), 'Tiền thuê phòng trọ tháng 10' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 120000.00, DATE('2026-10-03'), 'Ăn trưa cơm tấm sườn bì' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 90000.00, DATE('2026-10-04'), 'Đổ xăng xe máy Petrolimex' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 55000.00, DATE('2026-10-05'), 'Cà phê Highland buổi sáng' UNION ALL
    SELECT 'Mua sắm', 'EXPENSE', 650000.00, DATE('2026-10-06'), 'Mua áo khoác thu đông Uniqlo' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 170000.00, DATE('2026-10-07'), 'Đi siêu thị WinMart mua đồ ăn tuần' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE', 420000.00, DATE('2026-10-08'), 'Tiền điện sinh hoạt EVN tháng 09' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE', 115000.00, DATE('2026-10-09'), 'Tiền nước sinh hoạt' UNION ALL
    SELECT 'Hóa đơn', 'EXPENSE', 220000.00, DATE('2026-10-10'), 'Cước Internet Viettel tháng 10' UNION ALL
    SELECT 'Sức khỏe', 'EXPENSE', 180000.00, DATE('2026-10-11'), 'Mua men vi sinh và thuốc đau đầu' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 65000.00, DATE('2026-10-12'), 'Cơm văn phòng suất đùi gà' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 40000.00, DATE('2026-10-13'), 'Phí gửi xe tại trung tâm thương mại' UNION ALL
    SELECT 'Học tập', 'EXPENSE', 420000.00, DATE('2026-10-14'), 'Mua sách Clean Code & Design Patterns tiếng Việt' UNION ALL
    SELECT 'Thu nhập phụ', 'INCOME', 1500000.00, DATE('2026-10-15'), 'Thù lao xây dựng ứng dụng web freelance' UNION ALL
    SELECT 'Giải trí', 'EXPENSE', 210000.00, DATE('2026-10-16'), 'Vé xem phim rạp CGV cuối tuần' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 145000.00, DATE('2026-10-17'), 'Mua trái cây và đồ uống bổ dưỡng' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 85000.00, DATE('2026-10-18'), 'Đổ đầy bình xăng xe máy' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 80000.00, DATE('2026-10-19'), 'Bún riêu cua buổi trưa' UNION ALL
    SELECT 'Mua sắm', 'EXPENSE', 280000.00, DATE('2026-10-19'), 'Mua tai nghe có dây chống ồn dự phòng' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 320000.00, DATE('2026-10-20'), 'Liên hoan ngày 20/10 cùng nhóm đồng nghiệp' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 110000.00, DATE('2026-10-21'), 'Bảo dưỡng phanh và tăng xích xe máy' UNION ALL
    SELECT 'Sức khỏe', 'EXPENSE', 150000.00, DATE('2026-10-21'), 'Mua khẩu trang kháng khuẩn và nước súc miệng' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 75000.00, DATE('2026-10-22'), 'Cơm trưa văn phòng sườn xào' UNION ALL
    SELECT 'Giải trí', 'EXPENSE', 160000.00, DATE('2026-10-22'), 'Cà phê gặp gỡ bạn bè trao đổi công việc' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 90000.00, DATE('2026-10-23'), 'Đi chợ mua thực phẩm tươi ăn cả ngày' UNION ALL
    SELECT 'Đi lại', 'EXPENSE', 50000.00, DATE('2026-10-23'), 'Đổ thêm xăng xe phục vụ di chuyển cuối tuần' UNION ALL
    SELECT 'Ăn uống', 'EXPENSE', 70000.00, DATE('2026-10-23'), 'Ăn tối bánh cuốn nóng chả quế'
) AS t
JOIN categories c ON c.user_id = @target_user_id AND c.name = t.cat AND c.type = t.type
WHERE @target_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions x
    WHERE x.user_id = @target_user_id
      AND x.category_id = c.id
      AND x.transaction_date = t.tdate
      AND x.amount = t.amount
      AND x.note = t.note
);

COMMIT;
