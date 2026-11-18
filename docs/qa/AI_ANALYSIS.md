# Nâng cấp phân tích chatbot — 18/11/2026

Backend ở `feature/tuan`, frontend ở `feature/trang`. Đây là kết quả kiểm thử local của working tree; chưa commit/push hoặc triển khai phiên bản nâng cấp này. Không thêm dependency hay migration. Schema hiện hành vẫn tới V007.

## Hành vi

- SPENDING_INSIGHT: so cùng số ngày khi tháng đang chạy, nêu tối đa 3 danh mục biến động và giao dịch lớn của danh mục đứng đầu; mở danh sách giao dịch đúng khoảng/danh mục.
- BUDGET_FORECAST: chi đã ghi + định kỳ chưa ghi còn tới hạn + nhịp chi thường ngày ước cho các ngày còn lại. Loại giao dịch liên kết định kỳ khỏi nhịp chi để không nhân lặp.
- PURCHASE_SIMULATION: mỗi lần nhận một số tiền mới; chỉ tính tác động tới ngân sách tổng tháng, không ghi giao dịch và không tái sử dụng số tiền cũ.
- Không có ngân sách, thiếu lịch sử, kỳ tương lai/tháng khác hoặc thiếu số tiền đều có trạng thái riêng. Không biến dữ liệu thiếu thành kết luận an toàn.
- Cả ba đường đều truy vấn theo JWT owner, không gọi Gemini. ADVICE vẫn phụ thuộc cấu hình Gemini hiện có.

Contract đầy đủ, công thức và miền dữ liệu: [API_CONTRACT.md](../smartexpense-2.0/API_CONTRACT.md#phân-tích-chi-tiêu-dự-báo-và-mô-phỏng--nâng-cấp-ngày-18112026).

## Kết quả Backend

Thư mục chạy: `F:/RikkeiEdu/personal-finance-management/backend`.

- `./gradlew test --max-workers=1 --console=plain`: **1.407 tests PASS**, 0 failure/error/skipped, 54 suites (đọc JUnit XML sau lần chạy đầy đủ 14m35s).
- `./gradlew verifyD03IntegrationTests bootJar --max-workers=1 --console=plain`: PASS; verifier xác nhận 55 D03 MySQL tests, 0 skipped/failure/error; bootJar thành công.
- Thêm 25 unit/parser cases, 3 integration cases dùng MySQL thật qua harness local và 3 trường hợp HTTP/JWT trong AiChatApiTests.
- Kiểm tra số lẻ, nhiều mệnh giá, số tiền không hợp lệ/mơ hồ; cùng kỳ tới hôm nay, năm nhuận, biên tháng và múi giờ; không trộn giao dịch người khác hoặc ngày tương lai.
- Integration kiểm tra SUM/projection thực, eligibility của lịch định kỳ, recurring marker đã ghi/xóa/tắt/quá hạn và đếm bảng trước/sau phân tích để chứng minh không phát sinh ghi.

Ví dụ phép tính đã kiểm thử: đã ghi 600, gồm 500 định kỳ đã áp dụng, còn 200 lịch hợp lệ, hạn mức 1.000, ngày 10/30, V=100 → dự chi 1.000. Mua giả định 100,25 → còn theo khoản đã biết 99,75; ước còn cuối tháng −100,25.

## Phối hợp Frontend và vận hành

Frontend kiểm tra 708 tests PASS, lint/build PASS; Chrome kiểm thử với API giả lập loopback, không ghi DB. Xem báo cáo `docs/qa/AI_ANALYSIS_UI.md` trong repository Frontend. Build còn cảnh báo chunk >500 kB hiện có.

CD #87 của phiên bản trước đã rerun thành công trước khi tiếp tục tính năng này; thành công đó không chứng minh code mới đã lên VPS. Không thay workflow, Compose, secrets hoặc model để triển khai ba tính năng nội bộ này. Khi tích hợp cần đưa cả BE/FE mới lên cùng phiên bản; không xác nhận end-to-end VPS từ kiểm thử API mock.
