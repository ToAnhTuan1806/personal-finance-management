package com.smartexpense.backend;

import com.smartexpense.backend.dto.category.CategoryAppearance;
import com.smartexpense.backend.dto.category.CategoryRequest;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import com.smartexpense.backend.service.CategoryService;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import tools.jackson.databind.json.JsonMapper;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CategoryAppearanceTests {

    private final JsonMapper json = JsonMapper.builder().build();

    // Dùng đúng Jackson để kiểm tra thiếu/null, không suy trạng thái từ riêng giá trị String.
    @Test
    void distinguishesMissingNullAndPreventsClientFromForgingPresenceFlags() throws Exception {
        CategoryRequest old = json.readValue("""
                {"name":"Old client","type":"EXPENSE","iconProvided":true,"colorProvided":true}
                """, CategoryRequest.class);
        assertThat(old.hasIcon()).isFalse();
        assertThat(old.hasColor()).isFalse();

        CategoryRequest reset = json.readValue("""
                {"name":"Reset","type":"EXPENSE","icon":null,"color":null}
                """, CategoryRequest.class);
        assertThat(reset.hasIcon()).isTrue();
        assertThat(reset.hasColor()).isTrue();
        assertThat(reset.getIcon()).isNull();
        assertThat(reset.getColor()).isNull();

        CategoryRequest supplied = json.readValue("""
                {"name":"Valid","type":"INCOME","icon":"gift","color":"#abc123",
                 "iconProvided":false,"colorProvided":false}
                """, CategoryRequest.class);
        assertThat(supplied.hasIcon()).isTrue();
        assertThat(supplied.hasColor()).isTrue();
        assertThat(json.readTree(json.writeValueAsString(supplied)).has("iconProvided")).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"utensils,#abc123", "wallet,#22C55E", "hand-coins,#10B981", "gift,#84CC16"})
    void supportsSafeKeysAndNormalizesColor(String icon, String color) {
        CategoryRequest request = new CategoryRequest();
        request.setName("Test");
        request.setType(TransactionType.EXPENSE);
        request.setIcon(icon);
        request.setColor(color);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(request)).isEmpty();
        }
        assertThat(CategoryAppearance.iconOrDefault(icon)).isEqualTo(icon);
        assertThat(CategoryAppearance.colorOrDefault(color)).isEqualTo(color.toUpperCase(java.util.Locale.ROOT));
    }

    @Test
    void legacyFallbackDoesNotMutateOrSaveCategory() {
        CategoryRepository categories = mock(CategoryRepository.class);
        CategoryService service = new CategoryService(categories, mock(TransactionRepository.class), mock(UserRepository.class));
        Category category = new Category();
        category.setId(1L);
        category.setName("Tên đã đổi");
        category.setType(TransactionType.EXPENSE);
        category.setIcon("<svg>");
        category.setColor("red");
        when(categories.findByIdAndUserId(1L, 2L)).thenReturn(Optional.of(category));
        var result = service.getById(1L, 2L);
        assertThat(result.getIcon()).isEqualTo("tag");
        assertThat(result.getColor()).isEqualTo("#64748B");
        assertThat(category.getIcon()).isEqualTo("<svg>");
        assertThat(category.getColor()).isEqualTo("red");
        verify(categories, never()).save(any());
    }
}
