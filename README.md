<div align="center">
  <img src="frontend/public/favicon.svg" width="72" height="72" alt="Logo SmartExpense" />
  <h1>SmartExpense</h1>
  <p>Ghi thu chi, kiểm soát ngân sách và dành tiền cho những mục tiêu của bạn.</p>
  <p>
    <a href="https://smartexpense-team3.duckdns.org">Trải nghiệm ứng dụng</a>
    · <a href="docs/USER_GUIDE.md">Hướng dẫn sử dụng</a>
    · <a href="docs/README.md">Tài liệu dự án</a>
    · <a href="docs/smartexpense-2.0/API_CONTRACT.md">Tài liệu API</a>
  </p>
</div>

---

SmartExpense là ứng dụng web quản lý tài chính cá nhân. Người dùng có thể theo dõi tiền thu vào, tiền chi ra, đặt hạn mức và dành riêng tiền cho từng thử thách tiết kiệm. Dữ liệu được lưu theo tài khoản để tiếp tục sử dụng trên các thiết bị.

**Cập nhật tài liệu ngày 22/11/2026.**

## Chức năng

| Nhóm chức năng | Nội dung |
| --- | --- |
| Đăng nhập và tài khoản | Đăng ký, đăng nhập, đăng xuất, khôi phục mật khẩu qua email và xác thực JWT. |
| Giao dịch | Ghi nhanh thu/chi, sửa/xóa, tìm kiếm ghi chú, lọc theo kỳ, loại và danh mục. |
| Lịch thu chi | Xem tổng tiền từng ngày, mở danh sách chi tiết và ghi giao dịch theo ngày đã chọn. |
| Danh mục | Tạo và chỉnh sửa danh mục thu/chi, chọn icon và màu hiển thị. |
| Ngân sách | Đặt hạn mức tháng hoặc theo danh mục; theo dõi số đã chi, còn lại và cảnh báo. |
| Báo cáo | Biểu đồ thu chi, cơ cấu chi theo danh mục, so sánh khoảng tối đa 6 tháng. |
| Xuất CSV | Tải giao dịch theo bộ lọc để đối chiếu trên bảng tính. |
| Giao dịch định kỳ | Mẫu đang bật tự ghi vào sổ khi đến ngày; chống tạo trùng trong cùng kỳ. |
| Trợ lý tài chính | Tra cứu dữ liệu, phân tích chi tiêu, dự báo, mô phỏng ngân sách và soạn khoản chi. |
| Thử thách tiết kiệm | Chọn mẫu hoặc tự đặt mục tiêu, thời hạn, cấp độ, ảnh và theo dõi tiến độ. |
| Quỹ tiết kiệm | Nạp/rút theo từng thử thách, xem lịch sử và số dư khả dụng. |
| Giao diện | Thiết kế tông xanh, hỗ trợ desktop/mobile và chế độ sáng/tối/hệ thống. |

## Những luồng nổi bật

### Tự động ghi giao dịch định kỳ

Tạo mẫu tiền nhà, tiền điện hoặc thu nhập hằng tháng và bật lịch. Đến ngày, hệ thống tự ghi giao dịch theo giờ Việt Nam.

- Chọn ngày hôm nay hoặc chưa đến thì bắt đầu từ tháng này.
- Chọn ngày đã qua thì bắt đầu tháng sau.
- Ngày 29–31 điều chỉnh về ngày cuối của tháng ngắn.
- Mỗi mẫu/kỳ chỉ được ghi một lần.

### Dành riêng tiền cho từng mục tiêu

Tạo thử thách như “Mua laptop”, chọn ảnh mục tiêu và ghi nhận số tiền muốn dành riêng. Nạp quỹ tăng tiến độ và giảm số dư khả dụng. Rút khỏi quỹ đưa tiền về số dư khả dụng và giảm tiến độ tương ứng.

| Ví dụ với tổng tiền 5.000.000 ₫ | Tiền trong quỹ | Số dư khả dụng |
| --- | ---: | ---: |
| Trước khi nạp | 0 ₫ | 5.000.000 ₫ |
| Nạp 500.000 ₫ | 500.000 ₫ | 4.500.000 ₫ |
| Rút lại 200.000 ₫ | 300.000 ₫ | 4.700.000 ₫ |

Quỹ có lịch sử nạp/rút riêng. Tổng thu chi tiếp tục phản ánh các khoản thu và chi đã ghi. Các khoản tiết kiệm trước V010 vẫn tính vào tiến độ, còn tiền trong quỹ tính từ các lần nạp mới.

### Hỏi trợ lý bằng ngôn ngữ tự nhiên

Có thể thử “Tháng này tôi chi bao nhiêu?”, “So với tháng trước thì sao?” hoặc “Nếu mua thêm món 500k thì còn ngân sách không?”.

Nhập “Ăn trưa 80k” để nhận thẻ đề xuất, kiểm tra thông tin rồi xác nhận lưu. Tra cứu tài chính dùng dữ liệu thuộc tài khoản đang đăng nhập. Các câu hỏi mở có thể dùng Gemini theo cài đặt trợ lý và cấu hình Backend.

## Cách hiểu số dư

| Chỉ số | Cách tính |
| --- | --- |
| Số dư tháng | Tổng thu tháng − tổng chi tháng đang xem |
| Tổng tiền đang có | Tổng thu − tổng chi đến hôm nay, qua mọi tháng |
| Tiền đang giữ trong quỹ | Tổng tiền nạp − tổng tiền rút của các quỹ |
| Số dư khả dụng | Tổng tiền đang có − tiền đang giữ trong các quỹ |

Xem thêm [hướng dẫn sử dụng](docs/USER_GUIDE.md).

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React 19, Vite 8, JavaScript, Tailwind CSS v4 |
| Giao diện và biểu đồ | Lucide React, Recharts, các component UI dùng chung |
| Gọi API và điều hướng | Axios, React Router |
| Backend | Java 21, Spring Boot 4.1.1 |
| Xác thực | Spring Security, JWT, BCrypt |
| Truy cập dữ liệu | Spring Data JPA, Hibernate, JdbcTemplate |
| Database | MySQL 8 |
| Triển khai | Docker Compose, Nginx, VPS |
| Tự động hóa | GitHub Actions CI/CD |
| Kiểm thử | JUnit, Spring MockMvc, MySQL Testcontainers, Node test runner |

Phiên bản cụ thể được quản lý trong [build.gradle](backend/build.gradle), [package.json](frontend/package.json) và lockfile.

## Kiến trúc

~~~mermaid
flowchart LR
    U[Trình duyệt React] --> N[Nginx]
    N --> B[Spring Boot REST API]
    B --> D[(MySQL)]
    B --> E[SMTP]
    B --> G[Gemini]
~~~

Backend tổ chức theo Controller → Service → Repository. JWT xác định người dùng sở hữu dữ liệu. Nginx phục vụ Frontend và chuyển tiếp đường dẫn /api đến Backend. SMTP phục vụ khôi phục mật khẩu, Gemini phục vụ các câu hỏi đủ điều kiện theo thiết lập trợ lý.

## Cấu trúc thư mục

~~~text
personal-finance-management/
├── backend/                 REST API, nghiệp vụ và kiểm thử Java
├── frontend/                Giao diện React và kiểm thử JavaScript
├── database/
│   └── migrations/          SQL cập nhật schema
├── scripts/                 Khởi chạy, sao lưu, khôi phục và công cụ QA
├── docs/
│   ├── SmartExpense_SRS_v2.docx
│   ├── SmartExpense_QuanTriDuAn.xlsx
│   ├── USER_GUIDE.md
│   ├── smartexpense-2.0/     API và bàn giao hiện hành
│   ├── postman/              Collection kiểm tra API
│   ├── qa/                   Hồ sơ kiểm thử và evidence
│   └── archive/              Kế hoạch lịch sử
├── compose.yaml
└── README.md
~~~

## Khởi chạy local

### Chuẩn bị

- JDK 21.
- Node.js tương thích phiên bản Vite trong package.json và npm.
- MySQL 8.
- Docker Engine hoặc Docker Desktop khi dùng Compose hoặc chạy MySQL Testcontainers.

Clone repository rồi mở thư mục dự án.

~~~bash
git clone https://github.com/ToAnhTuan1806/personal-finance-management.git
cd personal-finance-management
~~~

### Cấu hình môi trường

Trên PowerShell, tạo file cấu hình local.

~~~powershell
Copy-Item .env.example .env
~~~

Điền thông tin phù hợp với MySQL và môi trường đang chạy.

| Nhóm | Biến chính |
| --- | --- |
| Database | DB_NAME, DB_URL, DB_USERNAME, DB_PASSWORD, DB_ROOT_PASSWORD |
| JWT | JWT_SECRET, JWT_EXPIRATION |
| Trợ lý Gemini | GEMINI_API_KEY, GEMINI_MODEL |
| Email | SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM |
| Đường dẫn ứng dụng | APP_FRONTEND_URL, FRONTEND_PORT |

JWT_SECRET là Base64 của ít nhất 32 byte ngẫu nhiên. Gemini cần model được tài khoản cấu hình có quyền truy cập. SMTP cần cấu hình gửi email hợp lệ. File .env chứa thông tin riêng của từng môi trường.

### Chạy Backend

Chuẩn bị database và đối chiếu [migration SQL](database/migrations/README.md). Từ thư mục gốc dự án chạy:

~~~powershell
.\scripts\start-backend.ps1 -CheckOnly
.\scripts\start-backend.ps1
~~~

CheckOnly kiểm tra cấu hình trước khi khởi động. Các lỗi kết nối cần đối chiếu host, cổng, database và quyền của MySQL đang dùng.

### Chạy Frontend

Mở terminal khác từ thư mục gốc.

~~~powershell
Set-Location frontend
npm ci
npm run dev
~~~

Đặt VITE_API_URL theo Backend local. Mở địa chỉ Vite in trong terminal. Xem [Frontend README](frontend/README.md) để biết các route và cách kiểm tra.

### Chạy bằng Docker Compose

~~~bash
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
docker compose ps
~~~

Frontend mặc định tại http://localhost:8088. MySQL và Backend giao tiếp trong mạng Docker nội bộ. Database có volume riêng. Các bảng JDBC của thử thách, ảnh và quỹ cần migration tương ứng.

## Kiểm thử

Tại thư mục backend, chạy với Docker local sẵn sàng.

~~~powershell
.\gradlew.bat test verifyD03IntegrationTests bootJar --max-workers=1 --console=plain
~~~

Tại thư mục frontend, chạy:

~~~bash
npm test
npm run lint
npm run build
~~~

Lượt kiểm tra liên quan quỹ đã đạt 270/270 test Backend và 725/725 test Frontend. Chín ca MySQL quỹ là tập con Backend. Các lượt lịch sử, kiểm tra trình duyệt và phạm vi xác nhận được ghi riêng trong [hồ sơ QA](docs/qa/README.md).

Build hiện có cảnh báo gói JavaScript lớn hơn 500 kB.

## Triển khai và migration

Mỗi thành viên tạo PR từ nhánh tính năng vào dev. Sau review và kiểm tra CI, bản tích hợp được phát hành theo quy trình của nhóm. Workflow CD hiện tự chạy khi push dev/main; người vận hành theo dõi cả CI và CD.

CD cập nhật mã nguồn, image và container. SQL được áp dụng riêng sau khi sao lưu và xác nhận đúng database.

| Migration | Nội dung liên quan |
| --- | --- |
| V007 | Lịch chạy tự động của giao dịch định kỳ |
| V008 | Thử thách, ghi nhận tiết kiệm và phần thưởng |
| V009 | Ảnh mục tiêu |
| V010 | Lịch sử nạp/rút quỹ |

Xem lệnh sao lưu, áp dụng SQL và kiểm tra tại [Migration README](database/migrations/README.md). Giữ bản sao lưu cùng image rollback đã kiểm chứng trước khi nâng cấp.

Ngày 22/11/2026, người vận hành đã cung cấp terminal xác nhận sao lưu, hai bảng V009/V010 tồn tại và xác nhận thử quỹ thành công. Phiên bản và nguồn bằng chứng nằm trong [bàn giao hiện hành](docs/smartexpense-2.0/RELEASE_CURRENT.md).

## Nhóm thực hiện

| Thành viên | Phụ trách | Nhánh |
| --- | --- | --- |
| Tô Anh Tuấn | Backend và tài liệu | feature/tuan |
| Trần Thị Thu Trang | Frontend | feature/trang |
| Phạm Hương Quỳnh | Database, QA và DevOps | feature/quynh |

Công việc được theo dõi trên [Trello SmartExpense](https://trello.com/b/RAHIOc4b/smartexpense-personal-finance-management).

## Tài liệu

| Tài liệu | Nội dung |
| --- | --- |
| [Mục lục](docs/README.md) | Điểm bắt đầu tra cứu |
| [Hướng dẫn sử dụng](docs/USER_GUIDE.md) | Các thao tác cho người dùng |
| [SRS Word](docs/SmartExpense_SRS_v2.docx) | Đặc tả nghiệp vụ và phạm vi hiện hành |
| [Quản trị dự án Excel](docs/SmartExpense_QuanTriDuAn.xlsx) | Hiện trạng và kế hoạch gốc |
| [API Contract](docs/smartexpense-2.0/API_CONTRACT.md) | Endpoint, DTO và validation |
| [Bàn giao hiện hành](docs/smartexpense-2.0/RELEASE_CURRENT.md) | Phiên bản, dữ liệu và vận hành |
| [Postman](docs/postman/README_POSTMAN.md) | Kiểm tra API thủ công |
| [QA](docs/qa/README.md) | Kết quả và bằng chứng từng lượt |
