package com.smartexpense.backend.dto.auth;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    // Token vẫn được trả qua JSON nhưng bị loại khỏi toString() để tránh lộ qua log.
    @ToString.Exclude
    private String accessToken;

    private String tokenType;

    // Thông tin tài khoản đã đăng nhập
    private UserResponse user;
}
