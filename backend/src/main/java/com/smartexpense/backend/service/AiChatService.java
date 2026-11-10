package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatRequest;
import com.smartexpense.backend.dto.ai.AiChatResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.text.Normalizer;
import java.time.YearMonth;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AiChatService {
    private final AiFinancialContextService finances;
    private final AiRateLimiter limiter;
    private final AiProvider provider;
    private final AiFinancialReplyFormatter replies;

    public AiChatResponse chat(Long userId, AiChatRequest request) {
        if (request.message() == null || request.message().isBlank() || request.message().length() > 500
                || request.month() == null || !request.month().matches("[0-9]{4}-(0[1-9]|1[0-2])")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Câu hỏi hoặc tháng không hợp lệ");
        }
        int year = YearMonth.parse(request.month()).getYear();
        if (year < 1900 || year > 2100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Năm phải nằm trong khoảng 1900-2100");
        }
        limiter.acquire(userId);
        String text = Normalizer.normalize(request.message(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replace('đ', 'd');
        // Đây là định tuyến UX, không phải ranh giới phân quyền. Mọi query luôn dùng JWT owner.
        if (text.matches("(?s).*\\b(xoa|sua|tao|delete|update|insert|create|sql)\\b.*")
                || text.matches("(?s).*(nguoi khac|user khac|tai khoan khac|user\\s*\\d+|user\\s*id|other user).*") ) {
            return new AiChatResponse("Trợ lý chỉ đọc dữ liệu của bạn, không xem tài khoản khác hoặc thay đổi giao dịch/ngân sách.",
                    request.month(), "UNSUPPORTED", null, List.of(), null);
        }
        String intent = text.matches("(?s).*(ngan sach|han muc|budget|vuot).*") ? "BUDGET"
                : text.matches("(?s).*(danh muc|category|categories|nhieu nhat|cao nhat).*") ? "CATEGORIES"
                : text.matches("(?s).*(bao nhieu|tong thu|tong chi|so du|thu chi|income|expense|balance).*") ? "SUMMARY"
                : "ADVICE";
        var context = finances.load(userId, request.month(), intent);
        // Không ghép lời provider chưa xác minh vào câu trả lời có số liệu/trạng thái tài chính.
        String reply = intent.equals("ADVICE") ? provider.explain(intent, context)
                : replies.format(intent, request.month(), context);
        return new AiChatResponse(reply, request.month(), intent,
                context.stats(), context.topCategories(), context.budget());
    }
}
