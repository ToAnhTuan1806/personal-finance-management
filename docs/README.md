# Tài liệu SmartExpense 2.0

Đối chiếu **18/11/2026**, bản tích hợp `dev 88be77a3a582f0f5b5654ed66ae70270783d80a1`. Các tài liệu mô tả source hiện có và các điều kiện vận hành chưa nghiệm thu; không thay cho bằng chứng thực thi trên VPS.

## Tài liệu dùng cho triển khai và bàn giao

| Tài liệu | Nội dung |
| --- | --- |
| [README dự án](../README.md) | Tính năng hiện có, chạy local, kiểm thử, backup/rollback |
| [API Contract](smartexpense-2.0/API_CONTRACT.md) | Endpoint/DTO/validation hiện hành và đề xuất tách riêng |
| [Bàn giao kỹ thuật](smartexpense-2.0/RELEASE_D16_D18.md) | Kiến trúc, ERD, JWT/reset, AI, QA/CI và release/rollback |
| [Mục lục QA](qa/README.md) | Báo cáo D01–D15, baseline/kết quả từng lượt và evidence đã commit |
| [Migration SQL](../database/migrations/README.md) | Version SQL và điều kiện pre/post-check; không phải runner production |
| [Postman MVP](postman/README_POSTMAN.md) | Công cụ API cơ bản, không phải bộ nghiệm thu đủ SmartExpense 2.0 |

## Nguồn yêu cầu và kế hoạch

[SRS hiện có nội dung phiên bản 2.3](SmartExpense_SRS_v2.docx) và [Master Plan](SmartExpense_QuanTriDuAn.xlsx) được giữ nguyên. Lịch ngày 08/11 trong các nguồn này là kế hoạch lịch sử; dùng SHA, source và QA/CI để đánh giá bản đã triển khai. Không sửa file gốc chỉ để đồng nhất số ngày/test/trạng thái hiện tại.

## Tài liệu lịch sử

[Kho lưu trữ](archive/README.md) chứa SRS MVP, Proposal MVP và kế hoạch Sprint 3 cũ. Các báo cáo QA D01–D15 và evidence nằm tại chỗ để giữ liên kết/manifest và lịch sử kiểm thử. Trang chỉ dẫn ở đường dẫn Sprint 3 cũ được giữ vì DOCX/XLSX còn tham chiếu tới nó.

Không gom nội dung trình chiếu vào đợt bàn giao kỹ thuật này. Báo cáo D16_D18/evidence mới ở worktree DB/QA còn chưa commit; chỉ thêm liên kết tới chúng sau khi được chốt vào repository.
