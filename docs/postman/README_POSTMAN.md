# Hướng dẫn kiểm thử SmartExpense bằng Postman

## Import
1. Mở Postman → **Import** → chọn `SmartExpense_Postman_Collection.json`.
2. Mở Collection → Variables → kiểm tra `baseUrl = http://localhost:8080`; chỉnh `testEmail` thành email mới nếu đã đăng ký trước đó.
3. Chạy Spring Boot, đảm bảo MySQL và `JWT_SECRET` hoạt động.

## Thứ tự chạy khuyến nghị
1. **01 Authentication** → Register (chạy lần đầu) → Login. Login tự lưu `accessToken` trong Collection Variables.
2. **02 Categories** → Create EXPENSE Category: tự lưu `categoryId`. Có thể thử GET/PUT.
3. **03 Transactions** → Create expense: tự lưu `transactionId`, sau đó GET/PUT/filter.
4. **04 Budgets** → PUT/GET ngân sách (tạm **chưa chạy DELETE**).
5. **05 Dashboard** → Xem tổng thu/chi và biểu đồ theo danh mục.
6. **06 Security** → Chạy các kiểm thử lỗi và JWT.
7. Cleanup: `03 Transactions/10 - Delete`, `04 Budgets/06 - Delete`, rồi có thể xóa danh mục không còn giao dịch bằng API DELETE.

## Lưu ý
- `categoryId` và `transactionId` phải được lưu từ lệnh Create trước khi gọi GET/PUT/DELETE theo ID.
- `testEmail` cần duy nhất. Request Register chạy lại với cùng email sẽ trả 409 như kiểm thử âm.
- Không chạy toàn bộ Collection không chọn lọc: nhiều request là negative tests hoặc cleanup và phụ thuộc thứ tự.
- `GET /api/categories?type=EXPENSE` và lọc giao dịch cần có JWT, mặc định thừa hưởng Bearer token của Collection.
- File này không chứa JWT hay mật khẩu thực tế của bạn, chỉ có mật khẩu demo dùng riêng cho tài khoản test.
- Test xem dữ liệu người dùng khác cần **tạo tài khoản thứ hai**, đăng nhập và kiểm tra quyền truy cập chéo bằng ID thực (không tự động hóa trong bộ cơ bản).
- Kết quả HTTP là **kỳ vọng theo code hướng dẫn**; nếu thực tế khác, xem response và log Backend để sửa.
- Nếu endpoint query lọc optional gây lỗi với Hibernate/MySQL khi tham số null, cần điều chỉnh TransactionRepository (ví dụ Specifications).

Đặt các file vào `docs/postman/` trong repository.
