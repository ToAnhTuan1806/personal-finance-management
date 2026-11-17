package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.ai.AiChatRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
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
    private static final Pattern MONEY = Pattern.compile(
            "(?<![\\p{L}\\p{N}.,/+-])(\\d+(?:[.,]\\d+)*)"
                    + "(?:\\s*(trieu|tr|nghin|ngin|ngan|k|vnd|dong|d))?(?![\\p{L}\\p{N}]|[.,/]\\d)");
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("9999999999999.99");
    private record CategoryKeywords(Pattern words, List<String> names) { }
    private static final List<CategoryKeywords> EXPENSE_CATEGORIES = List.of(
            category("ao|quan|vay|dam|giay|dep|thoi trang", "quan ao", "thoi trang", "mua sam"),
            category("xang|grab|taxi|xe buyt|di lai|gui xe", "di lai", "giao thong", "phuong tien", "xang xe"),
            category("dien(?! thoai| tu)|dien luc", "tien dien", "dien", "hoa don", "tien ich"),
            category("tien nuoc|hoa don nuoc", "tien nuoc", "nuoc", "hoa don", "tien ich"),
            category("cafe|ca phe|coffee", "cafe", "ca phe", "do uong", "an uong"),
            category("an|uong|com|bun|pho|tra sua|thuc pham", "an uong", "thuc pham", "do uong"),
            category("nuoc", "tien nuoc", "nuoc", "hoa don", "tien ich"),
            category("tien nha|thue nha", "tien nha", "nha o"),
            category("mua|mua sam|sieu thi", "mua sam", "chi tieu hang ngay"));
    private final Clock clock;
    @Autowired
    public AiQueryInterpreter() { this(Clock.system(ZoneId.of("Asia/Ho_Chi_Minh"))); }
    public AiQueryInterpreter(Clock clock) { this.clock = clock; }

    public record Expense(BigDecimal amount, String categoryKeyword, String note) {
        @Override public String toString() { return "Expense[redacted]"; }
    }
    public record Query(String intent, String month, String compareMonth, boolean annual, Expense expense) {
        public Query(String intent, String month, String compareMonth, boolean annual) {
            this(intent, month, compareMonth, annual, null);
        }
    }

    private static CategoryKeywords category(String expression, String... names) {
        return new CategoryKeywords(Pattern.compile("\\b(?:" + expression + ")\\b"), List.of(names));
    }

    static List<String> categoryNames(String keyword) {
        return EXPENSE_CATEGORIES.stream().map(CategoryKeywords::names)
                .filter(names -> names.getFirst().equals(keyword)).findFirst().orElse(List.of());
    }

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

        if (!financial && !category && !comparison && !trend && !advice
                && !has(text, "\\d|so du|han muc|\\b(luong|dong|vnd)\\b")
                && has(text, "\\b(hello|helo|heelo|hey|hi|chao|xin chao|alo)\\b|^(e|bot oi|tro ly oi)[!.? ]*$")) {
            return new Query("GREETING", request.month(), null, false);
        }
        // Chỉ tạo bản nháp; câu hỏi tra cứu/thu nhập và lệnh bị từ chối vẫn giữ luồng cũ.
        if ((intent.equals("UNKNOWN") || intent.equals("SUMMARY"))
                && !has(text, "[?]|bao nhieu|bao nhiu|tong |so du|thong ke|bao cao|lich su|giao dich"
                + "|nam nay|ca nam|hang nam|tiet kiem|\\b(thu|nhan|luong|thuong|income|salary|balance)\\b|hoan tien")) {
            Expense expense = expense(text, request.message());
            if (expense != null) return new Query("CREATE_EXPENSE", request.month(), null, false, expense);
        }

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

    private static Expense expense(String text, String note) {
        // Không nhầm năm/tháng/ngày thành số tiền nguyên không có đơn vị.
        String amounts = text.replaceAll("\\b\\d{1,2}/\\d{1,2}/\\d{4}\\b", " ");
        amounts = MONTHS.matcher(amounts).replaceAll(" ").replaceAll("\\bnam \\d{4}\\b", " ");
        var matcher = MONEY.matcher(amounts);
        BigDecimal amount = null;
        while (matcher.find()) {
            String number = matcher.group(1);
            String unit = matcher.group(2);
            if (number.matches("\\d{1,3}(?:[.]\\d{3})+|\\d{1,3}(?:,\\d{3})+")) {
                number = number.replace(".", "").replace(",", "");
            } else if (number.matches("\\d+(?:[.,]\\d+)?")) {
                number = number.replace(',', '.');
            } else return null;
            BigDecimal value = new BigDecimal(number);
            if (unit == null && value.compareTo(BigDecimal.valueOf(1000)) < 0) continue;
            if (unit != null) value = value.multiply(switch (unit) {
                case "k", "nghin", "ngin", "ngan" -> BigDecimal.valueOf(1000);
                case "tr", "trieu" -> BigDecimal.valueOf(1000000);
                default -> BigDecimal.ONE;
            });
            // Cùng miền dữ liệu với TransactionRequest; nhiều số tiền cần người dùng làm rõ.
            if (amount != null || value.signum() <= 0 || value.compareTo(MAX_AMOUNT) > 0
                    || value.stripTrailingZeros().scale() > 2) return null;
            amount = value;
        }
        if (amount == null) return null;
        String keyword = EXPENSE_CATEGORIES.stream().filter(item -> item.words().matcher(text).find())
                .map(item -> item.names().getFirst()).findFirst().orElse(null);
        return new Expense(amount, keyword, note);
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
