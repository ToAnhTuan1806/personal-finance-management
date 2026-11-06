/**
 * recurringTemplateUtils.js
 * Tiện ích và hàm validation cho Mẫu giao dịch định kỳ (Recurring Templates)
 * Hỗ trợ SmartExpense 2.0 - D08-FE (FR-08, FR-11)
 */

export const DISCLAIMER_NOTICE =
  'Đây chỉ là mẫu giao dịch định kỳ. Hệ thống chưa tự động ghi nhận thu hoặc chi.'

export const DAY_31_NOTICE =
  'Nếu tháng không có ngày 31, hệ thống sẽ dùng ngày cuối tháng.'

/**
 * Định dạng số tiền sang định dạng tiền tệ Việt Nam (VNĐ)
 * @param {number|string} val
 * @returns {string}
 */
export function formatMoney(val) {
  const num = Number(val)
  if (isNaN(num)) return '0 ₫'
  return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + ' ₫'
}

/**
 * Định dạng ngày lặp trong tháng
 * @param {number|string} day
 * @returns {string}
 */
export function formatDayOfMonth(day) {
  const d = Number(day)
  if (!d || isNaN(d)) return ''
  return `Ngày ${d} hằng tháng`
}

/**
 * Kiểm tra xem ngày lặp có phải là ngày 31 hay không
 * @param {number|string} day
 * @returns {boolean}
 */
export function isDay31(day) {
  return Number(day) === 31
}

/**
 * Tính ngày giao dịch thực tế trong tháng: Nếu dayOfMonth > số ngày của tháng thì dùng ngày cuối tháng
 * @param {number|string} dayOfMonth
 * @param {number} year
 * @param {number} month
 * @returns {string} định dạng DD/MM/YYYY
 */
export function resolveTransactionDate(dayOfMonth, year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(Number(dayOfMonth), lastDay)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/**
 * Kiểm tra xem ngày có vượt quá số ngày của tháng (bị ép về ngày cuối tháng) hay không
 * @param {number|string} dayOfMonth
 * @param {number} year
 * @param {number} month
 * @returns {boolean}
 */
export function isDayClampedToMonthEnd(dayOfMonth, year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  return Number(dayOfMonth) > lastDay
}

/**
 * Định dạng ngày ISO (YYYY-MM-DD) hoặc chuỗi ngày sang định dạng hiển thị DD/MM/YYYY
 * @param {string} dateStr
 * @param {number|string} [fallbackDay]
 * @param {number} [fallbackYear]
 * @param {number} [fallbackMonth]
 * @returns {string}
 */
export function formatDisplayDate(dateStr, fallbackDay, fallbackYear, fallbackMonth) {
  if (typeof dateStr === 'string' && dateStr.trim()) {
    const trimmed = dateStr.trim()
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (isoMatch) {
      const [, y, m, d] = isoMatch
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      const parts = trimmed.split('/')
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`
    }
    return trimmed
  }
  if (fallbackDay && fallbackYear && fallbackMonth) {
    return resolveTransactionDate(fallbackDay, fallbackYear, fallbackMonth)
  }
  return ''
}

/**
 * Validate dữ liệu form mẫu giao dịch định kỳ
 * @param {Object} form - { type, categoryId, amount, dayOfMonth, note, active }
 * @param {Array} categories - Danh sách categories hiện có
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateRecurringTemplateForm(form = {}, categories = []) {
  const errors = {}

  // 1. Loại giao dịch
  if (!form.type || (form.type !== 'EXPENSE' && form.type !== 'INCOME')) {
    errors.type = 'Vui lòng chọn loại giao dịch (Chi tiêu hoặc Thu nhập).'
  }

  // 2. Danh mục
  if (form.categoryId === '' || form.categoryId === null || form.categoryId === undefined) {
    errors.categoryId = 'Vui lòng chọn danh mục.'
  } else if (Array.isArray(categories) && categories.length > 0) {
    const selected = categories.find((c) => String(c.id) === String(form.categoryId))
    if (!selected) {
      errors.categoryId = 'Danh mục không hợp lệ.'
    } else if (form.type && selected.type !== form.type) {
      errors.categoryId = 'Danh mục không thuộc loại giao dịch đã chọn.'
    }
  }

  // 3. Số tiền (lớn hơn 0, tối đa 13 chữ số nguyên, 2 số thập phân)
  const rawAmount = String(form.amount ?? '').trim().replace(',', '.')
  if (!rawAmount) {
    errors.amount = 'Vui lòng nhập số tiền.'
  } else if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    errors.amount = 'Số tiền không đúng định dạng.'
  } else {
    const num = Number(rawAmount)
    if (isNaN(num) || num <= 0) {
      errors.amount = 'Số tiền phải lớn hơn 0.'
    } else {
      const [intPart = '', decPart] = rawAmount.split('.')
      if (intPart.length > 13) {
        errors.amount = 'Số tiền quá lớn (tối đa 13 chữ số nguyên).'
      } else if (decPart && decPart.length > 2) {
        errors.amount = 'Số tiền chỉ nhận tối đa 2 chữ số thập phân.'
      }
    }
  }

  // 4. Ngày trong tháng (1 - 31)
  const rawDay = String(form.dayOfMonth ?? '').trim()
  if (!rawDay) {
    errors.dayOfMonth = 'Vui lòng nhập ngày trong tháng (1 - 31).'
  } else if (!/^\d+$/.test(rawDay)) {
    errors.dayOfMonth = 'Ngày trong tháng phải là số nguyên từ 1 đến 31.'
  } else {
    const day = Number(rawDay)
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      errors.dayOfMonth = 'Ngày trong tháng phải nằm trong khoảng 1 đến 31.'
    }
  }

  // 5. Ghi chú (tùy chọn, tối đa 500 ký tự)
  if (form.note && typeof form.note === 'string' && form.note.length > 500) {
    errors.note = 'Ghi chú tối đa 500 ký tự.'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

