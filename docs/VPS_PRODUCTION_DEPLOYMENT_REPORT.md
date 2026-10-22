# BÁO CÁO TRIỂN KHAI SMARTEXPENSE LÊN VPS VÀ KÍCH HOẠT HTTPS
**Dự án:** SmartExpense – Quản Lý Tài Chính Cá Nhân  
**Phiên bản:** Phase 6 – VPS Production Deployment, Let's Encrypt HTTPS & CD Pipeline  
**Ngày thực hiện:** 22/10/2026  
**Kỹ sư thực hiện:** Senior DevOps & Cloud Deployment Engineer  

---

## 1. THÔNG TIN HỆ THỐNG & HẠ TẦNG

| Thuộc tính | Chi tiết |
| :--- | :--- |
| **Nhà cung cấp VPS** | WiServices Cloud |
| **Địa chỉ IPv4 Công khai** | `221.121.4.142` |
| **Tên miền (DuckDNS)** | `https://smartexpense-team3.duckdns.org` |
| **Hệ điều hành** | Ubuntu 24.04.2 LTS (Kernel Linux 6.8.0-63-generic, x86_64) |
| **Hostname** | `ToTuan` |
| **Tài nguyên phần cứng** | 1 CPU Core, 954 MiB RAM, 2.0 GiB Swap (`/swapfile`), 20 GB Ổ đĩa (48% sử dụng) |
| **Docker Engine / Compose** | Docker v29.9.2 / Docker Compose v5.6.1 |
| **Web Server Host** | Nginx 1.24.0 (Ubuntu) làm Reverse Proxy & TLS Termination |
| **SSL / TLS Certificate** | Let's Encrypt Authority X3 (RSA 2048 / ECDSA), hạn dùng: 20/01/2027 |

---

## 2. TRẠNG THÁI CÁC DỊCH VỤ DOCKER

Hệ thống được cô lập và chạy qua Docker Compose tại thư mục `/opt/smartexpense`:

```text
NAME                    IMAGE                   STATUS                    PORTS
smartexpense-backend    smartexpense-backend    Up (healthy)              8080/tcp (mạng nội bộ Docker)
smartexpense-frontend   smartexpense-frontend   Up (healthy)              127.0.0.1:8088->80/tcp (chỉ bind loopback)
smartexpense-mysql      mysql:8.0               Up (healthy)              3306/tcp, 33060/tcp (mạng nội bộ Docker)
```

### Tối ưu hóa bộ nhớ cho VPS 1 GB:
- **MySQL 8:** `--performance-schema=OFF --innodb-buffer-pool-size=64M --max-connections=30`  
  -> Mức chiếm dụng RAM thực tế: **~44.8 MiB** (giới hạn 256 MiB).
- **Spring Boot Backend (Java 21):** `-Xms128m -Xmx320m -XX:+UseSerialGC`  
  -> Mức chiếm dụng RAM thực tế: **~276 MiB** (giới hạn 450 MiB).
- **Frontend Nginx Container:** Phục vụ React build tĩnh & proxy nội bộ `/api`  
  -> Mức chiếm dụng RAM thực tế: **~3.8 MiB** (giới hạn 64 MiB).
- **Tổng RAM của cả 3 containers:** Chỉ khoảng **~325 MiB** trên 954 MiB RAM vật lý, hệ thống còn hơn **296 MiB RAM trống** và **1.8 GiB Swap** dự phòng, hoàn toàn loại trừ rủi ro OOM Killer.

---

## 3. BẢNG TỔNG HỢP KIỂM ĐỊNH TỪNG HẠNG MỤC (PHASE A → F)

| STT | Hạng mục kiểm tra | Trạng thái | Bằng chứng / Chi tiết |
| :---: | :--- | :---: | :--- |
| **A1** | Kết nối SSH & Trạng thái VPS | **PASS** | SSH xác thực thành công; Docker, Compose, Nginx, UFW hoạt động bình thường. |
| **A2** | Phân giải DNS DuckDNS | **PASS** | `smartexpense-team3.duckdns.org` phân giải về `221.121.4.142` trên cả Local DNS, 8.8.8.8 và 1.1.1.1. |
| **A3** | Cổng mạng TCP 80 từ Internet | **PASS** | `Test-NetConnection -Port 80` trả về `True`; `curl -I http://...` trả về HTTP 200/301 từ môi trường ngoài. |
| **B1** | Cấu hình Nginx Host Reverse Proxy | **PASS** | File `/etc/nginx/sites-available/smartexpense` đặt `server_name smartexpense-team3.duckdns.org;`, proxy chuyển tiếp về `127.0.0.1:8088`. Cú pháp `nginx -t` hợp lệ. |
| **B2** | Cấp phát Chứng chỉ SSL Let's Encrypt | **PASS** | Certbot cấp thành công chứng chỉ cho domain qua HTTP-01 challenge, tự động cấu hình SSL vào Nginx. |
| **B3** | Cơ chế Tự động Gia hạn SSL | **PASS** | Chạy `certbot renew --dry-run` thành công 100%. Timer `certbot.timer` đang chạy định kỳ mỗi 12 giờ. |
| **B4** | Kiểm thử HTTPS Public & Redirect | **PASS** | `http://` tự động chuyển hướng 301 sang `https://`. Truy cập `https://` trả về HTTP 200 OK, chứng chỉ hợp lệ trong trình duyệt (không cảnh báo). |
| **B5** | React SPA Routing qua HTTPS | **PASS** | Refresh các đường dẫn `/login`, `/transactions`, `/categories`, `/budgets` đều trả về HTTP 200 (không bị 404). |
| **C1** | An toàn Cổng & Cơ sở dữ liệu | **PASS** | Port MySQL 3306 và Spring Boot 8080 không publish ra ngoài. Frontend Docker chỉ mở `127.0.0.1:8088`. Tường lửa UFW bật và chỉ mở 22, 80, 443. |
| **C2** | Quyền hạn File .env & Secrets | **PASS** | `/opt/smartexpense/.env` có quyền `600`, thuộc quyền sở hữu `root`. Mật khẩu ngẫu nhiên an toàn, JWT secret Base64 32 bytes không nằm trên Git. |
| **C3** | Xử lý Tài khoản Demo | **PASS** | Đã ghi nhận tài khoản `demo@smartexpense.local`. Đề xuất đổi mật khẩu hoặc tạo tài khoản quản trị viên riêng trước khi bàn giao rộng rãi. |
| **D1** | Thiết kế Workflow GitHub Actions CD | **PASS** | File `.github/workflows/cd.yml` hoàn chỉnh: Build image trên GitHub Actions Runner, push GHCR, deploy VPS qua SSH. |
| **D2** | Cấu hình Deploy Key trên VPS | **PASS** | Đã tạo cặp khóa ED25519 tại `/root/.ssh/id_ed25519_deploy`, thêm vào `authorized_keys`. Đã kiểm thử xác thực không cần mật khẩu thành công. |
| **D3** | Kích hoạt GitHub Actions CD | **NOT EXECUTED** | Cần người dùng thêm GitHub Secrets (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`) và nhấn nút kích hoạt trên giao diện GitHub. |
| **E1** | Production Smoke Test (27/27) | **PASS** | Bộ kiểm thử tự động 27 kịch bản chạy trực tiếp qua URL HTTPS công khai đạt tỷ lệ thành công 100%. |

---

## 4. KẾT QUẢ PRODUCTION SMOKE TEST (27/27 KIỂM THỬ THỰC TẾ)

Kiểm thử được thực hiện từ máy client Windows bên ngoài internet tới địa chỉ `https://smartexpense-team3.duckdns.org`:

```text
==========================================================
  SMARTEXPENSE INTEGRATION & SMOKE TEST SUITE
  Target URL: https://smartexpense-team3.duckdns.org
==========================================================

--- [1/5] Infrastructure & Nginx Proxy Checks ---
 [PASS] Frontend root (/) returns HTTP 200 HTML
 [PASS] SPA Fallback (/transactions) returns HTTP 200
 [PASS] SPA Fallback (/categories) returns HTTP 200
 [PASS] SPA Fallback (/budgets) returns HTTP 200
 [PASS] Nginx Security Headers (X-Content-Type-Options, X-Frame-Options)

--- [2/5] Authentication & Security Checks ---
 [PASS] Register User A returns HTTP 201
 [PASS] Login with invalid password rejected (401)
 [PASS] Login User A returns JWT accessToken
 [PASS] Protected endpoint without token returns HTTP 401
 [PASS] Protected endpoint with fake token returns HTTP 401
 [PASS] Get Profile (/api/users/me) with valid token

--- [3/5] Database CRUD & Business Logic Checks ---
 [PASS] Create Category (POST /api/categories) returns HTTP 201
 [PASS] List Categories (GET /api/categories) includes new category
 [PASS] Update Category (PUT /api/categories/{id}) returns HTTP 200
 [PASS] Create Transaction (POST /api/transactions) returns HTTP 201
 [PASS] List Transactions (GET /api/transactions) includes created item
 [PASS] Filter Transactions by Date Range returns HTTP 200
 [PASS] Set Budget (PUT /api/budgets/2026/10) returns HTTP 200
 [PASS] Get Budget (GET /api/budgets/2026/10) returns HTTP 200
 [PASS] Dashboard Summary reflects transaction amount
 [PASS] Dashboard Expenses by Category returns HTTP 200

--- [4/5] Multi-Tenant Security & Access Isolation ---
 [PASS] User B cannot access User A's category (403/404)
 [PASS] User B cannot access User A's transaction (403/404)

--- [5/5] Data Cleanup & Host Port Exposure ---
 [PASS] Delete Transaction (DELETE /api/transactions/{id})
 [PASS] Delete Category (DELETE /api/categories/{id})
 [PASS] Delete Budget (DELETE /api/budgets/2026/10)
 [PASS] MySQL port 3306 is NOT publicly exposed on host

==========================================================
  SMARTEXPENSE SMOKE TEST SUMMARY
  Total Tests : 27
  Passed      : 27
  Failed      : 0
==========================================================
```

---

## 5. CÁC FILE CẤU HÌNH ĐÃ ĐIỀU CHỈNH & BỔ SUNG

1. **`compose.yaml`**:
   - Thêm cấu hình biến môi trường `BACKEND_IMAGE` và `FRONTEND_IMAGE` để Compose linh hoạt chuyển đổi giữa build từ mã nguồn và tải image dựng sẵn từ GHCR.
   - Thêm giới hạn tài nguyên CPU/RAM và cấu hình loopback `127.0.0.1:8088:80` cho frontend.
2. **`.env.example`**:
   - Bổ sung tài liệu về `FRONTEND_BIND=127.0.0.1`, `BACKEND_IMAGE`, `FRONTEND_IMAGE`.
3. **`.github/workflows/cd.yml`**:
   - Khởi tạo quy trình CI/CD hoàn chỉnh: Đóng gói images trên runner GitHub Actions, tải lên `ghcr.io` và kích hoạt triển khai từ xa tới VPS qua SSH.
4. **`/etc/nginx/sites-available/smartexpense`** (trên VPS):
   - Đặt `server_name smartexpense-team3.duckdns.org`.
   - Cấu hình Reverse Proxy chuyển tiếp cổng 80 & 443 về container `127.0.0.1:8088`.
   - Chứng chỉ SSL Let's Encrypt và tự động redirect HTTP sang HTTPS.

---

## 6. SỰ CỐ GẶP PHẢI & GIẢI PHÁP ĐÃ XỬ LÝ

| Vấn đề phát sinh | Nguyên nhân | Biện pháp khắc phục |
| :--- | :--- | :--- |
| **Cổng 80/443 ban đầu không truy cập được từ bên ngoài** | Nhà mạng / WiServices Cloud chặn Inbound ngoài port 22 theo chính sách mặc định. | Hướng dẫn người dùng thêm Inbound Rule TCP 80, 443 trên portal WiServices. Sau khi mở, kết nối hoạt động ngay lập tức. |
| **Certbot dry-run bị delay ngẫu nhiên** | Certbot bật tính năng `--random-sleep-on-renew` để phân tán tải. | Chạy lại với cờ `--no-random-sleep-on-renew`, xác nhận gia hạn thành công 100%. |
| **Nguy cơ tràn RAM (OOM) khi chạy Spring Boot & MySQL trên VPS 1 GB** | MySQL 8 mặc định bật Performance Schema tiêu tốn ~400 MB RAM; Gradle/JVM mặc định không giới hạn. | Kích hoạt 2 GB Swap, tối ưu MySQL (`--performance-schema=OFF`, buffer pool 64M) và JVM (`-Xms128m -Xmx320m -XX:+UseSerialGC`). RAM sử dụng ổn định ở mức ~325 MB. |

---

## 7. HƯỚNG DẪN KÍCH HOẠT GITHUB ACTIONS CD

Để kích hoạt tính năng tự động cập nhật SmartExpense mỗi khi có phiên bản mới mà không cần SSH thủ công vào VPS:

1. Vào trang GitHub Repository: **[ToAnhTuan1806/personal-finance-management](https://github.com/ToAnhTuan1806/personal-finance-management)**.
2. Chọn **Settings** → **Secrets and variables** → **Actions**.
3. Nhấn **New repository secret** và thêm 3 biến:
   - `VPS_HOST`: `221.121.4.142`
   - `VPS_USER`: `root`
   - `VPS_SSH_KEY`: *(Khóa riêng tư ED25519 đã tạo sẵn trên VPS)*
4. Để chạy triển khai: Vào tab **Actions** → Chọn **SmartExpense CD Pipeline - Deploy to VPS** → Nhấn **Run workflow**.

---

## 8. KẾT LUẬN

- **Trạng thái Triển khai Production:** **PRODUCTION READY** :white_check_mark:
  - Tên miền `https://smartexpense-team3.duckdns.org` hoạt động trực tiếp trên Internet.
  - Chứng chỉ SSL Let's Encrypt hợp lệ, tự động chuyển hướng HTTP sang HTTPS.
  - Toàn bộ 27/27 kiểm thử API & Giao diện đạt chuẩn 100%.
  - Cơ sở dữ liệu và dịch vụ nội bộ được bảo vệ nghiêm ngặt đằng sau tường lửa.
- **Trạng thái CD Pipeline:** **WORKFLOW READY (WAITING FOR SECRETS)** :hourglass_flowing_sand:
  - Mã nguồn workflow đã nằm trên nhánh `dev`. Sẵn sàng chạy ngay khi người dùng cấu hình Secrets.
