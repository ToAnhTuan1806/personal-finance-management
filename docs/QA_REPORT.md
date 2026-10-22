# BÁO CÁO KIỂM THỬ TOÀN DIỆN SMARTEXPENSE (QA REPORT)

---

## 1. THÔNG TIN CHUNG & MÔI TRƯỜNG KIỂM THỬ

- **Dự án**: SmartExpense – Personal Finance Management
- **Thời điểm kiểm thử**: 21/10/2026 21:15:00 (GMT+7)
- **Git Branch**: `feature/frontend-ui-upgrade`
- **Git Commit SHA**: `9c4ca0ccaae46aded5307574731cb4887a060305`
- **Môi trường vận hành**:
  - **Operating System**: Windows 11 (64-bit)
  - **Node.js**: v24.18.0
  - **NPM**: 11.16.0
  - **Java SDK**: Java 21 LTS (`build 21.0.10+8-LTS-217`)
  - **Frontend Dev Server**: Vite 8.3.4 (`http://localhost:5173`)
  - **Backend Server**: Spring Boot 4.1.1 (`http://localhost:8080`)
  - **Database**: MySQL 8.0 (`localhost:3306`, database: `personal_finance_db`)
  - **Playwright Test Runner**: v1.64.1 (Chromium headless engine)

---

## 2. TỔNG HỢP KẾT QUẢ KIỂM THỬ (TEST SUMMARY)

| Bộ kiểm thử (Test Suite) | Tổng số | PASS | FAIL | SKIPPED | Tỷ lệ đạt |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **01. Authentication & Protected Routes** (`01_auth.spec.js`) | 7 | 7 | 0 | 0 | 100% |
| **02. Categories Management & PillTabs #039** (`02_categories.spec.js`) | 6 | 6 | 0 | 0 | 100% |
| **03. Transactions, MoneyInput #035 & DateRange #030** (`03_transactions.spec.js`) | 7 | 7 | 0 | 0 | 100% |
| **04. Monthly Budgets & Over-budget Alerts** (`04_budgets.spec.js`) | 5 | 5 | 0 | 0 | 100% |
| **05. Dashboard, AnimatedMetrics #098 & DonutChart #097** (`05_dashboard.spec.js`) | 5 | 5 | 0 | 0 | 100% |
| **06. UI/UX Ergonomics & Multi-tenant Security** (`06_ui_ux_security.spec.js`) | 7 | 7 | 0 | 0 | 100% |
| **TỔNG CỘNG** | **37** | **37** | **0** | **0** | **100%** |

- **ESLint Check**: `npm run lint` -> **0 errors, 0 warnings (PASS)**.
- **Production Build Check**: `npm run build` -> **Vite bundle compiled in 410ms (PASS)**.

---

## 3. CHI TIẾT DANH SÁCH BÀI TEST THỰC THI

### Suite 01: Authentication & Protected Routes (`e2e/01_auth.spec.js`)
- [x] **TEST 01**: Đăng ký tài khoản mới hợp lệ (tạo user duy nhất, nhận HTTP 201, chuyển hướng hoặc thông báo đăng ký thành công). `PASS`
- [x] **TEST 02**: Đăng ký trùng email phải trả về mã lỗi 409 Conflict và hiển thị thông báo lỗi thân thiện trên form. `PASS`
- [x] **TEST 03**: Client-side validation: chặn gửi form khi định dạng email sai hoặc mật khẩu xác nhận không khớp. `PASS`
- [x] **TEST 04**: Đăng nhập thất bại khi sai mật khẩu -> nhận HTTP 401/400 và báo lỗi rõ ràng. `PASS`
- [x] **TEST 05**: Đăng nhập thành công với tài khoản demo -> lưu JWT token vào `sessionStorage` và điều hướng vào Dashboard. `PASS`
- [x] **TEST 06**: `ProtectedRoute` chặn truy cập trực tiếp các route (`/`, `/transactions`, `/categories`, `/budgets`) khi chưa đăng nhập và redirect về `/login`. `PASS`
- [x] **TEST 07**: Đăng xuất xóa bỏ hoàn toàn JWT trong `sessionStorage` và chuyển người dùng về trang đăng nhập. `PASS`

### Suite 02: Categories Management & PillTabs #039 (`e2e/02_categories.spec.js`)
- [x] **TEST 01**: Lọc danh mục với PillTabs #039 ("Tất cả", "Thu nhập", "Chi tiêu") và kiểm tra trạng thái `aria-pressed`. `PASS`
- [x] **TEST 02**: Validation form danh mục: chặn để trống tên danh mục hoặc tên vượt quá 100 ký tự. `PASS`
- [x] **TEST 03**: Thêm mới danh mục Thu nhập và Chi tiêu -> lưu thành công vào MySQL và cập nhật UI ngay lập tức. `PASS`
- [x] **TEST 04**: Chỉnh sửa tên danh mục -> cập nhật DB và phản hồi tức thì trên danh sách. `PASS`
- [x] **TEST 05**: Chặn xóa danh mục đã có giao dịch phát sinh (kiểm tra với danh mục "Ăn uống") -> hiển thị cảnh báo nghiệp vụ rõ ràng, không làm crash ứng dụng. `PASS`
- [x] **TEST 06**: Xóa danh mục test và dọn dẹp dữ liệu an toàn sau kiểm thử. `PASS`

### Suite 03: Transactions, MoneyInput #035 & DateRangePicker #030 (`e2e/03_transactions.spec.js`)
- [x] **TEST 01**: Kiểm tra lọc loại giao dịch trên bảng (PillTabs) và đồng bộ danh mục theo loại trong Modal thêm giao dịch. `PASS`
- [x] **TEST 02**: Kiểm tra Money Input #035: định dạng phân tách hàng nghìn (VD: `1.500.000 ₫`), các nút chip cộng nhanh (`+100.000`), và validation số tiền <= 0. `PASS`
- [x] **TEST 03**: Thêm mới giao dịch thành công và đối chiếu trực tiếp với DB/API Spring Boot: số tiền lưu trữ là dạng số thực (`185000.00`), không bị format chuỗi sai lệch. `PASS`
- [x] **TEST 04**: Tìm kiếm giao dịch theo từ khóa ghi chú và nút "Đặt lại bộ lọc". `PASS`
- [x] **TEST 05**: Lọc khoảng ngày DateRangePicker #030: kiểm tra chọn 1 ngày duy nhất và chọn khoảng ngày xuyên tháng (cross-month); **xác nhận API request chỉ gửi `startDate` và `endDate`, tuyệt đối không gửi kèm tham số `month`**. `PASS`
- [x] **TEST 06**: Chỉnh sửa số tiền và ghi chú giao dịch thành công. `PASS`
- [x] **TEST 07**: Xóa giao dịch test và dọn dẹp dữ liệu an toàn. `PASS`

### Suite 04: Monthly Budgets & Over-budget Alerts (`e2e/04_budgets.spec.js`)
- [x] **TEST 01**: Kiểm tra hiển thị ngân sách tháng hiện tại (10/2026), tính toán chính xác số tiền hạn mức, số tiền đã chi, số dư còn lại và thanh tiến độ `progressbar`. `PASS`
- [x] **TEST 02**: Tạo mới ngân sách cho tháng chưa có cấu hình (tháng 06/2028). `PASS`
- [x] **TEST 03**: Cập nhật hạn mức ngân sách qua HTTP PUT. `PASS`
- [x] **TEST 04**: Xóa ngân sách qua modal xác nhận và kiểm tra giao diện quay về trạng thái "Chưa thiết lập ngân sách". `PASS`
- [x] **TEST 05**: Tình huống vượt hạn mức ngân sách: hạ hạn mức xuống thấp hơn chi tiêu thực tế -> kích hoạt thông báo `Cảnh báo vượt ngân sách!` kèm số tiền đã chi vượt và đổi màu thanh tiến độ; sau đó khôi phục lại hạn mức ban đầu. `PASS`

### Suite 05: Dashboard, AnimatedMetrics #098 & ExpenseDonutChart #097 (`e2e/05_dashboard.spec.js`)
- [x] **TEST 01**: Đối chiếu trực tiếp tổng thu nhập, tổng chi tiêu và số dư trên widget Dashboard với API Spring Boot `/api/dashboard/summary`. `PASS`
- [x] **TEST 02**: Kiểm tra Animated Metrics #098: chuyển đổi mượt mà giữa các tab chỉ số, kiểm tra nút làm mới xoay đồng bộ, và **xác nhận thông báo trạng thái xu hướng không tự sinh số liệu giả**. `PASS`
- [x] **TEST 03**: Kiểm tra Donut Chart #097: dữ liệu danh mục thực từ Spring Boot, tương tác hover lát cắt biểu đồ và tính năng loại trừ / khôi phục danh mục (Re-splits). `PASS`
- [x] **TEST 04**: Đổi tháng thống kê trên header và kiểm tra gọi API đồng bộ cho cả 3 widget. `PASS`
- [x] **TEST 05**: Danh sách 5 giao dịch gần đây và liên kết điều hướng "Xem tất cả" sang trang Quản lý giao dịch. `PASS`

### Suite 06: UI/UX Ergonomics & Multi-tenant Security (`e2e/06_ui_ux_security.spec.js`)
- [x] **TEST 01**: Sidebar #040: Thu gọn / mở rộng, ghi nhớ trạng thái vào `localStorage`, và highlight đúng route đang truy cập (`is-active`). `PASS`
- [x] **TEST 02**: Hỗ trợ phím điều hướng mũi tên (ArrowUp / ArrowDown) chuyển focus giữa các mục menu trên Sidebar. `PASS`
- [x] **TEST 03**: Floating Label #025 và Auth Card #062: hiệu ứng focus viền notch, nhãn nổi và dấu tick xác thực email hợp lệ. `PASS`
- [x] **TEST 04**: Responsive Mobile (viewport 375x667): menu hamburger hiển thị, drawer trượt ra, bấm phím Escape đóng drawer. `PASS`
- [x] **TEST 05**: Hỗ trợ phím Escape đóng dialog / modal (Accessibility). `PASS`
- [x] **TEST 06**: Security Authentication: Toàn bộ API yêu cầu xác thực (`/api/users/me`, `/api/categories`, `/api/transactions`, `/api/budgets/*`, `/api/dashboard/*`) đều từ chối HTTP 401 khi không gửi JWT token. `PASS`
- [x] **TEST 07**: Multi-tenant Data Isolation: Người dùng A (Demo User) không thể xem, sửa hoặc xóa danh mục và giao dịch của Người dùng B; các hành vi cố ý truy cập chéo đều bị chặn hoàn toàn (HTTP 400/403/404). `PASS`

---

## 4. CÁC LỖI PHÁT HIỆN & BIỆN PHÁP KHẮC PHỤC (BUG TRACKING & FIXES)

### BUG-01: Đăng ký trùng email trả về HTTP 401 thay vì HTTP 409
- **Mức độ**: `CRITICAL` (Ảnh hưởng đến luồng đăng ký tài khoản và trải nghiệm người dùng)
- **Nơi xảy ra**: Backend Spring Boot (`SecurityConfig.java`)
- **Mô tả**: Khi người dùng đăng ký bằng email đã tồn tại trong hệ thống, `AuthService` ném `ResponseStatusException(HttpStatus.CONFLICT, "Email đã được đăng ký")`. Tuy nhiên, do Spring Security 6 chưa cho phép `permitAll()` đối với dispatch `/error`, request bị bộ lọc bảo mật chặn và chuyển thành `401 Unauthorized` kèm trang HTML lỗi mặc định thay vì JSON 409.
- **Cách khắc phục**:
  1. Thêm `GlobalExceptionHandler.java` sử dụng `@RestControllerAdvice` để bắt `ResponseStatusException` và `MethodArgumentNotValidException`, trả về JSON có cấu trúc chuẩn `{ status, message, timestamp }`.
  2. Bổ sung cấu hình `.requestMatchers("/error").permitAll()` và `.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()` trong `SecurityConfig.java`.
- **Kết quả sau sửa**: API đăng ký trùng email trả về đúng `HTTP 409 Conflict` kèm thông báo tiếng Việt, frontend hiển thị thông báo lỗi rõ ràng trên thẻ AuthCard.

---

### BUG-02: DateRangePicker #030 không cho phép chọn khoảng ngày có độ dài 1 ngày
- **Mức độ**: `MEDIUM` (Ảnh hưởng tính năng lọc báo cáo giao dịch theo một ngày cụ thể)
- **Nơi xảy ra**: Frontend React (`src/components/ui/DateRangePicker.jsx`)
- **Mô tả**: Trong hàm `selectDate(key)` của component #030, khi người dùng click vào một ngày đã được chọn làm `start` để làm cả ngày kết thúc (khoảng 1 ngày), logic cũ thực hiện `else if (key === start) setEnd('')`. Do nút "Áp dụng" yêu cầu `disabled={!start || !end}`, người dùng không thể lọc giao dịch của một ngày duy nhất.
- **Cách khắc phục**:
  Chỉnh sửa `selectDate(key)` trong `DateRangePicker.jsx`: khi `key === start` và `end` đang trống, gán `setEnd(key)` để tạo khoảng 1 ngày hợp lệ (`startDate == endDate`).
- **Kết quả sau sửa**: Người dùng click đúp hoặc chọn lại ngày để lọc chính xác các giao dịch trong một ngày duy nhất; badge hiển thị đúng `YYYY-MM-DD → YYYY-MM-DD`.

---

## 5. BẰNG CHỨNG KIỂM THỬ (TEST EVIDENCE & SECURITY SANITIZATION)

### 5.1. Bằng chứng API Request / Response (Đã ẩn dữ liệu nhạy cảm)

- **API Đăng ký trùng email**:
  - Request: `POST http://localhost:8080/api/auth/register` (Payload: `email="demo@smartexpense.local", password="[REDACTED]"`)
  - Response: `HTTP 409 Conflict`
  - Body:
    ```json
    {
      "status": 409,
      "message": "Email đã được đăng ký",
      "timestamp": "2026-10-21T13:48:00.000+00:00"
    }
    ```

- **API Lọc giao dịch theo khoảng ngày (Kiểm tra hợp đồng query params)**:
  - Request: `GET http://localhost:8080/api/transactions?startDate=2026-10-21&endDate=2026-10-21&page=0&size=10`
  - Header: `Authorization: Bearer eyJhbGciOi...[REDACTED]`
  - Kết quả xác nhận: **Không chứa tham số `month`**, backend lọc đúng trong phạm vi ngày yêu cầu.

- **API Multi-tenant Security Check**:
  - Request từ User A tấn công giao dịch User B: `PUT http://localhost:8080/api/transactions/999`
  - Response: `HTTP 404 / 400 Bad Request` (Dữ liệu hoàn toàn được cô lập theo `userId` từ token).

### 5.2. File cấu hình & báo cáo tự động
- File cấu hình Playwright: [playwright.config.js](file:///f:/RikkeiEdu/personal-finance-management/frontend/playwright.config.js)
- Thư mục kiểm thử: [e2e/](file:///f:/RikkeiEdu/personal-finance-management/frontend/e2e)
- File nhật ký kết quả chi tiết: [playwright-results.json](file:///f:/RikkeiEdu/personal-finance-management/frontend/playwright-results.json)

---

## 6. DANH SÁCH CÁC FILE ĐÃ CHỈNH SỬA & TẠO MỚI

1. [GlobalExceptionHandler.java](file:///f:/RikkeiEdu/personal-finance-management/backend/src/main/java/com/smartexpense/backend/exception/GlobalExceptionHandler.java) *(Mới tạo - xử lý chuẩn hóa ngoại lệ REST)*
2. [SecurityConfig.java](file:///f:/RikkeiEdu/personal-finance-management/backend/src/main/java/com/smartexpense/backend/config/SecurityConfig.java) *(Sửa - mở quyền dispatch lỗi `/error`)*
3. [DateRangePicker.jsx](file:///f:/RikkeiEdu/personal-finance-management/frontend/src/components/ui/DateRangePicker.jsx) *(Sửa - hỗ trợ lọc 1 ngày duy nhất)*
4. [playwright.config.js](file:///f:/RikkeiEdu/personal-finance-management/frontend/playwright.config.js) *(Mới tạo - cấu hình kiểm thử E2E)*
5. [e2e/helpers.js](file:///f:/RikkeiEdu/personal-finance-management/frontend/e2e/helpers.js) *(Mới tạo - helper đăng nhập & hằng số)*
6. [e2e/01_auth.spec.js](file:///f:/RikkeiEdu/personal-finance-management/frontend/e2e/01_auth.spec.js) *(Mới tạo - kiểm thử xác thực)*
7. [e2e/02_categories.spec.js](file:///f:/RikkeiEdu/personal-finance-management/frontend/e2e/02_categories.spec.js) *(Mới tạo - kiểm thử danh mục)*
8. [e2e/03_transactions.spec.js](file:///f:/RikkeiEdu/personal-finance-management/frontend/e2e/03_transactions.spec.js) *(Mới tạo - kiểm thử giao dịch, MoneyInput & DateRange)*
9. [e2e/04_budgets.spec.js](file:///f:/RikkeiEdu/personal-finance-management/frontend/e2e/04_budgets.spec.js) *(Mới tạo - kiểm thử ngân sách)*
10. [e2e/05_dashboard.spec.js](file:///f:/RikkeiEdu/personal-finance-management/frontend/e2e/05_dashboard.spec.js) *(Mới tạo - kiểm thử tổng quan, #097 & #098)*
11. [e2e/06_ui_ux_security.spec.js](file:///f:/RikkeiEdu/personal-finance-management/frontend/e2e/06_ui_ux_security.spec.js) *(Mới tạo - kiểm thử UI/UX & bảo mật)*
12. [docs/QA_REPORT.md](file:///f:/RikkeiEdu/personal-finance-management/frontend/docs/QA_REPORT.md) *(Mới tạo - Báo cáo QA toàn diện)*

---

## 7. ĐÁNH GIÁ CUỐI CÙNG (FINAL VERDICT)

> ### **KẾT LUẬN: READY TO MERGE**
> 
> - **Chức năng nghiệp vụ**: Toàn bộ luồng Auth, Categories, Transactions, Monthly Budgets, Dashboard, Animated Metrics và Donut Chart hoạt động chính xác với cơ sở dữ liệu thật MySQL và Spring Boot API.
> - **Bộ kiểm thử tự động**: 37/37 bài test Playwright E2E đều đạt trạng thái `PASS`.
> - **Chất lượng mã nguồn**: Không có lỗi ESLint (`0 errors, 0 warnings`), bản build production hoàn thành trơn tru không lỗi.
> - **Tính an toàn**: Dữ liệu seed demo được bảo toàn nguyên vẹn; các kiểm thử test-data đều được dọn dẹp sạch sẽ sau khi thực thi.
> - **Quy định Git**: Dự án hiện vẫn được giữ nguyên trên nhánh `feature/frontend-ui-upgrade`, không tự động push, không tạo PR và không merge vào `dev`. Sẵn sàng để đội ngũ kỹ thuật review và duyệt merge.
