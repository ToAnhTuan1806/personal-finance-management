# Kiểm thử CRUD trên production — 23/10/2026

- Website: https://smartexpense-team3.duckdns.org
- Thời gian: 17:14:45–17:14:53, ngày 23/10/2026 (UTC+7).
- Kết quả: **55/55 kiểm tra đạt**, 0 thất bại, 45 HTTP requests.
- Phạm vi: kiểm thử trực tiếp REST API qua HTTPS và reverse proxy production, có header Origin của website và JWT đăng nhập thật từ tài khoản demo công khai trong README.
- Đây là kiểm thử API; chưa kiểm thử thao tác bằng chuột trên giao diện, nhiều người dùng đồng thời, phân quyền chéo tài khoản hoặc tình huống mất mạng.

## Dữ liệu thử nghiệm

Chỉ thao tác trên các bản ghi mới có nhãn `CRUD_TEST_1792750485340_a62c81`.
Trước khi tạo, đã xác nhận tháng 11/2097 chưa có ngân sách hoặc giao dịch.

| Đối tượng | ID / thời kỳ | Trạng thái cuối |
| --- | --- | --- |
| Danh mục chi tiêu thử nghiệm | 16 | Đã xóa, GET trả 404 |
| Giao dịch thử nghiệm | 128 | Đã xóa, GET trả 404 |
| Ngân sách thử nghiệm | ID 4, tháng 11/2097 | Đã xóa, GET trả 404 |

## Các luồng đã kiểm chứng

| Luồng | Kiểm tra và kết quả |
| --- | --- |
| Đăng nhập | HTTP 200 với Origin production; nhận JWT để gọi API thật |
| Thêm danh mục | POST 201; GET xác nhận tên và loại được lưu |
| Sửa danh mục | PUT 200; GET xác nhận tên mới chứa tiếng Việt được lưu đúng |
| Thêm ngân sách | PUT 200; hạn mức 100.000, số đã chi 0, còn lại 100.000 |
| Thêm giao dịch | POST 201; GET xác nhận số tiền 12.000,50, ngày, danh mục và ghi chú |
| Bộ lọc | Lọc tháng + danh mục + loại + từ khóa trả đúng một giao dịch; khoảng ngày bao gồm cả ngày kết thúc |
| Dashboard và biểu đồ | Tổng chi, số dư và tổng theo danh mục phản ánh đúng khoản 12.000,50 |
| Đối soát ngân sách | Số đã chi 12.000,50; số còn lại 87.999,50 |
| Ràng buộc danh mục | Xóa danh mục hoặc đổi loại khi đang có giao dịch đều trả 409 |
| Sửa giao dịch | PUT 200; thay tiền thành 34.567,89, thay ngày và ghi chú; GET xác nhận đúng |
| Dashboard sau sửa | Tổng chi 34.567,89, số dư -34.567,89; không cộng trùng số tiền cũ |
| Sửa ngân sách | Hạ hạn mức xuống 20.000: vượt ngân sách, còn lại -14.567,89; nâng lên 100.000: hết vượt ngân sách, còn lại 65.432,11; giữ nguyên ID ngân sách |
| Dữ liệu không hợp lệ | Giao dịch bằng 0, âm, sai loại danh mục và ngân sách bằng 0 đều trả 400; hạn mức hợp lệ trước đó không bị ghi đè |
| Xóa giao dịch | DELETE 204; GET 404; ngân sách về mức chi 0, dashboard về tổng thu/chi/số dư 0 |
| Xóa ngân sách | DELETE 204; GET 404 |
| Xóa danh mục | DELETE 204 sau khi đã xóa giao dịch; GET 404 |
| Dọn dữ liệu | Xác nhận lại cả ba đối tượng trả 404; tháng thử nghiệm không còn giao dịch |

## Đối chiếu dữ liệu ban đầu

Đã so sánh trước và sau toàn bộ lượt kiểm thử:

- Danh sách 11 danh mục gốc: ID, tên và loại giữ nguyên.
- Tháng 10/2026: giữ nguyên 28 giao dịch.
- Tổng thu tháng 10: giữ nguyên 15.500.000.
- Tổng chi tháng 10: giữ nguyên 7.570.000.
- Số dư tháng 10: giữ nguyên 7.930.000.

Không sửa mã nguồn ứng dụng, cấu hình production hoặc các bản ghi có sẵn. Việc thêm và xóa bản ghi thử nghiệm có sử dụng các giá trị ID tự tăng như thông thường.

Chi tiết từng phép kiểm tra và HTTP status được lưu cục bộ tại `backups/production-crud-results-2026-10-23.json` (thư mục backups được Git ignore). File kết quả không chứa JWT hoặc mật khẩu.
