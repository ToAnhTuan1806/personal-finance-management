# TÀI LIỆU VẬN HÀNH DEVOPS – SMARTEXPENSE (PHASE 5)

## 1. Tổng quan Kiến trúc Vận hành

Hệ thống SmartExpense được đóng gói và vận hành hoàn chỉnh dưới dạng vi dịch vụ container hóa (containerized multi-tier architecture) thông qua Docker và Docker Compose.

```
                    [ Trình duyệt Web / Client ]
                                |
                                | HTTP (Port 8088)
                                v
               +----------------------------------+
               |   Nginx Frontend Container       |
               |   - Phục vụ React SPA (Vite)     |
               |   - SPA Fallback try_files       |
               |   - Chuyển tiếp Reverse Proxy    |
               +-----------------+----------------+
                                 |
                                 | Proxy /api
                                 v (smartexpense-net:8080)
               +-----------------+----------------+
               |   Spring Boot Backend Container  |
               |   - Java 21 JRE (Non-root user)  |
               |   - JWT Authentication Filter    |
               |   - REST API & Business Logic    |
               +-----------------+----------------+
                                 |
                                 | JDBC:3306 (Internal)
                                 v (smartexpense-net:3306)
               +-----------------+----------------+
               |   MySQL 8.0 Database Container   |
               |   - Volume: smartexpense_mysql   |
               |   - Không mở cổng ra Internet    |
               |   - Healthcheck định kỳ          |
               +----------------------------------+
```

---

## 2. Đặc tả Container & Multi-Stage Dockerfile

### 2.1 Backend Container (`backend/Dockerfile`)
- **Stage 1 (Builder):**
  - Base image: `eclipse-temurin:21-jdk-alpine`.
  - Cài đặt `bash` để chạy `./gradlew`.
  - Sao chép gradle wrapper và dependency cache layer trước khi sao chép toàn bộ source.
  - Sử dụng lệnh `./gradlew bootJar --no-daemon -x test` để tạo runnable JAR tối ưu.
- **Stage 2 (Runtime):**
  - Base image: `eclipse-temurin:21-jre-alpine` siêu nhẹ, giảm thiểu bề mặt tấn công.
  - Tạo group `appgroup` và user không đặc quyền `appuser` (non-root execution).
  - Healthcheck tự động qua TCP ping port 8080.
  - Cổng mở nội bộ: `8080/tcp`.

### 2.2 Frontend Container (`frontend/Dockerfile` & `nginx.conf`)
- **Stage 1 (Builder):**
  - Base image: `node:22-alpine`.
  - Cài đặt package theo `package-lock.json` với `npm ci`.
  - Truyền `ARG VITE_API_URL=/api` để đóng gói base URL tương đối trong bundle sản phẩm.
  - Build tĩnh bằng `npm run build`.
- **Stage 2 (Runtime):**
  - Base image: `nginx:alpine`.
  - Sao chép thư mục `dist/` vào `/usr/share/nginx/html`.
  - Cấu hình `nginx.conf`:
    - Gzip compression cho toàn bộ text, css, js, json.
    - Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`.
    - Reverse Proxy: Mọi request `/api` được chuyển tiếp tới `http://backend:8080`.
    - SPA Fallback: `try_files $uri $uri/ /index.html` đảm bảo React Router load mượt mà khi refresh các URL `/transactions`, `/categories`, `/budgets`.
  - Cổng mở ra host: `8088:80`.

### 2.3 Cơ sở dữ liệu MySQL (`mysql:8.0`)
- Lưu trữ bền vững (data persistence) thông qua Docker Named Volume `smartexpense_mysql_data`. Dữ liệu bảng, người dùng, giao dịch không bị mất khi container restart, stop hoặc rebuild image.
- Cổng 3306 được giữ kín trong Docker network nội bộ `smartexpense-net`, ngăn chặn mọi truy cập trái phép từ Internet.
- Healthcheck sử dụng `mysqladmin ping` định kỳ 10 giây một lần.

---

## 3. Quản lý Biến Môi trường & Bảo mật

1. File `.env` chứa mật khẩu thật và JWT Secret tuyệt đối **KHÔNG ĐƯỢC COMMIT LÊN GIT**.
2. File mẫu an toàn `.env.example` được lưu trên repo để hướng dẫn triển khai:
   - `DB_NAME`: Tên database (`personal_finance_db`).
   - `DB_USERNAME`: Tài khoản kết nối MySQL (`root`).
   - `DB_PASSWORD`: Mật khẩu database.
   - `DB_ROOT_PASSWORD`: Mật khẩu root MySQL.
   - `JWT_SECRET`: Khóa bí mật ký token HMAC-SHA256 (tối thiểu 256 bits).
   - `JWT_EXPIRATION`: Thời hạn sống của JWT (mặc định 86400 giây = 24 giờ).
   - `FRONTEND_PORT`: Cổng Nginx public trên host (mặc định 8088).
3. File `.gitignore` đã được cấu hình chặt chẽ để loại trừ `.env`, `.env.*`, `database/backups/`, build artifacts.

---

## 4. Pipeline Tự động hóa CI/CD (GitHub Actions)

Quy trình tích hợp liên tục (CI) được định nghĩa trong `.github/workflows/ci.yml`, tự động kích hoạt khi có commit/PR vào nhánh `dev`, `main` hoặc chạy thủ công qua `workflow_dispatch`.

Pipeline gồm 3 Jobs độc lập và có kiểm soát:

1. **Job `frontend`:**
   - Checkout code.
   - Setup Node.js 22.
   - Chạy `npm ci`.
   - Kiểm tra chuẩn mã nguồn: `npm run lint`.
   - Build bundle thử nghiệm: `npm run build` với `VITE_API_URL=/api`.

2. **Job `backend`:**
   - Khởi tạo Service Container `mysql:8.0` chạy song song trên GitHub Actions.
   - Setup Java 21 Temurin & Gradle.
   - Cấp quyền thực thi cho Gradle Wrapper.
   - Chạy kiểm thử tự động: `./gradlew test` kết nối với MySQL service.
   - Build gói thực thi: `./gradlew bootJar -x test`.

3. **Job `docker` (Phụ thuộc vào frontend & backend):**
   - Xác thực cú pháp cấu hình Compose: `docker compose config`.
   - Build image Frontend và Backend bằng Docker Buildx.
   - Đảm bảo các image sẵn sàng đóng gói và triển khai.

---

## 5. Cẩm nang Vận hành Local (Runbook)

### 5.1 Khởi chạy toàn bộ hệ thống
```powershell
# 1. Tạo file .env nếu chưa có
Copy-Item .env.example .env

# 2. Khởi chạy 3 services
docker compose up -d

# 3. Kiểm tra trạng thái sức khỏe
docker compose ps
```

### 5.2 Khởi tạo Dữ liệu Mẫu (Database Seeding)
Sau khi Backend đã khởi chạy và Hibernate hoàn tất tạo bảng:
```powershell
cmd.exe /c "docker exec -i smartexpense-mysql mysql -u root -p123456$ personal_finance_db < database/seed.sql"
```

Tài khoản demo:
- Email: `demo@smartexpense.local`
- Mật khẩu: `Demo@123456`

### 5.3 Chạy Bộ Kiểm thử Tích hợp (Smoke Test)
```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
```

### 5.4 Sao lưu & Phục hồi Database
- **Sao lưu:**
  ```powershell
  powershell.exe -ExecutionPolicy Bypass -File scripts\backup-db.ps1
  ```
- **Phục hồi:**
  ```powershell
  powershell.exe -ExecutionPolicy Bypass -File scripts\restore-db.ps1 -BackupFile "database\backups\backup_personal_finance_db_xxxx.sql"
  ```

### 5.5 Xem Logs Containers
```powershell
# Xem log toàn bộ hệ thống
docker compose logs -f

# Xem log riêng Backend
docker compose logs -f backend

# Xem log riêng Frontend Nginx
docker compose logs -f frontend

# Xem log riêng MySQL
docker compose logs -f mysql
```

### 5.6 Dừng hệ thống an toàn
```powershell
# Dừng container, bảo lưu nguyên vẹn dữ liệu
docker compose stop

# Hoặc gỡ bỏ container nhưng GIỮ NGUYÊN volume dữ liệu
docker compose down
```
> **CẢNH BÁO:** Không bao giờ chạy `docker compose down -v` nếu không muốn xóa sạch toàn bộ cơ sở dữ liệu!
