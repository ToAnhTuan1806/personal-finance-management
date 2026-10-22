# HƯỚNG DẪN TRIỂN KHAI SMARTEXPENSE TRÊN CLOUD VPS (UBUNTU)

> **Trạng thái thực thi trực tuyến (Online VPS Deployment):** `NOT EXECUTED`  
> *(Hệ thống hiện tại chưa được cấp Cloud VPS hoặc domain đích thực tế. Tài liệu này đóng vai trò Runbook chuẩn hóa quy trình triển khai P1 cho đội ngũ vận hành).*

---

## 1. Yêu cầu hệ thống máy chủ (VPS Prerequisites)

- **Hệ điều hành khuyến nghị:** Ubuntu 22.04 LTS hoặc Ubuntu 24.04 LTS (x86_64).
- **Cấu hình tối thiểu:**
  - CPU: 2 vCPU
  - RAM: 2 GB (khuyến nghị 4 GB để build image mượt mà và chạy MySQL 8)
  - Ổ cứng: 25 GB SSD trở lên
- **Quyền hạn:** Quyền truy cập `root` hoặc người dùng có đặc quyền `sudo`.
- **Tên miền (Domain):** Đã trỏ bản ghi A/AAAA về địa chỉ IP của VPS (ví dụ: `smartexpense.yourdomain.com`).

---

## 2. Chuẩn bị môi trường & Cài đặt Docker

### 2.1 Cập nhật hệ điều hành
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw apt-transport-https ca-certificates gnupg lsb-release
```

### 2.2 Cài đặt Docker Engine & Docker Compose Plugin
Thực hiện cài đặt bản chính thức từ kho lưu trữ của Docker:
```bash
# Thêm GPG key của Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Thêm repository
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cài đặt Docker và compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Cấp quyền cho user hiện tại (tránh dùng sudo mỗi khi gọi docker)
sudo usermod -aG docker $USER
newgrp docker

# Kiểm tra phiên bản
docker --version
docker compose version
```

---

## 3. Clone Repository & Cấu hình bảo mật

### 3.1 Clone mã nguồn
```bash
# Tạo thư mục ứng dụng
sudo mkdir -p /opt/smartexpense
sudo chown $USER:$USER /opt/smartexpense
cd /opt/smartexpense

# Clone qua SSH hoặc HTTPS token
git clone https://github.com/ToAnhTuan1806/personal-finance-management.git .
git checkout main  # hoặc nhánh phát hành tương ứng
```

### 3.2 Thiết lập file biến môi trường `.env`
Sao chép từ `.env.example` và điền thông tin bí mật thực tế:
```bash
cp .env.example .env
chmod 600 .env  # Giới hạn chỉ user sở hữu đọc/ghi
```

Nội dung cấu hình mẫu trên VPS:
```ini
# Database Configuration
DB_NAME=personal_finance_db
DB_USERNAME=root
DB_PASSWORD=Tao_Mat_Khau_MySQL_Rat_Manh_32_Ky_Tu!
DB_ROOT_PASSWORD=Tao_Mat_Khau_MySQL_Rat_Manh_32_Ky_Tu!

# JWT Security (Base64 chuỗi ngẫu nhiên 256 bits)
# Tạo nhanh bằng lệnh: openssl rand -base64 32
JWT_SECRET=Tao_Chuoi_JWT_Secret_Ngau_Nhien_256_Bit_An_Toan=
JWT_EXPIRATION=86400

# Port nội bộ map với Host (Nginx host sẽ reverse proxy vào port này)
FRONTEND_PORT=8088
```

---

## 4. Khởi chạy ứng dụng với Docker Compose

```bash
# 1. Kiểm tra cú pháp cấu hình
docker compose config

# 2. Build các image
docker compose build --no-cache

# 3. Khởi chạy ở chế độ nền
docker compose up -d

# 4. Kiểm tra trạng thái containers
docker compose ps
```

Sau khi khởi chạy, xác nhận ba container:
- `smartexpense-mysql`: Up (healthy)
- `smartexpense-backend`: Up (healthy)
- `smartexpense-frontend`: Up (healthy)

---

## 5. Cấu hình Nginx Host Reverse Proxy & HTTPS

Trên máy chủ VPS công cộng, ta thiết lập một Nginx bên ngoài host (hoặc container gateway) để tiếp nhận truy cập HTTPS (port 443) từ Internet và chuyển hướng vào Nginx container (port 8088).

### 5.1 Cài đặt Nginx và Certbot trên Host
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 5.2 Tạo cấu hình Virtual Host cho domain
Tạo file `/etc/nginx/sites-available/smartexpense`:
```nginx
server {
    server_name smartexpense.yourdomain.com;

    # Kích thước payload upload tối đa
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Kích hoạt site và kiểm tra:
```bash
sudo ln -s /etc/nginx/sites-available/smartexpense /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5.3 Cấp phát chứng chỉ SSL/TLS miễn phí với Let's Encrypt
```bash
sudo certbot --nginx -d smartexpense.yourdomain.com --non-interactive --agree-tos -m admin@yourdomain.com --redirect
```

Certbot sẽ tự động cấu hình HTTPS, thiết lập HTTP-to-HTTPS redirect và tự động gia hạn chứng chỉ trước khi hết hạn.

---

## 6. Thiết lập Tường lửa UFW (Firewall Hardening)

Quy tắc bảo mật quan trọng: **Không mở cổng 3306 (MySQL) và 8080 (Spring Boot) ra Internet.** Chỉ mở SSH, HTTP, HTTPS:

```bash
# Thiết lập mặc định
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Cho phép SSH (cổng 22 hoặc cổng tùy chỉnh)
sudo ufw allow 22/tcp comment 'SSH'

# Cho phép Web HTTP và HTTPS
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Bật tường lửa
sudo ufw enable
sudo ufw status verbose
```

---

## 7. Sao lưu và Khôi phục Cơ sở dữ liệu (Backup & Disaster Recovery)

### 7.1 Sao lưu thủ công
```bash
cd /opt/smartexpense
docker compose exec -i mysql mysqldump -u root -p"$DB_ROOT_PASSWORD" --databases personal_finance_db --routines --triggers > /opt/smartexpense/database/backups/backup_$(date +%Y%m%d_%H%M%S).sql
```

### 7.2 Lập lịch sao lưu tự động qua Cronjob
Mở crontab:
```bash
crontab -e
```
Thêm dòng sau để tự động sao lưu lúc 02:00 sáng mỗi ngày và xóa các file backup cũ hơn 30 ngày:
```cron
0 2 * * * cd /opt/smartexpense && docker compose exec -i mysql mysqldump -u root -p"$(grep DB_ROOT_PASSWORD .env | cut -d '=' -f2)" --databases personal_finance_db > /opt/smartexpense/database/backups/db_backup_$(date +\%F).sql && find /opt/smartexpense/database/backups/ -type f -name "*.sql" -mtime +30 -delete
```

### 7.3 Khôi phục cơ sở dữ liệu từ file backup
```bash
cd /opt/smartexpense
cat /opt/smartexpense/database/backups/db_backup_XXXX.sql | docker compose exec -i mysql mysql -u root -p"$DB_ROOT_PASSWORD" personal_finance_db
```

---

## 8. Quy trình Cập nhật Phiên bản (Deployment Update Workflow)

Khi có bản cập nhật mới trên nhánh `main`:

```bash
cd /opt/smartexpense

# 1. Kéo mã nguồn mới nhất
git pull origin main

# 2. Rebuild các container
docker compose build

# 3. Khởi động lại với thời gian gián đoạn tối thiểu
docker compose up -d

# 4. Kiểm tra sức khỏe containers
docker compose ps
docker compose logs -f --tail 50 backend
```

---

## 9. Quy trình Rollback khi gặp sự cố (Rollback Strategy)

Nếu bản cập nhật phát sinh lỗi nghiêm trọng:

```bash
cd /opt/smartexpense

# 1. Xác định commit hoạt động ổn định trước đó
git log --oneline -n 5

# 2. Checkout commit ổn định (ví dụ abc1234)
git checkout abc1234

# 3. Build lại và chạy
docker compose build
docker compose up -d

# 4. Nếu schema database bị ảnh hưởng, khôi phục snapshot database trước khi cập nhật
cat /opt/smartexpense/database/backups/backup_truoc_khi_update.sql | docker compose exec -i mysql mysql -u root -p"$DB_ROOT_PASSWORD" personal_finance_db

# 5. Xác nhận trạng thái
docker compose ps
curl -I http://localhost:8088/
```
