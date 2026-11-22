# SmartExpense — Kịch bản demo ngày 23/11/2026

## Trình tự 5–7 phút

| Thời lượng | Thao tác | Điểm cần giới thiệu |
| --- | --- | --- |
| 30 giây | Trang chủ, đăng nhập tài khoản trình diễn | Bài toán quản lý thu chi và mục tiêu tiết kiệm |
| 60 giây | Tổng quan, chọn tháng, mở một ngày trên Lịch | Thu, chi và số dư được tổng hợp theo dữ liệu đã ghi |
| 45 giây | Ghi nhanh một khoản chi trên tài khoản trình diễn | Kiểm tra số tiền, danh mục và ngày trước khi lưu |
| 45 giây | Ngân sách và Báo cáo | Ngưỡng cảnh báo, so sánh tháng, xuất CSV |
| 30 giây | Mẫu giao dịch định kỳ đang bật | Tự ghi theo ngày đến hạn, mỗi mẫu/kỳ một lần |
| 60–90 giây | Thử thách có ảnh, nạp rồi rút quỹ | Tiến độ và số dư khả dụng thay đổi tương ứng |
| 45 giây | Hỏi trợ lý tài chính | Tra cứu số liệu và soạn đề xuất khoản chi để xác nhận |
| 30 giây | Kết thúc | Công nghệ, kiểm thử và hướng phát triển |

## Chuẩn bị tài khoản trình diễn

Dùng tài khoản dành riêng cho demo. Kiểm tra kỳ đang chọn và đọc số tiền trực tiếp trên màn hình. Chọn thử thách còn hoạt động, chưa đạt mục tiêu và có số dư khả dụng đủ để nạp.

Có thể nạp 10.000 ₫ rồi rút lại 10.000 ₫. Theo dõi tiền trong quỹ và số dư khả dụng sau mỗi thao tác. Khoản tiết kiệm ghi trước V010 vẫn tính tiến độ, nên tiền trong quỹ có thể khác số đã tiết kiệm.

Ngày định kỳ dùng giờ Việt Nam. Chọn ngày demo là hôm nay để giải thích lịch bắt đầu trong tháng này. Worker kiểm tra khoảng một phút; dùng mẫu đã chuẩn bị nếu thời lượng trình diễn ngắn.

## Câu hỏi trợ lý nên dùng

- “Tháng này tôi chi bao nhiêu?”
- “Danh mục nào chi nhiều nhất?”
- “So với tháng trước thì sao?”
- “Ăn trưa 80k” để hiển thị thẻ đề xuất rồi giải thích bước xác nhận.
- Câu hỏi tư vấn chung chỉ demo sau khi đã kiểm tra Gemini trên môi trường trình diễn.

## Dự phòng

Mở thử slide, video và thư viện ảnh trước buổi báo cáo. Bộ D18 dùng ảnh giao diện giai đoạn trước và dữ liệu QA, nên phần quỹ mới cần được giới thiệu bằng web hiện hành. Video D18 dài 24 giây, gồm 8 ảnh, 1280×720, không tiếng.

Mất mạng thì mở D18/Demo-du-phong.html cùng thư mục images hoặc video. AI lỗi thì tiếp tục các luồng nội bộ và nêu trạng thái thực tế. Timeout khi lưu cần kiểm tra lịch sử trước khi thử lại.

## Câu hỏi kỹ thuật thường gặp

| Câu hỏi | Cách giải thích |
| --- | --- |
| Dữ liệu mỗi người được bảo vệ thế nào? | Backend lấy owner từ JWT và kiểm tra quyền theo tài khoản. |
| Số dư tháng khác số dư khả dụng thế nào? | Số dư tháng tính trong kỳ đang xem; khả dụng lấy tổng tiền đến hôm nay trừ toàn bộ quỹ. |
| Nạp quỹ ảnh hưởng báo cáo chi thế nào? | Nạp/rút lưu vào lịch sử quỹ riêng. Báo cáo chi dựa vào giao dịch EXPENSE. |
| Định kỳ có chạy tự động không? | Có. Mẫu bật được worker kiểm tra theo ngày Việt Nam, có marker chống trùng mỗi kỳ. |
| Chống nạp/rút trùng ra sao? | ID yêu cầu và transaction; khóa owner khi kiểm tra và ghi tiền quỹ. |
| Tiền lưu kiểu gì? | Giao dịch dùng BigDecimal/DECIMAL; thử thách dùng số nguyên đồng. |
| Chatbot gọi Gemini lúc nào? | Các luồng tra cứu có dữ liệu nội bộ; câu hỏi mở theo cài đặt trợ lý có thể gọi Gemini. |
| Bản triển khai có migration chưa? | Người vận hành đã xác nhận V009/V010 trên VPS ngày 22/11/2026. |
