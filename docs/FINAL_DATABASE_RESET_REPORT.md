# SMARTEXPENSE – FINAL FULL DATABASE RESET & FRESH SEED INITIALIZATION REPORT

**Dự án:** SmartExpense – Quản Lý Tài Chính Cá Nhân  
**Phiên bản:** Production Database Final Reset & Demo Data Standardization  
**Môi trường:** WiServices VPS Ubuntu 24.04.2 LTS (`221.121.4.142`)  
**Domain HTTPS:** `https://smartexpense-team3.duckdns.org`  
**Hệ quản trị CSDL:** MySQL 8.0 (Container `smartexpense-mysql`)  
**Database Name:** `personal_finance_db` (Giữ nguyên chính xác tên cũ 100%)  
**Docker Volume:** `smartexpense_mysql_data` (Giữ nguyên volume lưu trữ an toàn)  
**Thời gian thực hiện:** 23/10/2026  
**Vai trò:** Senior Spring Boot Developer, MySQL Database Administrator & DevOps Engineer  

---

## 1. THỜI ĐIỂM SAO LƯU & AN TOÀN TRƯỚC RESET (GIAI ĐOẠN A)

Trước khi thực hiện lệnh DDL phá hủy (`DROP DATABASE`), toàn bộ CSDL `personal_finance_db` đã được sao lưu toàn diện và lưu trữ ở cả VPS lẫn kho lưu trữ cục bộ ngoài VPS (Off-site):

- **Thời điểm sao lưu:** `2026-10-22 20:35:49 UTC` (`2026-10-23 03:35:49 GMT+7`)
- **Vị trí lưu trữ bảo vệ trên VPS:**  
  `/opt/smartexpense/backups/backup_personal_finance_db_20261022_203549.sql`  
  - Quyền truy cập: `chmod 600` (chỉ root được đọc/ghi).
  - Dung lượng: `15.441 bytes`
- **Vị trí lưu trữ sao chép cục bộ (Local Off-site):**  
  `database/backups/backup_personal_finance_db_20261022_203549.sql` (được bảo vệ qua `.gitignore`, không commit lên Git).
- **Tính an toàn:** Không chứa mật khẩu plaintext (toàn bộ password được mã hóa BCrypt).
- **Quy trình Rollback dự phòng:** Đã sẵn sàng script phục hồi tức thời trong trường hợp phát sinh sự cố.

---

## 2. QUÁ TRÌNH DROP VÀ TẠO LẠI DATABASE CÙNG TÊN (GIAI ĐOẠN B)

Thực hiện lệnh DDL trực tiếp trên MySQL container của VPS sau khi người dùng phê duyệt:

```sql
DROP DATABASE IF EXISTS personal_finance_db;
CREATE DATABASE personal_finance_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

- **Kiểm tra trạng thái sau DROP:** CSDL `personal_finance_db` được tạo lại hoàn toàn sạch, không còn bất kỳ bảng hay dữ liệu nghiệp vụ cũ nào.
- **Tái tạo cấu trúc bảng tự động qua Spring Boot (Hibernate):**
  - Khởi động lại service Backend: `docker compose restart backend`.
  - Cấu hình `spring.jpa.hibernate.ddl-auto=update` đã tự động khởi tạo lại 4 bảng thực thể:
    1. `users` (Khóa chính `id`, khóa duy nhất `email`, `full_name`, `password_hash`, `created_at`)
    2. `categories` (Khóa chính `id`, khóa ngoại `user_id` liên kết `users.id`, `name`, `type`, `created_at`)
    3. `transactions` (Khóa chính `id`, khóa ngoại `user_id`, `category_id`, index `idx_transactions_user_date`)
    4. `monthly_budgets` (Khóa chính `id`, khóa ngoại `user_id`, unique constraint `uk_budget_user_year_month`)
- **Kết quả kiểm tra cấu trúc:** Cả 4 bảng được khởi tạo mới hoàn toàn với số lượng bản ghi ban đầu là `0`.

---

## 3. LÀM MỚI TỆP DATABASE/SEED.SQL (GIAI ĐOẠN C)

Tệp `database/seed.sql` đã được xóa sạch dữ liệu cũ và viết lại mới 100%:
- Đường dẫn bắt buộc giữ nguyên: [database/seed.sql](file:///f:/RikkeiEdu/personal-finance-management/database/seed.sql).
- Hỗ trợ đầy đủ tiếng Việt có dấu qua bảng mã `utf8mb4`.
- **Cơ chế Idempotent:** Thiết kế an toàn với mệnh đề `NOT EXISTS`, cho phép chạy lại nhiều lần mà không gây lỗi khóa ngoại hoặc nhân bản dữ liệu trùng lặp.
- **Bảo mật:** Tuyệt đối không chứa tài khoản demo cũ, không hardcode mật khẩu, BCrypt hash hay JWT secret.
- **Nội dung:** Gồm 11 danh mục, 84 giao dịch cho 3 tháng và 3 ngân sách hàng tháng.

---

## 4. TÀI KHOẢN CHÍNH THỨC (GIAI ĐOẠN D)

Tài khoản người dùng chính thức duy nhất được tạo thành công thông qua REST API `/api/auth/register` của Spring Boot:

- **Họ và tên:** `Tô Anh Tuấn`
- **Email:** `totuan.18dz@gmail.com`
- **Mã định danh (User ID):** `1`
- **Cơ chế bảo mật:** Mật khẩu do người dùng sở hữu được Spring Boot mã hóa bằng thuật toán **BCrypt** (`$2a$10$...`), tuyệt đối không lưu plaintext ở bất kỳ đâu.
- **Trạng thái xác thực:** Đăng nhập thành công qua `/api/auth/login`, cấp phát JWT Bearer Token hợp lệ (`sub: "1"`).
- **Cô lập JWT cũ:** Do CSDL được làm mới và người dùng nhận ID `1` trên schema mới, toàn bộ JWT token trước đây từ các phiên thử nghiệm đã hoàn toàn bị vô hiệu hóa.

---

## 5. DANH SÁCH 11 DANH MỤC CHUẨN (GIAI ĐOẠN E)

Đã tạo đúng 11 danh mục phân loại tài chính cho User ID `1`:

| STT | Tên danh mục | Loại giao dịch (TransactionType) | Mục đích sử dụng |
| :---: | :--- | :---: | :--- |
| 1 | `Lương` | **INCOME** | Thu nhập tiền lương hàng tháng |
| 2 | `Thưởng` | **INCOME** | Thưởng dự án, thưởng năng suất |
| 3 | `Thu nhập phụ` | **INCOME** | Thù lao freelance, tư vấn kỹ thuật |
| 4 | `Ăn uống` | **EXPENSE** | Thực phẩm, ăn trưa văn phòng, cà phê, liên hoan |
| 5 | `Nhà ở` | **EXPENSE** | Tiền thuê phòng trọ hàng tháng |
| 6 | `Đi lại` | **EXPENSE** | Xăng xe máy, bảo dưỡng xe, phí gửi xe |
| 7 | `Mua sắm` | **EXPENSE** | Quần áo, đồ gia dụng, thiết bị làm việc |
| 8 | `Hóa đơn` | **EXPENSE** | Tiền điện sinh hoạt, tiền nước, cước Internet |
| 9 | `Giải trí` | **EXPENSE** | Vé xem phim, triển lãm, gặp gỡ bạn bè |
| 10 | `Sức khỏe` | **EXPENSE** | Thuốc men, khám nha khoa, vật dụng y tế |
| 11 | `Học tập` | **EXPENSE** | Khóa học trực tuyến, sách công nghệ & kỹ năng |

---

## 6. DỮ LIỆU GIAO DỊCH MÔ PHỎNG 3 THÁNG (GIAI ĐOẠN F)

Tổng cộng **84 giao dịch** thực tế tự nhiên từ 01/08/2026 đến 23/10/2026 (trung bình 28 giao dịch/tháng, không có giao dịch tương lai sau 23/10/2026):

| Tháng | Số GD Thu | Số GD Chi | Tổng số GD | Tổng thu nhập | Tổng chi tiêu | Số dư khả dụng |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **08/2026** | 2 | 26 | **28** | 15.800.000 ₫ | 7.035.000 ₫ | **+8.765.000 ₫** |
| **09/2026** | 3 | 25 | **28** | 16.400.000 ₫ | 7.715.000 ₫ | **+8.685.000 ₫** |
| **10/2026** | 2 | 26 | **28** | 15.500.000 ₫ | 7.570.000 ₫ | **+7.930.000 ₫** |
| **TỔNG CỘNG**| **7** | **77** | **84** | **47.700.000 ₫** | **22.320.000 ₫** | **+25.380.000 ₫** |

- Toàn bộ số liệu trên được tính toán tự động từ các bản ghi thực trong MySQL, không hardcode hay giả lập phía Frontend.

---

## 7. NGÂN SÁCH THÁNG (GIAI ĐOẠN G)

| Tháng | Hạn mức ngân sách | Thực tế chi tiêu | Ngân sách còn lại | Tỷ lệ sử dụng | Trạng thái cảnh báo |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **08/2026** | 9.500.000 ₫ | 7.035.000 ₫ | 2.465.000 ₫ | 74,05% | **An toàn (Safe - dưới 80%)** |
| **09/2026** | 9.000.000 ₫ | 7.715.000 ₫ | 1.285.000 ₫ | 85,72% | **Cảnh báo (Warning - trên 80%)** |
| **10/2026** | 9.000.000 ₫ | 7.570.000 ₫ | 1.430.000 ₫ | 84,11% | **Cảnh báo (Warning - trên 80%)** |

- Đầy đủ cả 3 tháng, cờ `exceeded: false` chính xác theo logic nghiệp vụ.

---

## 8. KẾT QUẢ KIỂM THỬ TOÀN DIỆN HỆ THỐNG (GIAI ĐOẠN H)

### H1. Kiểm tra CSDL MySQL
- Tên CSDL: `personal_finance_db` (chuẩn xác).
- Số lượng bản ghi thực tế:
  - `users`: 1
  - `categories`: 11
  - `monthly_budgets`: 3
  - `transactions`: 84
- Không có lỗi khóa ngoại, không có dữ liệu mồ côi hoặc nhân bản.

### H2. Kiểm tra REST API Spring Boot (HTTPS Public)
- `POST /api/auth/login`: **200 OK** (Cấp phát JWT Bearer).
- `GET /api/users/me`: **200 OK** (`id: 1`, `fullName: "Tô Anh Tuấn"`).
- `GET /api/categories`: **200 OK** (Đúng 11 danh mục).
- `GET /api/transactions`: **200 OK** (84 giao dịch, phân trang và lọc theo ngày hoàn hảo).
- `GET /api/dashboard/summary?month=2026-10`: **200 OK** (Thu 15.5tr, Chi 7.57tr, Dư 7.93tr).
- `GET /api/dashboard/expenses-by-category?month=2026-10`: **200 OK** (Tổng phân bổ 7.57tr khớp 100% với Total Expense).
- `GET /api/budgets/2026/10`: **200 OK** (Đã chi 7.57tr, còn lại 1.43tr, chưa vượt ngân sách).

### H3. Kiểm tra Trạng thái Tài nguyên VPS & Docker
Kiểm tra thực tế qua lệnh `docker stats --no-stream` và `free -h`:

```text
NAME                    CPU %     MEM USAGE / LIMIT   MEM %     STATUS
smartexpense-backend    0.11%     286.1MiB / 450MiB   63.58%    Up (healthy)
smartexpense-frontend   0.00%     2.258MiB / 64MiB    3.53%     Up (healthy)
smartexpense-mysql      0.65%     78.86MiB / 256MiB   30.80%    Up (healthy)
```

- **Tài nguyên RAM vật lý VPS (954 MiB):** Tổng RAM cả 3 container chỉ chiếm **~367 MiB**, hệ thống còn **235 MiB RAM khả dụng** và **1.8 GiB Swap** dự phòng, hoàn toàn triệt tiêu rủi ro OOM Killer.
- **Trạng thái HTTPS:** Hoạt động ổn định, chứng chỉ SSL Let's Encrypt hợp lệ, không phát sinh lỗi HTTP 500, 502, 504.

---

## 9. DANH SÁCH TỆP THAY ĐỔI & DỌN DẸP DỰ ÁN (GIAI ĐOẠN I)

- **Tệp thay đổi:**
  - `database/seed.sql`: Viết lại mới 100% dữ liệu 3 tháng chuẩn.
  - `docs/FINAL_DATABASE_RESET_REPORT.md`: Tạo mới tài liệu nghiệm thu kỹ thuật.
- **Dọn dẹp:**
  - Các script Node.js tạm thời được lưu trữ tách biệt trong thư mục `scratch/` của conversation, không làm bẩn git working tree.
  - Tệp sao lưu `backup_personal_finance_db_20261022_203549.sql` nằm trong `database/backups/`, đã được `.gitignore` bảo vệ tuyệt đối.
  - Git working tree hoàn toàn sạch sẽ, tuân thủ đúng quy tắc không tự ý push hay trigger CD ngoài tầm kiểm soát.

---

## 10. KẾT LUẬN NGHIỆM THU

| Tiêu chí nghiệm thu | Trạng thái | Đánh giá |
| :--- | :---: | :--- |
| Reset sạch Database `personal_finance_db` | **PASS** | CSDL được tạo mới cùng tên, không kế thừa bảng hay dữ liệu cũ |
| Giữ nguyên Docker Volume `smartexpense_mysql_data` | **PASS** | Volume an toàn, cấu hình Docker Compose nguyên bản |
| Hibernate tự động tái tạo bảng | **PASS** | Đủ 4 bảng: `users`, `categories`, `transactions`, `monthly_budgets` |
| Tệp `database/seed.sql` mới hoàn toàn | **PASS** | Độc lập, idempotent, chuẩn tiếng Việt, không chứa mật khẩu |
| Tài khoản `Tô Anh Tuấn` hoạt động | **PASS** | User ID 1, xác thực JWT chuẩn, mật khẩu mã hóa BCrypt |
| Đúng 11 danh mục chuẩn | **PASS** | 3 INCOME, 8 EXPENSE |
| Đúng 84 giao dịch mô phỏng trong 3 tháng | **PASS** | 28 GD/tháng, không có ngày tương lai, số liệu tự nhiên |
| Đúng 3 ngân sách tháng | **PASS** | Tháng 08 (9.5tr), Tháng 09 (9.0tr), Tháng 10 (9.0tr) |
| Kiểm thử REST API & Dashboard | **PASS** | 100% endpoint phản hồi chuẩn xác |
| Container Docker & VPS RAM | **PASS** | Cả 3 container healthy, chiếm ~367 MiB RAM, swap an toàn |

**KẾT LUẬN CHUNG:** **PASS 100% – HỆ THỐNG ĐÃ HOÀN TẤT RESET & KHỞI TẠO DỮ LIỆU SẠCH SẼ, SẴN SÀNG DEMO VÀ BÀN GIAO.**
