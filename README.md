# SMARTEXPENSE – ỨNG DỤNG QUẢN LÝ TÀI CHÍNH CÁ NHÂN

SmartExpense là giải pháp quản lý tài chính cá nhân toàn diện, hỗ trợ người dùng theo dõi thu chi, phân loại giao dịch, thiết lập hạn mức ngân sách thông minh và trực quan hóa bức tranh tài chính qua bảng thống kê Dashboard.

Dự án được xây dựng theo kiến trúc Micro-Frontend & Backend Service đóng gói hoàn chỉnh bằng Docker, Nginx, Spring Boot và MySQL, tích hợp CI/CD tự động hóa kiểm thử và kiểm tra chất lượng.

---

## 1. Sơ đồ Kiến trúc Hệ thống (System Architecture)

```
                       [ Người dùng / Trình duyệt ]
                                    |
                                    | HTTP (Port 8088)
                                    v
                 +--------------------------------------+
                 |       Nginx Frontend Container       |
                 |   - Phục vụ Static Files (React/Vite)|
                 |   - Điều hướng SPA Fallback          |
                 |   - Reverse Proxy đường dẫn /api     |
                 +------------------+-------------------+
                                    |
                                    | http://backend:8080/api
                                    v
                 +------------------+-------------------+
                 |    Spring Boot Backend Container     |
                 |   - Java 21 JRE (Non-root user)      |
                 |   - Xác thực phân quyền JWT          |
                 |   - RESTful API & Business Logic     |
                 +------------------+-------------------+
                                    |
                                    | jdbc:mysql://mysql:3306
                                    v
                 +------------------+-------------------+
                 |     MySQL 8 Database Container       |
                 |   - Named Volume: mysql_data         |
                 |   - Không mở cổng 3306 ra Internet   |
                 |   - Healthcheck tự động              |
                 +--------------------------------------+
```

---

## 2. Công nghệ Sử dụng (Tech Stack)

- **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide React, Recharts.
- **Backend:** Spring Boot 4.1.1, Java 21 (Eclipse Temurin), Gradle 9.8, Spring Security, JWT (HMAC-SHA256), Spring Data JPA / Hibernate.
- **Database:** MySQL 8.0, Docker Volume lưu trữ dữ liệu bền vững.
- **DevOps & Packaging:** Docker, Multi-stage Dockerfile, Docker Compose, Nginx Reverse Proxy.
- **CI/CD:** GitHub Actions (Lint, Test, Docker Build verification).
- **Testing:** JUnit Platform, PowerShell Integration Smoke Test (`scripts/smoke-test.ps1`), Postman Collection.

---

## 3. Yêu cầu Môi trường (Prerequisites)

- **Docker Desktop** (hoặc Docker Engine trên Linux) phiên bản 24.0+ và Docker Compose v2.20+.
- Cổng **8088** còn trống trên máy chủ / máy cục bộ.
- *(Tùy chọn dành cho dev chạy không dùng Docker)*: Node.js 20/22, JDK 21, MySQL 8 cục bộ.

---

## 4. Hướng dẫn Khởi chạy Toàn Hệ Thống (Quick Start)

### Bước 1: Clone Repository
```bash
git clone https://github.com/ToAnhTuan1806/personal-finance-management.git
cd personal-finance-management
```

### Bước 2: Thiết lập Biến Môi Trường (.env)
Sao chép file `.env.example` thành `.env`:
```powershell
# Trên Windows PowerShell:
Copy-Item .env.example .env

# Trên Linux/macOS:
cp .env.example .env
```

Các biến môi trường mặc định an toàn:
```ini
DB_NAME=personal_finance_db
DB_USERNAME=root
DB_PASSWORD=123456$
DB_ROOT_PASSWORD=123456$
JWT_SECRET=j6uECsjbXr08La2gKzpRPUzOmGSUyCS7/kXGeTVxjfs=
FRONTEND_PORT=8088
```

> **Lưu ý:** File `.env` chứa mật khẩu thực tế được bảo vệ bởi `.gitignore` và không bao giờ được commit lên GitHub.

### Bước 3: Khởi chạy Containers bằng Docker Compose
Chỉ với một lệnh duy nhất:
```bash
docker compose up -d
```

Docker Compose sẽ tự động:
1. Tạo Docker Network `smartexpense-net` và Volume `smartexpense_mysql_data`.
2. Khởi chạy container `mysql:8.0` và chờ trạng thái `healthy`.
3. Build và khởi chạy `backend` (Spring Boot), tự động kết nối và khởi tạo bảng trong database.
4. Chờ `backend` sẵn sàng (`healthy`), sau đó khởi chạy `frontend` (Nginx + React).

### Bước 4: Kiểm tra trạng thái hệ thống
```bash
docker compose ps
```

Kết quả kỳ vọng: Cả 3 container đều có trạng thái `Up ... (healthy)`.

### Bước 5: Nạp Dữ liệu Mẫu (Seed Data)
Để có sẵn tài khoản và các dữ liệu giao dịch mẫu tháng 10/2026:
```powershell
# Chạy trên Windows:
cmd.exe /c "docker exec -i smartexpense-mysql mysql -u root -p123456$ personal_finance_db < database/seed.sql"

# Chạy trên Linux/macOS:
docker exec -i smartexpense-mysql mysql -u root -p123456$ personal_finance_db < database/seed.sql
```

**Tài khoản đăng nhập Demo:**
- URL truy cập: [http://localhost:8088](http://localhost:8088)
- Email: `demo@smartexpense.local`
- Mật khẩu: `Demo@123456`

---

## 5. Kiểm thử Tích hợp Tự động (Smoke Test)

Dự án cung cấp bộ kịch bản kiểm thử tích hợp 27 test cases bằng PowerShell, bao quát toàn bộ luồng hạ tầng, xác thực, nghiệp vụ CRUD, bảo mật đa người dùng và an toàn cổng:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
```

Toàn bộ 27/27 kịch bản đều đạt trạng thái `PASS` 100%. Xem chi tiết tại [docs/INTEGRATION_TEST_REPORT.md](docs/INTEGRATION_TEST_REPORT.md).

---

## 6. Sao lưu & Phục hồi Dữ liệu (Backup & Restore)

### Sao lưu Database (Backup)
Tạo bản sao lưu tức thì vào thư mục `database/backups/`:
```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\backup-db.ps1
```

### Khôi phục Database (Restore)
Khôi phục dữ liệu từ một bản backup cụ thể:
```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\restore-db.ps1 -BackupFile "database\backups\backup_personal_finance_db_xxxx.sql"
```

---

## 7. Xem Nhật Ký Hệ Thống (Logs)

```powershell
# Xem log toàn bộ hệ thống
docker compose logs -f

# Xem log Backend Spring Boot
docker compose logs -f backend

# Xem log Frontend Nginx
docker compose logs -f frontend

# Xem log MySQL Database
docker compose logs -f mysql
```

---

## 8. Tự động hóa CI/CD Pipeline (GitHub Actions)

Workflow CI được cấu hình tại [.github/workflows/ci.yml](.github/workflows/ci.yml) tự động kích hoạt trên các nhánh `dev` và `main`:
1. **Frontend Job:** Cài đặt Node.js 22, chạy `npm ci`, kiểm tra chất lượng code `npm run lint` và build thử nghiệm `npm run build`.
2. **Backend Job:** Thiết lập Java 21, khởi động container MySQL 8 service độc lập, chạy toàn bộ test tự động `./gradlew test` và build file JAR `./gradlew bootJar`.
3. **Docker Job:** Kiểm tra tính hợp lệ của cú pháp `compose.yaml` và build image kiểm thử cho cả Backend và Frontend.

---

## 9. Dừng Hệ Thống An Toàn

```powershell
# Tạm dừng các container (giữ nguyên tài nguyên)
docker compose stop

# Gỡ bỏ containers nhưng GIỮ NGUYÊN dữ liệu trong MySQL volume
docker compose down
```

> **Lưu ý bảo vệ dữ liệu:** Tuyệt đối không thêm cờ `-v` (`docker compose down -v`) nếu bạn muốn bảo tồn dữ liệu tài chính trong hệ thống.

---

## 10. Tài liệu Hướng dẫn Chi tiết

- [Vận hành DevOps](docs/DEVOPS_GUIDE.md) – Chi tiết kỹ thuật về containerization, multi-stage build, mạng nội bộ và runbook vận hành.
- [Triển khai VPS & HTTPS](docs/DEPLOYMENT_GUIDE.md) – Hướng dẫn triển khai thực tế trên Ubuntu VPS, Nginx reverse proxy, chứng chỉ SSL Certbot, tường lửa UFW và rollback.
- [Báo cáo Kiểm thử Tích hợp](docs/INTEGRATION_TEST_REPORT.md) – Kết quả chi tiết 27/27 kịch bản kiểm thử tích hợp Phase 5.
- [Báo cáo QA Phase 4](docs/QA_REPORT.md) – Báo cáo kiểm thử chất lượng giao diện và nghiệp vụ trước đó.
- [Tài liệu Postman API](docs/postman/README_POSTMAN.md) – Bộ sưu tập Postman Collection kiểm thử thủ công API.
