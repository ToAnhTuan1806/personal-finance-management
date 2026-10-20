package com.smartexpense.backend.repository;

import com.smartexpense.backend.entity.Transaction;
import com.smartexpense.backend.enums.TransactionType;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface TransactionRepository
        extends JpaRepository<Transaction, Long> {

    @Query(
        value = """
            SELECT t FROM Transaction t
            JOIN FETCH t.category
            WHERE t.user.id = :userId
              AND (:type IS NULL OR t.type = :type)
              AND (:categoryId IS NULL OR t.category.id = :categoryId)
              AND (:startDate IS NULL OR t.transactionDate >= :startDate)
              AND (:endDate IS NULL OR t.transactionDate < :endDate)
              AND (:keyword IS NULL OR LOWER(t.note) LIKE LOWER(
                      CONCAT('%', :keyword, '%')
                  ))
        """,
        countQuery = """
            SELECT COUNT(t) FROM Transaction t
            WHERE t.user.id = :userId
              AND (:type IS NULL OR t.type = :type)
              AND (:categoryId IS NULL OR t.category.id = :categoryId)
              AND (:startDate IS NULL OR t.transactionDate >= :startDate)
              AND (:endDate IS NULL OR t.transactionDate < :endDate)
              AND (:keyword IS NULL OR LOWER(t.note) LIKE LOWER(
                      CONCAT('%', :keyword, '%')
                  ))
        """
    )
    Page<Transaction> searchTransactions(
            @Param("userId") Long userId,
            @Param("type") TransactionType type,
            @Param("categoryId") Long categoryId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("keyword") String keyword,
            Pageable pageable
    );

    // Lấy giao dịch của user, mới nhất lên trước
    List<Transaction> findByUserIdOrderByTransactionDateDescIdDesc(
            Long userId
    );

    // Tìm giao dịch theo ID và chủ sở hữu
    Optional<Transaction> findByIdAndUserId(
            Long id,
            Long userId
    );

    // Lọc giao dịch theo loại thu hoặc chi
    List<Transaction> findByUserIdAndType(
            Long userId,
            TransactionType type
    );

    // Lọc giao dịch trong khoảng ngày [startDate, endDate)
    List<Transaction>
    findByUserIdAndTransactionDateGreaterThanEqualAndTransactionDateLessThan(
            Long userId,
            LocalDate startDate,
            LocalDate endDate
    );

    // Tính tổng tiền thu hoặc chi trong khoảng thời gian
    @Query("""
        SELECT SUM(t.amount)
        FROM Transaction t
        WHERE t.user.id = :userId
          AND t.type = :type
          AND t.transactionDate >= :startDate
          AND t.transactionDate < :endDate
    """)
    BigDecimal sumAmountByUserAndTypeAndDateRange(
            @Param("userId") Long userId,
            @Param("type") TransactionType type,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );

    // Kiểm tra danh mục đã có giao dịch hay chưa
    boolean existsByCategoryId(Long categoryId);
}
