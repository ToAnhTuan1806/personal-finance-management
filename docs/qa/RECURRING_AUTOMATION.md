# Giao dịch định kỳ tự động — V007

Migration thuộc `feature/quynh`; Backend thuộc `feature/tuan`; Frontend thuộc `feature/trang`. Không sao chép SQL hoặc mã FE sang nhánh thành viên khác. Tích hợp PR DB trước PR BE để CI có SQL gốc V007.

## Thứ tự triển khai

1. Review/merge thay đổi DB, BE và FE vào `dev`, chạy CI trên bản tích hợp. Sao lưu DB và xác nhận đúng schema trước khi phát hành.
2. Trên DB đã có V006, chạy **một lần** `database/migrations/V007__recurring_automation_schedule.sql` trước khi khởi động Backend mới. SQL chỉ thêm `next_run_date DATE NULL` và index `(active,next_run_date,id)`, không tạo giao dịch, không ghi bù, không đặt lịch quá khứ. `lock_wait_timeout=10` tránh chờ metadata lock vô hạn; nếu lỗi, kiểm tra trạng thái migration trước khi thử lại.
3. Phát hành Backend và Frontend mới theo quy trình hiện có. Worker bật mặc định; biến môi trường Spring `APP_RECURRING_AUTOMATIC_ENABLED=false` trong process/container có thể dừng worker khi cần. Nếu dùng Compose, cần truyền biến vào container; chỉ đặt ở file `.env` chưa bảo đảm biến được truyền. Binary mới vẫn cần cột V007 kể cả khi worker tắt.
4. Mẫu cũ đang bật và chưa có ngày chạy sẽ được đặt lịch từ hôm nay theo giờ Việt Nam. Nếu đến hạn hôm nay, mẫu được xử lý trong lượt quét khởi tạo. Kiểm tra API trả `nextRunDate`, UI hiển thị đúng ngày. Xác minh bằng tài khoản thử nghiệm: mỗi mẫu/kỳ chỉ có một marker và một khoản thu/chi, số tiền và số dư chính xác.

Không chạy lịch bù: server tắt qua cả ngày đến hạn sẽ bỏ kỳ đó. Tạo hoặc bật lại mẫu đúng ngày đến hạn bắt đầu ngay trong tháng này; worker xử lý ở lượt quét kế tiếp. Ngày đã qua chuyển sang tháng sau. Ngày 31 được giới hạn theo tháng ngắn, rồi trở lại ngày 31 ở tháng phù hợp.

## Kiểm thử local

DB: `./gradlew test --tests com.smartexpense.backend.RecurringAutomationMigrationIntegrationTests` từ `backend/`. Test dùng MySQL Testcontainers local riêng, xác nhận dữ liệu tài chính không đổi, cột mặc định null, index mới và UNIQUE cũ.

BE: `./gradlew test` từ `backend/` sau tích hợp V007. Trước merge, có thể trỏ `SMARTEXPENSE_RECURRING_MIGRATION_SQL` tới file V007 gốc trong worktree DB để chạy test; không dùng DDL thay thế. Các test tắt timer nền để kiểm tra lịch bằng Clock cố định và gọi worker; test riêng xác nhận bộ hẹn giờ Spring thực sự chạy khi bật.

Rollback binary có thể giữ lại cột nullable/index V007 vì tương thích với binary cũ. Không tự xóa giao dịch hoặc marker đã tạo. Nếu cần dừng ghi nhận, tắt worker hoặc tắt mẫu; không drop cột khi Backend mới còn chạy.

Cập nhật 22/11/2026 theo source sau bản sửa lịch cùng ngày. Hồ sơ kiểm thử bên trên mô tả phạm vi local. Trạng thái phát hành xem RELEASE_CURRENT.md.

## Kết quả kiểm thử local — 18/11/2026

- Backend: regression chạy đủ 1.375 test / 51 suite. Lượt đầu có 53 failure trong hai lớp test cũ: helper response vẫn đếm 8 trường thay vì 9, và test validate Entity mới chỉ áp schema V006. Sau khi sửa hai harness (không đổi mã nghiệp vụ), đã chạy lại toàn bộ 75 test của hai lớp, đều PASS. Đối chiếu báo cáo mới nhất của từng lớp: 1.375 PASS, 0 failure/error/skipped.
- 20 test mới cho scheduler/processor/MySQL đều PASS; kiểm tra thời gian Việt Nam, lịch cuối tháng, không ghi bù, chạy đồng thời, rollback và giữ marker khi xóa giao dịch.
- Gate D03: 55/55 PASS; `bootJar` PASS.
- DB: SQL V007 thật qua test MySQL local, bảo toàn dữ liệu cũ, UNIQUE, cột nullable và index. Test migration chỉ chạy trong worktree DB.
- Frontend: 682/682 PASS, lint PASS, build PASS. Cảnh báo bundle lớn hơn 500 kB có sẵn vẫn còn.
- UI đã xác nhận trực tiếp trên Chrome ngày 18/11/2026 với API giả lập trong RAM: desktop sáng/tối, Responsive 400 × 763, bộ lọc, bật/tắt, biểu mẫu và validation số tiền 0. Sửa số tiền có phần thập phân hiển thị đúng và không tăng số mẫu. Không ghi DB thật; không suy ra scheduler hoặc production đã chạy. Báo cáo chi tiết thuộc FE: `docs/qa/RECURRING_AUTOMATION_UI.md`.
- Chưa commit/push/merge, chưa áp migration hoặc deploy VPS. Các báo cáo local không chứng minh production đã được nâng cấp.
