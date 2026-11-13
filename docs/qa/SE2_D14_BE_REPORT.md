# SE2-D14-BE — Gợi ý ngân sách thông minh và xử lý lỗi AI

Ngày chuẩn bị: **12/11/2026 (UTC+07)**. Trạng thái: **READY FOR REVIEW**.

## Phạm vi và kiểm tra trước khi code

- Worktree: `F:\RikkeiEdu\personal-finance-management`; branch `feature/tuan`, target `dev`.
- HEAD đầu nhiệm vụ và `origin/dev`: `1fd0f3a809c329de38d41f9c1b9e07d2c3f73d8f`, ahead/behind `0/0`. Đã đối chiếu SHA trực tiếp bằng `git ls-remote origin refs/heads/dev` qua OpenSSL; lần dùng Schannel ban đầu không truy cập được credential của Windows.
- Working tree ban đầu sạch, không có unmerged paths. Git author đã cấu hình là `ToAnhTuan1806`, có email; không sửa cấu hình Git.
- Giữ nguyên hai stash: WIP trước D13 trên `feature/tuan`, cấu hình Backend local trên `feature/trang`. Không apply/pop/drop stash.
- Đã đọc AGENTS, context handoff, README (bao gồm migration/backup/rollback), SRS 2.3, Master Plan, Sprint 3 Plan, API Contract, code và tests D13.
- Khác biệt tài liệu: lịch/SRS/Master Plan cũ gộp D14/D15 vào D13 và không lập lịch phát triển ngày 13/11. API Contract ghi D13 chưa mở rộng gợi ý ngân sách D14. Nhiệm vụ D14 được người dùng giao trực tiếp trong phiên này là phạm vi triển khai mới; không tự sửa lịch/SRS/Master Plan.
- Không sửa schema/migration, Auth/JWT, repository SQL, nghiệp vụ ngân sách gốc, cấu hình/dependency, deployment hoặc governance.

## Kết quả triển khai

Giữ sáu intent `SUMMARY`, `CATEGORIES`, `BUDGET`, `ADVICE`, `COMPARISON`, `CATEGORY_TREND`; không thêm intent. `UNKNOWN`/`UNSUPPORTED` tiếp tục là kết quả định tuyến an toàn của D13.

`BUDGET` dùng cùng snapshot chỉ đọc `REPEATABLE_READ` của context hiện có. Tiền từ MySQL aggregate và các service ngân sách hiện có; tính toán tiếp bằng `BigDecimal`, không qua `double`. Dùng lại phân bổ danh mục đã có trong ReportService, không thêm query để lấy top chi tiêu.

| Trường hợp | Phản hồi Backend |
| --- | --- |
| Chưa đặt ngân sách tổng | Nêu rõ chưa đặt, tổng chi thực tế và gợi ý đối chiếu nhu cầu trước khi tự chọn hạn mức; vẫn phân tích ngân sách danh mục nếu có |
| Chưa phát sinh chi | Nêu chưa có chi, theo dõi các khoản sắp đến hạn; không bịa danh mục cần cắt giảm |
| Dưới 80% | Nêu đang trong hạn mức, tiếp tục theo dõi phần còn lại |
| Từ 80% đến dưới 100% | Cảnh báo gần hạn mức, đối chiếu phần còn lại với khoản thiết yếu, cân nhắc hoãn khoản chưa cần |
| Đúng 100% | Nêu đã đạt/dùng hết hạn mức nhưng chưa vượt; cân nhắc hoãn chi thêm |
| Trên 100% | Nêu phần vượt chính xác, rà soát khoản có thể trì hoãn; không đề xuất tăng hạn mức để bù vượt |
| Danh mục chi nhiều | Tối đa 5 danh mục từ SQL, tổng chi giảm dần/ID tăng dần khi bằng nhau, kèm tiền và tỷ trọng; gồm cả danh mục chưa đặt ngân sách |

Áp dụng gợi ý cho cả ngân sách tổng và từng ngân sách danh mục. So sánh `spent` với `limit × 0.80` và `limit` trước khi làm tròn. Ví dụ chi `799.99` trên hạn mức `1000.00` hiển thị `80,00%` nhưng chưa cảnh báo vì thực tế vẫn dưới 80%. Tỷ lệ hiển thị `HALF_UP`, 2 chữ số thập phân. Có guard cho hạn mức legacy không dương, tránh chia 0.

Các danh mục chi nhiều chỉ là cơ sở để người dùng rà soát khoản có thể trì hoãn, không tự kết luận đó là chi không cần thiết. Không suy đoán thu nhập tương lai hoặc đề xuất một hạn mức tiền mới. Không ghi ngân sách/giao dịch.

## API Contract và tích hợp FE

**Không thay đổi API Contract, endpoint, request/response DTO hoặc mã lỗi.** Nội dung `reply` của BUDGET phong phú hơn. Context nội bộ thêm `budgetSpending`, không serialize vào response. `topCategories=[]` của BUDGET giữ nguyên; field này vẫn chỉ có dữ liệu cho CATEGORIES. Không thêm field tỷ lệ vào `budget.monthly`.

FE cần:

1. Tiếp tục gọi `POST /api/ai/chat` với JWT; dùng `Gợi ý ngân sách tháng 11/2026` hoặc picker tháng và câu `Gợi ý ngân sách`.
2. Render `reply` dạng text, giữ xuống dòng; structured fields hiện có vẫn là nguồn số liệu cho card. Không parse số tiền/tỷ lệ từ reply để thực thi hay ghi dữ liệu.
3. Hiển thị kỳ thực tế từ `period`, giữ cách tích hợp NLU D13. Kiểm tra code FE hiện tại đã có xử lý context/period, không cần sửa DTO để nhận D14.
4. Không coi `budget.status=NOT_SET` là mọi ngân sách danh mục cũng chưa đặt; cần kiểm tra `budget.categories`.
5. Cho phép người dùng tiếp tục hỏi các intent dữ liệu sau lỗi ADVICE; giữ thông báo lỗi timeout/quota/rate limit/unavailable hiện có. Không hiển thị thành công giả khi Gemini lỗi.
6. Giữ ngữ nghĩa trạng thái danh mục hiện có: đúng 100% vẫn là `status=OVER_BUDGET`, nhưng `exceeded=false`; diễn đạt là đạt/dùng hết hạn mức. Chỉ trên 100% mới thực sự vượt (`exceeded=true`).

Không chỉnh sửa Frontend trong nhiệm vụ này. Cần FE/QA xác nhận hiển thị thực tế trước nghiệm thu tích hợp.

## Gemini và an toàn

Giữ provider và handler lỗi D13: chỉ ADVICE gọi Gemini bằng prompt/system instruction cố định, không raw prompt, context, tiền, tên danh mục, email, owner/JWT hoặc lịch sử. Instruction yêu cầu tư vấn chung và không nhận đã kiểm tra tài khoản. Tests loopback kiểm tra toàn bộ JSON gửi đi không chứa cả dữ liệu context mới.

| Nguồn lỗi | HTTP/code trả FE |
| --- | --- |
| Thiếu key hoặc model | `503 AI_NOT_CONFIGURED`, không gọi HTTP |
| Quá 10 request/phút/owner | `429 AI_RATE_LIMITED` |
| Gemini HTTP 429 | `429 AI_QUOTA_EXCEEDED`, không retry |
| Gemini HTTP 503 hoặc HTTP 504 | `503 AI_UNAVAILABLE` theo contract provider 5xx hiện tại |
| Backend chờ provider quá deadline | `504 AI_TIMEOUT`; bao gồm body bị treo, hủy request chưa hoàn tất |
| Body lỗi, không hoàn tất hoặc lỗi mạng khác | Giữ `502 AI_PROVIDER_ERROR`/`AI_INVALID_RESPONSE` theo D13 |

Không trả body lỗi thô, key hay stack trace. Các intent dữ liệu không gọi provider; tests xác minh vẫn thành công ngay sau ADVICE lỗi cấu hình, quota, timeout hoặc unavailable. Giới hạn request theo owner vẫn áp dụng cho mọi intent.

## File thay đổi

| File | Nội dung |
| --- | --- |
| `backend/src/main/java/com/smartexpense/backend/service/AiFinancialContextService.java` | Thêm phân bổ chi tiêu nội bộ cho BUDGET, giữ response D13 |
| `backend/src/main/java/com/smartexpense/backend/service/AiFinancialReplyFormatter.java` | Gợi ý tiếng Việt theo ngưỡng tiền, tỷ lệ ngân sách tổng, rà soát danh mục chi nhiều |
| `backend/src/test/java/com/smartexpense/backend/service/AiBudgetAdviceTests.java` | Unit test ngưỡng, tiền lẻ/lớn, làm tròn, chưa đặt và guard hạn mức 0 |
| `backend/src/test/java/com/smartexpense/backend/D14IntegrationTests.java` | JWT/HTTP/MySQL thật, tháng biên/qua năm/năm nhuận, owner A/B, SQL injection và không ghi DB |
| `backend/src/test/java/com/smartexpense/backend/AiChatApiTests.java` | Hồi phục các intent dữ liệu sau lỗi ADVICE, giữ lỗi an toàn |
| `backend/src/test/java/com/smartexpense/backend/service/GeminiAiProviderTests.java` | Upstream HTTP 504, kiểm tra toàn bộ JSON không chứa context/PII mới |
| `docs/qa/SE2_D14_BE_REPORT.md` | Báo cáo này |

## Kiểm thử thực tế

Kết quả bản chốt ngày **12/11/2026**, hoàn tất khoảng **14:02 UTC+07**, lấy từ JUnit XML trong `backend/build/test-results/test/`:

| Kiểm tra | PASS | FAIL/error | skipped |
| --- | ---: | ---: | ---: |
| Toàn bộ Backend, 47 suite | **1.252** | **0** | **0** |
| MySQL D14 integration | 17 | 0 | 0 |
| Unit gợi ý ngân sách D14 | 12 | 0 | 0 |
| AI API, bao gồm giữ hoạt động sau lỗi provider | 87 | 0 | 0 |
| Gemini provider/limiter HTTP loopback | 18 | 0 | 0 |
| Formatter tài chính hồi quy | 6 | 0 | 0 |
| NLU D13 hồi quy | 106 | 0 | 0 |
| MySQL D11 / D13 hồi quy | 5 / 19 | 0 | 0 |

Các hàng suite riêng là tập con của tổng 1.252, không cộng thêm vào tổng. So với baseline báo cáo D13 1.218 tests: thêm 34 testcase, gồm 17 integration D14, 12 unit ngân sách, 4 API phục hồi sau lỗi và 1 provider HTTP 504.

| Lệnh từ thư mục tương ứng | Kết quả thực tế |
| --- | --- |
| `backend/gradlew.bat test` (cwd `backend`) | **BUILD SUCCESSFUL**, 12 phút 38 giây; đã thực thi full suite, không UP-TO-DATE |
| `backend/gradlew.bat build` (cwd `backend`) | **BUILD SUCCESSFUL**, 1 giây; tạo bootJar/jar, bước test UP-TO-DATE sau full test ở trên |
| `git diff --check` (cwd repo) | **PASS**, exit 0; chỉ có cảnh báo chuẩn hóa LF/CRLF, không lỗi whitespace |

Các file mới cũng được kiểm tra UTF-8, newline cuối file và không có trailing whitespace. Không thêm dependency hoặc sửa build manifest để chạy test.

Lịch sử kiểm thử trung gian: lần trong sandbox có 123 testcase PASS, integration dừng khởi tạo vì quyền Docker. Lần có quyền Docker chạy 140 testcase, 137 PASS và 3 FAIL vì fixture câu hỏi dùng `tháng YYYY-MM`; đã sửa fixture thành dạng `tháng M/YYYY` mà NLU D13 hỗ trợ. Đây không phải kết quả bản chốt; không cộng số lần chạy vào tổng cuối.

MySQL test dùng container 8.0 tạm, xác minh endpoint loopback/catalog/user và Docker socket local trước tạo dữ liệu. Mỗi request D14 so snapshot đầy đủ các hàng của `users`, `categories`, `transactions`, `monthly_budgets`, `category_budgets` trước/sau, flush để phát hiện dirty checking và kiểm tra Hibernate insert/update/delete đều 0. Các lệnh ghi fixture chỉ xảy ra trong setup của test và được rollback; không dùng DB ứng dụng/production.

## Chưa kiểm thử và giới hạn

- Chưa gọi Gemini live hoặc dùng quota/key thật. HTTP loopback và fake provider không phải bằng chứng Gemini live PASS, cũng không bảo đảm tuyệt đối nội dung do model thật sinh ra.
- Chưa chạy browser/FE E2E, QA thủ công mobile/theme hoặc staging/production. Không chạy lint/build/test FE vì không sửa FE.
- Không benchmark tải/concurrency production; giữ test limiter/concurrency/deadline hiện có.
- Giữ giới hạn NLU D13: câu có `tháng YYYY-MM` có thể bị validation 400; dùng `tháng M/YYYY` hoặc ISO `YYYY-MM` độc lập. Không mở rộng parser trong task ngân sách này.
- Không kiểm thử migration/backup/rollback trên DB ứng dụng; không thay schema/migration. Test schema chỉ tạo trong container cô lập của harness hiện có.

## Bàn giao

**READY FOR REVIEW** ở phạm vi Backend local với validation nêu trên; chưa phải nghiệm thu FE/Gemini live hoặc phê duyệt release. Không có BLOCKED PRECONDITION còn tồn tại. Không `git add`, commit, push, tạo PR, merge, tạo/chuyển nhánh hoặc deploy. Ngày commit dự kiến **13/11/2026 (UTC+07)**, chỉ thực hiện sau khi người vận hành phê duyệt riêng, message dự kiến `feat: nâng cấp AI gợi ý ngân sách thông minh và xử lý lỗi`.
