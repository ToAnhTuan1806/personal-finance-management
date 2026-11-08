package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.RecurringApplication;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecurringApplicationRepository extends JpaRepository<RecurringApplication, Long> {

    // Owner đi qua template; userId do Service lấy từ JWT, không nhận từ request body.
    boolean existsByTemplateIdAndTemplateUserIdAndYearAndMonth(Long templateId, Long userId, Integer year, Integer month);

    // Không lọc transaction: marker đã SET NULL vẫn phải chặn xóa template và apply lại.
    boolean existsByTemplateIdAndTemplateUserId(Long templateId, Long userId);
}
