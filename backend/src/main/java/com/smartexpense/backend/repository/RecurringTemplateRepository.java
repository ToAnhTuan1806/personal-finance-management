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

    @Query("""
        select coalesce(sum(t.amount), 0) from RecurringTemplate t
        where t.user.id = :userId and t.active = true
          and t.type = com.smartexpense.backend.enums.TransactionType.EXPENSE
          and t.category.user.id = :userId and t.category.type = t.type
          and t.nextRunDate >= :startDate and t.nextRunDate < :endDate
          and not exists (select a.id from RecurringApplication a where a.template.id = t.id
                          and a.year = :year and a.month = :month)
        """)
    java.math.BigDecimal sumPendingExpenses(@Param("userId") Long userId,
            @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate,
            @Param("year") int year, @Param("month") int month);

    @EntityGraph(attributePaths = "category")
    Page<RecurringTemplate> findByUserIdOrderByIdDesc(Long userId, Pageable pageable);

    @EntityGraph(attributePaths = "category")
    Page<RecurringTemplate> findByUserIdAndActiveOrderByIdDesc(Long userId, Boolean active, Pageable pageable);
}
