package com.smartexpense.backend.security;

import com.smartexpense.backend.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;

import javax.crypto.SecretKey;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthVersionJwtTests {
    private final UserRepository users = mock(UserRepository.class);
    private final JwtConfig config = new JwtConfig();
    private final SecretKey key = key();
    private final JwtEncoder encoder = config.jwtEncoder(key);
    private final JwtDecoder decoder = config.jwtDecoder(key, users);

    @Test
    void legacyTokenWorksOnlyAtDefaultVersionAndUsesOneScalarQueryPerRequest() {
        String raw = sign(claims().build(), encoder, MacAlgorithm.HS256);
        when(users.findAuthVersionById(7L)).thenReturn(Optional.of(0L), Optional.of(1L));
        assertThat(decoder.decode(raw).getSubject()).isEqualTo("7");
        assertThatThrownBy(() -> decoder.decode(raw)).isInstanceOf(BadJwtException.class);
        verify(users, times(2)).findAuthVersionById(7L); verifyNoMoreInteractions(users);
    }

    @Test
    void resetRejectsOldClaimAndAcceptsNewClaim() {
        when(users.findAuthVersionById(7L)).thenReturn(Optional.of(2L));
        assertThatThrownBy(() -> decoder.decode(sign(claims().claim("auth_version", 1L).build(), encoder, MacAlgorithm.HS256)))
                .isInstanceOf(BadJwtException.class);
        assertThat(decoder.decode(sign(claims().claim("auth_version", 2L).build(), encoder, MacAlgorithm.HS256)).getSubject()).isEqualTo("7");
    }

    @Test
    void deletedUserIsRejected() {
        assertThatThrownBy(() -> decoder.decode(sign(claims().build(), encoder, MacAlgorithm.HS256)))
                .isInstanceOf(BadJwtException.class);
    }

    @Test
    void databaseFailureFailsClosedWithoutLeakingDetails() {
        when(users.findAuthVersionById(7L)).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("PRIVATE_DATABASE_DETAIL"));
        assertThatThrownBy(() -> decoder.decode(sign(claims().build(), encoder, MacAlgorithm.HS256)))
                .isInstanceOf(BadJwtException.class).hasMessageNotContaining("PRIVATE_DATABASE_DETAIL");
    }

    @ParameterizedTest
    @ValueSource(strings = {"-1", "string", "float", "object"})
    void invalidVersionTypesAreRejectedWithoutDbQuery(String kind) {
        Object version = switch (kind) {
            case "-1" -> -1L;
            case "string" -> "0";
            case "float" -> 0.5;
            default -> Map.of("x", 0);
        };
        assertThatThrownBy(() -> decoder.decode(sign(claims().claim("auth_version", version).build(), encoder, MacAlgorithm.HS256)))
                .isInstanceOf(JwtException.class);
        verifyNoInteractions(users);
    }

    @ParameterizedTest
    @ValueSource(strings = {"expired", "future", "missing-exp", "bad-sub", "missing-sub", "signature", "algorithm", "malformed"})
    void invalidCryptographicOrStandardClaimsDoNotQueryDb(String kind) {
        var builder = JwtClaimsSet.builder().issuedAt(Instant.now().minusSeconds(600));
        if (!kind.equals("missing-sub")) builder.subject(kind.equals("bad-sub") ? "0" : "7");
        if (!kind.equals("missing-exp")) builder.expiresAt(Instant.now().plusSeconds(kind.equals("expired") ? -120 : 600));
        if (kind.equals("future")) builder.notBefore(Instant.now().plusSeconds(300));
        String raw = kind.equals("malformed") ? "wrong" : sign(builder.build(),
                kind.equals("signature") ? config.jwtEncoder(key()) : encoder,
                kind.equals("algorithm") ? MacAlgorithm.HS512 : MacAlgorithm.HS256);
        assertThatThrownBy(() -> decoder.decode(raw)).isInstanceOf(JwtException.class);
        verifyNoInteractions(users);
    }

    private JwtClaimsSet.Builder claims() {
        return JwtClaimsSet.builder().subject("7").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600));
    }

    private String sign(JwtClaimsSet claims, JwtEncoder signer, MacAlgorithm algorithm) {
        return signer.encode(JwtEncoderParameters.from(JwsHeader.with(algorithm).build(), claims)).getTokenValue();
    }

    private static SecretKey key() {
        byte[] bytes = new byte[64]; new SecureRandom().nextBytes(bytes);
        return new JwtConfig().jwtSecretKey(Base64.getEncoder().encodeToString(bytes));
    }
}
