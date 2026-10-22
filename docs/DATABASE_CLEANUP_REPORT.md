# SMARTEXPENSE – PRODUCTION DATABASE CLEANUP & SEED DATA REPORT

**Dự án:** SmartExpense (Quản lý Tài chính Cá nhân)  
**Môi trường:** Production VPS Ubuntu 24.04 (`221.121.4.142`)  
**Hệ quản trị CSDL:** MySQL 8.0 (Docker container `smartexpense-mysql`)  
**Thời gian thực hiện:** 23/10/2026  
**Người thực hiện:** Senior Spring Boot Developer & Database Administrator  

---

## 1. THỜI ĐIỂM VÀ THÔNG TIN SAO LƯU (BACKUP)

Trước khi thực hiện bất kỳ thao tác xóa nào, toàn bộ cơ sở dữ liệu `personal_finance_db` đã được sao lưu đầy đủ và kiểm chứng tính toàn vẹn:

- **Thời điểm sao lưu gốc (Pre-cleanup):** `2026-10-22 17:27:21 UTC` (`2026-10-23 00:27:21 GMT+7`)
- **Thời điểm sao lưu bổ sung (Snapshot):** `2026-10-22 17:40:30 UTC` (`2026-10-23 00:40:30 GMT+7`)
- **Vị trí lưu trữ trên VPS:**  
  `/opt/smartexpense/backups/backup_personal_finance_db_20261022_172721.sql` (7.251 bytes)  
  `/opt/smartexpense/backups/backup_personal_finance_db_20261022_174030.sql` (5.027 bytes)
- **Vị trí lưu trữ sao chép cục bộ (Local Off-site):**  
  `database/backups/backup_personal_finance_db_20261022_172721.sql`  
  `database/backups/backup_personal_finance_db_20261022_174030.sql`
- **Tính an toàn:** Tệp sao lưu không chứa mật khẩu tài khoản ở dạng plaintext; toàn bộ mật khẩu người dùng trong dump là chuỗi băm BCrypt (`$2a$`, `$2y$`).
- **Phương án phục hồi (Restore Plan):**
  - *Trên VPS:*
    ```bash
    PASS=$(grep '^DB_ROOT_PASSWORD=' /opt/smartexpense/.env | cut -d '=' -f2- | tr -d '\r')
    cat /opt/smartexpense/backups/backup_personal_finance_db_20261022_172721.sql | docker exec -i smartexpense-mysql mysql -u root -p"$PASS" personal_finance_db
    ```
  - *Từ máy cục bộ qua PowerShell:*
    ```powershell
    .\scripts\restore-db.ps1 -BackupFile "database/backups/backup_personal_finance_db_20261022_172721.sql"
    ```

---

## 2. PHẠM VI DỮ LIỆU ĐÃ XÓA (CLEANUP AUDIT)

Tuân thủ nguyên tắc an toàn: Không xóa Docker volumes, không drop database, không thay đổi Entity/schema, tuân thủ chặt chẽ thứ tự khóa ngoại (Foreign Keys):

| Thứ tự xóa | Bảng dữ liệu | Số bản ghi đã xóa | Mô tả dữ liệu đã dọn dẹp |
| :---: | :--- | :---: | :--- |
| 1 | `transactions` | 8 | Các giao dịch seed thử nghiệm ban đầu của tài khoản demo cũ |
| 2 | `monthly_budgets` | 1 | Ngân sách mẫu của tài khoản demo cũ |
| 3 | `categories` | 6 | Danh mục của tài khoản demo cũ |
| 4 | `users` | 5 | Tài khoản demo (`demo@smartexpense.local`) và các tài khoản test đăng ký (`test_reg_*`, `verify_user_*`, `browser_user_*`) |

---

## 3. TÀI KHOẢN CHÍNH ĐÃ TẠO

Tài khoản chính thức duy nhất được tạo thông qua REST API `/api/auth/register` của Spring Boot:

- **Họ và tên:** `Tô Anh Tuấn`
- **Email:** `totuan.18dz@gmail.com`
- **Mã định danh (User ID):** `1`
- **Cơ chế mật khẩu:** Mật khẩu do người dùng chỉ định được Spring Boot mã hóa bằng BCrypt (`BCryptPasswordEncoder`, độ phức tạp cost 10) trước khi lưu vào MySQL.
- **Hash trong CSDL:** `$2a$10$FjVC1KL3HBAHzx.ms33tJexg9zRhcZIPIScw1XxBLF5DEdvKhihjG` (Tuyệt đối không lưu plaintext ở bất kỳ đâu).
- **Trạng thái xác thực:** Đăng nhập thành công qua `/api/auth/login`, cấp phát JWT Bearer token hợp lệ, truy cập được toàn bộ dữ liệu cá nhân.

---

## 4. DỮ LIỆU TÀI CHÍNH MẪU (SEED DATA THÁNG 10/2026)

Toàn bộ dữ liệu tài chính được lưu thật trong MySQL thuộc sở hữu của User ID `1`, không sử dụng dữ liệu số dư hay biểu đồ giả ở Frontend.

### 4.1. Danh mục (10 danh mục)
- **Thu nhập (INCOME - 3 danh mục):**
  1. `Lương`
  2. `Thưởng`
  3. `Thu nhập phụ`
- **Chi tiêu (EXPENSE - 7 danh mục):**
  1. `Ăn uống`
  2. `Đi lại`
  3. `Mua sắm`
  4. `Hóa đơn`
  5. `Nhà ở`
  6. `Giải trí`
  7. `Sức khỏe`

### 4.2. Giao dịch (24 giao dịch thực tế trong tháng 10/2026)
*Các giao dịch diễn ra từ 01/10/2026 đến 23/10/2026 (không có ngày tương lai sau 23/10/2026), ghi chú tự nhiên bằng tiếng Việt, không chứa tiền tố `[TEST_E2E]` hay `[SEED]`.*

| Ngày | Danh mục | Loại | Số tiền (VND) | Ghi chú giao dịch |
| :---: | :--- | :---: | :---: | :--- |
| 01/10/2026 | Lương | INCOME | 18.500.000 | Lương tháng 10 chuyển khoản Techcombank |
| 02/10/2026 | Nhà ở | EXPENSE | 3.500.000 | Tiền thuê căn hộ tháng 10 |
| 03/10/2026 | Ăn uống | EXPENSE | 460.000 | Đi siêu thị WinMart mua thực phẩm tuần |
| 04/10/2026 | Đi lại | EXPENSE | 85.000 | Đổ xăng xe máy Petrolimex |
| 05/10/2026 | Ăn uống | EXPENSE | 290.000 | Ăn tối liên hoan cùng nhóm bạn |
| 06/10/2026 | Thưởng | INCOME | 3.200.000 | Thưởng dự án hoàn thành đúng tiến độ |
| 07/10/2026 | Ăn uống | EXPENSE | 55.000 | Cà phê Highland làm việc buổi sáng |
| 08/10/2026 | Hóa đơn | EXPENSE | 520.000 | Tiền điện sinh hoạt EVN tháng trước |
| 09/10/2026 | Hóa đơn | EXPENSE | 250.000 | Cước Internet cáp quang Viettel |
| 10/10/2026 | Sức khỏe | EXPENSE | 165.000 | Mua vitamin C và khẩu trang y tế tại Pharmacity |
| 11/10/2026 | Đi lại | EXPENSE | 140.000 | Thay dầu nhớt bảo dưỡng xe máy |
| 12/10/2026 | Mua sắm | EXPENSE | 380.000 | Mua áo sơ mi công sở Uniqlo |
| 13/10/2026 | Giải trí | EXPENSE | 190.000 | Vé xem phim CGV cuối tuần |
| 14/10/2026 | Ăn uống | EXPENSE | 65.000 | Cơm trưa văn phòng giao tận nơi |
| 15/10/2026 | Thu nhập phụ | INCOME | 2.500.000 | Thù lao tư vấn kỹ thuật freelance |
| 16/10/2026 | Mua sắm | EXPENSE | 230.000 | Mua kệ để sách và đồ gia dụng mini |
| 17/10/2026 | Ăn uống | EXPENSE | 410.000 | Mua hải sản và rau củ tươi nấu ăn gia đình |
| 18/10/2026 | Đi lại | EXPENSE | 120.000 | Phí gửi xe tháng cơ quan |
| 19/10/2026 | Sức khỏe | EXPENSE | 350.000 | Khám và lấy cao răng định kỳ |
| 20/10/2026 | Mua sắm | EXPENSE | 420.000 | Quà sinh nhật tặng bạn thân |
| 21/10/2026 | Hóa đơn | EXPENSE | 60.000 | Phí dịch vụ vệ sinh và rác khu phố |
| 22/10/2026 | Giải trí | EXPENSE | 210.000 | Mua hai cuốn sách chuyên ngành lập trình |
| 22/10/2026 | Ăn uống | EXPENSE | 95.000 | Cà phê chiều gặp gỡ đối tác |
| 23/10/2026 | Hóa đơn | EXPENSE | 100.000 | Nạp gói data 4G Viettel tốc độ cao |

### 4.3. Ngân sách tháng (Monthly Budget)
- **Kỳ áp dụng:** Tháng 10/2026 (`year: 2026, month: 10`)
- **Hạn mức (Amount Limit):** `10.000.000 VND`
- **Đã chi (Spent Amount):** `8.095.000 VND`
- **Còn lại (Remaining):** `1.905.000 VND`
- **Tỷ lệ sử dụng:** `80,95%` (Trạng thái: Chưa vượt ngân sách - `exceeded: false`)

---

## 5. TỔNG HỢP SỐ LIỆU TÀI CHÍNH & KẾT QUẢ KIỂM THỬ API

Toàn bộ các phép tổng hợp của Spring Boot trả về khớp 100% với dữ liệu trong MySQL:

| Chỉ số tài chính | Giá trị tính toán (VND) | Kết quả API Spring Boot (`/api/dashboard/summary`) | Trạng thái |
| :--- | :---: | :---: | :---: |
| **Tổng thu nhập (Total Income)** | 24.200.000 ₫ | `24200000.00` | **KHỚP 100%** |
| **Tổng chi tiêu (Total Expense)** | 8.095.000 ₫ | `8095000.00` | **KHỚP 100%** |
| **Số dư khả dụng (Net Balance)** | 16.105.000 ₫ | `16105000.00` | **KHỚP 100%** |

### Chi tiết phân bổ chi tiêu Donut Chart (`/api/dashboard/expenses-by-category`):
- **Nhà ở:** 3.500.000 ₫ (43,24%)
- **Ăn uống:** 1.375.000 ₫ (16,99%)
- **Mua sắm:** 1.030.000 ₫ (12,72%)
- **Hóa đơn:** 930.000 ₫ (11,49%)
- **Sức khỏe:** 515.000 ₫ (6,36%)
- **Giải trí:** 400.000 ₫ (4,94%)
- **Đi lại:** 345.000 ₫ (4,26%)
- **Tổng chi tiêu theo danh mục:** **8.095.000 ₫** (Khớp chính xác với Total Expense).

### Kết quả kiểm thử các endpoint REST API:
- `POST /api/auth/login`: **HTTP 200 OK** – Trả về JWT hợp lệ.
- `GET /api/dashboard/summary?month=2026-10`: **HTTP 200 OK** – Dữ liệu chính xác.
- `GET /api/dashboard/expenses-by-category?month=2026-10`: **HTTP 200 OK** – 7 mục chi tiêu.
- `GET /api/categories`: **HTTP 200 OK** – Trả về đủ 10 danh mục.
- `GET /api/transactions?page=0&size=50`: **HTTP 200 OK** – `totalElements: 24`.
- `GET /api/budgets/2026/10`: **HTTP 200 OK** – Hạn mức 10.000.000 ₫, chi 8.095.000 ₫.
- **Bảo mật:** Không có dữ liệu của tài khoản khác tồn tại trong CSDL, không có bản ghi trùng lặp.

---

## 6. TRẠNG THÁI DOCKER COMPOSE TRÊN VPS

Kiểm tra hệ thống dịch vụ tại `/opt/smartexpense`:

```text
NAME                    IMAGE                                                               STATUS                 PORTS
smartexpense-backend    ghcr.io/toanhtuan1806/personal-finance-management/backend:latest    Up (healthy)           8080/tcp
smartexpense-frontend   ghcr.io/toanhtuan1806/personal-finance-management/frontend:latest   Up (healthy)           127.0.0.1:8088->80/tcp
smartexpense-mysql      mysql:8.0                                                           Up (healthy)           3306/tcp, 33060/tcp
```

Tất cả 3 container đang hoạt động bình thường, tài nguyên ổn định, chứng chỉ HTTPS Let's Encrypt tại `https://smartexpense-team3.duckdns.org` hoạt động trơn tru.

---

## 7. RỦI RO & KHUYẾN NGHỊ

1. **Phiên bản Frontend trên VPS:** Hiện tại Frontend trên VPS đang chạy phiên bản image cũ (trước khi nhánh `feature/auth-ui-dashboard-fix` được merge). Sau khi người dùng xác nhận merge vào `dev`, GitHub Actions CD sẽ tự động build image mới và cập nhật giao diện Dashboard công khai + ảnh nền Auth lên VPS.
2. **Bảo mật file seed:** Script `seed_totuan_data.sql` không chứa mật khẩu tài khoản và nằm trong thư mục tạm `scratch/` không đẩy lên Git.
3. **Sao lưu định kỳ:** Đã thiết lập sẵn vị trí lưu trữ tại `/opt/smartexpense/backups/`. Khuyến nghị tạo cron job tự động sao lưu hàng tuần nếu dự án bắt đầu nhập liệu tài chính thực tế.
