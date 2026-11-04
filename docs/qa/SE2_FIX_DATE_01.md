# SE2-FIX-DATE-01-QA — Date Validation

## 1. Ngày kiểm thử và phiên bản

- Ngày: **04/11/2026**, người phụ trách: Phạm Hương Quỳnh; FR-05, FR-12.
- Workspace: `F:\RikkeiEdu\personal-finance-management`; nhánh `feature/quynh`, HEAD `7e56bdcddf21f044522c9a714962bacf35f5ba71`.
- Backend được kiểm thử: `991b402d37215dc52cb3b88ee4cf427334fec0cc` (`feature/tuan`).
- Frontend được kiểm thử: `4a2cd3ede661cb75b8ba7224083b2d26867afeb8` (`feature/trang`).
- Kiểm thử trên bản sao QA tích hợp trong `backend/build/se2-date-qa-20261104/snapshot`, bảo toàn nguyên vẹn Git blob của BE (`991b402`) và FE (`4a2cd3e`); 198 file nguồn đã được đối chiếu hash. Không merge trước vào `dev`.
- Không chuyển nhánh hoặc sửa Git history. Author ở lượt QA ban đầu là `Trang2636`; tại lần rà soát cuối, sau khi người dùng tự chỉnh cấu hình, author đã là `Quynh181226 <phamhuongquynh2k6@gmail.com>`. Codex không đổi author; chưa stage theo chỉ dẫn mới nhất.

---

## 2. Môi trường kiểm thử

- **Local OS:** Windows; JDK 21.0.10, Spring Boot 4.1.1, Gradle Wrapper; Node.js 24.18.0, npm; Postman CLI 1.74.0.
- **Database Test:** MySQL **8.0.46** Testcontainers, tạo container/database/credential độc lập ngẫu nhiên trên loopback, không đụng chạm dữ liệu hay cấu hình production.
- **Backend Test Host:** HTTP Server chạy trên `127.0.0.1`, cổng ngẫu nhiên (không dùng 80/443/8080); kiểm tra độ bền múi giờ trên JVM `America/Los_Angeles` và Clock Asia/Ho_Chi_Minh.
- **Quy tắc an toàn:** Không dùng production/VPS/database production; không chạy Docker Compose; không cài đặt Playwright E2E; không để lộ secret/JWT.

---

## 3. Kết quả các ca kiểm thử bắt buộc

**Cập nhật kiểm thử thủ công ngày 04/11/2026:** Người dùng xác nhận trong hội thoại: “Tôi đã hoàn tất kiểm thử thủ công 5 ca TC08, TC09, TC11, TC12, TC13 và xác nhận đều PASS.” Đây là nguồn bằng chứng cho đúng 5 ca bên dưới, **không phải kết quả Browser Agent**. Không có screenshot hoặc log browser mới được cung cấp; không tạo thêm bằng chứng giả. Xác nhận 5 ca ở lượt trước không bao gồm Burp; xác nhận bổ sung về intercept POST/PUT được ghi riêng tại Mục 6.2. Chưa có xác nhận kiểm tra Mobile/Dark Mode riêng.

| ID | Trường hợp | Kết quả | Bằng chứng thực tế |
|---|---|---|---|
| TC01 | POST hôm nay | **PASS** | HTTP/JUnit và Postman: 201 Created, đọc lại đúng ngày, SQL khớp chính xác. |
| TC02 | POST hôm qua | **PASS** | HTTP/JUnit và Postman: 201 Created, ngày không bị đổi. |
| TC03 | POST năm 1970 | **PASS** | HTTP/JUnit và Postman: 201 Created, SQL lưu đúng `1970-01-01`; không có giới hạn năm tối thiểu. |
| TC04 | POST ngày mai | **PASS** | HTTP/JUnit và Postman: 400 Bad Request, code `VALIDATION_ERROR`, lỗi `transactionDate: Ngày giao dịch không được lớn hơn ngày hiện tại.`; database không thêm dòng mới. |
| TC05 | PUT ngày mai | **PASS** | HTTP/JUnit và Postman: 400 Bad Request, lỗi theo field; GET/SQL xác nhận toàn bộ hàng giữ nguyên. |
| TC06 | POST ngày không tồn tại | **PASS** | HTTP/JUnit và Postman: `2026-02-30` trả 400; SQL không đổi. |
| TC07 | PUT ngày không tồn tại | **PASS** | HTTP/JUnit và Postman: 400; SQL không đổi. |
| TC08 | Quá 5 năm: cảnh báo, vẫn lưu | **PASS (Manual — người dùng xác nhận)** | Người dùng xác nhận đã kiểm thử thủ công TC08 và PASS: có cảnh báo, vẫn lưu được. Giữ bằng chứng tự động trước đó: Unit/SSR `transactionModal.test.js` kiểm tra cảnh báo amber `role="status"`, `aria-describedby="transaction-date-warning"`, Submit không bị khóa; Quick Add/Axios và API lưu thành công. Browser Agent không chạy ca này. |
| TC09 | Đúng 5 năm: không cảnh báo | **PASS (Manual — người dùng xác nhận)** | Người dùng xác nhận đã kiểm thử thủ công TC09 và PASS: đúng 5 năm không cảnh báo quá 5 năm. Unit `transactionDate.test.js` trước đó kiểm tra mốc năm lịch, gồm năm nhuận, PASS. Browser Agent không chạy ca này. |
| TC10 | Server khác timezone | **PASS** | HTTP production Clock trên JVM `America/Los_Angeles` PASS; 16 test ngày gồm trước/sau nửa đêm Việt Nam PASS. Frontend có test riêng với Los Angeles/Kiritimati/UTC không bị lệch ngày. |
| TC11 | Refresh sau cập nhật | **PASS (Manual — người dùng xác nhận)** | Người dùng xác nhận đã kiểm thử thủ công TC11 và PASS: refresh sau cập nhật vẫn hiển thị đúng ngày. Giữ bằng chứng API/SQL trước đó: PUT hợp lệ → HTTP GET mới và SQL khớp ngày cập nhật. Browser Agent không chạy ca này. |
| TC12 | Quick Add ngày tương lai | **PASS (Manual — người dùng xác nhận)** | Người dùng xác nhận đã kiểm thử thủ công TC12 và PASS: Quick Add không lưu ngày tương lai. Giữ bằng chứng Component/Guard trước đó: validator từ chối, modal báo lỗi `transactionDate` và giữ ngày nhập. Browser Agent không chạy ca này. |
| TC13 | Calendar tương lai | **PASS (Manual — người dùng xác nhận)** | Người dùng xác nhận đã kiểm thử thủ công TC13 và PASS: xem được ngày tương lai, không lưu được giao dịch tương lai. Giữ bằng chứng selection/điều hướng và SSR trước đó: form giữ ngày, báo lỗi tại field. Browser Agent không chạy ca này. |
| TC14 | GET lọc ngày tương lai | **PASS** | QA seed bản ghi tương lai trong database test; GET khoảng ngày đó trả 200 OK và đúng bản ghi. Quy tắc ghi mới không chặn truy vấn dữ liệu cũ. |
| TC15 | PUT sai không thay đổi bản ghi | **PASS** | Đối chiếu toàn bộ các cột SQL trước và sau (ngày, tiền, note, user_id, category_id, timestamp); không thay đổi dù chỉ một trường. |

**Tổng TC01–TC15:** **15 PASS, 0 FAIL, 0 BLOCKED**; trong đó 5 ca được cập nhật theo xác nhận kiểm thử thủ công của người dùng. Các số liệu tự động giữ nguyên, không cộng số ca manual vào số test tự động. **Gate intercept Burp POST/PUT: PASS (Manual — người dùng xác nhận)**, ghi riêng, không cộng vào tổng 15 ca này.

---

## 4. Kiểm thử Backend & Regression tự động

- **Toàn bộ Backend Regression trên snapshot:** **426/426 PASS, 0 FAIL, 0 ERROR, 0 SKIPPED** (19 JUnit XML suites).
- **Lớp kiểm thử Date Validation Backend (`TransactionDateIntegrationTests`):** **16/16 PASS** (thời gian 29.07s trên MySQL Testcontainers thật).
- **Lớp QA HTTP độc lập (`DateValidationIndependentQaTests`):** **26/26 PASS**, bao gồm kiểm thử độ bền múi giờ JVM Los Angeles.
- **Gate D03 (`verifyD03IntegrationTests`):** **55/55 PASS**.

---

## 5. Kiểm thử Frontend tự động

- **Toàn bộ Frontend Tests trên snapshot:** **342/342 PASS, 0 FAIL, 0 CANCELLED, 0 SKIPPED** (`npm.cmd test`).
- **Frontend Lint:** `npm.cmd run lint` **PASS** (0 lỗi).
- **Frontend Build:** `npm.cmd run build` **PASS** (Vite build thành công trong 691ms).
- **Chi tiết kiểm thử giao diện & form:**
  - `transactionDate.test.js`: Bao phủ hôm nay/hôm qua/ngày mai/1970/ngày không tồn tại, ngưỡng 5 năm, xử lý năm nhuận, timer qua nửa đêm Việt Nam, giữ nguyên form sau lỗi.
  - `transactionModal.test.js`: Cảnh báo amber `OLD_DATE_WARNING`, class `bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200`, thuộc tính accessibility (`role="status"`, `role="alert"`), nút Lưu không bị disabled khi có cảnh báo.

---

## 6. Kiểm thử Postman & Tình trạng Burp Suite

### 6.1. Postman CLI
- Chạy collection `date-qa.postman_collection.json` trên HTTP server local: **17/17 assertions PASS, 0 lỗi, exit code 0**.
- Cơ sở dữ liệu sau kiểm thử: **3 dòng hợp lệ, 0 dòng ngày tương lai**.

### 6.2. Burp Suite: PASS (Manual — người dùng xác nhận)
- **Trạng thái:** **PASS**, theo kết quả kiểm thử thủ công được người dùng xác nhận ngày 04/11/2026; **không phải Antigravity hoặc Codex tự thực hiện**.
- **Nguồn bằng chứng:** Trong hội thoại, người dùng trả lời “Đúng, cả POST và PUT đều đạt” khi được hỏi xác nhận cả hai request sửa ngày thành ngày mai đều trả HTTP 400, POST không tạo bản ghi và PUT giữ nguyên dữ liệu cũ.
- **POST:** Người dùng xác nhận intercept, đổi `transactionDate` sang ngày mai và gửi: **HTTP 400**, không tạo bản ghi mới.
- **PUT:** Người dùng xác nhận intercept, đổi `transactionDate` sang ngày mai và gửi: **HTTP 400**, dữ liệu giao dịch cũ không bị sửa sai.
- **Giới hạn bằng chứng:** Nguồn mới là xác nhận thủ công trong hội thoại; không có screenshot, Burp project hoặc log request/response mới được cung cấp. Không tạo bằng chứng giả, không ghi JWT/password. Trạng thái BLOCKED trước đây do công cụ agent không khả dụng được thay bằng xác nhận của người kiểm thử, không phải một lượt chạy mới của agent.
- **Bằng chứng API độc lập, không thay thế xác nhận Burp:** Các request kiểm thử đã được thực hiện qua HTTP client trực tiếp (Postman và JUnit `HttpClient` độc lập), xác nhận:
  - Khi gửi payload JSON có `transactionDate` là ngày mai qua POST hoặc PUT, Backend chặn ngay lập tức tại validator:
    ```json
    {
      "status": 400,
      "code": "VALIDATION_ERROR",
      "errors": {
        "transactionDate": "Ngày giao dịch không được lớn hơn ngày hiện tại."
      }
    }
    ```
  - SQL không có bản ghi mới nào được tạo hoặc cập nhật.

---

## 7. Hướng dẫn tự kiểm thử Burp Suite (Dành cho Tester)

Để tự thực hiện kiểm thử Burp Suite thực tế:

1. **Khởi động Burp Suite:** Mở Burp Suite Community / Professional, bật `Proxy > Intercept is on` (cổng mặc định `127.0.0.1:8080`).
2. **Cấu hình Trình duyệt:** Cấu hình trình duyệt trỏ HTTP proxy về `127.0.0.1:8080` (hoặc dùng Burp's Embedded Browser).
3. **Thực hiện Test POST:**
   - Trên giao diện SmartExpense, mở form Thêm giao dịch, nhập thông tin hợp lệ (chọn ngày hôm nay).
   - Nhấn **Lưu giao dịch**. Request `POST /api/transactions` sẽ bị chặn trong tab Intercept của Burp.
   - Sửa trường `"transactionDate": "2026-11-04"` thành ngày mai (ví dụ `"2026-11-05"`).
   - Nhấn **Forward**.
   - **Kỳ vọng:** Response nhận được là HTTP 400, body chứa `{"status":400,"code":"VALIDATION_ERROR","errors":{"transactionDate":"Ngày giao dịch không được lớn hơn ngày hiện tại."}}`. Kiểm tra danh sách giao dịch không có dòng mới.
4. **Thực hiện Test PUT:**
   - Mở một giao dịch có sẵn, nhấn Sửa.
   - Bắt request `PUT /api/transactions/{id}` trong Burp.
   - Đổi `"transactionDate"` thành ngày mai và Forward.
   - **Kỳ vọng:** Response nhận HTTP 400. Kiểm tra giao dịch cũ trên web giữ nguyên ngày ban đầu.

---

## 8. Bảng tổng hợp kết quả cuối cùng

| Test | Kết quả | Bằng chứng |
|---|---|---|
| **Browser Create** | **PASS (Manual: TC08, TC12, TC13)** | Người dùng xác nhận đúng các ca này PASS; Browser Agent không chạy. Giữ nguyên bằng chứng JUnit/FE/Postman trước đó; không suy rộng xác nhận sang những thao tác browser khác. |
| **Browser Update / Refresh** | **PASS (Manual: TC11)** | Người dùng xác nhận refresh sau cập nhật hiển thị đúng ngày. Kiểm tra PUT ngày mai trả 400 và bảo toàn SQL vẫn dựa trên JUnit/Postman, không gán thành bằng chứng manual mới. |
| **Cảnh báo quá 5 năm / đúng 5 năm** | **PASS (Manual: TC08, TC09)** | Người dùng xác nhận cảnh báo khi quá 5 năm vẫn cho lưu, đúng 5 năm không cảnh báo. Giữ nguyên bằng chứng SSR/Component đã có; không có screenshot mới. |
| **Quick Add / Calendar** | **PASS (Manual: TC12, TC13)** | Người dùng xác nhận Quick Add không lưu ngày tương lai; Calendar vẫn xem được, không lưu giao dịch tương lai. Giữ nguyên bằng chứng Component/Guard đã có. |
| **Mobile / Dark Mode** | **BROWSER BLOCKED (Visual rendering) / PASS (Code Review)** | Component có đầy đủ class `dark:...`, `sm:...`; responsive grid chuẩn; SSR test render thành công cả theme sáng và tối. |
| **Burp POST / PUT** | **PASS (Manual — người dùng xác nhận)** | Người dùng xác nhận cả POST và PUT sau khi đổi ngày sang ngày mai đều trả HTTP 400; POST không thêm bản ghi, PUT giữ nguyên dữ liệu cũ. Antigravity/Codex không tự chạy Burp; không có screenshot/log mới. Postman 17/17 và QA 26/26 vẫn là bằng chứng tự động riêng. |

---

## 9. Kết luận nghiệm thu

**Đánh giá:** **ACCEPTED — SE2-FIX-DATE-01-QA**

**Lý do:**
- **TC01–TC15:** 15/15 PASS; TC08, TC09, TC11, TC12, TC13 được người dùng xác nhận kiểm thử thủ công. Không còn BLOCKED trong bảng 15 ca này.
- **Tự động:** Giữ nguyên Backend **426/426**, Frontend **342/342**, QA **26/26**, Postman **17/17** PASS; không chạy lại hoặc cộng gộp số liệu trong lượt cập nhật tài liệu này.
- **Gate Burp:** POST và PUT đều được người dùng xác nhận **HTTP 400 và bảo toàn dữ liệu**. Không còn tiêu chí nghiệm thu bắt buộc của task bị BLOCKED; kết luận ACCEPTED dựa trên kết quả tự động đã có cùng xác nhận thủ công, không phải agent tự thực hiện browser/Burp.
- Mobile/Dark Mode riêng chưa có xác nhận mới; giữ nguyên giới hạn bằng chứng tại Mục 8, không suy diễn PASS cho hạng mục kiểm tra bổ sung này. Hạng mục đó không thuộc 15 ca bắt buộc hoặc gate Burp của task Date Validation.
- Không tạo screenshot/log giả, không sửa Backend/Frontend. Người dùng đã tự chỉnh Git author sang Quỳnh; **chưa stage theo chỉ dẫn mới nhất**, Codex không đổi author hoặc tự commit/push/merge, không chuyển Trello sang Done. Dừng để review báo cáo.
