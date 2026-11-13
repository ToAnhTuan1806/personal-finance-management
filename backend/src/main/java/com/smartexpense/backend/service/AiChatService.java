package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatRequest;
import com.smartexpense.backend.dto.ai.AiChatResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.YearMonth;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AiChatService {
    private final AiFinancialContextService finances;
    private final AiRateLimiter limiter;
    private final AiProvider provider;
    private final AiFinancialReplyFormatter replies;
    private final AiQueryInterpreter interpreter;

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
