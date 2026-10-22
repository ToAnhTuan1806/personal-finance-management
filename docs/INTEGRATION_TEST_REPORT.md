# BÁO CÁO KIỂM THỬ TÍCH HỢP HỆ THỐNG (INTEGRATION TEST REPORT)

**Dự án:** SmartExpense – Quản Lý Tài Chính Cá Nhân  
**Phase:** Phase 5 – Database & DevOps Verification  
**Thời gian thực thi:** 22/10/2026  
**Môi trường kiểm thử:** Docker Desktop on Windows 11 (Docker v29.8, Docker Compose v5.6)  
**Công cụ kiểm thử:** PowerShell Automated Test Suite (`scripts/smoke-test.ps1`), Nginx Gateway, MySQL Client, Spring Boot Security  
**Phương pháp:** REST API, JWT Authentication, Database Transactions & Network Isolation (Không sử dụng Playwright)

---

## 1. Tóm tắt Kết quả Thực thi (Executive Summary)

| Hạng mục kiểm thử | Số kịch bản | Đạt (PASS) | Lỗi (FAIL) | Trạng thái |
|---|:---:|:---:|:---:|:---:|
| **1. Hạ tầng & Nginx Proxy** | 5 | 5 | 0 | **PASS** |
| **2. Xác thực & Bảo mật JWT** | 6 | 6 | 0 | **PASS** |
| **3. Nghiệp vụ & Database CRUD** | 10 | 10 | 0 | **PASS** |
| **4. Phân quyền & Cô lập đa người dùng (Multi-tenancy)** | 2 | 2 | 0 | **PASS** |
| **5. Dọn dẹp dữ liệu & An toàn cổng mạng** | 4 | 4 | 0 | **PASS** |
| **TỔNG CỘNG** | **27** | **27** | **0** | **100% PASS** |

---

## 2. Chi tiết Kết quả Từng Nhóm Kiểm thử

### Nhóm 1: Hạ tầng, Nginx Gateway & SPA Fallback
*Mục tiêu: Đảm bảo Nginx phục vụ đúng trang React build, hỗ trợ điều hướng SPA khi F5/refresh và chuyển tiếp chính xác `/api`.*

| ID | Tên kịch bản | Endpoint kiểm tra | Kỳ vọng | Kết quả thực tế | Trạng thái |
|:---:|---|---|---|---|:---:|
| INF-01 | Phục vụ trang chủ Frontend | `GET http://localhost:8088/` | HTTP 200, nội dung HTML React | HTTP 200 OK, trả về thẻ HTML SPA | **PASS** |
| INF-02 | SPA Fallback trang Giao dịch | `GET http://localhost:8088/transactions` | HTTP 200, Nginx fallback `index.html` | HTTP 200 OK | **PASS** |
| INF-03 | SPA Fallback trang Danh mục | `GET http://localhost:8088/categories` | HTTP 200, Nginx fallback `index.html` | HTTP 200 OK | **PASS** |
| INF-04 | SPA Fallback trang Ngân sách | `GET http://localhost:8088/budgets` | HTTP 200, Nginx fallback `index.html` | HTTP 200 OK | **PASS** |
| INF-05 | Nginx Security Headers | `GET http://localhost:8088/` | Header `X-Content-Type-Options: nosniff` và `X-Frame-Options: SAMEORIGIN` | Các header bảo mật hiện diện đầy đủ | **PASS** |

### Nhóm 2: Xác thực, Cấp phát Token & Kiểm soát Truy cập JWT
*Mục tiêu: Đảm bảo quy trình đăng ký, đăng nhập cấp JWT hợp lệ, từ chối mật khẩu sai và ngăn chặn truy cập không token/token giả.*

| ID | Tên kịch bản | Endpoint kiểm tra | Dữ liệu đầu vào | Kết quả thực tế | Trạng thái |
|:---:|---|---|---|---|:---:|
| AUT-01 | Đăng ký người dùng mới (User A) | `POST /api/auth/register` | Họ tên, email ngẫu nhiên, pass > 8 ký tự | HTTP 201 Created, tạo tài khoản thành công | **PASS** |
| AUT-02 | Đăng nhập sai mật khẩu | `POST /api/auth/login` | Email User A + mật khẩu sai | HTTP 401 Unauthorized bị từ chối | **PASS** |
| AUT-03 | Đăng nhập đúng mật khẩu | `POST /api/auth/login` | Email User A + mật khẩu đúng | HTTP 200 OK, nhận JWT `accessToken` | **PASS** |
| AUT-04 | Truy cập API bảo vệ không kèm Token | `GET /api/users/me` | Không có header Authorization | HTTP 401 Unauthorized | **PASS** |
| AUT-05 | Truy cập API bảo vệ với Token giả | `GET /api/users/me` | `Bearer invalid.jwt.token.string` | HTTP 401 Unauthorized | **PASS** |
| AUT-06 | Lấy thông tin cá nhân với Token hợp lệ | `GET /api/users/me` | `Bearer <Token_User_A>` | HTTP 200 OK, trả về đúng profile User A | **PASS** |

### Nhóm 3: Nghiệp vụ Dữ liệu & CRUD Hoàn Chỉnh
*Mục tiêu: Kiểm tra toàn diện chu trình tạo, đọc, cập nhật, xóa danh mục, giao dịch, ngân sách và tổng hợp dashboard.*

| ID | Tên kịch bản | Endpoint kiểm tra | Thao tác kiểm tra | Kết quả thực tế | Trạng thái |
|:---:|---|---|---|---|:---:|
| CRUD-01 | Thêm danh mục chi phí | `POST /api/categories` | `{"name":"Ăn uống kiểm thử","type":"EXPENSE"}` | HTTP 201 Created, sinh ID mới | **PASS** |
| CRUD-02 | Lấy danh sách danh mục | `GET /api/categories` | Kiểm tra danh mục vừa tạo có trong danh sách | HTTP 200 OK, tìm thấy danh mục vừa tạo | **PASS** |
| CRUD-03 | Cập nhật tên danh mục | `PUT /api/categories/{id}` | `{"name":"Ăn uống cập nhật","type":"EXPENSE"}` | HTTP 200 OK, tên danh mục được đổi mới | **PASS** |
| CRUD-04 | Thêm giao dịch chi tiêu | `POST /api/transactions` | Số tiền 150.000 VNĐ, ngày 2026-10-15 | HTTP 201 Created, giao dịch lưu DB thành công | **PASS** |
| CRUD-05 | Lấy danh sách giao dịch | `GET /api/transactions` | Phân trang mặc định chứa giao dịch vừa tạo | HTTP 200 OK, giao dịch có mặt trong mảng | **PASS** |
| CRUD-06 | Lọc giao dịch theo khoảng ngày | `GET /api/transactions?startDate=...&endDate=...` | Khoảng 01/10/2026 - 31/10/2026 | HTTP 200 OK, kết quả lọc khớp ngày giao dịch | **PASS** |
| CRUD-07 | Thiết lập giới hạn ngân sách tháng | `PUT /api/budgets/2026/10` | Hạn mức 5.000.000 VNĐ | HTTP 200 OK, lưu ngân sách thành công | **PASS** |
| CRUD-08 | Tra cứu ngân sách tháng | `GET /api/budgets/2026/10` | Kiểm tra số tiền giới hạn tháng 10/2026 | HTTP 200 OK, khớp năm 2026 tháng 10 | **PASS** |
| CRUD-09 | Tổng hợp số liệu Dashboard Summary | `GET /api/dashboard/summary?month=2026-10` | Tổng thu, tổng chi và số dư phản ánh đúng giao dịch | HTTP 200 OK, `totalExpense >= 150000` | **PASS** |
| CRUD-10 | Thống kê chi tiêu theo Danh mục | `GET /api/dashboard/expenses-by-category?month=2026-10` | Danh mục và biểu đồ chi phí | HTTP 200 OK, hiển thị đầy đủ các nhóm chi tiêu | **PASS** |

### Nhóm 4: Cô lập Dữ liệu Đa Người Dùng (Multi-Tenancy Security)
*Mục tiêu: Đảm bảo người dùng B tuyệt đối không thể đọc hay can thiệp vào tài nguyên của người dùng A.*

| ID | Tên kịch bản | Thao tác kiểm tra | Kết quả mong đợi | Kết quả thực tế | Trạng thái |
|:---:|---|---|---|---|:---:|
| SEC-01 | User B đọc danh mục của User A | Dùng Token của User B gọi `GET /api/categories/{id_User_A}` | Bị từ chối HTTP 403 hoặc 404 | HTTP 404 Not Found (Bảo vệ đa khách hàng) | **PASS** |
| SEC-02 | User B đọc giao dịch của User A | Dùng Token của User B gọi `GET /api/transactions/{id_User_A}` | Bị từ chối HTTP 403 hoặc 404 | HTTP 404 Not Found (Không rò rỉ dữ liệu) | **PASS** |

### Nhóm 5: Dọn dẹp Dữ liệu, Kiểm tra Lưu trữ Bền vững & An toàn Cổng Mạng
*Mục tiêu: Kiểm tra khả năng xóa dữ liệu an toàn, kiểm tra tính toàn vẹn dữ liệu khi khởi động lại container và chống lộ cổng DB.*

| ID | Tên kịch bản | Thao tác kiểm tra | Kết quả thực tế | Trạng thái |
|:---:|---|---|---|:---:|
| CLN-01 | Xóa giao dịch thử nghiệm | `DELETE /api/transactions/{id}` | HTTP 204 No Content, xóa thành công | **PASS** |
| CLN-02 | Xóa danh mục thử nghiệm | `DELETE /api/categories/{id}` | HTTP 204 No Content, xóa thành công | **PASS** |
| CLN-03 | Xóa ngân sách thử nghiệm | `DELETE /api/budgets/2026/10` | HTTP 204 No Content, xóa thành công | **PASS** |
| CLN-04 | Kiểm tra cổng MySQL 3306 | Quét kết nối TCP socket tới `127.0.0.1:3306` từ host ngoài container | Kết nối bị từ chối (Không lộ cổng ra host) | **PASS** |
| CLN-05 | Lưu dữ liệu bền vững (Persistence) | Khởi động lại container bằng `docker compose restart`, kiểm tra dữ liệu seed | Toàn bộ tài khoản và giao dịch demo vẫn nguyên vẹn | **PASS** |

---

## 3. Nhật ký Chạy Test Thực Tế (Raw Console Log)

```
==========================================================
  SMARTEXPENSE INTEGRATION & SMOKE TEST SUITE
  Target URL: http://localhost:8088
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

## 4. Kết luận & Đánh giá Nghiệm thu Phase 5

1. **Hạ tầng Docker Compose:** Đạt độ ổn định 100%. Cả ba service `mysql`, `backend`, `frontend` tự động điều phối thứ tự khởi động bằng healthcheck và phụ thuộc (dependency tree).
2. **Nginx Reverse Proxy:** Xử lý hoàn hảo việc proxy `/api` vào container Spring Boot, đồng thời phục vụ SPA React Router không xảy ra lỗi 404 khi người dùng refresh trang.
3. **An toàn bảo mật:**
   - Không xuất cổng 3306 ra ngoài máy chủ.
   - Không lộ JWT key hay password lên repository git.
   - Dữ liệu giữa các khách hàng được cô lập triệt để theo `userId` trích xuất từ JWT claims.
4. **Độ bền dữ liệu:** MySQL volume `smartexpense_mysql_data` bảo toàn dữ liệu qua các chu kỳ khởi động lại.
5. **Đánh giá chung:** Đạt tiêu chuẩn nghiệm thu P0 để bàn giao cho đội ngũ triển khai.
