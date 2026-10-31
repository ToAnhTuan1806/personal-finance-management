# SmartExpense Frontend

Giao diện quản lý tài chính cá nhân của SmartExpense, xây dựng bằng React và kết nối REST API của backend Spring Boot.

## Chức năng

### D01–D04: sitemap, Quick Add và lịch tháng

| Màn hình | Route | Điểm mở nhập liệu |
| --- | --- | --- |
| Tổng quan / landing khi chưa đăng nhập | `/` | Hai nút Thêm Thu/Chi mở trực tiếp modal |
| Thu chi nhanh | `/quick-add` | Chọn INCOME/EXPENSE rồi dùng modal chung |
| Lịch thu chi | `/calendar` | Tổng tháng/ngày từ Calendar API; chọn ngày xem tổng đầy đủ |
| Lịch sử giao dịch | `/transactions` | Giữ CRUD, bộ lọc và phân trang MVP |
| Danh mục | `/categories` | Giữ CRUD name/type MVP |
| Ngân sách tháng | `/budgets` | Giữ CRUD hạn mức MVP |

Sidebar và bottom navigation dùng chung sitemap. Login/Register là route công khai; các route nghiệp vụ cần phiên đã xác minh. D04 có lịch tháng 7 cột T2–CN, chuyển tháng, tháng hiện tại, chọn ngày, loading/error/retry và tháng trống. Chi tiết giao dịch/thêm từ ngày thuộc D05; icon/color thuộc D06.

Quick Add dùng lại TransactionModal/MoneyInput; `categoryId/type/amount/transactionDate/note` gửi đúng API hiện có, owner lấy từ JWT phía Backend. Chỉ toast thành công sau response server; không có chế độ đăng nhập/dữ liệu giả khi mất mạng. Timeout không tự retry: cần kiểm tra lịch sử trước khi gửi lại vì server có thể đã nhận request.

Calendar gọi `GET /api/calendar/month?year=2026&month=10` qua Axios/JWT theo [API Contract](../docs/smartexpense-2.0/API_CONTRACT.md). Hiển thị nguyên tổng `incomeTotal/expenseTotal` do Backend trả, giữ ngày DATE dạng YYYY-MM-DD; không cộng danh sách giao dịch phân trang. Đổi tháng bỏ request cũ; lưu Quick Add thành công làm mới Dashboard, Transactions, ngân sách và lịch đang mở. Chỉ chọn năm 1900–2100, tháng 1–12; response thiếu ngày/sai DTO được hiển thị là lỗi.

JWT và user được quản lý chung; 401 API bảo vệ xóa phiên và chuyển Login. Sai mật khẩu ở Login không làm hết phiên khác; 403 không logout. Response của phiên cũ bị bỏ qua khi logout/đổi tài khoản. Khi không xác minh được phiên do lỗi mạng, không dùng user cache để cấp quyền.

Kiểm tra developer: `npm run lint`, `npm test`, `npm run build`. Test dùng adapter/dữ liệu tổng hợp và render component trong bộ nhớ, không kết nối database. Cần kiểm tra tương tác browser ở 375/768/1024/1440px, light/dark, focus/Tab/Escape và refresh sau lưu trên stack test riêng trước nghiệm thu UI; không dùng dữ liệu production hoặc cài Playwright.

- Đăng ký, đăng nhập và quản lý phiên bằng JWT.
- Dashboard tổng thu, tổng chi, số dư, biểu đồ và giao dịch gần đây.
- Thêm, sửa, xóa danh mục và giao dịch; lọc theo tháng, khoảng ngày, loại, danh mục và ghi chú.
- Thiết lập ngân sách tháng, theo dõi số đã chi và cảnh báo vượt hạn mức.
- Giao diện responsive, chế độ sáng/tối hoặc theo hệ thống.

## Công nghệ

React 19, Vite 8, Tailwind CSS 4, React Router 8, Axios, Recharts và Lucide React. Các phiên bản cụ thể được khai báo trong [package.json](package.json) và khóa tại [package-lock.json](package-lock.json).

## Chạy môi trường phát triển

Yêu cầu Node.js 22.12 trở lên thuộc nhánh 22, hoặc một phiên bản mới hơn tương thích với Vite; npm và backend đang hoạt động. Dockerfile hiện sử dụng Node.js 22.

Từ thư mục gốc dự án:

```bash
cd frontend
npm ci
```

Tạo file cấu hình local bằng một trong hai cách:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```bash
# Linux/macOS
cp .env.example .env
```

Nội dung mặc định:

```dotenv
VITE_API_URL=http://localhost:8080/api
```

Địa chỉ phải kết thúc bằng `/api` và trỏ đến backend có thể truy cập từ trình duyệt. Các biến `VITE_*` được đưa vào mã frontend khi build, vì vậy chỉ dùng cho cấu hình công khai. Khởi động lại Vite khi thay đổi `.env`.

```bash
npm run dev -- --port 5173 --strictPort
```

Truy cập `http://localhost:5173`. Backend local hiện cho phép CORS từ đúng origin này; sử dụng địa chỉ hoặc cổng khác cần cập nhật cấu hình CORS backend. Vite hiện chưa cấu hình proxy `/api` cho môi trường phát triển.

Nếu PowerShell chặn script `npm.ps1`, dùng `npm.cmd` thay cho `npm` trong các lệnh trên.

## Các lệnh

Chạy trong thư mục `frontend`:

| Lệnh | Mục đích |
| --- | --- |
| `npm ci` | Cài dependency theo lockfile |
| `npm run dev` | Chạy Vite với hot reload |
| `npm run lint` | Kiểm tra JavaScript/JSX bằng ESLint |
| `npm test` | Kiểm tra phân trang giao dịch, tổng hợp dòng tiền và định dạng trục tiền |
| `npm run build` | Tạo bản build production trong `dist/` |
| `npm run preview` | Xem bản build local, mặc định tại cổng 4173 |

Khi kiểm thử API bằng `preview`, origin cổng 4173 cũng cần được backend cho phép nếu gọi trực tiếp sang backend khác origin. `preview` dùng để kiểm tra bản build local; môi trường Docker phục vụ ứng dụng bằng Nginx.

## Cấu trúc mã nguồn

```text
src/
├── api/            # Axios client, gắn JWT và xử lý phản hồi
├── assets/         # Tài nguyên được import vào ứng dụng
├── components/     # Layout, form, modal, biểu đồ và thành phần UI
├── contexts/       # Xác thực, giao diện sáng/tối và thông báo
├── pages/          # Dashboard, Login, Register, Categories, Transactions, Budgets
├── services/       # Gọi API theo từng nhóm chức năng
├── styles/         # CSS dùng chung cho trang xác thực
├── App.jsx         # Khai báo route
├── index.css       # Tailwind và style toàn cục
└── main.jsx        # Điểm khởi tạo React và các provider
```

`public/` chứa favicon, logo dự phòng và ảnh nền được truy cập bằng đường dẫn tĩnh.

## Route và phiên đăng nhập

`/`, `/login` và `/register` là các trang công khai. Dashboard tại `/` hiển thị nội dung phù hợp với trạng thái đăng nhập. Các trang `/categories`, `/transactions` và `/budgets` đi qua `ProtectedRoute`.

JWT và thông tin người dùng được lưu trong `sessionStorage`. Axios gửi token qua header `Authorization: Bearer ...`; tùy chọn giao diện được lưu trong `localStorage`.

Một số service và luồng đăng nhập hiện có dữ liệu giả dự phòng khi API gặp lỗi mạng. Khi kiểm thử tích hợp, cần xác nhận phản hồi API thật và đọc lại dữ liệu từ server; thông báo thành công trên giao diện khi mất mạng chưa bảo đảm dữ liệu đã được lưu vào database.

## Build và triển khai Docker

Dockerfile gồm hai giai đoạn: Node.js build ứng dụng, sau đó Nginx phục vụ nội dung `dist/`. Build argument `VITE_API_URL` mặc định là `/api`; Nginx chuyển tiếp đường dẫn này tới `backend:8080` và hỗ trợ SPA routing.

Để chạy toàn bộ hệ thống, thực hiện tại thư mục gốc sau khi cấu hình `.env` theo [README dự án](../README.md):

```bash
docker compose up -d --build
```

Theo cấu hình mặc định, ứng dụng có thể truy cập tại `http://localhost:8088`. Hướng dẫn database, backend, CI/CD và sao lưu nằm trong [README dự án](../README.md).

## Kiểm tra trước khi commit

```bash
npm run lint
npm test
npm run build
```

Các unit test dòng tiền nằm trong `tests/cashFlow.test.js` và chạy bằng Node.js test runner; CI chạy chúng trước bước build. Frontend hiện chưa có E2E test tự động. Kiểm thử API toàn hệ thống có tại [scripts/smoke-test.ps1](../scripts/smoke-test.ps1).

Các thư mục `node_modules/`, `dist/` và file `.env` đã được Git ignore. Giữ `.env.example` và `package-lock.json` trong repository để tái tạo cấu hình và dependency.
