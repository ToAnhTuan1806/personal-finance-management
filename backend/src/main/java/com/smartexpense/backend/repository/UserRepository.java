package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    // Tìm tài khoản bằng email (dùng khi đăng nhập)
    Optional<User> findByEmail(String email);

    // Kiểm tra email đã được đăng ký chưa
    boolean existsByEmail(String email);
}
