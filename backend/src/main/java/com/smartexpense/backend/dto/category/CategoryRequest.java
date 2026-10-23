package com.smartexpense.backend.dto.category;

import com.smartexpense.backend.enums.TransactionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CategoryRequest {

    @NotBlank(message = "Tên danh mục không được để trống")
    @Size(max = 100)
    private String name;

    @NotNull(message = "Loại danh mục không được để trống")
    private TransactionType type;
}
