package com.smartexpense.backend;

import com.smartexpense.backend.dto.recurring.*;
import com.smartexpense.backend.dto.transaction.TransactionResponse;
import com.smartexpense.backend.entity.RecurringApplication;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.util.RecurringTemplateDates;
import jakarta.persistence.*;
import jakarta.validation.Validator;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.repository.query.parser.PartTree;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.YearMonth;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

// Mapper/Validator thật của Boot; tắt DataSource. HTTP apply/preview thuộc Commit 2.
@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
        "spring.datasource.url=jdbc:disabled:d09-contract-tests",
        "spring.jpa.hibernate.ddl-auto=none"
})
class RecurringApplicationContractTests {
    private static final String JWT_KEY = randomKey();
    @Autowired Validator validator;
    @Autowired JsonMapper json;
    @MockitoBean UserRepository users;
    @MockitoBean CategoryRepository categories;
    @MockitoBean TransactionRepository transactions;
    @MockitoBean MonthlyBudgetRepository budgets;
    @MockitoBean CategoryBudgetRepository categoryBudgets;
    @MockitoBean RecurringTemplateRepository templates;
    @MockitoBean RecurringApplicationRepository recurringApplications;
    @MockitoBean com.smartexpense.backend.service.PasswordResetService passwordReset;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.jwt.secret", () -> JWT_KEY);
    }

    @Test
    void entityMatchesV005ColumnsKeysAndRetentionPolicies() throws Exception {
        var table = RecurringApplication.class.getAnnotation(Table.class);
        assertThat(table.name()).isEqualTo("recurring_applications");
        assertThat(table.uniqueConstraints()).hasSize(1);
        assertThat(table.uniqueConstraints()[0].name()).isEqualTo("uk_recurring_application_template_year_month");
        assertThat(table.uniqueConstraints()[0].columnNames()).containsExactly("template_id", "year", "month");
        assertThat(table.indexes()).hasSize(1);
        assertThat(table.indexes()[0].name()).isEqualTo("idx_recurring_applications_transaction");
        assertThat(table.indexes()[0].columnList()).isEqualTo("transaction_id");
        assertThat(table.indexes()[0].unique()).isFalse();
        var id = RecurringApplication.class.getDeclaredField("id");
        assertThat(id.getType()).isEqualTo(Long.class);
        assertThat(id.getAnnotation(GeneratedValue.class).strategy()).isEqualTo(GenerationType.IDENTITY);
        assertThat(id.isAnnotationPresent(Id.class)).isTrue();
        for (String field : Arrays.asList("year", "month")) {
            var period = RecurringApplication.class.getDeclaredField(field);
            assertThat(period.getType()).isEqualTo(Integer.class);
            assertThat(period.getAnnotation(Column.class).nullable()).isFalse();
        }
        var template = RecurringApplication.class.getDeclaredField("template");
        assertThat(template.getAnnotation(ManyToOne.class).fetch()).isEqualTo(FetchType.LAZY);
        assertThat(template.getAnnotation(ManyToOne.class).optional()).isFalse();
        assertThat(template.getAnnotation(ManyToOne.class).cascade()).isEmpty();
        assertThat(template.getAnnotation(JoinColumn.class).name()).isEqualTo("template_id");
        assertThat(template.getAnnotation(JoinColumn.class).nullable()).isFalse();
        assertThat(template.getAnnotation(JoinColumn.class).foreignKey().name()).isEqualTo("fk_recurring_applications_template");
        assertThat(template.getAnnotation(OnDelete.class).action()).isEqualTo(OnDeleteAction.RESTRICT);
        var transaction = RecurringApplication.class.getDeclaredField("transaction");
        assertThat(transaction.getAnnotation(ManyToOne.class).fetch()).isEqualTo(FetchType.LAZY);
        assertThat(transaction.getAnnotation(ManyToOne.class).optional()).isTrue();
        assertThat(transaction.getAnnotation(ManyToOne.class).cascade()).isEmpty();
        assertThat(transaction.getAnnotation(JoinColumn.class).name()).isEqualTo("transaction_id");
        assertThat(transaction.getAnnotation(JoinColumn.class).nullable()).isTrue();
        assertThat(transaction.getAnnotation(JoinColumn.class).foreignKey().name()).isEqualTo("fk_recurring_applications_transaction");
        assertThat(transaction.getAnnotation(OnDelete.class).action()).isEqualTo(OnDeleteAction.SET_NULL);
    }

    @Test
    void everyDeclaredRepositoryLookupIncludesTemplateOwnerWithoutRequiringTransaction() {
        assertThat(RecurringApplicationRepository.class.getDeclaredMethods()).hasSize(2);
        for (var method : RecurringApplicationRepository.class.getDeclaredMethods()) {
            var tree = new PartTree(method.getName(), RecurringApplication.class);
            assertThat(tree.isExistsProjection()).isTrue();
            var paths = tree.getParts().stream().map(part -> part.getProperty().toDotPath()).toList();
            if (method.getName().endsWith("YearAndMonth")) {
                assertThat(paths).containsExactly("template.id", "template.user.id", "year", "month");
            } else {
                assertThat(paths).containsExactly("template.id", "template.user.id");
            }
            assertThat(paths).noneMatch(path -> path.startsWith("transaction"));
        }
    }

    @ParameterizedTest
    @CsvSource({"1900,1", "2026,11", "2100,12"})
    void acceptsFullPeriodRangeWithoutTransactionFutureDateValidation(int year, int month) throws Exception {
        var request = json.readValue("{\"year\":" + year + ",\"month\":" + month + "}", RecurringApplicationRequest.class);
        assertThat(validator.validate(request)).isEmpty();
        assertThat(request.getYear()).isEqualTo(year);
        assertThat(request.getMonth()).isEqualTo(month);
        Map<String, Object> fields = json.readValue(json.writeValueAsString(request), new TypeReference<>() {});
        assertThat(fields.keySet()).containsExactlyInAnyOrder("year", "month");
    }

    @ParameterizedTest
    @CsvSource({"year,1899", "year,2101", "month,0", "month,13"})
    void rejectsOutOfRangePeriodsWithFieldErrors(String field, int value) throws Exception {
        var request = json.readValue(raw(field, Integer.toString(value)), RecurringApplicationRequest.class);
        assertThat(validator.validate(request)).extracting(v -> v.getPropertyPath().toString()).containsExactly(field);
    }

    @ParameterizedTest
    @ValueSource(strings = {"year", "month"})
    void nullAndMissingRequiredFieldsRemainBeanValidationErrors(String field) throws Exception {
        var explicitNull = json.readValue(raw(field, "null"), RecurringApplicationRequest.class);
        assertThat(validator.validate(explicitNull)).extracting(v -> v.getPropertyPath().toString()).containsExactly(field);
        var missing = json.readValue(field.equals("year") ? "{\"month\":11}" : "{\"year\":2026}", RecurringApplicationRequest.class);
        assertThat(validator.validate(missing)).extracting(v -> v.getPropertyPath().toString()).containsExactly(field);
    }

    @ParameterizedTest
    @CsvSource(value = {"year|2026.9", "year|2026.0", "year|2.026e3", "year|\"2026\"", "year|true",
            "year|[]", "year|{}", "year|2147483648", "month|11.9", "month|11.0", "month|1.1e1",
            "month|\"11\"", "month|false", "month|[]", "month|{}", "month|2147483648"}, delimiter = '|')
    void rejectsJsonCoercionAndIntegerOverflowBeforeValidation(String field, String value) {
        assertThatThrownBy(() -> json.readValue(raw(field, value), RecurringApplicationRequest.class))
                .isInstanceOf(JacksonException.class);
    }

    @Test
    void previewSerializesExactlyContractFieldsAndReusesD08CalendarHelper() throws Exception {
        var date = RecurringTemplateDates.resolve(YearMonth.of(2028, 2), 31);
        var response = new RecurringPreviewResponse(51L, 2028, 2, date, 11L, "Tiền thuê nhà",
                TransactionType.EXPENSE, new BigDecimal("9999999999999.99"), null, false, true, null);
        String serialized = json.writeValueAsString(response);
        Map<String, Object> fields = json.readValue(serialized, new TypeReference<>() {});
        assertThat(fields.keySet()).containsExactlyInAnyOrder("templateId", "year", "month", "transactionDate",
                "categoryId", "categoryName", "type", "amount", "note", "alreadyApplied", "canApply", "reasonCode");
        assertThat(fields.get("transactionDate")).isEqualTo("2028-02-29");
        assertThat(fields.get("reasonCode")).isNull();
        assertThat(fields.get("note")).isNull();
        assertThat(fields.get("alreadyApplied")).isEqualTo(false);
        assertThat(fields.get("canApply")).isEqualTo(true);
        assertThat(json.readValue(serialized, RecurringPreviewResponse.class).getAmount()).isEqualTo(response.getAmount());
    }

    @ParameterizedTest
    @ValueSource(strings = {"ALREADY_APPLIED", "TEMPLATE_INACTIVE"})
    void previewCanCarryContractReasonCodesWithoutAddingFields(String reason) throws Exception {
        var response = new RecurringPreviewResponse();
        response.setReasonCode(reason);
        Map<String, Object> fields = json.readValue(json.writeValueAsString(response), new TypeReference<>() {});
        assertThat(fields.get("reasonCode")).isEqualTo(reason);
    }

    @Test
    void applicationUsesExistingTransactionDtoAndKeepsNullAfterDeletion() throws Exception {
        var date = RecurringTemplateDates.resolve(YearMonth.of(2027, 4), 31);
        var transaction = new TransactionResponse(101L, 11L, "Tiền thuê nhà", TransactionType.EXPENSE,
                new BigDecimal("123.45"), date, null);
        var response = new RecurringApplicationResponse(1L, 51L, 2027, 4, 101L, transaction);
        Map<String, Object> fields = json.readValue(json.writeValueAsString(response), new TypeReference<>() {});
        assertThat(fields.keySet()).containsExactlyInAnyOrder("id", "templateId", "year", "month", "transactionId", "transaction");
        assertThat(((Map<?, ?>) fields.get("transaction")).keySet().stream().map(Object::toString).toList())
                .containsExactlyInAnyOrder("id", "categoryId", "categoryName", "type", "amount", "transactionDate", "note");
        assertThat(json.readValue(json.writeValueAsString(response), RecurringApplicationResponse.class)
                .getTransaction().getAmount()).isEqualTo(transaction.getAmount());
        response.setTransactionId(null);
        response.setTransaction(null);
        fields = json.readValue(json.writeValueAsString(response), new TypeReference<>() {});
        assertThat(fields).containsEntry("transactionId", null).containsEntry("transaction", null);
    }

    private static String raw(String field, String value) {
        return "{\"year\":" + (field.equals("year") ? value : "2026")
                + ",\"month\":" + (field.equals("month") ? value : "11") + "}";
    }

    private static String randomKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }
}
