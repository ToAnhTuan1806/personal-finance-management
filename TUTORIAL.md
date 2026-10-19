# HƯỚNG DẪN LÀM VIỆC NHÓM – SMARTEXPENSE

**Repository:** https://github.com/ToAnhTuan1806/personal-finance-management  
**Công nghệ:** ReactJS + Vite | Spring Boot + Gradle | MySQL  
**Nhóm:** 3 thành viên

## 1. Clone dự án (mỗi thành viên làm một lần)

Cài Git, Node.js và Java 21 (người làm Backend cần IntelliJ). Mở Terminal:

```bash
git clone https://github.com/ToAnhTuan1806/personal-finance-management.git
cd personal-finance-management
```

- **Frontend:** `cd frontend` → `npm install` → `npm run dev`.
- **Backend:** Mở thư mục `backend` bằng IntelliJ, đồng bộ Gradle; cấu hình MySQL local trước khi chạy.
- Không đưa mật khẩu, `.env` hoặc thông tin bí mật lên GitHub.

## 2. Phân công công việc

| Người | Vai trò | Phần việc | Nhánh làm việc |
|---|---|---|---|
| Thành viên 1 | Frontend / Team Lead | Giao diện đăng nhập, dashboard, giao dịch; gọi API | `feature/frontend` |
| Thành viên 2 | Backend | Spring Boot, Auth/JWT, API danh mục, giao dịch, ngân sách, thống kê | `feature/backend` |
| Thành viên 3 | Database / DevOps / QA | ERD, MySQL, script SQL, Docker/CI cơ bản, kiểm thử | `feature/database-devops` |

Cả nhóm thống nhất API, tên bảng/cột và hỗ trợ nhau khi tích hợp.

## 3. Quy tắc nhánh

- `main`: bản ổn định, **không push trực tiếp**.
- `dev`: nhánh tích hợp các phần đã kiểm tra.
- `feature/...`: mỗi thành viên code trên nhánh của mình.

**Trưởng nhóm tạo `dev` một lần** (nếu chưa có):

```bash
git switch main
git pull origin main
git switch -c dev
git push -u origin dev
```

**Mỗi thành viên tạo nhánh riêng từ `dev`:**

```bash
git fetch origin
git switch dev
git pull origin dev
git switch -c feature/frontend
```

> Thay `feature/frontend` thành `feature/backend` hoặc `feature/database-devops` tùy vai trò.

## 4. Mỗi lần làm việc và khi hoàn thành

**Đang làm trên nhánh cá nhân:**

```bash
git status
git add .
git commit -m "feat: mo ta cong viec da lam"
git push -u origin feature/frontend
```

> Thay tên nhánh ở lệnh `push` cho đúng nhánh của bạn. Những lần push tiếp theo có thể dùng `git push`.

**Khi xong một phần việc:**

1. Mở repository trên GitHub → **Pull requests** → **New pull request**.
2. Chọn **base: `dev`** và **compare: `feature/...`** của bạn.
3. Ghi rõ nội dung đã làm, nhờ một thành viên khác xem lại.
4. Sau khi kiểm tra và không xung đột, **Merge vào `dev`**.
5. Chỉ khi các phần trong `dev` chạy ổn, trưởng nhóm tạo PR **`dev` → `main`**.

**Trước khi bắt đầu phần việc mới:** lấy thay đổi mới nhất từ `dev` rồi tạo một nhánh `feature/...` mới (khuyến nghị mỗi tính năng một nhánh). Không sửa code trực tiếp trên `main` hoặc `dev`.

## 5. Lưu ý quan trọng

- Repository **Public**: ai cũng clone được, nhưng **phải được mời làm Collaborator và chấp nhận lời mời** mới push được vào repo gốc.
- Nếu đụng cùng một file, trao đổi trước; không dùng `git push --force` để xử lý xung đột.
- Chỉ commit source code và cấu hình mẫu; **không commit** `node_modules/`, `build/`, mật khẩu hay file `.env` thật.

**Tóm tắt:** `Clone` → tạo `feature/...` từ `dev` → code → `commit` → `push feature/...` → PR vào `dev` → kiểm tra → PR `dev` vào `main`.
