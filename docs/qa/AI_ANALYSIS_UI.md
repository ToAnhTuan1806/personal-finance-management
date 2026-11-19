# Kiểm thử giao diện phân tích chatbot — 18/11/2026

Thực hiện trên repository Frontend `F:/RikkeiEdu/personal-finance-management-FE`, nhánh `feature/trang`. Mã nguồn đang ở working tree, chưa commit/push hoặc triển khai nâng cấp này.

## Thay đổi

- Thẻ phân tích riêng cho giải thích biến động, dự báo ngân sách và mô phỏng khoản mua; không lặp reply hoặc biểu đồ thống kê cũ.
- Tối đa 3 chỉ số và danh mục biến động. Giao dịch liên quan cùng cách tính/giới hạn thu gọn mặc định, người dùng chủ động mở.
- Chỉ số xếp theo hàng, số tiền không bị ngắt giữa chữ số trong chatbot hẹp.
- Mô phỏng hiển thị “Chưa lưu giao dịch”, không có nút lưu giao dịch.
- Liên kết sang Transactions mang khoảng ngày gồm cả hai đầu, type EXPENSE và categoryId tùy chọn. Trang nhận bộ lọc cả khi điều hướng tới trang đang mở.
- Kiểm tra schema/kind/status/kỳ, ngày và số tiền của analysis; chặn dữ liệu lẫn intent, bộ lọc/ID sai và query mơ hồ. Nội dung note hiển thị qua React text.

## Tự động

Thư mục `frontend`:

- `npm test`: **708/708 PASS**, 0 fail/skipped/cancelled (bao gồm 26 bài mới trong aiAnalysis.test.js).
- `npm run lint`: PASS.
- `npm run build`: PASS. Còn cảnh báo chunk >500 kB hiện có; không thêm dependency.

Test bao phủ schema hợp lệ/sai, status, evidence/date/filter, số lẻ/âm, mô phỏng chỉ đọc, SSR của thẻ và Transactions, query độc hại/mơ hồ, cùng trạng thái phân tích khi đóng/mở chatbot.

## Chrome trực tiếp

Preview riêng tại `http://127.0.0.1:5189/__ai-analysis.html`, import các component/service/controller thật và API giả lập trong bộ nhớ. Mọi API ghi bị từ chối; không dùng DB hoặc phiên đăng nhập thật. Bộ helper ở node_modules/.cache, không đưa vào commit.

| Tình huống | Quan sát |
| --- | --- |
| Hỏi vì sao chi nhiều | Thẻ có chênh lệch 900.000,25 ₫, các danh mục tăng và phần giao dịch liên quan thu gọn. |
| Mở bằng chứng | Hiện 3 giao dịch kèm ngày, ghi chú và số tiền; không tự bung toàn bộ hội thoại. |
| Xem giao dịch liên quan | Chatbot đóng, trang Transactions lọc 01–18/11/2026, EXPENSE, Ăn uống; hiện đúng 3 dòng dữ liệu giả lập. |
| Dự báo tháng | Cảnh báo vượt 66.667,17 ₫, dự chi 5.066.667,17 ₫, còn/ngày 83.333,29 ₫; không lặp biểu đồ. |
| Mô phỏng thiếu số tiền | Yêu cầu nêu số tiền cho lần mô phỏng, không dùng lại giá trị trước. |
| Mô phỏng mua tai nghe 1,2 triệu | Nhận 1.200.000 ₫, còn theo khoản đã biết −200.000,5 ₫, ước còn cuối tháng −1.266.667,17 ₫; có nhãn chưa lưu. |
| Sáng/tối, 400 px và 320 px | Thẻ, input, chỉ số và nút hoạt động; số tiền không đứt giữa chữ số. |
| Console | Chỉ có 404 favicon.ico của helper preview; không có lỗi JavaScript/API trong các luồng kiểm thử. |

Đây là **UI PASS với API giả lập**. Phép tính và truy vấn MySQL thật được kiểm thử độc lập ở Backend; chưa xác nhận end-to-end của bản nâng cấp trên VPS hoặc Gemini Live. Phạm vi mô phỏng hiện tại là hạn mức tổng tháng, không phải số dư ngân hàng hay mục tiêu tiết kiệm.
