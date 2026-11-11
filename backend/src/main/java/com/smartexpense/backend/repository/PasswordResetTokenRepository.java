package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.PasswordResetToken;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    @Query("select t.user.id from PasswordResetToken t where t.tokenHash = :hash")
    Optional<Long> findUserIdByTokenHash(@Param("hash") String hash);

    // Đọc current row sau khi đã khóa User, tránh snapshot cũ của MySQL REPEATABLE READ.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from PasswordResetToken t where t.tokenHash = :hash")
    Optional<PasswordResetToken> findByTokenHashForUpdate(@Param("hash") String hash);

    @Modifying(flushAutomatically = true)
    @Query("update PasswordResetToken t set t.usedAt = :now where t.user.id = :userId and t.usedAt is null")
    int invalidateAll(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    @Modifying
    @Query("update PasswordResetToken t set t.usedAt = :now where t.tokenHash = :hash and t.usedAt is null")
    int invalidateUndelivered(@Param("hash") String hash, @Param("now") LocalDateTime now);
}
