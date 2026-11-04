const vietnamDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function localToday(now = new Date()) {
  const parts = Object.fromEntries(vietnamDate.formatToParts(now).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const FUTURE_DATE_ERROR = 'Ngày giao dịch không được lớn hơn ngày hiện tại.'
export const OLD_DATE_WARNING = 'Ngày giao dịch cách hiện tại hơn 5 năm. Vui lòng kiểm tra lại.'

export function transactionDateError(value, today = localToday()) {
  if (!isValidDate(value)) return 'Vui lòng chọn ngày giao dịch hợp lệ.'
  return value > today ? FUTURE_DATE_ERROR : ''
}

export function transactionDateWarning(value, today = localToday()) {
  if (!isValidDate(value)) return ''
  const [year, month, day] = today.split('-').map(Number)
  // Ngưỡng theo năm lịch; 29/2 lùi 5 năm lấy mốc 28/2 nếu năm đích không nhuận.
  const cutoffYear = year - 5
  const leap = cutoffYear % 4 === 0 && (cutoffYear % 100 !== 0 || cutoffYear % 400 === 0)
  const cutoffDay = month === 2 && day === 29 && !leap ? 28 : day
  const cutoff = `${String(cutoffYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(cutoffDay).padStart(2, '0')}`
  return value < cutoff ? OLD_DATE_WARNING : ''
}

export function validateTransactionForm(form, categories, today = localToday()) {
  const errors = {}
  if (!['INCOME', 'EXPENSE'].includes(form.type)) errors.type = 'Vui lòng chọn Thu hoặc Chi.'
  if (!form.categoryId) errors.categoryId = 'Vui lòng chọn danh mục.'
  else if (!categories.some((c) => String(c.id) === String(form.categoryId) && c.type === form.type)) {
    errors.categoryId = 'Danh mục không phù hợp với loại giao dịch.'
  }
  const amount = String(form.amount ?? '').trim()
  if (!amount) errors.amount = 'Vui lòng nhập số tiền.'
  else if (!/^\d{1,13}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    errors.amount = 'Số tiền từ 0,01 đến 9.999.999.999.999,99; tối đa 2 số thập phân.'
  }
  const dateError = transactionDateError(form.transactionDate, today)
  if (dateError) errors.transactionDate = dateError
  if (typeof form.note !== 'string' || form.note.length > 500) errors.note = 'Ghi chú tối đa 500 ký tự.'
  return errors
}

export const transactionPayload = (form) => ({
  type: form.type, categoryId: Number(form.categoryId), amount: Number(form.amount),
  transactionDate: form.transactionDate, note: form.note.trim(),
})

// Khóa ngay trong cùng lượt sự kiện, trước khi React kịp render trạng thái disabled.
export function createSubmitGuard() {
  let pending = null
  return {
    isPending: () => Boolean(pending),
    run(task) {
      if (pending) return pending
      pending = Promise.resolve().then(task).finally(() => { pending = null })
      return pending
    },
  }
}
