# SmartExpense Frontend

React 19, Vite 8, Tailwind CSS v4, Axios, Recharts và Lucide. Phiên bản nằm trong package.json và lockfile.

## Các màn hình

| Route | Nội dung |
| --- | --- |
| / | Landing hoặc Tổng quan theo phiên |
| /login, /register | Đăng nhập/đăng ký |
| /forgot-password, /reset-password | Khôi phục mật khẩu |
| /quick-add, /transactions | Thu chi nhanh, lịch sử, bộ lọc, CSV |
| /calendar | Lịch và chi tiết ngày |
| /categories | Danh mục |
| /budgets | Ngân sách tháng/danh mục |
| /recurring-templates | Mẫu định kỳ tự động |
| /reports | Báo cáo đa tháng |
| /savings-challenges | Mục tiêu, ảnh, thành tích và quỹ |

Trợ lý mở từ widget. Tổng quan có số dư khả dụng và tổng tiền trong quỹ. Design tokens dùng chung cho desktop/mobile và sáng/tối.

## Chạy local

~~~bash
npm ci
npm run dev
~~~

Đặt VITE_API_URL theo Backend local. Với Nginx cùng origin, API có tiền tố /api. Phiên được xác minh qua Backend.

## Quỹ và ảnh

V009 bật chọn ảnh. V010 bật nạp/rút. Overview trả funds khi quỹ sẵn sàng. Sau phản hồi nạp/rút thành công, giao diện cập nhật tiến độ, tiền trong quỹ và phần thưởng. Trước V010, ghi nhận tiến độ cũ vẫn có thể hoạt động.

Tiền thử thách có dấu chấm hàng nghìn khi nhập; API nhận số nguyên đồng. Timeout cần kiểm tra lịch sử trước khi gửi lại.

## Kiểm tra

Chạy npm test, npm run lint và npm run build. Lượt sau bổ sung quỹ đạt 725 test. QA trình duyệt dùng dữ liệu mẫu được ghi riêng. Build còn cảnh báo chunk trên 500 kB.
