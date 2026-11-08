# Sprint 2 — Review D05–D09 trước merge main

Ngày kiểm tra: **08/11/2026, UTC+07**. Phạm vi: nguồn thực tế, QA, CI và regression trên `dev`; chưa merge, chưa kiểm thử production trong lượt này.

## Snapshot và Git

- `dev` / `origin/dev`: `0bee997755f760b836c7ca2af93aacd4100262e1` sau fetch.
- `origin/main`: `be1160c3c2ac60fced9ff5473a6dbc0abe7b4c8f`.
- D09 tích hợp qua PR #44 (DB/QA), #45 (BE), #46 (FE). Nguồn thành viên: Quỳnh `535c9d4` (gồm báo cáo QA), Tuấn `158a475`, Trang `9b6ec63`.
- Working tree/index sạch trước kiểm tra. Author hiện tại: `ToAnhTuan1806 <toanhtuan.18dz@gmail.com>`. Không đổi author/nhánh.
- Cả 15 thẻ D05–D09 BE/FE/DB trên [Trello](https://trello.com/b/RAHIOc4b/smartexpense-personal-finance-management) ở Done, due complete. Trạng thái thẻ không thay cho bằng chứng test.
- Hai nhánh có **5 commit riêng ở main, 54 commit riêng ở dev**. Merge base `4dc77776965bdf96c381a5d582a692628293a99f`. Mô phỏng ba chiều bằng `git merge-tree` không có conflict. Phần thay đổi riêng của main nằm ở hai DOCX MVP/Proposal; cần giữ khi merge, không reset/rebase hay chép đè toàn bộ từ dev.

## Kết quả chạy mới

Java 21, Gradle Wrapper, Docker Desktop và MySQL 8 Testcontainers cô lập. Không truy cập database/VPS production. Init script ignored chỉ giới hạn hai JVM test đồng thời, không loại test hoặc đổi assertion.

| Kiểm tra | PASS | FAIL | ERROR | SKIPPED |
| --- | ---: | ---: | ---: | ---: |
| Backend đầy đủ — 27 suite, đọc JUnit XML | **779** | 0 | 0 | 0 |
| Frontend Node tests | **417** | 0 | 0 | 0 |
| D03 gate — tập con Backend | 55 | 0 | 0 | 0 |
| Date Validation — tập con Backend | 16 | 0 | 0 | 0 |

`compileJava`, `compileTestJava`, `npm.cmd run lint`, `npm.cmd run build`: **PASS**. Frontend có 0 cancelled/todo. Build còn cảnh báo bundle chunk >500 kB, không phải lỗi build.

Lệnh Backend thực tế (từ `backend/`):

```powershell
.\gradlew.bat --offline -I build/sprint2-readiness-20261108/two-forks.init.gradle --max-workers=2 cleanTest compileJava compileTestJava test verifyD03IntegrationTests --continue --no-build-cache --console=plain
```

Frontend chạy `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` từ `frontend/`, cả ba exit 0. Bằng chứng local: `backend/build/sprint2-readiness-20261108/` (log và summary); JUnit XML: `backend/build/test-results/test/`. Artifact build có thể bị ghi đè khi chạy lại.

## Đối chiếu từng task

| Task | Bằng chứng hiện tại | Đánh giá |
| --- | --- | --- |
| D05 — Calendar chi tiết ngày | TransactionDay 24, CalendarQuery 1, các suite Calendar/QA đều PASS; UI lịch sử do người dùng xác nhận ngày 04/11 | PASS trong phạm vi đã kiểm chứng |
| D06 — Category metadata/tên | Baseline: Appearance 49 + 6, Name 19, migration 6 PASS; sau sửa Name 35 PASS, full regression 795 PASS. UI lịch sử người dùng xác nhận | PASS; rủi ro API ghi đồng thời đã được sửa bằng khóa owner |
| D07 — Category Budget | API/MySQL 42, Service 23, migration 1 PASS. Người dùng xác nhận đủ UI CRUD/responsive/Dark Mode PASS ngày 08/11 | PASS tự động và UI thủ công; điều kiện UI đã đóng |
| D08 — Recurring Template | Contract 98, API 63, MySQL 65, dates 11, migration 12 PASS | PASS; BUG-01 Infinite Fetch Loop đã sửa ở `7811c18`, Chrome D09 kiểm tra không tái xuất hiện |
| D09 — Preview/Apply | Contract 31, MySQL 48, migration 25 PASS; concurrency 10 vòng, rollback, owner và marker đều được chạy | PASS tự động; hồ sơ Chrome hiện có 13/13 PASS |

Các suite là tập con của 779, không cộng thêm vào tổng. Migration thực tế: **MVP → V002 → V003 → V004 → V005 → Hibernate validate**. Không yêu cầu V001 chưa tồn tại. Các harness JPA-create cũ chỉ kiểm tra regression nghiệp vụ; không dùng làm bằng chứng migration.

D09 kiểm tra UNIQUE chống apply trùng, MySQL 1062 → 409, phân biệt FK/CHECK/NOT NULL, rollback cả transaction và marker, xóa transaction giữ marker, chặn xóa mẫu đã áp dụng, cuối tháng/năm nhuận và timezone Việt Nam. Backup/restore được chạy trong suite migration V005.

Nguồn UI: [D05](D05.md), [D06](D06.md), [D07](D07.md), [D08](D08.md), [D09](D09.md). Đã kiểm tra file `backend/build/d09-qa-commit3/browser-qa-summary.json` ghi 13 PASS và sự tồn tại 15 PNG trong `screenshots/`. Đây là bằng chứng lượt Chrome ngày 06/11 đã có, **không phải một lượt Browser Agent/Codex mới ngày 08/11**. Không suy rộng 13 ca D09 thành đầy đủ CRUD/responsive/Dark Mode của D07.

Riêng D07, người dùng trả lời **“Đã kiểm tra đủ và đều PASS”** ngày 08/11 cho toàn bộ ca CRUD/responsive/Dark Mode trên phiên bản tích hợp. Đây là xác nhận kiểm thử thủ công của nhóm, không phải Codex/Browser Agent chạy lại. Không có screenshot/log hoặc SHA thủ công bổ sung; không thay đổi số liệu tự động. Điều kiện thiếu xác nhận UI D07 đã đóng.

## Bản sửa concurrency D06 sau review

Theo yêu cầu người dùng, đã sửa Backend trên working tree `dev`, base SHA `0bee997`; chưa commit/push. `CategoryService.create/update` lấy khóa `PESSIMISTIC_WRITE` trên hàng User trước mọi SELECT Category, giữ đến commit/rollback. Các instance cùng MySQL dùng chung khóa theo owner. Không cần sửa schema, dữ liệu cũ hoặc Frontend; endpoint/DTO/ApiError và quy tắc so sánh tên giữ nguyên.

Kiểm thử tập trung **103/103 PASS**, gồm 35 CategoryName và 68 BackendApplication. Trong đó POST–POST, PUT–PUT và POST–PUT mỗi nhóm lặp 5 lần: chỉ một request thành công, request còn lại 409, không ghi trùng và PUT thất bại giữ nguyên dữ liệu. Hai ca khác owner/type cùng thành công. Chi tiết và JUnit tại [D06](D06.md), `backend/build/d06-concurrency-fix-20261108/`.

Full regression bản sửa đã hoàn tất: **795 PASS, 0 FAIL, 0 ERROR, 0 SKIPPED** (27 suite, đối chiếu đủ 795 testcase trong XML), Gradle **BUILD SUCCESSFUL** trong 6m36s; compileJava/compileTestJava và D03 gate **55/55 PASS**. Date Validation **16/16**, D07 API/MySQL **42/42**, D08 MySQL/migration **65/65 + 12/12**, D09 MySQL/migration **48/48 + 25/25** đều PASS và nằm trong tổng 795. Lệnh chạy giống lượt baseline ở trên, thay thư mục log thành `backend/build/d06-concurrency-fix-20261108/`. Không skip test. Có lưu `regression-junit.zip`, `regression-summary.json` và diff/hash của bốn file source đã kiểm thử.

Frontend không sửa/chạy lại trong bản sửa Backend này; **417 PASS** là bằng chứng lượt baseline trước đó. CI của patch chưa có vì chưa commit/push; CI xanh của base SHA không xác nhận patch mới. SQL trực tiếp bỏ qua CategoryService không được bảo vệ bởi khóa API này; bản sửa không thêm UNIQUE hoặc tự gộp/xóa duplicate legacy.

## CI và điều kiện phát hành

[CI run 42233796897](https://github.com/ToAnhTuan1806/personal-finance-management/actions/runs/42233796897) đúng SHA `0bee997…`: **Frontend Lint & Build, Backend Test & Build, Docker Packaging Check đều SUCCESS**. [CD run 42233796857](https://github.com/ToAnhTuan1806/personal-finance-management/actions/runs/42233796857) cũng SUCCESS; trạng thái pipeline không chứng minh nghiệm thu production.

Workflow hiện tại `.github/workflows/cd.yml` nhận push cả **dev và main**. Deploy chỉ phụ thuộc job build-and-push của CD, chưa chờ CI workflow và dùng image tag `latest`. Vì vậy merge vào main có thể kích hoạt triển khai ngay. Công việc CI/CD gate và pin SHA nằm trong kế hoạch Sprint 3 D13-DB; báo cáo này không thay đổi workflow.

**Kết luận: Bản sửa D06 READY FOR REVIEW; D07 đã ACCEPTED về chức năng; CONDITIONAL PASS cho việc chuẩn bị merge dev → main.** Điều kiện UI D07 đã đóng; rủi ro API concurrency D06 đã được sửa, test tập trung 103/103 và full regression 795/795 PASS. Trước thao tác merge/deploy vẫn cần:

1. Review patch D06 và yêu cầu CI đúng SHA mới sau khi bản sửa được duyệt/commit/push. Full regression local đã PASS; CI xanh của base SHA không xác nhận source đã sửa trong working tree.
2. Review đúng SHA/diff của PR dev → main, giữ hai tài liệu riêng của main và chạy lại required checks nếu head/merge result thay đổi.
3. Phê duyệt riêng tác động tự deploy của workflow hiện tại, chuẩn bị backup/rollback và xác nhận schema môi trường đích có V002–V005. Chưa kiểm tra các điều kiện production trong lượt này.

Không tự merge, stage, commit, push, deploy hoặc cập nhật trạng thái Trello. Các tài liệu sửa sau lượt test chỉ điều chỉnh báo cáo/lịch, không thay đổi mã đã kiểm thử.
