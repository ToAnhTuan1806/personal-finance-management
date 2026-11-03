package com.smartexpense.backend.dto.category;

import java.util.Locale;
import java.util.regex.Pattern;

// Quy tắc metadata dùng chung cho validation và fallback DTO; không suy icon/màu từ tên danh mục.
public final class CategoryAppearance {
    public static final String DEFAULT_ICON = "tag";
    public static final String DEFAULT_COLOR = "#64748B";
    public static final String ICON_PATTERN = "tag|utensils|shopping-bag|car|home|heart|graduation-cap|gamepad-2|"
            + "briefcase|gift|wallet|circle|shirt|sparkles|users|zap|phone|hand-coins|trending-up|clock";
    public static final String COLOR_PATTERN = "#[0-9A-Fa-f]{6}";
    private static final Pattern ICON = Pattern.compile(ICON_PATTERN);
    private static final Pattern COLOR = Pattern.compile(COLOR_PATTERN);

    private CategoryAppearance() {
    }

    // Danh mục cũ thiếu hoặc chứa metadata không an toàn chỉ fallback khi trả DTO, không ghi ngược DB.
    public static String iconOrDefault(String value) {
        return value != null && ICON.matcher(value).matches() ? value : DEFAULT_ICON;
    }

    public static String colorOrDefault(String value) {
        return value != null && COLOR.matcher(value).matches() ? value.toUpperCase(Locale.ROOT) : DEFAULT_COLOR;
    }
}
