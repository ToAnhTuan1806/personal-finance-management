package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatRequest;
import com.smartexpense.backend.dto.ai.AiChatResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class AiChatService {
    private static final ZoneId VIETNAM_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter VIETNAM_DATE = DateTimeFormatter.ofPattern("EEEE, dd/MM/uuuu", Locale.forLanguageTag("vi-VN"));
    private static final Pattern QUESTION_WORD = Pattern.compile("\\p{L}{2,}");
    private final AiFinancialContextService finances;
    private final AiRateLimiter limiter;
    private final AiProvider provider;
    private final AiFinancialReplyFormatter replies;
    private final AiQueryInterpreter interpreter;
    private final CategoryRepository categories;
    private final AiFinancialAnalysisService analyses;
    private final UserRepository users;
    private final Clock clock;
    private final AiGeminiReviews geminiReviews = new AiGeminiReviews();

    public AiChatResponse chat(Long userId, AiChatRequest request) {
        validateRequest(request);
        var query = interpreter.interpret(request);
        String month = query.month();
        String intent = query.intent();
        if (Boolean.TRUE.equals(request.previewOpenQuestions()) && !query.annual()
                && (intent.equals("ADVICE") || (intent.equals("UNKNOWN") && isOpenQuestion(request.message())))) {
            if (Boolean.TRUE.equals(request.autoSendGemini())) {
                return answerWithGemini(userId, geminiReviews.filterForAutomaticSend(request.message()),
                        month, query.compareMonth());
            }
            var preview = geminiReviews.prepare(userId,
                    new AiChatRequest(request.message(), month, query.compareMonth()), clock.instant());
            return new AiChatResponse("Xem lại nội dung trước khi gửi tới Gemini.", month, "UNKNOWN",
                    null, List.of(), null, null, null, null,
                    new AiChatResponse.GeminiPreview(preview.id(), preview.text()));
        }
        limiter.acquire(userId);
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
                    expense.note(), LocalDate.now(VIETNAM_ZONE), TransactionType.EXPENSE);
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
        if (List.of("SPENDING_INSIGHT", "BUDGET_FORECAST", "PURCHASE_SIMULATION").contains(intent)) {
            var analysis = analyses.analyze(userId, query);
            return new AiChatResponse(analysis.summary(), month, intent, null, List.of(), null, null, null, analysis);
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

    private static boolean isOpenQuestion(String message) {
        long words = QUESTION_WORD.matcher(message).results().limit(3).count();
        return words >= 3 || (words >= 2 && message.indexOf('?') >= 0);
    }

    public AiGeminiReviews.Preview previewGemini(Long userId, AiChatRequest request) {
        validateRequest(request);
        var query = interpreter.interpret(request);
        if (query.intent().equals("UNSUPPORTED")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chỉ xem trước câu hỏi về tài chính cá nhân hoặc cách dùng SmartExpense");
        }
        return geminiReviews.prepare(userId,
                new AiChatRequest(request.message(), query.month(), query.compareMonth()), clock.instant());
    }

    public AiChatResponse sendApprovedGemini(Long userId, UUID previewId) {
        var reviewed = geminiReviews.consume(userId, previewId, clock.instant());
        return answerWithGemini(userId, reviewed.approvedQuestion(), reviewed.month(), reviewed.compareMonth());
    }

    private AiChatResponse answerWithGemini(Long userId, AiGeminiReviews.ApprovedQuestion question,
                                            String month, String compareMonth) {
        limiter.acquire(userId);
        var answer = provider.answerApproved(question);
        return switch (answer.action()) {
            case OUT_OF_SCOPE -> new AiChatResponse(
                    "Mình có thể giúp về tài chính cá nhân, cách dùng SmartExpense hoặc hồ sơ của bạn.",
                    month, "UNSUPPORTED", null, List.of(), null);
            case REPLY -> approvedReply(userId, month, answer.text());
            case TODAY -> approvedReply(userId, month,
                    "Hôm nay là " + LocalDate.now(clock.withZone(VIETNAM_ZONE)).format(VIETNAM_DATE) + " (giờ Việt Nam).");
            case PROFILE -> approvedReply(userId, month, users.findById(userId)
                    .map(user -> "Họ và tên: " + user.getFullName() + "\nEmail đăng nhập: " + user.getEmail())
                    .orElse("Không tải được hồ sơ tài khoản đang đăng nhập."));
            case SUMMARY, CATEGORIES, BUDGET -> {
                String intent = answer.action().name();
                var context = finances.load(userId, month, intent);
                yield new AiChatResponse(replies.format(intent, month, context), month, intent,
                        context.stats(), context.topCategories(), context.budget());
            }
            case COMPARISON, CATEGORY_TREND -> {
                String base = compareMonth;
                if (base == null || base.equals(month)) base = YearMonth.parse(month).minusMonths(1).toString();
                validateMonth(base, "compareMonth");
                String intent = answer.action().name();
                var comparison = finances.loadComparison(userId, month, base);
                yield new AiChatResponse(replies.formatComparison(intent, comparison), month, intent,
                        comparison.target(), List.of(), null, comparison);
            }
        };
    }

    private AiChatResponse approvedReply(Long userId, String month, String text) {
        var context = finances.load(userId, month, "ADVICE");
        return new AiChatResponse(text, month, "ADVICE", context.stats(), List.of(), null);
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

    private void validateRequest(AiChatRequest request) {
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
            if (request.context().intent() == null || !request.context().intent().matches("SUMMARY|CATEGORIES|BUDGET|ADVICE|COMPARISON|CATEGORY_TREND|SPENDING_INSIGHT|BUDGET_FORECAST|PURCHASE_SIMULATION")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "context.intent không hợp lệ");
            }
        }
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
