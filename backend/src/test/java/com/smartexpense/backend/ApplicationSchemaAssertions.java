package com.smartexpense.backend;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

// Tập schema kỳ vọng lấy từ Entity được nạp, không suy ngược từ bảng đang có để tự chấp nhận bảng/FK bị thiếu.
final class ApplicationSchemaAssertions {
    private ApplicationSchemaAssertions() { }

    enum D08ValidationMode {
        NONE,
        HIBERNATE_MAPPED,
        MIGRATION_V004
    }

    static void assertMappedSchema(JdbcTemplate jdbc, EntityManagerFactory factory) {
        Set<String> mapped = factory.getMetamodel().getEntities().stream()
                .map(entity -> entity.getName()).collect(Collectors.toSet());
        Set<String> expected = new LinkedHashSet<>(List.of("User", "Category", "Transaction", "MonthlyBudget"));
        boolean d07 = mapped.contains("CategoryBudget");
        if (d07) expected.add("CategoryBudget");
        boolean d08 = mapped.contains("RecurringTemplate");
        if (d08) expected.add("RecurringTemplate");
        assertThat(mapped).containsExactlyInAnyOrderElementsOf(expected);
        D08ValidationMode mode = d08 ? D08ValidationMode.HIBERNATE_MAPPED : D08ValidationMode.NONE;
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            assertSchema(connection, d07, mode);
            return null;
        });
        System.out.printf("QA SCHEMA mappedEntities=%d categoryBudgetMapped=%s recurringTemplateMapped=%s mode=%s%n",
                mapped.size(), d07, d08, mode);
    }

    static void assertSchema(Connection connection, boolean d07) throws SQLException {
        assertSchema(connection, d07, D08ValidationMode.NONE);
    }

    static void assertSchema(Connection connection, boolean d07, boolean d08) throws SQLException {
        assertSchema(connection, d07, d08 ? D08ValidationMode.MIGRATION_V004 : D08ValidationMode.NONE);
    }

    static void assertSchema(Connection connection, boolean d07, D08ValidationMode d08Mode) throws SQLException {
        boolean d08 = d08Mode != D08ValidationMode.NONE;
        List<String> tables = new ArrayList<>(List.of("users", "categories", "transactions", "monthly_budgets"));
        List<String> foreignKeys = new ArrayList<>(List.of("categories.user_id->users.id",
                "transactions.user_id->users.id", "transactions.category_id->categories.id", "monthly_budgets.user_id->users.id"));
        if (d07) {
            tables.add("category_budgets");
            foreignKeys.add("category_budgets.user_id->users.id");
            foreignKeys.add("category_budgets.category_id->categories.id");
        }
        if (d08) {
            tables.add("recurring_templates");
            foreignKeys.add("recurring_templates.user_id->users.id");
            foreignKeys.add("recurring_templates.category_id->categories.id");
        }
        assertThat(values(connection, "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'"))
                .containsExactlyInAnyOrderElementsOf(tables);
        assertThat(values(connection, "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND engine='InnoDB'"))
                .containsExactlyInAnyOrderElementsOf(tables);
        assertThat(values(connection, """
                SELECT CONCAT(table_name,'.',column_name,'->',referenced_table_name,'.',referenced_column_name)
                FROM information_schema.key_column_usage WHERE table_schema=DATABASE()
                  AND referenced_table_name IS NOT NULL AND referenced_table_schema=DATABASE()
                """)).containsExactlyInAnyOrderElementsOf(foreignKeys);
        assertThat(values(connection, "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()"))
                .containsExactly(Integer.toString(foreignKeys.size()));
        assertThat(values(connection, """
                SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics
                WHERE table_schema=DATABASE() AND table_name='monthly_budgets' AND non_unique=0 GROUP BY index_name
                """)).contains("user_id,year,month");
        if (d07) {
            assertThat(values(connection, """
                    SELECT CONCAT(column_name,':',column_type,':',is_nullable) FROM information_schema.columns
                    WHERE table_schema=DATABASE() AND table_name='category_budgets' ORDER BY column_name
                    """)).containsExactly("amount_limit:decimal(15,2):NO", "category_id:bigint:NO", "id:bigint:NO",
                    "month:int:NO", "user_id:bigint:NO", "year:int:NO");
            assertThat(values(connection, """
                    SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics
                    WHERE table_schema=DATABASE() AND table_name='category_budgets' AND non_unique=0 GROUP BY index_name
                    """)).contains("user_id,category_id,year,month");
            List<String> policies = values(connection, """
                    SELECT CONCAT(referenced_table_name,':',delete_rule,':',update_rule)
                    FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND table_name='category_budgets'
                    """);
            assertThat(policies).hasSize(2);
            for (String policy : policies) {
                String[] parts = policy.split(":");
                assertThat(parts).hasSize(3);
                assertThat(parts[0]).isIn("users", "categories");
                // InnoDB NO ACTION tương đương RESTRICT; không chấp nhận CASCADE/SET NULL.
                assertThat(parts[1]).isIn("RESTRICT", "NO ACTION");
                assertThat(parts[2]).isIn("RESTRICT", "NO ACTION");
            }
        }
        if (d08) {
            List<String> cols = values(connection, """
                    SELECT CONCAT(column_name,':',column_type,':',is_nullable) FROM information_schema.columns
                    WHERE table_schema=DATABASE() AND table_name='recurring_templates' ORDER BY column_name
                    """);
            assertThat(cols).hasSize(8);

            List<String> indexes = values(connection, """
                    SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics
                    WHERE table_schema=DATABASE() AND table_name='recurring_templates' GROUP BY index_name
                    """);
            assertThat(indexes).contains("id");

            List<String> policies = values(connection, """
                    SELECT CONCAT(referenced_table_name,':',delete_rule,':',update_rule)
                    FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND table_name='recurring_templates'
                    """);
            assertThat(policies).hasSize(2);
            for (String policy : policies) {
                String[] parts = policy.split(":");
                assertThat(parts).hasSize(3);
                assertThat(parts[0]).isIn("users", "categories");
                assertThat(parts[1]).isIn("RESTRICT", "NO ACTION");
                assertThat(parts[2]).isIn("RESTRICT", "NO ACTION");
            }

            if (d08Mode == D08ValidationMode.MIGRATION_V004) {
                // Kiểm tra nghiêm ngặt schema migration V004 thật
                assertThat(cols).containsExactly(
                        "active:tinyint(1):NO",
                        "amount:decimal(15,2):NO",
                        "category_id:bigint:NO",
                        "day_of_month:int:NO",
                        "id:bigint:NO",
                        "note:varchar(500):YES",
                        "type:varchar(20):NO",
                        "user_id:bigint:NO");
                assertThat(indexes).contains("user_id,active");
                List<String> checks = values(connection, """
                        SELECT constraint_name FROM information_schema.table_constraints
                        WHERE table_schema=DATABASE() AND table_name='recurring_templates' AND constraint_type='CHECK'
                        """);
                assertThat(checks).containsExactlyInAnyOrder(
                        "chk_recurring_templates_type",
                        "chk_recurring_templates_amount",
                        "chk_recurring_templates_day_of_month",
                        "chk_recurring_templates_active");
            } else if (d08Mode == D08ValidationMode.HIBERNATE_MAPPED) {
                // Kiểm tra schema tự sinh bởi Hibernate: chấp nhận ENUM/BIT nhưng từ chối ENUM sai miền giá trị
                assertThat(cols.get(0)).isIn("active:tinyint(1):NO", "active:bit(1):NO");
                assertThat(cols.subList(1, 6)).containsExactly(
                        "amount:decimal(15,2):NO",
                        "category_id:bigint:NO",
                        "day_of_month:int:NO",
                        "id:bigint:NO",
                        "note:varchar(500):YES");
                assertThat(cols.get(6)).isIn(
                        "type:varchar(20):NO",
                        "type:enum('EXPENSE','INCOME'):NO",
                        "type:enum('INCOME','EXPENSE'):NO");
                assertThat(cols.get(7)).isEqualTo("user_id:bigint:NO");
            }
        }
    }

    private static List<String> values(Connection connection, String sql) throws SQLException {
        List<String> values = new ArrayList<>();
        try (var statement = connection.createStatement(); var result = statement.executeQuery(sql)) {
            while (result.next()) values.add(result.getString(1));
        }
        return values;
    }
}
