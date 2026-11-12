# SE2-D13-BE — Natural Language Understanding

Ngày chuẩn bị: **12/11/2026**, giờ Việt Nam. **STATUS: READY FOR REVIEW** — Backend hoàn tất; FE còn cần cập nhật guard kỳ trước khi tích hợp NLU.

## Phạm vi và Git

- Worktree `personal-finance-management`, branch `feature/tuan`; HEAD `c9a70b9eb62403af8ff0802b4508ff18f55e5c2c`.
- Giữ các thay đổi D13 chưa commit đã có; không tạo lại COMPARISON/CATEGORY_TREND hoặc sửa truy vấn/tính toán tài chính của D13.
- Hai stash giữ nguyên: `e13cf8eeac1db00aac89f0363df8d02098703068`, `32016d5c8975e846696fa464875b43539ac14416`.
- Không stage/commit/push/PR/merge/reset/đổi branch/deploy, không sửa schema/auth/security/config/dependency.

## Hành vi NLU

- Chuẩn hóa Unicode NFKC/NFD, chữ thường ROOT, bỏ dấu/ký tự format, gộp khoảng trắng. Các typo/viết tắt hỗ trợ được liệt kê trong API Contract; chỉ mở rộng viết tắt khi có ngữ cảnh, không dùng fuzzy replacement tùy ý.
- Giữ sáu intent nghiệp vụ; thêm điều khiển UNKNOWN, giữ UNSUPPORTED. UNKNOWN trả sáu khả năng và ba câu mẫu, không đọc dữ liệu hoặc gọi provider. UNSUPPORTED ưu tiên trước context/time trong định tuyến.
- Tháng tường minh trong câu ưu tiên picker. Tháng N dùng năm hiện tại Việt Nam; tháng N/YYYY và YYYY-MM dùng kỳ nói rõ. Hai tháng tường minh trong câu so sánh/trend: kỳ muộn là target, kỳ sớm là base. “So sánh với tháng trước” hiểu là tháng hiện tại so với tháng trước.
- Năm/tháng được tính phải trong 1900–2100/1–12. Tháng trước ngoài miền trả 400. YearMonth và range SQL hiện có xử lý tháng 2, năm nhuận, chuyển năm.
- “Năm nay” có tháng cụ thể dùng tháng đó trong năm hiện tại; câu hỏi cả năm không có tháng trả UNKNOWN, nói rõ chưa hỗ trợ cả năm, không dùng tổng một tháng làm tổng năm.
- Context tùy chọn `{intent,month,compareMonth?}` cho câu tiếp theo bắt đầu bằng “còn/thế/vậy/và”. Backend không lưu hội thoại. Context không có quyền chọn owner, không mang số liệu. Intent/tháng rõ trong câu vẫn thắng context.
- Giữ endpoint và field response; request P1 hai field/P2 ba field vẫn hợp lệ. Toàn bộ tiền/delta/% vẫn từ SQL và BigDecimal của D13. Owner từ JWT; AI không ghi database. Chỉ ADVICE có thể gọi Gemini với lời nhắc chung cố định, không raw prompt/context/PII/số tiền/JWT.

## Kiểm thử

- **94 câu tiếng Việt** có expected intent và expected period trong `AiQueryInterpreterTests.vietnameseCorpus`, picker cố tình khác kỳ trong câu; Clock cố định 12/11/2026.
- Bao phủ có/không dấu, NFD/NFKC/ký tự format, từ viết tắt mơ hồ, typo nhẹ, UNKNOWN, UNSUPPORTED, ưu tiên thời gian, hai tháng/qua năm, năm hợp lệ, context, ngân sách/advice/P1/P2.
- Test API xác nhận UNKNOWN không gọi SQL/Gemini, vẫn bị rate limit; context bị validate, owner/số tiền ngoài DTO không được dùng; reply và period theo kỳ SQL thực.
- MySQL container tạm thật: dữ liệu A/B ngày 29/02/2024, picker khác kỳ được hỏi, SQL tiền lẻ, kỳ gốc rỗng/% null; dùng lại đầy đủ regression D11/D13.
- `AiNluTestConfiguration` cố định Clock cho các API/integration AI D11/D13 để CI không đổi kết quả khi lịch thực chuyển tháng. Clock của runtime Backend vẫn theo Việt Nam hiện tại.
- Các lượt tập trung D11–D13 đã thành công; một số lượt full đang chạy được dừng khi bổ sung guard/test cuối. Chỉ lấy kết quả full của bản chốt để bàn giao, không cộng dồn các lượt.

Kết quả bản chốt lấy trực tiếp từ JUnit XML của lượt full hoàn tất ngày 12/11/2026 (giờ Việt Nam):

| Kiểm tra | PASS | FAIL/error | skipped |
| --- | ---: | ---: | ---: |
| Toàn bộ Backend, 45 suite | **1.218** | **0** | **0** |
| NLU, gồm 94 câu gắn nhãn và edge cases | 106 | 0 | 0 |
| AI API | 83 | 0 | 0 |
| MySQL D11 integration | 5 | 0 | 0 |
| MySQL D13 integration | 19 | 0 | 0 |
| Financial formatter | 6 | 0 | 0 |
| Gemini provider/limiter loopback | 17 | 0 | 0 |

`gradlew.bat test`: BUILD SUCCESSFUL (12m 27s). `gradlew.bat build`: BUILD SUCCESSFUL; bước test UP-TO-DATE sau lượt full. `git diff --check`: PASS. Các hàng suite riêng là tập con, không cộng thêm vào 1.218.

[Bằng chứng JUnit tóm tắt, timestamp UTC và SHA-256 source](evidence/d13-be-nlu/validation.json). Không sao chép raw log có dữ liệu vào báo cáo. Không coi test provider loopback là Gemini Live PASS; không coi MockMvc/MySQL integration là Browser QA NLU. Browser/FE Live NLU chưa thực hiện trong task Backend này.

## Phối hợp Frontend

**FE hiện cần cập nhật trước tích hợp NLU:** `normalizeAiChatResponse` so khớp cứng period với requestedMonth; `normalizeAiComparison` so baseMonth với requestedCompareMonth. Khi câu nói rõ tháng khác picker, các guard này sẽ báo INVALID_API_RESPONSE dù Backend tính đúng.

FE cần validate miền giá trị/cấu trúc và quan hệ comparison.targetMonth=period, render kỳ thật từ response, giữ sequence/abort/session guards để chặn phản hồi cũ. Client gửi context chủ động nếu cần follow-up. Task này không sửa FE và không dùng lại Browser QA P2 cũ để tuyên bố NLU đã tích hợp.

## File mới/sửa trong phần NLU

1. `backend/src/main/java/com/smartexpense/backend/service/AiQueryInterpreter.java` — mới, nhận diện intent và kỳ.
2. `backend/src/main/java/com/smartexpense/backend/service/AiChatService.java` — gọi interpreter, UNKNOWN, kỳ thực.
3. `backend/src/main/java/com/smartexpense/backend/dto/ai/AiChatRequest.java` — context tùy chọn, giữ constructor cũ.
4. `backend/src/test/java/com/smartexpense/backend/service/AiQueryInterpreterTests.java` — mới, corpus và edge cases.
5. `backend/src/test/java/com/smartexpense/backend/AiNluTestConfiguration.java` — mới, Clock test.
6. `backend/src/test/java/com/smartexpense/backend/AiChatApiTests.java` — UNKNOWN/context/time/rate limit và giữ regression.
7. `backend/src/test/java/com/smartexpense/backend/D11IntegrationTests.java` — inject Clock test, không đổi assertions nghiệp vụ.
8. `backend/src/test/java/com/smartexpense/backend/D13IntegrationTests.java` — thêm SQL/owner/time NLU, inject Clock test.
9. `docs/smartexpense-2.0/API_CONTRACT.md` — quy tắc NLU và cảnh báo tích hợp FE.
10. Báo cáo này và bằng chứng validation tóm tắt nếu có.

Các file `AiChatResponse.java`, `AiFinancialContextService.java`, `AiFinancialReplyFormatter.java` vẫn mang patch D13 trước đó; phần NLU không sửa thêm ba file này.
