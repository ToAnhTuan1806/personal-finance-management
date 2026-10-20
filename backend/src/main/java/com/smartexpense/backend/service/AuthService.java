package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.auth.*;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtEncoder jwtEncoder;

    @Value("${app.jwt.expiration}")
    private long jwtExpiration;

    // Đăng ký tài khoản mới
    public UserResponse register(RegisterRequest request) {
        String email = request.getEmail()
                .trim()
                .toLowerCase(Locale.ROOT);

        if (userRepository.existsByEmail(email)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Email đã được đăng ký"
            );
        }

        User user = new User();
        user.setFullName(request.getFullName().trim());
        user.setEmail(email);

        // Không lưu mật khẩu dạng văn bản gốc
        user.setPasswordHash(
                passwordEncoder.encode(request.getPassword())
        );

        User savedUser = userRepository.save(user);

        return toUserResponse(savedUser);
    }

    // Đăng nhập và trả JWT
    public AuthResponse login(LoginRequest request) {
        String email = request.getEmail()
                .trim()
                .toLowerCase(Locale.ROOT);

        User user = userRepository.findByEmail(email)
                .orElseThrow(this::invalidCredentials);

        // So sánh mật khẩu với BCrypt hash trong DB
        if (!passwordEncoder.matches(
                request.getPassword(),
                user.getPasswordHash())) {
            throw invalidCredentials();
        }

        String token = generateToken(user);

        return new AuthResponse(
                token,
                "Bearer",
                toUserResponse(user)
        );
    }

    // Tạo JWT với subject là ID người dùng
    private String generateToken(User user) {
        Instant now = Instant.now();

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("smartexpense")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(jwtExpiration))
                .subject(user.getId().toString())
                .build();

        JwsHeader header = JwsHeader
                .with(MacAlgorithm.HS256)
                .build();

        return jwtEncoder.encode(
                JwtEncoderParameters.from(header, claims)
        ).getTokenValue();
    }

    // Chuyển Entity thành DTO an toàn
    private UserResponse toUserResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getFullName(),
                user.getEmail()
        );
    }

    private ResponseStatusException invalidCredentials() {
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Email hoặc mật khẩu không chính xác"
        );
    }
}
