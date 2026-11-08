package com.smartexpense.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Entity
@Table(
    name = "category_budgets",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"user_id", "category_id", "year", "month"})
    }
)
@Getter
@Setter
@NoArgsConstructor
public class CategoryBudget {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(name = "year", nullable = false)
    private Integer year;

    @Column(name = "month", nullable = false)
    private Integer month;

    @Column(
        name = "amount_limit",
        nullable = false,
        precision = 15,
        scale = 2
    )
    private BigDecimal amountLimit;
}
