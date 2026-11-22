# Kiểm tra API bằng Postman

Import [Collection](SmartExpense_Postman_Collection.json). Dùng local hoặc stack test với tài khoản riêng. Đặt baseUrl theo Backend, ví dụ http://localhost:8080.

1. Đăng ký/đăng nhập trong Auth và kiểm tra biến accessToken.
2. Thử Categories, Transactions, Budgets, Dashboard bằng các ID thuộc tài khoản.
3. Trong Savings challenges & funds, tạo thử thách rồi đọc Overview/Funds.
4. Điền challengeId, depositId, withdrawalId và savingDate trong Variables. Tài khoản cần có giao dịch thu để đủ số dư khả dụng.
5. Nạp 10.000 ₫, gửi lại cùng depositId/dữ liệu để kiểm tra chống trùng, sau đó rút bằng withdrawalId mới.
6. Đối chiếu totalBalance = reservedBalance + availableBalance.

V010 cần tồn tại cho nạp/rút. Trước V010, GET funds trả 204. Nạp quá khả dụng hoặc rút quá quỹ trả 409. Tiền là số đồng nguyên dương. Giữ ID khi thử lại một yêu cầu, đổi ID khi tạo khoản mới.

Collection dùng để gọi API thủ công. Bộ kiểm thử tự động và kết quả nằm trong hồ sơ QA.
