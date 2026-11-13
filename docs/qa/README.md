# Kiểm thử SmartExpense 2.0 theo từng ngày

Mỗi ngày có một báo cáo chung cho **Backend (BE), Frontend (FE) và dữ liệu/QA**. Mở báo cáo của ngày cần xem thay vì ghép nhiều hồ sơ BE/DB riêng.

## Mục lục

### Sprint 1 — D01–D04

| Ngày | Ngày trong kế hoạch | Nội dung chính | Báo cáo |
| --- | --- | --- | --- |
| D01 | 27/10/2026 | Baseline, tài liệu, dữ liệu và nền tảng giao diện | [D01](D01.md) |
| D02 | 28/10/2026 | Đăng ký/đăng nhập, JWT, phiên và lỗi API | [D02](D02.md) |
| D03 | 29/10/2026 | Quick Add, tạo/sửa/xóa và lọc giao dịch | [D03](D03.md) |
| D04 | 30/10/2026 | Calendar tháng, tổng ngày/tháng và biên ngày | [D04](D04.md) |

### Sprint 2 — D05–D09

| Ngày | Ngày trong kế hoạch | Nội dung chính | Báo cáo |
| --- | --- | --- | --- |
| D05 | 02/11/2026 | Chi tiết ngày, phân trang và rà soát Calendar API | [D05](D05.md) |
| D06 | 03/11/2026 | Icon/màu, tên danh mục trùng và migration tương thích | [D06](D06.md) |
| D07 | 04/11/2026 | Ngân sách danh mục, API/MySQL và migration V003 | [D07](D07.md) |
| D08 | 05/11/2026 | Mẫu định kỳ, migration V004, ràng buộc DB và backup/restore | [D08](D08.md) |
| D09 | 06/11/2026 | Preview/Apply, concurrency, marker, migration V005 và Chrome | [D09](D09.md) |

### Sprint 3 — D10–D14

| Ngày | Ngày trong kế hoạch | Nội dung chính | Báo cáo |
| --- | --- | --- | --- |
| D10 | 09/11/2026 | Báo cáo đa tháng, biểu đồ và QA tích hợp | [D10](D10.md) |
| D11 | 10/11/2026 | Xuất CSV và AI Assistant+ P1 | [D11](D11.md) |
| D12 | 11/11/2026 | Auth, Password Reset, migration V006 và bảo mật | [D12](D12.md) |
| D13 | 12/11/2026 | NLU tiếng Việt, AI P2 và biểu đồ phân tích | [D13](D13.md) |
| D14 | 13/11/2026 | Gợi ý ngân sách, robot 3D và Live QA cuối | [D14](D14.md) |

**Sprint 3 hoàn thành: 15/15 task BE/FE/DB-QA.** Trên Trello, 12 task D10–D13 nằm trong danh sách Done; ba task D14 mới nằm trong danh sách Rebuild and Test và đều đã được đánh dấu complete. Ba task D14 cũ đang archived trong Backlog là lịch sử đã được thay thế, không tính vào 15 task Sprint 3. Các task Quên mật khẩu thuộc D12 đã hoàn thành và nằm trong Done. PR #49–#65 đã được đối chiếu trên GitHub; riêng D14 được hợp nhất qua PR #63–#65 và commit tích hợp cuối trên dev là ca969fa475c58583e69e71ff6e412e9abe91441f. Tài liệu này không tự thay đổi trạng thái thẻ Trello.

Nguồn kế hoạch: [SRS 2.3](../SmartExpense_SRS_v2.docx), [Master Plan](../SmartExpense_QuanTriDuAn.xlsx), [lịch Sprint 3 ngày 09–12/11/2026](../smartexpense-2.0/SPRINT_3_PLAN.md). Quy tắc API hiện có nằm trong [API Contract](../smartexpense-2.0/API_CONTRACT.md).

## Review Sprint 2 ngày 08/11/2026

Đã chạy lại trên `dev` SHA `0bee997755f760b836c7ca2af93aacd4100262e1`: **Backend 779 PASS, 0 FAIL/ERROR/SKIPPED** (27 suite, JUnit XML); **Frontend 417 PASS, 0 FAIL/SKIPPED**, lint/build PASS. Gate D03 **55/55** và Date Validation **16/16** là tập con Backend, không cộng lại. CI đúng SHA PASS cả ba job.

[Báo cáo review Sprint 2](SPRINT_2_REVIEW.md) ghi rõ nguồn bằng chứng và điều kiện trước merge main. Các failure migration/schema D07/D08 lịch sử không tái hiện trong lượt này. D08 BUG-01 Infinite Fetch Loop đã được sửa trong `7811c18`; hồ sơ Chrome D09 hiện có ghi 13/13 PASS, kèm 15 ảnh thật. Lượt review này kiểm tra lại hồ sơ, không tự thực hiện một lượt Chrome mới.

**UI D07: PASS, điều kiện QA đã đóng ngày 08/11/2026.** Người dùng xác nhận nhóm đã kiểm thử đủ CRUD/responsive/Dark Mode trên phiên bản tích hợp và đều PASS; đây là kiểm thử thủ công do người dùng xác nhận, không phải Codex/Browser Agent tự chạy. Xem phần bổ sung trong [D07](D07.md); giữ nguyên bằng chứng và số liệu tự động cũ.

**Bản sửa D06 sau review: Backend 795/795 PASS, 0 FAIL/ERROR/SKIPPED**, 27 suite/795 testcase đã kiểm tra XML; D03 gate 55/55 và Date Validation 16/16 nằm trong tổng. Khóa owner trong MySQL chặn POST/PUT ghi trùng đồng thời; test tập trung 103/103 PASS (CategoryName 35, BackendApplication 68), xem [D06](D06.md). Source đang ở working tree `dev`, base `0bee997`, chưa commit/push nên chưa có CI của patch. Frontend 417/417 là kết quả lượt baseline, không chạy lại trong bản sửa này. Workflow CD vẫn tự deploy cả push `dev` và `main`; CI PASS không thay cho phê duyệt triển khai.

## Cách đọc kết quả

- **PASS:** đạt trong đúng phạm vi đã kiểm chứng, ví dụ API/MySQL, hàm JavaScript hoặc render tĩnh.
- **FAIL:** kết quả thực tế không đạt kỳ vọng của ca kiểm thử.
- **BLOCKED:** chưa thể thực hiện do thiếu môi trường hoặc công cụ.
- **NOT_RUN:** ca chưa chạy, không được tính là PASS.
- **PARTIAL:** một phần đã đạt, vẫn còn phần chưa nghiệm thu.

Test hàm, render tĩnh (SSR), handler và memory router **không chứng minh** kết quả thao tác trên trình duyệt. Kết quả tự động và kết quả người dùng tự kiểm thử được ghi rõ nguồn riêng.

**Cập nhật Browser UI ngày 04/11/2026: PASS — người dùng xác nhận đã tự kiểm thử toàn bộ các ca UI D01–D06 và đều OK.** Nguồn xác nhận là trao đổi trực tiếp: “tôi đã tự test ok hết”. Agent không chạy lại browser trong lần cập nhật này; xác nhận không kèm phiên bản trình duyệt, ảnh chụp hoặc log mới. Không cộng xác nhận thủ công vào số test tự động R01–R06.

Ngày task là ngày theo kế hoạch; ngày thực thi là lúc bộ test thực sự chạy. Một số tính năng được triển khai/kiểm thử trước lịch, nên một lượt regression có thể bao gồm cả chức năng của ngày sau.

## Các lượt kiểm thử được dùng làm bằng chứng

Mã R01–R06 dưới đây chỉ giúp tra cứu hồ sơ. **Số test là tổng của cả lượt regression, không phải số test riêng của từng ngày. Không cộng các lượt với nhau**, không cộng lại suite con hoặc gate D03 đã nằm trong tổng Backend.

| Lượt | Ngày chạy | Baseline | Phạm vi hồ sơ | Backend | Frontend | Tổng tự động |
| --- | --- | --- | --- | ---: | ---: | ---: |
| R01 | 31/10/2026 | `8869d82` | QA D01–D02 | 286 PASS | 232 PASS | 518 PASS |
| R02 | 01/11/2026 | `292fddb` | QA D03–D04 | 298 PASS | 247 PASS | 545 PASS |
| R03 | 01/11/2026 | `477e362` | QA D05–D06 ban đầu | 314 PASS | 262 PASS | 576 PASS |
| R04 | 02/11/2026 | `7083c8d` | Bổ sung Backend D05 | 315 PASS | Không chạy riêng | Không ghép với lượt khác |
| R05 | 03/11/2026 | `c7637ab` | Bổ sung Backend D06 | 334 PASS | Không chạy riêng | Không ghép với lượt khác |
| R06 | 04/11/2026 | `568391d` | QA D06 tích hợp BE/FE | 336 PASS | 276 PASS | 612 PASS |

Các lượt xác nhận thành công trên đều ghi 0 failure/error/skipped cho phần đã chạy. Gate D03 đạt 55/55 trong các lượt xác nhận; đây là tập con Backend. Lượt đầy đủ thành công gần nhất trong bảng lịch sử được ghi tại [D06](D06.md). Không có lượt kiểm thử mới được thực hiện chỉ để tổ chức lại tài liệu.

Lượt Backend D07-BE Commit 3 ngày 04/11/2026, baseline `09d5b1c`: **409 test — 401 PASS, 8 FAIL, 0 ERROR, 0 SKIPPED**, Gate D03 55/55 PASS. Đây là kết quả lịch sử trước tích hợp DB; các lỗi migration/schema đã được xử lý, không còn tái hiện trong regression ngày 08/11 nêu trên. Chi tiết lịch sử tại [D07](D07.md); không cộng các lượt với nhau.

## Môi trường và cách chạy lại

Backend dùng JDK 21, Gradle Wrapper và MySQL 8 Testcontainers local. Test tạo database/credential tổng hợp riêng, kiểm tra đúng đích trước khi thao tác và dọn tài nguyên khi kết thúc. Test migration/backup/restore dùng container test, không dùng database ứng dụng hoặc VPS.

Từ thư mục `backend/`:

```powershell
.\gradlew.bat --offline test verifyD03IntegrationTests --console=plain
```

`--offline` yêu cầu dependency đã có trong cache. Cần Docker Engine sẵn sàng để integration test chạy đầy đủ; không coi test bị skip khi thiếu Docker là thành công.

Từ thư mục `frontend/`:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Bằng chứng tạo lại nằm trong `backend/build/test-results/test/`, `backend/build/reports/tests/test/` và log của lượt chạy. Artifact build có thể bị ghi đè khi chạy lại; không phải kho lưu trữ bất biến. Các số liệu trong báo cáo là snapshot của lượt đã ghi, không tự cập nhật theo code mới.

## Giới hạn chung

Bộ tài liệu QA gồm mục lục này và D01–D09, cùng báo cáo Date Validation và review Sprint 2. Các báo cáo ngày giữ nguyên baseline, kết quả và bằng chứng lịch sử; kết quả mới không ghi đè số liệu cũ.

- Browser UI D01–D06 hiện PASS theo xác nhận tự kiểm thử của người dùng. Test local và xác nhận UI không thay cho kiểm tra trạng thái VPS.
- Bản sửa D06 ngày 08/11 khóa owner trước kiểm tra/lưu Category qua API. Không tự gộp/xóa dữ liệu trùng cũ và không bảo đảm uniqueness cho writer SQL trực tiếp bỏ qua Service. Chi tiết tại [D06](D06.md).
- Master Plan còn nội dung backfill metadata, trong khi API hiện hành giữ NULL và dùng fallback; cần nhóm chốt tài liệu riêng, không tự backfill.
- FR-07 và FR-08 có hồ sơ riêng tại D07–D09. FR-09/FR-10 và phần mở rộng AI/Auth của Sprint 3 có hồ sơ D10–D14; phạm vi production/Gemini Live chưa được coi là PASS nếu báo cáo ngày không có bằng chứng.

Lượt cập nhật ngày 08/11 chỉ sửa tài liệu và lịch kế hoạch; không sửa code, migration, workflow, lịch sử Git hoặc trạng thái thẻ Trello. Không thay cho review và ký nghiệm thu của nhóm.
