package com.smartexpense.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

@Entity
@Table(name = "recurring_applications",
        uniqueConstraints = @UniqueConstraint(name = "uk_recurring_application_template_year_month",
                columnNames = {"template_id", "year", "month"}),
        indexes = @Index(name = "idx_recurring_applications_transaction", columnList = "transaction_id"))
@Getter
@Setter
@NoArgsConstructor
public class RecurringApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "template_id", nullable = false,
            foreignKey = @ForeignKey(name = "fk_recurring_applications_template"))
    @OnDelete(action = OnDeleteAction.RESTRICT)
    private RecurringTemplate template;

    @Column(nullable = false)
    private Integer year;

    @Column(nullable = false)
    private Integer month;

    // Marker phải tồn tại cả khi giao dịch đã bị xóa; không cascade REMOVE từ JPA.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "transaction_id",
            foreignKey = @ForeignKey(name = "fk_recurring_applications_transaction"))
    @OnDelete(action = OnDeleteAction.SET_NULL)
    private Transaction transaction;
}
