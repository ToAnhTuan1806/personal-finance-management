package com.smartexpense.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Entity
@Table(
    name = "monthly_budgets",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_budget_user_year_month",
            columnNames = {"user_id", "year", "month"}
        )
    }
)
@Getter
@Setter
@NoArgsConstructor
public class MonthlyBudget {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private Integer year;

    @Column(nullable = false)
    private Integer month;

    @Column(
        name = "amount_limit",
        nullable = false,
        precision = 15,
        scale = 2
    )
    private BigDecimal amountLimit;
}
