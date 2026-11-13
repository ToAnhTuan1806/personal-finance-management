package com.smartexpense.backend.dto.auth;

public record AuthMessageResponse(String message) {
    public static final AuthMessageResponse FORGOT = new AuthMessageResponse(
            "Nếu email tồn tại trong hệ thống, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu.");
    public static final AuthMessageResponse RESET = new AuthMessageResponse(
            "Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập.");
}
