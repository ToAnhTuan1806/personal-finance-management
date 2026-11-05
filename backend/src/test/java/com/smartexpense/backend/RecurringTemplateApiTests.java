package com.smartexpense.backend;

import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.RecurringTemplate;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Controller, Service, Jackson và JWT thật; mock repository, không thay thế kiểm thử V004/MySQL.
@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
        "spring.datasource.url=jdbc:disabled:d08-api-tests",
        "spring.jpa.hibernate.ddl-auto=none"
})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class RecurringTemplateApiTests {

    private static final String BASE = "/api/recurring-templates";
    private static final String JWT_KEY = randomKey();
    private static final String INPUT = """
            {"categoryId":101,"type":"EXPENSE","amount":3000000.25,
             "dayOfMonth":31,"note":"Rent","active":true}
            """;

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @MockitoBean UserRepository users;
    @MockitoBean CategoryRepository categories;
    @MockitoBean TransactionRepository transactions;
    @MockitoBean MonthlyBudgetRepository budgets;
    @MockitoBean CategoryBudgetRepository categoryBudgets;
    @MockitoBean RecurringTemplateRepository templates;

    private Category category;
    private RecurringTemplate template;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.jwt.secret", () -> JWT_KEY);
    }

    @BeforeEach
    void fixtures() {
        User user = new User();
        user.setId(1L);
        category = new Category();
        category.setId(101L);
        category.setUser(user);
        category.setName("Rent");
        category.setType(TransactionType.EXPENSE);
        template = new RecurringTemplate();
        template.setId(501L);
        template.setUser(user);
        template.setCategory(category);
        template.setType(TransactionType.EXPENSE);
        template.setAmount(new BigDecimal("100.00"));
        template.setDayOfMonth(15);
        template.setNote("Original");
        template.setActive(true);
        when(categories.findByIdAndUserId(101L, 1L)).thenReturn(Optional.of(category));
        when(templates.findByIdAndUserId(501L, 1L)).thenReturn(Optional.of(template));
        when(templates.saveAndFlush(any())).thenAnswer(call -> {
            RecurringTemplate saved = call.getArgument(0);
            if (saved.getId() == null) saved.setId(503L);
            return saved;
        });
    }

    @AfterEach
    void neverTouchesTransactionsOrBudgets() {
        verifyNoInteractions(transactions, budgets, categoryBudgets);
    }

    @Test
    void createDetailUpdateToggleAndDeleteFollowContract() throws Exception {
        var created = as(post(BASE).content(INPUT), 1).andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(503))
                .andExpect(jsonPath("$.categoryId").value(101))
                .andExpect(jsonPath("$.categoryName").value("Rent"))
                .andExpect(jsonPath("$.type").value("EXPENSE"))
                .andExpect(jsonPath("$.amount").value(3000000.25))
                .andExpect(jsonPath("$.dayOfMonth").value(31))
                .andExpect(jsonPath("$.note").value("Rent"))
                .andExpect(jsonPath("$.active").value(true)).andReturn();
        assertThat(json.readTree(created.getResponse().getContentAsString()).size()).isEqualTo(8);
        var saved = org.mockito.ArgumentCaptor.forClass(RecurringTemplate.class);
        verify(templates).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getUser()).isSameAs(category.getUser());
        assertThat(saved.getValue().getAmount()).isEqualTo(new BigDecimal("3000000.25"));

        as(get(BASE + "/501"), 1).andExpect(status().isOk())
                .andExpect(jsonPath("$.amount").value(100.00));
        User originalOwner = template.getUser();
        as(put(BASE + "/501").content(INPUT.replace("true", "false")), 1)
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.amount").value(3000000.25))
                .andExpect(jsonPath("$.dayOfMonth").value(31));
        as(put(BASE + "/501").content(INPUT), 1)
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(true));
        assertThat(template.getUser()).isSameAs(originalOwner);
        as(delete(BASE + "/501"), 1).andExpect(status().isNoContent()).andExpect(content().string(""));
        verify(templates).delete(template);
        verify(categories, never()).save(any());
        verifyNoInteractions(users);
    }

    @Test
    void updateCanChangeCategoryAndTypeWithoutChangingOwner() throws Exception {
        Category income = new Category();
        income.setId(102L);
        income.setName("Salary");
        income.setUser(category.getUser());
        income.setType(TransactionType.INCOME);
        when(categories.findByIdAndUserId(102L, 1L)).thenReturn(Optional.of(income));
        as(put(BASE + "/501").content(INPUT.replace("101", "102").replace("EXPENSE", "INCOME")), 1)
                .andExpect(status().isOk()).andExpect(jsonPath("$.categoryId").value(102))
                .andExpect(jsonPath("$.categoryName").value("Salary"))
                .andExpect(jsonPath("$.type").value("INCOME"));
        assertThat(template.getCategory()).isSameAs(income);
        assertThat(template.getUser()).isSameAs(category.getUser());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "true", "false"})
    void listUsesOwnerScopedDescendingQueryAndOptionalActive(String active) throws Exception {
        var pageable = PageRequest.of(0, 10);
        var page = new PageImpl<>(List.of(template), pageable, 1);
        if (active.isEmpty()) {
            when(templates.findByUserIdOrderByIdDesc(1L, pageable)).thenReturn(page);
        } else {
            template.setActive(Boolean.parseBoolean(active));
            when(templates.findByUserIdAndActiveOrderByIdDesc(1L, Boolean.valueOf(active), pageable)).thenReturn(page);
        }
        var request = get(BASE);
        if (!active.isEmpty()) request.param("active", active);
        as(request, 1).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].id").value(501))
                .andExpect(jsonPath("$.content[0].active").value(template.isActive()))
                .andExpect(jsonPath("$.number").value(0)).andExpect(jsonPath("$.size").value(10));
        if (active.isEmpty()) {
            verify(templates).findByUserIdOrderByIdDesc(1L, pageable);
            verify(templates, never()).findByUserIdAndActiveOrderByIdDesc(any(), any(), any());
        } else {
            verify(templates).findByUserIdAndActiveOrderByIdDesc(1L, Boolean.valueOf(active), pageable);
            verify(templates, never()).findByUserIdOrderByIdDesc(any(), any());
        }
    }

    @Test
    void listPreservesRepositoryDescendingOrderAndPagination() throws Exception {
        RecurringTemplate newer = new RecurringTemplate();
        newer.setId(502L);
        newer.setCategory(category);
        var pageable = PageRequest.of(0, 2);
        when(templates.findByUserIdOrderByIdDesc(1L, pageable))
                .thenReturn(new PageImpl<>(List.of(newer, template), pageable, 3));
        as(get(BASE).param("size", "2"), 1).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(502))
                .andExpect(jsonPath("$.content[1].id").value(501))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void outOfRangePageAndAnotherOwnerReturnEmptyPage() throws Exception {
        var pageable = PageRequest.of(9, 10);
        when(templates.findByUserIdOrderByIdDesc(2L, pageable))
                .thenReturn(new PageImpl<>(List.of(), pageable, 0));
        as(get(BASE).param("page", "9"), 2).andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty()).andExpect(jsonPath("$.number").value(9));
        verify(templates).findByUserIdOrderByIdDesc(2L, pageable);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "DETAIL", "POST", "PUT", "DELETE"})
    void allEndpointsRequireJwt(String operation) throws Exception {
        var request = operation.equals("GET") ? get(BASE)
                : operation.equals("DETAIL") ? get(BASE + "/501") : endpoint(operation, 501L);
        error(mvc.perform(request.contentType(MediaType.APPLICATION_JSON)), 401, "UNAUTHORIZED");
        verifyNoInteractions(templates, categories);
    }

    @ParameterizedTest
    @CsvSource({"GET,501,2", "PUT,501,2", "DELETE,501,2", "GET,999,1", "PUT,999,1", "DELETE,999,1"})
    void missingAndForeignTemplatesAreIndistinguishable(String method, long id, long owner) throws Exception {
        error(as(endpoint(method, id), owner), 404, "RESOURCE_NOT_FOUND");
        verify(templates).findByIdAndUserId(id, owner);
        verify(templates, never()).saveAndFlush(any());
        verify(templates, never()).delete(any());
        verifyNoInteractions(categories);
        assertUnchanged();
    }

    @ParameterizedTest
    @CsvSource({"POST,999,404", "PUT,999,404", "POST,202,404", "PUT,202,404", "POST,101,400", "PUT,101,400"})
    void categoryMustExistBelongToOwnerAndMatchType(String method, long categoryId, int status) throws Exception {
        if (categoryId == 101) category.setType(TransactionType.INCOME);
        error(as(endpoint(method, 501L).content(INPUT.replace("101", Long.toString(categoryId))), 1),
                status, status == 400 ? "VALIDATION_ERROR" : "RESOURCE_NOT_FOUND");
        verify(categories).findByIdAndUserId(categoryId, 1L);
        verify(templates, never()).saveAndFlush(any());
        verify(categories, never()).save(any());
        assertUnchanged();
        if (method.equals("PUT")) {
            var order = inOrder(templates, categories);
            order.verify(templates).findByIdAndUserId(501L, 1L);
            order.verify(categories).findByIdAndUserId(categoryId, 1L);
        }
    }

    @ParameterizedTest
    @CsvSource({"type,1", "type,\"1\"", "type,\"INVALID\"", "dayOfMonth,31.9", "dayOfMonth,31.0",
            "dayOfMonth,\"31\"", "active,1", "active,\"true\"", "categoryId,1.9", "categoryId,\"1\"",
            "categoryId,9223372036854775808", "amount,\"12.34\"", "note,123"})
    void strictJsonRejectsWrongTypesOnPostAndPutBeforeRepositoryAccess(String field, String rawValue) throws Exception {
        String body = replaceRaw(field, rawValue);
        for (String method : List.of("POST", "PUT")) {
            error(as(endpoint(method, 501L).content(body), 1), 400, "VALIDATION_ERROR")
                    .andExpect(content().string(not(containsString("Jackson"))))
                    .andExpect(content().string(not(containsString("deserialize"))))
                    .andExpect(content().string(not(containsString(rawValue))));
        }
        verifyNoInteractions(templates, categories);
        assertUnchanged();
    }

    @ParameterizedTest
    @ValueSource(strings = {"categoryId", "type", "amount", "dayOfMonth", "active"})
    void nullAndMissingRequiredFieldsKeepFieldErrorsOnPostAndPut(String field) throws Exception {
        for (boolean missing : List.of(false, true)) {
            var body = (tools.jackson.databind.node.ObjectNode) json.readTree(INPUT).deepCopy();
            if (missing) body.remove(field);
            else body.putNull(field);
            for (String method : List.of("POST", "PUT")) {
                error(as(endpoint(method, 501L).content(body.toString()), 1), 400, "VALIDATION_ERROR")
                        .andExpect(jsonPath("$.errors." + field).isNotEmpty());
            }
        }
        verifyNoInteractions(templates, categories);
        assertUnchanged();
    }

    @ParameterizedTest
    @CsvSource({"dayOfMonth,0", "dayOfMonth,32", "amount,0", "amount,-1", "amount,10000000000000",
            "amount,0.001", "categoryId,0"})
    void beanValidationRejectsInvalidValuesWithoutMutation(String field, String rawValue) throws Exception {
        for (String method : List.of("POST", "PUT")) {
            error(as(endpoint(method, 501L).content(replaceRaw(field, rawValue)), 1), 400, "VALIDATION_ERROR")
                    .andExpect(jsonPath("$.errors." + field).isNotEmpty());
        }
        verifyNoInteractions(templates, categories);
        assertUnchanged();
    }

    @Test
    void tooLongNoteIsRejectedAndBlankNoteBecomesNull() throws Exception {
        error(as(post(BASE).content(replaceRaw("note", "\"" + "a".repeat(501) + "\"")), 1),
                400, "VALIDATION_ERROR").andExpect(jsonPath("$.errors.note").isNotEmpty());
        verifyNoInteractions(templates, categories);
        as(post(BASE).content(replaceRaw("note", "\"   \"")), 1).andExpect(status().isCreated())
                .andExpect(jsonPath("$.note").isEmpty());
    }

    @ParameterizedTest
    @CsvSource({"page,-1", "size,0", "size,101", "page,2147483647", "page,abc", "size,1.5", "active,maybe"})
    void invalidPaginationAndFilterReturn400(String field, String value) throws Exception {
        error(as(get(BASE).param(field, value), 1), 400, "VALIDATION_ERROR");
        verifyNoInteractions(templates, categories);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "1.9", "abc", "9223372036854775808"})
    void invalidIdsReturn400ForEveryDetailOperation(String id) throws Exception {
        for (String method : List.of("GET", "PUT", "DELETE")) {
            error(as(request(HttpMethod.valueOf(method), BASE + "/" + id).content(INPUT), 1),
                    400, "VALIDATION_ERROR");
        }
        verifyNoInteractions(templates, categories);
    }

    @Test
    void persistenceConflictsUseGeneric409WithoutPrivateDetails() throws Exception {
        doThrow(new DataIntegrityViolationException("D08_PRIVATE_DB_DETAIL"))
                .when(templates).saveAndFlush(any());
        error(as(post(BASE).content(INPUT), 1), 409, "CONFLICT")
                .andExpect(content().string(not(containsString("D08_PRIVATE_DB_DETAIL"))));
    }

    private MockHttpServletRequestBuilder endpoint(String method, long id) {
        String url = method.equals("POST") ? BASE : BASE + "/" + id;
        return request(HttpMethod.valueOf(method), url).content(INPUT);
    }

    private ResultActions as(MockHttpServletRequestBuilder request, long userId) throws Exception {
        Instant now = Instant.now();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(Long.toString(userId)).issuedAt(now)
                        .expiresAt(now.plusSeconds(600)).build())).getTokenValue();
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));
    }

    private ResultActions error(ResultActions result, int status, String code) throws Exception {
        return result.andExpect(status().is(status)).andExpect(jsonPath("$.status").value(status))
                .andExpect(jsonPath("$.code").value(code)).andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.trace").doesNotExist()).andExpect(jsonPath("$.exception").doesNotExist())
                .andExpect(content().string(not(containsString("tools.jackson"))));
    }

    private String replaceRaw(String field, String rawValue) {
        return INPUT.replaceAll("\"" + field + "\":(\"[^\"]*\"|[^,}\\s]+)",
                java.util.regex.Matcher.quoteReplacement("\"" + field + "\":" + rawValue));
    }

    private void assertUnchanged() {
        assertThat(template.getUser().getId()).isEqualTo(1L);
        assertThat(template.getCategory()).isSameAs(category);
        assertThat(template.getType()).isEqualTo(TransactionType.EXPENSE);
        assertThat(template.getAmount()).isEqualTo(new BigDecimal("100.00"));
        assertThat(template.getDayOfMonth()).isEqualTo(15);
        assertThat(template.getNote()).isEqualTo("Original");
        assertThat(template.isActive()).isTrue();
    }

    private static String randomKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }
}
