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
| POST | `/categories` | CategoryInput | 201 Category | 400 validation; 409 tên trùng cùng owner/type |
| PUT | `/categories/{id}` | CategoryInput | 200 Category | 404 owner; 409 tên trùng cùng owner/type hoặc đổi type đã có giao dịch |
| DELETE | `/categories/{id}` | Path id | 204 | 404 owner; 409 có giao dịch |
| GET | `/transactions` | Query Filter, page=0,size=10 | 200 Page<Transaction> | 400 filter/phân trang sai |
| GET | `/transactions/{id}` | Path id | 200 Transaction | 404 owner |
| POST | `/transactions` | TransactionInput | 201 Transaction | 400 category/type/input sai |
| PUT | `/transactions/{id}` | TransactionInput đầy đủ | 200 Transaction | 404 transaction owner; 400 category/type/input sai |
| DELETE | `/transactions/{id}` | Path id | 204 | 404 owner |
| GET | `/budgets/{year}/{month}` | Path kỳ | 200 Budget | 400 kỳ sai; 404 chưa đặt |
| PUT | `/budgets/{year}/{month}` | `{amountLimit}` | 200 Budget cho cả tạo/cập nhật | 400 kỳ/tiền sai |
| DELETE | `/budgets/{year}/{month}` | Path kỳ | 204 | 400 kỳ sai; 404 chưa đặt |
| POST | `/category-budgets` | CategoryBudgetInput | 200 CategoryBudget, tạo hoặc cập nhật theo kỳ | 400 validation/type; 404 category owner; 409 duplicate key |
| GET | `/category-budgets` | Query year,month bắt buộc | 200 CategoryBudget[], categoryId ASC | 400 kỳ sai |
| GET | `/category-budgets/{id}` | Path id | 200 CategoryBudget | 400 ID sai; 404 budget owner |
| PUT | `/category-budgets/{id}` | `{amountLimit}` | 200 CategoryBudget, chỉ sửa hạn mức | 400 tiền/type/ID sai; 404 budget/category owner |
| DELETE | `/category-budgets/{id}` | Path id | 204 | 400 ID sai; 404 budget owner |
| GET | `/dashboard/summary` | Query month bắt buộc | 200 `{year,month,totalIncome,totalExpense,balance}` | 400 tháng sai |
| GET | `/dashboard/expenses-by-category` | Query month bắt buộc | 200 `[{categoryId,categoryName,totalAmount}]` | 400 tháng sai |
| GET | `/calendar/month` | Query year,month bắt buộc | 200 CalendarMonth; Backend D04, chờ FE xác nhận | 400 kỳ sai; 401 JWT thiếu/sai/hết hạn |

### DTO và validation

Đây là ký hiệu mô tả field, không phải JSON mẫu. ID/tiền/tổng/year/month của kỳ ngân sách là số; tên/email/note/ngày và query month dạng YYYY-MM là string; exceeded là boolean.

```text
User = { id, fullName, email }
CategoryInput = { name, type, icon?, color? }
Category = { id, name, type, icon, color }
TransactionInput = { categoryId, type, amount, transactionDate, note? }
Transaction = { id, categoryId, categoryName, type, amount, transactionDate, note }
Budget = { id, year, month, amountLimit, spentAmount, remainingAmount, exceeded }
Page<T> = { content:T[], totalElements, totalPages, number, size, ...Spring Page metadata }
Filter = { month?, startDate?, endDate?, type?, categoryId?, keyword? }
CalendarMonth = { year, month, incomeTotal, expenseTotal,
  days:[{date,incomeTotal,expenseTotal}] }
```

- Register: fullName không blank/≤100, email hợp lệ, password≥8; email trim/lowercase, tên trim. Register trả User, **không cấp JWT**. Login chỉ yêu cầu password không blank. Không có refresh/revoke/logout server; logout xóa phiên client.
- Category: name không blank/≤100, type bắt buộc; icon/color theo mục D06 bên dưới. Từ bổ sung D06-BE ngày 03/11/2026, precheck tên trùng cùng owner/type trả 409 theo quy tắc bên dưới; chưa có UNIQUE constraint bảo đảm ghi đồng thời.
- Transaction: mọi field bắt buộc trừ note (null hoặc ≤500); category cùng owner/type, tiền theo mục 1. FE mặc định ngày hôm nay.
- Filter: month **hoặc** đủ startDate/endDate, không gửi cả hai; start≤end, inclusive hai đầu. keyword trim, tìm note không phân biệt hoa/thường; `%`/`_` hiện là wildcard LIKE. categoryId khác owner trong filter trả danh sách rỗng.
- page≥0, size 1–100, offset = page × size phải ≤2147483647 (giới hạn JPA); vượt offset trả 400 VALIDATION_ERROR, không tự clamp page. Page hợp lệ vượt phạm vi dữ liệu vẫn trả content rỗng. Sort ngày DESC/id DESC, không nhận sort tùy ý. FE mặc định 10 dòng, giữ field number. Danh mục không có sort cố định.
- Budget/Dashboard: năm 1900–2100, tháng 1–12; amountLimit theo giới hạn tiền chung. spentAmount chỉ EXPENSE đúng kỳ; remainingAmount có thể âm, exceeded chỉ khi spent>limit. UI: <80% safe, 80–<100% warning, ≥100% đỏ. Unique ngân sách user/năm/tháng đã có; race upsert cần kiểm thử.
- Dashboard tháng rỗng trả tổng 0, danh mục `[]`, balance=totalIncome-totalExpense; danh mục sort totalAmount DESC. Giữ tên totalAmount/spentAmount/remainingAmount.

### Tên danh mục trùng (bổ sung D06-BE, 03/11/2026)

Theo yêu cầu bổ sung ngày 03/11/2026, áp dụng cho POST/PUT `/api/categories`:

- Giữ validation request hiện có: `name` không blank, tối đa 100 ký tự; `type` bắt buộc. Tên được `trim()` khoảng trắng đầu/cuối trước khi kiểm tra trùng và lưu; không gộp khoảng trắng ở giữa tên, không tự đổi cách viết hoa/thường của tên lưu.
- Nếu đã có **danh mục khác** cùng JWT owner, cùng `type` và tên không phân biệt hoa/thường (`IgnoreCase` tại DB), trả **409 CONFLICT**. Ví dụ `Ăn uống`, `ĂN UỐNG`, `  ăn uống  ` bị coi là trùng trong cùng tài khoản/loại. Hai tên chỉ khác khoảng trắng ở giữa không bị gộp thành một tên.
- Khác owner hoặc khác INCOME/EXPENSE được phép cùng tên. `userId` do client gửi không quyết định chủ sở hữu.
- UPDATE loại trừ đúng ID đang sửa và kiểm tra theo **type đích**. Giữ tên hiện tại/đổi hoa thường hợp lệ nếu không có bản ghi khác trùng. Quy tắc 404 khi khác owner và 409 khi đổi type của danh mục đã có giao dịch giữ nguyên.
- Precheck chạy trước khi thay tên/type/icon/color; request bị từ chối không ghi thay đổi một phần. Khi update thành công, icon/color thiếu được giữ nguyên, null tường minh vẫn reset theo quy tắc D06 hiện có. ID, owner và createdAt không đổi.
- Không tự sửa/xóa/gộp danh mục trùng đã có từ trước. Nếu còn danh mục khác trùng cùng owner/type, update vẫn trả 409 dù tên của bản ghi đang sửa không đổi; cần đổi sang tên hợp lệ hoặc xử lý dữ liệu qua quy trình riêng.

Ví dụ tài khoản đã có `Ăn uống` loại EXPENSE, gửi POST `/api/categories` (hoặc PUT một danh mục EXPENSE khác) với JWT hợp lệ:

```json
{"name":"  ĂN UỐNG  ","type":"EXPENSE"}
```

Response **409** dùng nguyên ApiError D02, không tạo `errors.name` hoặc code lỗi mới:

```json
{"status":409,"code":"CONFLICT","message":"Tên danh mục đã tồn tại với loại này"}
```

**Giới hạn đồng thời:** đây là Service precheck, không phải cam kết UNIQUE ở database. Hai POST hoặc PUT đồng thời có thể cùng đọc “chưa trùng” trước khi một request commit và vẫn tạo tên trùng. Không thêm index/migration hoặc thay transaction isolation trong lượt này. Xem [hồ sơ kiểm chứng D06](../qa/D06.md); bảo đảm uniqueness khi ghi đồng thời cần phương án riêng được DB/nhóm duyệt, bao gồm kiểm tra dữ liệu cũ và quy tắc so sánh tên.

Endpoint, DTO thành công, JSON number/field hiện có và ApiError được giữ nguyên. Trả 409 cho tên trùng là **thay đổi validation có chủ đích theo yêu cầu bổ sung**, thay cho hành vi cho phép trùng trước đây; không coi là hành vi đã có trong contract ngày 30/10.

### Category icon/color (D06-BE, chờ FE và DB/QA xác nhận)

- Giữ endpoint/status CRUD. `name/type` vẫn bắt buộc trên POST/PUT. `icon` là string ≤40, phân biệt hoa/thường, chỉ nhận key Lucide trong allowlist: `tag, utensils, shopping-bag, car, home, heart, graduation-cap, gamepad-2, briefcase, gift, wallet, circle, shirt, sparkles, users, zap, phone, hand-coins, trending-up, clock`. Các key đã đối chiếu với thư viện FE hiện có, chưa phải FE duyệt registry/UI.
- `color` khớp chính xác `#RRGGBB` (nhận hex hoa/thường, trả uppercase). Icon/color blank, HTML, URL hoặc sai định dạng trả 400 `VALIDATION_ERROR`, lỗi field trong `errors.icon/color`. Không trim để hợp thức hóa metadata sai.
- POST thiếu/null dùng default trung lập `tag/#64748B`. PUT thiếu từng field giữ giá trị DB, kể cả NULL; null gửi rõ ràng reset riêng field đó về default. Client không điều khiển được cờ presence nội bộ. Request cũ chỉ có name/type vẫn hợp lệ; response thêm hai field, không đổi id/name/type.
- Đọc Category cũ có NULL/metadata không hợp lệ trả fallback an toàn, không ghi ngược DB. Metadata mới lưu riêng trên Category; đổi tên không làm suy lại icon/màu. User/17 danh mục mới vẫn cùng transaction; login không tạo thêm, user cũ không tự nhận 17 danh mục hoặc được backfill.

Ví dụ POST `/api/categories`: `{"name":"Quà tặng","type":"INCOME","icon":"gift","color":"#a1b2c3"}` → 201 `{"id":123,"name":"Quà tặng","type":"INCOME","icon":"gift","color":"#A1B2C3"}`. PUT cùng name/type, bỏ icon/color sẽ giữ metadata; `"color":null` reset màu về `#64748B` và giữ icon nếu thiếu.

Mapping lúc đăng ký (dữ liệu lưu cố định, không lookup theo tên khi đọc):

| Loại | Tên ban đầu | Icon | Color |
| --- | --- | --- | --- |
| EXPENSE | Ăn uống | utensils | #F59E0B |
| EXPENSE | Chi tiêu hằng ngày | shopping-bag | #3B82F6 |
| EXPENSE | Quần áo | shirt | #8B5CF6 |
| EXPENSE | Mỹ phẩm | sparkles | #EC4899 |
| EXPENSE | Phí giao lưu | users | #F97316 |
| EXPENSE | Y tế | heart | #EF4444 |
| EXPENSE | Giáo dục | graduation-cap | #6366F1 |
| EXPENSE | Tiền điện | zap | #EAB308 |
| EXPENSE | Đi lại | car | #06B6D4 |
| EXPENSE | Phí liên lạc | phone | #14B8A6 |
| EXPENSE | Tiền nhà | home | #A855F7 |
| INCOME | Tiền lương | wallet | #22C55E |
| INCOME | Tiền phụ cấp | hand-coins | #10B981 |
| INCOME | Tiền thưởng | gift | #84CC16 |
| INCOME | Thu nhập phụ | briefcase | #0EA5E9 |
| INCOME | Đầu tư | trending-up | #059669 |
| INCOME | Thu nhập tạm thời | clock | #64748B |

**Điều kiện DB trước triển khai:** D06-DB của Quỳnh cần chốt version, backup/restore test và áp dụng migration bổ sung `categories.icon VARCHAR(40) NULL`, `categories.color VARCHAR(7) NULL` trước khi chạy Backend D06. Giữ nguyên dữ liệu/name/type/FK; backfill là công việc DB riêng, Backend không tự làm. Fallback DTO chỉ xử lý giá trị NULL/sai sau khi cột tồn tại, **không xử lý schema thiếu cột**.

Giữ nguyên cấu hình `ddl-auto` hiện tại; không khởi động D06 trên VPS để thử thêm cột vì `update` có thể tự ALTER. Chưa xác nhận migration thì chặn commit/release D06 để deploy; không coi schema tạo mới trong Testcontainers là bằng chứng migration production. Rollback ứng dụng cũ có thể giữ hai cột nullable; không tự drop/backfill/restore production. **FE và DB/QA vẫn chờ xác nhận allowlist, mapping và migration.**

### Calendar và chi tiết ngày (FR-04/FR-05)

- `GET /api/calendar/month?year=2026&month=10`, không body; gửi JWT như mục 1. year/month là số nguyên bắt buộc, năm 1900–2100, tháng 1–12. Thiếu, trống, sai kiểu hoặc ngoài giới hạn trả 400 ApiError D02; JWT thiếu/sai/hết hạn trả 401.
- Response `year/month` là số nguyên; tiền là JSON number/BE BigDecimal; `date` là string YYYY-MM-DD, không chuyển DATE qua UTC. `days` đủ 28/29/30/31 ngày, sort ASC, ngày trống trả tiền 0. `incomeTotal/expenseTotal` ở cấp tháng bằng tổng các ngày; tháng rỗng vẫn đủ ngày và tổng 0. Calendar trả trọn tháng, không phân trang; giữ nguyên tên field của Dashboard hiện có.
- Owner chỉ lấy từ JWT. `userId` client không thay owner; không trả dữ liệu user khác. Backend D04 đã có test SQL, năm nhuận, ranh giới tháng/năm, timezone, tiền và ownership; **FE chưa được coi là đã xác nhận**.
- Xem ngày: `GET /api/transactions?startDate=2026-10-31&endDate=2026-10-31&page=0&size=10`. Hai đầu inclusive; không gửi thêm `month`. Response `Page<Transaction>` giữ `number`, `size`, `totalElements`, `totalPages`; sort ngày DESC rồi id DESC. Đọc hết các trang mới có danh sách đầy đủ; dùng Calendar để lấy tổng, không cộng riêng trang đầu.
- Thêm từ lịch dùng POST `/api/transactions` với `transactionDate` là ngày đã chọn. Sau tạo/sửa/xóa thành công, FE refetch lịch tháng và trang chi tiết ngày hiện hành; nếu xóa hết trang cuối thì tải lại trang còn hợp lệ. Đây là hướng dẫn tích hợp, chưa xác nhận FE đã thực hiện.

#### Mô tả Calendar API cho tích hợp — D05-BE, 02/11/2026

Phần này làm rõ API hiện có theo Controller/Service/DTO, không đổi endpoint, schema hoặc quy tắc xác thực. Hồ sơ rà soát và kết quả chạy lại: [QA D05](../qa/D05.md). Các ghi chú trạng thái FE ở trên là thông tin lịch sử của lần đối chiếu trước, không phải kết quả nghiệm thu mới.

```http
GET /api/calendar/month?year=2026&month=2
Authorization: Bearer <ACCESS_TOKEN>
```

Không có request body. Token lấy từ `POST /api/auth/login`; không truyền token trong URL.

| Query parameter | Kiểu | Bắt buộc | Giá trị hợp lệ |
| --- | --- | --- | --- |
| `year` | integer | Có | 1900–2100, gồm hai đầu |
| `month` | integer | Có | 1–12, gồm hai đầu |

API không khai báo bộ lọc `type/categoryId/keyword` hoặc tham số phân trang `page/size`. Muốn xem danh sách có lọc, gọi Transaction API riêng. `userId` gửi từ client không thay thế subject trong JWT.

Quy tắc tổng hợp:

- Chỉ lấy giao dịch của owner trong khoảng `[ngày đầu tháng, ngày đầu tháng kế tiếp)`, theo `transactionDate` kiểu DATE/LocalDate; không dùng `createdAt` hoặc chuyển ngày qua UTC.
- Mỗi ngày: `incomeTotal = SUM(amount WHERE type = INCOME)`, `expenseTotal = SUM(amount WHERE type = EXPENSE)`. Hai tổng tách biệt, không lấy thu trừ chi để tạo tổng ngày. Không có giao dịch của loại tương ứng thì trả 0.
- Cấp tháng: cộng các tổng ngày của từng loại. Tổng bao gồm mọi giao dịch đúng kỳ/owner, không bị giới hạn bởi trang hoặc bộ lọc của Transaction API. Khi đối chiếu với danh sách, phải lấy hết trang và cùng kỳ/owner, không thêm bộ lọc khác.
- DB lưu tiền DECIMAL(15,2), DB SUM và Backend BigDecimal giữ phần thập phân; Calendar không làm tròn trung gian hoặc ép tổng về giới hạn của một giao dịch. Tổng nhiều giao dịch có thể lớn hơn 9999999999999.99.
- Tiền trong JSON là number, không có dấu phân cách hàng nghìn; `0`, `0.0`, `0.00` tương đương về giá trị. Client không dựa vào số chữ số thập phân trong biểu diễn JSON; lưu ý giới hạn độ chính xác của JavaScript Number khi xử lý tổng rất lớn.
- `days` có đầy đủ các ngày thực của tháng, tăng dần; tháng 2 phụ thuộc năm nhuận (1900/2100 có 28 ngày, 2000 có 29 ngày). Response không có thông tin phân trang.

Ví dụ **200 OK**, tháng 02/2026 có Thu 100.10 ngày 01, Chi 20.05 ngày 01 và Chi 0.25 ngày 28:

```json
{
  "year": 2026,
  "month": 2,
  "incomeTotal": 100.10,
  "expenseTotal": 20.30,
  "days": [
    {"date":"2026-02-01","incomeTotal":100.10,"expenseTotal":20.05},
    {"date":"2026-02-02","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-03","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-04","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-05","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-06","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-07","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-08","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-09","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-10","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-11","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-12","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-13","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-14","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-15","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-16","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-17","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-18","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-19","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-20","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-21","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-22","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-23","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-24","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-25","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-26","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-27","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-28","incomeTotal":0,"expenseTotal":0.25}
  ]
}
```

Ví dụ **200 OK** khi owner không có giao dịch trong tháng 02/2026 (kể cả khi tài khoản khác có giao dịch):

```json
{
  "year": 2026,
  "month": 2,
  "incomeTotal": 0,
  "expenseTotal": 0,
  "days": [
    {"date":"2026-02-01","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-02","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-03","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-04","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-05","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-06","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-07","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-08","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-09","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-10","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-11","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-12","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-13","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-14","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-15","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-16","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-17","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-18","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-19","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-20","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-21","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-22","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-23","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-24","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-25","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-26","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-27","incomeTotal":0,"expenseTotal":0},
    {"date":"2026-02-28","incomeTotal":0,"expenseTotal":0}
  ]
}
```

Validation và HTTP error (ApiError D02, không trả stack trace/SQL/token):

| HTTP | `code` | Trường hợp |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Thiếu/rỗng year hoặc month, sai kiểu số nguyên, tràn int, hoặc ngoài miền giá trị |
| 401 | `UNAUTHORIZED` | Thiếu JWT, token sai chữ ký/định dạng, hết hạn hoặc claims không hợp lệ theo bộ xác thực hiện có |
| 500 | `INTERNAL_ERROR` | Lỗi máy chủ ngoài dự kiến; thông báo trung lập |

Không có dữ liệu là **200**, không phải 404. Spring Security xác thực trước Controller, vì vậy request vừa thiếu JWT vừa sai tham số sẽ nhận 401 trước bước validation kỳ. Không có `errors` theo field cho các lỗi query nêu trên; client xử lý theo HTTP status và `code`, không phụ thuộc chuỗi `message`.

Ví dụ `month=13` với JWT hợp lệ:

```json
{"status":400,"code":"VALIDATION_ERROR","message":"Tháng phải nằm trong khoảng 1-12"}
```

Ví dụ thiếu JWT (kèm response header `WWW-Authenticate: Bearer`):

```json
{"status":401,"code":"UNAUTHORIZED","message":"Vui lòng đăng nhập lại"}
```

Khi sửa `transactionDate` sang tháng/năm khác, cần refetch **cả tháng nguồn và tháng đích** nếu đang giữ dữ liệu hai kỳ ở client. Với cùng owner và kỳ, `Calendar.incomeTotal/expenseTotal` khớp `Dashboard.totalIncome/totalExpense` khi đối chiếu cùng trạng thái dữ liệu; hai HTTP request riêng có thể thấy dữ liệu khác nhau nếu có ghi xen giữa.

Quick Add (FR-03) dùng POST `/transactions`, không thêm `/quick-add`. Khóa submit đồng bộ; chỉ báo thành công sau response rồi refetch giao dịch/Dashboard/ngân sách/lịch. Timeout không tự POST lại vì server có thể đã lưu: giữ form, kiểm tra lại danh sách. Bỏ fallback thành công giả và đồng bộ xóa token/user/context khi 401 là việc còn cần triển khai (FR-01/11).

### Ngân sách danh mục — D07-BE Commit 2 (04/11/2026, chờ review/tích hợp FE và D07-DB)

Phần này mô tả mã Backend tại local, chưa xác nhận triển khai hoặc migration trên DB thật. **Bộ endpoint D07 đã được chốt theo Phương án 1 — CRUD theo ID:** POST upsert, GET danh sách theo query year/month, GET/PUT/DELETE theo `/{id}` như bảng ở mục 2. Không triển khai thêm route `/{year}/{month}/{categoryId}`. Quyết định này giữ nguyên UNIQUE `(user_id, category_id, year, month)` và owner từ JWT; không đổi endpoint ngân sách tổng. API định kỳ/báo cáo/CSV bên dưới vẫn là đề xuất riêng.

- Mọi endpoint `/api/category-budgets` yêu cầu JWT. Owner chỉ lấy từ subject JWT; `userId` client không quyết định quyền sở hữu. Không trả Entity JPA, thông tin user hoặc mật khẩu trong response.
- Ngân sách danh mục độc lập với ngân sách tổng tháng; không cấm tổng hạn mức danh mục vượt hạn mức tháng và không sửa dữ liệu MonthlyBudget.
- POST là upsert theo `(JWT user, categoryId, year, month)`: chưa có thì tạo, đã có thì giữ ID và thay hạn mức; cả hai trả **200**. Category phải tồn tại, cùng owner và loại EXPENSE. Category không tồn tại/khác owner trả **404 RESOURCE_NOT_FOUND**, cùng owner nhưng INCOME trả **400 VALIDATION_ERROR**.
- GET danh sách yêu cầu cả `year` và `month`, trả mảng theo `categoryId ASC`; chưa đặt ngân sách tháng đó trả `[]`. GET/PUT/DELETE theo `id` không tồn tại/khác owner trả **404 RESOURCE_NOT_FOUND**.
- PUT chỉ có field `amountLimit` được dùng; không chuyển owner/category/year/month. Muốn đặt ngân sách cho danh mục/kỳ khác dùng POST. Field JSON ngoài DTO không được dùng để thay các trường này; không coi PUT là thao tác chuyển kỳ.
- Validation: `categoryId`/path `id` là Long dương; `categoryId`, `year`, `month`, `amountLimit` trong POST bắt buộc; PUT bắt buộc `amountLimit`. Năm **1900–2100**, tháng **1–12**, tiền **0.01–9999999999999.99**, tối đa **2 số thập phân**, cùng chuẩn `DECIMAL(15,2)` của MonthlyBudget. Lỗi body Bean Validation có `errors` theo field; lỗi path/query/nghiệp vụ có thể không có `errors`. JSON sai kiểu hoặc thiếu query bắt buộc trả 400.
- Thiếu/sai/hết hạn JWT trả **401 UNAUTHORIZED** theo Security hiện tại; DELETE thành công **204**, không body. Không thêm cơ chế xác thực hoặc mã lỗi mới.

Request POST `/api/category-budgets`:

```json
{"categoryId":11,"year":2026,"month":11,"amountLimit":1000000.00}
```

Request PUT `/api/category-budgets/41`:

```json
{"amountLimit":1500000.00}
```

Response 200 minh họa khi hạn mức 1.000.000, đã chi 1.200.000:

```json
{
  "id":41,"categoryId":11,"categoryName":"Ăn uống","year":2026,"month":11,
  "amountLimit":1000000.00,"spentAmount":1200000.00,"remainingAmount":-200000.00,
  "usagePercentage":120.00,"exceeded":true,"status":"OVER_BUDGET"
}
```

ID/year/month/tiền/tỷ lệ là JSON number, `exceeded` boolean, `status` string enum. Giữ tên `spentAmount`, `remainingAmount`, `usagePercentage`, `OVER_BUDGET` từ contract dự kiến; không dùng alias `spent/remaining/percentage/DANGER`. Không yêu cầu JSON giữ số 0 cuối phần thập phân.

- `spentAmount`: SUM `Transaction.amount` của đúng user/category, type EXPENSE, `startDate <= transactionDate < nextMonthStart`; DATE không chuyển múi giờ, xử lý cả tháng 12 sang năm sau. Không phụ thuộc pagination. Chưa có giao dịch tương ứng thì bằng 0.
- `remainingAmount = amountLimit - spentAmount`, cho phép âm. `usagePercentage = spentAmount * 100 / amountLimit`, BigDecimal, **HALF_UP 2 số thập phân**, không cap ở 100%.
- `status`: **SAFE** khi spent < limit × 0.80; **WARNING** khi limit × 0.80 ≤ spent < limit; **OVER_BUDGET** khi spent ≥ limit. So sánh tiền chính xác trước làm tròn phần trăm; `exceeded` chỉ true khi spent > limit. Đúng 100%: OVER_BUDGET và exceeded=false. Một tỷ lệ được làm tròn thành 80.00/100.00 có thể vẫn ở trạng thái ngưỡng dưới.
- Mỗi lần GET/upsert/update đều tính lại từ transactions hiện tại; sửa/xóa/chuyển kỳ giao dịch được phản ánh khi đọc lại, không lưu các số liệu này thành cột. List dùng một truy vấn ngân sách kèm category và một truy vấn SUM nhóm theo category; tháng không có ngân sách không chạy SUM. FE cần refetch sau sửa/xóa giao dịch; chuyển kỳ thì refetch cả kỳ nguồn và đích nếu đang hiển thị.

**Concurrent upsert và lỗi DB:** thao tác ghi nằm trong transaction, `saveAndFlush` để phát hiện lỗi ghi. Precheck không thay thế UNIQUE `(user_id, category_id, year, month)` tại MySQL. Khi hai POST cùng tạo một kỳ, UNIQUE phải ngăn bản ghi thứ hai; request thua race trả **409 CONFLICT**, không retry trong transaction đã lỗi. Client nhận 409 cần GET lại trước quyết định gửi lại. Không cam kết thứ tự request thắng hoặc ghi đè cuối cùng khi cập nhật đồng thời.

Chỉ duplicate key MySQL **1062 / SQLSTATE 23000** mới được chuyển sang 409 ở API D07. Lỗi toàn vẹn dữ liệu khác không bị coi là trùng kỳ: trả **500 INTERNAL_ERROR** trung lập, không lộ SQL/constraint/stack trace. Handler này chỉ áp dụng `CategoryBudgetController`; API khác giữ behavior hiện tại. Ví dụ 409:

```json
{"status":409,"code":"CONFLICT","message":"Thao tác xung đột với dữ liệu hiện có"}
```

**Phụ thuộc D07-DB/Commit 3:** migration chưa có trong nhánh tại thời điểm triển khai; chưa xác nhận concurrency, FK và kết quả MySQL thực. DB cần khớp bảng/cột/nullable/DECIMAL của Entity, FK users/categories và UNIQUE bốn cột. Không dùng khởi động ứng dụng với `ddl-auto=update` thay migration được duyệt. D07 không đổi CategoryService hoặc tự thêm cascade; chính sách chặn xóa/đổi loại category đang có budget phải phối hợp DB/FE, chưa coi FK riêng lẻ là bằng chứng category cùng owner. Không đổi schema, runner hoặc cấu hình trong Commit 2.

## 3. API dự kiến — cần review trước triển khai

API mới yêu cầu JWT, ID dương, input hợp lệ; lỗi chung theo mục 1. Category/template khác owner trả 404; category thuộc owner nhưng sai type trả 400.

**Liên kết danh mục với ngân sách/mẫu (FR-02/07/08), chưa duyệt:** mở rộng rule không xóa/đổi type khi có transaction/budget/template (kể cả inactive) →409 CATEGORY_IN_USE; không cascade tài chính. D06 giữ rule transaction 409 CONFLICT hiện có; chưa thêm bảng hoặc rule của D07/D08.

| Method | Đường dẫn | Request | Thành công / lỗi nghiệp vụ |
| --- | --- | --- | --- |
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
