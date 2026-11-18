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

## Trạng thái và tài liệu hiện hành — 18/11/2026

SmartExpense 2.0 phát triển tiếp MVP, phục vụ ghi thu/chi, quản lý ngân sách và theo dõi tài chính theo tháng. Phiên bản đối chiếu là `dev 88be77a3a582f0f5b5654ed66ae70270783d80a1` (PR #77), đã tích hợp BE `d771331`, FE `d8dd82b` và DB/QA `e8b785b`.

[CI của đúng SHA](https://github.com/ToAnhTuan1806/personal-finance-management/actions/runs/44107981081) và [CD của đúng SHA](https://github.com/ToAnhTuan1806/personal-finance-management/actions/runs/44107981199) đều SUCCESS. Đây là trạng thái pipeline; kiểm tra tài nguyên/container VPS, backup production và email reset tới hộp thư thật vẫn cần người phụ trách xác nhận.

Mở [mục lục tài liệu](docs/README.md), [API hiện hành](docs/smartexpense-2.0/API_CONTRACT.md) và [kiến trúc, ERD, kiểm thử, release/rollback](docs/smartexpense-2.0/RELEASE_D16_D18.md). Bản bàn giao này chỉ cập nhật tài liệu, không sửa API, schema hoặc cấu hình triển khai.

| Thành viên | Vai trò | Nhánh |
| --- | --- | --- |
| Tô Anh Tuấn | Backend + Documentation | feature/tuan |
| Trần Thị Thu Trang | Frontend | feature/trang |
| Phạm Hương Quỳnh | Database + QA + DevOps | feature/quynh |

[SRS 2.3](docs/SmartExpense_SRS_v2.docx) và [Master Plan](docs/SmartExpense_QuanTriDuAn.xlsx) là nguồn phạm vi/kế hoạch đã lập, không tự cập nhật theo tiến độ code. Lịch Sprint 3 ngày 08/11 đã chuyển vào [kho lịch sử](docs/archive/README.md); các mốc và số test cũ không phải trạng thái bản tích hợp hiện tại. Không suy ra nghiệm thu hoặc trạng thái Trello từ việc cập nhật README.

## 🌐 Trải nghiệm Trực tuyến (Live Demo)

- **Domain chính thức (HTTPS):** [https://smartexpense-team3.duckdns.org](https://smartexpense-team3.duckdns.org)
- **Hạ tầng VPS:** Ubuntu 24.04 LTS, Nginx Reverse Proxy & SSL Let's Encrypt tự động gia hạn.
- **Tài khoản demo:** nhận thông tin truy cập qua kênh riêng của nhóm; không công bố email đăng nhập hoặc mật khẩu trong repository.

---

## 🌟 Tính Năng Nổi Bật

### 1. 📊 Bảng điều khiển Tài chính Thông minh (Dashboard)

- **Tổng quan thu chi:** Hiển thị tức thời Tổng thu nhập, Tổng chi tiêu và Số dư khả dụng trong tháng được chọn.
- **Biểu đồ phân bổ chi tiêu (Donut Chart):** Trực quan hóa tỷ trọng chi tiêu theo từng danh mục với màu sắc phân biệt rõ ràng.
- **Biểu đồ dòng tiền (Area Chart):** Hiển thị thu nhập và chi tiêu theo ngày trong tháng được chọn; Reports hỗ trợ so sánh tối đa 6 tháng liên tiếp.
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
  - 🔵 **Chạm hạn mức (At Limit):** Chi đúng bằng hạn mức, chưa vượt.
  - 🔴 **Vượt ngân sách (Over Budget):** Chi lớn hơn hạn mức.

So ngưỡng bằng tiền trước khi làm tròn tỷ lệ; Monthly Budget chỉ trả `exceeded=true` khi `spentAmount > amountLimit`.

### 5. 🔐 Bảo mật & Cô lập Dữ liệu (Security & Multi-Tenancy)

- Xác thực người dùng bằng **JSON Web Token (JWT)** chuẩn HMAC-SHA256.
- Mật khẩu người dùng được băm an toàn bằng thuật toán **BCrypt**.
- Cơ chế cô lập đa người dùng: Mỗi người dùng chỉ xem, sửa và xóa được dữ liệu thuộc quyền sở hữu của chính mình.

---

### 6. Calendar, Reports và CSV

- Calendar chọn tháng/năm, hiển thị tổng ngày và danh sách giao dịch; ngày trống không có pager giả.
- Reports so sánh 1–6 tháng, tổng thu/chi/số dư và phân bổ danh mục; tháng rỗng vẫn được trả đủ.
- CSV xuất toàn bộ giao dịch khớp bộ lọc đã áp dụng, không chỉ trang đang xem; tối đa 10.000 dòng, vượt giới hạn trả lỗi.

### 7. Giao dịch định kỳ và trợ lý tài chính

- Mẫu định kỳ đang bật tự ghi nhận vào sổ theo ngày lặp, giờ Việt Nam; bắt đầu từ kỳ sắp tới, không ghi bù. Hiển thị ngày ghi nhận tiếp theo và cho phép tạm dừng. Chống ghi trùng cùng kỳ; cần migration V007 trước khi triển khai Backend mới. Xem [contract tự động định kỳ](docs/smartexpense-2.0/API_CONTRACT.md#tự-động-ghi-nhận-định-kỳ-nâng-cấp-tháng-112026).
- Các intent thống kê dùng dữ liệu Backend theo JWT owner. Chỉ ADVICE gọi Gemini cho lời khuyên chung, không gửi dữ liệu tài chính hoặc câu hỏi gốc.
- Nâng cấp chatbot đang phát triển: giải thích biến động chi với giao dịch liên quan, dự báo ngân sách có tính lịch định kỳ, và thử tác động một khoản mua. Các phép tính chỉ đọc, xử lý nội bộ; giao diện dùng thẻ ngắn với chi tiết mở rộng. Xem [contract và kiểm thử](docs/qa/AI_ANALYSIS.md); chưa xác nhận triển khai production.
- Quên/đặt lại mật khẩu dùng token một lần có hạn; reset thành công thu hồi JWT cũ. Thông báo gửi mail thành công không chứng minh đã nhận thư.
- Giao dịch và định kỳ giữ tối đa 2 chữ số thập phân. Robot 3D lazy load, có SVG fallback và kiểm soát tự tải khi tab ẩn/Save-Data/reduced motion.

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
- Frontend trực tiếp và kiểm thử: Node.js cùng npm; dùng npm ci để cài đúng dependency theo lockfile.
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

Để bật tư vấn AI (`ADVICE`), Backend cần `GEMINI_API_KEY` và `GEMINI_MODEL`. Model được chọn cho phần tư vấn ngắn là `gemini-3.5-flash-lite`; cấu hình mẫu có trong `.env.example`. Script trên nạp hai biến từ file env hoặc kế thừa môi trường tiến trình nếu không khai báo trong file. Giá trị trong file, kể cả rỗng, được ưu tiên; muốn giữ key từ môi trường thì bỏ dòng `GEMINI_API_KEY` trong file. `-CheckOnly` không gọi Google và không xác nhận key/quota. Khởi động lại Backend sau khi đổi cấu hình.

Compose truyền hai biến vào container Backend. Người vận hành cần cấp chúng trong môi trường triển khai và recreate Backend để áp dụng; thay đổi local không tự cấu hình key trên VPS. Thống kê, lời chào và soạn khoản chi vẫn xử lý nội bộ; chỉ tư vấn chung gọi Gemini.

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

Kết quả đã xác minh ngày 17/11/2026: **1.279 Backend PASS**, **617 Frontend PASS**, 0 fail/error/skipped; D03 MySQL **55/55** là tập con Backend. Script backup/restore đạt **22/22**, HTTP/SQL/restore local **13/13**, checksum 8 bảng sau restore khớp. Đây là các lượt/tập con khác nhau, không cộng thành một tổng.

JaCoCo overall line 97,3314%; Sonar New Code Coverage 95,3%, New Issues 0, Quality Gate OK. Cảnh báo CSRF vẫn OPEN để review thủ công. Chi tiết phiên bản và giới hạn tại [bản bàn giao kỹ thuật](docs/smartexpense-2.0/RELEASE_D16_D18.md); không có lượt test mới chỉ để sửa tài liệu ngày 18/11.

Từ `backend/`, cần JDK 21 và Docker Engine local để chạy MySQL Testcontainers:

```powershell
.\gradlew.bat test verifyD03IntegrationTests jacocoTestReport --no-daemon --max-workers=1 --console=plain
```

Đối chiếu từng testcase ở `backend/build/test-results/test/`; integration bị skip không được tính PASS. JaCoCo HTML/XML ở `backend/build/reports/jacoco/test/`. Khi cần kết quả chạy mới thay vì UP-TO-DATE, thêm `--rerun-tasks`; artifact build có thể bị ghi đè.

Từ `frontend/`:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
$env:VITE_API_URL = '/api'
npm.cmd run build
```

`VITE_API_URL=/api` dùng cho bản build được reverse proxy như CI/production. Build còn cảnh báo chunk lớn; không đổi threshold để che cảnh báo.

[Postman Collection MVP](docs/postman/README_POSTMAN.md) và `scripts/smoke-test.ps1` là công cụ bổ trợ lịch sử, không bao phủ toàn bộ API 2.0. Không dùng tài khoản/dữ liệu thật để chạy fixture hoặc cleanup.

CI có Backend Test & Build, Frontend Lint & Build và Docker Packaging Check. CD tự chạy độc lập theo workflow hiện có; CI xanh không thay cho review release, backup và kiểm tra đúng môi trường. Không cam kết zero-downtime khi chưa đo.

## Migration, backup và rollback

Schema hiện tại có 8 bảng. Chuỗi migration đã kiểm thử cô lập: MVP trong test resources → V002 → V003 → V004 → V005 → V006; repository không có V001. Hướng dẫn SQL nằm tại [database/migrations/README.md](database/migrations/README.md). Kết quả test không chứng minh migration đã được duyệt hoặc áp dụng trên VPS.

- `application.properties` hiện mặc định Hibernate `ddl-auto=update`; test migration dùng schema riêng/validate. Chuyển production sang runner hoặc `validate` cần kế hoạch và review riêng; không để hai cơ chế cùng thay đổi schema.
- Version SQL đã áp dụng cần giữ checksum/lịch sử; MySQL DDL không phải lúc nào cũng rollback được. Không chạy CREATE/seed chồng hoặc xóa volume để xử lý lỗi đăng nhập.
- Giữ FK và ownership, unique ngân sách user/category/kỳ và mẫu/kỳ. Apply lưu transaction cùng marker nguyên tử; xóa giao dịch giữ marker với transaction_id=null, không cho apply lại hoặc xóa mẫu đã áp dụng.
- [backup-db.ps1](scripts/backup-db.ps1), [restore-db.ps1](scripts/restore-db.ps1), [test-db-scripts.ps1](scripts/test-db-scripts.ps1) trên bản dev đã chốt dùng byte stream và snapshot InnoDB. Truyền rõ container/schema test; không dùng stack/volume chính làm fixture.
- Dump dùng `--databases`, chứa CREATE/USE tên nguồn. Chỉ đổi `-DbName` không đổi mọi đích bên trong dump; kiểm tra trước và restore thử trên container cô lập. Backup cần exit code 0, file không rỗng và checksum; giữ dump/credential ngoài Git.
- Trước thay đổi production, người phụ trách chốt backup/checksum, image digest trước/sau, dung lượng và cửa sổ thao tác. Rollback ưu tiên image đã duyệt; restore DB cần dừng ghi, đánh giá tương thích và rủi ro mất dữ liệu sau backup. Không tự restore production hoặc cam kết RPO/RTO chưa đo.

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
│   ├── SmartExpense_SRS_v2.docx # SRS 2.3; lịch kế hoạch ngày 08/11 là lịch sử
│   ├── SmartExpense_QuanTriDuAn.xlsx # Master Plan gốc, giữ mã task để truy vết
│   ├── smartexpense-2.0/
│   │   └── API_CONTRACT.md      # API hiện có/dự kiến cho FE/BE
│   ├── README.md              # Mục lục tài liệu hiện hành
│   └── archive/               # SRS/Proposal MVP và lịch Sprint 3 cũ
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

1. [Mục lục tài liệu](docs/README.md) — điểm vào cho phạm vi hiện hành và hồ sơ lịch sử.
2. [SRS 2.3](docs/SmartExpense_SRS_v2.docx), [Master Plan](docs/SmartExpense_QuanTriDuAn.xlsx) — nguồn yêu cầu/kế hoạch gốc, không thay tiến độ đã kiểm chứng.
3. [API Contract](docs/smartexpense-2.0/API_CONTRACT.md) — endpoint/DTO hiện có, tách rõ đề xuất chưa triển khai.
4. [Bàn giao kỹ thuật](docs/smartexpense-2.0/RELEASE_D16_D18.md) — kiến trúc/ERD/Auth/AI, kiểm thử và release/rollback.
5. [Mục lục QA](docs/qa/README.md) — snapshot theo từng ngày, giữ kết quả và evidence lịch sử.
6. [Tài liệu lưu trữ](docs/archive/README.md) — SRS/Proposal MVP và lịch Sprint 3 cũ, không dùng làm trạng thái release hiện tại.

---

<p align="center"><strong>SmartExpense Team – Personal Finance Management</strong></p>
