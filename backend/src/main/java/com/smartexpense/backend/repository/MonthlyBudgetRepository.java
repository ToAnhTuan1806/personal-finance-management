package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.MonthlyBudget;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MonthlyBudgetRepository
        extends JpaRepository<MonthlyBudget, Long> {

    // Tìm ngân sách của user theo tháng và năm
    Optional<MonthlyBudget> findByUserIdAndYearAndMonth(
            Long userId,
            Integer year,
            Integer month
    );

    // Lấy toàn bộ ngân sách của người dùng
    List<MonthlyBudget> findByUserId(Long userId);

    // Kiểm tra tháng này đã thiết lập ngân sách chưa
    boolean existsByUserIdAndYearAndMonth(
            Long userId,
            Integer year,
            Integer month
    );
}
