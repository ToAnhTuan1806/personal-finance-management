package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    @Query("select u.authVersion from User u where u.id = :userId")
    Optional<Long> findAuthVersionById(@Param("userId") Long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.email = :email")
    Optional<User> findByEmailForPasswordReset(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :userId")
    Optional<User> findByIdForPasswordReset(@Param("userId") Long userId);

    // Khóa owner cả khi chưa có Category; giữ khóa đến hết transaction ghi danh mục.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :userId")
    Optional<User> findByIdForCategoryWrite(@Param("userId") Long userId);

    // Tìm tài khoản bằng email (dùng khi đăng nhập)
    Optional<User> findByEmail(String email);

    // Kiểm tra email đã được đăng ký chưa
    boolean existsByEmail(String email);
}
