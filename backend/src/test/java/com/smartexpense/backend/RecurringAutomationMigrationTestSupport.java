package com.smartexpense.backend;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;

import static org.assertj.core.api.Assertions.assertThat;

final class RecurringAutomationMigrationTestSupport {
    private RecurringAutomationMigrationTestSupport() { }

    static void apply(Connection connection) {
        String override = System.getenv("SMARTEXPENSE_RECURRING_MIGRATION_SQL");
        Path path = override == null || override.isBlank()
                ? Path.of("../database/migrations/V007__recurring_automation_schedule.sql") : Path.of(override);
        assertThat(path.getFileName().toString()).isEqualTo("V007__recurring_automation_schedule.sql");
        assertThat(Files.isRegularFile(path)).as("Approved DB-owned V007 SQL is required; no fallback DDL").isTrue();
        ScriptUtils.executeSqlScript(connection, new EncodedResource(new FileSystemResource(path), StandardCharsets.UTF_8));
    }
}
