# Kiểm thử SmartExpense 2.0 theo từng ngày

Mỗi ngày có một báo cáo chung cho **Backend (BE), Frontend (FE) và dữ liệu/QA**. Mở báo cáo của ngày cần xem thay vì ghép nhiều hồ sơ BE/DB riêng.

## Mục lục

| Ngày | Ngày trong kế hoạch | Nội dung chính | Báo cáo |
| --- | --- | --- | --- |
| D01 | 27/10/2026 | Baseline, tài liệu, dữ liệu và nền tảng giao diện | [D01](D01.md) |
| D02 | 28/10/2026 | Đăng ký/đăng nhập, JWT, phiên và lỗi API | [D02](D02.md) |
| D03 | 29/10/2026 | Quick Add, tạo/sửa/xóa và lọc giao dịch | [D03](D03.md) |
| D04 | 30/10/2026 | Calendar tháng, tổng ngày/tháng và biên ngày | [D04](D04.md) |
| D05 | 02/11/2026 | Chi tiết ngày, phân trang và rà soát Calendar API | [D05](D05.md) |
| D06 | 03/11/2026 | Icon/màu, tên danh mục trùng và migration tương thích | [D06](D06.md) |

Nguồn kế hoạch: [SRS 2.2](../SmartExpense_SRS_v2.docx), [Master Plan](../SmartExpense_QuanTriDuAn.xlsx). Quy tắc API hiện có nằm trong [API Contract](../smartexpense-2.0/API_CONTRACT.md).

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

Các lượt xác nhận thành công trên đều ghi 0 failure/error/skipped cho phần đã chạy. Gate D03 đạt 55/55 trong các lượt xác nhận; đây là tập con Backend. Lượt đầy đủ mới nhất được ghi tại [D06](D06.md). Không có lượt kiểm thử mới được thực hiện chỉ để tổ chức lại tài liệu.

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

Bộ tài liệu QA gồm mục lục này và D01–D06. Các báo cáo ngày đã tổng hợp phạm vi BE/FE/DB, baseline, kết quả, bằng chứng chính và rủi ro cần theo dõi. Xác nhận Browser UI của người dùng ngày 04/11/2026 được ghi riêng; số liệu tự động giữ đúng các lượt R01–R06.

- Browser UI D01–D06 hiện PASS theo xác nhận tự kiểm thử của người dùng. Test local và xác nhận UI không thay cho kiểm tra trạng thái VPS.
- Tên danh mục hiện được kiểm tra trùng ở Service; request đồng thời vẫn có thể tạo trùng. Chi tiết tại [D06](D06.md).
- Master Plan còn nội dung backfill metadata, trong khi API hiện hành giữ NULL và dùng fallback; cần nhóm chốt tài liệu riêng, không tự backfill.
- FR-07–FR-10 ngoài phạm vi các ca D01–D06 được mô tả ở đây; các mục chưa chạy vẫn là NOT_RUN, không được coi hoàn thành.

Việc sắp xếp tài liệu không sửa code, migration, lịch sử Git hoặc trạng thái Excel/Trello; không thay cho review và ký nghiệm thu của nhóm.
