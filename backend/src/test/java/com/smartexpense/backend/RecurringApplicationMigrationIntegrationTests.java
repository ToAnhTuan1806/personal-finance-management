package com.smartexpense.backend;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.mysql.MySQLContainer;
import org.testcontainers.utility.MountableFile;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

// SQL thật trên Testcontainers, không chạy Spring Boot/Hibernate create hoặc dùng DB bên ngoài.
@Execution(ExecutionMode.SAME_THREAD)
class RecurringApplicationMigrationIntegrationTests {
    private static final String DATABASE = "se_d09_migration_" + UUID.randomUUID().toString().replace("-", "");
    private static final String USER = "d09_test";
    private static final List<String> LEGACY_TABLES = List.of("users", "categories", "transactions", "monthly_budgets", "category_budgets", "recurring_templates");
    private static final List<String> ALL_TABLES = List.of("users", "categories", "transactions", "monthly_budgets", "category_budgets", "recurring_templates", "recurring_applications");
    private static final Path MIGRATION = Path.of("../database/migrations/V005__create_recurring_applications.sql").toAbsolutePath().normalize();
    private static final MySQLContainer SOURCE = localContainer("source");
    private static MySQLContainer restore;
    private static Connection connection;
    private static JdbcTemplate jdbc;
    private static Map<String, List<Map<String, Object>>> legacyRows;
    private static Map<String, List<Map<String, Object>>> baseline;
    private static String legacySchemaHash;

    @BeforeAll
    static void setup() throws Exception {
        SOURCE.start();
        connection = connect(SOURCE);
        jdbc = jdbc(connection);
        assertThat(jdbc.queryForList("SHOW TABLES")).isEmpty();
        ScriptUtils.executeSqlScript(connection, new EncodedResource(new ClassPathResource("d06-legacy-schema.sql"), StandardCharsets.UTF_8));
        for (String name : List.of("V002__category_icon_color.sql", "V003__create_category_budgets.sql", "V004__create_recurring_templates.sql")) {
            apply(connection, Path.of("../database/migrations", name));
        }
        seedLegacy();
        legacyRows = snapshot(jdbc, LEGACY_TABLES);
        legacySchemaHash = legacySchemaHash(jdbc);
        apply(connection, MIGRATION);
        assertThat(snapshot(jdbc, LEGACY_TABLES)).isEqualTo(legacyRows);
        assertThat(legacySchemaHash(jdbc)).isEqualTo(legacySchemaHash);
        // Hai marker đã commit để backup có cả giao dịch còn tồn tại và giao dịch đã xóa.
        insert(51L, 2026, 11, 101L);
        jdbc.update("INSERT INTO transactions (id,user_id,category_id,type,amount,transaction_date,note,created_at) VALUES (202,1,11,'EXPENSE',123.45,'2026-12-31','D09 synthetic applied',CURRENT_TIMESTAMP)");
        insert(51L, 2026, 12, 202L);
        jdbc.update("DELETE FROM transactions WHERE id=202");
        assertThat(snapshot(jdbc, LEGACY_TABLES)).isEqualTo(legacyRows);
        assertThat(jdbc.queryForMap("SELECT transaction_id FROM recurring_applications WHERE template_id=51 AND `year`=2026 AND `month`=12").get("transaction_id")).isNull();
        baseline = snapshot(jdbc, ALL_TABLES);
        System.out.printf("D09 SQL baseline=MVP,V002,V003,V004,V005 mysql=%s legacyTables=6 baselineMarkers=2%n",
                jdbc.queryForObject("SELECT VERSION()", String.class));
    }

    @BeforeEach
    void begin() throws Exception {
        guard(SOURCE);
        assertThat(snapshot(jdbc, ALL_TABLES)).isEqualTo(baseline);
        connection.setAutoCommit(false);
    }

    @AfterEach
    void rollback() throws Exception {
        connection.rollback();
        connection.setAutoCommit(true);
        assertThat(snapshot(jdbc, ALL_TABLES)).isEqualTo(baseline);
    }

    @AfterAll
    static void cleanup() throws Exception {
        try {
            if (connection != null) connection.close();
        } finally {
            try { if (restore != null) restore.close(); }
            finally { SOURCE.close(); }
        }
    }

    @Test
    void migrationPreservesAllLegacyRowsAndSchema() {
        assertThat(snapshot(jdbc, LEGACY_TABLES)).isEqualTo(legacyRows);
        assertThat(legacySchemaHash(jdbc)).isEqualTo(legacySchemaHash);
        assertThat(legacyRows.get("users")).hasSize(2);
        assertThat(legacyRows.get("categories")).hasSize(3);
        assertThat(legacyRows.get("transactions")).hasSize(3);
        assertThat(legacyRows.get("monthly_budgets")).hasSize(2);
        assertThat(legacyRows.get("category_budgets")).hasSize(1);
        assertThat(legacyRows.get("recurring_templates")).hasSize(3);
    }

    @Test
    void schemaHasExactColumnsUniqueForeignKeysChecksAndIndexes() {
        assertSchema(jdbc);
    }

    @ParameterizedTest
    @ValueSource(ints = {1900, 2100})
    void acceptsYearBoundaries(int year) {
        insert(51L, year, 1, null);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_applications WHERE template_id=51 AND `year`=?", Long.class, year)).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(ints = {1899, 2101})
    void rejectsYearsOutsideRange(int year) {
        rejected(() -> insert(51L, year, 1, null), 3819);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 12})
    void acceptsMonthBoundaries(int month) {
        insert(51L, 2027, month, null);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_applications WHERE template_id=51 AND `year`=2027 AND `month`=?", Long.class, month)).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 13})
    void rejectsMonthsOutsideRange(int month) {
        rejected(() -> insert(51L, 2027, month, null), 3819);
    }

    @ParameterizedTest
    @ValueSource(strings = {"template_id", "year", "month"})
    void requiredColumnsRejectNull(String column) {
        String values = switch (column) {
            case "template_id" -> "NULL,2027,1";
            case "year" -> "51,NULL,1";
            case "month" -> "51,2027,NULL";
            default -> throw new IllegalArgumentException(column);
        };
        rejected(() -> jdbc.update("INSERT INTO recurring_applications (template_id,`year`,`month`) VALUES (" + values + ")"), 1048);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void uniquePeriodCannotBeBypassedByChangingOrRemovingTransaction(boolean nullTransaction) {
        rejected(() -> insert(51L, 2026, 11, nullTransaction ? null : 102L), 1062);
    }

    @Test
    void differentTemplateYearOrMonthCanHaveIndependentMarkers() {
        insert(51L, 2027, 1, 101L);
        insert(51L, 2028, 1, 101L);
        insert(51L, 2027, 2, 101L);
        insert(52L, 2027, 1, null);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_applications", Long.class)).isEqualTo(6);
    }

    @ParameterizedTest
    @ValueSource(strings = {"template", "transaction"})
    void bothForeignKeysRejectMissingParent(String parent) {
        rejected(() -> insert(parent.equals("template") ? Long.MAX_VALUE : 51L, 2027, 1,
                parent.equals("transaction") ? Long.MAX_VALUE : 101L), 1452);
    }

    @Test
    void nullableTransactionIsValidWithoutWeakeningPeriodUniqueness() {
        insert(52L, 2027, 1, null);
        assertThat(jdbc.queryForMap("SELECT transaction_id FROM recurring_applications WHERE template_id=52").get("transaction_id")).isNull();
        rejected(() -> insert(52L, 2027, 1, null), 1062);
    }

    @Test
    void deletingTransactionKeepsMarkerIdentityAndBlocksReapplication() {
        long marker = jdbc.queryForObject("SELECT id FROM recurring_applications WHERE template_id=51 AND `month`=11", Long.class);
        jdbc.update("DELETE FROM transactions WHERE id=101");
        assertThat(jdbc.queryForMap("SELECT * FROM recurring_applications WHERE id=?", marker))
                .containsEntry("template_id", 51L).containsEntry("year", 2026).containsEntry("month", 11).containsEntry("transaction_id", null);
        rejected(() -> insert(51L, 2026, 11, 102L), 1062);
        rejected(() -> jdbc.update("DELETE FROM recurring_templates WHERE id=51"), 1451);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM transactions WHERE id=102", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT * FROM users ORDER BY id")).isEqualTo(legacyRows.get("users"));
        assertThat(jdbc.queryForList("SELECT * FROM categories ORDER BY id")).isEqualTo(legacyRows.get("categories"));
    }

    @Test
    void templateWithHistoryIsRestrictedAndUnusedTemplateDeletionDoesNotCascade() {
        rejected(() -> jdbc.update("DELETE FROM recurring_templates WHERE id=51"), 1451);
        assertThat(jdbc.update("DELETE FROM recurring_templates WHERE id=52")).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT * FROM recurring_applications ORDER BY id")).isEqualTo(baseline.get("recurring_applications"));
        for (String table : LEGACY_TABLES) {
            if (!table.equals("recurring_templates")) {
                assertThat(jdbc.queryForList("SELECT * FROM " + table + " ORDER BY id")).isEqualTo(legacyRows.get(table));
            }
        }
    }

    @Test
    void duplicateMarkerCanRollBackTheAccompanyingTransactionInsert() throws Exception {
        var savepoint = connection.setSavepoint();
        jdbc.update("INSERT INTO transactions (id,user_id,category_id,type,amount,transaction_date,created_at) VALUES (999,1,11,'EXPENSE',123.45,'2026-11-30',CURRENT_TIMESTAMP)");
        rejected(() -> insert(51L, 2026, 11, 999L), 1062);
        connection.rollback(savepoint);
        assertThat(snapshot(jdbc, ALL_TABLES)).isEqualTo(baseline);
        // Kiểm chứng rollback SQL; atomic apply HTTP vẫn cần Backend D09 với @Transactional.
    }

    @Test
    void reapplyingMigrationFailsClosedWithoutChangingDataOrSchema() throws Exception {
        byte[] sql = Files.readAllBytes(MIGRATION);
        rejected(() -> apply(connection, MIGRATION), 1050);
        assertThat(Files.readAllBytes(MIGRATION)).isEqualTo(sql);
        assertThat(snapshot(jdbc, ALL_TABLES)).isEqualTo(baseline);
        assertSchema(jdbc);
    }

    @Test
    void backupRestoresAllTablesAndNullMarkersToDifferentMysqlServer() throws Exception {
        restore = localContainer("restore");
        restore.start();
        guard(restore);
        assertThat(restore.getContainerId()).isNotEqualTo(SOURCE.getContainerId());
        assertThat(restore.getMappedPort(3306)).isNotEqualTo(SOURCE.getMappedPort(3306));
        try (Connection target = connect(restore)) {
            JdbcTemplate restored = jdbc(target);
            assertThat(restored.queryForList("SHOW TABLES")).isEmpty();
            String sourceUuid = jdbc.queryForObject("SELECT @@server_uuid", String.class);
            assertThat(restored.queryForObject("SELECT @@server_uuid", String.class)).isNotEqualTo(sourceUuid);
            var dump = SOURCE.execInContainer("sh", "-c",
                    "MYSQL_PWD=\"$MYSQL_PASSWORD\" exec mysqldump --user=\"$MYSQL_USER\" "
                            + "--default-character-set=utf8mb4 --single-transaction --quick --skip-lock-tables "
                            + "--skip-add-locks --no-tablespaces --set-gtid-purged=OFF --hex-blob "
                            + "--routines --triggers --events --databases \"$MYSQL_DATABASE\"");
            assertThat(dump.getExitCode()).as("Synthetic test dump exit code").isZero();
            assertThat(dump.getStdout()).contains("CREATE TABLE", "recurring_applications");
            Path directory = Path.of("build/d09-migration-backup", DATABASE).toAbsolutePath().normalize();
            Files.createDirectories(directory);
            Path backup = directory.resolve("source.sql");
            Files.writeString(backup, dump.getStdout(), StandardCharsets.UTF_8);
            String checksum = hash(Files.readAllBytes(backup));
            assertThatThrownBy(() -> restoreDump(backup, "incorrect-checksum")).isInstanceOf(IllegalStateException.class);
            assertThat(restored.queryForList("SHOW TABLES")).isEmpty();
            restoreDump(backup, checksum);
            assertThat(snapshot(restored, ALL_TABLES)).isEqualTo(baseline);
            assertThat(legacySchemaHash(restored)).isEqualTo(legacySchemaHash);
            assertSchema(restored);
            assertThat(restored.queryForMap("SELECT transaction_id FROM recurring_applications WHERE template_id=51 AND `year`=2026 AND `month`=12").get("transaction_id")).isNull();
            rejected(() -> restored.update("INSERT INTO recurring_applications (template_id,`year`,`month`) VALUES (51,2026,12)"), 1062);
            rejected(() -> restored.update("DELETE FROM recurring_templates WHERE id=51"), 1451);
            rejected(() -> restored.update("INSERT INTO recurring_applications (template_id,`year`,`month`) VALUES (51,2101,1)"), 3819);
            rejected(() -> restored.update("INSERT INTO recurring_applications (template_id,`year`,`month`) VALUES (51,2027,13)"), 3819);
            assertThat(snapshot(restored, ALL_TABLES)).isEqualTo(baseline);
            assertThat(Files.readAllBytes(backup)).isNotEmpty();
            assertThat(hash(Files.readAllBytes(backup))).isEqualTo(checksum);
            System.out.printf("D09 BACKUP restore=PASS tables=7 markers=2 nullableMarkers=1 bytes=%d sha256=%s%n", Files.size(backup), checksum);
        }
    }

    @Test
    void backendD09EntityValidatesAgainstMigratedSchemaWhenAvailable() throws Exception {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
        List<Class<?>> entities = new ArrayList<>();
        for (var candidate : scanner.findCandidateComponents("com.smartexpense.backend.entity")) {
            entities.add(Class.forName(candidate.getBeanClassName()));
        }
        boolean hasD09 = entities.stream().anyMatch(type -> type.getSimpleName().equals("RecurringApplication")
                || type.isAnnotationPresent(Table.class) && type.getAnnotation(Table.class).name().equals("recurring_applications"));
        Assumptions.assumeTrue(hasD09, "BLOCKED D09-BE: no Backend Entity mapped to recurring_applications; no substitute Entity or DDL is allowed");
        D12MigrationTestSupport.validateCurrentMappings(entities);
    }

    private static void assertSchema(JdbcTemplate db) {
        assertThat(db.queryForList("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'", String.class))
                .containsExactlyInAnyOrderElementsOf(ALL_TABLES);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND engine='InnoDB'", Integer.class)).isEqualTo(7);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()", Integer.class)).isEqualTo(10);
        assertThat(db.queryForList("SELECT CONCAT(column_name,':',column_type,':',is_nullable) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='recurring_applications'", String.class))
                .containsExactlyInAnyOrder("id:bigint:NO", "template_id:bigint:NO", "year:int:NO", "month:int:NO", "transaction_id:bigint:YES");
        assertThat(db.queryForObject("SELECT extra FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='recurring_applications' AND column_name='id'", String.class)).contains("auto_increment");
        assertThat(db.queryForMap("SELECT column_default FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='recurring_applications' AND column_name='transaction_id'").get("column_default")).isNull();
        assertThat(db.queryForList("SELECT CONCAT(index_name,':',non_unique,':',GROUP_CONCAT(column_name ORDER BY seq_in_index)) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='recurring_applications' GROUP BY index_name,non_unique", String.class))
                .containsExactlyInAnyOrder("PRIMARY:0:id", "uk_recurring_application_template_year_month:0:template_id,year,month", "idx_recurring_applications_transaction:1:transaction_id");
        assertThat(db.queryForList("SELECT CONCAT(column_name,'->',referenced_table_name,'.',referenced_column_name) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name='recurring_applications' AND referenced_table_schema=DATABASE()", String.class))
                .containsExactlyInAnyOrder("template_id->recurring_templates.id", "transaction_id->transactions.id");
        assertThat(db.queryForList("SELECT CONCAT(referenced_table_name,':',delete_rule,':',update_rule) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND table_name='recurring_applications'", String.class))
                .containsExactlyInAnyOrder("recurring_templates:RESTRICT:RESTRICT", "transactions:SET NULL:RESTRICT");
        assertThat(db.queryForList("SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name='recurring_applications' AND constraint_type='CHECK' AND enforced='YES'", String.class))
                .containsExactlyInAnyOrder("chk_recurring_applications_year", "chk_recurring_applications_month");
    }

    private static void seedLegacy() {
        for (int id : List.of(1, 2)) {
            jdbc.update("INSERT INTO users (id,full_name,email,password_hash,created_at) VALUES (?,?,?,?, '2026-01-02 03:04:05.123456')",
                    id, "Chủ D09 " + id, UUID.randomUUID() + "@example.test", UUID.randomUUID().toString());
        }
        jdbc.update("INSERT INTO categories (id,user_id,name,type,icon,color,created_at) VALUES (11,1,'Tiền thuê nhà','EXPENSE','house','#123456',CURRENT_TIMESTAMP),(12,1,'Thu nhập','INCOME',NULL,NULL,CURRENT_TIMESTAMP),(21,2,'Chi cũ','EXPENSE',NULL,NULL,CURRENT_TIMESTAMP)");
        jdbc.update("INSERT INTO transactions (id,user_id,category_id,type,amount,transaction_date,note,created_at) VALUES (101,1,11,'EXPENSE',123.45,'2026-11-30','Giao dịch cũ',CURRENT_TIMESTAMP),(102,1,12,'INCOME',2000.20,'2026-11-01',NULL,CURRENT_TIMESTAMP),(201,2,21,'EXPENSE',12.34,'1970-01-01','Dữ liệu năm 1970',CURRENT_TIMESTAMP)");
        jdbc.update("INSERT INTO monthly_budgets (id,user_id,`year`,`month`,amount_limit) VALUES (31,1,2026,11,7777.77),(32,2,1970,1,1000.00)");
        jdbc.update("INSERT INTO category_budgets (id,user_id,category_id,`year`,`month`,amount_limit) VALUES (41,1,11,2026,11,3333.33)");
        jdbc.update("INSERT INTO recurring_templates (id,user_id,category_id,type,amount,day_of_month,note,active) VALUES (51,1,11,'EXPENSE',123.45,31,'Mẫu cũ',1),(52,1,12,'INCOME',2000.20,1,NULL,1),(53,2,21,'EXPENSE',12.34,1,NULL,0)");
    }

    private static void insert(long template, int year, int month, Long transaction) {
        jdbc.update("INSERT INTO recurring_applications (template_id,`year`,`month`,transaction_id) VALUES (?,?,?,?)", template, year, month, transaction);
    }

    private static void rejected(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, int code) {
        Throwable failure = catchThrowable(action);
        assertThat(failure).isNotNull();
        SQLException sql = null;
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) if (cause instanceof SQLException actual) sql = actual;
        assertThat((Throwable) sql).isNotNull();
        assertThat(sql.getErrorCode()).isEqualTo(code);
    }

    private static void restoreDump(Path file, String expectedHash) throws Exception {
        guard(restore);
        if (!hash(Files.readAllBytes(file)).equals(expectedHash)) throw new IllegalStateException("D09 backup checksum mismatch; restore blocked");
        restore.copyFileToContainer(MountableFile.forHostPath(file.toString()), "/tmp/d09-restore.sql");
        var result = restore.execInContainer("sh", "-c", "MYSQL_PWD=\"$MYSQL_PASSWORD\" exec mysql --user=\"$MYSQL_USER\" --default-character-set=utf8mb4 --batch \"$MYSQL_DATABASE\" < /tmp/d09-restore.sql");
        assertThat(result.getExitCode()).as("Isolated restore exit code").isZero();
    }

    private static MySQLContainer localContainer(String role) {
        return new MySQLContainer("mysql:8.0") {
            @Override public void start() {
                URI socket = DockerClientFactory.instance().getTransportConfig().getDockerHost();
                boolean unix = "unix".equals(socket.getScheme()) && socket.getHost() == null;
                boolean pipe = "npipe".equals(socket.getScheme()) && socket.getPath().startsWith("//./pipe/");
                if (!unix && !pipe) throw new IllegalStateException("D09 migration only uses local Docker");
                super.start();
            }
        }.withDatabaseName(DATABASE).withUsername(USER).withPassword(UUID.randomUUID().toString()).withReuse(false)
                .withLabel("com.smartexpense.test", "d09-migration-" + role)
                .withUrlParam("useSSL", "false").withUrlParam("allowPublicKeyRetrieval", "true").withUrlParam("serverTimezone", "UTC")
                .withCreateContainerCmdModifier(cmd -> cmd.getHostConfig().withPortBindings(
                        new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(3306))));
    }

    private static void guard(MySQLContainer container) {
        if (container == null || container != SOURCE && container != restore) throw new IllegalStateException("Unknown D09 test container");
        URI target = URI.create(container.getJdbcUrl().substring(5));
        if (!container.isRunning() || !DATABASE.matches("se_d09_migration_[a-f0-9]{32}") || !DATABASE.equals(container.getDatabaseName())
                || !USER.equals(container.getUsername()) || !"mysql".equals(target.getScheme())
                || (!"localhost".equals(target.getHost()) && !"127.0.0.1".equals(target.getHost()))
                || target.getPort() != container.getMappedPort(3306) || target.getPort() == 3306 || !target.getPath().equals("/" + DATABASE)) {
            throw new IllegalStateException("D09 target is not the verified isolated test container");
        }
    }

    private static Connection connect(MySQLContainer container) throws Exception {
        guard(container);
        Connection result = DriverManager.getConnection(container.getJdbcUrl(), USER, container.getPassword());
        assertThat(result.getCatalog()).isEqualTo(DATABASE);
        assertThat(result.getMetaData().getDatabaseProductName()).isEqualTo("MySQL");
        assertThat(result.getMetaData().getDatabaseMajorVersion()).isEqualTo(8);
        assertThat(result.getMetaData().getUserName()).startsWith(USER + "@");
        return result;
    }

    private static JdbcTemplate jdbc(Connection target) {
        return new JdbcTemplate(new SingleConnectionDataSource(target, true));
    }

    private static void apply(Connection target, Path file) {
        ScriptUtils.executeSqlScript(target, new EncodedResource(new FileSystemResource(file), StandardCharsets.UTF_8));
    }

    private static Map<String, List<Map<String, Object>>> snapshot(JdbcTemplate db, List<String> tables) {
        Map<String, List<Map<String, Object>>> rows = new LinkedHashMap<>();
        for (String table : tables) rows.put(table, db.queryForList("SELECT * FROM " + table + " ORDER BY id"));
        return rows;
    }

    private static String legacySchemaHash(JdbcTemplate db) {
        // Tập bảng kỳ vọng cố định; không suy ngược schema đúng từ bảng vừa được tạo.
        String predicate = "table_schema=DATABASE() AND table_name IN ('users','categories','transactions','monthly_budgets','category_budgets','recurring_templates')";
        var columns = db.queryForList("SELECT table_name,column_name,column_type,is_nullable,column_default,extra FROM information_schema.columns WHERE " + predicate + " ORDER BY table_name,ordinal_position");
        var indexes = db.queryForList("SELECT table_name,index_name,non_unique,seq_in_index,column_name FROM information_schema.statistics WHERE " + predicate + " ORDER BY table_name,index_name,seq_in_index");
        var keys = db.queryForList("SELECT table_name,column_name,referenced_table_name,referenced_column_name FROM information_schema.key_column_usage WHERE " + predicate + " ORDER BY table_name,constraint_name,ordinal_position");
        return hash((columns.toString() + indexes + keys).getBytes(StandardCharsets.UTF_8));
    }

    private static String hash(byte[] data) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data)); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
