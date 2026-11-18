# Kiểm tra UI giao dịch định kỳ tự động — Chrome

Ngày kiểm tra: 18/11/2026. Trình duyệt: Google Chrome. URL local: http://127.0.0.1:5188/__recurring.html.

Preview dùng component `RecurringTemplates` và `ThemeProvider` thật từ worktree Frontend. API giả lập chỉ lưu dữ liệu trong RAM, không kết nối DB hoặc VPS. Helper nằm trong `frontend/node_modules/.cache/recurring-ui-20261118/`; không dùng nguồn hoặc log tại OneDrive.

## Kết quả đã quan sát trực tiếp

- Desktop sáng/tối: thẻ, số tiền, ngày tiếp theo, ghi chú và hướng dẫn hiển thị rõ. Không còn nút xác nhận từng kỳ.
- Lịch đang bật hiển thị `18/12/2026`, thu nhập hiển thị `05/12/2026`. Mẫu tắt hiển thị tạm dừng và ẩn ngày tiếp theo. Mẫu có ngày null hiển thị đang chuẩn bị lịch; không tự đoán ngày.
- Bộ lọc hoạt động: ban đầu 3 đang bật / 1 đã tắt; tắt Tiền điện còn 2 đang bật / 2 đã tắt; bật lại trở về 3 / 1. Không có hộp xác nhận ghi giao dịch từng tháng.
- Sửa mẫu: số tiền 0 bị chặn với thông báo “Số tiền phải lớn hơn 0.”; sửa thành `135790.25` lưu qua API giả lập, thẻ hiển thị `135.790,25 ₫`, ngày tiếp theo giữ nguyên, tổng số vẫn 4 mẫu.
- Biểu mẫu thêm/sửa có nhãn Tự động ghi nhận và hướng dẫn bắt đầu từ ngày lặp sau hôm nay. Mẫu ngày 31 có cảnh báo dùng ngày cuối tháng nếu cần.
- Chrome DevTools Responsive 400 × 763: sáng/tối đều xếp thẻ một cột, không thấy tràn ngang hoặc nút chồng nhau. Modal cuộn được tới công tắc, Hủy và Lưu mẫu. Hủy đóng modal và tổng số vẫn 4.
- Đã đóng DevTools và đưa preview về desktop sáng sau kiểm tra.

## Phạm vi kết luận

Đạt phần UI đã nêu trên Chrome với API giả lập. Không dùng kết quả này để khẳng định scheduler đã chạy hoặc ghi DB production. Luồng Backend/MySQL và migration V007 có kiểm thử riêng. Không commit/push/merge hoặc deploy trong lần kiểm tra UI này.
