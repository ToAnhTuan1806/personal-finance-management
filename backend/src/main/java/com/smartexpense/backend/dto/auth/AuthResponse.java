package com.smartexpense.backend.dto.auth;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    // Token dùng xác thực ở các API tiếp theo
    private String accessToken;

    private String tokenType;

    // Thông tin tài khoản đã đăng nhập
    private UserResponse user;
}
