# D05-BE — Rà soát Calendar API và tài liệu yêu cầu

Ngày **02/11/2026**, nhánh `feature/tuan`, baseline `7083c8d`, target `dev`. Phạm vi: FR-04/FR-05, không viết lại tính năng đã merge. Đối chiếu [SRS 2.2](../SmartExpense_SRS_v2.docx), task `SE2-D05-BE` trong [Master Plan](../SmartExpense_QuanTriDuAn.xlsx), [API Contract](../smartexpense-2.0/API_CONTRACT.md), [QA D03–D04](D03_D04.md) và [QA D05–D06](D05_D06.md).

## Phần đã rà soát

- `CalendarController`, `CalendarService`, `CalendarMonthResponse`, `CalendarDayResponse`.
- `DashboardController`/`DashboardService`, `TransactionController`/`TransactionService`, `TransactionRepository`, entity `Transaction`.
- SecurityFilterChain/JWT và ApiError/GlobalExceptionHandler để đối chiếu owner, xác thực và HTTP error.
- `CalendarServiceTests`, `CalendarIntegrationTests`, `CalendarQueryIntegrationTests`, `TransactionDayIntegrationTests`, `QaTransactionCalendarIntegrationTests`, phần Calendar/CRUD của `QaDayCategoryIntegrationTests`, cùng cơ chế MySQL test cô lập.

Kết luận từ code: tổng hợp theo `user_id`, `transaction_date`, `type` tại DB, không gọi tìm kiếm phân trang để tính tổng. Dùng một projection query trong khoảng nửa mở `[đầu tháng, đầu tháng sau)`; trả tối đa 62 nhóm ngày/loại thay vì tải từng Transaction/category. Service bổ sung ngày trống, tạo thứ tự ngày tăng dần và cộng tổng tháng từ cùng dữ liệu ngày. DATE/LocalDate, DECIMAL(15,2) và BigDecimal không có bước đổi sang floating point hay làm tròn trung gian trong luồng Calendar.

Chủ sở hữu lấy từ JWT subject, không lấy `userId` client. Validation kỳ chặn trước repository. Index `(user_id, transaction_date)` đã có trên entity. Không thấy bug hoặc vấn đề đọc dư/N+1 rõ ràng cần đổi code nghiệp vụ, query hay schema trong D05-BE này.

`CalendarQueryIntegrationTests` đã chạy lại thành công trên MySQL **8.0.46**: 90.000 giao dịch/3 owner/3 tháng; kỳ được chọn có 10.000 dòng, trả 62 nhóm và API chỉ gọi **một SELECT tổng hợp**. EXPLAIN SQL Hibernate thật chọn `idx_transactions_user_date`, access `range`, estimated rows 21.374; Extra `Using index condition; Using temporary; Using filesort`. Sau 2 warmup, 5 mẫu query có min/median/max **10.321/10.792/11.037 ms**. Đây là benchmark local trong điều kiện test, không là SLA hoặc số đo VPS; không có bằng chứng cần thêm index hay đổi query trong lượt này. Kiểm tra trên schema test không thay cho xác minh index của database production.

## Coverage hiện có và bổ sung

| Yêu cầu | Bằng chứng test hiện có | Quyết định |
| --- | --- | --- |
| Tháng rỗng, đủ ngày và tổng 0 | `emptyMonthStillReturnsAllDaysAndZeroTotals`, QA Calendar nhiều kỳ | Không thêm test trùng |
| Nhiều Thu/Chi và nhiều danh mục trong một ngày | `aggregatesMultipleTransactionsAndMatchesSqlAndDashboard` | Không thêm test trùng |
| Dữ liệu vượt trang Transaction | `filtersPagingAndCalendarUseAllCommittedRowsWithoutMixingOwners` (27 dòng/3 trang), query test 10.000 dòng/kỳ | Không thêm test trùng |
| JWT và tách owner | `eachJwtOnlySeesItsOwnDataAndIgnoresClientUserId`, test thiếu/sai JWT, QA HTTP hai tài khoản | Không đổi auth hoặc bổ sung test tương tự |
| Tổng Calendar khớp SQL/Dashboard | Helper SQL độc lập của Calendar integration và QA HTTP | Tái sử dụng phép đối chiếu trong test mới |
| Cuối tháng/năm, năm nhuận thế kỷ, timezone | `includesLastDayAndExcludesAdjacentMonths`, `datesRemainStableAcrossTimeZones`, QA 6 kỳ | Không thêm lại ca dữ liệu tĩnh |
| Tiền lẻ và tổng vượt giới hạn một giao dịch | `preservesCentsAndAllowsAggregateLargerThanOneTransactionLimit` | Không thêm test trùng |
| CRUD và chuyển tháng | Test CRUD cùng tháng; QA D05 chuyển 31/10 sang 01/11 và kiểm tra từng ngày | Bổ sung đúng khoảng trống bên dưới |

**Một test mới:** `CalendarIntegrationTests.movingOnlyTransactionAcrossYearKeepsBothMonthsConsistent`.

- Tạo giao dịch Chi 0.30 ngày 31/12/2026 qua Transaction API; tháng 01/2027 đã có Thu 100.10 và Chi 20.20.
- Đọc hai lịch trước sửa để có dữ liệu gốc; đối chiếu từng ngày và tổng tháng với SQL độc lập/Dashboard.
- PUT giữ nguyên ID/loại/số tiền, chỉ chuyển ngày sang 01/01/2027. Flush/clear EntityManager trước khi đọc lại.
- Xác minh tháng 12 chuyển thành tháng rỗng: đủ 31 ngày, từng ngày và tổng tháng đều 0. Tháng 1 giữ Thu 100.10 và cộng Chi thành 20.50.
- Đối chiếu lại cả hai kỳ với SQL/Dashboard và danh sách Transaction theo tháng: tháng nguồn 0 bản ghi, tháng đích 3, không nhân bản khi PUT.

Giá trị bổ sung là kiểm chứng sự thay đổi của **hai tổng tháng qua ranh giới năm khi tháng nguồn trở thành rỗng và tháng đích có dữ liệu sẵn**. Không thêm lại bộ test paging, owner hoặc năm nhuận chỉ để tăng số lượng. Test dùng nguyên MySQL Testcontainers/guard/rollback của lớp hiện có, không nhận URL hoặc credential ứng dụng.

## Tài liệu cập nhật và điểm lệch lịch sử

Mở rộng ngay mục Calendar của API Contract: request GET/JWT, bảng year/month, khoảng ngày và công thức INCOME/EXPENSE, JSON đầy đủ cho tháng có dữ liệu và tháng rỗng, validation/HTTP error và hướng dẫn refetch hai kỳ khi đổi ngày. Giữ nguyên endpoint, field, JSON number, miền validation và cơ chế auth.

Người dùng cung cấp bối cảnh D01–D06 đã merge và nghiệm thu tổng thể. API Contract ngày 30/10 còn ghi chờ FE; QA D05–D06 ngày 01/11 còn ghi browser BLOCKED/PARTIAL; Master Plan còn trạng thái kế hoạch `Chưa làm`. Đây là ghi chép khác thời điểm, không dùng để phủ nhận thông tin nghiệm thu người dùng cung cấp. Giữ nguyên hồ sơ cũ và trạng thái lịch sử, không ký thay FE/QA hoặc sửa Master Plan trong lượt D05-BE.

## Kiểm thử ngày 02/11/2026

- Java **21.0.10**, Docker Engine **29.9.2**, MySQL **8.0.46**, Gradle Wrapper hiện có; không thêm dependency.
- Đã chạy `cd backend` rồi `.\gradlew.bat test`, cả trước và sau chỉnh sửa. Các lượt đầu thiếu Docker Engine nên chỉ có 77 test PASS và các suite MySQL lỗi khởi tạo/bị skip. Sau khi người dùng mở Docker Desktop, đã chạy lại regression thành công; lỗi môi trường ban đầu đã được giải quyết.
- Lệnh xác nhận cuối: `.\gradlew.bat --offline test verifyD03IntegrationTests --console=plain` → **BUILD SUCCESSFUL**, exit code **0**, thời gian **4m 36s**. Một phiên theo dõi trước đó bị ngắt nên không dùng để kết luận; lượt xác nhận cuối lưu stdout trong build và đối chiếu XML mới.
- Chỉ chạy MySQL Testcontainers local, có guard xác minh catalog/URL và credential test ngẫu nhiên; không dùng `.env`, MySQL ứng dụng hoặc production. Không đổi cấu hình Docker. Sau bộ test, `docker ps -a --filter label=com.smartexpense.test` không còn container test.
- Bằng chứng: `backend/build/d05-be-regression.log`, `backend/build/test-results/test/TEST-*.xml`, `backend/build/reports/tests/test/index.html`; số đo query trong XML của `CalendarQueryIntegrationTests`. Không commit report build hoặc credential test.
- Bốn JSON mẫu trong phần Calendar đều parse thành công; hai response tháng có đúng 28 ngày tăng dần, cộng bằng decimal cho kết quả khớp tổng tháng. Đây là kiểm tra nội dung mẫu, không thay cho HTTP integration test.
- `git diff --check`: PASS.

| Phạm vi của lượt xác nhận cuối | Kết quả |
| --- | --- |
| Backend toàn bộ, đối chiếu 14 JUnit XML suite | **315 PASS**, 0 failure, 0 error, 0 skipped |
| Calendar integration | **33 PASS**, gồm một test mới chuyển giao dịch qua năm |
| Calendar service / query integration | **8 PASS / 1 PASS**, gồm truy vấn trên 90.000 dòng |
| Gate D03 | **55 PASS**, 0 skipped; task kiểm tra từng testcase trong XML thành công |
| Test mới `movingOnlyTransactionAcrossYearKeepsBothMonthsConsistent` | **PASS**, không failure/error/skipped |

Baseline lịch sử là **314 Backend PASS**, lượt này **315 = 314 test cũ + 1 test mới**. Các con số Calendar/gate là tập con của 315, không cộng lặp. Regression Backend toàn bộ **PASS**; không phát hiện regression nghiệp vụ mới và không thay code sản phẩm để làm test đạt.

## File thay đổi và điều kiện commit

1. `backend/src/test/java/com/smartexpense/backend/CalendarIntegrationTests.java`: một regression test mới, giữ nguyên các test cũ.
2. `docs/smartexpense-2.0/API_CONTRACT.md`: làm rõ tài liệu Calendar hiện có.
3. `docs/qa/D05_BE.md`: hồ sơ rà soát, mapping coverage và kết quả/giới hạn kiểm thử.

Thay đổi có nội dung thực chất, regression đầy đủ và gate D03 đã PASS. **Đủ điều kiện kỹ thuật để đề nghị commit sau khi người dùng review**, không còn chặn do môi trường kiểm thử. Đây là xác nhận Backend D05-BE; không tự ký nghiệm thu Frontend/browser hoặc thay đổi trạng thái tài liệu quản trị dự án.

Commit đề xuất sau kiểm thử và người dùng review: `test: Bổ sung kiểm thử Calendar API`. Chưa stage/commit/push/merge, không đổi nhánh hoặc ngày commit. Không sửa Frontend, code nghiệp vụ, schema, Docker/CI/CD/VPS, `.env`, Git stash, `AGENTS.md` hoặc `docs/CODEX_PROJECT_CONTEXT.md` local.
