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

    // Lấy danh sách giao dịch, lọc theo tháng hoặc khoảng ngày
    @Transactional(readOnly = true)
    public Page<TransactionResponse> getAll(
            Long userId,
            TransactionType type,
            Long categoryId,
            String month,
            LocalDate startDate,
            LocalDate endDate,
            String keyword,
            int page,
            int size) {

        // Kiểm tra thông số phân trang
        if (page < 0 || size < 1 || size > 100) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "page hoặc size không hợp lệ"
            );
        }

        boolean hasMonth = month != null && !month.isBlank();
        boolean hasStartDate = startDate != null;
        boolean hasEndDate = endDate != null;
        boolean hasDateRange = hasStartDate || hasEndDate;

        // Không cho lọc theo tháng và khoảng ngày cùng lúc
        if (hasMonth && hasDateRange) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Chỉ được lọc theo tháng hoặc khoảng ngày"
            );
        }

        // Khoảng ngày phải có đủ ngày bắt đầu và kết thúc
        if (hasDateRange && (!hasStartDate || !hasEndDate)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Vui lòng cung cấp đủ startDate và endDate"
            );
        }

        LocalDate fromDate = null;
        LocalDate toDateExclusive = null;

        if (hasDateRange) {
            // Kiểm tra ngày bắt đầu <= ngày kết thúc
            if (startDate.isAfter(endDate)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu"
                );
            }

            // Tránh tràn ngày khi cộng thêm 1
            if (endDate.equals(LocalDate.MAX)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Ngày kết thúc vượt giới hạn cho phép"
                );
            }

            fromDate = startDate;

            // Repository dùng điều kiện transactionDate < endDate
            // nên cộng 1 ngày để bao gồm ngày kết thúc đã chọn
            toDateExclusive = endDate.plusDays(1);

        } else if (hasMonth) {
            try {
                YearMonth yearMonth = YearMonth.parse(month);

                fromDate = yearMonth.atDay(1);
                toDateExclusive = yearMonth
                        .plusMonths(1)
                        .atDay(1);

            } catch (DateTimeParseException ex) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Tháng phải có định dạng YYYY-MM"
                );
            }
        }

        // Chuẩn hóa từ khóa tìm kiếm
        String searchKeyword =
                (keyword == null || keyword.isBlank())
                        ? null
                        : keyword.trim();

        // Sắp xếp mới nhất trước
        Pageable pageable = PageRequest.of(
                page,
                size,
                Sort.by(
                        Sort.Order.desc("transactionDate"),
                        Sort.Order.desc("id")
                )
        );

        // Giữ nguyên Repository tìm kiếm của dự án
        return transactionRepository.searchTransactions(
                userId,
                type,
                categoryId,
                fromDate,
                toDateExclusive,
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
