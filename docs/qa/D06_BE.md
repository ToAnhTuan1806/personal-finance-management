# D06-BE — Validation tên danh mục

Ngày **03/11/2026**, nhánh `feature/tuan`, baseline `c7637ab`. Đây là yêu cầu bổ sung sau phần icon/color D06 đã có; đối chiếu [SRS 2.2](../SmartExpense_SRS_v2.docx), task `SE2-D06-BE` trong [Master Plan](../SmartExpense_QuanTriDuAn.xlsx), [API Contract](../smartexpense-2.0/API_CONTRACT.md) và code thực tế. Không sửa lịch sử hay trạng thái kế hoạch để thay cho review.

## Rà soát và thay đổi

- Đã đọc `Category`, `CategoryRepository`, `CategoryService`, `CategoryController`, `CategoryRequest`, `GlobalExceptionHandler`, `ApiError` và các test Category/Auth/metadata liên quan.
- Trước thay đổi, Service đã trim tên khi ghi nhưng cho phép tên trùng. Entity không khai báo unique tên; API Contract ngày 30/10 cũng ghi chưa cam kết 409 cho tên trùng. Yêu cầu mới ngày 03/11 cho phép bổ sung validation này; tài liệu được cập nhật có ghi rõ thời điểm và phạm vi.
- Thêm query `existsByUserIdAndTypeAndNameIgnoreCase` cho CREATE và `existsByUserIdAndTypeAndNameIgnoreCaseAndIdNot` cho UPDATE. Spring Data truy cập `user.id`, so sánh type, dùng IgnoreCase cho name; UPDATE loại trừ ID hiện tại.
- Service trim tên một lần trước khi kiểm tra/lưu. Tên lưu giữ nguyên cách viết hoa/thường sau trim, không gộp khoảng trắng ở giữa. Giữ nguyên NotBlank/Size hiện có trên request, không bổ sung chuẩn hóa dấu tiếng Việt hoặc thay collation DB.
- Trùng tên cùng user/type trả `ResponseStatusException(HttpStatus.CONFLICT, ...)`, được handler hiện có chuyển thành ApiError. Không thêm exception class, field hoặc mã lỗi mới.
- UPDATE xác minh owner và giữ guard đổi type khi có giao dịch như trước, kiểm tra trùng theo type đích **trước khi mutate Entity**. ID/owner/createdAt được giữ; icon/color vẫn phân biệt thiếu/null/giá trị theo cơ chế D06 hiện có. Rejection 409 không lưu một phần metadata.
- Khác user hoặc khác INCOME/EXPENSE được trùng tên. Không tự xử lý các dòng trùng đã có từ trước; bản ghi cũ có một danh mục khác trùng vẫn bị 409 khi update cho tới khi dùng tên hợp lệ hoặc xử lý dữ liệu riêng.
- Không cần sửa Entity/Controller/DTO/exception handler. Không thêm UNIQUE constraint, migration hoặc dependency.

## Coverage mới

`CategoryNameIntegrationTests`: **19 invocation** qua MockMvc với JWT, Service, Repository và MySQL thật. Từng request commit/rollback độc lập, không bọc cả test trong một transaction. Dùng MySQL Testcontainers/guard DataSource có sẵn; fixture chỉ gồm user tổng hợp trong database tạm, dọn sau mỗi ca.

| Nhóm | Số ca | Expected |
| --- | --- | --- |
| CREATE trùng chính xác/hoa thường/space/tab-newline đầu cuối | 4 | 409 đúng ApiError, không thêm dòng, giữ metadata gốc; CREATE đầu trim tên đúng |
| CREATE cùng tên khác loại | 1 | 201, cùng owner có INCOME và EXPENSE cùng tên |
| CREATE cùng tên khác user và giả mạo userId | 1 | 201, owner chỉ theo JWT, không sửa dữ liệu user kia |
| Khoảng trắng ở giữa tên | 1 | Giữ hai tên khác nhau, chỉ trim đầu/cuối |
| UPDATE thành tên của danh mục khác (4 biến thể) | 4 | 409, không đổi cả hai dòng hoặc metadata/createdAt |
| UPDATE chính bản ghi (giữ tên/đổi hoa thường/trim) | 3 | 200, không tự báo trùng, giữ ID/owner/createdAt/icon/color bị bỏ qua |
| UPDATE tên tồn tại ở loại khác | 1 | 200, kiểm tra chỉ trong type đích |
| UPDATE tên tồn tại ở user khác | 1 | 200, không sửa dữ liệu user kia |
| UPDATE đổi type thành khóa tên đã tồn tại | 1 | 409 dù tên không đổi; type và metadata cũ còn nguyên |
| UPDATE chính bản ghi nhưng còn dòng trùng legacy khác | 1 | 409, không chỉ bỏ kiểm tra vì tên không đổi |
| Hai POST cùng qua precheck | 1 | Characterization: cả hai có thể 201, SQL xác nhận 2 dòng trùng; xem giới hạn bên dưới |

## Request đồng thời và giới hạn

**Service precheck chưa bảo đảm uniqueness khi ghi đồng thời.** Ca race dùng `StatementInspector` riêng của lớp test để chặn ngay trước hai INSERT cho tới khi cả hai request đã hoàn tất kiểm tra tên. Không mock Repository, không thay SQL/tham số/kết quả SELECT và không dùng sleep phụ thuộc tốc độ máy. Hai request chạy trong hai transaction thật; cả hai trả **201**, SQL độc lập xác nhận **2 dòng** cùng user/type/name.

Đây là test ghi nhận giới hạn hiện tại, không coi việc tạo trùng đồng thời là yêu cầu mong muốn. UPDATE cũng có cửa sổ giữa SELECT và ghi nên không được cam kết chống trùng tuyệt đối. Transaction `@Transactional` hiện có không tự làm cho kiểm tra và ghi trở thành một unique constraint.

Chưa thêm migration, lock hay đổi isolation. Để bảo đảm khi ghi đồng thời, nhóm cần duyệt phương án riêng, gồm quy tắc chuẩn hóa/collation, khảo sát và xử lý trùng cũ, ràng buộc unique hoặc cơ chế serialize phù hợp. Không tự gộp/xóa danh mục có liên kết tài chính. Khi có bảo đảm mới, sửa ca characterization thành kỳ vọng một thành công và request trùng bị 409 theo thiết kế được duyệt.

`IgnoreCase` thực thi tại MySQL theo collation hiện có; lượt này không thiết lập quy tắc phân biệt dấu tiếng Việt/collation mới. Không suy ra rằng đã giải quyết mọi biến thể Unicode chỉ từ các test hoa thường/trim.

## Response 409 và tương thích

POST hoặc PUT tên đã có cùng JWT owner/type:

```json
{"status":409,"code":"CONFLICT","message":"Tên danh mục đã tồn tại với loại này"}
```

Giữ nguyên endpoint POST/PUT, CategoryInput/CategoryResponse, status thành công 201/200 và ApiError D02; không thêm `errors.name`, code hoặc envelope mới. Quy tắc 404 owner, guard type đang có giao dịch, default catalog, metadata thiếu/null và fallback giữ nguyên. **Validation 409 cho tên trùng là thay đổi hành vi được người dùng yêu cầu**, đã cập nhật bảng lỗi và mục quy tắc trong API Contract; không tuyên bố client tạo tên trùng vẫn nhận 201 như trước. Frontend không thay đổi trong lượt này.

## Kiểm thử và kết quả

- Docker Engine ban đầu chưa chạy; người dùng mở Docker Desktop trước khi chạy integration tests. Chỉ dùng socket Docker local và MySQL test cô lập, không dùng `.env` hoặc database ứng dụng/production.
- Chạy riêng: `.\gradlew.bat --offline test --tests com.smartexpense.backend.CategoryNameIntegrationTests --console=plain` → **19 PASS**, 0 failure/error/skipped, BUILD SUCCESSFUL, **44s**.
- Regression toàn bộ: `.\gradlew.bat --offline test verifyD03IntegrationTests --console=plain` → **BUILD SUCCESSFUL**, exit code **0**, thời gian **4m 59s**.
- Đối chiếu **15 JUnit XML suite: 334 PASS, 0 failure, 0 error, 0 skipped**. Bao gồm **315 test cũ + 19 test mới**, không cộng lặp lượt chạy riêng.
- `CategoryNameIntegrationTests`: **19 PASS** trong lượt regression, gồm ca đồng thời SQL xác nhận 2 dòng trùng. Các ca icon/color cũ (`CategoryAppearanceIntegrationTests` 49, `CategoryAppearanceTests` 6), đăng ký/default catalog, ownership, Transaction/Calendar và QA đều PASS.
- Gate D03: **55 PASS**, 0 skipped/failure/error; task đã kiểm tra từng testcase XML. `D06MigrationIntegrationTests` cũ **5 PASS** chỉ trên fixture/container test; không thực thi migration với database ứng dụng hoặc production.
- Sau bộ test, `docker ps -a --filter label=com.smartexpense.test` không còn container test.
- `git diff --check`: PASS.
- Bằng chứng trong `backend/build`: `d06-category-name-targeted.log`, `d06-category-name-regression.log`, `test-results/test/TEST-*.xml`, `reports/tests/test/index.html`. Lượt chạy riêng sẽ được thay bằng report regression khi chạy toàn bộ; không cộng lặp 19 test mới vào tổng hai lần. Không commit artifact build hoặc credential.

## File thay đổi và review

1. `backend/src/main/java/com/smartexpense/backend/repository/CategoryRepository.java`: hai query exists.
2. `backend/src/main/java/com/smartexpense/backend/service/CategoryService.java`: precheck CREATE/UPDATE và lỗi 409.
3. `backend/src/test/java/com/smartexpense/backend/CategoryNameIntegrationTests.java`: 19 integration test invocation, gồm characterization race.
4. `docs/smartexpense-2.0/API_CONTRACT.md`: ghi quy tắc validation mới và giới hạn đồng thời.
5. `docs/qa/D06_BE.md`: hồ sơ D06-BE bổ sung.

Thay đổi đã qua regression đầy đủ, sẵn sàng người dùng review và xem xét commit trong phạm vi **Service precheck** đã yêu cầu. Không tuyên bố đã bảo đảm uniqueness khi ghi đồng thời; giới hạn này đã được kiểm chứng và ghi trong API Contract. Không sửa Frontend, Entity/schema, migration V002, cấu hình Docker/CI/CD/VPS, file local không liên quan, Git stash hoặc lịch sử Git. Không chạy migration production. Chưa stage/commit/push/merge.

Commit đề xuất: `feat: Bổ sung validation chặn trùng tên danh mục`.
