package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatRequest;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.time.Clock;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Định tuyến hữu hạn, không thực thi prompt hoặc chuyển prompt/số liệu sang provider. */
@Component
public class AiQueryInterpreter {
    private static final Pattern MONTHS = Pattern.compile(
            "\\b(?:thang\\s*(?:thu\\s*)?|t(?=\\d))(nay|truoc|\\d{1,2}(?:\\s*/\\s*\\d{4})?)(?![\\d/])\\b"
                    + "|\\b(\\d{4})-(\\d{2})\\b|\\b(\\d{1,2})/(\\d{4})\\b");
    private final Clock clock;
    public AiQueryInterpreter() { this(Clock.system(ZoneId.of("Asia/Ho_Chi_Minh"))); }
    public AiQueryInterpreter(Clock clock) { this.clock = clock; }

    public record Query(String intent, String month, String compareMonth, boolean annual) { }

    public static String normalize(String value) {
        return Normalizer.normalize(Normalizer.normalize(value, Normalizer.Form.NFKC), Normalizer.Form.NFD)
                .replaceAll("\\p{M}|\\p{Cf}", "").toLowerCase(Locale.ROOT).replace('đ', 'd')
                .replaceAll("\\s+", " ").trim();
    }

    public Query interpret(AiChatRequest request) {
        String text = normalize(request.message());
        // Từ chối trước mọi hiệu chỉnh typo/intent/context. Phân quyền vẫn luôn ở JWT/query.
        if (has(text, "\\b(xoa|sua|tao|delete|update|insert|create|sql|drop|truncate)\\b"
                + "|nguoi khac|user khac|tai khoan khac|user\\s*\\d+|user\\s*id|other user")) {
            return new Query("UNSUPPORTED", request.month(), null, false);
        }
        text = text.replaceAll("\\bchi (tiu|tieeu)\\b", "chi tieu")
                .replaceAll("\\bbao nhiu\\b", "bao nhieu")
                .replaceAll("\\bthg(?=\\s*(nay|truoc|trc|\\d))", "thang")
                .replaceAll("\\bthang trc\\b", "thang truoc")
                .replaceAll("\\bngan sac\\b", "ngan sach")
                .replaceAll("\\bdan muc\\b", "danh muc")
                .replaceAll("\\bso san\\b", "so sanh");
        if (has(text, "\\b(chi|thu|tien|thang|han muc|vuot|con)\\b|t\\d")) {
            text = text.replaceAll("\\bns\\b", "ngan sach").replaceAll("\\btn\\b", "thu nhap");
        }
        if (has(text, "\\b(chi|thu|tien)\\b|danh muc|category")) {
            text = text.replaceAll("\\bdm\\b", "danh muc").replaceAll("\\bss\\b", "so sanh");
        }
        boolean financial = has(text, "\\b(chi|thu|tien|budget|income|expense|balance)\\b|ngan sach|danh muc|tiet kiem|tai chinh");
        boolean category = has(text, "danh muc|\\b(category|categories)\\b");
        boolean comparison = has(text, "so sanh|so voi|nhieu hon|it hon|chenh lech|\\b(vs|compare|comparison)\\b");
        boolean trend = has(text, "xu huong|thay doi|\\b(tang|giam|trend|change)\\b");
        boolean advice = has(text, "tu van|loi khuyen|goi y|lam sao|nen |cach .*tiet kiem|tiet kiem.*(the nao|ra sao)|ke hoach|quan ly chi tieu|\\badvice\\b");
        String intent = category && (comparison || trend) ? "CATEGORY_TREND"
                : comparison && (financial || has(text, "so sanh|compare")) ? "COMPARISON"
                : has(text, "ngan sach|han muc|budget|vuot") ? "BUDGET"
                : category || has(text, "chi.*(nhieu nhat|cao nhat)") ? "CATEGORIES"
                : advice && financial ? "ADVICE"
                : has(text, "chi tieu|tong chi|chi.*bao nhieu|chi.*thang|thu nhap|tong thu|thu chi|so du|\\b(tien|income|expense|balance)\\b") ? "SUMMARY" : "UNKNOWN";

        YearMonth now = YearMonth.now(clock);
        text = text.replaceAll("thang\\s*(\\d{1,2})\\s+nam\\s+(\\d{4})", "thang $1/$2");
        var numericTimes = Pattern.compile("\\b(?:thang\\s*|t(?=\\d))(\\d+)(?:\\s*/\\s*(\\d+))?").matcher(text);
        while (numericTimes.find()) {
            if (numericTimes.group(1).length() > 2
                    || (numericTimes.group(2) != null && numericTimes.group(2).length() != 4)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tháng trong câu hỏi phải là tháng N hoặc N/YYYY");
            }
        }
        List<YearMonth> periods = new ArrayList<>();
        var matcher = MONTHS.matcher(text);
        while (matcher.find()) {
            YearMonth period;
            if (matcher.group(4) != null) {
                period = period(Integer.parseInt(matcher.group(5)), Integer.parseInt(matcher.group(4)));
            } else if (matcher.group(2) != null) {
                period = period(Integer.parseInt(matcher.group(2)), Integer.parseInt(matcher.group(3)));
            } else {
                String token = matcher.group(1).replaceAll("\\s", "");
                period = switch (token) {
                    case "nay" -> now;
                    case "truoc" -> now.minusMonths(1);
                    default -> {
                        String[] parts = token.split("/");
                        yield period(parts.length == 2 ? Integer.parseInt(parts[1]) : now.getYear(), Integer.parseInt(parts[0]));
                    }
                };
            }
            validate(period);
            if (!periods.contains(period)) periods.add(period);
        }
        // "So sánh với tháng trước" ngầm nói kỳ hiện tại, không phải tháng trước-với-tháng trước nữa.
        if (comparison && periods.size() == 1 && has(text, "(voi|hon) thang truoc")) {
            validate(now);
            if (!periods.contains(now)) periods.add(now);
        }
        boolean annual = has(text, "nam nay|ca nam|hang nam|nam \\d{4}") && periods.isEmpty();
        if (annual) return new Query("UNKNOWN", request.month(), null, true);
        if (periods.size() > 2 || (periods.size() == 2 && !comparison && !trend)) {
            return new Query("UNKNOWN", request.month(), null, false);
        }
        boolean followup = has(text, "^(con |the |vay |va )");
        if (intent.equals("UNKNOWN") && followup && request.context() != null) intent = request.context().intent();
        String selected = followup && request.context() != null ? request.context().month() : request.month();
        String month = periods.isEmpty() ? selected : periods.getFirst().toString();
        String base = request.compareMonth();
        if (base == null && followup && request.context() != null) base = request.context().compareMonth();
        if (periods.size() == 2) {
            intent = category ? "CATEGORY_TREND" : "COMPARISON";
            month = periods.stream().max(YearMonth::compareTo).orElseThrow().toString();
            base = periods.stream().min(YearMonth::compareTo).orElseThrow().toString();
        }
        if (intent.equals("COMPARISON") || intent.equals("CATEGORY_TREND")) {
            if (!periods.isEmpty() && month.equals(base)) base = null;
            if (base == null) base = YearMonth.parse(month).minusMonths(1).toString();
            validate(YearMonth.parse(base));
            if (base.equals(month)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hai kỳ so sánh phải khác nhau");
        }
        return new Query(intent, month, base, false);
    }

    private static boolean has(String text, String expression) { return Pattern.compile(expression).matcher(text).find(); }
    private static YearMonth period(int year, int month) {
        if (month < 1 || month > 12) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tháng phải trong khoảng 1-12");
        YearMonth result = YearMonth.of(year, month); validate(result); return result;
    }
    private static void validate(YearMonth period) {
        if (period.getYear() < 1900 || period.getYear() > 2100) throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Tháng hoặc tháng trước: năm phải nằm trong khoảng 1900-2100");
    }
}
