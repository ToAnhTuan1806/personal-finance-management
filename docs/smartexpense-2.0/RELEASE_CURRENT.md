# Bàn giao SmartExpense hiện hành

Cập nhật ngày 22/11/2026.

## Phiên bản và nguồn xác nhận

| Phạm vi | Bằng chứng |
| --- | --- |
| Backend ảnh/quỹ | feature/tuan a81b616, PR #92 |
| Frontend ảnh/quỹ | feature/trang 0bb5ada, PR #93 |
| Bản tích hợp trong ảnh GitHub Actions người dùng gửi | dev 37fe844, CI #186 và CD #96 xanh |
| Migration VPS | Terminal ngày 22/11 xác nhận savings_challenge_covers và savings_fund_movements |
| Sao lưu VPS | Thông báo người dùng gửi, smartexpense-before-funds-20261122-124551.sql |
| Thử quỹ trên web | Người dùng xác nhận “Oke rồi” sau hướng dẫn nạp/rút |
| Bản thử nhiều tài khoản | Đã gỡ theo yêu cầu |

Xác nhận VPS do người dùng cung cấp. Đợt cập nhật tài liệu đối chiếu source và hồ sơ, không tạo lượt kiểm thử sản phẩm mới.

## Kiến trúc và dữ liệu

React → Nginx → Spring Boot → MySQL. JWT kiểm soát chủ dữ liệu. SMTP phục vụ email reset. Gemini hỗ trợ các câu hỏi theo thiết lập trợ lý.

| Nhóm | Bảng |
| --- | --- |
| Tài khoản và giao dịch | users, categories, transactions |
| Ngân sách | monthly_budgets, category_budgets |
| Định kỳ | recurring_templates, recurring_applications |
| Reset | password_reset_tokens |
| Thử thách | savings_challenges, savings_records, savings_preferences |
| Ảnh | savings_challenge_covers |
| Quỹ | savings_fund_movements |

Sau chuỗi migration có 13 bảng nghiệp vụ. Tiền giao dịch dùng BigDecimal/DECIMAL, thử thách dùng số nguyên đồng.

## Công thức

- Số dư tháng = thu tháng − chi tháng.
- Tổng tiền đang có = tổng thu − tổng chi đến hôm nay, qua mọi tháng.
- Tiền trong quỹ = nạp − rút.
- Số dư khả dụng = tổng tiền đang có − tiền đang giữ trong tất cả quỹ.
- Tiến độ = khoản cũ + nạp mới − rút. Phần trăm hiển thị tối đa 100%.

Backend khóa chủ tài khoản khi nạp/rút. Mỗi yêu cầu có ID để xử lý gửi lại. Cùng ID khác nội dung trả 409. Khoản rút dùng ngày hiện tại theo giờ Việt Nam. Phần thưởng đạt qua quỹ được lưu lại.

## Kiểm thử đã ghi nhận

| Lượt | Kết quả |
| --- | --- |
| Bàn giao 17/11 | Backend 1.279, Frontend 617 PASS, hồ sơ lịch sử |
| Nâng cấp AI 18/11 | Backend 1.407, Frontend 708 PASS theo hồ sơ |
| Quỹ và các fixture chịu ảnh hưởng | 270/270 Backend, 5 suite, 0 fail/error/skipped |
| Frontend quỹ | 725/725 PASS, lint/build đạt |
| MySQL quỹ | 9/9 SavingsChallengeIntegrationTests, nằm trong tổng Backend |
| Playwright API mẫu | Nạp/rút, số dư, khoản cũ, validation và mobile 390 px đạt |

Đọc các lượt/tập con riêng. Build còn cảnh báo chunk trên 500 kB. Chưa có lượt hồi quy toàn bộ mới trên production sau V010.

## Vận hành

CD tự chạy khi push dev/main. CI và CD độc lập trong workflow hiện tại. Người vận hành áp dụng SQL riêng theo [Migration](../../database/migrations/README.md). Trước phát hành cần kiểm tra commit, backup, schema và cấu hình, cùng image rollback.

V009/V010 được kiểm tra khả năng dùng bảng trước khi bật ảnh/quỹ. Gemini/SMTP cần kiểm tra theo môi trường. Xem [API](API_CONTRACT.md) và [QA](../qa/README.md).
