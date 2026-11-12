# SE2-D13-FE — Tích hợp Backend NLU

**STATUS: READY FOR REVIEW**, hoàn tất **12/11/2026 01:19 giờ Việt Nam**. Không stage/commit/push/PR/merge/deploy. Giữ hai stash và các thay đổi D13 hiện có.

## Source of truth và phạm vi

- Worktree `personal-finance-management-FE`, branch `feature/trang`, HEAD `c9a70b9eb62403af8ff0802b4508ff18f55e5c2c` + patch D13 chưa commit.
- Đọc API Contract NLU mới trực tiếp ở worktree Backend Tuấn `personal-finance-management/docs/smartexpense-2.0/API_CONTRACT.md`, mục **D13 — NLU (12/11/2026)**. Không lấy bản cũ trên origin/dev làm hợp đồng NLU. Hash contract được lưu trong manifest.
- Thay đổi Frontend/QA; không sửa source/config/schema BE/DB hoặc dependency. Backend thật 8080/MySQL QA 3306 là môi trường người dùng đã xác nhận cho phép tạo dữ liệu tổng hợp, Frontend 5173.
- Dùng Chrome thật **Chrome/157.0.8103.39** qua CDP 1.3, profile QA riêng; không cài thư viện. Lượt NLU này tạo hai tài khoản A/B mới và fixture riêng; không sửa dữ liệu tài khoản có sẵn. Các fixture mới được giữ trong DB QA, không tự xóa tài khoản/giao dịch.

## Kết quả mới — chỉ NLU

| Kiểm tra | PASS | FAIL | BLOCKED/skipped |
| --- | ---: | ---: | ---: |
| `npm test` — toàn bộ Frontend | **517** | **0** | **0** |
| HTTP/Chrome mới — tổng | **33** | **0** | **0** |
| Trong đó HTTP thật | 9 | 0 | 0 |
| Trong đó UI Chrome Live | 23 | 0 | 0 |
| JavaScript Console | 1 | 0 | 0 |

`npm run lint`, `npm run build`, `git diff --check` và `node --check scripts/qa/d13_nlu_live_qa.mjs`: **PASS**. Build còn cảnh báo bundle JS >500 kB; không đổi cấu hình bundle trong task này. Các hàng con không cộng thêm vào tổng 33.

[Bằng chứng kết quả mới](evidence/d13-fe-nlu/results.json), [log 517 tests](evidence/d13-fe-nlu/unit-tests.txt), [hash source/contract/bằng chứng](evidence/d13-fe-nlu/manifest.json). Timestamp trong JSON là UTC, phần trên đổi sang giờ Việt Nam. Kết quả 44 ca P2 trước NLU chỉ lưu ở phần lịch sử bên dưới, không được dùng thay cho 33 ca mới này.

## Thay đổi NLU

1. **Kỳ thực tế:** bỏ equality guard period với requestedMonth và baseMonth với requestedCompareMonth. Vẫn validate YYYY-MM, năm 1900–2100, số hữu hạn, danh mục, phần trăm nullable; hai kỳ phải khác nhau và `comparison.targetMonth === response.period`. Không chấp nhận period sai chỉ vì Backend đã trả 200.
2. **Bảo vệ request/phiên:** giữ sequence/request ID, AbortController, JWT interceptor và session revision. Context chỉ cập nhật sau khi response được chấp nhận bởi các guard này; response cũ không được phục hồi context.
3. **Context:** chỉ có `intent`, `month`, `compareMonth?`, lấy từ kỳ thật của phản hồi nghiệp vụ hợp lệ gần nhất; không chứa owner, số tiền, prompt hoặc token. Chỉ giữ trong bộ nhớ controller, không localStorage/sessionStorage. Xóa khi logout/đổi user/xóa hội thoại, cũng xóa khi nhận UNKNOWN/UNSUPPORTED để không tiếp tục chủ đề không rõ. Khi lỗi giữ context cho Retry. Khi đổi picker hủy request đang chạy nhưng giữ context gần nhất, được hiển thị rõ trên UI.
4. **Follow-up:** gửi context; với tiền tố còn/thế/vậy/và, bỏ compareMonth picker để Backend có thể dùng baseMonth của context. Không tính tháng tương đối trong FE; “tháng trước” do Clock Việt Nam của Backend quyết định, không phải tháng trước context. Câu nói rõ kỳ vẫn thắng context/picker theo contract.
5. **Chips động:** giữ sáu chips ban đầu; sau phản hồi nghiệp vụ đưa câu hỏi tiếp nối và câu theo kỳ phản hồi; UNKNOWN/UNSUPPORTED đưa ba câu hỏi gợi ý bắt đầu lại.
6. **UNKNOWN và nhãn kỳ:** hiển thị reply/hướng dẫn, không gắn nhãn kỳ thống kê hoặc vẽ số liệu giả cho UNKNOWN. Nhãn các phản hồi tài chính và context dùng period thực; UI giải thích kỳ trong câu ưu tiên picker.
7. **Biểu đồ:** SVG COMPARISON vẽ base/target cho thu/chi/số dư, có trục 0 cho số dư âm; CATEGORIES vẽ thanh theo số tiền với tiền và share% Backend hiển thị kèm. Phép chia chỉ phục vụ chiều dài thanh, không tính lại tiền/delta/% nghiệp vụ. Có label/title cho screen reader, Light/Dark, không thêm animation/dependency; robot SVG, Escape/focus, loading/Retry giữ nguyên.

## Live HTTP thật

Fixture A: tháng 02/2024 có thu 100.10 và chi 0.10 + 0.20 theo hai danh mục (số dư 99.80), tháng 03/2024 chi 0.70, tháng trước theo Clock có chi 20.50. B có chi riêng 999.99 ở 02/2024. Tháng 12/2025 chi 0.10, tháng 01/2026 chi 0.30. Picker cố tình là 05/2025, compare picker 04/2025. Dữ liệu tạo qua API thật; không dùng mock để báo Live PASS.

| Ca | Kết quả/bằng chứng |
| --- | --- |
| SUMMARY khác picker | period=2024-02, chi=0.30, balance=99.80 — [JSON](evidence/d13-fe-nlu/HTTP-NLU-SUMMARY.json) |
| CATEGORIES | period=2024-02, hai danh mục — [JSON](evidence/d13-fe-nlu/HTTP-NLU-CATEGORIES.json) |
| Hai tháng tường minh | base=2024-02, target/period=2024-03, expenseChangePercent=133.33 — [JSON](evidence/d13-fe-nlu/HTTP-NLU-TWO-MONTHS.json) |
| Follow-up | context CATEGORIES/2024-02, “Còn tháng trước thì sao?” → CATEGORIES và kỳ trước theo Clock, chi=20.50 — [JSON](evidence/d13-fe-nlu/HTTP-NLU-FOLLOWUP.json) |
| UNKNOWN | stats=null, không có comparison — [JSON](evidence/d13-fe-nlu/HTTP-NLU-UNKNOWN.json) |
| Cả năm | UNKNOWN nói rõ chưa hỗ trợ cả năm, không thay bằng tổng tháng — [JSON](evidence/d13-fe-nlu/HTTP-NLU-ANNUAL.json) |
| Base rỗng | expenseChangePercent và changePercent từng danh mục đều null — [JSON](evidence/d13-fe-nlu/HTTP-NLU-NULL.json) |
| Qua năm | base=2025-12, target=2026-01 — [JSON](evidence/d13-fe-nlu/HTTP-NLU-YEAR.json) |
| B/owner | userId của A gửi kèm không thay owner; B chỉ nhận 999.99 — [JSON](evidence/d13-fe-nlu/HTTP-NLU-OWNER-B.json) |

## Chrome thật sau nâng cấp

- Đăng nhập form thật. SUMMARY 02/2024 trong khi picker 05/2025; picker không bị tự đổi, nhãn reply/context thể hiện 02/2024 và số liệu đúng.
- CATEGORIES có biểu đồ và chips theo 02/2024. Bấm chip “Còn tháng trước thì sao?” gửi context đúng CATEGORIES/2024-02, không compareMonth picker; intent vẫn CATEGORIES, period theo Clock. Payload thật đã được ghi trong results.json (không ghi token/header).
- COMPARISON nói rõ hai kỳ nhận nhãn base/target thật và biểu đồ 133,33%.
- UNKNOWN hiện hướng dẫn/ba chips, xóa context. Xóa hội thoại rồi hỏi tiếp không gửi context cũ.
- Offline bằng CDP Network tạo lỗi request thật; bật mạng và bấm Retry thành công. Request có latency bị hủy khi đổi picker; context không bị response cũ ghi đè.
- Logout A → login B không có hội thoại/context A; B chỉ thấy 999,99 ₫. JWT request bị thay bằng chuỗi sai qua CDP Fetch: Backend trả 401 thật, FE xóa phiên và về login; không mock response.
- P1 SUMMARY/CATEGORIES/BUDGET/ADVICE đều được chạy trong lượt mới. ADVICE nhận reply Backend/provider thật, có tối đa một lần Retry chủ động nếu provider lỗi; xem detail của ca trong results.json.
- Escape trả focus về launcher. Runtime.exceptionThrown/consoleAPICalled(error) không có lỗi; các fault network/JWT chủ động được kiểm tra riêng.
- 320/375/430/768/1440 px × Light/Dark, height=900: document/panel/log không tràn ngang, panel mobile trên Bottom Navigation thật. Ảnh chụp tại vùng biểu đồ đang hiển thị; không coi DOM SSR là Browser QA.

| Width | Light Live NLU | Dark Live NLU |
| --- | --- | --- |
| 320 | [Ảnh](evidence/d13-fe-nlu/live-320-light.png) | [Ảnh](evidence/d13-fe-nlu/live-320-dark.png) |
| 375 | [Ảnh](evidence/d13-fe-nlu/live-375-light.png) | [Ảnh](evidence/d13-fe-nlu/live-375-dark.png) |
| 430 | [Ảnh](evidence/d13-fe-nlu/live-430-light.png) | [Ảnh](evidence/d13-fe-nlu/live-430-dark.png) |
| 768 | [Ảnh](evidence/d13-fe-nlu/live-768-light.png) | [Ảnh](evidence/d13-fe-nlu/live-768-dark.png) |
| 1440 | [Ảnh](evidence/d13-fe-nlu/live-1440-light.png) | [Ảnh](evidence/d13-fe-nlu/live-1440-dark.png) |

Ảnh bổ sung: [CATEGORIES](evidence/d13-fe-nlu/categories-chart.png), [COMPARISON](evidence/d13-fe-nlu/comparison-chart.png), [UNKNOWN](evidence/d13-fe-nlu/unknown.png), [owner B](evidence/d13-fe-nlu/owner-b.png).

## File của phần nâng cấp NLU

- Sửa `frontend/src/services/aiChatService.js`.
- Sửa `frontend/src/components/ai/AiAssistantWidget.jsx`, `AiComparisonCard.jsx`.
- Thêm `frontend/src/components/ai/AiFinancialCharts.jsx`.
- Sửa `frontend/tests/aiAssistant.test.js` (17 ca mới, cập nhật assertion base picker cũ).
- Thêm `scripts/qa/d13_nlu_live_qa.mjs`, `docs/qa/evidence/d13-fe-nlu/` và cập nhật báo cáo này.

Trong quá trình sửa có lỗi JSX/whitespace đã được sửa trước lượt unit/lint/build cuối; assertion tìm tên biểu đồ trong innerText cũng được sửa sang kiểm tra aria-label, sau đó chạy lại toàn bộ 33 ca. Không sử dụng lượt lỗi làm kết quả PASS. Không còn vấn đề contract cần BE phối hợp từ lượt tích hợp này; giới hạn hiểu ngôn ngữ theo bộ luật và thống kê cả năm giữ đúng contract Backend.

---

## Lịch sử P2 trước NLU — 11/11/2026

**Trạng thái lượt P2 ban đầu: READY FOR COMMIT (lịch sử)** — hoàn tất ngày **11/11/2026, 22:22 giờ Việt Nam**. Chưa stage/commit/push/PR/merge/deploy. Commit chỉ được thực hiện ngày 12/11/2026 sau phê duyệt riêng.

## Bản được kiểm thử

- Worktree `F:\RikkeiEdu\personal-finance-management-FE`, branch `feature/trang`, HEAD `c9a70b9eb62403af8ff0802b4508ff18f55e5c2c` + các thay đổi D13 chưa commit. Hai stash giữ nguyên.
- Frontend Vite thật: `http://localhost:5173`; Backend D13 thật: `http://localhost:8080`; MySQL tại `127.0.0.1:3306`. Người dùng xác nhận chọn môi trường QA 3306 trong phiên này, sau khi đối chiếu PID Backend và kết nối TCP thực tế. Container test 3307 không phải datasource của tiến trình này.
- Chỉ tạo tài khoản QA A/B mới và giao dịch tổng hợp qua API; không sửa tài khoản/dữ liệu có sẵn. Các tài khoản fixture của các lượt thử vẫn ở DB QA để đối chiếu; không tự xóa dữ liệu. Không lưu password, JWT hoặc key Gemini trong bằng chứng.
- Chrome thật **157.0.8103.39**, CDP 1.3, headless, profile tạm riêng. Dùng Node WebSocket và phương thức từ harness D11 có sẵn; không cài Playwright hoặc dependency mới.
- Native/browser host không khả dụng nên dùng Chrome/CDP theo yêu cầu. Lượt khởi chạy Backend/container riêng ban đầu dừng vì cổng 8080 bị chiếm; tiến trình/container do lượt đó tạo đã được dọn. Không đổi nguồn/cấu hình BE/DB.

## Kết quả cuối

| Kiểm tra | PASS | FAIL | BLOCKED |
| --- | ---: | ---: | ---: |
| `npm test` | 500 | 0 | 0 |
| Harness HTTP/Chrome — tổng | 44 | 0 | 0 |
| Trong đó: component fixture trên Chrome | 11 | 0 | 0 |
| Trong đó: HTTP thật | 10 | 0 | 0 |
| Trong đó: UI Live trên Chrome | 22 | 0 | 0 |
| Trong đó: giám sát JavaScript Console | 1 | 0 | 0 |

`npm run lint`, `npm run build`, `git diff --check`: **PASS** sau bản sửa Escape. Build còn cảnh báo chunk JavaScript lớn hơn 500 kB; không đổi cấu hình bundle ngoài phạm vi D13. Unit test không skipped/cancelled.

- [Kết quả chi tiết cuối, timestamp UTC và phiên bản Chrome](evidence/d13-fe/results.json)
- [Log 500 unit tests](evidence/d13-fe/unit-tests.txt)
- [SHA-256 source và bằng chứng](evidence/d13-fe/manifest.json)

## HTTP thật và API Contract D13

Fixture A: tháng 10/2026 thu 100.10, chi 10.10; tháng 11 thu 200.20, chi 20.50. B có chi riêng 999.99. Tháng 12/2025 chi 0.10 và tháng 01/2026 chi 0.30. Tháng 07/08 rỗng. Tạo fixture qua API thật; kiểm tra aggregate trả từ Backend/MySQL, không dùng adapter/mock làm bằng chứng Live và không tuyên bố đã chạy SQL oracle trực tiếp.

| Ca | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| COMPARISON | HTTP 200; base/target đúng tháng; delta thu 100.10, chi 10.40, số dư 89.70; expenseChangePercent=102.97 | [JSON thật](evidence/d13-fe/HTTP-COMPARISON.json) |
| CATEGORY_TREND | HTTP 200; categoryId/name, baseExpense/targetExpense, delta=10.40, changePercent=102.97 | [JSON thật](evidence/d13-fe/HTTP-CATEGORY_TREND.json) |
| Hai tháng rỗng | Các Stats bằng 0; categoryTrends=[]; expenseChangePercent=null | [JSON thật](evidence/d13-fe/HTTP-EMPTY.json) |
| Kỳ gốc rỗng | expenseChangePercent=null và categoryTrend.changePercent=null, không tự đổi thành 0% | [JSON thật](evidence/d13-fe/HTTP-BASE-ZERO.json) |
| Kỳ đích rỗng | Delta chi âm, phần trăm=-100 | [JSON thật](evidence/d13-fe/HTTP-TARGET-EMPTY.json) |
| Chi tiêu giảm | Delta chi/danh mục=-10.40; phần trăm=-50.73 | [JSON thật](evidence/d13-fe/HTTP-DECREASE.json) |
| Qua năm | 2025-12 → 2026-01, số tiền lẻ 0.10/0.30 giữ đúng | [JSON thật](evidence/d13-fe/HTTP-YEAR.json) |
| Owner B | B chỉ nhận 999.99; field userId thêm không quyết định owner | HTTP-OWNER-B trong results.json |
| JWT | Thiếu/sai JWT trả 401 thật | HTTP-JWT trong results.json |
| Validation | compareMonth trùng kỳ đích, ngoài năm hợp lệ, tháng 13 đều trả 400 | HTTP-VALIDATION trong results.json |

Các field `comparison`, `base`, `target`, `delta`, `categoryTrends`, `changePercent` tương thích normalizer FE. FE render tiền/độ thay đổi từ Backend, không tự cộng lại giao dịch hoặc tạo dữ liệu giả.

## Chrome Live và hành vi phiên

- UI gọi HTTP thật và render cả COMPARISON/CATEGORY_TREND, số lẻ và tỷ lệ 102,97%. Empty state/null được kiểm tra cả fixture và HTTP thật.
- Chuyển nhanh kỳ trong lúc network bị tăng latency: request cũ bị hủy, không có card phản hồi cũ chen vào lựa chọn mới.
- Offline qua CDP Network làm request thật thất bại: UI hiện lỗi mạng; bật lại network và bấm **Thử lại** gửi request thật thành công.
- Escape đóng panel và trả focus về `ai-assistant-launcher`.
- Logout A khi request đang chậm, đăng nhập B qua form thật: hội thoại mới rỗng; không còn số liệu/hội thoại A; B chỉ thấy 999,99 ₫.
- Đổi header JWT của request đang gửi thành giá trị sai qua CDP Fetch; server trả 401 thật, FE xóa accessToken và trở về login. Không mock response 401.
- SUMMARY/CATEGORIES/BUDGET và ADVICE đều được thử trên Chrome với Backend thật. ADVICE có lỗi provider tạm thời; lượt cuối dùng nút Retry một lần và nhận phản hồi thật, không đưa văn bản fake vào UI. Kiểm tra HTTP riêng cũng trả **200 ADVICE**: [bằng chứng](evidence/d13-fe/HTTP-ADVICE.json).
- JavaScript `Runtime.exceptionThrown` và `Runtime.consoleAPICalled(type=error)`: không ghi nhận lỗi. Lỗi request do ca offline/JWT/provider được kiểm tra như fault scenario, không diễn giải là mọi request đều thành công.

## Responsive và Light/Dark

Mỗi kích thước 320, 375, 430, 768, 1440 px được chạy ở cả Light/Dark trên Chrome thật (height=900). Kiểm tra document/panel/log không tràn ngang, panel mobile nằm trên Bottom Navigation thực tế, nội dung dài cuộn bên trong. Có 10 ảnh fixture riêng và 10 ảnh với dữ liệu Live; fixture không được gộp làm bằng chứng HTTP Live.

| Width | Light Live | Dark Live |
| --- | --- | --- |
| 320 | [Ảnh](evidence/d13-fe/live-320-light.png) | [Ảnh](evidence/d13-fe/live-320-dark.png) |
| 375 | [Ảnh](evidence/d13-fe/live-375-light.png) | [Ảnh](evidence/d13-fe/live-375-dark.png) |
| 430 | [Ảnh](evidence/d13-fe/live-430-light.png) | [Ảnh](evidence/d13-fe/live-430-dark.png) |
| 768 | [Ảnh](evidence/d13-fe/live-768-light.png) | [Ảnh](evidence/d13-fe/live-768-dark.png) |
| 1440 | [Ảnh](evidence/d13-fe/live-1440-light.png) | [Ảnh](evidence/d13-fe/live-1440-dark.png) |

## Lỗi phát hiện và xử lý

1. Escape đóng panel nhưng focus gọi trước lúc launcher render lại. Đã sửa `AiAssistantWidget.jsx` để trả focus sau khi React render; Chrome kiểm tra lại PASS.
2. Ca ADVICE ban đầu chạm quota owner A sau 10 câu/phút. Chuyển ca sang phiên B còn quota và giữ khoảng chờ rate window giữa các nhóm; không nới rate limiter Backend.
3. Provider ADVICE có lỗi tạm thời. HTTP riêng 200; Chrome cuối nhận phản hồi thật sau một lần Retry. Đây là phụ thuộc mạng/provider cần lưu ý khi demo; P2 không gọi Gemini.

Không còn vấn đề contract D13 cần BE sửa từ lượt QA này.

## File thuộc bàn giao

- Frontend: `AiAssistantWidget.jsx`, `AiComparisonCard.jsx` (mới), `aiChatService.js`, `frontend/tests/aiAssistant.test.js`.
- QA: báo cáo này, `scripts/qa/d13_live_qa.mjs` (mới), thư mục `docs/qa/evidence/d13-fe/`.

Harness chỉ bật phần ghi fixture khi `D13_QA_WRITES_APPROVED=true`; phải xác minh database test trước khi chạy lại. Không in/lưu credential; profile Chrome tạm do harness tạo được dọn khi kết thúc, không tác động profile người dùng.
