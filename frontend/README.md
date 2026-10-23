# SmartExpense Frontend

Giao diện quản lý tài chính cá nhân của SmartExpense, xây dựng bằng React và kết nối REST API của backend Spring Boot.

## Chức năng

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

Các unit test dòng tiền nằm trong `tests/cashFlow.test.js` và chạy bằng Node.js test runner; CI chạy chúng trước bước build. Frontend hiện chưa có E2E test tự động. Kiểm thử API toàn hệ thống có tại [scripts/smoke-test.ps1](../scripts/smoke-test.ps1); xem thêm [báo cáo CRUD production ngày 23/10/2026](../docs/PRODUCTION_CRUD_TEST_2026-10-23.md).

Các thư mục `node_modules/`, `dist/` và file `.env` đã được Git ignore. Giữ `.env.example` và `package-lock.json` trong repository để tái tạo cấu hình và dependency.
