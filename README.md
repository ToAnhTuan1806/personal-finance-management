# SMARTEXPENSE – ỨNG DỤNG QUẢN LÝ TÀI CHÍNH CÁ NHÂN

<p align="center">
  <img src="frontend/public/Vi.png" alt="SmartExpense Logo" width="100" height="100" />
</p>

<p align="center">
  <strong>Giải pháp quản lý tài chính cá nhân thông minh, bảo mật và trực quan.</strong><br>
  Được xây dựng với kiến trúc hiện đại, đóng gói toàn diện bằng Docker & CI/CD tự động triển khai lên VPS Production.
</p>

<p align="center">
  <a href="https://smartexpense-team3.duckdns.org" target="_blank">
    <img src="https://img.shields.io/badge/Production-Live%20Demo-success?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Live Demo" />
  </a>
  <img src="https://img.shields.io/badge/Spring%20Boot-4.1.1-6DB33F?style=for-the-badge&logo=springboot&logoColor=white" alt="Spring Boot" />
  <img src="https://img.shields.io/badge/React-19.3-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="MySQL" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/GitHub%20Actions-CI%2FCD-2088FF?style=for-the-badge&logo=githubactions&logoColor=white" alt="CI/CD" />
</p>

---

## 🌐 Trải nghiệm Trực tuyến (Live Demo)

- **Domain chính thức (HTTPS):** [https://smartexpense-team3.duckdns.org](https://smartexpense-team3.duckdns.org)
- **Hạ tầng VPS:** Ubuntu 24.04 LTS, Nginx Reverse Proxy & SSL Let's Encrypt tự động gia hạn.
- **Tài khoản Demo chuẩn sẵn có:**
  - **Email:** `totuan.18dz@gmail.com`
  - **Mật khẩu:** `ToAnhTuan18@`
  - **Người dùng:** `Tô Anh Tuấn` (User ID: `1`)
  - **Dữ liệu minh họa:** 11 danh mục phân loại, 84 giao dịch tự nhiên qua 3 tháng (08, 09, 10/2026), 3 ngân sách tháng với các trạng thái cảnh báo thực tế.

---

## 🌟 Tính Năng Nổi Bật

### 1. 📊 Bảng điều khiển Tài chính Thông minh (Dashboard)
- **Tổng quan thu chi:** Hiển thị tức thời Tổng thu nhập, Tổng chi tiêu và Số dư khả dụng trong tháng được chọn.
- **Biểu đồ phân bổ chi tiêu (Donut Chart):** Trực quan hóa tỷ trọng chi tiêu theo từng danh mục với màu sắc phân biệt rõ ràng.
- **Biểu đồ xu hướng thu chi (Bar Chart):** So sánh dòng tiền thu nhập vs chi tiêu qua các tháng.
- **Danh sách giao dịch gần đây:** Truy xuất nhanh các giao dịch phát sinh mới nhất.

### 2. 📂 Quản lý Danh mục Thu - Chi (Category Management)
- Phân chia rõ ràng giữa 2 loại: **Thu nhập (INCOME)** và **Chi tiêu (EXPENSE)**.
- Bộ lọc chuyển tab nhanh (PillTabs), hỗ trợ Thêm, Sửa, Xóa danh mục linh hoạt.
- Ràng buộc an toàn: Không cho phép xóa danh mục khi đang có giao dịch phát sinh liên kết.

### 3. 💳 Quản lý Giao dịch Toàn diện (Transaction Management)
- Ghi nhận giao dịch với đầy đủ thông tin: Số tiền, Danh mục, Ngày giao dịch, Ghi chú.
- Bộ lọc nâng cao: Lọc theo khoảng ngày (Date Range), lọc theo loại Thu/Chi, lọc theo Danh mục.
- Phân trang dữ liệu (Pagination), định dạng tiền tệ VND (`₫`) trực quan, tự động định dạng số tiền nhập liệu.

### 4. 🎯 Quản lý & Cảnh báo Ngân sách (Monthly Budget)
- Thiết lập hạn mức chi tiêu cho từng tháng trong năm.
- Tự động đối soát chi tiêu thực tế với ngân sách đã đặt.
- **Thanh tiến độ & cảnh báo thông minh:**
  - 🟢 **An toàn (Safe):** Sử dụng dưới 80% ngân sách.
  - 🟡 **Cảnh báo (Warning):** Sử dụng từ 80% đến dưới 100% ngân sách.
  - 🔴 **Vượt ngân sách (Over Budget):** Sử dụng từ 100% trở lên.

### 5. 🔐 Bảo mật & Cô lập Dữ liệu (Security & Multi-Tenancy)
- Xác thực người dùng bằng **JSON Web Token (JWT)** chuẩn HMAC-SHA256.
- Mật khẩu người dùng được băm an toàn bằng thuật toán **BCrypt**.
- Cơ chế cô lập đa người dùng: Mỗi người dùng chỉ xem, sửa và xóa được dữ liệu thuộc quyền sở hữu của chính mình.

---

## 🏗️ Kiến Trúc Hệ Thống (System Architecture)

```
                            [ Người dùng / Trình duyệt ]
                                         │
                                         │ HTTPS (Port 443)
                                         ▼
                     ┌──────────────────────────────────────┐
                     │    Nginx Host (Reverse Proxy & TLS)  │
                     │  - Let's Encrypt SSL/TLS Certificate │
                     │  - Rate Limiting, HTTP/2 Support     │
                     └──────────────────┬───────────────────┘
                                         │
                                         │ HTTP (Port 8088 / loopback 127.0.0.1)
                                         ▼
                     ┌──────────────────────────────────────┐
                     │       Nginx Frontend Container       │
                     │   - Phục vụ Static Files (React/Vite)│
                     │   - SPA Fallback Route               │
                     │   - Reverse Proxy đường dẫn /api     │
                     └──────────────────┬───────────────────┘
                                         │
                                         │ http://backend:8080/api (Mạng Docker nội bộ)
                                         ▼
                     ┌──────────────────────────────────────┐
                     │    Spring Boot Backend Container     │
                     │   - Java 21 LTS (Non-root user)      │
                     │   - Spring Security & JWT Auth       │
                     │   - RESTful API & Business Services  │
                     │   - Giới hạn RAM: max 450M           │
                     └──────────────────┬───────────────────┘
                                         │
                                         │ jdbc:mysql://mysql:3306 (Mạng Docker nội bộ)
                                         ▼
                     ┌──────────────────────────────────────┐
                     │      MySQL 8 Database Container      │
                     │   - Named Volume: mysql_data         │
                     │   - Cổng 3306 KHÔNG mở ra Internet   │
                     │   - Giới hạn RAM: max 256M           │
                     │   - Tự động Healthcheck định kỳ      │
                     └──────────────────────────────────────┘
```

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

| Thành phần | Công nghệ / Thư viện | Vai trò |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite 8, Tailwind CSS v4 | Giao diện người dùng SPA hiện đại, responsive |
| **UI Icons & Charts** | Lucide React, Recharts | Biểu đồ tài chính và bộ icon trực quan |
| **Backend** | Spring Boot 4.1.1, Java 21 LTS | RESTful API, Service Layer & Business Logic |
| **Bảo mật** | Spring Security 6, JWT, BCrypt | Xác thực Stateless, phân quyền theo token |
| **Truy cập dữ liệu** | Spring Data JPA, Hibernate, MySQL Driver | Quản lý Entity, quan hệ bảng và truy vấn CSDL |
| **Cơ sở dữ liệu** | MySQL 8.0 (utf8mb4_unicode_ci) | Lưu trữ dữ liệu quan hệ, named volume an toàn |
| **Web Server** | Nginx 1.24 (Host & Container) | Reverse Proxy, SSL Termination, SPA routing |
| **Đóng gói** | Docker, Multi-stage Dockerfile, Compose | Tiêu chuẩn hóa môi trường, tối ưu kích thước image |
| **Tự động hóa** | GitHub Actions (CI & CD) | Tự động test, build GHCR và deploy lên VPS qua SSH |

---

## 🚀 Hướng Dẫn Khởi Chạy Nhanh (Local Quick Start)

### Yêu cầu tiên quyết
- **Docker Desktop** (bản 24.0+) hoặc Docker Engine kèm Docker Compose v2.20+.
- Cổng **8088** còn trống trên máy.

### 1. Clone mã nguồn
```bash
git clone https://github.com/ToAnhTuan1806/personal-finance-management.git
cd personal-finance-management
```

### 2. Thiết lập Biến môi trường (`.env`)
```bash
# Trên Windows PowerShell:
Copy-Item .env.example .env

# Trên Linux/macOS:
cp .env.example .env
```

Các biến môi trường mặc định an toàn cho môi trường Local:
```ini
DB_NAME=personal_finance_db
DB_USERNAME=root
DB_PASSWORD=123456$
DB_ROOT_PASSWORD=123456$
JWT_SECRET=j6uECsjbXr08La2gKzpRPUzOmGSUyCS7/kXGeTVxjfs=
FRONTEND_PORT=8088
```

### 3. Khởi chạy toàn bộ hệ thống bằng Docker Compose
```bash
docker compose up -d
```

Hệ thống sẽ tự động tải hoặc build các container:
- `smartexpense-mysql`: Khởi động và cấu hình database `personal_finance_db`.
- `smartexpense-backend`: Chờ MySQL sẵn sàng, tự động khởi tạo bảng qua Hibernate.
- `smartexpense-frontend`: Chờ Backend sẵn sàng, phục vụ ứng dụng tại cổng `8088`.

Kiểm tra trạng thái containers:
```bash
docker compose ps
```
*(Cả 3 container đều hiển thị `Up ... (healthy)` là thành công)*.

### 4. Nạp dữ liệu mẫu chuẩn (Seed Data)
Để nạp sẵn 11 danh mục, 84 giao dịch mẫu và 3 ngân sách tháng:
```powershell
# Trên Windows:
cmd.exe /c "docker exec -i smartexpense-mysql mysql -u root -p123456$ personal_finance_db < database/seed.sql"

# Trên Linux/macOS:
docker exec -i smartexpense-mysql mysql -u root -p123456$ personal_finance_db < database/seed.sql
```

Truy cập ứng dụng tại: [http://localhost:8088](http://localhost:8088)

---

## 🧪 Kiểm Thử & Đảm Bảo Chất Lượng (QA & Testing)

Dự án được kiểm thử toàn diện ở nhiều cấp độ:

### 1. Bộ kiểm thử tích hợp tự động (Smoke Test Suite)
Bộ script PowerShell gồm 27 test cases bao quát toàn bộ chức năng:
```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
```
*Kết quả:* **27/27 kịch bản đạt trạng thái PASS (100%)** bao quát toàn bộ luồng Hạ tầng, Nginx Gateway, Xác thực JWT, Nghiệp vụ CRUD và Phân quyền đa người dùng.

### 2. Kiểm thử API bằng Postman Collection
Bộ sưu tập Postman đầy đủ cho toàn bộ API endpoints (Auth, Categories, Transactions, Monthly Budgets, Dashboard) được đặt tại:
- [docs/postman/SmartExpense_Postman_Collection.json](docs/postman/SmartExpense_Postman_Collection.json)
- [docs/postman/README_POSTMAN.md](docs/postman/README_POSTMAN.md)

### 3. Tự động hóa CI/CD Pipeline
- **CI Pipeline (`.github/workflows/ci.yml`):** Tự động kích hoạt khi push/PR vào `dev`, `main` để kiểm tra lint, unit test Gradle và build kiểm thử.
- **CD Pipeline (`.github/workflows/cd.yml`):** Tự động đóng gói Docker images lên GitHub Container Registry (GHCR), kết nối SSH an toàn vào VPS, kéo image mới và cập nhật zero-downtime.

---

## 💾 Sao Lưu & Phục Hồi Dữ Liệu (Backup & Restore)

```powershell
# 1. Tạo bản sao lưu Database tức thời vào database/backups/
powershell.exe -ExecutionPolicy Bypass -File scripts\backup-db.ps1

# 2. Phục hồi dữ liệu từ một bản sao lưu cụ thể
powershell.exe -ExecutionPolicy Bypass -File scripts\restore-db.ps1 -BackupFile "database\backups\backup_personal_finance_db_xxxx.sql"
```

---

## 📂 Cấu Trúc Thư Mục Dự Án (Project Structure)

```text
personal-finance-management/
├── .github/
│   └── workflows/
│       ├── ci.yml               # GitHub Actions CI Workflow
│       └── cd.yml               # GitHub Actions CD Auto-deploy VPS
├── backend/
│   ├── Dockerfile               # Multi-stage Dockerfile cho Spring Boot
│   ├── build.gradle             # Cấu hình Gradle & Dependencies
│   └── src/
│       └── main/java/com/smartexpense/backend/
│           ├── config/          # Cấu hình Security, JWT, WebMvc
│           ├── controller/      # REST API Controllers
│           ├── dto/             # Data Transfer Objects
│           ├── entity/          # JPA Entities (User, Category, Transaction, Budget)
│           ├── exception/       # Global Exception Handler
│           ├── repository/      # Spring Data JPA Repositories
│           ├── security/        # JWT Filter, Token Provider
│           └── service/         # Business Logic Services
├── database/
│   ├── backups/                 # Thư mục chứa các bản dump sao lưu (Git ignored)
│   └── seed.sql                 # Script nạp dữ liệu mẫu chuẩn (11 danh mục, 84 giao dịch)
├── docs/
│   ├── postman/                 # Postman Collection & Hướng dẫn test API
│   │   ├── README_POSTMAN.md
│   │   └── SmartExpense_Postman_Collection.json
│   ├── FINAL_DATABASE_RESET_REPORT.md  # Báo cáo reset CSDL và khởi tạo seed data chuẩn
│   ├── SmartExpense_SRS.docx    # Tài liệu đặc tả yêu cầu phần mềm (SRS Word)
│   └── BaoCao_SmartExpense_Project_Proposal.docx # Báo cáo đề xuất dự án (Project Proposal)
├── frontend/
│   ├── Dockerfile               # Multi-stage Dockerfile (Vite Build + Nginx)
│   ├── nginx.conf               # Cấu hình Nginx container & Reverse Proxy /api
│   ├── package.json             # NPM dependencies & scripts
│   ├── public/                  # Static assets (Favicon, Vi.png logo 3D)
│   └── src/
│       ├── assets/              # Logo và hình ảnh giao diện
│       ├── components/          # Reusable UI components (Layout, Auth, Dashboard, etc.)
│       ├── context/             # React Context (AuthContext)
│       ├── pages/               # Các trang giao diện (Dashboard, Login, Register, v.v.)
│       └── services/            # Axios API client services
├── scripts/
│   ├── backup-db.ps1            # Script PowerShell sao lưu CSDL
│   ├── restore-db.ps1           # Script PowerShell phục hồi CSDL
│   └── smoke-test.ps1           # Bộ kịch bản kiểm thử tự động 27 test cases
├── compose.yaml                 # Docker Compose đa dịch vụ (Frontend, Backend, MySQL)
├── .env.example                 # File mẫu biến môi trường
├── .gitignore                   # Cấu hình bỏ qua các file nhạy cảm và build artifacts
└── README.md                    # Tài liệu giới thiệu và hướng dẫn tổng quan dự án
```

---

## 📚 Danh Mục Tài Liệu Kỹ Thuật Chi Tiết

1. [Báo cáo Reset CSDL & Dữ liệu Mẫu](docs/FINAL_DATABASE_RESET_REPORT.md) – Chi tiết kỹ thuật về việc làm sạch CSDL, cấu trúc bảng và 84 giao dịch thực tế phục vụ nghiệm thu.
2. [Tài liệu API & Postman](docs/postman/README_POSTMAN.md) – Danh sách endpoint và hướng dẫn nhập Postman Collection.
3. [Đặc tả Yêu cầu Phần mềm (SRS)](docs/SmartExpense_SRS.docx) – Bản đặc tả nghiệp vụ chi tiết của dự án SmartExpense.
4. [Báo cáo Đề xuất Dự án (Project Proposal)](docs/BaoCao_SmartExpense_Project_Proposal.docx) – Báo cáo đề xuất dự án chính thức.

---

<p align="center">
  <strong>SmartExpense Team – Personal Finance Management</strong><br>
  Dự án hoàn thành phục vụ đánh giá, nghiệm thu và triển khai thực tế.
</p>
