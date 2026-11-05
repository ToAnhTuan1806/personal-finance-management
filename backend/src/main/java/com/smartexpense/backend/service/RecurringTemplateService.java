package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.recurring.RecurringTemplateRequest;
import com.smartexpense.backend.dto.recurring.RecurringTemplateResponse;
import com.smartexpense.backend.entity.Category;
import com.smartexpense.backend.entity.RecurringTemplate;
import com.smartexpense.backend.repository.CategoryRepository;
import com.smartexpense.backend.repository.RecurringTemplateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class RecurringTemplateService {

    private final RecurringTemplateRepository templateRepository;
    private final CategoryRepository categoryRepository;

    @Transactional(readOnly = true)
    public Page<RecurringTemplateResponse> getAll(Long userId, Boolean active, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Trang phải không âm, kích thước từ 1-100 và offset không vượt giới hạn");
        }
        var pageable = PageRequest.of(page, size);
        // Derived query cố định ID DESC và EntityGraph tải Category cùng danh sách.
        Page<RecurringTemplate> templates = active == null
                ? templateRepository.findByUserIdOrderByIdDesc(userId, pageable)
                : templateRepository.findByUserIdAndActiveOrderByIdDesc(userId, active, pageable);
        return templates.map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public RecurringTemplateResponse getById(Long id, Long userId) {
        return toResponse(findOwnedTemplate(id, userId));
    }

    @Transactional
    public RecurringTemplateResponse create(RecurringTemplateRequest request, Long userId) {
        Category category = findMatchingCategory(request, userId);
        RecurringTemplate template = new RecurringTemplate();
        template.setUser(category.getUser());
        applyRequest(template, request, category);
        return toResponse(templateRepository.saveAndFlush(template));
    }

    @Transactional
    public RecurringTemplateResponse update(Long id, RecurringTemplateRequest request, Long userId) {
        RecurringTemplate template = findOwnedTemplate(id, userId);
        Category category = findMatchingCategory(request, userId);
        // Chỉ thay đổi sau khi cả template và category đã vượt kiểm tra owner/type.
        applyRequest(template, request, category);
        return toResponse(templateRepository.saveAndFlush(template));
    }

    @Transactional
    public void delete(Long id, Long userId) {
        RecurringTemplate template = findOwnedTemplate(id, userId);
        // TODO D09: kiểm tra lịch sử áp dụng và trả 409 TEMPLATE_IN_USE trước khi xóa.
        // D08 chưa có marker áp dụng nên chưa thể bảo vệ lịch sử theo cơ chế này.
        templateRepository.delete(template);
    }

    private RecurringTemplate findOwnedTemplate(Long id, Long userId) {
        if (id == null || id <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID phải là số nguyên dương");
        }
        return templateRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Không tìm thấy mẫu giao dịch định kỳ"));
    }

    private Category findMatchingCategory(RecurringTemplateRequest request, Long userId) {
        Category category = categoryRepository.findByIdAndUserId(request.getCategoryId(), userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy danh mục"));
        if (category.getType() != request.getType()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Loại giao dịch không khớp với danh mục");
        }
        return category;
    }

    private void applyRequest(RecurringTemplate template, RecurringTemplateRequest request, Category category) {
        template.setCategory(category);
        template.setType(request.getType());
        template.setAmount(request.getAmount());
        template.setDayOfMonth(request.getDayOfMonth());
        template.setNote(request.getNote() == null || request.getNote().isBlank() ? null : request.getNote());
        template.setActive(request.getActive());
    }

    private RecurringTemplateResponse toResponse(RecurringTemplate template) {
        return new RecurringTemplateResponse(template.getId(), template.getCategory().getId(),
                template.getCategory().getName(), template.getType(), template.getAmount(),
                template.getDayOfMonth(), template.getNote(), template.isActive());
    }
}
