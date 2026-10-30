package com.smartexpense.backend.dto.category;

import com.smartexpense.backend.enums.TransactionType;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;
import lombok.AccessLevel;
import lombok.Data;
import lombok.Getter;
import lombok.Setter;

@Data
public class CategoryRequest {

    @NotBlank(message = "Tên danh mục không được để trống")
    @Size(max = 100)
    private String name;

    @NotNull(message = "Loại danh mục không được để trống")
    private TransactionType type;

    @Size(max = 40)
    @Pattern(regexp = CategoryAppearance.ICON_PATTERN, message = "Icon không nằm trong danh sách hỗ trợ")
    private String icon;

    @Pattern(regexp = CategoryAppearance.COLOR_PATTERN, message = "Màu phải có định dạng #RRGGBB")
    private String color;

    @JsonIgnore
    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    private boolean iconProvided;

    @JsonIgnore
    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    private boolean colorProvided;

    // Jackson chỉ gọi setter khi field có mặt, kể cả null; client cũ thiếu field không bị reset metadata.
    @JsonSetter("icon")
    public void setIcon(String icon) {
        this.icon = icon;
        this.iconProvided = true;
    }

    @JsonSetter("color")
    public void setColor(String color) {
        this.color = color;
        this.colorProvided = true;
    }

    @JsonIgnore
    public boolean hasIcon() {
        return iconProvided;
    }

    @JsonIgnore
    public boolean hasColor() {
        return colorProvided;
    }
}
