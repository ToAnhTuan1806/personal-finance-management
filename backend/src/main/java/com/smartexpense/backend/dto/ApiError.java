package com.smartexpense.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import java.util.Map;

// Cấu trúc lỗi dùng chung; chỉ thêm errors khi cần thông báo lỗi theo từng trường.
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(int status, String code, String message, Map<String, String> errors) {

    public static ApiError of(HttpStatusCode status) {
        return of(status, null, null);
    }

    public static ApiError of(HttpStatusCode status, String message, Map<String, String> errors) {
        // Mọi lỗi 5xx đều dùng thông báo trung lập, kể cả lỗi có reason do ứng dụng cung cấp.
        String safeMessage = status.is5xxServerError() || message == null || message.isBlank()
                ? defaultMessage(status.value()) : message;
        return new ApiError(status.value(), code(status.value()), safeMessage, errors);
    }

    // Mã lỗi ổn định giúp Frontend xử lý mà không phụ thuộc nội dung thông báo.
    private static String code(int status) {
        return switch (status) {
            case 400 -> "VALIDATION_ERROR";
            case 401 -> "UNAUTHORIZED";
            case 403 -> "FORBIDDEN";
            case 404 -> "RESOURCE_NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 409 -> "CONFLICT";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            default -> status >= 500 ? "INTERNAL_ERROR" : "HTTP_ERROR";
        };
    }

    // Dùng thông báo an toàn khi lỗi không có mô tả phù hợp để trả cho người dùng.
    private static String defaultMessage(int status) {
        return switch (status) {
            case 400 -> "Dữ liệu không hợp lệ";
            case 401 -> "Vui lòng đăng nhập lại";
            case 403 -> "Bạn không có quyền thực hiện thao tác này";
            case 404 -> "Không tìm thấy tài nguyên";
            case 405 -> "Phương thức không được hỗ trợ";
            case 409 -> "Thao tác xung đột với dữ liệu hiện có";
            case 415 -> "Định dạng dữ liệu không được hỗ trợ";
            default -> status >= HttpStatus.INTERNAL_SERVER_ERROR.value()
                    ? "Đã xảy ra lỗi máy chủ. Vui lòng thử lại sau" : "Không thể xử lý yêu cầu";
        };
    }
}
