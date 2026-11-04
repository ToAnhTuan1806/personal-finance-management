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

    static void assertMappedSchema(JdbcTemplate jdbc, EntityManagerFactory factory) {
        Set<String> mapped = factory.getMetamodel().getEntities().stream()
                .map(entity -> entity.getName()).collect(Collectors.toSet());
        Set<String> expected = new LinkedHashSet<>(List.of("User", "Category", "Transaction", "MonthlyBudget"));
        boolean d07 = mapped.contains("CategoryBudget");
        if (d07) expected.add("CategoryBudget");
        assertThat(mapped).containsExactlyInAnyOrderElementsOf(expected);
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            assertSchema(connection, d07);
            return null;
        });
        System.out.printf("QA SCHEMA mappedEntities=%d categoryBudgetMapped=%s%n", mapped.size(), d07);
    }

    static void assertSchema(Connection connection, boolean d07) throws SQLException {
        List<String> tables = new ArrayList<>(List.of("users", "categories", "transactions", "monthly_budgets"));
        List<String> foreignKeys = new ArrayList<>(List.of("categories.user_id->users.id",
                "transactions.user_id->users.id", "transactions.category_id->categories.id", "monthly_budgets.user_id->users.id"));
        if (d07) {
            tables.add("category_budgets");
            foreignKeys.add("category_budgets.user_id->users.id");
            foreignKeys.add("category_budgets.category_id->categories.id");
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
    }

    private static List<String> values(Connection connection, String sql) throws SQLException {
        List<String> values = new ArrayList<>();
        try (var statement = connection.createStatement(); var result = statement.executeQuery(sql)) {
            while (result.next()) values.add(result.getString(1));
        }
        return values;
    }
}
