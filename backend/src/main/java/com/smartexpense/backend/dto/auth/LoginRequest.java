package com.smartexpense.backend.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.ToString;

@Data
public class LoginRequest {

    @NotBlank(message = "Email không được để trống")
    @Email(message = "Email không hợp lệ")
    private String email;

    @NotBlank(message = "Mật khẩu không được để trống")
    // Không để log DTO làm lộ mật khẩu; vẫn giữ field trong JSON đăng nhập.
    @ToString.Exclude
    private String password;
}
