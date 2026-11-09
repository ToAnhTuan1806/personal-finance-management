# SE2-D10-DB — QA Reports, SQL, bảo mật và hiệu năng

TASK: SE2-D10-DB

BRANCH: feature/quynh

STATUS: READY FOR COMMIT — 49/49 PASS (36 kiểm tra tự động DB/API/SQL/EXPLAIN/FE-service PASS + 13 ca Browser QA UI01–UI13 PASS độc lập qua Google Chrome Headless CDP).

Ngày thực thi: **09/11/2026, UTC+07**. Lượt DB/API/SQL/PERF: **00:17:59–00:18:37** (giữ nguyên do SHA-256 của BE/FE/JAR/fixture không đổi); lượt Browser QA độc lập qua Chrome CDP: **01:05:12–01:05:51**.
Chưa stage/commit/push/PR/merge/deploy; không thay đổi ngày Git.

## 1. Nguồn và môi trường QA

| Worktree | Nhánh | HEAD |
| --- | --- | --- |
| personal-finance-management-DB | feature/quynh | d956bef93b6a146fc2b7d3a47404d5e6b797d693 |
| personal-finance-management | feature/tuan | d956bef93b6a146fc2b7d3a47404d5e6b797d693 |
| personal-finance-management-FE | feature/trang | d956bef93b6a146fc2b7d3a47404d5e6b797d693 |

Worktree DB sạch trước khi tạo file D10-DB. BE/FE có D10 chưa commit; không coi HEAD chung là snapshot chứa D10. Trạng thái dirty và SHA-256 từng file tracked/untracked không bị Git ignore được lưu trong bằng chứng. Đối chiếu trước/sau mỗi lượt xác nhận **BE/FE không đổi**. Không chuyển nhánh, merge, reset, stash hoặc clean bất kỳ worktree nào. Git safe.directory chỉ truyền qua tùy chọn -c từng lệnh đọc, không sửa cấu hình Git toàn cục.

Dùng JAR D10 đã có, sao chép chỉ vào thư mục build của DB. Đã kiểm tra có ReportController/ReportService/DTO/query mới, bytecode trong JAR bằng classes hiện hành, không có main Java source mới hơn JAR; sau đó xác minh endpoint thực tế với JWT hợp lệ.

- JAR SHA-256: `d3dab36868aec39770beef49a75557a91ff32c9d6d2c58e5b03f5a0821cf32f4`.
- API Contract từ worktree **BE**, không dùng proposal cũ ở DB.
- Java 21.0.10, Docker 29.9.2, MySQL **8.0.46**, Node 24.18.0, Google Chrome **156.0.8078.81** (CDP Protocol **1.3**).
- Chỉ Docker socket local, container mới có nhãn `com.smartexpense.test=d10-db`, database ngẫu nhiên `se_d10_qa_*` (`se_d10_qa_80cb55a5156c4a3384eb04edecb5999c` cho lượt 36 ca DB; `se_d10_qa_ab190502e1ec4de480212638be200eba` cho lượt 13 ca Browser QA), TCP loopback/cổng động.
- Browser QA khởi chạy `chrome.exe` ở chế độ `--headless=new --remote-debugging-port=<dynamic> --user-data-dir=<temp>` trong thư mục runtime riêng rồi xóa sạch khi kết thúc; không can thiệp bất kỳ phiên trình duyệt thật nào của người dùng.
- Schema: fixture MVP có sẵn `d06-legacy-schema.sql` → V002 → V003 → V004 → V005 → Backend với **Hibernate validate**. Không dùng create/update ngầm hoặc chạy DDL vào database ứng dụng.
- Giữ nguyên `ONLY_FULL_GROUP_BY, STRICT_TRANS_TABLES, NO_ZERO_IN_DATE, NO_ZERO_DATE, ERROR_FOR_DIVISION_BY_ZERO, NO_ENGINE_SUBSTITUTION`.
- Tạo tài khoản giả qua register/login thật; credential/JWT/key ngẫu nhiên chỉ trong bộ nhớ hoặc cấu hình runtime bị xóa. Không ghi chúng vào báo cáo/evidence.
- JVM, cấu hình riêng và container test đã được dọn. Log/build snapshot chỉ nằm trong đường dẫn Git ignore.

## 2. File tạo và danh sách dự kiến commit

1. `scripts/qa/d10_reports_qa.py` — harness độc lập, chỉ thư viện Python chuẩn; gọi Docker, Java và Node có sẵn.
2. `backend/src/test/resources/d10-reports-fixture.sql` — fixture giả có guard database/owner, không phải migration.
3. `docs/qa/evidence/SE2-D10-DB_RESULTS.json` — kết quả thực thi, SQL/response/EXPLAIN, source hashes, không chứa credentials.
4. `docs/qa/SE2-D10-DB_REPORT.md` — báo cáo này.

Không sửa source/nghiệp vụ BE/FE, dependency/lockfile, cấu hình dự án, migration hay index. Không thêm code D11/D12/D13; fixture chỉ chuẩn bị dữ liệu QA cho D11.

## 3. Cách chạy và bằng chứng

Chạy tại worktree DB:

```powershell
# Chạy toàn bộ (36 DB/API/PERF/FE-service + 13 Browser CDP):
python -X utf8 scripts/qa/d10_reports_qa.py --backend F:/RikkeiEdu/personal-finance-management --frontend F:/RikkeiEdu/personal-finance-management-FE

# Giữ nguyên 36 ca DB đã hợp lệ khi source BE/FE/JAR/fixture không đổi và chỉ chạy bổ sung 13 ca Browser CDP:
python -X utf8 scripts/qa/d10_reports_qa.py --backend F:/RikkeiEdu/personal-finance-management --frontend F:/RikkeiEdu/personal-finance-management-FE --browser-only
```

Harness yêu cầu nhánh DB feature/quynh, BE feature/tuan, FE feature/trang; từ chối Docker remote, JAR thiếu/cũ, source thay đổi giữa lượt. Mỗi lần chạy tạo database/container mới. Output runtime: `backend/build/d10-db/results.json`; bản bàn giao: [JSON bằng chứng](evidence/SE2-D10-DB_RESULTS.json).

Mỗi record `tests` có ID, group, input, expected, actual và status. `actual.bodyRaw` là HTTP JSON thật; số tiền trong các bản so sánh SQL được serialize thành string để giữ chính xác Decimal, không phải thay đổi kiểu tiền của API. SQL plan nằm ở `performance.explain`; log SQL gốc kèm client/thread ở `performance.afterBulkOtherOwner.capturedStatements`.

Harness SHA-256: `92c9348fd5ec655671890762cdfe51e75c5c134a02c8ca0a1a8bb65303ea7b3a`.
Fixture SHA-256: `161324624ee52a47a99ba6897441b6096c83830ef87771a364827b699e78dd56`.

## 4. Tổng kết thực thi độc lập

| Nhóm | PASS | FAIL | SKIPPED | BLOCKED |
| --- | ---: | ---: | ---: | ---: |
| API nghiệp vụ/validation/JWT/owner | 31 | 0 | 0 | 0 |
| SQL + ngân sách + fixture AI | 1 | 0 | 0 | 0 |
| Query count/EXPLAIN/đo thời gian | 1 | 0 | 0 | 0 |
| Đọc đồng thời | 1 | 0 | 0 | 0 |
| Lỗi 500 an toàn và phục hồi | 1 | 0 | 0 | 0 |
| Service FE thật → HTTP → MySQL, gồm 7 sub-check | 1 | 0 | 0 | 0 |
| Browser UI01–UI13 (Google Chrome Headless CDP) | 13 | 0 | 0 | 0 |
| **Tổng record kiểm thử** | **49** | **0** | **0** | **0** |

**Không cộng 7 sub-check FE hoặc 8 request đồng thời lần nữa vào 36 ca tự động ban đầu (36 DB/API/PERF/FE-service + 13 Browser UI01–UI13 = 49 record PASS).** Có **16 ca Reports đối chiếu SQL độc lập**, tổng **37 phép so sánh theo tháng với Dashboard** trong nhóm API. Ca phục hồi sau lỗi 500 còn kiểm lại Reports/SQL/Dashboard.

Không chạy lại hoặc nhận 837 BE/440 FE là số test QA của Quỳnh. Những con số của BE/FE trước đó chỉ là nguồn tham khảo.

### Ma trận API và đầu ra

Từng ID dưới đây có input, expected, actual và HTTP/SQL evidence riêng trong JSON; tiền không hardcode thành response.

| ID | Đầu vào / mong đợi | Kết quả thực tế |
| --- | --- | --- |
| API-01 | 2026-09, một tháng có thu và chi | 200; thu 1000.30, chi 350.35, balance 649.95; SQL/Dashboard khớp |
| API-02 | 2026-09 → 2026-11 | 200; đủ 3 tháng; tổng/danh mục toàn khoảng khớp SQL |
| API-03 | 2026-05 → 2026-10 | 200; đúng 6 tháng inclusive, thứ tự ASC |
| API-04 | 2026-10 rỗng | 200; thu/chi/balance 0, expensesByCategory=[] |
| API-05 | Tháng rỗng giữa 09 và 11 | 200; tháng 10 vẫn có trong months với 0 |
| API-06 | 2025-12 → 2026-01 | 200; chi 22.22 tháng 12, thu 111.11 tháng 1 |
| API-07 | Tháng 02/2024 có 29/02 | 200; thu 0.20, chi 0.10; giao dịch 01/03 bị loại |
| API-08 | Nhiều giao dịch cùng danh mục | 200; Food tháng 09 cộng 100.10+200.20=300.30 |
| API-09 | Danh mục unused/INCOME | 200; chỉ category có EXPENSE đúng kỳ được trả |
| API-10 | Đối chiếu ba nguồn trong 6 tháng | Reports=SQL=Dashboard từng tháng, kể cả tháng rỗng |
| API-11 | Thiếu from | 400 VALIDATION_ERROR |
| API-12 | Thiếu to | 400 VALIDATION_ERROR |
| API-13a | from=2026-9 | 400 VALIDATION_ERROR |
| API-13b | from rỗng | 400 VALIDATION_ERROR |
| API-13c | to rỗng | 400 VALIDATION_ERROR |
| API-14a | Tháng 00 | 400 VALIDATION_ERROR |
| API-14b | Tháng 13 | 400 VALIDATION_ERROR |
| API-15 | from > to | 400 VALIDATION_ERROR |
| API-16 | 2026-01 → 2026-07, 7 tháng | 400 VALIDATION_ERROR |
| API-17a | Năm 1899 | 400 VALIDATION_ERROR |
| API-17b | Năm 2101 | 400 VALIDATION_ERROR |
| API-18a | Không JWT | 401 UNAUTHORIZED |
| API-18b | JWT sai | 401 UNAUTHORIZED |
| API-18c | JWT ký đúng nhưng hết hạn trên 600 giây | 401 UNAUTHORIZED |
| API-19A | JWT A | Chỉ số liệu A; SQL/Dashboard của A khớp |
| API-19B | JWT B | Chỉ số liệu B; tháng 09 thu 9000.00, chi 999.99 |
| API-20 | JWT A + userId=B | Vẫn số liệu A, không lộ B |
| API-21 | 1900-01 | 200; thu 1.90, chi 0 |
| API-22 | 2100-12 | 200; chi 2.10 ngày 31/12; endExclusive sang 2101-01 |
| API-23 | Tổng vượt hạn mức một giao dịch | Thu 0.30, chi 19999999999999.98, balance -19999999999999.68 |
| API-24 | Chuỗi SQL injection trong from | 400 VALIDATION_ERROR |
| SQL-AI-01 | Ngân sách tháng và danh mục | Tổng chi khớp SQL; SAFE/OVER_BUDGET đúng fixture |
| PERF-01 | 120 dòng đúng owner/kỳ, thêm 20000 dòng owner B | Vẫn 2 SELECT; EXPLAIN dùng index hiện có |
| HTTP-CONCURRENT-01 | 8 request GET đồng thời | 8 HTTP 200, cùng tổng SQL mong đợi |
| HTTP-500-01 | Mất SELECT chỉ trên user/database test | 500 INTERNAL_ERROR trung lập; khôi phục quyền, API/SQL/Dashboard về 200 |
| FE-SERVICE-01 | Module FE nguyên bản qua Axios HTTP thật | 7 sub-check PASS; không mock response |

## 5. Đối chiếu SQL — Reports — Dashboard

Oracle dùng `DATE_FORMAT`, `SUM(CASE WHEN ...)`, nhóm theo category_id và Decimal; không gọi ReportService để tính expected. Tất cả truy vấn có owner và khoảng `start <= transaction_date < endExclusive`.

Ví dụ A, 2026-09 → 2026-11:

| Tháng | SQL INCOME = Reports = Dashboard | SQL EXPENSE = Reports = Dashboard | Balance |
| --- | ---: | ---: | ---: |
| 2026-09 | 1000.30 | 350.35 | 649.95 |
| 2026-10 | 0 | 0 | 0 |
| 2026-11 | 2000.00 | 501.00 | 1499.00 |

EXPENSE theo danh mục toàn khoảng: Food **650.55**, Transport **200.80**; tổng **851.35**. Giao dịch 31/08 và 01/12 bị loại. Owner B cùng kỳ có thu **9000.00**, chi **999.99**, không trộn vào A.

API thực tế giữ `from/to/months[{month,totalIncome,totalExpense,balance}]/expensesByCategory[{categoryId,categoryName,totalAmount}]`. Tiền HTTP là JSON number, Backend BigDecimal; không sử dụng fromMonth/toMonth, income/expense hoặc categoryShare cũ. Không có dữ liệu trả 200, không phải 404.

## 6. JWT, owner và lỗi máy chủ

Login/register thật trong database riêng. Test thiếu/sai/hết hạn JWT nhận 401. Test cả hai JWT A/B và userId giả nhận đúng owner. Input sai nhận ApiError 400, không có trace.

Fault injection chỉ REVOKE/GRANT SELECT trên grant pattern của database `se_d10_qa_*` vừa tạo; đóng đúng session của user test để quyền mới có hiệu lực. Không thay schema hay security ứng dụng. Bằng chứng HTTP-500-01:

```json
{"status":500,"code":"INTERNAL_ERROR","message":"Đã xảy ra lỗi máy chủ. Vui lòng thử lại sau"}
```

Không chứa SQL, tên bảng, JDBC/stack trace hoặc secret runtime. Quyền đọc được khôi phục trong finally; ca phục hồi kiểm lại HTTP 200 và đối chiếu SQL/Dashboard. Sau đó service FE tiếp tục PASS.

## 7. EXPLAIN và hiệu năng

Dữ liệu sau nạp: **20145 transactions**, owner A **143** dòng tổng cộng; đúng cửa sổ đo 2025-01 → 2025-06 có **120** giao dịch A. Thêm **20000** giao dịch B ở năm 2018 để kiểm tra tính chọn lọc owner/ngày.

MySQL general_log bắt đúng client `d10_qa` và command Query/Execute. Loại truy vấn metadata của CLI/root và lệnh điều khiển log khỏi phép đếm. Trước và sau bulk đều đúng **2 SELECT ứng dụng**, không có SELECT riêng từng category/tháng. Log cũng xác nhận `SET SESSION TRANSACTION READ ONLY`, hai SELECT, COMMIT rồi trả về READ WRITE.

Hai SQL thực tế nguyên bản được lưu trong JSON; cả hai có predicate:

```sql
WHERE t1_0.user_id = 1
  AND t1_0.transaction_date >= '2025-01-01'
  AND t1_0.transaction_date < '2025-07-01'
```

- Query tháng: YEAR/MONTH/type, SUM(amount), GROUP BY tại DB.
- Query danh mục: JOIN categories, type='EXPENSE', SUM(amount), GROUP BY category ID/name, ORDER BY SUM DESC.
- SQL trả projection tổng hợp, không SELECT toàn bộ Transaction. Không dùng counter Hibernate entity-load để nhận là đã đo 0; kết luận dựa trên SQL thực tế và source projection, cộng số SELECT ứng dụng cố định.

| Query / bảng | access_type | key | used_key_parts | rows_examined_per_scan (ước lượng) |
| --- | --- | --- | --- | ---: |
| Tháng / transactions | range | idx_transactions_user_date | user_id, transaction_date | 120 |
| Danh mục / transactions | range | idx_transactions_user_date | user_id, transaction_date | 120 |
| Danh mục / categories | eq_ref | PRIMARY | id | 1 mỗi join |

Không có ALL/full table scan trong hai plan ở dataset này. Có temporary table/filesort cho GROUP BY/ORDER BY; chưa có bằng chứng để thêm index hoặc migration. Ý nghĩa access type/temporary/filesort đối chiếu [MySQL 8.0 EXPLAIN manual](https://dev.mysql.com/doc/refman/8.0/en/explain-output.html).

10 mẫu HTTP sau warm-up: min **29.314 ms**, median **31.197 ms**, max **35.783 ms**. Đây là phép đo local với dữ liệu giả và plan **ước lượng**, không phải EXPLAIN ANALYZE, tải lớn thực tế, p95/SLO hoặc cam kết production. Dataset chưa mô phỏng một owner có hàng triệu giao dịch; QA tải lớn là bước tiếp theo nếu cần.

## 8. Frontend tích hợp và Browser QA

Service FE được import trực tiếp, hash nằm trong manifest. Chỉ cấp session test trong RAM và đổi baseURL của Axios ở tiến trình Node QA tới Backend riêng; giữ adapter HTTP thật, không sửa source hoặc mock response.

7 sub-check: 1 tháng, 3 tháng, 6 tháng, tháng rỗng, khoảng sai bị chặn, chuyển owner B, 401 xóa phiên. Không coi đây là kiểm thử DOM/biểu đồ/theme/mobile.

**13/13 ca trình duyệt (`UI01`–`UI13`) đều PASS độc lập** qua Google Chrome Headless CDP (`Chrome/156.0.8078.81`, Protocol `1.3`, `--headless=new --remote-debugging-port=<dynamic>` với `--user-data-dir` tạm trong thư mục runtime riêng, tổng **56 HTTP API calls** từ trình duyệt tới Backend/MySQL QA cô lập `se_d10_qa_ab190502e1ec4de480212638be200eba`). Toàn bộ số liệu hiển thị trên DOM được đối chiếu trực tiếp với fixture `d10-reports-fixture.sql` và SQL oracle của D10-DB (không sao chép kết quả FE của Trang).

| ID | Kịch bản thực thi trên Chrome CDP | Kết quả thực tế trên DOM & SQL |
| --- | --- | --- |
| UI01 | Login và mở `/reports` | PASS — Đăng nhập User A tại `/login`, lưu `accessToken` vào `sessionStorage`, điều hướng sang `/reports`, hiển thị tiêu đề `Báo cáo thu – chi & Thống kê` và kỳ mặc định `2026-09` → `2026-11` |
| UI02 | Chọn 1 tháng | PASS — Preset `Tháng này` (`2026-11`): thu `2.000 ₫`, chi `501 ₫`, chênh lệch `+1.499 ₫`; chọn `2026-09` → `2026-09`: thu `1.000,3 ₫`, chi `350,35 ₫`, chênh lệch `+649,95 ₫` (khớp SQL) |
| UI03 | Chọn 3 tháng | PASS — `2026-09` → `2026-11` (`3 tháng`): đủ 3 dòng (`09/2026`, `10/2026` rỗng `0 ₫`, `11/2026`), KPI tổng `3.000,3 ₫` / `851,35 ₫` / `+2.148,95 ₫` (khớp SQL) |
| UI04 | Chọn 6 tháng | PASS — Preset `6 tháng gần nhất` (`06/2026 – 11/2026`) và khoảng `2026-05` → `2026-10`: đủ 6 dòng trong bảng, KPI `1.901,41 ₫` / `352,57 ₫` / `+1.548,84 ₫` (khớp SQL) |
| UI05 | Khoảng sai và thông báo validation | PASS — `2026-11` → `2026-09` báo `Tháng bắt đầu không được lớn hơn tháng kết thúc.`; `2026-01` → `2026-07` báo `Khoảng thời gian báo cáo tối đa 6 tháng (hiện đang chọn 7 tháng).`; khóa nút `Xem báo cáo` và phát sinh `0` request HTTP |
| UI06 | Tháng rỗng (`2026-10`) | PASS — KPI `0 ₫`, hiển thị đủ 2 thông điệp Empty State cho biểu đồ cột thu–chi và phân bổ danh mục |
| UI07 | Biểu đồ cột thu/chi | PASS — Render `svg.recharts-surface`, trục X có `09/2026`, `10/2026`, `11/2026`, dòng `Tổng cộng` dưới bảng khớp `3.000,3 ₫` / `851,35 ₫` / `+2.148,95 ₫` / `71,62%` |
| UI08 | KPI và bảng danh mục | PASS — Render Donut `svg.se097-svg` (2 phân đoạn), bảng danh mục `#1 QA D10 Food` `650,55 ₫` (`76,41%`) và `#2 QA D10 Transport` `200,8 ₫` (`23,59%`); ẩn `QA D10 Unused` và `QA D10 Income` |
| UI09 | Đổi tài khoản A/B trên UI | PASS — Đăng xuất A xóa `sessionStorage` và chặn `/reports` về `/login`; đăng nhập B chỉ hiển thị số liệu của B (`9.000 ₫` / `999,99 ₫` / `+8.000,01 ₫`), không rò rỉ dữ liệu của A |
| UI10 | Mất kết nối API và phục hồi | PASS — Khi lỗi mạng `/api/reports/monthly`, hiện `role="alert"` + nút `Thử lại`, KPI cũ xóa về `—`; bấm `Thử lại` khôi phục `3.000,3 ₫` / `851,35 ₫` / `+2.148,95 ₫` |
| UI11 | Light/Dark | PASS — Chuyển đổi qua `#theme-toggle-btn` (`#theme-opt-dark` / `#theme-opt-light`), class `html.dark` và màu nền card đổi đúng giữa `rgb(24, 34, 52)` và `rgb(255, 255, 255)` |
| UI12 | Mobile 320/375px và desktop | PASS — Kiểm tra `320×700`, `375×667`, `430×932` và `1440×900`: `scrollWidth <= clientWidth` (`noHorizontalOverflow = true`), link `/reports` có mặt ở cả menu mobile và sidebar, chiều cao nút lọc `40px >= 36px` |
| UI13 | Dashboard lấy đủ dữ liệu trên 8 giao dịch | PASS — Tháng `2026-11` có 10 giao dịch (danh sách gần đây `size=8` trả 8 dòng, truy vấn tháng `size=100` trả đủ 10 dòng gồm khoản thu `2000.00` ngày `2026-11-01`); Dashboard hiển thị đúng `2.000 ₫` / `508 ₫` / `1.492 ₫` và render `svg.recharts-surface` |

Bằng chứng DOM, mạng và đối chiếu SQL cho từng ca `UI01`–`UI13` được lưu trực tiếp trong `docs/qa/evidence/SE2-D10-DB_RESULTS.json`.

## 9. Fixture cho AI Assistant+ D11

Fixture không chứa tài chính thật, mật khẩu hay token. Guard chỉ cho database test có prefix phù hợp và hai owner dương khác nhau; mỗi lần chạy trên container mới.

- Hai owner A/B, category thu, Food, Transport, Unused; mặc định đăng ký cũng có danh mục chưa dùng.
- Tháng 09 và 11/2026 có thu/chi để so sánh; tháng 10 rỗng.
- Food chi nhiều nhất; Food/Transport có giá trị khác nhau.
- Tháng 09: hạn mức tổng 500.00, đã chi 350.35, còn 149.65, chưa vượt.
- Tháng 11: hạn mức tổng 400.00, đã chi 501.00, còn -101.00, exceeded=true.
- Food tháng 11: hạn mức 1000.00, đã chi 350.25, SAFE; Transport hạn mức 100.00, đã chi 150.75, OVER_BUDGET.
- Có ngày 29/02, chuyển năm, năm 1900/2100, số lẻ và tổng vượt giới hạn một giao dịch.
- Bộ 120/20000 dòng hiệu năng được harness sinh riêng, không trộn vào hai tháng AI mẫu.

Giá trị thực tế và response Budget/Reports nằm ở `aiFixture` trong JSON. Không tích hợp/gọi Gemini hoặc gửi dữ liệu tới AI.

## 10. Lỗi, hạn chế và lịch sử chuẩn bị harness

Không phát hiện lỗi nghiệp vụ/security/API ở các ca đã thực thi. Không có đề xuất migration/index mới.

- **Đã giải quyết ENV-D10-UI-01:** Mặc dù Cua inventory/Windows native pipe không khả dụng, harness đã kết nối trực tiếp Google Chrome local (`Chrome/156.0.8078.81`) qua giao thức CDP (`--headless=new --remote-debugging-port`) với thư mục `--user-data-dir` cô lập tạm thời và hoàn tất độc lập **13/13 ca Browser QA (`UI01`–`UI13` PASS)**.
- **DOC-D10-01:** SRS/proposal cũ vẫn ghi fromMonth/toMonth, 12 tháng và field cũ. D10-DB dùng contract D10 mới trong BE. Không sửa tài liệu người khác đang làm dở; nhóm cần đồng bộ riêng.
- Giới hạn JavaScript Number với tổng rất lớn vẫn áp dụng; service FE hiện dùng Number. Case tổng 19999999999999.98 đã kiểm đúng ở API/SQL.
- Thứ tự category có tổng bằng nhau chưa được contract bảo đảm; oracle so map theo ID và chỉ kiểm tổng giảm dần.
- Không chạy benchmark production, không bảo đảm tính nhất quán giữa hai HTTP request nếu có ghi xen giữa; ca concurrency ở đây chỉ có nhiều GET, không có writer đồng thời.

Các lượt chuẩn bị harness trước đó gặp lỗi oracle với ONLY_FULL_GROUP_BY, bộ lọc general_log và grant pattern escape dấu gạch dưới khi chuẩn bị fault injection. Đã sửa **chỉ harness QA**, không nới SQL mode, không sửa query Backend hay security. Báo cáo/count/evidence này tổng hợp 36 ca tự động DB/API/PERF/FE-service PASS và 13 ca Browser QA PASS ngày 09/11 (tổng 49/49 PASS). Quy tắc GROUP BY đối chiếu [MySQL manual](https://dev.mysql.com/doc/refman/8.0/en/group-by-handling.html).

## 11. Kiểm tra bàn giao và đề xuất nghiệm thu

- Nhánh DB feature/quynh; chỉ 4 file mới tại mục 2 thuộc commit D10-DB.
- Git diff --check và kiểm whitespace file mới; không stage build/log/credential.
- Không đổi các file BE/FE; hash trước/sau được harness xác nhận.
- Đề xuất nghiệm thu toàn phần `SE2-D10-DB` (**READY FOR COMMIT**, 49/49 PASS gồm 36 kiểm tra DB/API/SQL/EXPLAIN/FE-service và 13 kịch bản Browser QA `UI01`–`UI13`).
- Chỉ commit khi có lệnh riêng: `test: kiểm thử báo cáo thu chi và phân quyền dữ liệu`.
