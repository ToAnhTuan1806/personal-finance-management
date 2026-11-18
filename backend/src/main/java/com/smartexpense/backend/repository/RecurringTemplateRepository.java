package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.RecurringTemplate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.List;

import java.util.Optional;

public interface RecurringTemplateRepository extends JpaRepository<RecurringTemplate, Long> {

    Optional<RecurringTemplate> findByIdAndUserId(Long id, Long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RecurringTemplate t where t.id = :id")
    Optional<RecurringTemplate> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RecurringTemplate t where t.id = :id and t.user.id = :userId")
    Optional<RecurringTemplate> findByIdAndUserIdForUpdate(@Param("id") Long id, @Param("userId") Long userId);

    @Query("select t.id from RecurringTemplate t where t.active = true and t.id > :afterId "
            + "and (t.nextRunDate is null or t.nextRunDate <= :today) order by t.id")
    List<Long> findAutomaticCandidateIds(@Param("today") LocalDate today,
                                         @Param("afterId") long afterId, Pageable pageable);

    @EntityGraph(attributePaths = "category")
    Page<RecurringTemplate> findByUserIdOrderByIdDesc(Long userId, Pageable pageable);

    @EntityGraph(attributePaths = "category")
    Page<RecurringTemplate> findByUserIdAndActiveOrderByIdDesc(Long userId, Boolean active, Pageable pageable);
}
