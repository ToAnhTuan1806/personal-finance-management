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

    enum D09ValidationMode {
        NONE,
        HIBERNATE_MAPPED,
        MIGRATION_V005
    }

    static void assertMappedSchema(JdbcTemplate jdbc, EntityManagerFactory factory) {
        Set<String> mapped = factory.getMetamodel().getEntities().stream()
                .map(entity -> entity.getName()).collect(Collectors.toSet());
        Set<String> expected = new LinkedHashSet<>(List.of("User", "Category", "Transaction", "MonthlyBudget"));
        boolean d07 = mapped.contains("CategoryBudget");
        if (d07) expected.add("CategoryBudget");
        boolean d08 = mapped.contains("RecurringTemplate");
        if (d08) expected.add("RecurringTemplate");
        boolean d09 = mapped.contains("RecurringApplication");
        if (d09) expected.add("RecurringApplication");
        boolean d12 = mapped.contains("PasswordResetToken");
        if (d12) expected.add("PasswordResetToken");
        assertThat(mapped).containsExactlyInAnyOrderElementsOf(expected);
        D08ValidationMode mode = d08 ? D08ValidationMode.HIBERNATE_MAPPED : D08ValidationMode.NONE;
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            assertSchema(connection, d07, mode,
                    d09 ? D09ValidationMode.HIBERNATE_MAPPED : D09ValidationMode.NONE, d12);
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
        assertSchema(connection, d07, d08Mode, D09ValidationMode.NONE);
    }

    static void assertSchema(Connection connection, boolean d07, boolean d08, boolean d09) throws SQLException {
        assertSchema(connection, d07, d08 ? D08ValidationMode.MIGRATION_V004 : D08ValidationMode.NONE,
                d09 ? D09ValidationMode.MIGRATION_V005 : D09ValidationMode.NONE);
    }

    // Hợp nhất overload và kiểm tra SQL chính xác của Quỳnh; không áp tên FK/index SQL cho Hibernate-generated schema.
    static void assertSchema(Connection connection, boolean d07, boolean d08, boolean d09, boolean d12) throws SQLException {
        assertSchema(connection, d07, d08 ? D08ValidationMode.MIGRATION_V004 : D08ValidationMode.NONE,
                d09 ? D09ValidationMode.MIGRATION_V005 : D09ValidationMode.NONE, d12);
        if (d12) assertPasswordResetTokens(connection);
    }

    static void assertPasswordResetTokens(Connection connection) throws SQLException {
        assertThat(values(connection, """
                SELECT CONCAT(column_name,':',column_type,':',is_nullable) FROM information_schema.columns
                WHERE table_schema=DATABASE() AND table_name='password_reset_tokens' ORDER BY column_name
                """)).containsExactly(
                "created_at:datetime(6):NO", "expires_at:datetime(6):NO", "id:bigint:NO",
                "token_hash:char(64):NO", "used_at:datetime(6):YES", "user_id:bigint:NO");
        assertThat(values(connection, """
                SELECT extra FROM information_schema.columns WHERE table_schema=DATABASE()
                AND table_name='password_reset_tokens' AND column_name='id'
                """)).containsExactly("auto_increment");
        assertThat(values(connection, """
                SELECT CONCAT(index_name,':',non_unique,':',GROUP_CONCAT(column_name ORDER BY seq_in_index))
                FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='password_reset_tokens'
                GROUP BY index_name,non_unique
                """)).contains("PRIMARY:0:id", "uk_password_reset_tokens_token_hash:0:token_hash",
                "idx_password_reset_tokens_user_id:1:user_id");
        List<String> policies = values(connection, """
                SELECT CONCAT(constraint_name,':',referenced_table_name,':',delete_rule,':',update_rule)
                FROM information_schema.referential_constraints
                WHERE constraint_schema=DATABASE() AND table_name='password_reset_tokens'
                """);
        assertThat(policies).hasSize(1);
        assertThat(policies.stream().map(policy -> policy.replace("NO ACTION", "RESTRICT")).toList())
                .containsExactly("fk_password_reset_tokens_user:users:RESTRICT:RESTRICT");
        assertThat(values(connection, """
                SELECT CONCAT(column_name,':',column_type,':',is_nullable,':',column_default)
                FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users'
                AND column_name='auth_version'
                """)).containsExactly("auth_version:bigint:NO:0");
    }

    private static void assertSchema(Connection connection, boolean d07, D08ValidationMode d08Mode,
                                     D09ValidationMode d09Mode) throws SQLException {
        assertSchema(connection, d07, d08Mode, d09Mode, false);
    }

    private static void assertSchema(Connection connection, boolean d07, D08ValidationMode d08Mode,
                                     D09ValidationMode d09Mode, boolean d12) throws SQLException {
        boolean d08 = d08Mode != D08ValidationMode.NONE;
        boolean d09 = d09Mode != D09ValidationMode.NONE;
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
        if (d09) {
            tables.add("recurring_applications");
            foreignKeys.add("recurring_applications.template_id->recurring_templates.id");
            foreignKeys.add("recurring_applications.transaction_id->transactions.id");
        }
        if (d12) {
            tables.add("password_reset_tokens");
            foreignKeys.add("password_reset_tokens.user_id->users.id");
            assertThat(values(connection, "SELECT column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='password_reset_tokens' AND column_name='token_hash'"))
                    .containsExactly("char(64)");
            assertThat(values(connection, "SELECT column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='auth_version' AND is_nullable='NO'"))
                    .containsExactly("bigint");
            assertThat(values(connection, "SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='password_reset_tokens' AND non_unique=0 GROUP BY index_name"))
                    .contains("token_hash");
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
        if (d09) assertRecurringApplications(connection, d09Mode);
    }

    private static void assertRecurringApplications(Connection connection, D09ValidationMode mode) throws SQLException {
        assertThat(values(connection, """
                SELECT CONCAT(column_name,':',column_type,':',is_nullable) FROM information_schema.columns
                WHERE table_schema=DATABASE() AND table_name='recurring_applications' ORDER BY column_name
                """)).containsExactly("id:bigint:NO", "month:int:NO", "template_id:bigint:NO",
                "transaction_id:bigint:YES", "year:int:NO");
        assertThat(values(connection, """
                SELECT extra FROM information_schema.columns WHERE table_schema=DATABASE()
                AND table_name='recurring_applications' AND column_name='id'
                """)).containsExactly("auto_increment");
        assertThat(values(connection, """
                SELECT CONCAT(index_name,':',non_unique,':',GROUP_CONCAT(column_name ORDER BY seq_in_index))
                FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='recurring_applications'
                GROUP BY index_name,non_unique
                """)).containsExactlyInAnyOrder("PRIMARY:0:id",
                "uk_recurring_application_template_year_month:0:template_id,year,month",
                "idx_recurring_applications_transaction:1:transaction_id");
        List<String> policies = values(connection, """
                SELECT CONCAT(constraint_name,':',referenced_table_name,':',delete_rule,':',update_rule)
                FROM information_schema.referential_constraints
                WHERE constraint_schema=DATABASE() AND table_name='recurring_applications'
                """);
        assertThat(policies).hasSize(2);
        assertThat(policies.stream().map(policy -> policy.replace("NO ACTION", "RESTRICT")).toList())
                .containsExactlyInAnyOrder("fk_recurring_applications_template:recurring_templates:RESTRICT:RESTRICT",
                        "fk_recurring_applications_transaction:transactions:SET NULL:RESTRICT");
        if (mode == D09ValidationMode.MIGRATION_V005) {
            assertThat(values(connection, """
                    SELECT CONCAT(t.constraint_name,':',t.enforced,':',
                      LOWER(REPLACE(REPLACE(REPLACE(REPLACE(c.check_clause,'`',''),' ',''),'(',''),')','')))
                    FROM information_schema.table_constraints t JOIN information_schema.check_constraints c
                      ON c.constraint_schema=t.constraint_schema AND c.constraint_name=t.constraint_name
                    WHERE t.table_schema=DATABASE() AND t.table_name='recurring_applications' AND t.constraint_type='CHECK'
                    """)).containsExactlyInAnyOrder("chk_recurring_applications_year:YES:yearbetween1900and2100",
                    "chk_recurring_applications_month:YES:monthbetween1and12");
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
