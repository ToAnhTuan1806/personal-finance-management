package com.smartexpense.backend.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

// Cung cấp khóa, bộ ký và bộ kiểm tra JWT theo cơ chế HS256 hiện có.
@Configuration
public class JwtConfig {

    @Bean
    public SecretKey jwtSecretKey(
            @Value("${app.jwt.secret}") String secret) {
        // Chuyển JWT_SECRET từ Base64 sang khóa bí mật
        byte[] keyBytes = Base64.getDecoder().decode(secret);
        // HS256 cần khóa tối thiểu 256 bit; không đưa giá trị khóa vào thông báo lỗi.
        if (keyBytes.length < 32) {
            throw new IllegalArgumentException(
                    "JWT_SECRET phải có ít nhất 32 bytes"
            );
        }
        return new SecretKeySpec(keyBytes, "HmacSHA256");
    }

    @Bean
    public JwtEncoder jwtEncoder(SecretKey key) {
        // Dùng khóa bí mật để ký JWT
        return new NimbusJwtEncoder(
                new ImmutableSecret<>(key)
        );
    }

    @Bean
    public JwtDecoder jwtDecoder(SecretKey key) {
        // Chỉ chấp nhận chữ ký HS256; kiểm tra thời gian hiệu lực bằng validator bên dưới.
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        // Bắt buộc có hạn dùng và subject là ID người dùng dương, phù hợp với controller.
        OAuth2TokenValidator<Jwt> applicationClaims = jwt -> {
            try {
                if (jwt.getExpiresAt() != null && Long.parseLong(jwt.getSubject()) > 0) {
                    return OAuth2TokenValidatorResult.success();
                }
            } catch (NumberFormatException ignored) {
                // Subject sai định dạng phải trả 401 thay vì gây lỗi chuyển kiểu ở controller.
            }
            return OAuth2TokenValidatorResult.failure(
                    new OAuth2Error("invalid_token", "Token không hợp lệ", null));
        };
        // Giữ kiểm tra thời gian mặc định của Spring khi bổ sung kiểm tra claim ứng dụng.
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefault(), applicationClaims));
        return decoder;
    }
}
