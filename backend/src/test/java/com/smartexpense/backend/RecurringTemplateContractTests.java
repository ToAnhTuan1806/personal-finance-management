package com.smartexpense.backend;

import com.smartexpense.backend.dto.recurring.RecurringTemplateRequest;
import com.smartexpense.backend.dto.recurring.RecurringTemplateResponse;
import com.smartexpense.backend.entity.RecurringTemplate;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryBudgetRepository;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.MonthlyBudgetRepository;
import com.smartexpense.backend.repository.RecurringTemplateRepository;
import com.smartexpense.backend.repository.RecurringApplicationRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Sort;
import org.springframework.data.repository.query.parser.PartTree;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// JsonMapper/Validator thật của ứng dụng; repository mock và DataSource bị tắt để không chạm DB.
@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
        "spring.datasource.url=jdbc:disabled:d08-contract-tests",
        "spring.jpa.hibernate.ddl-auto=none"
})
class RecurringTemplateContractTests {

    private static final String JWT_KEY = randomJwtKey();

    @Autowired Validator validator;
    @Autowired JsonMapper json;
    @MockitoBean UserRepository users;
    @MockitoBean CategoryRepository categories;
    @MockitoBean TransactionRepository transactions;
    @MockitoBean MonthlyBudgetRepository budgets;
    @MockitoBean CategoryBudgetRepository categoryBudgets;
    @MockitoBean RecurringTemplateRepository recurringTemplates;
    @MockitoBean RecurringApplicationRepository recurringApplications;
    @MockitoBean com.smartexpense.backend.service.PasswordResetService passwordReset;

    @DynamicPropertySource
    static void testProperties(DynamicPropertyRegistry registry) {
        registry.add("app.jwt.secret", () -> JWT_KEY);
    }

    @ParameterizedTest
    @CsvSource({"INCOME,1,true", "EXPENSE,29,true", "EXPENSE,30,false", "INCOME,31,false"})
    void acceptsMonthlyDaysAndBothStatesWithoutTransactionDateValidation(
            TransactionType type, int day, boolean active) {
        var request = validRequest();
        request.setType(type);
        request.setDayOfMonth(day);
        request.setActive(active);
        assertThat(validator.validate(request)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"categoryId", "type", "amount", "dayOfMonth", "active"})
    void rejectsMissingRequiredField(String field) {
        var request = validRequest();
        switch (field) {
            case "categoryId" -> request.setCategoryId(null);
            case "type" -> request.setType(null);
            case "amount" -> request.setAmount(null);
            case "dayOfMonth" -> request.setDayOfMonth(null);
            case "active" -> request.setActive(null);
            default -> throw new IllegalArgumentException(field);
        }
        assertThat(validator.validate(request)).extracting(v -> v.getPropertyPath().toString()).containsExactly(field);
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1})
    void rejectsNonPositiveCategory(long id) {
        var request = validRequest();
        request.setCategoryId(id);
        assertThat(validator.validate(request)).extracting(v -> v.getPropertyPath().toString()).containsExactly("categoryId");
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 32, -1})
    void rejectsDaysOutsideMonthlyRange(int day) {
        var request = validRequest();
        request.setDayOfMonth(day);
        assertThat(validator.validate(request)).extracting(v -> v.getPropertyPath().toString()).containsExactly("dayOfMonth");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "0.001", "1.001", "10000000000000.00"})
    void rejectsInvalidMoney(String amount) {
        var request = validRequest();
        request.setAmount(new BigDecimal(amount));
        assertThat(validator.validate(request)).isNotEmpty().allSatisfy(
                v -> assertThat(v.getPropertyPath().toString()).isEqualTo("amount"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0.01", "9999999999999.99"})
    void acceptsMoneyBoundaries(String amount) {
        var request = validRequest();
        request.setAmount(new BigDecimal(amount));
        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void noteIsOptionalAndLimitedToFiveHundredCharacters() {
        var request = validRequest();
        assertThat(validator.validate(request)).isEmpty();
        for (String note : new String[]{"", "đ".repeat(500)}) {
            request.setNote(note);
            assertThat(validator.validate(request)).isEmpty();
        }
        request.setNote("đ".repeat(501));
        assertThat(validator.validate(request)).extracting(v -> v.getPropertyPath().toString()).containsExactly("note");
    }

    @Test
    void jsonDistinguishesMissingAndNullActiveFromExplicitFalse() throws Exception {
        Map<String, Object> input = new LinkedHashMap<>(Map.of(
                "categoryId", 1, "type", "EXPENSE", "amount", 3000000, "dayOfMonth", 31));
        var missing = json.readValue(json.writeValueAsString(input), RecurringTemplateRequest.class);
        assertThat(missing.getActive()).isNull();
        assertThat(validator.validate(missing)).extracting(v -> v.getPropertyPath().toString()).containsExactly("active");
        input.put("active", null);
        var nullActive = json.readValue(json.writeValueAsString(input), RecurringTemplateRequest.class);
        assertThat(validator.validate(nullActive)).extracting(v -> v.getPropertyPath().toString()).containsExactly("active");
        input.put("active", false);
        var inactive = json.readValue(json.writeValueAsString(input), RecurringTemplateRequest.class);
        assertThat(inactive.getActive()).isFalse();
        assertThat(validator.validate(inactive)).isEmpty();
        input.put("type", "INVALID");
        assertThatThrownBy(() -> json.readValue(json.writeValueAsString(input), RecurringTemplateRequest.class))
                .isInstanceOf(JacksonException.class);
    }

    @Test
    void responseContainsExactlyContractFieldsAndNoOwnerOrTransactionDate() throws Exception {
        var response = new RecurringTemplateResponse(7L, 1L, "Tiền thuê nhà", TransactionType.EXPENSE,
                new BigDecimal("3000000.00"), 31, null, false);
        Map<String, Object> fields = json.readValue(json.writeValueAsString(response), new TypeReference<>() {});
        assertThat(fields.keySet()).containsExactlyInAnyOrder(
                "id", "categoryId", "categoryName", "type", "amount", "dayOfMonth", "note", "active");
        assertThat(fields.get("note")).isNull();
        assertThat(fields.get("active")).isEqualTo(false);
    }

    @ParameterizedTest
    @CsvSource(value = {
            "type|1", "type|\"1\"", "type|\"INVALID\"", "type|\"expense\"", "type|\" EXPENSE\"",
            "type|true", "type|{}", "type|[]",
            "dayOfMonth|31.9", "dayOfMonth|31.0", "dayOfMonth|\"31\"", "dayOfMonth|3.1e1",
            "dayOfMonth|2147483648", "dayOfMonth|true", "dayOfMonth|[31]",
            "active|1", "active|0", "active|\"true\"", "active|\"false\"", "active|[]",
            "categoryId|1.9", "categoryId|1.0", "categoryId|\"1\"", "categoryId|true",
            "categoryId|9223372036854775808", "categoryId|-9223372036854775809", "categoryId|[1]",
            "amount|\"12.34\"", "amount|true", "amount|{}", "amount|[12.34]",
            "note|123", "note|true", "note|{}", "note|[]"
    }, delimiter = '|')
    void rejectsJsonCoercionBeforeBeanValidation(String field, String raw) {
        assertThatThrownBy(() -> json.readValue(rawInput(field, raw), RecurringTemplateRequest.class))
                .isInstanceOf(JacksonException.class);
    }

    @ParameterizedTest
    @CsvSource(value = {
            "type|\"EXPENSE\"", "type|\"INCOME\"",
            "dayOfMonth|1", "dayOfMonth|29", "dayOfMonth|30", "dayOfMonth|31",
            "active|false", "active|true", "categoryId|1", "categoryId|9223372036854775807",
            "amount|1", "amount|0.01", "amount|9999999999999.99", "amount|1e3",
            "note|\"Tiền thuê nhà\"", "note|\"\""
    }, delimiter = '|')
    void acceptsCorrectJsonTypesAndPreservesValues(String field, String raw) throws Exception {
        var request = json.readValue(rawInput(field, raw), RecurringTemplateRequest.class);
        assertThat(validator.validate(request)).isEmpty();
        switch (field) {
            case "type" -> assertThat(request.getType()).isEqualTo(
                    TransactionType.valueOf(json.readValue(raw, String.class)));
            case "dayOfMonth" -> assertThat(request.getDayOfMonth()).isEqualTo(Integer.parseInt(raw));
            case "categoryId" -> assertThat(request.getCategoryId()).isEqualTo(Long.parseLong(raw));
            case "active" -> assertThat(request.getActive()).isEqualTo(Boolean.valueOf(raw));
            case "amount" -> assertThat(request.getAmount()).isEqualByComparingTo(new BigDecimal(raw));
            case "note" -> assertThat(request.getNote()).isEqualTo(json.readValue(raw, String.class));
            default -> throw new IllegalArgumentException(field);
        }
    }

    @ParameterizedTest
    @CsvSource({"categoryId,false", "type,false", "amount,false", "dayOfMonth,false", "active,false",
            "categoryId,true", "type,true", "amount,true", "dayOfMonth,true", "active,true"})
    void nullAndMissingRequiredJsonFieldsStillReachBeanValidation(String field, boolean missing) throws Exception {
        var input = rawFields();
        if (missing) input.remove(field);
        else input.put(field, "null");
        var request = json.readValue(rawInput(input), RecurringTemplateRequest.class);
        assertThat(validator.validate(request)).extracting(v -> v.getPropertyPath().toString()).containsExactly(field);
    }

    @ParameterizedTest
    @CsvSource(value = {"categoryId|0", "categoryId|-1", "categoryId|-9223372036854775808",
            "dayOfMonth|0", "dayOfMonth|32", "amount|0", "amount|-1",
            "amount|1.001", "amount|10000000000000.00"}, delimiter = '|')
    void correctJsonTypeStillRequiresBusinessValidation(String field, String raw) throws Exception {
        var request = json.readValue(rawInput(field, raw), RecurringTemplateRequest.class);
        assertThat(validator.validate(request)).isNotEmpty().allSatisfy(
                violation -> assertThat(violation.getPropertyPath().toString()).isEqualTo(field));
    }

    @Test
    void jsonNoteRemainsOptionalAndRetainsFiveHundredCharacterLimit() throws Exception {
        for (String raw : new String[]{"null", json.writeValueAsString("đ".repeat(500))}) {
            var request = json.readValue(rawInput("note", raw), RecurringTemplateRequest.class);
            assertThat(validator.validate(request)).isEmpty();
        }
        var absent = rawFields();
        absent.remove("note");
        assertThat(validator.validate(json.readValue(rawInput(absent), RecurringTemplateRequest.class))).isEmpty();
        var tooLong = json.readValue(rawInput("note", json.writeValueAsString("đ".repeat(501))), RecurringTemplateRequest.class);
        assertThat(validator.validate(tooLong)).extracting(v -> v.getPropertyPath().toString()).containsExactly("note");
    }

    @ParameterizedTest
    @CsvSource(value = {"findByIdAndUserId|id,user.id|false",
            "findByUserIdOrderByIdDesc|user.id|true",
            "findByUserIdAndActiveOrderByIdDesc|user.id,active|true"}, delimiter = '|')
    void repositoryQueriesResolveOwnerPathsAndDescendingId(String method, String paths, boolean paged) {
        assertThat(Arrays.stream(RecurringTemplateRepository.class.getDeclaredMethods()).anyMatch(m -> m.getName().equals(method))).isTrue();
        var tree = new PartTree(method, RecurringTemplate.class);
        assertThat(tree.getParts().stream().map(p -> p.getProperty().toDotPath())).containsExactly(paths.split(","));
        assertThat(tree.getSort()).isEqualTo(paged ? Sort.by(Sort.Direction.DESC, "id") : Sort.unsorted());
    }

    private RecurringTemplateRequest validRequest() {
        var request = new RecurringTemplateRequest();
        request.setCategoryId(1L);
        request.setType(TransactionType.EXPENSE);
        request.setAmount(new BigDecimal("3000000.00"));
        request.setDayOfMonth(31);
        request.setActive(true);
        return request;
    }

    // Ghép literal trực tiếp để giữ nguyên token float 31.0 / exponent, không round-trip qua tree.
    private Map<String, String> rawFields() {
        return new LinkedHashMap<>(Map.of("categoryId", "1", "type", "\"EXPENSE\"", "amount", "3000000",
                "dayOfMonth", "31", "active", "true", "note", "null"));
    }

    private String rawInput(String field, String raw) {
        var fields = rawFields();
        fields.put(field, raw);
        return rawInput(fields);
    }

    private String rawInput(Map<String, String> fields) {
        return fields.entrySet().stream().map(entry -> "\"" + entry.getKey() + "\":" + entry.getValue())
                .collect(Collectors.joining(",", "{", "}"));
    }

    private static String randomJwtKey() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }
}
