package com.smartexpense.backend;

import com.smartexpense.backend.config.SecurityConfig;
import com.smartexpense.backend.controller.TransactionExportController;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.Transaction;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import com.smartexpense.backend.security.*;
import com.smartexpense.backend.service.TransactionExportService;
import com.smartexpense.backend.service.TransactionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.*;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(TransactionExportController.class)
@Import({TransactionExportService.class, TransactionService.class, SecurityConfig.class,
        JwtConfig.class, ApiSecurityExceptionHandler.class})
class CsvExportApiTests {
    private static final String ENDPOINT = "/api/transactions/export";
    private static final String KEY = randomKey();
    @Autowired MockMvc mvc;
    @Autowired JwtEncoder encoder;
    @MockitoBean TransactionRepository transactions;
    @MockitoBean CategoryRepository categories;
    @MockitoBean UserRepository users;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) { registry.add("app.jwt.secret", () -> KEY); }

    @Test
    void exportsAllBatchesWithFiltersSortAndOwnerFromJwt() throws Exception {
        var start = LocalDate.of(2026, 11, 1);
        var end = LocalDate.of(2026, 12, 1);
        when(transactions.searchTransactions(eq(7L), eq(TransactionType.EXPENSE), eq(12L),
                eq(start), eq(end), eq("cà phê"), any())).thenAnswer(call -> {
            Pageable page = call.getArgument(6);
            assertThat(page.getPageSize()).isEqualTo(100);
            assertThat(page.getSort()).isEqualTo(Sort.by(Sort.Order.desc("transactionDate"), Sort.Order.desc("id")));
            List<Transaction> rows = new ArrayList<>();
            for (long id = 101 - page.getOffset(); id >= Math.max(1, 2 - page.getOffset()); id--) rows.add(row(id, "cà phê"));
            return new PageImpl<>(rows, page, 101);
        });
        byte[] bytes = mvc.perform(get(ENDPOINT).param("month", "2026-11").param("type", "EXPENSE")
                        .param("categoryId", "12").param("keyword", "  cà phê  ").param("userId", "999")
                        .header(HttpHeaders.AUTHORIZATION, bearer("7", false)))
                .andExpect(status().isOk()).andExpect(content().contentType("text/csv;charset=UTF-8"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.matchesPattern(
                        "attachment; filename=\"smart-expense-[0-9]{8}\\.csv\"")))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(Arrays.copyOf(bytes, 3)).containsExactly((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
        var csv = parseCsv(new String(bytes, StandardCharsets.UTF_8).substring(1));
        assertThat(csv).hasSize(102);
        assertThat(csv.getFirst()).containsExactly("Mã giao dịch", "Ngày giao dịch", "Loại", "Danh mục", "Số tiền", "Ghi chú");
        assertThat(csv.get(1)).containsExactly("101", "2026-11-09", "EXPENSE", "Ăn uống", "1234567890123.45", "cà phê");
        assertThat(csv.getLast().getFirst()).isEqualTo("1");
        verify(transactions, times(2)).searchTransactions(eq(7L), eq(TransactionType.EXPENSE), eq(12L),
                eq(start), eq(end), eq("cà phê"), any());
        verifyNoInteractions(categories, users);
    }

    @ParameterizedTest
    @ValueSource(strings = {"=SUM(1,2)", "+cmd", "-1+2", "@SUM(1)", "  =1", "\t=1", "\r=1", "\n=1",
            "\u0000=1", "\uFEFF=1", "\u200B=1", "\u00A0=1", "＝1", "＋1", "－1", "＠SUM(1)"})
    void neutralizesFormulaVariantsInBothTextColumnsAfterParsing(String text) throws Exception {
        var row = row(1L, text);
        row.getCategory().setName(text);
        stub(List.of(row), 1);
        var csv = exportRows();
        assertThat(csv.get(1).get(3)).isEqualTo("'" + text);
        assertThat(csv.get(1).get(5)).isEqualTo("'" + text);
        assertThat(csv.get(1).get(4)).isEqualTo("1234567890123.45");
    }

    @Test
    void roundTripsVietnameseCommaQuoteNewlineAndNull() throws Exception {
        String note = "Ăn, uống \"cà phê\"\r\nDòng hai";
        stub(List.of(row(2L, note), row(1L, null)), 2);
        var csv = exportRows();
        assertThat(csv).hasSize(3);
        assertThat(csv.get(1).get(5)).isEqualTo("'" + note);
        assertThat(csv.get(2).get(5)).isEmpty();
    }

    @Test
    void emptyExportKeepsHeader() throws Exception {
        stub(List.of(), 0);
        assertThat(exportRows()).hasSize(1);
    }

    @Test
    void rejectsOverLimitBeforeSendingAnyCsv() throws Exception {
        stub(List.of(row(1L, "sample")), 10001);
        mvc.perform(get(ENDPOINT).accept("text/csv").header(HttpHeaders.AUTHORIZATION, bearer("7", false)))
                .andExpect(status().is(422)).andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.code").value("EXPORT_LIMIT_EXCEEDED"))
                .andExpect(header().doesNotExist("Content-Disposition"));
        verify(transactions, times(1)).searchTransactions(anyLong(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void acceptsExactlyTenThousandWithoutTruncation() throws Exception {
        when(transactions.searchTransactions(anyLong(), any(), any(), any(), any(), any(), any()))
                .thenAnswer(call -> {
                    Pageable page = call.getArgument(6);
                    return new PageImpl<>(Collections.nCopies(100, row(1L, null)), page, 10000);
                });
        assertThat(exportRows()).hasSize(10001);
        verify(transactions, times(100)).searchTransactions(anyLong(), any(), any(), any(), any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"page", "size", "sort"})
    void rejectsPaginationParameters(String parameter) throws Exception {
        mvc.perform(get(ENDPOINT).param(parameter, "1").header(HttpHeaders.AUTHORIZATION, bearer("7", false)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        verifyNoInteractions(transactions);
    }

    @Test
    void reusesDateValidationAndInclusiveEndDate() throws Exception {
        String token = bearer("7", false);
        mvc.perform(get(ENDPOINT).param("month", "2026-11").param("startDate", "2026-11-01")
                .param("endDate", "2026-11-30").header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isBadRequest());
        mvc.perform(get(ENDPOINT).param("startDate", "2026-11-01").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isBadRequest());
        mvc.perform(get(ENDPOINT).param("startDate", "2026-11-30").param("endDate", "2026-11-01")
                .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isBadRequest());
        when(transactions.searchTransactions(eq(7L), isNull(), isNull(), eq(LocalDate.of(2026, 11, 30)),
                eq(LocalDate.of(2026, 12, 1)), isNull(), any())).thenReturn(Page.empty());
        mvc.perform(get(ENDPOINT).param("startDate", "2026-11-30").param("endDate", "2026-11-30")
                .header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isOk());
        verify(transactions).searchTransactions(eq(7L), isNull(), isNull(), eq(LocalDate.of(2026, 11, 30)),
                eq(LocalDate.of(2026, 12, 1)), isNull(), any());
    }

    @Test
    void requiresValidJwtBeforeQueries() throws Exception {
        mvc.perform(get(ENDPOINT)).andExpect(status().isUnauthorized());
        mvc.perform(get(ENDPOINT).header(HttpHeaders.AUTHORIZATION, "Bearer invalid")).andExpect(status().isUnauthorized());
        mvc.perform(get(ENDPOINT).header(HttpHeaders.AUTHORIZATION, bearer("7", true))).andExpect(status().isUnauthorized());
        verifyNoInteractions(transactions);
    }

    private void stub(List<Transaction> rows, long total) {
        when(transactions.searchTransactions(anyLong(), any(), any(), any(), any(), any(), any()))
                .thenAnswer(c -> new PageImpl<>(rows, c.getArgument(6), total));
    }

    private List<List<String>> exportRows() throws Exception {
        byte[] bytes = mvc.perform(get(ENDPOINT).header(HttpHeaders.AUTHORIZATION, bearer("7", false)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        return parseCsv(new String(bytes, StandardCharsets.UTF_8).substring(1));
    }

    // Parser độc lập đọc cả quoted multiline fields, không split theo dòng/dấu phẩy.
    static List<List<String>> parseCsv(String input) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (c == '"') {
                if (quoted && i + 1 < input.length() && input.charAt(i + 1) == '"') { cell.append('"'); i++; }
                else quoted = !quoted;
            } else if (!quoted && c == ',') { row.add(cell.toString()); cell.setLength(0); }
            else if (!quoted && c == '\r' && i + 1 < input.length() && input.charAt(i + 1) == '\n') {
                row.add(cell.toString()); rows.add(List.copyOf(row)); row.clear(); cell.setLength(0); i++;
            } else cell.append(c);
        }
        assertThat(quoted).isFalse();
        assertThat(cell).isEmpty();
        return rows;
    }

    private Transaction row(Long id, String note) {
        Category category = new Category(); category.setId(12L); category.setName("Ăn uống");
        Transaction transaction = new Transaction(); transaction.setId(id); transaction.setCategory(category);
        transaction.setType(TransactionType.EXPENSE); transaction.setAmount(new BigDecimal("1234567890123.45"));
        transaction.setTransactionDate(LocalDate.of(2026, 11, 9)); transaction.setNote(note);
        return transaction;
    }

    private String bearer(String owner, boolean expired) {
        Instant now = Instant.now();
        return "Bearer " + encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(owner).issuedAt(now.minusSeconds(1200))
                        .expiresAt(expired ? now.minusSeconds(600) : now.plusSeconds(600)).build())).getTokenValue();
    }

    private static String randomKey() {
        byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes); return Base64.getEncoder().encodeToString(bytes);
    }
}
