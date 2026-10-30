# D06 — migration đề xuất, chờ Hương Quỳnh/DB/QA duyệt

Hiện chưa có Flyway/Liquibase, migration runner hoặc bảng history được duyệt; Hibernate đang dùng ddl-auto=update. V001 baseline/V002 metadata mới là kế hoạch trong README, không được coi V001 đã chạy. V002__category_icon_color.sql là bản đề xuất trên feature/tuan; Quỳnh chốt version để tránh trùng công việc D06-DB. Không thay đổi feature/quynh, CD hoặc cấu hình production trong gói này.

## 1. Kiểm tra trước

- Chặn merge dev/main và manual CD trong cửa sổ migration: workflow hiện tự deploy khi push dev/main. Chốt image cũ đã kiểm chứng và digest rollback trước khi đổi DB; không mặc định tag feature đã có image.
- DB/QA xác nhận đúng server/database/container, MySQL >=8.0.12, bảng InnoDB và SHOW CREATE TABLE categories. Kiểm tra phiên ghi/DDL dài, quyền ALTER và backup, đủ dung lượng. Bố trí cửa sổ tạm ngưng ghi/DDL để backup và đối chiếu nhất quán; không để Hibernate update chạy đồng thời.
- Hai cột đều chưa có: được xét chạy V002. Cả hai đã đúng VARCHAR(40)/VARCHAR(7), nullable/default NULL: không chạy lại, đối chiếu nguồn thay đổi/history với Quỳnh. Có một cột hoặc sai kiểu/độ dài/nullability: dừng; không tự sửa script đã áp dụng hoặc ép chạy.
- Lưu baseline: COUNT users/categories/transactions/monthly_budgets, tổng tiền theo owner/type, mẫu UTF-8/ngày, FK và SHOW CREATE. Orphan category/user/transaction phải bằng 0 trước và sau. Không xuất password_hash/secret vào log.

Ví dụ Bash cho người vận hành được phê duyệt, trước hết dùng trên rehearsal dữ liệu tổng hợp. Không chạy set -x; mở shell riêng rồi đóng sau thao tác. File .env không được source/in ra.

~~~bash
read -rp "MySQL container đích đã xác minh: " SE_MYSQL_CONTAINER
read -rp "Database đã xác minh: " SE_DB_NAME
read -rp "User vận hành: " SE_DB_USER
read -rsp "Mật khẩu MySQL: " MYSQL_PWD; printf '\n'
export MYSQL_PWD
docker exec -i -e MYSQL_PWD "$SE_MYSQL_CONTAINER" mysql \
  --user="$SE_DB_USER" --database="$SE_DB_NAME" --batch <<'SQL'
SELECT DATABASE(), VERSION(), @@server_uuid;
SELECT TABLE_NAME,ENGINE,ROW_FORMAT FROM information_schema.TABLES
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE';
SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='categories' AND COLUMN_NAME IN ('icon','color');
SHOW CREATE TABLE categories;
SELECT 'users',COUNT(*) FROM users UNION ALL SELECT 'categories',COUNT(*) FROM categories
 UNION ALL SELECT 'transactions',COUNT(*) FROM transactions UNION ALL SELECT 'monthly_budgets',COUNT(*) FROM monthly_budgets;
SELECT user_id,type,COUNT(*),SUM(amount) FROM transactions GROUP BY user_id,type;
SELECT COUNT(*) AS orphan_categories FROM categories c LEFT JOIN users u ON u.id=c.user_id WHERE u.id IS NULL;
SELECT COUNT(*) AS orphan_transactions FROM transactions t
 LEFT JOIN users u ON u.id=t.user_id LEFT JOIN categories c ON c.id=t.category_id
 WHERE u.id IS NULL OR c.id IS NULL OR c.user_id<>t.user_id;
SQL
~~~

## 2. Backup và restore rehearsal trước ALTER

Tất cả bảng phải là InnoDB; không có DDL trong lúc dump. Đây là dump ứng dụng, không phải PITR/backup cấu hình replication. Inventory routines/triggers/events và quyền backup cần DB/QA xác nhận. Script backup-db.ps1 hiện chưa có single-transaction, không mặc định nó tạo snapshot nhất quán khi vẫn có ghi.

~~~bash
umask 077
SE_RUN_DIR="database/backups/d06-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p database/backups || exit 1
mkdir "$SE_RUN_DIR" || exit 1          # không dùng lại/thay thế thư mục backup đã tồn tại
if docker exec -e MYSQL_PWD "$SE_MYSQL_CONTAINER" mysqldump --user="$SE_DB_USER" \
  --default-character-set=utf8mb4 --single-transaction --quick --skip-lock-tables \
  --skip-add-locks --no-tablespaces --set-gtid-purged=OFF --hex-blob --routines --triggers --events \
  --databases "$SE_DB_NAME" > "$SE_RUN_DIR/pre.sql.partial"; then
  test -s "$SE_RUN_DIR/pre.sql.partial" && mv "$SE_RUN_DIR/pre.sql.partial" "$SE_RUN_DIR/pre.sql"
else
  echo "Backup lỗi: dừng, không ALTER"; exit 1
fi
test -s "$SE_RUN_DIR/pre.sql" || exit 1
sha256sum "$SE_RUN_DIR/pre.sql" > "$SE_RUN_DIR/pre.sql.sha256"
~~~

Restore rehearsal: chỉ dùng dump dữ liệu tổng hợp sang MySQL mới, trống, container/server UUID/volume khác nguồn, với database cùng tên và tài khoản riêng. Dump --databases chứa CREATE/USE; đổi --database không đổi đích bên trong dump. Không dùng dump production để test trên máy developer. Backup production chỉ lưu ở nơi riêng được duyệt.

~~~bash
# Tiếp tục shell rehearsal ở trên; DB/QA đã xác nhận target không dùng chung volume nguồn.
# Target có database cùng tên và user cùng tên, nhưng mật khẩu riêng, được cấp quyền restore.
read -rp "Container restore cô lập: " SE_RESTORE_CONTAINER
test "$(docker inspect --format '{{.Id}}' "$SE_RESTORE_CONTAINER")" != \
     "$(docker inspect --format '{{.Id}}' "$SE_MYSQL_CONTAINER")" || exit 1
sha256sum -c "$SE_RUN_DIR/pre.sql.sha256" || exit 1
read -rsp "Mật khẩu user trên server restore: " SE_RESTORE_PASSWORD; printf '\n'
MYSQL_PWD="$SE_RESTORE_PASSWORD" docker exec -i -e MYSQL_PWD "$SE_RESTORE_CONTAINER" \
  mysql --user="$SE_DB_USER" --default-character-set=utf8mb4 --batch "$SE_DB_NAME" < "$SE_RUN_DIR/pre.sql"
SE_RESTORE_RC=$?
unset SE_RESTORE_PASSWORD
test "$SE_RESTORE_RC" -eq 0 || exit 1
~~~

Đối chiếu toàn bộ dữ liệu tổng hợp, UTF-8, tiền DECIMAL, DATE, COUNT/SUM và FK trên target. Không chỉ kiểm tra file không rỗng hoặc exit code. Test Java tự đối chiếu SHA256 dữ liệu cũ, FK, checksum dump và Hibernate validate sau khi nâng cấp target.

## 3. Áp dụng thực tế — thủ công, chỉ sau phê duyệt

Không có bước CI/CD tự chạy file này. Người vận hành áp dụng đúng file artifact được review, vào DB được chỉ định qua mysql client; không chạy fixture d06-legacy-schema.sql trên VPS. V002 chỉ SET timeout phiên và một ALTER thêm hai cột cuối bảng, không backfill. SQL cố ý fail khi trùng cột; quy trình chạy lại phải qua precheck, không dùng --force. INSTANT không được hỗ trợ thì dừng, không tự đổi sang COPY/INPLACE.

~~~bash
SE_SQL="database/migrations/V002__category_icon_color.sql"
sha256sum "$SE_SQL"                 # đối chiếu artifact đã review, rồi lưu checksum vào hồ sơ riêng
if docker exec -i -e MYSQL_PWD "$SE_MYSQL_CONTAINER" mysql \
  --user="$SE_DB_USER" --database="$SE_DB_NAME" --default-character-set=utf8mb4 \
  --batch --show-warnings < "$SE_SQL" > "$SE_RUN_DIR/V002.apply.log" 2>&1; then
  echo "SQL hoàn tất; phải postcheck trước khi ghi nhận thành công"
else
  echo "SQL lỗi: dừng release, kiểm tra schema/metadata lock và log riêng"; exit 1
fi
~~~

Postcheck: hai cột đúng VARCHAR/length/NULL/default NULL; COUNT/SUM/FK và giá trị cũ không đổi; tất cả category cũ vẫn NULL (khi chưa cho Backend mới ghi). Ghi version, checksum file đã chạy, thời điểm, operator, server UUID/database, kết quả trước/sau và backup checksum vào hồ sơ vận hành riêng. Không ghi lịch sử giả nếu cột đã có từ nguồn khác. CI xanh chỉ chứng minh test, không chứng minh DB VPS đã được nâng cấp.

Chỉ sau DB/QA ký xác nhận schema thực tế mới cho phép merge/deploy Backend D06. Giữ nguyên ddl-auto ở gói này, không dùng startup update làm runner. Smoke Category fallback/owner, Transaction, Budget, Calendar, đăng ký mới tạo 17 metadata; user cũ không được thêm danh mục/backfill. Kết thúc shell: unset MYSQL_PWD.

## 4. Khôi phục

- SQL gặp lỗi: dừng, kiểm tra trạng thái thực; không gọi ROLLBACK để giả định hoàn tác DDL và không tự chạy tiếp.
- App mới lỗi: quay lại image cũ đã kiểm chứng, giữ hai cột nullable và mọi dữ liệu; không cung cấp down.sql DROP COLUMN.
- Chỉ khi cần khôi phục dữ liệu, DB/QA lập kế hoạch riêng: ngừng ghi, xác minh backup/đích, restore trước trên server riêng, đối chiếu rồi phê duyệt chuyển đích. Restore mất dữ liệu phát sinh sau backup; snapshot cũ thiếu cột nên phải dùng app cũ hoặc áp dụng lại V002 đã duyệt trước app D06.
- Test chỉ mô phỏng SQL/client cũ dùng danh sách cột rõ ràng, không chứng nhận toàn bộ binary/VPS cũ hoặc công cụ INSERT không chỉ định cột.

Nguồn: [MySQL online DDL](https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl-operations.html), [metadata lock](https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl-performance.html), [implicit commit](https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html), [mysqldump snapshot](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html).

Kiểm thử lại trên Windows: bật Docker Desktop Linux engine, trong `backend` chạy `.\gradlew.bat --offline test --tests '*D06MigrationIntegrationTests' --rerun-tasks --console=plain`. Test tự tạo hai MySQL riêng, mật khẩu/khóa ngẫu nhiên; Docker thiếu thì FAIL, không skip. Dump tổng hợp nằm trong `backend/build/d06-migration-backup/` đã được Git bỏ qua; container tự dọn khi kết thúc. Đây không phải bản sao lưu VPS.
