package com.smartexpense.backend.service;

import com.smartexpense.backend.dto.transaction.*;
import com.smartexpense.backend.entity.*;
import com.smartexpense.backend.enums.TransactionType;
import com.smartexpense.backend.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;

@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;

    // Lấy danh sách có lọc và phân trang
    @Transactional(readOnly = true)
    public Page<TransactionResponse> getAll(
            Long userId,
            TransactionType type,
            Long categoryId,
            String month,
            String keyword,
            int page,
            int size) {
        // Giới hạn kích thước trang để tránh truy vấn quá lớn
        if (page < 0 || size < 1 || size > 100) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "page hoặc size không hợp lệ"
            );
        }

        LocalDate startDate = null;
        LocalDate endDate = null;

        // Chuyển YYYY-MM thành khoảng ngày của tháng
        if (month != null && !month.isBlank()) {
            try {
                YearMonth yearMonth = YearMonth.parse(month);
                startDate = yearMonth.atDay(1);
                endDate = yearMonth.plusMonths(1).atDay(1);
            } catch (DateTimeParseException ex) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Tháng phải có định dạng YYYY-MM"
                );
            }
        }

        String searchKeyword = (keyword == null || keyword.isBlank()) ? null : keyword.trim();

        Pageable pageable = PageRequest.of(
                page,
                size,
                Sort.by(
                        Sort.Order.desc("transactionDate"),
                        Sort.Order.desc("id")
                )
        );

        return transactionRepository.searchTransactions(
                userId,
                type,
                categoryId,
                startDate,
                endDate,
                searchKeyword,
                pageable
        ).map(this::toResponse);
    }

    // Xem chi tiết giao dịch
    @Transactional(readOnly = true)
    public TransactionResponse getById(Long id, Long userId) {
        return toResponse(findOwnedTransaction(id, userId));
    }

    // Tạo giao dịch mới
    @Transactional
    public TransactionResponse create(
            TransactionRequest request,
            Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Tài khoản không tồn tại"
                ));

        Category category = validateCategory(
                request.getCategoryId(),
                request.getType(),
                userId
        );

        Transaction transaction = new Transaction();
        transaction.setUser(user);
        transaction.setCategory(category);
        transaction.setType(request.getType());
        transaction.setAmount(request.getAmount());
        transaction.setTransactionDate(request.getTransactionDate());
        transaction.setNote(request.getNote());

        return toResponse(transactionRepository.save(transaction));
    }

    // Cập nhật giao dịch thuộc tài khoản hiện tại
    @Transactional
    public TransactionResponse update(
            Long id,
            TransactionRequest request,
            Long userId) {
        Transaction transaction = findOwnedTransaction(id, userId);

        Category category = validateCategory(
                request.getCategoryId(),
                request.getType(),
                userId
        );

        transaction.setCategory(category);
        transaction.setType(request.getType());
        transaction.setAmount(request.getAmount());
        transaction.setTransactionDate(request.getTransactionDate());
        transaction.setNote(request.getNote());

        return toResponse(transactionRepository.save(transaction));
    }

    // Xóa giao dịch
    @Transactional
    public void delete(Long id, Long userId) {
        Transaction transaction = findOwnedTransaction(id, userId);
        transactionRepository.delete(transaction);
    }

    // Kiểm tra giao dịch thuộc người dùng hiện tại
    private Transaction findOwnedTransaction(Long id, Long userId) {
        return transactionRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Không tìm thấy giao dịch"
                ));
    }

    // Kiểm tra danh mục hợp lệ và đúng chủ sở hữu
    private Category validateCategory(
            Long categoryId,
            TransactionType type,
            Long userId) {
        Category category = categoryRepository
                .findByIdAndUserId(categoryId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Danh mục không tồn tại hoặc không hợp lệ"
                ));

        if (category.getType() != type) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Loại giao dịch không khớp loại danh mục"
            );
        }

        return category;
    }

    // Chuyển Entity sang DTO trả về Frontend
    private TransactionResponse toResponse(Transaction transaction) {
        return new TransactionResponse(
                transaction.getId(),
                transaction.getCategory().getId(),
                transaction.getCategory().getName(),
                transaction.getType(),
                transaction.getAmount(),
                transaction.getTransactionDate(),
                transaction.getNote()
        );
    }
}
