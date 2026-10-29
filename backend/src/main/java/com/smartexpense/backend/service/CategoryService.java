package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.category.CategoryRequest;
import com.smartexpense.backend.dto.category.CategoryResponse;
import com.smartexpense.backend.dto.category.CategoryAppearance;
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

@Service
@RequiredArgsConstructor
public class CategoryService {

    private record DefaultCategory(String name, TransactionType type, String icon, String color) {
    }

    // Mapping chỉ dùng lúc đăng ký; metadata được lưu riêng nên đổi tên sau đó không làm mất icon/màu.
    private static final List<DefaultCategory> DEFAULT_CATEGORIES = List.of(
            new DefaultCategory("Ăn uống", TransactionType.EXPENSE, "utensils", "#F59E0B"),
            new DefaultCategory("Chi tiêu hằng ngày", TransactionType.EXPENSE, "shopping-bag", "#3B82F6"),
            new DefaultCategory("Quần áo", TransactionType.EXPENSE, "shirt", "#8B5CF6"),
            new DefaultCategory("Mỹ phẩm", TransactionType.EXPENSE, "sparkles", "#EC4899"),
            new DefaultCategory("Phí giao lưu", TransactionType.EXPENSE, "users", "#F97316"),
            new DefaultCategory("Y tế", TransactionType.EXPENSE, "heart", "#EF4444"),
            new DefaultCategory("Giáo dục", TransactionType.EXPENSE, "graduation-cap", "#6366F1"),
            new DefaultCategory("Tiền điện", TransactionType.EXPENSE, "zap", "#EAB308"),
            new DefaultCategory("Đi lại", TransactionType.EXPENSE, "car", "#06B6D4"),
            new DefaultCategory("Phí liên lạc", TransactionType.EXPENSE, "phone", "#14B8A6"),
            new DefaultCategory("Tiền nhà", TransactionType.EXPENSE, "home", "#A855F7"),
            new DefaultCategory("Tiền lương", TransactionType.INCOME, "wallet", "#22C55E"),
            new DefaultCategory("Tiền phụ cấp", TransactionType.INCOME, "hand-coins", "#10B981"),
            new DefaultCategory("Tiền thưởng", TransactionType.INCOME, "gift", "#84CC16"),
            new DefaultCategory("Thu nhập phụ", TransactionType.INCOME, "briefcase", "#0EA5E9"),
            new DefaultCategory("Đầu tư", TransactionType.INCOME, "trending-up", "#059669"),
            new DefaultCategory("Thu nhập tạm thời", TransactionType.INCOME, "clock", "#64748B"));

    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;

    // Chỉ gọi một lần khi đăng ký user mới; bắt buộc tham gia transaction của luồng đăng ký.
    @Transactional(propagation = Propagation.MANDATORY)
    public void createDefaultCategories(User newUser) {
        List<Category> defaults = DEFAULT_CATEGORIES.stream().map(item -> defaultCategory(newUser, item)).toList();
        categoryRepository.saveAll(defaults);
    }

    private Category defaultCategory(User owner, DefaultCategory item) {
        Category category = new Category();
        category.setUser(owner);
        category.setName(item.name());
        category.setType(item.type());
        category.setIcon(item.icon());
        category.setColor(item.color());
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
        category.setIcon(CategoryAppearance.iconOrDefault(request.getIcon()));
        category.setColor(CategoryAppearance.colorOrDefault(request.getColor()));

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

        // PUT thiếu field giữ giá trị DB; null được gửi rõ ràng sẽ reset về default trung lập.
        if (request.hasIcon()) category.setIcon(CategoryAppearance.iconOrDefault(request.getIcon()));
        if (request.hasColor()) category.setColor(CategoryAppearance.colorOrDefault(request.getColor()));

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
                category.getType(),
                CategoryAppearance.iconOrDefault(category.getIcon()),
                CategoryAppearance.colorOrDefault(category.getColor())
        );
    }
}
