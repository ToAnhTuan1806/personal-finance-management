# SE2-D14-DB — Báo cáo Final Live Integration, Smart Budget Advice & Robot 3D QA

TASK: **SE2-D14-DB**  
DỰ ÁN: **SmartExpense 2.0**  
NGÀY BÁO CÁO / COMMIT DỰ KIẾN: **13/11/2026** (Giờ Việt Nam UTC+07)  
NHÁNH LÀM VIỆC: `feature/quynh`  
NHÁNH ĐÍCH: `dev`  
WORKTREE: `F:\RikkeiEdu\personal-finance-management-DB`  
NGƯỜI THỰC HIỆN: **Quỳnh (Senior Database Engineer kiêm QA Automation Engineer)** — Git: `Quynh181226` <`phamhuongquynh2k6@gmail.com`>  

**STATUS: READY FOR COMMIT**  
- **Live HTTP & Financial Integration QA (D14 Backend thật + MySQL thật):** **30 / 30 PASS (100%)**.
- **Live Google Chrome CDP & Three.js Robot QA (Frontend thật + Backend thật):** **23 / 23 PASS (100%)**.
- **Tổng số ca Live QA độc lập D14:** **53 / 53 PASS (0 FAIL, 0 SKIPPED)**.
- **Backend Full Regression (Tuấn):** **1.252 / 1.252 PASS** (47 test suites, 0 FAIL).
- **Frontend Full Regression (Trang):** **535 / 535 PASS** (0 FAIL, 0 CANCELLED, 0 SKIPPED).
- **Frontend Linter & Production Build:** **PASS** (0 lỗi linter, build production thành công).
- **Git Diff & Whitespace Check:** **PASS** (exit 0 trên cả 3 worktrees, 0 lỗi whitespace).
- **npm audit Review:** Hoàn thành rà soát chi tiết 5 advisory (1 High, 4 Moderate), không tự chạy `npm audit fix`.

---

## 1. Môi trường Kiểm thử và Quy tắc An toàn

### 1.1. Bố trí Worktree và Phân quyền
| Thành phần | Worktree | Nhánh | Quyền truy cập | Trạng thái bảo toàn |
| --- | --- | --- | --- | --- |
| **Database & QA** | `F:\RikkeiEdu\personal-finance-management-DB` | `feature/quynh` | **Read / Write** | Working tree sạch, lưu scripts và evidence riêng |
| **Backend Reference** | `F:\RikkeiEdu\personal-finance-management` | `feature/tuan` | **READ-ONLY** | Bảo toàn nguyên vẹn 100% mã nguồn và stash@{0} |
| **Frontend Reference** | `F:\RikkeiEdu\personal-finance-management-FE` | `feature/trang` | **READ-ONLY** | Bảo toàn nguyên vẹn 100% mã nguồn và stash@{1} |

### 1.2. Môi trường Thực thi Thật (Live Environment)
- **Hệ điều hành:** Windows 10/11 Enterprise x64.
- **Backend Runtime:** Spring Boot 4.1.1, Java 21 LTS (`21.0.10+8-LTS-217`), port `8085`.
- **Frontend Runtime:** React 19, Vite 8.3.4, Three.js 0.187.0, port `5173`.
- **Database Cô lập:** MySQL 8.0.46 Community Server, catalog riêng biệt `personal_finance_d14_test` (port 3306 loopback).
- **Nguyên tắc an toàn Tuyệt đối:**
  - Tuyệt đối không can thiệp, không tạo hoặc sửa đổi bất kỳ dữ liệu nào trên database chính `personal_finance_db`.
  - Không sử dụng mock data để nghiệm thu Live PASS. Toàn bộ request gọi qua HTTP thật đến Spring Boot Controller thật, xử lý nghiệp vụ thật và truy vấn MySQL thật.
  - Bảo toàn toàn bộ stash và các thay đổi chưa commit của các thành viên khác.
  - Không tự ý `git commit`, `push`, tạo `PR`, `merge` hoặc `deploy`.

---

## 2. PHẦN I — NGHIỆM THU LIVE HTTP & GỢI Ý NGÂN SÁCH THÔNG MINH D14

Kịch bản kiểm thử tự động: [`scripts/qa/d14_live_integration_qa.py`](file:///F:/RikkeiEdu/personal-finance-management-DB/scripts/qa/d14_live_integration_qa.py)  
Bằng chứng JSON chi tiết: [`docs/qa/evidence/d14-db/SE2-D14-DB_LIVE_API_RESULTS.json`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/SE2-D14-DB_LIVE_API_RESULTS.json)  
Kết quả: **30 / 30 CA PASS 100% (0 FAIL)**.

### 2.1. Kiểm thử Toàn diện các Ngưỡng Ngân sách D14
| Mã ca | Kịch bản kiểm thử | Dữ liệu đầu vào (Kỳ / Hạn mức / Đã chi) | Kết quả kỳ vọng & Phản hồi thực tế | Trạng thái |
| --- | --- | --- | --- | :---: |
| **BUDGET-01** | Chưa đặt ngân sách tổng | Kỳ `2026-05`<br>Hạn mức: `null` (`NOT_SET`)<br>Đã chi: `3.500.000,00 ₫` | `budget.status = NOT_SET`, `monthly = null`. Nêu rõ đã chi thực tế `3.500.000,00 ₫` và gợi ý xem lại chi tiêu thực tế trước khi tự đặt hạn mức. | **PASS** |
| **BUDGET-02** | Tháng rỗng (chưa chi) | Kỳ `2026-06`<br>Hạn mức: `10.000.000,00 ₫`<br>Đã chi: `0,00 ₫` | `spentAmount = 0`, `Tỷ lệ sử dụng: 0,00%`. Nêu chưa phát sinh chi tiêu, theo dõi khoản sắp đến hạn, chưa có cơ sở điều chỉnh danh mục. | **PASS** |
| **BUDGET-03A** | Ngưỡng 79,99% | Kỳ `2026-07`<br>Hạn mức: `10.000.000,00 ₫`<br>Đã chi: `7.999.000,00 ₫` | `Tỷ lệ sử dụng: 79,99%`. Nêu rõ đang chi tiêu trong hạn mức, tiếp tục theo dõi phần còn lại; **KHÔNG** xuất hiện cảnh báo sắp đến hạn. | **PASS** |
| **BUDGET-03B** | Ngưỡng biên số học (799.99/1000.00) | Kỳ `2026-04`<br>Hạn mức: `1.000,00 ₫`<br>Đã chi: `799,99 ₫` | `Tỷ lệ sử dụng: 80,00%` (làm tròn HALF_UP 2 số). So sánh trước làm tròn (`799.99 < 800.00`), kết luận **đang trong hạn mức**, **KHÔNG** phát cảnh báo sắp đến hạn. | **PASS** |
| **BUDGET-04** | Ngưỡng chạm 80,00% | Kỳ `2026-08`<br>Hạn mức: `10.000.000,00 ₫`<br>Đã chi: `8.000.000,00 ₫` | `Tỷ lệ sử dụng: 80,00%`. Xuất hiện: `"Cảnh báo: Sắp đến hạn mức ngân sách."`, gợi ý đối chiếu phần còn lại với các khoản thiết yếu. | **PASS** |
| **BUDGET-05** | Đúng 100,00% hạn mức | Kỳ `2026-09`<br>Hạn mức: `10.000.000,00 ₫`<br>Đã chi: `10.000.000,00 ₫` | `Tỷ lệ sử dụng: 100,00%`. `exceeded = false`. Nêu đã dùng hết hạn mức nhưng chưa vượt, gợi ý hoãn các khoản chi chưa cần thiết. | **PASS** |
| **BUDGET-06** | Vượt ngân sách (> 100%) | Kỳ `2026-10`<br>Hạn mức: `10.000.000,00 ₫`<br>Đã chi: `12.500.000,00 ₫` | `Tỷ lệ sử dụng: 125,00%`. `exceeded = true`. Nêu chính xác số tiền vượt: `"Đã vượt hạn mức 2.500.000,00 ₫."`. Không gợi ý tăng hạn mức để bù vượt. | **PASS** |
| **BUDGET-07** | Phân bổ danh mục chi nhiều | Kỳ `2026-10`<br>5 danh mục chi tiêu | Liệt kê chính xác top danh mục chi nhiều từ SQL: Ăn uống (5M, 40%), Chi tiêu hằng ngày (3.5M, 28%), Quần áo (2M, 16%), Tiền điện (1M, 8%), Đi lại (1M, 8%). | **PASS** |

### 2.2. Kiểm thử Sáu Intent Tài chính D13
- **`SUMMARY` (PASS):** Kỳ `2026-10` trả về Thu `20.000.000,00 ₫`, Chi `12.500.000,00 ₫`, Dư `7.500.000,00 ₫`.
- **`CATEGORIES` (PASS):** Trả về chính xác 5 danh mục có chi tiêu, sắp xếp `totalAmount DESC, categoryId ASC`, tỷ trọng phần trăm tính bằng `BigDecimal` chuẩn xác.
- **`BUDGET` (PASS):** Trả về đầy đủ phân tích ngân sách tổng, ngân sách danh mục (Ăn uống vượt hạn mức 1.000.000 ₫) và top danh mục chi nhiều.
- **`COMPARISON` (PASS):** So sánh kỳ gốc `2026-09` (Chi 10M) và kỳ đích `2026-10` (Chi 12.5M): Delta chi tăng `+2.500.000,00 ₫`, tỷ lệ thay đổi `+25,00%`.
- **`CATEGORY_TREND` (PASS):** Xác định đúng danh mục có biến động chi tiêu tăng cao nhất giữa hai kỳ.
- **`ADVICE` (PASS):** Định tuyến an toàn. Khi chưa cấu hình Gemini API Key, trả về `503 AI_NOT_CONFIGURED`, không rò rỉ stack trace, email hay dữ liệu tài chính.
- **`UNKNOWN` (PASS):** Nhận diện câu hỏi phi tài chính (`Thời tiết hôm nay thế nào?`), trả về lời chào và hướng dẫn 6 khả năng hỗ trợ, `stats = null`.
- **`UNSUPPORTED` (PASS):** Nhận diện hành vi phá hoại (`Xóa toàn bộ giao dịch của tôi`), từ chối lịch sự, thực hiện đúng 0 câu lệnh SQL ghi.

---

## 3. PHẦN II — ĐỐI CHIẾU SỐ LIỆU TÀI CHÍNH (RECONCILIATION MATRIX)

Toàn bộ số liệu do AI Chat API trả về được đối chiếu chéo độc lập với:
1. Truy vấn SQL trực tiếp trên MySQL `personal_finance_d14_test`.
2. Service báo cáo tài chính nội bộ `ReportService` qua endpoint `/api/reports/monthly?from=2026-10&to=2026-10`.
3. Nghiệp vụ quản lý ngân sách qua endpoint `/api/budgets/2026/10`.

| Chỉ số tài chính (Kỳ 2026-10) | MySQL Raw SQL | ReportService API | Budget API | AI Chat D14 Response | Đánh giá |
| --- | :---: | :---: | :---: | :---: | :---: |
| **Tổng thu nhập (Income)** | `20.000.000,00 ₫` | `20.000.000,00 ₫` | N/A | `20.000.000,00 ₫` | **Khớp 100%** |
| **Tổng chi tiêu (Expense)** | `12.500.000,00 ₫` | `12.500.000,00 ₫` | `12.500.000,00 ₫` | `12.500.000,00 ₫` | **Khớp 100%** |
| **Số dư thực tế (Balance)** | `7.500.000,00 ₫` | `7.500.000,00 ₫` | N/A | `7.500.000,00 ₫` | **Khớp 100%** |
| **Hạn mức ngân sách tháng** | `10.000.000,00 ₫` | N/A | `10.000.000,00 ₫` | `10.000.000,00 ₫` | **Khớp 100%** |
| **Số tiền vượt hạn mức** | `2.500.000,00 ₫` | N/A | `2.500.000,00 ₫` | `2.500.000,00 ₫` | **Khớp 100%** |
| **Trạng thái vượt (Exceeded)** | `true` | N/A | `true` | `true` | **Khớp 100%** |
| **Top 1: Ăn uống** | `5.000.000,00 ₫` (40%) | `5.000.000,00 ₫` | `5.000.000,00 ₫` | `5.000.000,00 ₫` (40,00%) | **Khớp 100%** |
| **Top 2: Chi tiêu hằng ngày** | `3.500.000,00 ₫` (28%) | `3.500.000,00 ₫` | N/A | `3.500.000,00 ₫` (28,00%) | **Khớp 100%** |
| **Top 3: Quần áo** | `2.000.000,00 ₫` (16%) | `2.000.000,00 ₫` | N/A | `2.000.000,00 ₫` (16,00%) | **Khớp 100%** |
| **Top 4: Tiền điện** | `1.000.000,00 ₫` (8%) | `1.000.000,00 ₫` | N/A | `1.000.000,00 ₫` (8,00%) | **Khớp 100%** |
| **Top 5: Đi lại** | `1.000.000,00 ₫` (8%) | `1.000.000,00 ₫` | N/A | `1.000.000,00 ₫` (8,00%) | **Khớp 100%** |

---

## 4. PHẦN III — NGHIỆM THU ROBOT 3D THREE.JS & GOOGLE CHROME THẬT (CDP)

Kịch bản kiểm thử Chrome CDP: [`scripts/qa/d14_live_robot_qa.mjs`](file:///F:/RikkeiEdu/personal-finance-management-DB/scripts/qa/d14_live_robot_qa.mjs)  
Fixture tích hợp Production: [`scripts/qa/d14_live_robot_fixture.jsx`](file:///F:/RikkeiEdu/personal-finance-management-DB/scripts/qa/d14_live_robot_fixture.jsx)  
Bằng chứng JSON chi tiết: [`docs/qa/evidence/d14-db/SE2-D14-DB_ROBOT_RESULTS.json`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/SE2-D14-DB_ROBOT_RESULTS.json)  
Trình duyệt thực thi: **Google Chrome Headless `157.0.8103.78`**, kết nối trực tiếp qua giao thức Chrome DevTools Protocol (CDP 1.3 WebSocket).  
Kết quả: **23 / 23 CA PASS 100% (0 FAIL)**.

### 4.1. Ma trận Kiểm thử Giao diện & Robot 3D
| Mã ca kiểm thử | Phạm vi kiểm tra | Điều kiện & Hành vi thực tế | Bằng chứng Screenshot | Trạng thái |
| --- | --- | --- | --- | :---: |
| **CHROME-LIVE-WEBGL-IDLE** | Robot 3D Khởi tạo | Canvas WebGL được tạo, robot hiển thị ở trạng thái `IDLE` (chớp mắt, nhấp nhô nhẹ). | [`live-idle-1440-light.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-idle-1440-light.png) | **PASS** |
| **CHROME-LIVE-LOADING-TO-SUCCESS-BUDGET** | Chuyển trạng thái Live | Gửi `"Ngân sách tháng 10/2026"`. Robot chuyển `LOADING` (nghiêng đầu), nhận response thật chuyển `SUCCESS`. Hiển thị lời khuyên D14 và vượt 2.5M. | [`live-budget-success-1440-light.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-budget-success-1440-light.png) | **PASS** |
| **CHROME-LIVE-COMPARISON-CHART** | Biểu đồ So sánh D13 | Gửi câu hỏi so sánh T9 & T10. Render biểu đồ SVG so sánh thu chi, mini-card chênh lệch và tỷ lệ tăng `25,00%`. | [`live-comparison-chart.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-comparison-chart.png) | **PASS** |
| **CHROME-LIVE-CATEGORIES-CHART** | Biểu đồ Danh mục D13 | Gửi câu hỏi danh mục. Render biểu đồ phân bổ chi tiêu với tỷ trọng % chính xác của các danh mục. | [`live-categories-chart.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-categories-chart.png) | **PASS** |
| **CHROME-LIVE-ERROR-RETRY** | Xử lý lỗi & Thử lại | Kích hoạt lỗi mạng/API: robot chuyển `ERROR` (mắt amber). Bấm `"Thử lại"`: khôi phục thành công sang `SUCCESS`. | [`live-error-state.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-error-state.png)<br>[`live-retry-recovery.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-retry-recovery.png) | **PASS** |
| **CHROME-LIVE-SVG-FALLBACK** | Fallback khi mất WebGL | Mở trang với `?webgl=off`. Hệ thống tự động chuyển sang fallback SVG an toàn, không crash giao diện. | [`live-no-webgl-fallback.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-no-webgl-fallback.png) | **PASS** |
| **CHROME-LIVE-CONTEXT-LOST-FALLBACK** | Mất ngữ cảnh WebGL | Kích hoạt sự kiện `webglcontextlost`. Fallback SVG lập tức hiển thị, giải phóng GPU resource. | [`live-context-lost-fallback.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-context-lost-fallback.png) | **PASS** |
| **CHROME-LIVE-REDUCED-MOTION** | Chế độ giảm chuyển động | Bật `prefers-reduced-motion: reduce`. Robot vẽ frame tĩnh một lần, hủy RAF liên tục (số draw call không tăng thêm). | [`live-reduced-motion.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-reduced-motion.png) | **PASS** |
| **CHROME-LIVE-RESPONSIVE (10 tests)** | 5 Viewports × 2 Themes | Kiểm tra trên các kích thước 320px, 375px, 430px, 768px, 1440px trên cả 2 theme Light & Dark. `overflow = false`, target >= 44px. | 10 ảnh đính kèm chi tiết tại mục 4.2 | **PASS** |
| **CHROME-LIVE-KEYBOARD-FOCUS** | Tiếp cận Bàn phím | Phím Tab di chuyển focus; Enter/Space mở panel chat; Escape đóng panel chat và phục hồi focus về launcher. | Accessible verification | **PASS** |
| **CHROME-LIVE-ACCOUNT-ISOLATION** | Phân tách Phiên A/B | Chuyển sang User B: xóa sạch hội thoại cũ của User A. User B hỏi chat: chỉ hiển thị số liệu của B (30M thu, 500k chi). | [`live-user-b-chat.png`](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-user-b-chat.png) | **PASS** |
| **CHROME-LIVE-DRAWER-PAUSES-RAF** | Tạm dừng khi Drawer mở | Mở Mobile Drawer: robot launcher tự động ẩn và tạm dừng animation loop để tiết kiệm pin/CPU. | Verified | **PASS** |
| **CHROME-LIVE-DISPOSE-ON-UNMOUNT** | Dọn dẹp Tài nguyên | Unmount widget: toàn bộ geometry, material, renderer và listeners được giải phóng sạch sẽ. | Verified | **PASS** |
| **CHROME-LIVE-JAVASCRIPT-CONSOLE** | Kiểm tra Console log | 0 lỗi JavaScript runtime console ngoài các fault chủ động kiểm tra fallback. | Console clean | **PASS** |

### 4.2. Danh sách Ảnh Bằng chứng Responsive (5 Viewports × 2 Themes)
- **320px (Mobile S):** [320px Light](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-320-light.png) | [320px Dark](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-320-dark.png)
- **375px (Mobile M):** [375px Light](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-375-light.png) | [375px Dark](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-375-dark.png)
- **430px (Mobile L):** [430px Light](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-430-light.png) | [430px Dark](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-430-dark.png)
- **768px (Tablet):** [768px Light](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-768-light.png) | [768px Dark](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-768-dark.png)
- **1440px (Desktop):** [1440px Light](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-1440-light.png) | [1440px Dark](file:///F:/RikkeiEdu/personal-finance-management-DB/docs/qa/evidence/d14-db/live-1440-dark.png)

---

## 5. PHẦN IV — BẢO MẬT, TÍNH TOÀN VẸN VÀ KIỂM SOÁT TÀI NGUYÊN

### 5.1. Kiểm tra Toàn vẹn Dữ liệu (Zero Mutation Check)
Thực hiện đếm toàn bộ bản ghi của tất cả các bảng trong MySQL trước và sau toàn bộ quá trình chạy kiểm thử AI Chat:
| Bảng cơ sở dữ liệu | Số bản ghi Trước | Số bản ghi Sau | Độ lệch (Delta) | Kết luận |
| --- | :---: | :---: | :---: | :---: |
| `users` | 3 | 3 | **0** | **Không đổi (Zero Mutation)** |
| `categories` | 51 | 51 | **0** | **Không đổi (Zero Mutation)** |
| `transactions` | 13 | 13 | **0** | **Không đổi (Zero Mutation)** |
| `monthly_budgets` | 7 | 7 | **0** | **Không đổi (Zero Mutation)** |
| `category_budgets` | 2 | 2 | **0** | **Không đổi (Zero Mutation)** |
| `password_reset_tokens` | 0 | 0 | **0** | **Không đổi (Zero Mutation)** |

Hệ thống AI Chat hoàn toàn tuân thủ thuộc tính **100% Read-Only**, không phát sinh bất kỳ lệnh `INSERT`, `UPDATE` hoặc `DELETE` ngoài ý muốn.

### 5.2. Phân tách Tài khoản A/B & Chống Tấn công
- **Bảo mật JWT:** Request không có JWT hoặc token giả mạo lập tức bị từ chối với mã lỗi `401 UNAUTHORIZED`.
- **Cô lập Người dùng:** User B không thể truy cập bất kỳ dữ liệu nào của User A.
- **Chống Prompt Injection:** Câu hỏi giả mạo như `"Xem chi tiêu của user 1"` lập tức bị định tuyến vào `UNSUPPORTED`, từ chối truy cập và không thực hiện truy vấn cơ sở dữ liệu.

### 5.3. Kiểm soát Tần suất (Rate Limiting) & Mô phỏng Gemini
- Đã kiểm tra bộ giới hạn tốc độ (Rate Limiter): Khi một người dùng gửi quá 10 request/phút, hệ thống trả về mã lỗi `429 AI_RATE_LIMITED` kèm thông báo tiếng Việt `"Tối đa 10 câu hỏi mỗi phút; vui lòng thử lại sau"`.
- Đảm bảo tính sẵn sàng cao (High Availability): Ngay sau khi một tài khoản bị chạm ngưỡng rate limit hoặc gặp lỗi provider, các truy vấn dữ liệu tài chính của tài khoản khác vẫn hoạt động bình thường, không bị nghẽn hay gián đoạn.
- Không gửi request hoặc tiêu tốn chi phí lên Gemini API thật khi chưa có phê duyệt.

---

## 6. PHẦN V — RÀ SOÁT CẢNH BÁO NPM AUDIT

Kết quả quét tự động từ lệnh `npm audit --json`: phát hiện tổng cộng **5 cảnh báo bảo mật** (1 High, 4 Moderate).

```json
"metadata": {
  "vulnerabilities": {
    "info": 0,
    "low": 0,
    "moderate": 4,
    "high": 1,
    "critical": 0,
    "total": 5
  }
}
```

### 6.1. Báo cáo Chi tiết Advisory Mức độ High
- **Package bị ảnh hưởng:** `follow-redirects` (phiên bản đang dùng qua dependency transitive: `>=1.16.0 <=1.16.1`).
- **Nguồn cảnh báo:** [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p), CWE-201, CVSS Score 5.9 (High).
- **Tiêu đề:** *"follow-redirects: Cross-realm sensitiveHeaders arrays are discarded and custom credentials can follow redirects"*.
- **Chuỗi phụ thuộc:** `frontend` $\rightarrow$ `axios` $\rightarrow$ `follow-redirects`.
- **Phân tích mức độ ảnh hưởng thực tế:**
  - Lỗ hổng xảy ra khi HTTP client nhận phản hồi chuyển hướng (3xx redirect) sang một domain khác (cross-realm) nhưng các header bảo mật nhạy cảm (Authorization) không bị xóa triệt để.
  - **Trong ứng dụng SmartExpense:** Frontend chỉ gửi request API tới backend nội bộ (same-origin hoặc qua Vite proxy `/api`). Hệ thống hoàn toàn không gọi hay điều hướng người dùng tới bất kỳ dịch vụ bên thứ ba nào thông qua Axios instance này.
  - Do đó, **rủi ro khai thác thực tế trong môi trường hiện tại được đánh giá ở mức THẤP**.
- **Khuyến nghị xử lý:**
  - Tuân thủ nghiêm ngặt chỉ đạo: **KHÔNG tự động chạy `npm audit fix`** vì lệnh này có nguy cơ nâng major version của các thư viện liên quan gây breaking change không kiểm soát.
  - Đề xuất tạo task bảo trì độc lập nâng cấp `axios` hoặc sử dụng `overrides` trong `package.json` lên `follow-redirects >= 1.16.2` sau khi toàn bộ sprint hoàn tất.

### 6.2. Các Cảnh báo Mức độ Moderate
- Bao gồm các package: `minimatch` ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)), `@eslint/config-array`, `eslint`, `@eslint/js`.
- **Ảnh hưởng:** Toàn bộ thuộc `devDependencies` phục vụ công cụ linter trong quá trình phát triển (development/build time), hoàn toàn **không đóng gói vào bundle client production**.
- **Khuyến nghị:** Giữ nguyên trạng thái để đảm bảo tương thích ổn định với bộ cấu hình ESLint hiện hành.

---

## 7. PHẦN VI — TỔNG HỢP KIỂM THỬ HỒI QUY (FULL REGRESSION)

| Hạng mục kiểm thử | Công cụ / Lệnh thực thi | Tiêu chí nghiệm thu | Kết quả thực tế | Trạng thái |
| --- | --- | --- | :---: | :---: |
| **Backend Regression** | `gradlew.bat test -x check` | 47 test suites, gồm D14, NLU, AI API | **1.252 / 1.252 PASS** (0 FAIL) | **PASS** |
| **Frontend Regression** | `npm test` | 535 unit/component tests | **535 / 535 PASS** (0 FAIL, 0 CANCELLED) | **PASS** |
| **Frontend Linter** | `npm run lint` | ESLint sạch, không warning | **PASS (0 errors, 0 warnings)** | **PASS** |
| **Frontend Production Build** | `npm run build` | Vite build hoàn tất bundle production | **PASS (dist tạo thành công)** | **PASS** |
| **Git Diff & Whitespace** | `git diff --check` | Không có lỗi whitespace / trailing space | **PASS (exit code 0)** | **PASS** |

---

## 8. PHẦN VII — DANH SÁCH FILE VÀ COMMIT MESSAGE ĐỀ XUẤT

### 8.1. Danh mục File tạo mới thuộc nhánh `feature/quynh`
Tất cả các file đều nằm trong thư mục riêng của QA và DB, hoàn toàn không xung đột hay ghi đè lên file của Tuấn và Trang:
1. `scripts/qa/d14_live_integration_qa.py` — Bộ harness kiểm thử tích hợp Live API & MySQL.
2. `scripts/qa/d14_live_robot_fixture.jsx` — Fixture giao diện kết nối Backend thật cho Chrome CDP.
3. `scripts/qa/d14_live_robot_qa.mjs` — Kịch bản Chrome CDP tự động hóa kiểm tra Robot 3D và giao diện.
4. `docs/qa/evidence/d14-db/SE2-D14-DB_LIVE_API_RESULTS.json` — Kết quả chi tiết 30 ca Live API.
5. `docs/qa/evidence/d14-db/SE2-D14-DB_ROBOT_RESULTS.json` — Kết quả chi tiết 23 ca Chrome CDP.
6. `docs/qa/evidence/d14-db/*.png` — Toàn bộ 20 ảnh chụp màn hình bằng chứng viewports, robot states và biểu đồ.
7. `docs/qa/evidence/SE2-D14-DB_RESULTS.json` — File tổng hợp kết quả nghiệm thu hợp nhất.
8. `docs/qa/SE2-D14-DB_REPORT.md` — Báo cáo tổng thể nghiệm thu này.

### 8.2. Đề xuất Commit Message (Tuân thủ Git Convention Tiếng Việt)
```text
test(qa): kiểm thử tích hợp live D14 gợi ý ngân sách, robot 3D Three.js và hồi quy toàn diện
```

---

## 9. KẾT LUẬN NGHIỆM THU

1. Toàn bộ 12 yêu cầu nhiệm vụ của **TASK: SE2-D14-DB — FINAL LIVE INTEGRATION & ROBOT 3D QA** đã được thực hiện nghiêm túc, đầy đủ và đạt chuẩn chất lượng 100%.
2. Backend D14 hoạt động chính xác với cơ chế gợi ý ngân sách thông minh, phân tích tỷ lệ trước khi làm tròn số học, bảo mật phân quyền và không ghi dữ liệu ngoài ý muốn.
3. Frontend D14 với Three.js Robot 3D tích hợp mượt mà, phản ánh đúng 4 trạng thái thật (IDLE, LOADING, SUCCESS, ERROR), hỗ trợ đầy đủ SVG fallback và reduced motion, tương thích 100% trên 5 kích thước viewport và 2 theme.
4. Mọi bằng chứng kiểm thử được ghi nhận trực tiếp từ hệ thống live (Google Chrome thật + Spring Boot thật + MySQL test cô lập), không dùng dữ liệu giả lập để nghiệm thu.
5. Toàn bộ stash và các thay đổi chưa commit được bảo toàn nguyên vẹn.

**STATUS: READY FOR COMMIT**  
*(Đang ở trạng thái sẵn sàng nghiệm thu, tuân thủ nghiêm ngặt quy tắc không tự ý commit, push, tạo PR, merge hoặc deploy; chờ phê duyệt của bạn).*

