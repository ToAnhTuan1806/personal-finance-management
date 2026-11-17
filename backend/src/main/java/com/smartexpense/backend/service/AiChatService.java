package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatRequest;
import com.smartexpense.backend.dto.ai.AiChatResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AiChatService {
    private final AiFinancialContextService finances;
    private final AiRateLimiter limiter;
    private final AiProvider provider;
    private final AiFinancialReplyFormatter replies;
    private final AiQueryInterpreter interpreter;
    private final CategoryRepository categories;

    public AiChatResponse chat(Long userId, AiChatRequest request) {
        if (request.message() == null || request.message().isBlank() || request.message().length() > 500
                || request.month() == null || !request.month().matches("[0-9]{4}-(0[1-9]|1[0-2])")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Câu hỏi hoặc tháng không hợp lệ");
        }
        YearMonth target = validateMonth(request.month(), "month");
        if (request.compareMonth() != null) {
            YearMonth base = validateMonth(request.compareMonth(), "compareMonth");
            if (base.equals(target)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "compareMonth không được trùng month");
            }
        }
        if (request.context() != null) {
            validateMonth(request.context().month(), "context.month");
            if (request.context().compareMonth() != null) validateMonth(request.context().compareMonth(), "context.compareMonth");
            if (request.context().intent() == null || !request.context().intent().matches("SUMMARY|CATEGORIES|BUDGET|ADVICE|COMPARISON|CATEGORY_TREND")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "context.intent không hợp lệ");
            }
        }
        limiter.acquire(userId);
        var query = interpreter.interpret(request);
        String month = query.month();
        String intent = query.intent();
        if (intent.equals("GREETING")) {
            return new AiChatResponse("Xin chào! Bạn muốn ghi khoản chi hay xem thu chi?"
                    + "\nGhi chi theo mẫu: nội dung + số tiền + ghi chú (nếu có). Mình sẽ chờ bạn xác nhận trước khi lưu.",
                    month, intent, null, List.of(), null);
        }
        if (intent.equals("CREATE_EXPENSE")) {
            var expense = query.expense();
            Category category = matchCategory(userId, expense.categoryKeyword());
            var suggestion = new AiChatResponse.SuggestedExpense(expense.amount(),
                    category == null ? null : category.getId(), category == null ? null : category.getName(),
                    expense.note(), LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")), TransactionType.EXPENSE);
            return new AiChatResponse("Mình đã soạn sẵn giao dịch chi tiêu bên dưới, bạn hãy kiểm tra và xác nhận lưu nhé!",
                    month, intent, null, List.of(), null, null, suggestion);
        }
        if (intent.equals("UNSUPPORTED")) {
            return new AiChatResponse("Trợ lý chỉ đọc dữ liệu của bạn, không xem tài khoản khác hoặc thay đổi giao dịch/ngân sách.",
                    month, intent, null, List.of(), null);
        }
        if (intent.equals("UNKNOWN")) {
            String reason = query.annual() ? "Chưa hỗ trợ thống kê cả năm; dữ liệu một tháng không đại diện cho cả năm. " : "Mình chưa hiểu rõ yêu cầu. ";
            return new AiChatResponse(reason + "Mình hỗ trợ 6 khả năng: tổng thu/chi/số dư (SUMMARY); danh mục chi nhiều (CATEGORIES); "
                    + "kiểm tra ngân sách (BUDGET); tư vấn chung (ADVICE); so sánh hai tháng (COMPARISON); xu hướng danh mục (CATEGORY_TREND)."
                    + "\nBạn có thể hỏi:\n1. Tổng chi tháng này bao nhiêu?\n2. So sánh thu chi tháng này với tháng trước."
                    + "\n3. Danh mục nào tăng chi tiêu nhiều nhất?", month, intent, null, List.of(), null);
        }
        if (intent.equals("COMPARISON") || intent.equals("CATEGORY_TREND")) {
            var result = finances.loadComparison(userId, month, query.compareMonth());
            return new AiChatResponse(replies.formatComparison(intent, result), month, intent,
                    result.target(), List.of(), null, result);
        }
        var context = finances.load(userId, month, intent);
        String reply = intent.equals("ADVICE") ? provider.explain(intent, context) : replies.format(intent, month, context);
        return new AiChatResponse(reply, month, intent, context.stats(), context.topCategories(), context.budget());
    }

    private Category matchCategory(Long userId, String keyword) {
        var owned = new LinkedHashMap<String, Category>();
        categories.findByUserIdAndType(userId, TransactionType.EXPENSE)
                .forEach(category -> owned.putIfAbsent(AiQueryInterpreter.normalize(category.getName()), category));
        List<String> names = AiQueryInterpreter.categoryNames(keyword);
        for (String name : names) {
            if (owned.containsKey(name)) return owned.get(name);
        }
        for (String name : names) {
            for (var category : owned.entrySet()) {
                if ((" " + category.getKey() + " ").contains(" " + name + " ")) return category.getValue();
            }
        }
        return owned.entrySet().stream().filter(category -> category.getKey()
                .matches("khac|chi tieu khac|chung|danh muc chung|other|others"))
                .map(java.util.Map.Entry::getValue).findFirst().orElse(null);
    }

    private YearMonth validateMonth(String month, String field) {
        if (month == null || !month.matches("[0-9]{4}-(0[1-9]|1[0-2])")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " phải có định dạng YYYY-MM");
        }
        YearMonth parsed = YearMonth.parse(month);
        if (parsed.getYear() < 1900 || parsed.getYear() > 2100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + ": năm phải nằm trong khoảng 1900-2100");
        }
        return parsed;
    }
}
