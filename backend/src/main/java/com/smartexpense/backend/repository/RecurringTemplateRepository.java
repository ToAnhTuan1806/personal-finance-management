package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.RecurringTemplate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RecurringTemplateRepository extends JpaRepository<RecurringTemplate, Long> {

    Optional<RecurringTemplate> findByIdAndUserId(Long id, Long userId);

    @EntityGraph(attributePaths = "category")
    Page<RecurringTemplate> findByUserIdOrderByIdDesc(Long userId, Pageable pageable);

    @EntityGraph(attributePaths = "category")
    Page<RecurringTemplate> findByUserIdAndActiveOrderByIdDesc(Long userId, Boolean active, Pageable pageable);
}
