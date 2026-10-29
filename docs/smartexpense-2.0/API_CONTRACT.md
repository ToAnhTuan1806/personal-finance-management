# SmartExpense 2.0 — API cho FE/BE

Nguồn: [SRS 2.2 ngày 27/10/2026](../SmartExpense_SRS_v2.docx), [Master Plan](../SmartExpense_QuanTriDuAn.xlsx). Đối chiếu mã ngày 30/10/2026. **API hiện có** đã triển khai Backend; **API dự kiến** còn chờ triển khai/review. Calendar D04 đã merge vào dev qua PR #20, vẫn **chờ Frontend xác nhận tích hợp**; trạng thái Backend không thay cho phê duyệt của FE/DB.

## 1. Quy ước chung

- Base path `/api`. JSON request/response, trừ CSV; không thêm envelope vào response thành công cũ. Gửi `Authorization: Bearer <ACCESS_TOKEN>`; chỉ POST register/login công khai.
- Owner luôn từ JWT, không lấy userId client. List/thống kê/export chỉ lấy dữ liệu owner; lookup ID không tồn tại/khác owner trả 404. Ngoại lệ hiện có: POST/PUT transactions trả **400** cho category sai/khác owner.
- ID là integer/Java Long; type là INCOME/EXPENSE. Tiền JSON number, BE BigDecimal; input 0.01–9999999999999.99, tối đa 2 số thập phân. FE lưu ý sai số JavaScript ở số lớn; giữ nguyên tên/kiểu field cũ.
- Ngày YYYY-MM-DD, tháng YYYY-MM; không chuyển DATE qua UTC. API mới đề xuất năm 1900–2100, tháng 1–12, giờ nghiệp vụ UTC+07:00. Validation năm của giao dịch cũ chưa thống nhất với Budget/Dashboard.
- Lỗi: 400 input sai; 401 thiếu/sai/hết hạn JWT; 403 quyền thao tác; 404 owner; 409 xung đột; 500 thông báo trung lập. DELETE thành công 204 không body. User không còn tồn tại có thể trả 401.
- **ApiError đã triển khai từ D02:** `{status,code,message}`, validation theo field có thêm `errors:{field:message}`. Mã theo HTTP: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 RESOURCE_NOT_FOUND, 409 CONFLICT, 500 INTERNAL_ERROR. Lỗi 500 dùng thông báo trung lập, không trả SQL/stack trace/secret; lỗi parse/query có thể không có `errors`.

```json
{"status":400,"code":"VALIDATION_ERROR","message":"Dữ liệu không hợp lệ","errors":{"amount":"Số tiền phải lớn hơn 0"}}
```

## 2. API hiện có — giữ tương thích

Mọi đường dẫn trong bảng đều nằm dưới `/api`; Input là body, query/path ghi riêng.

| Method | Đường dẫn | Request | Thành công | Lỗi nghiệp vụ chính |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | `{fullName,email,password}` | 201 User | 400 validation; 409 email trùng |
| POST | `/auth/login` | `{email,password}` | 200 `{accessToken,tokenType:"Bearer",user:User}` | 400 validation; 401 sai tài khoản/mật khẩu |
| GET | `/users/me` | Không body | 200 User | 401 user không tồn tại |
| GET | `/categories` | Query type? | 200 Category[] | 400 enum sai |
| GET | `/categories/{id}` | Path id | 200 Category | 404 owner |
| POST | `/categories` | CategoryInput | 201 Category | 400 validation |
| PUT | `/categories/{id}` | CategoryInput | 200 Category | 404 owner; 409 đổi type đã có giao dịch |
| DELETE | `/categories/{id}` | Path id | 204 | 404 owner; 409 có giao dịch |
| GET | `/transactions` | Query Filter, page=0,size=10 | 200 Page<Transaction> | 400 filter/phân trang sai |
| GET | `/transactions/{id}` | Path id | 200 Transaction | 404 owner |
| POST | `/transactions` | TransactionInput | 201 Transaction | 400 category/type/input sai |
| PUT | `/transactions/{id}` | TransactionInput đầy đủ | 200 Transaction | 404 transaction owner; 400 category/type/input sai |
| DELETE | `/transactions/{id}` | Path id | 204 | 404 owner |
| GET | `/budgets/{year}/{month}` | Path kỳ | 200 Budget | 400 kỳ sai; 404 chưa đặt |
| PUT | `/budgets/{year}/{month}` | `{amountLimit}` | 200 Budget cho cả tạo/cập nhật | 400 kỳ/tiền sai |
| DELETE | `/budgets/{year}/{month}` | Path kỳ | 204 | 400 kỳ sai; 404 chưa đặt |
| GET | `/dashboard/summary` | Query month bắt buộc | 200 `{year,month,totalIncome,totalExpense,balance}` | 400 tháng sai |
| GET | `/dashboard/expenses-by-category` | Query month bắt buộc | 200 `[{categoryId,categoryName,totalAmount}]` | 400 tháng sai |
| GET | `/calendar/month` | Query year,month bắt buộc | 200 CalendarMonth; Backend D04, chờ FE xác nhận | 400 kỳ sai; 401 JWT thiếu/sai/hết hạn |

### DTO và validation

Đây là ký hiệu mô tả field, không phải JSON mẫu. ID/tiền/tổng/year/month của kỳ ngân sách là số; tên/email/note/ngày và query month dạng YYYY-MM là string; exceeded là boolean.

```text
User = { id, fullName, email }
CategoryInput = { name, type }
Category = { id, name, type }
TransactionInput = { categoryId, type, amount, transactionDate, note? }
Transaction = { id, categoryId, categoryName, type, amount, transactionDate, note }
Budget = { id, year, month, amountLimit, spentAmount, remainingAmount, exceeded }
Page<T> = { content:T[], totalElements, totalPages, number, size, ...Spring Page metadata }
Filter = { month?, startDate?, endDate?, type?, categoryId?, keyword? }
CalendarMonth = { year, month, incomeTotal, expenseTotal,
  days:[{date,incomeTotal,expenseTotal}] }
```

- Register: fullName không blank/≤100, email hợp lệ, password≥8; email trim/lowercase, tên trim. Register trả User, **không cấp JWT**. Login chỉ yêu cầu password không blank. Không có refresh/revoke/logout server; logout xóa phiên client.
- Category: name không blank/≤100, type bắt buộc; chưa có unique tên, icon/color. Không cam kết 409 cho tên trùng.
- Transaction: mọi field bắt buộc trừ note (null hoặc ≤500); category cùng owner/type, tiền theo mục 1. FE mặc định ngày hôm nay.
- Filter: month **hoặc** đủ startDate/endDate, không gửi cả hai; start≤end, inclusive hai đầu. keyword trim, tìm note không phân biệt hoa/thường; `%`/`_` hiện là wildcard LIKE. categoryId khác owner trong filter trả danh sách rỗng.
- page≥0, size 1–100, offset = page × size phải ≤2147483647 (giới hạn JPA); vượt offset trả 400 VALIDATION_ERROR, không tự clamp page. Page hợp lệ vượt phạm vi dữ liệu vẫn trả content rỗng. Sort ngày DESC/id DESC, không nhận sort tùy ý. FE mặc định 10 dòng, giữ field number. Danh mục không có sort cố định.
- Budget/Dashboard: năm 1900–2100, tháng 1–12; amountLimit theo giới hạn tiền chung. spentAmount chỉ EXPENSE đúng kỳ; remainingAmount có thể âm, exceeded chỉ khi spent>limit. UI: <80% safe, 80–<100% warning, ≥100% đỏ. Unique ngân sách user/năm/tháng đã có; race upsert cần kiểm thử.
- Dashboard tháng rỗng trả tổng 0, danh mục `[]`, balance=totalIncome-totalExpense; danh mục sort totalAmount DESC. Giữ tên totalAmount/spentAmount/remainingAmount.

### Calendar và chi tiết ngày (FR-04/FR-05)

- `GET /api/calendar/month?year=2026&month=10`, không body; gửi JWT như mục 1. year/month là số nguyên bắt buộc, năm 1900–2100, tháng 1–12. Thiếu, trống, sai kiểu hoặc ngoài giới hạn trả 400 ApiError D02; JWT thiếu/sai/hết hạn trả 401.
- Response `year/month` là số nguyên; tiền là JSON number/BE BigDecimal; `date` là string YYYY-MM-DD, không chuyển DATE qua UTC. `days` đủ 28/29/30/31 ngày, sort ASC, ngày trống trả tiền 0. `incomeTotal/expenseTotal` ở cấp tháng bằng tổng các ngày; tháng rỗng vẫn đủ ngày và tổng 0. Calendar trả trọn tháng, không phân trang; giữ nguyên tên field của Dashboard hiện có.
- Owner chỉ lấy từ JWT. `userId` client không thay owner; không trả dữ liệu user khác. Backend D04 đã có test SQL, năm nhuận, ranh giới tháng/năm, timezone, tiền và ownership; **FE chưa được coi là đã xác nhận**.
- Xem ngày: `GET /api/transactions?startDate=2026-10-31&endDate=2026-10-31&page=0&size=10`. Hai đầu inclusive; không gửi thêm `month`. Response `Page<Transaction>` giữ `number`, `size`, `totalElements`, `totalPages`; sort ngày DESC rồi id DESC. Đọc hết các trang mới có danh sách đầy đủ; dùng Calendar để lấy tổng, không cộng riêng trang đầu.
- Thêm từ lịch dùng POST `/api/transactions` với `transactionDate` là ngày đã chọn. Sau tạo/sửa/xóa thành công, FE refetch lịch tháng và trang chi tiết ngày hiện hành; nếu xóa hết trang cuối thì tải lại trang còn hợp lệ. Đây là hướng dẫn tích hợp, chưa xác nhận FE đã thực hiện.

Quick Add (FR-03) dùng POST `/transactions`, không thêm `/quick-add`. Khóa submit đồng bộ; chỉ báo thành công sau response rồi refetch giao dịch/Dashboard/ngân sách/lịch. Timeout không tự POST lại vì server có thể đã lưu: giữ form, kiểm tra lại danh sách. Bỏ fallback thành công giả và đồng bộ xóa token/user/context khi 401 là việc còn cần triển khai (FR-01/11).

## 3. API dự kiến — cần review trước triển khai

API mới yêu cầu JWT, ID dương, input hợp lệ; lỗi chung theo mục 1. Category/template khác owner trả 404; category thuộc owner nhưng sai type trả 400.

**Danh mục icon/màu (FR-02):** mở rộng CategoryInput/Category thêm icon/color, giữ endpoint cũ. Đề xuất icon≤40 trong allowlist `tag, utensils, shopping-bag, car, home, heart, graduation-cap, gamepad-2, briefcase, gift, wallet, circle`; color khớp #RRGGBB, trả uppercase. Default tag/#64748B. POST thiếu/null dùng default; PUT thiếu giữ cũ, null reset default, blank/sai trả 400. Category có transaction/budget/template (kể cả inactive) không xóa/đổi type →409 CATEGORY_IN_USE; không cascade tài chính. Rule mới chưa duyệt.

| Method | Đường dẫn | Request | Thành công / lỗi nghiệp vụ |
| --- | --- | --- | --- |
| GET | `/category-budgets` | Query year,month bắt buộc | 200 CategoryBudget[], sort categoryId ASC |
| GET | `/category-budgets/{year}/{month}/{categoryId}` | Path kỳ/category | 200 CategoryBudget; 404 chưa đặt |
| PUT | `/category-budgets/{year}/{month}/{categoryId}` | `{amountLimit}` | 200 upsert; 409 nếu còn xung đột đồng thời |
| DELETE | `/category-budgets/{year}/{month}/{categoryId}` | Path kỳ/category | 204; 404 chưa đặt |
| GET | `/recurring-templates` | Query active?,page=0,size=10 | 200 Page<Template>, sort id DESC |
| GET | `/recurring-templates/{id}` | Path id | 200 Template |
| POST | `/recurring-templates` | TemplateInput | 201 Template |
| PUT | `/recurring-templates/{id}` | TemplateInput đầy đủ | 200 Template; tắt bằng active=false |
| DELETE | `/recurring-templates/{id}` | Path id | 204; 409 TEMPLATE_IN_USE nếu đã áp dụng |
| GET | `/recurring-templates/{id}/preview` | Query year,month bắt buộc | 200 Preview, không ghi dữ liệu |
| POST | `/recurring-templates/{id}/apply` | `{year,month}` | 201 Application; 409 TEMPLATE_INACTIVE/ALREADY_APPLIED |
| GET | `/reports/monthly` | Query fromMonth,toMonth bắt buộc | 200 MonthlyReport; 400 kỳ sai/quá giới hạn |
| GET | `/reports/categories` | Query fromMonth,toMonth bắt buộc | 200 CategoryReport; 400 kỳ sai/quá giới hạn |
| GET | `/transactions/export` | Query Filter, không page/size/sort | 200 CSV; 400 filter sai; 422 EXPORT_LIMIT_EXCEEDED |

### DTO và hành vi dự kiến

Ký hiệu `...Input` giữ các field của Input tương ứng. ID/tiền/tỷ lệ/year/month của kỳ là số; fromMonth/toMonth và month trong báo cáo là string YYYY-MM. active/canApply/alreadyApplied là boolean; reasonCode/status là string. Input bắt buộc, trừ note (null hoặc ≤500), metadata Category và query có dấu ?. Response trả note=null khi trống. Phân trang mẫu dùng cùng giới hạn page/size hiện có.

```text
CategoryBudget = { id, categoryId, categoryName, year, month, amountLimit,
  spentAmount, remainingAmount, usagePercentage, exceeded, status }
TemplateInput = { categoryId, type, amount, dayOfMonth, note?, active }
Template = { id, categoryName, ...TemplateInput }
Preview = { templateId, year, month, transactionDate, categoryId, categoryName,
  type, amount, note, alreadyApplied, canApply, reasonCode }
Application = { id, templateId, year, month, transactionId, transaction:Transaction }
MonthlyReport = { fromMonth, toMonth, totalIncome, totalExpense, balance,
  months:[{month,income,expense,balance}] }
CategoryReport = { fromMonth, toMonth, totalExpense,
  categories:[{categoryId,categoryName,totalAmount,categoryShare}] }
```

- **Ngân sách danh mục (FR-07):** chỉ EXPENSE, unique user/category/year/month. Độc lập ngân sách tổng, không cấm tổng limit danh mục vượt tổng tháng. usagePercentage không cap, round HALF_UP 2 số; status SAFE/WARNING/OVER_BUDGET dựa trên tỷ lệ chưa làm tròn với ngưỡng 80/100; exceeded vẫn chỉ khi spent>limit.
- **Định kỳ (FR-08):** dayOfMonth 1–31, category cùng owner/type, active bắt buộc; ngày vượt tháng lấy ngày cuối. Preview inactive/đã áp dụng vẫn 200, canApply=false, reasonCode ưu tiên ALREADY_APPLIED rồi TEMPLATE_INACTIVE; hợp lệ trả null. Apply kiểm tra lại, lưu transaction+marker nguyên tử. Cùng mẫu/năm/tháng: một request 201, lần sau/đồng thời 409. Không scheduler; sửa mẫu không sửa giao dịch cũ. Đề xuất xóa giao dịch giữ marker (transaction_id=null), không apply lại; mẫu đã áp dụng chỉ được tắt.
- **Báo cáo (FR-09):** from/to inclusive, đề xuất tối đa 12 tháng; months ASC, tháng trống 0; tổng/balance khớp Dashboard/SQL. Category chỉ EXPENSE, sort totalAmount DESC/categoryId ASC, categoryShare là % round HALF_UP 2 số (tổng làm tròn có thể khác 100); rỗng trả categories=[]. Drilldown dùng filter giao dịch.
- **CSV (FR-10):** xuất toàn bộ filter/owner, sort ngày DESC/id DESC; đề xuất tối đa 10.000 dòng, vượt trả 422 trước khi gửi file, không cắt cụt; count/export nhất quán. UTF-8 BOM, comma/CRLF, quote cell và nhân đôi nháy kép. Header `ID,Ngày giao dịch,Loại,Danh mục,Số tiền (VND),Ghi chú`; tiền dot/2 số, không phân cách nghìn. Rỗng chỉ BOM+header. Với category/note, nếu ký tự đầu sau khoảng trắng/tab/CR/LF là `=,+,-,@`, thêm nháy đơn trước cell rồi escape để chặn formula injection. Không xuất userId/email/password/token.
- CSV headers: `Content-Type: text/csv; charset=UTF-8`, `Content-Disposition: attachment; filename="smart-expense-YYYYMMDD.csv"`, `Cache-Control: no-store`; tên theo ngày UTC+07:00. FE tải blob, phân biệt JSON lỗi; page/size/sort gửi lên trả 400. Report chuyển khoảng tháng thành range ngày khi export. Cross-origin đọc filename cần review expose header CORS; chưa đổi cấu hình.

## 4. Những điểm cần chốt

- **FE — Q01/Q04/Q13:** endpoint/DTO mới, lịch, submit và UX timeout. Idempotency-Key nếu cần phải có thiết kế cả nhóm duyệt, chưa có storage/TTL/replay.
- **Cả nhóm — Q02/Q03/Q05–Q09/Q11:** mã lỗi nghiệp vụ 2.0, metadata/default, rule ngân sách/xóa/định kỳ, report 12 tháng, CSV 10.000; thống nhất email≤255, miền năm/ngày, keyword≤500 tìm literal và tiền JSON number. Các giới hạn mới vẫn là đề xuất.
- **DB/QA — Q10/Q14:** version migration/runner/FK/ddl-auto, backup/rollback, CI gate/pin SHA; xem [README](../../README.md#migration-backup-và-rollback).
- **Q12:** nguồn kế hoạch đã xác nhận: 12 FR, 45 task, 27/10–16/11/2026, ba owner/nhánh theo README; không phải duyệt API/schema hoặc ký thay thành viên.

FR-01 tài khoản, FR-02 danh mục, FR-03 Quick Add, FR-04 lịch, FR-05 giao dịch, FR-06 ngân sách tổng, FR-07 ngân sách danh mục, FR-08 định kỳ, FR-09 báo cáo, FR-10 CSV ở trên. **FR-11 UI/UX và FR-12 QA/DevOps** không thêm API theme/admin/deploy; vẫn cần responsive/light-dark/keyboard/loading-error-empty và test/review trước nghiệm thu. Không tự coi trạng thái Trello là bằng chứng duyệt; không thêm refresh token hoặc scheduler vào phạm vi.
