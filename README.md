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

## SmartExpense 2.0 — Tài liệu và kế hoạch hiện hành

SmartExpense 2.0 phát triển tiếp MVP hiện có. Hai tài liệu nguồn đã được người dùng xác thực: [SRS 2.2 ngày 27/10/2026](docs/SmartExpense_SRS_v2.docx) và [Master Plan 15 ngày](docs/SmartExpense_QuanTriDuAn.xlsx). Việc xác thực nguồn không thay cho review API/schema hoặc chữ ký của thành viên.

- Phạm vi: 12 nhóm FR-01–FR-12, 45 task; mỗi thành viên 15 task trong 15 ngày làm việc T2–T6.
- D01: **27/10/2026**, vừa chuẩn bị tài liệu vừa thực hiện nhiệm vụ nền tảng; D15: **16/11/2026**. Tuần dự phòng: 23–27/11/2026, không mở rộng tính năng.
- Đợt 1: 27/10–01/11 (4 ngày làm việc); Đợt 2: 02–06/11 (5 ngày); Đợt 3: 09–13/11 (5 ngày); 16/11 là ngày nghiệm thu bổ sung thứ 15. Không xếp task cuối tuần.

| Thành viên | Vai trò | Nhánh | Số task |
| --- | --- | --- | --- |
| Tô Anh Tuấn | Backend + Documentation | feature/tuan | 15 |
| Trần Thị Thu Trang | Frontend | feature/trang | 15 |
| Phạm Hương Quỳnh | Database + QA + DevOps | feature/quynh | 15 |

FE/BE dùng [API Contract](docs/smartexpense-2.0/API_CONTRACT.md): phân biệt API hiện có và API dự kiến, kèm DTO/validation và các điểm cần chốt. Các đề xuất kỹ thuật vẫn chờ review; lưu ý thay đổi dữ liệu nằm ở mục [Migration, backup và rollback](#migration-backup-và-rollback).

Ghi nhận [Trello](https://trello.com/b/RAHIOc4b/smartexpense-personal-finance-management) ngày 28/10/2026: đủ 45 mã SE2, nhưng due date 3 thẻ D01 là 28/10 thay vì 27/10 và 45 thẻ chưa gán member chính thức. Nhóm cần đối chiếu lại; dấu hoàn thành của D01-BE không thay cho bằng chứng duyệt contract. Lượt rút gọn tài liệu không thay đổi Trello.

Các chức năng bên dưới mô tả nền tảng MVP đang có trong mã. Quick Add hoàn chỉnh, lịch thu chi, icon/màu danh mục, ngân sách danh mục, mẫu định kỳ, báo cáo nhiều tháng và CSV là phạm vi nâng cấp, chưa được coi là đã hoàn thành. Tài liệu MVP giai đoạn 19–23/10/2026 được giữ làm lịch sử ở cuối trang.

## 🌐 Trải nghiệm Trực tuyến (Live Demo)

- **Domain chính thức (HTTPS):** [https://smartexpense-team3.duckdns.org](https://smartexpense-team3.duckdns.org)
- **Hạ tầng VPS:** Ubuntu 24.04 LTS, Nginx Reverse Proxy & SSL Let's Encrypt tự động gia hạn.
- **Tài khoản demo:** nhận thông tin truy cập qua kênh riêng của nhóm; không công bố email đăng nhập hoặc mật khẩu trong repository.

---

## 🌟 Tính Năng Nổi Bật

### 1. 📊 Bảng điều khiển Tài chính Thông minh (Dashboard)

- **Tổng quan thu chi:** Hiển thị tức thời Tổng thu nhập, Tổng chi tiêu và Số dư khả dụng trong tháng được chọn.
- **Biểu đồ phân bổ chi tiêu (Donut Chart):** Trực quan hóa tỷ trọng chi tiêu theo từng danh mục với màu sắc phân biệt rõ ràng.
- **Biểu đồ dòng tiền (Area Chart):** Hiển thị thu nhập và chi tiêu theo ngày trong tháng được chọn; báo cáo so sánh nhiều tháng thuộc FR-09 của kế hoạch 2.0.
- **Danh sách giao dịch gần đây:** Truy xuất nhanh các giao dịch phát sinh mới nhất.

### 2. 📂 Quản lý Danh mục Thu - Chi (Category Management)

- Phân chia rõ ràng giữa 2 loại: **Thu nhập (INCOME)** và **Chi tiêu (EXPENSE)**.
- Bộ lọc chuyển tab nhanh (PillTabs), hỗ trợ Thêm, Sửa, Xóa danh mục linh hoạt.
- Ràng buộc an toàn: Không cho phép xóa danh mục khi đang có giao dịch phát sinh liên kết.
- Đăng ký tài khoản mới tự tạo **17 danh mục riêng**: 11 EXPENSE và 6 INCOME. User và danh mục cùng transaction; lỗi tạo danh mục sẽ rollback đăng ký. Login không tạo thêm, tài khoản cũ giữ nguyên dữ liệu.

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
| **Bảo mật** | Spring Security do Spring Boot quản lý, JWT, BCrypt | Xác thực Stateless, phân quyền theo token |
| **Truy cập dữ liệu** | Spring Data JPA, Hibernate, MySQL Driver | Quản lý Entity, quan hệ bảng và truy vấn CSDL |
| **Cơ sở dữ liệu** | MySQL 8.0 (utf8mb4_unicode_ci) | Lưu trữ dữ liệu quan hệ, named volume an toàn |
| **Web Server** | Container nginx:alpine; Nginx host theo hồ sơ MVP | Reverse Proxy, SSL Termination, SPA routing |
| **Đóng gói** | Docker, Multi-stage Dockerfile, Compose | Tiêu chuẩn hóa môi trường, tối ưu kích thước image |
| **Tự động hóa** | GitHub Actions (CI & CD) | Tự động test, build GHCR và deploy lên VPS qua SSH |

---

## 🚀 Hướng Dẫn Khởi Chạy Nhanh (Local Quick Start)

### Yêu cầu tiên quyết

- Backend trực tiếp: **JDK 21** và MySQL 8 local có database/user riêng; cổng **8080** còn trống.
- Chạy cả hệ thống hoặc test MySQL: **Docker Desktop/Linux engine** hoặc Docker Engine kèm Compose v2.20+; cổng Frontend **8088** còn trống.

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

Các ô mật khẩu/JWT trống trong `.env.example` là placeholder. Mỗi thành viên điền `.env` riêng, không sửa `application.properties` và không commit `.env` hoặc cấu hình IDE chứa credential. Các biến Backend thống nhất là `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`; `JWT_EXPIRATION` mặc định 86400 giây. Giữ `DB_USERNAME`, không thêm alias `DB_USER`.

`DB_URL` dùng khi chạy Backend trực tiếp, trỏ đúng MySQL trên máy bạn. Compose tự dựng URL `mysql:3306` theo `DB_NAME`, không dùng URL localhost này. Khi chạy Compose với `DB_USERNAME=root`, đặt `DB_PASSWORD` bằng `DB_ROOT_PASSWORD`; user khác phải có sẵn quyền truy cập database. Compose từ chối mật khẩu/JWT thiếu hoặc trống. Mật khẩu chứa `$` phải đặt trong nháy đơn trong `.env`; không dùng tham chiếu `${BIEN_KHAC}`.

```ini
DB_NAME=personal_finance_db
DB_URL=jdbc:mysql://localhost:3306/personal_finance_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
DB_USERNAME=root
DB_PASSWORD=<LOCAL_DB_ROOT_PASSWORD>
DB_ROOT_PASSWORD=<LOCAL_DB_ROOT_PASSWORD>
JWT_SECRET=<LOCAL_BASE64_JWT_KEY>
FRONTEND_PORT=8088
```

`JWT_SECRET` phải là Base64 của ít nhất 32 byte ngẫu nhiên. Có thể tạo bằng `openssl rand -base64 32`, hoặc PowerShell:

```powershell
$jwtBytes = New-Object byte[] 32
$jwtRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$jwtRng.GetBytes($jwtBytes)
[Convert]::ToBase64String($jwtBytes)
$jwtRng.Dispose()
```

Các giá trị mật khẩu/JWT mẫu cũ từng nằm trong Git phải được xem là công khai. Nếu từng dùng chúng trong môi trường thật, người quản lý môi trường cần thay khóa/mật khẩu theo quy trình riêng; việc bỏ fallback không xóa chúng khỏi lịch sử Git.

### 3. Chạy Backend trực tiếp trên Windows (VS Code/IntelliJ)

Tạo database local tương ứng với `DB_URL`, dùng tài khoản MySQL và mật khẩu riêng. Từ terminal PowerShell ở thư mục repository:

```powershell
.\scripts\start-backend.ps1 -CheckOnly
.\scripts\start-backend.ps1
```

Nếu PowerShell chặn script theo Execution Policy, dùng `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1` (thêm `-CheckOnly` khi cần). Tùy chọn chỉ áp dụng cho tiến trình này, không đổi policy của máy.

Script đọc `.env` như dữ liệu, không thực thi hoặc nội suy; chỉ truyền các biến Backend vào `gradlew bootRun`. Nó ưu tiên file này, tạm bỏ alias `SPRING_DATASOURCE_*`/`APP_JWT_*` cũ rồi khôi phục biến tiến trình khi dừng; không dùng `setx` và không in secret. `-CheckOnly` chỉ kiểm tra định dạng, không xác minh đăng nhập MySQL. Có thể chọn file riêng bằng `-EnvFile <duong-dan>`.

Nếu dùng nút Run/Debug thay vì terminal, đặt bốn biến Backend trong Run Configuration riêng của IDE; VS Code Java hỗ trợ `envFile` trỏ tới `${workspaceFolder}/.env`. `.vscode/` và `.idea/` đã được Git bỏ qua. Không thêm credential vào source hoặc launch configuration được commit.

**Lỗi `Access denied for user`:** kiểm tra host/cổng/schema trong `DB_URL`, `DB_USERNAME` và mật khẩu thực của đúng MySQL instance. Có thể kiểm tra thủ công bằng `mysql -h 127.0.0.1 -P <cong-trong-URL> -u <DB_USERNAME> -p` để nhập mật khẩu qua prompt; không ghi password vào lệnh. Kiểm tra quyền user trên schema và các biến IDE cũ đang ghi đè cấu hình.

**MySQL Docker đã có volume:** sửa `.env` không tự đổi mật khẩu/user bên trong DB. Dùng credential hiện có hoặc quy trình đổi mật khẩu riêng; không xóa volume để xử lý lỗi đăng nhập. Tên volume và credential production đang dùng không được thay tự động.

Trước lần triển khai sau, người quản lý cần kiểm tra `.env` production đã có đủ `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `JWT_SECRET` đúng với giá trị đang dùng; không lấy giá trị local để thay vào VPS. `DB_URL` production trong Compose vẫn được dựng nội bộ như trước.

### 4. Khởi chạy toàn bộ hệ thống bằng Docker Compose

```bash
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
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

MySQL mặc định chỉ dùng mạng Docker nội bộ (`mysql:3306`), không publish cổng host nên không chiếm `127.0.0.1:3306`. Nếu IDE cần kết nối **DB local**, tự tạo file `compose.local.yaml`:

```yaml
services:
  mysql:
    ports:
      - "${DB_BIND:-127.0.0.1}:${DB_PORT:-3307}:3306"
```

Giữ `DB_BIND=127.0.0.1`, không đổi thành `0.0.0.0`. Nếu cổng 3307 đang bận, chọn cổng trống khác bằng `DB_PORT`. Chạy local bằng `docker compose --env-file .env -f compose.yaml -f compose.local.yaml up -d --build`; không dùng override này trên VPS. Cấu hình mặc định và tên volume được giữ nguyên.

Backend chạy trực tiếp kết nối MySQL Docker này phải dùng cổng đã publish trong `DB_URL` (mặc định `localhost:3307`), không dùng `localhost:3306` của MySQL cài trên máy.

### 5. Tạo tài khoản và nhận danh mục mặc định

Mở [http://localhost:8088](http://localhost:8088), đăng ký tài khoản mới (API `POST /api/auth/register`), sau đó đăng nhập. Mỗi tài khoản có ngay 11 danh mục Chi và 6 danh mục Thu để tạo giao dịch; vẫn có thể thêm/sửa/xóa theo quy tắc hiện tại. Không cần chạy seed MVP để có danh mục; không tự backfill tài khoản cũ.

### 6. Nạp dữ liệu mẫu MVP (tùy chọn, chỉ local)

Seed MVP lịch sử mô tả 11 danh mục, 84 giao dịch và 3 ngân sách, độc lập với 17 danh mục tạo khi đăng ký. Kiểm tra user/ID giả định trong database/seed.sql trước khi nạp trên local; không dùng lệnh này để thử nghiệm production:

```bash
# Chỉ chạy trên stack local dùng dữ liệu tổng hợp; nhập mật khẩu khi MySQL hỏi.
docker exec -it smartexpense-mysql mysql -u root -p personal_finance_db -e "SOURCE /database/seed.sql"
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

*Kết quả được README MVP báo cáo trước đây:* **27/27 kịch bản PASS**; chưa chạy lại trong lượt đồng bộ tài liệu D01. Báo cáo lịch sử bao quát toàn bộ luồng Hạ tầng, Nginx Gateway, Xác thực JWT, Nghiệp vụ CRUD và Phân quyền đa người dùng.

### 2. Kiểm thử API bằng Postman Collection

Bộ sưu tập Postman đầy đủ cho toàn bộ API endpoints (Auth, Categories, Transactions, Monthly Budgets, Dashboard) được đặt tại:

- [docs/postman/SmartExpense_Postman_Collection.json](docs/postman/SmartExpense_Postman_Collection.json)
- [docs/postman/README_POSTMAN.md](docs/postman/README_POSTMAN.md)

### 3. Tự động hóa CI/CD Pipeline

- **CI Pipeline (`.github/workflows/ci.yml`):** Tự động kích hoạt khi push/PR vào `dev`, `main` để kiểm tra lint, unit test Gradle và build kiểm thử.
- **CD Pipeline (`.github/workflows/cd.yml`):** Build/push image lên GHCR và triển khai qua SSH khi push dev/main hoặc chạy thủ công. CI và CD hiện độc lập; chờ CI đúng SHA, review release và pin image là công việc FR-12 còn cần thực hiện. Chưa có bằng chứng để cam kết zero-downtime.

---

## Migration, backup và rollback

**Chưa xác nhận migration 2.0 được duyệt hoặc áp dụng trên VPS.** Quỳnh phụ trách DB/QA/DevOps, phối hợp Tuấn review trước khi đổi schema/cấu hình. D06 có [SQL V002 đề xuất và hướng dẫn pre/post-check, backup/restore, rollback](database/migrations/README.md), đã kiểm thử trên MySQL cô lập; không có runner tự áp dụng vào VPS.

- Hiện Hibernate dùng `ddl-auto=update`. Đề xuất version: V001 baseline MVP, V002 icon/color, V003 category_budgets, V004 recurring_templates, V005 recurring_applications. Runner, SQL/FK và việc chuyển sang `validate` còn chờ duyệt (Q10); không để Hibernate và migration cùng đổi schema. Seed không phải migration; DB đã có phải kiểm tra baseline, không chạy CREATE chồng hoặc reset volume.
- Mỗi version cần pre/post-check, checksum và lịch sử chạy; version đã áp dụng không sửa nội dung. Khi lỗi dừng kiểm tra trạng thái thực, không giả định ROLLBACK hoàn tác được mọi DDL.
- Giữ FK/owner và unique ngân sách user/category/kỳ, recurring template/kỳ. FK tồn tại riêng lẻ không chứng minh cùng owner; cần kiểm tra ở service hoặc composite FK được duyệt. Apply định kỳ lưu giao dịch+marker trong một transaction; chống trùng cả request đồng thời. Rule xóa/giữ marker xem API Contract, chưa duyệt (Q06/Q07).
- Trước migration: backup có checksum, exit code 0 và file không rỗng; restore thử vào container riêng rồi đối chiếu số bản ghi/FK/tổng tiền. Dùng dữ liệu tổng hợp, không copy production vào test. Các script mặc định trỏ stack chính: phải truyền rõ container test, không dùng volume chính.
- Công cụ có sẵn: [backup-db.ps1](scripts/backup-db.ps1), [restore-db.ps1](scripts/restore-db.ps1), [test-db-scripts.ps1](scripts/test-db-scripts.ps1). Dump dùng `--databases`, có thể chứa CREATE/USE tên nguồn; chỉ đổi tham số DbName không bảo đảm đổi đích restore. Kiểm tra dump và dùng container cô lập. Cách tạo snapshot nhất quán, quyền/credential và thời gian lưu backup cần DB review; không đưa dump/secret vào Git.
- Rollback ưu tiên dừng phần tính năng lỗi/đổi lại phiên bản ứng dụng và giữ schema bổ sung; không drop bảng có dữ liệu hoặc xóa marker kỳ. Inverse SQL cần kiểm thử/phê duyệt. Nếu phải restore: dừng ghi, xác minh đúng đích/backup; dữ liệu sau mốc backup có thể mất. Không cam kết zero-downtime/RPO/RTO khi chưa đo; không tự restore production.
- CI phải đạt cho đúng commit, release cần review và pin image SHA (Q14). CI/CD hiện chưa có gate này. Phần này là hướng dẫn ngắn, không cấp quyền migration, deploy hoặc xác nhận kết quả kiểm thử.

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
│   ├── SmartExpense_SRS_v2.docx # SRS 2.2, nguồn hiện hành SmartExpense 2.0
│   ├── SmartExpense_QuanTriDuAn.xlsx # Master Plan 45 task / 15 ngày
│   ├── smartexpense-2.0/
│   │   └── API_CONTRACT.md      # API hiện có/dự kiến cho FE/BE
│   ├── SmartExpense_SRS.docx    # SRS MVP lịch sử, giữ nguyên
│   └── BaoCao_SmartExpense_Project_Proposal.docx # Proposal MVP lịch sử, giữ nguyên
├── frontend/
│   ├── Dockerfile               # Multi-stage Dockerfile (Vite Build + Nginx)
│   ├── nginx.conf               # Cấu hình Nginx container & Reverse Proxy /api
│   ├── package.json             # NPM dependencies & scripts
│   ├── public/                  # Static assets (Favicon, Vi.png logo 3D)
│   └── src/
│       ├── assets/              # Logo và hình ảnh giao diện
│       ├── components/          # Reusable UI components (Layout, Auth, Dashboard, etc.)
│       ├── contexts/            # AuthContext, ThemeContext và ToastContext
│       ├── pages/               # Các trang giao diện (Dashboard, Login, Register, v.v.)
│       └── services/            # Axios API client services
├── scripts/
│   ├── backup-db.ps1            # Script PowerShell sao lưu CSDL
│   ├── restore-db.ps1           # Script PowerShell phục hồi CSDL
│   ├── test-db-scripts.ps1      # Kiểm thử hồi quy backup/restore trên MySQL local riêng
│   └── smoke-test.ps1           # Bộ kịch bản kiểm thử tự động 27 test cases
├── compose.yaml                 # Docker Compose đa dịch vụ (Frontend, Backend, MySQL)
├── .env.example                 # File mẫu biến môi trường
├── .gitignore                   # Cấu hình bỏ qua các file nhạy cảm và build artifacts
└── README.md                    # Tài liệu giới thiệu và hướng dẫn tổng quan dự án
```

---

## 📚 Danh Mục Tài Liệu Kỹ Thuật Chi Tiết

1. [SRS SmartExpense 2.0 — nội dung phiên bản 2.2](docs/SmartExpense_SRS_v2.docx) — nguồn phạm vi hiện hành, ngày 27/10/2026.
2. [Master Plan](docs/SmartExpense_QuanTriDuAn.xlsx) — 45 task, 3 thành viên, 27/10–16/11/2026.
3. [API Contract](docs/smartexpense-2.0/API_CONTRACT.md) — endpoint/DTO hiện có và dự kiến; các điểm chưa duyệt ghi ngay trong tài liệu.
4. [Migration, backup và rollback](#migration-backup-và-rollback) — lưu ý dữ liệu và vận hành trước triển khai.
5. [API & Postman MVP](docs/postman/README_POSTMAN.md) — bộ hướng dẫn hiện có, chưa phải collection nghiệm thu đủ FR 2.0.
6. [SRS MVP lịch sử](docs/SmartExpense_SRS.docx) và [Project Proposal MVP lịch sử](docs/BaoCao_SmartExpense_Project_Proposal.docx) — giữ nguyên giai đoạn 19–23/10/2026.

---

<p align="center">
  <strong>SmartExpense Team – Personal Finance Management</strong><br>
  MVP là nền tảng hiện có; SmartExpense 2.0 đang được phát triển và cần nghiệm thu theo SRS 2.2.
</p>
