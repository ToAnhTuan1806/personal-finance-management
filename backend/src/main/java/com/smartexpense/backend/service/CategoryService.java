package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.category.CategoryRequest;
import com.smartexpense.backend.dto.category.CategoryResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.User;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.TransactionRepository;
import com.smartexpense.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private static final List<String> DEFAULT_EXPENSE_NAMES = List.of(
            "Ăn uống", "Chi tiêu hằng ngày", "Quần áo", "Mỹ phẩm", "Phí giao lưu", "Y tế",
            "Giáo dục", "Tiền điện", "Đi lại", "Phí liên lạc", "Tiền nhà");
    private static final List<String> DEFAULT_INCOME_NAMES = List.of(
            "Tiền lương", "Tiền phụ cấp", "Tiền thưởng", "Thu nhập phụ", "Đầu tư", "Thu nhập tạm thời");

    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;

    // Chỉ gọi một lần khi đăng ký user mới; bắt buộc tham gia transaction của luồng đăng ký.
    @Transactional(propagation = Propagation.MANDATORY)
    public void createDefaultCategories(User newUser) {
        List<Category> defaults = Stream.concat(
                DEFAULT_EXPENSE_NAMES.stream().map(name -> defaultCategory(newUser, name, TransactionType.EXPENSE)),
                DEFAULT_INCOME_NAMES.stream().map(name -> defaultCategory(newUser, name, TransactionType.INCOME))
        ).toList();
        categoryRepository.saveAll(defaults);
    }

    private Category defaultCategory(User owner, String name, TransactionType type) {
        Category category = new Category();
        category.setUser(owner);
        category.setName(name);
        category.setType(type);
        return category;
    }

    // Lấy danh sách danh mục, có thể lọc theo loại
    @Transactional(readOnly = true)
    public List<CategoryResponse> getAll(Long userId, TransactionType type) {
        List<Category> categories;
        if (type == null) {
            categories = categoryRepository.findByUserId(userId);
        } else {
            categories = categoryRepository.findByUserIdAndType(userId, type);
        }
        return categories.stream()
                .map(this::toResponse)
                .toList();
    }

    // Xem chi tiết danh mục của người dùng
    @Transactional(readOnly = true)
    public CategoryResponse getById(Long id, Long userId) {
        Category category = findOwnedCategory(id, userId);
        return toResponse(category);
    }

    // Tạo danh mục mới
    @Transactional
    public CategoryResponse create(CategoryRequest request, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Tài khoản không tồn tại"
                ));

        Category category = new Category();
        category.setName(request.getName().trim());
        category.setType(request.getType());
        category.setUser(user);

        Category saved = categoryRepository.save(category);
        return toResponse(saved);
    }

    // Cập nhật danh mục
    @Transactional
    public CategoryResponse update(Long id, CategoryRequest request, Long userId) {
        Category category = findOwnedCategory(id, userId);

        // Không đổi loại khi danh mục đang có giao dịch
        if (category.getType() != request.getType() && transactionRepository.existsByCategoryId(id)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Không thể đổi loại danh mục đã có giao dịch"
            );
        }

        category.setName(request.getName().trim());
        category.setType(request.getType());

        return toResponse(categoryRepository.save(category));
    }

    // Xóa danh mục nếu chưa có giao dịch
    @Transactional
    public void delete(Long id, Long userId) {
        Category category = findOwnedCategory(id, userId);

        if (transactionRepository.existsByCategoryId(id)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Danh mục đã có giao dịch, không thể xóa"
            );
        }

        categoryRepository.delete(category);
    }

    // Chỉ tìm danh mục thuộc người dùng hiện tại
    private Category findOwnedCategory(Long id, Long userId) {
        return categoryRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Không tìm thấy danh mục"
                ));
    }

    // Chuyển Entity sang DTO trả về Frontend
    private CategoryResponse toResponse(Category category) {
        return new CategoryResponse(
                category.getId(),
                category.getName(),
                category.getType()
        );
    }
}
