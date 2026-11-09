# SE2-D10-BE — API báo cáo thu chi đa tháng

TASK: SE2-D10-BE

BRANCH: feature/tuan

STATUS: READY FOR REVIEW

Ngày thực hiện: **08/11/2026, UTC+07**. Hạn task: **09/11/2026**. Chưa commit/push/PR/merge/deploy.

## 1. File tạo hoặc sửa, đồng thời là danh sách dự kiến commit

| File | Thay đổi |
| --- | --- |
| `backend/src/main/java/com/smartexpense/backend/controller/ReportController.java` | Thêm GET Reports, lấy owner từ JWT |
| `backend/src/main/java/com/smartexpense/backend/service/ReportService.java` | Validation, ghép tổng theo tháng và danh mục trong transaction readOnly |
| `backend/src/main/java/com/smartexpense/backend/dto/report/MonthlyReportResponse.java` | DTO from/to/months/expensesByCategory |
| `backend/src/main/java/com/smartexpense/backend/dto/report/MonthlySummaryResponse.java` | DTO month/totalIncome/totalExpense/balance |
| `backend/src/main/java/com/smartexpense/backend/repository/TransactionRepository.java` | Thêm một JPQL projection tổng theo năm/tháng/loại |
| `backend/src/test/java/com/smartexpense/backend/ReportApiTests.java` | 33 testcase HTTP/JSON/JWT, mock repository |
| `backend/src/test/java/com/smartexpense/backend/ReportIntegrationTests.java` | 9 testcase HTTP/JPQL/MySQL/SQL/Dashboard thật |
| `docs/smartexpense-2.0/API_CONTRACT.md` | Ghi hợp đồng D10 hiện tại, tách đề xuất chưa triển khai |
| `docs/qa/SE2-D10-BE_REPORT.md` | Báo cáo và bằng chứng kiểm thử |

Các thay đổi đã có trước phiên làm việc ở `README.md`, SRS, Master Plan, `docs/qa/README.md`, `SPRINT_3_PLAN.md` được giữ nguyên và không thuộc danh sách D10-BE trên.

## 2. API và response được kiểm tra qua HTTP

`GET /api/reports/monthly?from=YYYY-MM&to=YYYY-MM`, header `Authorization: Bearer <ACCESS_TOKEN>`.

Schema response 200 được test qua MockMvc, Jackson và service thật:

```text
{
  from: string YYYY-MM,
  to: string YYYY-MM,
  months: [{month: string YYYY-MM, totalIncome: number, totalExpense: number, balance: number}],
  expensesByCategory: [{categoryId: number, categoryName: string, totalAmount: number}]
}
```

Kết quả giá trị đã đối chiếu qua HTTP/MySQL trong `fillsEmptyMiddleMonthAndAggregatesCategoriesAcrossWholeRange`, request `from=2026-09&to=2026-11`:

| month | totalIncome | totalExpense | balance |
| --- | ---: | ---: | ---: |
| 2026-09 | 100.10 | 20.05 | 80.05 |
| 2026-10 | 0 | 0 | 0 |
| 2026-11 | 0 | 30.15 | -30.15 |

`expensesByCategory` có một danh mục, `totalAmount=50.20`. ID tự sinh trong database test. Đây là dữ liệu tổng hợp dùng kiểm thử, không phải dữ liệu tài khoản thực. Giao dịch trước 01/09 và từ 01/12 không nằm trong báo cáo.

## 3. Validation và bảo vệ dữ liệu

- Bắt buộc cả `from`, `to`, đúng YYYY-MM và năm 1900–2100; khoảng inclusive 1–6 tháng. Thiếu/rỗng/sai định dạng, đảo khoảng hoặc hơn 6 tháng trả 400 VALIDATION_ERROR trước khi truy vấn repository.
- Owner lấy duy nhất từ subject của JWT đã xác thực; query `userId` không thay owner. JWT thiếu/sai/hết hạn/subject không hợp lệ trả 401 UNAUTHORIZED. Dùng nguyên Security/JWT/ApiError hiện có.
- Hai query tổng hợp có điều kiện owner và `[startDate,endExclusive)`. Query tháng nhóm YEAR/MONTH/type; query danh mục tái sử dụng từ Dashboard, nhóm categoryId/name và sort tổng chi giảm dần.
- Service `@Transactional(readOnly = true)`. BigDecimal cho mọi số tiền; không double/float hoặc làm tròn trung gian. Mọi tháng được trả theo ASC; tháng trống có tổng 0, không chi tiêu có danh sách danh mục rỗng.

## 4. Kết quả kiểm thử

Lệnh chạy trong `backend/`:

```powershell
.\gradlew.bat test --tests '*Report*Tests' --console=plain
.\gradlew.bat test build verifyD03IntegrationTests --console=plain
```

| Kiểm tra | Kết quả |
| --- | --- |
| ReportApiTests | PASS: 33 tests, 0 failure/error/skipped |
| ReportIntegrationTests, MySQL 8 trong Testcontainers local | PASS: 9 tests, 0 failure/error/skipped |
| Toàn bộ Backend test | PASS: 837 tests / 29 suites, 0 failure/error/skipped, đối chiếu JUnit XML |
| Backend build | PASS: `bootJar`, `jar`, `assemble`, `check`, `build`; toàn lệnh hoàn tất trong 8 phút 53 giây |
| Gate verifyD03IntegrationTests | PASS: executed=55, skipped=0, failures=0, errors=0; gate tự xác minh JUnit XML |
| Kiểm tra diff | PASS: `git diff --check`; file mới không có trailing whitespace |

JUnit XML: `backend/build/test-results/test/TEST-com.smartexpense.backend.ReportApiTests.xml` và `TEST-com.smartexpense.backend.ReportIntegrationTests.xml`. Báo cáo HTML: `backend/build/reports/tests/test/index.html`. Build artifacts là dữ liệu local, không đưa vào commit.

| Yêu cầu D10 | Bằng chứng test |
| --- | --- |
| Một tháng có thu và chi; nhiều giao dịch cùng danh mục | `aggregatesMonthAndCategoriesByIdAndMatchesDashboardAndSql` |
| 3 tháng, tháng giữa rỗng, danh mục toàn khoảng | `fillsEmptyMiddleMonthAndAggregatesCategoriesAcrossWholeRange` |
| Đúng 6 tháng, dữ liệu trên 100 giao dịch | `sixMonthsUseOnlyTwoSelectsWithoutLoadingTransactionEntities`: 120 giao dịch, 2 SELECT, 0 Entity load |
| Trên 6 tháng, đảo khoảng, thiếu/sai query | 23 biến thể `rejectsInvalidOrMissingPeriodBeforeQuerying` |
| Tháng rỗng hoàn toàn | `emptyRangeReturnsZeroForEveryMonthAndNoCategories` |
| Tháng 12 qua tháng 1, ranh giới 1900/2100 | 3 biến thể `includesBothBoundariesAndExcludesAdjacentMonths` |
| Hai owner và userId giả | `jwtOwnerCannotBeOverriddenByClientUserId` với JWT của cả hai user |
| JWT thiếu/sai/hết hạn/subject sai | 4 biến thể `rejectsUnauthenticatedRequestsBeforeQuerying`, qua decoder thật |
| Khớp Dashboard và SQL độc lập | `assertMatchesDashboardAndSql` trong các test dữ liệu MySQL |
| Số lẻ và tổng vượt giới hạn một giao dịch | `keepsCentsAndAggregatesBeyondSingleTransactionLimit` |

MySQL dùng helper cô lập có sẵn, kiểm metadata trước khi ghi, rollback dữ liệu từng test và hủy container sau lớp test. Không dùng DB ứng dụng hoặc production. Docker đã được kiểm tra bằng quyền thực thi phù hợp; không bỏ qua test vì thiếu Docker. Sau lượt chạy, `docker ps --filter label=com.smartexpense.test` không còn container test đang chạy.

## 5. Ảnh hưởng API cũ

Chỉ thêm endpoint, DTO/service và repository method mới. Tái sử dụng nguyên `sumExpensesByCategory`; các query Dashboard/Transactions/Calendar đang dùng không đổi. Không sửa Auth, Recurring, Budget CRUD, schema, dependency, cấu hình môi trường hoặc hạ tầng.

## 6. Chuẩn bị cho AI D11

`ReportService.getMonthlyReport(userId, from, to)` và hai DTO cung cấp tổng thu/chi/chênh lệch từng tháng, tổng chi danh mục và tháng trống. Backend D11 có thể dùng dữ liệu này để so sánh tháng sau khi xác định owner từ JWT ở luồng gọi. D10 chưa tích hợp Chat/Gemini; dữ liệu ngân sách và công thức phần trăm cần phối hợp D11 theo phạm vi riêng.

## 7. Vấn đề còn tồn tại

- SRS/API đề xuất cũ dùng fromMonth/toMonth, giới hạn 12 tháng, income/expense và categoryShare. D10 thực hiện yêu cầu mới được người dùng cung cấp: from/to, 1–6 tháng, totalIncome/totalExpense và expensesByCategory. API Contract đã ghi rõ; SRS đang có thay đổi chưa commit được giữ nguyên. Cần nhóm đồng bộ SRS và FE xác nhận tích hợp, không coi test Backend là nghiệm thu FE.
- Không bảo đảm thứ tự danh mục có tổng bằng nhau; hợp đồng D10 yêu cầu tổng chi giảm dần, không yêu cầu tie-break. Endpoint `/reports/categories` riêng và categoryShare vẫn chưa triển khai.
- Test số lượng query không phải benchmark tải lớn/EXPLAIN hoặc bằng chứng hiệu năng production; phần QA hiệu năng/index thuộc D10-DB.

## 8. Bàn giao

Danh sách file tại mục 1 là phạm vi D10-BE dự kiến commit. Chờ review và lệnh riêng của người dùng; không tự stage/commit/push/PR/merge/deploy. Thông điệp commit khi được yêu cầu: `feat: thêm API báo cáo thu chi đa tháng`.
