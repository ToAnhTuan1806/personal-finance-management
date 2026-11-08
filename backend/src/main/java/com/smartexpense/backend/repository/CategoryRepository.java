package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.enums.TransactionType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CategoryRepository extends JpaRepository<Category, Long> {

    // Tên chỉ cần duy nhất trong cùng owner/loại, không phân biệt chữ hoa thường.
    boolean existsByUserIdAndTypeAndNameIgnoreCase(Long userId, TransactionType type, String name);

    // Khi sửa, bản ghi hiện tại không được coi là một danh mục khác trùng tên.
    boolean existsByUserIdAndTypeAndNameIgnoreCaseAndIdNot(
            Long userId, TransactionType type, String name, Long id);

    // Lấy tất cả danh mục của một người dùng
    List<Category> findByUserId(Long userId);

    // Lọc danh mục theo loại INCOME hoặc EXPENSE
    List<Category> findByUserIdAndType(
            Long userId,
            TransactionType type
    );

    // Tìm danh mục theo ID và đúng chủ sở hữu
    Optional<Category> findByIdAndUserId(
            Long id,
            Long userId
    );
}
