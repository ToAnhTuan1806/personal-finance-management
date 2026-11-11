package com.smartexpense.backend.dto.auth;

import com.smartexpense.backend.validation.BcryptLength;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.ToString;

@Data
public class ResetPasswordRequest {
    // Sai định dạng/thiếu token được service trả cùng INVALID_RESET_TOKEN.
    @ToString.Exclude
    private String token;

    @NotBlank(message = "Mật khẩu không được để trống")
    @Size(min = 8, message = "Mật khẩu tối thiểu 8 ký tự")
    @BcryptLength
    @ToString.Exclude
    private String newPassword;
}
