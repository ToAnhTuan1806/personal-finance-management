package com.smartexpense.backend.entity;

import com.smartexpense.backend.enums.TransactionType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "recurring_templates", indexes = @Index(name = "idx_recurring_templates_active_next_run",
        columnList = "active,next_run_date,id"))
@Getter
@Setter
@NoArgsConstructor
public class RecurringTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TransactionType type;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(name = "day_of_month", nullable = false)
    private Integer dayOfMonth;

    @Column(length = 500)
    private String note;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "next_run_date")
    private LocalDate nextRunDate;
}
