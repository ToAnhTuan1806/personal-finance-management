package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.CategoryBudget;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CategoryBudgetRepository
        extends JpaRepository<CategoryBudget, Long> {

    // Tìm ngân sách của user theo danh mục và kỳ để hỗ trợ upsert.
    Optional<CategoryBudget> findByUserIdAndCategoryIdAndYearAndMonth(
            Long userId,
            Long categoryId,
            Integer year,
            Integer month
    );

    // Lấy ngân sách danh mục của user trong một tháng.
    @EntityGraph(attributePaths = "category")
    List<CategoryBudget> findAllByUserIdAndYearAndMonth(
            Long userId,
            Integer year,
            Integer month
    );

    // Tìm theo ID và chủ sở hữu trước khi cập nhật hoặc xóa.
    Optional<CategoryBudget> findByIdAndUserId(
            Long id,
            Long userId
    );
}
