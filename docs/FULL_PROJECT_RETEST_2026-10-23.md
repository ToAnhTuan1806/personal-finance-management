# Báo cáo kiểm thử lại dự án — 23/10/2026

## Phạm vi và phiên bản

- Nhánh local: `dev`, commit gốc `576612e841b18153a344b82045e77e06a585dc2f`.
- Working tree có bản sửa biểu đồ dòng tiền, unit test và bước chạy test frontend trong CI; các thay đổi này chưa commit/push khi kiểm thử.
- Production đang chạy bản đã triển khai từ commit `576612e`; kiểm thử production xác nhận API hiện tại, không xác nhận bản sửa frontend đã được triển khai.
- Môi trường local riêng `smartexpense-qa-20261023`: MySQL 8.0, backend từ JAR hiện tại, frontend từ bản build `VITE_API_URL=/api`, Nginx dùng cấu hình dự án. HTTP chỉ mở tại loopback cổng 5173; MySQL tại loopback cổng 13307.
- Không dùng database hoặc volume production cho môi trường local.

## Kết quả

| Nhóm kiểm tra | Kết quả | Bằng chứng chính |
| --- | --- | --- |
| Unit test frontend | 7/7 đạt | Phân trang hơn 100 giao dịch, tổng tiền, lỗi tải giữa chừng, tháng trống, năm nhuận và trục tiền |
| ESLint | Đạt | `npm run lint` |
| Build frontend production | Đạt | `npm run build` với `VITE_API_URL=/api` |
| Backend JAR | Đạt | Gradle `bootJar --offline` |
| Backend test với MySQL riêng | 1/1 đạt | Chạy lại `contextLoads` bằng `test --offline --rerun-tasks`, database `personal_finance_test` |
| Smoke test dự án | 27/27 đạt | Đăng ký/đăng nhập/JWT, CRUD, lọc ngày, Dashboard, ngân sách, cô lập đọc dữ liệu và cleanup |
| Tích hợp bổ sung local | 41/41 đạt | 244 HTTP requests; tạo 205 giao dịch thật, kiểm tra phân trang, thu nhập, ngân sách và chặn thao tác chéo tài khoản |
| CRUD production | 55/55 đạt | 45 HTTP requests; chỉ thay đổi dữ liệu thử có nhãn riêng rồi xóa sạch |
| Cấu hình triển khai | Đạt | `docker compose config --quiet`; Nginx `nginx -t`; 3 container QA healthy trước cleanup |
| Khởi động lại backend | Đạt | Backend trở lại healthy; số bản ghi 4 bảng giữ nguyên; API yêu cầu token trả 401 |
| Backup/restore hợp lệ | Đạt | Khôi phục sang database local thứ hai; số lượng và checksum 4 bảng khớp |
| Nhánh lỗi script backup | **Không đạt** | Database không tồn tại nhưng script báo tạo backup thành công và trả mã 0 |
| Nhánh lỗi script restore | **Không đạt** | Container không tồn tại nhưng script báo restore thành công và trả mã 0 |
| Liên kết và Git | Đạt | 13 liên kết nội bộ trong 5 tài liệu Markdown được kiểm tra trước khi thêm báo cáo này; `git diff --check` đạt; env/build/backup được ignore |

Backend hiện chỉ có một test `contextLoads`; không xem đây là độ bao phủ unit test đầy đủ cho nghiệp vụ. Các luồng nghiệp vụ đã được kiểm chứng thêm bằng các bộ API ở bảng trên.

## Biểu đồ dòng tiền sau sửa

Đã tạo 205 giao dịch qua API của môi trường local, gồm một khoản thu đầu tháng và 204 khoản chi. Kiểm chứng:

- API gần đây vẫn trả 8 giao dịch chi gần nhất.
- Luồng mới đọc đủ các trang 0, 1, 2 theo giới hạn 100 bản ghi/trang, nhận đủ 205 ID khác nhau.
- Biểu đồ có 31 ngày trong tháng 10, giữ được khoản thu ngày 01/10 nằm ngoài 8 và 100 giao dịch gần nhất.
- Tổng thu 15.500.000, tổng chi 204.102 khớp Dashboard API.
- Sửa thu nhập thành 17.000.000,25 và chuyển sang 15/10: tổng tiền khớp, không cộng trùng khoản thu cũ.
- Trục tiền trả `100k`, `200k`, `1tr`, `1,5tr` cho các mức tương ứng.
- Tháng không có giao dịch trả danh sách trống; lỗi tải trang sau không trả kết quả tháng thiếu dữ liệu.

Đối chiếu với dữ liệu production đã thực hiện sau khi sửa biểu đồ:

| Tháng | Giao dịch | Tổng thu | Tổng chi | Kết quả tổng hợp theo ngày |
| --- | --- | --- | --- | --- |
| 08/2026 | 28 | 15.800.000 | 7.035.000 | Khớp API tổng quan |
| 09/2026 | 28 | 16.400.000 | 7.715.000 | Khớp API tổng quan |
| 10/2026 | 28 | 15.500.000 | 7.570.000 | Khớp API tổng quan |

## Hai lỗi xác nhận ở công cụ backup/restore

### Backup báo thành công khi database không tồn tại

[backup-db.ps1](../scripts/backup-db.ps1) chỉ kiểm tra file dump tồn tại và có kích thước lớn hơn 0, chưa kiểm tra mã thoát của `mysqldump`.

Trong môi trường QA, gọi backup với database không tồn tại `qa_missing_database_20261023` vẫn tạo được file chứa phần header của dump. Script in `Backup created successfully` và trả exit code 0.

Cần kiểm tra `$LASTEXITCODE` ngay sau lệnh native; khi thất bại phải trả mã lỗi và không giữ một file dump lỗi như một bản backup hợp lệ.

### Restore báo thành công khi container không tồn tại

[restore-db.ps1](../scripts/restore-db.ps1) không kiểm tra `$LASTEXITCODE` sau `cmd /c`, nên không vào `catch` chỉ vì Docker/MySQL trả mã lỗi.

Gọi script với container thử nghiệm không tồn tại `smartexpense-qa-20261023-missing` khiến Docker thất bại nhưng script vẫn in `Database restored successfully!` và trả exit code 0.

Cần kiểm tra mã thoát trước thông báo thành công. Hai lỗi này được ghi nhận; mã nguồn các script chưa được sửa trong lượt kiểm thử này.

## Đối chiếu khôi phục và restart

- Trước và sau restart backend, số lượng bản ghi `users:categories:transactions:monthly_budgets` là `4:2:204:1`.
- Backup database local `personal_finance_qa`, đổi tên database đích trong bản sao dump và restore sang `personal_finance_restore_qa`.
- Số lượng 4 bảng sau restore vẫn là `4:2:204:1`.
- `CHECKSUM TABLE ... EXTENDED` của 4 bảng nguồn và đích khớp: `2060001083:3114387570:570758836:813173959`.

## Production và CI/CD

- Trang chủ và `/transactions` production trả HTTP 200; API `/api/users/me` thiếu token trả 401.
- Lượt CRUD retest tạo danh mục ID 17, giao dịch ID 129 và ngân sách ID 5 ở tháng trống 11/2097; đã xóa cả ba và xác nhận GET trả 404.
- Danh sách 11 danh mục gốc và dữ liệu tháng 10 giữ nguyên: 28 giao dịch, thu 15.500.000, chi 7.570.000, số dư 7.930.000.
- [CI của commit 576612e](https://github.com/ToAnhTuan1806/personal-finance-management/actions/runs/39949728839) và [CD của cùng commit](https://github.com/ToAnhTuan1806/personal-finance-management/actions/runs/39949728855) đều completed/success. Bản sửa frontend local chưa có CI/CD run riêng.

## Dọn dữ liệu và giới hạn kiểm thử

- Đã xóa toàn bộ container, network và volume thuộc project QA riêng; xác nhận không còn container/volume mang nhãn project này.
- Nhật ký và script kiểm thử tạm nằm tại `backups/qa-20261023/`, được Git ignore; không đưa JWT hoặc mật khẩu vào báo cáo.
- Build còn cảnh báo bundle JavaScript trên 500 kB, chưa phải lỗi build.
- Chưa kiểm thử E2E trình duyệt hoặc xác nhận bằng screenshot: phiên công cụ hiện không có trình duyệt điều khiển được.
- Chưa kiểm thử tải/soak test dài hạn; kết quả không bảo đảm ổn định dưới mọi tải hoặc sự cố hạ tầng.
- Cơ chế dữ liệu giả khi mất mạng và đồng bộ phiên hết hạn đã được ghi trên Trello, chưa thuộc bản sửa biểu đồ và chưa được xử lý trong lượt này.

Các luồng chức năng được kiểm thử đều đạt. Hai nhánh xử lý lỗi backup/restore cần sửa trước khi dựa vào các script đó để xác nhận sao lưu hoặc phục hồi thành công.
