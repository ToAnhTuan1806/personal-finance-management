export function localToday() {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-')
}

export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// Chỉ kiểm tra ngày tồn tại; không tự giới hạn ngày quá khứ/tương lai.
export function validateTransactionForm(form, categories) {
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
  if (!isValidDate(form.transactionDate)) errors.transactionDate = 'Vui lòng chọn ngày giao dịch hợp lệ.'
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
