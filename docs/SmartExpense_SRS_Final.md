# ĐẶC TẢ YÊU CẦU DỰ ÁN (SRS)
# SmartExpense – Personal Finance Management

---

**Mã dự án:** `PRJ-SMARTEXPENSE-MVP-01`  
**Tên dự án:** SmartExpense – Hệ thống Quản Lý Thu Chi Cá Nhân  
**Phiên bản tài liệu:** `2.0 – Final Release & Production Deployment`  
**Quy mô nhóm:** 03 thành viên *(ReactJS + Spring Boot + MySQL + DevOps)*  
**Thời gian thực hiện:** 19/10/2026 – 22/10/2026 | **Ngày bàn giao & Nghiệm thu:** 23/10/2026  
**Môi trường triển khai trực tuyến:** [https://smartexpense-team3.duckdns.org](https://smartexpense-team3.duckdns.org)  

---

## 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)

### 1.1. Mục đích tài liệu
Tài liệu này đặc tả toàn bộ yêu cầu kỹ thuật, yêu cầu chức năng, yêu cầu phi chức năng, kiến trúc hệ thống và tiêu chí kiểm thử nghiệm thu cho dự án **SmartExpense (Personal Finance Management)**. Tài liệu được chuẩn hóa và nâng cấp từ phiên bản MVP 1.1 sang phiên bản 2.0 phản ánh chính xác 100% mã nguồn thực tế và hệ thống đang vận hành trên môi trường Production Cloud VPS.

### 1.2. Phân vai nhân sự & Tổ chức dự án

| Thành viên | Vai trò chính | Trách nhiệm chi tiết trong dự án | Nhánh Git chính |
| :--- | :--- | :--- | :--- |
| **Member 1** | **Team Lead / Frontend** | Điều phối tiến độ, xây dựng ứng dụng SPA bằng React 19 (Vite + Tailwind CSS), màn hình Xác thực, Danh mục, Giao dịch, Ngân sách và Dashboard thống kê; tích hợp REST API; thiết kế UI/UX ví 3D đồng bộ. | `feature/frontend-*` |
| **Member 2** | **Backend Developer** | Xây dựng dịch vụ Spring Boot (Java 21 LTS), cấu hình Spring Security 6 & JWT, triển khai toàn bộ RESTful API (Auth, User, Category, Transaction, Budget, Dashboard); validation dữ liệu và kiểm thử đơn vị. | `feature/backend`, `feature/*-crud` |
| **Member 3** | **Database / QA / DevOps** | Thiết kế lược đồ CSDL MySQL 8.0, tối ưu hóa index, viết script dữ liệu mẫu; cấu hình Docker Compose đa dịch vụ, GitHub Actions CI/CD; tự động hóa deploy VPS, kiểm thử tích hợp 27 test cases và kiểm thử giao diện E2E. | `feature/database-*`, `feature/devops` |

**Nguyên tắc phối hợp:** Toàn bộ thành viên tuân thủ quy trình Git Flow qua nhánh `dev`, thực hiện code review nghiêm ngặt trước khi merge Pull Request, kiểm tra chéo bảo mật phân quyền đa người dùng và đảm bảo không có lỗ hổng rò rỉ dữ liệu.

### 1.3. Người dùng và phạm vi nghiệp vụ
- **Đối tượng sử dụng:** Cá nhân có nhu cầu theo dõi thu nhập, kiểm soát chi tiêu sinh hoạt hàng ngày, phân bổ danh mục tài chính và thiết lập hạn mức ngân sách tháng để tránh bội chi.
- **Phạm vi nghiệp vụ:** Hệ thống phục vụ người dùng cuối với vai trò `USER`. Mỗi tài khoản hoạt động hoàn toàn độc lập và chỉ được truy xuất, chỉnh sửa dữ liệu do chính mình tạo ra (Multi-tenancy isolation).
- **Ranh giới hệ thống:** Không kết nối tài khoản ngân hàng thật, không xử lý thanh toán cổng trung gian để đảm bảo an toàn và tập trung tối đa vào trải nghiệm quản lý thu chi cá nhân.

---

## 2. PHẠM VI TÍNH NĂNG (SYSTEM SCOPE)

### 2.1. Phân hệ Authentication & Profile (Xác thực & Hồ sơ)
- **Đăng ký tài khoản:** Xác thực định dạng email duy nhất, họ tên, mật khẩu tối thiểu 6 ký tự.
- **Đăng nhập & Cấp phát JWT:** Xác thực bằng BCrypt hash, cấp mã Bearer Token (HMAC-SHA256) có thời hạn hiệu lực.
- **Đăng xuất an toàn:** Hủy token trên Client, làm sạch LocalStorage và trạng thái Context.
- **Quản lý thông tin cá nhân:** Xem thông tin tài khoản hiện tại (`/api/users/me`), cập nhật họ và tên hiển thị trong hệ thống. Lời chào cá nhân hóa trên thanh điều hướng (*"Xin chào, [Họ và tên]"*).

### 2.2. Phân hệ Category & Search (Danh mục & Tìm kiếm)
- **Phân loại danh mục:** Phân định rõ ràng giữa danh mục **Thu nhập (INCOME)** và **Chi tiêu (EXPENSE)**.
- **Thao tác Danh mục (CRUD):** Thêm mới danh mục, chỉnh sửa tên danh mục, xóa danh mục.
- **Ràng buộc toàn vẹn dữ liệu:** Chặn triệt để hành động xóa danh mục nếu đang có ít nhất một giao dịch liên kết tới danh mục đó.
- **Bộ lọc giao diện:** Bộ chuyển tab nhanh (PillTabs) giúp lọc danh mục theo loại mượt mà, tức thời.

### 2.3. Phân hệ Transactions (Quản lý Giao dịch Thu - Chi)
- **Thêm giao dịch mới:** Nhập số tiền (> 0), chọn loại giao dịch (INCOME / EXPENSE), chọn danh mục tương ứng, chọn ngày phát sinh giao dịch và ghi chú mô tả.
- **Sửa & Xóa giao dịch:** Cho phép cập nhật số tiền, ngày tháng, danh mục hoặc xóa bỏ giao dịch phát sinh sai sót.
- **Ràng buộc nghiệp vụ:** Số tiền phải là số dương lớn hơn 0; danh mục được chọn phải cùng loại với loại giao dịch và phải thuộc quyền sở hữu của chính người dùng đó.

### 2.4. Phân hệ Transaction History & Filtering (Lịch sử & Bộ lọc Giao dịch)
- **Hiển thị danh sách:** Danh sách giao dịch sắp xếp theo thứ tự thời gian giảm dần (mới nhất lên đầu).
- **Bộ lọc đa tiêu chí:**
  - Lọc theo tháng phát sinh (YYYY-MM).
  - Lọc theo loại (Tất cả / Thu nhập / Chi tiêu).
  - Lọc theo từng danh mục cụ thể.
  - Lọc theo khoảng ngày (Từ ngày – Đến ngày).
  - Tìm kiếm theo từ khóa trong phần ghi chú giao dịch.
- **Phân trang dữ liệu:** Hỗ trợ phân trang linh hoạt (Pagination) giúp tối ưu hiệu năng hiển thị và tránh tràn giao diện khi có số lượng lớn bản ghi.

### 2.5. Phân hệ Dashboard & Monthly Budget (Bảng điều khiển & Ngân sách Tháng)
- **Bảng điều khiển trực quan (Dashboard):**
  - Card tổng hợp: Tổng thu nhập, Tổng chi tiêu và Số dư khả dụng trong tháng được chọn.
  - Biểu đồ phân bổ chi tiêu (Donut Chart): Trực quan hóa tỷ lệ % chi tiêu theo từng danh mục.
  - Biểu đồ xu hướng (Bar Chart): So sánh dòng tiền thu nhập vs chi tiêu qua các tháng liên tiếp.
  - Danh sách giao dịch phát sinh gần nhất.
- **Quản lý hạn mức ngân sách tháng (Monthly Budget):**
  - Thiết lập một mức ngân sách chi tiêu cố định cho mỗi tháng.
  - Tự động đối soát tổng chi tiêu thực tế trong tháng với ngân sách đã đặt.
  - **Hệ thống cảnh báo 3 mức trực quan:**
    - 🟢 **An toàn (Safe):** Tỷ lệ sử dụng < 80%.
    - 🟡 **Cảnh báo (Warning):** Tỷ lệ sử dụng từ 80% đến dưới 100%.
    - 🔴 **Vượt ngân sách (Over Budget):** Tỷ lệ sử dụng >= 100%.
  - Hiển thị thông báo nhắc nhở thiết lập ngân sách nếu tháng hiện tại chưa có dữ liệu cấu hình.

### 2.6. Tính năng ngoài phạm vi MVP (Out of Scope)
- Trợ lý ảo AI Chatbot tự động tư vấn đầu tư.
- Đồng bộ tự động với biến động số dư qua SMS/Ngân hàng.
- Quản lý đa ví (ví tiền mặt, thẻ tín dụng, ví điện tử) và đa tiền tệ.
- Giao dịch định kỳ tự động lặp lại hàng tháng.

---

## 3. QUY TẮC NGHIỆP VỤ & RÀNG BUỘC DỮ LIỆU (BUSINESS RULES)

- **BR-01 (Cô lập dữ liệu tuyệt đối):** Mỗi người dùng chỉ sở hữu và thao tác trên dữ liệu (danh mục, giao dịch, ngân sách) của chính mình. Mọi API nghiệp vụ đều trích xuất `userId` trực tiếp từ JWT của phiên đăng nhập đã xác thực, tuyệt đối không chấp nhận `userId` truyền từ Client.
- **BR-02 (Chuẩn tiền tệ):** Số tiền lưu trữ trong CSDL dưới dạng số thực `DECIMAL(15,2)`, không âm, đơn vị hiển thị chuẩn hóa là Việt Nam Đồng (`₫` - VND).
- **BR-03 (Công thức tài chính):**
  - $\text{Tổng thu} = \sum \text{Giao dịch INCOME trong kỳ}$
  - $\text{Tổng chi} = \sum \text{Giao dịch EXPENSE trong kỳ}$
  - $\text{Số dư khả dụng} = \text{Tổng thu} - \text{Tổng chi}$
- **BR-04 (Phạm vi tính toán ngân sách):** Ngân sách tháng chỉ so sánh đối soát với các giao dịch có `type = 'EXPENSE'` và ngày giao dịch nằm trong tháng đó (`YEAR(transaction_date) = year` và `MONTH(transaction_date) = month`).
- **BR-05 (Bảo vệ toàn vẹn tham chiếu):** Không cho phép xóa bất kỳ danh mục nào nếu bảng `transactions` vẫn còn chứa ít nhất một giao dịch tham chiếu tới danh mục đó.

---

## 4. YÊU CẦU KỸ THUẬT VÀ KIẾN TRÚC HỆ THỐNG

### 4.1. Bảng công nghệ chi tiết (Tech Stack)

| Thành phần | Công nghệ / Phiên bản | Vai trò & Mục đích sử dụng |
| :--- | :--- | :--- |
| **Frontend Framework** | **React 19.3.1**, Vite 8.3.4 | Xây dựng ứng dụng Single Page Application (SPA), tối ưu tốc độ render và đóng gói mã nguồn siêu nhanh. |
| **Styling & Icons** | **Tailwind CSS v4**, Lucide React | Thiết kế giao diện Glassmorphism hiện đại, responsive hoàn toàn trên Desktop, Tablet và Mobile. |
| **Biểu đồ dữ liệu** | **Recharts 3.10.1** | Trực quan hóa dữ liệu thống kê tài chính qua biểu đồ tròn (Donut) và biểu đồ cột (Bar). |
| **Backend Framework**| **Spring Boot 4.1.1**, Java 21 LTS | Xây dựng RESTful API kiến trúc phân tầng (Controller, Service, Repository, DTO). |
| **Bảo mật** | **Spring Security 6**, JWT, BCrypt | Xác thực stateless thông qua JWT (HMAC-SHA256), mã hóa một chiều mật khẩu bằng thuật toán BCrypt. |
| **ORM & Database** | **Spring Data JPA**, Hibernate, MySQL 8.0 | Tự động ánh xạ Entity và quản lý truy vấn quan hệ; bảng mã `utf8mb4_unicode_ci` chuẩn tiếng Việt. |
| **Web Server / Proxy**| **Nginx 1.24** | Điều hướng SPA Fallback, chuyển tiếp Reverse Proxy đường dẫn `/api`, mã hóa bảo mật SSL/TLS Let's Encrypt. |
| **Đóng gói & Điều phối**| **Docker**, Multi-stage Build, Compose | Tiêu chuẩn hóa môi trường thực thi, cô lập tài nguyên và cấu hình giới hạn RAM an toàn cho VPS. |
| **CI/CD Tự động hóa** | **GitHub Actions**, GHCR (`ghcr.io`) | Tự động hóa kiểm thử, đóng gói image lên GitHub Container Registry và triển khai tự động lên VPS qua SSH. |

### 4.2. Sơ đồ Kiến trúc Triển khai (Deployment Architecture)

```text
                            [ Người dùng Internet / Trình duyệt ]
                                             │
                                             │ HTTPS / TLS 1.3 (Port 443)
                                             ▼
                        ┌────────────────────────────────────────┐
                        │    Nginx Host (Reverse Proxy & TLS)    │
                        │  - Chứng chỉ SSL Let's Encrypt tự động │
                        │  - Bảo vệ tấn công & Rate Limiting     │
                        └────────────────────┬───────────────────┘
                                             │
                                             │ HTTP (Loopback 127.0.0.1:8088)
                                             ▼
                        ┌────────────────────────────────────────┐
                        │        Nginx Frontend Container        │
                        │  - Phục vụ Static Build (React/Vite)   │
                        │  - Điều hướng SPA Fallback             │
                        │  - Reverse proxy chuyển tiếp /api      │
                        └────────────────────┬───────────────────┘
                                             │
                                             │ http://backend:8080/api (Mạng Docker nội bộ)
                                             ▼
                        ┌────────────────────────────────────────┐
                        │     Spring Boot Backend Container      │
                        │  - Java 21 JRE (Chạy Non-root user)    │
                        │  - Spring Security & JWT Auth Filter   │
                        │  - Tối ưu RAM: -Xms128m -Xmx320m       │
                        └────────────────────┬───────────────────┘
                                             │
                                             │ jdbc:mysql://mysql:3306 (Mạng Docker nội bộ)
                                             ▼
                        ┌────────────────────────────────────────┐
                        │       MySQL 8 Database Container       │
                        │  - Named Volume: smartexpense_mysql    │
                        │  - Tối ưu RAM: buffer pool 64M         │
                        │  - Cổng 3306 hoàn toàn KHÔNG mở ra ngoài│
                        └────────────────────────────────────────┘
```

### 4.3. Quy trình CI/CD Hoàn thiện (GitHub Actions Pipeline)
1. **CI Pipeline (`.github/workflows/ci.yml`):**
   - Kích hoạt khi có commit/PR vào nhánh `dev` hoặc `main`.
   - Chạy song song: Lint & Build Frontend (`npm ci`, `npm run lint`, `npm run build`), Unit Test Backend với database MySQL service cô lập (`./gradlew test`, `./gradlew bootJar`).
2. **CD Pipeline (`.github/workflows/cd.yml`):**
   - Tự động đóng gói hình ảnh Docker đa tầng cho Backend và Frontend.
   - Đẩy (Push) an toàn lên **GitHub Container Registry (`ghcr.io`)**.
   - Thiết lập kết nối SSH vào VPS (`221.121.4.142`), tự động kéo image mới, thực hiện `git reset --hard` đồng bộ mã nguồn và khởi động lại dịch vụ với thời gian gián đoạn bằng không (Zero-downtime).

---

## 5. YÊU CẦU CHỨC NĂNG CHI TIẾT (FUNCTIONAL REQUIREMENTS)

### 5.1. Phân hệ Tài khoản & Danh mục
- **FR-01 (Đăng ký / Đăng nhập):**
  - Người dùng đăng ký bằng Email, Họ tên, Mật khẩu. Hệ thống từ chối nếu Email đã tồn tại trong CSDL.
  - Đăng nhập đúng thông tin cấp phát JWT token có thời hạn 24 giờ. Đăng nhập sai trả về HTTP 401 Unauthorized kèm thông báo lỗi.
- **FR-02 (Thông tin cá nhân):**
  - Người dùng xem thông tin của chính mình qua `/api/users/me` và cập nhật họ tên qua `/api/users/profile`.
- **FR-03 (CRUD Danh mục):**
  - Cho phép tạo danh mục với tên và phân loại (`INCOME` hoặc `EXPENSE`).
  - Chặn thao tác xóa nếu danh mục đang được giao dịch nào đó sử dụng; trả về lỗi HTTP 400 kèm thông báo tiếng Việt giải thích rõ lý do.

### 5.2. Phân hệ Giao dịch
- **FR-04 (Tạo giao dịch):**
  - Giao diện cung cấp form nhập số tiền (tự động định dạng hàng nghìn), loại thu/chi, danh mục tương ứng, ngày giao dịch (mặc định hôm nay) và ghi chú.
  - Backend kiểm tra hợp lệ: số tiền > 0, danh mục đúng loại và thuộc sở hữu của User.
- **FR-05 (Sửa / Xóa giao dịch):**
  - Người dùng có thể chỉnh sửa bất kỳ trường nào của giao dịch hoặc xóa bỏ giao dịch đó.
  - Hệ thống kiểm soát quyền sở hữu: Người dùng A không thể sửa/xóa giao dịch của Người dùng B.
- **FR-06 (Lịch sử & Bộ lọc giao dịch):**
  - Hiển thị danh sách có phân trang (10 bản ghi/trang), cho phép lọc theo tháng, loại thu/chi, danh mục, khoảng ngày và từ khóa ghi chú.

### 5.3. Phân hệ Dashboard & Ngân sách
- **FR-07 (Thống kê Tổng quan Tháng):**
  - API `/api/dashboard/summary` tự động tính tổng thu, tổng chi và số dư khả dụng dựa trên tất cả giao dịch thực phát sinh trong tháng được chọn.
- **FR-08 (Biểu đồ Phân bổ & Xu hướng):**
  - API `/api/dashboard/expenses-by-category` trả về tổng chi và tỷ trọng phần trăm theo từng danh mục.
  - API `/api/dashboard/trend?months=6` trả về chuỗi số liệu thu chi của 6 tháng liên tiếp để vẽ biểu đồ so sánh xu hướng.
- **FR-09 (Thiết lập Ngân sách Tháng):**
  - Cho phép người dùng đặt một hạn mức chi tiêu (`amount_limit > 0`) cho tháng/năm bất kỳ.
  - Đảm bảo mỗi tháng chỉ tồn tại duy nhất một mức ngân sách cho mỗi người dùng.
- **FR-10 (Cảnh báo Ngân sách Thông minh):**
  - Đối soát tổng chi với hạn mức ngân sách:
    - Nếu chi tiêu < 80%: Hiển thị thanh tiến độ màu xanh (An toàn).
    - Nếu chi tiêu >= 80% và < 100%: Hiển thị màu vàng kèm cảnh báo sắp chạm hạn mức.
    - Nếu chi tiêu >= 100%: Hiển thị màu đỏ kèm cảnh báo vượt ngân sách.
    - Nếu chưa đặt ngân sách: Hiển thị liên kết nhắc nhở thiết lập nhanh.

---

## 6. YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)

### 6.1. Hiệu năng & Tối ưu hóa Tài nguyên (Performance)
- **NFR-01 (Thời gian phản hồi API):** Các API truy vấn danh sách giao dịch, danh mục và dashboard phản hồi dưới **100ms** (vượt xa chỉ tiêu < 500ms của SRS ban đầu) nhờ đánh chỉ mục `idx_transactions_user_date`.
- **NFR-02 (Thời gian tải trang):** Thời gian tải trang ban đầu dưới **0.5 giây** (vượt chỉ tiêu < 2 giây) nhờ tối ưu Vite production bundle và nén Gzip Nginx.
- **NFR-03 (Tối ưu hóa bộ nhớ VPS 1GB):**
  - MySQL container: Cấu hình giới hạn bộ nhớ tối đa **256 MiB**, buffer pool 64M, tắt Performance Schema (chiếm dụng thực tế: **~78 MiB**).
  - Spring Boot container: Tối ưu JVM `-Xms128m -Xmx320m -XX:+UseSerialGC`, giới hạn bộ nhớ tối đa **450 MiB** (chiếm dụng thực tế: **~286 MiB**).
  - Nginx Frontend: Giới hạn **64 MiB** (chiếm dụng thực tế: **~2.2 MiB**).
  - Toàn bộ 3 dịch vụ chiếm **~367 MiB RAM**, hệ thống chạy mượt mà trên VPS 1GB RAM mà không bị tràn bộ nhớ hay kích hoạt OOM Killer.

### 6.2. An toàn & Bảo mật (Security)
- **NFR-04 (Mã hóa mật khẩu):** Mật khẩu người dùng được băm một chiều bằng thuật toán BCrypt với độ mạnh chuẩn. Không bao giờ lưu trữ hoặc ghi log mật khẩu dạng rõ.
- **NFR-05 (Bảo mật REST API):** Toàn bộ API nghiệp vụ bắt buộc có Bearer Token JWT hợp lệ trong Request Header.
- **NFR-06 (Cô lập cổng mạng):** Cổng CSDL MySQL (3306) và cổng ứng dụng Backend (8080) hoàn toàn nằm trong mạng nội bộ Docker `smartexpense-net`, tuyệt đối không mở ra ngoài Internet.
- **NFR-07 (CORS & HTTPS):** Cấu hình CORS chặt chẽ, toàn bộ lưu lượng dữ liệu truyền tải đều được mã hóa bằng chứng chỉ SSL/TLS Let's Encrypt (HTTPS).

### 6.3. Trải nghiệm người dùng (UI/UX)
- **NFR-08 (Giao diện đồng bộ):** Thiết kế Glassmorphism hiện đại, biểu tượng ví 3D (`Vi.png`) đồng bộ trên Navbar, Sidebar, Favicon và trang Landing Page.
- **NFR-09 (Responsive):** Tương thích hoàn hảo trên các độ phân giải màn hình từ Desktop (1440px), Laptop (1024px) đến Mobile (375px).
- **NFR-10 (Trạng thái giao diện):** Luôn có đầy đủ trạng thái Đang tải (Loading skeleton), Trạng thái rỗng (Empty state) và Thông báo lỗi (Error toast/alert).

---

## 7. MÔ PHỎNG DỮ LIỆU CHUẨN & NGHIỆM THU (SEED DATA SPECIFICATION)

Để phục vụ công tác đánh giá, chấm điểm và demo sản phẩm, cơ sở dữ liệu đã được nạp sẵn bộ dữ liệu mẫu tự nhiên, chân thực được liên kết trực tiếp vào tài khoản nghiệm thu chính thức:

### 7.1. Tài khoản Nghiệm thu Chính thức
- **Họ và tên:** `Tô Anh Tuấn`
- **Email:** `totuan.18dz@gmail.com`
- **Mật khẩu đăng nhập:** `ToAnhTuan18@`
- **User ID:** `1`

### 7.2. Danh sách 11 Danh mục chuẩn
- **3 Danh mục Thu nhập (INCOME):** `Lương`, `Thưởng`, `Thu nhập phụ`.
- **8 Danh mục Chi tiêu (EXPENSE):** `Ăn uống`, `Nhà ở`, `Đi lại`, `Mua sắm`, `Hóa đơn`, `Giải trí`, `Sức khỏe`, `Học tập`.

### 7.3. Thống kê 84 Giao dịch thực tế qua 3 tháng

| Tháng | Số GD Thu | Số GD Chi | Tổng số GD | Tổng thu nhập | Tổng chi tiêu | Số dư tích lũy |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **08/2026** | 2 | 26 | **28** | 15.800.000 ₫ | 7.035.000 ₫ | **+8.765.000 ₫** |
| **09/2026** | 3 | 25 | **28** | 16.400.000 ₫ | 7.715.000 ₫ | **+8.685.000 ₫** |
| **10/2026** | 2 | 26 | **28** | 15.500.000 ₫ | 7.570.000 ₫ | **+7.930.000 ₫** |
| **TỔNG CỘNG**| **7** | **77** | **84** | **47.700.000 ₫** | **22.320.000 ₫** | **+25.380.000 ₫** |

### 7.4. Hạn mức & Trạng thái Ngân sách 3 tháng

| Tháng | Hạn mức ngân sách | Chi tiêu thực tế | Ngân sách còn lại | Tỷ lệ sử dụng | Trạng thái hiển thị trên giao diện |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **08/2026** | 9.500.000 ₫ | 7.035.000 ₫ | 2.465.000 ₫ | **74,05%** | 🟢 **An toàn (Safe - Dưới 80%)** |
| **09/2026** | 9.000.000 ₫ | 7.715.000 ₫ | 1.285.000 ₫ | **85,72%** | 🟡 **Cảnh báo (Warning - Trên 80%)** |
| **10/2026** | 9.000.000 ₫ | 7.570.000 ₫ | 1.430.000 ₫ | **84,11%** | 🟡 **Cảnh báo (Warning - Trên 80%)** |

---

## 8. PHỤ LỤC KỸ THUẬT

### Phụ lục A – Lược đồ Cơ sở Dữ liệu MySQL (Schema)

```sql
-- 1. Bảng người dùng
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng danh mục thu chi
CREATE TABLE categories (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    type ENUM('INCOME', 'EXPENSE') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Bảng giao dịch tài chính
CREATE TABLE transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    type ENUM('INCOME', 'EXPENSE') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    transaction_date DATE NOT NULL,
    note VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_transactions_category FOREIGN KEY (category_id) REFERENCES categories(id),
    INDEX idx_transactions_user_date (user_id, transaction_date)
);

-- 4. Bảng hạn mức ngân sách tháng
CREATE TABLE monthly_budgets (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    amount_limit DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_budget_user_year_month UNIQUE (user_id, year, month)
);
```

### Phụ lục B – Danh mục REST API Hoàn chỉnh (Postman Verified)

| Nhóm chức năng | Phương thức | Endpoint URI | Mô tả chức năng |
| :--- | :---: | :--- | :--- |
| **Xác thực** | `POST` | `/api/auth/register` | Đăng ký tài khoản mới (Email, FullName, Password) |
| | `POST` | `/api/auth/login` | Đăng nhập hệ thống, cấp mã JWT Access Token |
| **Hồ sơ** | `GET` | `/api/users/me` | Lấy thông tin tài khoản đang đăng nhập |
| | `PUT` | `/api/users/profile` | Cập nhật họ tên của người dùng hiện tại |
| **Danh mục** | `GET` | `/api/categories` | Lấy danh sách danh mục của người dùng hiện tại |
| | `POST` | `/api/categories` | Tạo danh mục mới (Tên, Loại INCOME/EXPENSE) |
| | `PUT` | `/api/categories/{id}` | Chỉnh sửa tên danh mục theo ID |
| | `DELETE` | `/api/categories/{id}` | Xóa danh mục (chặn nếu đang có giao dịch liên kết) |
| **Giao dịch** | `GET` | `/api/transactions` | Truy vấn danh sách giao dịch (hỗ trợ phân trang và lọc) |
| | `POST` | `/api/transactions` | Tạo giao dịch mới (Số tiền, Loại, Danh mục, Ngày, Ghi chú) |
| | `GET` | `/api/transactions/{id}` | Lấy thông tin chi tiết một giao dịch |
| | `PUT` | `/api/transactions/{id}` | Cập nhật thông tin giao dịch |
| | `DELETE` | `/api/transactions/{id}` | Xóa bỏ giao dịch |
| **Ngân sách** | `GET` | `/api/budgets` | Lấy toàn bộ danh sách ngân sách các tháng đã đặt |
| | `GET` | `/api/budgets/{year}/{month}` | Lấy chi tiết ngân sách của một tháng cụ thể |
| | `PUT` | `/api/budgets/{year}/{month}` | Thiết lập hoặc cập nhật hạn mức ngân sách tháng |
| **Thống kê** | `GET` | `/api/dashboard/summary` | Thống kê tổng thu, tổng chi, số dư trong tháng |
| | `GET` | `/api/dashboard/expenses-by-category` | Thống kê chi tiêu phân bổ theo từng danh mục |
| | `GET` | `/api/dashboard/trend` | Dữ liệu xu hướng thu chi các tháng liên tiếp |
| | `GET` | `/api/dashboard/recent-transactions` | Danh sách các giao dịch phát sinh gần nhất |

---

## 9. KẾT LUẬN & ĐÁNH GIÁ NGHIỆM THU (FINAL SIGN-OFF)

Hệ thống **SmartExpense (Personal Finance Management)** đã hoàn thành toàn diện 100% các mục tiêu đề ra trong Sprint phát triển:
1. **Kiến trúc & Mã nguồn:** Mã nguồn sạch sẽ, tuân thủ mô hình phân tầng, giao diện trực quan và trải nghiệm người dùng mượt mà.
2. **Kiểm thử chất lượng:** Vượt qua 100% bộ kiểm thử tự động 27 test cases và kiểm thử hồi quy API Postman.
3. **Triển khai Production:** Hệ thống được container hóa chuẩn mực bằng Docker Compose, triển khai thực tế trên hạ tầng WiServices Cloud VPS, kích hoạt HTTPS bảo mật và thiết lập CD tự động qua GitHub Actions.
4. **Dữ liệu chuẩn phục vụ nghiệm thu:** Toàn bộ dữ liệu 3 tháng (08, 09, 10/2026) được thiết lập tự nhiên, sẵn sàng phục vụ báo cáo và nghiệm thu đề tài.

**ĐẠT CHUẨN NGHIỆM THU: 100% PASS**

---
*SmartExpense Development Team – 23/10/2026*
