# SMARTEXPENSE – FINAL PRODUCTION DATABASE RESET & REALISTIC DEMO DATA REPORT

**Dự án:** SmartExpense (Quản lý Tài chính Cá nhân)  
**Môi trường:** Production VPS Ubuntu 24.04 (`221.121.4.142`)  
**Domain HTTPS:** `https://smartexpense-team3.duckdns.org`  
**Hệ quản trị CSDL:** MySQL 8.0 (Docker container `smartexpense-mysql`)  
**Database:** `personal_finance_db`  
**Thời gian thực hiện:** 23/10/2026  
**Vai trò:** Senior Spring Boot Engineer, MySQL Database Administrator & DevOps Engineer  

---

## 1. THỜI ĐIỂM SAO LƯU & KẾT QUẢ KIỂM TRA RESTORE

Trước khi thực hiện bất kỳ thao tác xóa nào trên Production, hệ thống đã thực hiện quy trình sao lưu và kiểm thử khôi phục độc lập:

- **Thời điểm sao lưu (Timestamp):** `2026-10-22 18:37:33 UTC` (`2026-10-23 01:37:33 GMT+7`)
- **Vị trí lưu trữ an toàn trên VPS:**  
  `/opt/smartexpense/backups/backup_personal_finance_db_20261022_183733.sql`  
  - Dung lượng: `9.073 bytes`
  - Quyền truy cập: `chmod 600` (chỉ root được đọc/ghi)
  - Mã băm MD5: `0852b302aa076ad0eb8083ec2a6abfdd`
- **Vị trí lưu trữ sao chép cục bộ (Off-site Local):**  
  `database/backups/backup_personal_finance_db_20261022_183733.sql` (nằm trong `.gitignore`, không đưa lên Git)
- **Kết quả kiểm tra Restore (Restore Verification):**
  - Đã tạo cơ sở dữ liệu tách biệt trên MySQL: `personal_finance_restore_test`
  - Đã nạp thử toàn bộ file dump vào database test
  - Đối soát số lượng bản ghi khôi phục thành công 100%:
    - `users`: 3 bản ghi
    - `categories`: 11 bản ghi
    - `transactions`: 24 bản ghi
    - `monthly_budgets`: 2 bản ghi
  - Sau khi kiểm tra thành công, database test đã được xóa sạch (`DROP DATABASE personal_finance_restore_test`).

---

## 2. PHẠM VI DỮ LIỆU ĐÃ XÓA (GIAI ĐOẠN B)

Thực hiện xóa an toàn bằng transaction DML, giữ nguyên cấu trúc bảng và schema, không reset AUTO_INCREMENT:

| Thứ tự | Bảng dữ liệu | Số bản ghi đã xóa | Nội dung dữ liệu đã dọn dẹp |
| :---: | :--- | :---: | :--- |
| 1 | `transactions` | 24 | Toàn bộ giao dịch thử nghiệm cũ của tháng 10/2026 |
| 2 | `monthly_budgets` | 2 | Các ngân sách cũ của User 1 và User 4 |
| 3 | `categories` | 11 | Các danh mục cũ của User 1 và User 4 |
| 4 | `users` | 3 | Các tài khoản test cũ: ID 1 (`totuan.18dz@gmail.com`), ID 3 (`totuan.test@gmail.com`), ID 4 (`totuan.1806dz@gmail.com`) |

### Bảo mật JWT Token cũ:
- Do AUTO_INCREMENT được giữ tự nhiên, tài khoản mới tạo nhận ID `5`.
- Tất cả JWT token cũ trước đây (chứa `sub: "1"`, `sub: "3"`, `sub: "4"`) hoàn toàn bị cách ly và không thể đọc hay can thiệp vào bất kỳ dữ liệu nào của User ID `5`.

---

## 3. TÀI KHOẢN CHÍNH THỨC ĐÃ TẠO (GIAI ĐOẠN C)

- **Họ và tên:** `Tô Anh Tuấn`
- **Email:** `totuan.18dz@gmail.com`
- **User ID trong MySQL:** `5`
- **Phương thức tạo:** REST API chuẩn `/api/auth/register` của Spring Boot
- **Mã hóa mật khẩu:** Spring Boot mã hóa bằng **BCrypt** (`$2a$10$RrD...`), tuyệt đối không lưu plaintext
- **Trạng thái xác thực:** Đăng nhập thành công qua `/api/auth/login`, nhận JWT Bearer hợp lệ với `sub: "5"`

---

## 4. DANH SÁCH DANH MỤC (GIAI ĐOẠN D)

Đã tạo đúng 11 danh mục độc lập cho User ID `5`:

| STT | Tên danh mục | Loại giao dịch | Mục đích sử dụng |
| :---: | :--- | :---: | :--- |
| 1 | `Lương` | **INCOME** | Thu nhập tiền lương hàng tháng |
| 2 | `Thưởng` | **INCOME** | Thưởng dự án, thưởng năng suất |
| 3 | `Thu nhập phụ` | **INCOME** | Thù lao freelance, tư vấn, dịch thuật |
| 4 | `Ăn uống` | **EXPENSE** | Thực phẩm, chợ, siêu thị, ăn trưa, cà phê |
| 5 | `Nhà ở` | **EXPENSE** | Tiền thuê phòng trọ hàng tháng |
| 6 | `Đi lại` | **EXPENSE** | Xăng xe máy, bảo dưỡng xe, phí gửi xe |
| 7 | `Mua sắm` | **EXPENSE** | Quần áo, đồ gia dụng, vật dụng cá nhân |
| 8 | `Hóa đơn` | **EXPENSE** | Tiền điện EVN, tiền nước, cước Internet, gói 4G |
| 9 | `Giải trí` | **EXPENSE** | Vé xem phim CGV, cà phê giao lưu, ca nhạc |
| 10 | `Sức khỏe` | **EXPENSE** | Thuốc men, khám răng, khám sức khỏe tổng quát |
| 11 | `Học tập` | **EXPENSE** | Khóa học trực tuyến, sách công nghệ và kỹ năng |

---

## 5. DỮ LIỆU GIAO DỊCH MÔ PHỎNG 3 THÁNG (GIAI ĐOẠN E)

Tổng cộng **84 giao dịch** mô phỏng tự nhiên từ 01/08/2026 đến 23/10/2026:
- Không có bất kỳ giao dịch nào có ngày tương lai (sau 23/10/2026).
- Ghi chú tiếng Việt tự nhiên, không chứa tiền tố `[TEST_E2E]`, `[SEED]`, `[DEMO]`.
- Số tiền phù hợp với chi tiêu cá nhân thực tế tại Việt Nam.

### Tổng hợp tài chính 3 tháng trong MySQL:

| Tháng | Số GD Thu | Số GD Chi | Tổng số GD | Tổng thu nhập (VND) | Tổng chi tiêu (VND) | Số dư khả dụng (VND) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **08/2026** | 2 | 26 | **28** | 15.800.000 ₫ | 7.310.000 ₫ | **+8.490.000 ₫** |
| **09/2026** | 3 | 25 | **28** | 16.400.000 ₫ | 7.565.000 ₫ | **+8.835.000 ₫** |
| **10/2026** | 2 | 26 | **28** | 15.500.000 ₫ | 7.420.000 ₫ | **+8.080.000 ₫** |
| **TỔNG CỘNG**| **7** | **77** | **84** | **47.700.000 ₫** | **22.295.000 ₫** | **+25.405.000 ₫** |

---

## 6. NGÂN SÁCH THÁNG (GIAI ĐOẠN F)

| Tháng | Hạn mức ngân sách | Thực tế chi tiêu | Ngân sách còn lại | Tỷ lệ sử dụng | Trạng thái |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **08/2026** | 9.500.000 ₫ | 7.310.000 ₫ | 2.190.000 ₫ | 76,95% | **An toàn (Safe)** |
| **09/2026** | 9.000.000 ₫ | 7.565.000 ₫ | 1.435.000 ₫ | 84,06% | **An toàn (Safe)** |
| **10/2026** | 9.000.000 ₫ | 7.420.000 ₫ | 1.580.000 ₫ | 82,44% | **An toàn (Safe)** |

---

## 7. KẾT QUẢ KIỂM THỬ REST API SPRING BOOT (GIAI ĐOẠN G)

Kiểm thử trực tiếp trên endpoint HTTPS Production (`https://smartexpense-team3.duckdns.org`):

1. **Authentication (`POST /api/auth/login`):**
   - HTTP Status: **200 OK**
   - Cấp phát JWT Bearer hợp lệ cho User ID `5`.
2. **Categories (`GET /api/categories`):**
   - HTTP Status: **200 OK**
   - Trả về đúng 11 danh mục, không trùng lặp.
3. **Transactions (`GET /api/transactions`):**
   - HTTP Status: **200 OK**
   - Tổng số phần tử: `84` giao dịch. Không có ngày tương lai (> 23/10/2026).
4. **Dashboard Summaries (`GET /api/dashboard/summary?month=YYYY-MM`):**
   - `month=2026-08`: Thu `15.800.000`, Chi `7.310.000`, Dư `8.490.000` (Khớp 100%).
   - `month=2026-09`: Thu `16.400.000`, Chi `7.565.000`, Dư `8.835.000` (Khớp 100%).
   - `month=2026-10`: Thu `15.500.000`, Chi `7.420.000`, Dư `8.080.000` (Khớp 100%).
5. **Donut Chart Phân bổ chi tiêu (`GET /api/dashboard/expenses-by-category`):**
   - Tháng 10/2026: Đủ 8 danh mục chi tiêu, tổng phân bổ đạt `7.420.000 ₫` khớp chính xác 100% với Total Expense.
6. **Budgets (`GET /api/budgets/{year}/{month}`):**
   - Đủ cả 3 tháng 08, 09, 10 với số tiền đã chi, còn lại và cờ `exceeded: false` chính xác.

---

## 8. TRẠNG THÁI HỆ THỐNG DOCKER COMPOSE

Kiểm tra tại `/opt/smartexpense`:

```text
NAME                    IMAGE                                                               STATUS                    PORTS
smartexpense-backend    ghcr.io/toanhtuan1806/personal-finance-management/backend:latest    Up (healthy)              8080/tcp
smartexpense-frontend   ghcr.io/toanhtuan1806/personal-finance-management/frontend:latest   Up (healthy)              127.0.0.1:8088->80/tcp
smartexpense-mysql      mysql:8.0                                                           Up (healthy)              3306/tcp, 33060/tcp
```

- Hệ thống HTTPS Let's Encrypt tại domain `https://smartexpense-team3.duckdns.org` hoạt động ổn định.
- Không phát sinh bất kỳ lỗi 500, 502 hay 504.
- Không có bất kỳ thông tin bí mật (mật khẩu, khóa riêng tư, token) bị đưa lên kho lưu trữ Git.
- Không tự động commit, push hay kích hoạt GitHub Actions CD.
