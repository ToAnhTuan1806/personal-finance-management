package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.auth.UserResponse;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;

    // GET /api/users/me - lấy tài khoản đang đăng nhập
    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser(
            @AuthenticationPrincipal Jwt jwt) {
        Long userId = Long.valueOf(jwt.getSubject());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Tài khoản không còn tồn tại"
                ));

        return ResponseEntity.ok(new UserResponse(
                user.getId(),
                user.getFullName(),
                user.getEmail()
        ));
    }
}
