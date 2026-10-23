import { useEffect, useState } from 'react'
import { X, ArrowDownRight, ArrowUpRight, Calendar, FileText, AlertCircle, Loader2 } from 'lucide-react'
import MoneyInput from './ui/MoneyInput'

function TransactionModalContent({
  transaction,
  categories,
  saving,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(() => (
    transaction
      ? {
          type: transaction.type,
          categoryId: String(transaction.categoryId),
          amount: String(transaction.amount),
          transactionDate: transaction.transactionDate,
          note: transaction.note ?? '',
        }
      : {
          type: 'EXPENSE',
          categoryId: '',
          amount: '',
          transactionDate: new Date().toLocaleDateString('en-CA'),
          note: '',
        }
  ))

  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !saving) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saving, onClose])

  const availableCategories = categories.filter(
    (category) => category.type === form.type
  )

  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'type' ? { categoryId: '' } : {}),
    }))

    setErrors((prev) => ({
      ...prev,
      [name]: '',
      ...(name === 'type' ? { categoryId: '' } : {}),
    }))
    setServerError('')
  }

  const handleTypeSelect = (selectedType) => {
    if (form.type === selectedType) return
    setForm((prev) => ({
      ...prev,
      type: selectedType,
      categoryId: '',
    }))
    setErrors((prev) => ({
      ...prev,
      type: '',
      categoryId: '',
    }))
    setServerError('')
  }

  // Kiểm tra dữ liệu trước khi gọi API
  const validate = () => {
    const result = {}
    const amountNum = Number(form.amount)

    if (!form.categoryId) {
      result.categoryId = 'Vui lòng chọn danh mục.'
    } else if (
      !availableCategories.some((c) => String(c.id) === String(form.categoryId))
    ) {
      result.categoryId = 'Danh mục không phù hợp.'
    }

    if (!form.amount || form.amount.trim() === '') {
      result.amount = 'Vui lòng nhập số tiền.'
    } else if (!Number.isFinite(amountNum) || amountNum <= 0) {
      result.amount = 'Số tiền phải lớn hơn 0.'
    } else if (!/^\d{1,13}(\.\d{1,2})?$/.test(form.amount.trim())) {
      result.amount = 'Số tiền tối đa 13 chữ số và 2 số thập phân.'
    }

    if (!form.transactionDate) {
      result.transactionDate = 'Vui lòng chọn ngày giao dịch.'
    }

    if (form.note && form.note.length > 500) {
      result.note = 'Ghi chú không được vượt quá 500 ký tự.'
    }

    return result
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const validationErrors = validate()
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) return

    try {
      setServerError('')

      await onSave({
        categoryId: Number(form.categoryId),
        type: form.type,
        amount: Number(form.amount),
        transactionDate: form.transactionDate,
        note: form.note.trim(),
      })
    } catch (error) {
      if (error.response?.status === 400) {
        setServerError(
          'Dữ liệu không hợp lệ hoặc danh mục không đúng loại.'
        )
      } else {
        setServerError('Không thể lưu giao dịch. Vui lòng thử lại.')
      }
    }
  }

  const inputClass = (name) =>
    `w-full rounded-xl border p-3 text-sm outline-none transition-all ${
      errors[name]
        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-900/40'
        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40'
    }`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white dark:bg-[#182234] p-6 shadow-2xl border border-slate-100 dark:border-slate-800"
      >
        <div className="mb-5 flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2
              id="transaction-modal-title"
              className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100"
            >
              {transaction ? 'Chỉnh sửa giao dịch' : 'Thêm giao dịch mới'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {transaction ? 'Cập nhật lại thông tin thu/chi của bạn' : 'Ghi chép khoản thu hoặc chi tiêu hàng ngày'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {serverError && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/50 p-3.5 text-sm text-rose-800 dark:text-rose-300 flex items-center gap-2.5"
          >
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          {/* Segmented Type Toggle */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Loại giao dịch
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => handleTypeSelect('EXPENSE')}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  form.type === 'EXPENSE'
                    ? 'bg-white dark:bg-[#182234] text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200/60 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <ArrowDownRight size={16} className={form.type === 'EXPENSE' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'} />
                <span>Chi tiêu</span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeSelect('INCOME')}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  form.type === 'INCOME'
                    ? 'bg-white dark:bg-[#182234] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/60 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <ArrowUpRight size={16} className={form.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'} />
                <span>Thu nhập</span>
              </button>
            </div>
            {/* Hidden select for standard form access */}
            <select
              id="transaction-type"
              name="type"
              value={form.type}
              onChange={handleChange}
              className="sr-only"
              aria-label="Loại giao dịch"
            >
              <option value="EXPENSE">Chi tiêu</option>
              <option value="INCOME">Thu nhập</option>
            </select>
          </div>

          {/* Danh mục */}
          <div>
            <label htmlFor="transaction-category" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Danh mục <span className="text-rose-500">*</span>
            </label>
            <select
              id="transaction-category"
              name="categoryId"
              value={form.categoryId}
              onChange={handleChange}
              className={inputClass('categoryId')}
              aria-invalid={!!errors.categoryId}
            >
              <option value="">-- Chọn danh mục --</option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className="mt-1.5 text-xs font-medium text-rose-600 flex items-center gap-1">
                <span>{errors.categoryId}</span>
              </p>
            )}
            {availableCategories.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                Chưa có danh mục {form.type === 'INCOME' ? 'thu nhập' : 'chi tiêu'}. Vui lòng tạo danh mục trước.
              </p>
            )}
          </div>

          {/* Số tiền */}
          <MoneyInput
            id="transaction-amount"
            name="amount"
            label="Số tiền giao dịch (VNĐ)"
            value={form.amount}
            onChange={handleChange}
            error={errors.amount}
            disabled={saving}
            quickAmounts={[50000, 100000, 500000]}
          />

          {/* Ngày giao dịch */}
          <div>
            <label htmlFor="transaction-date" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">
              Ngày giao dịch <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="transaction-date"
                name="transactionDate"
                type="date"
                value={form.transactionDate}
                onChange={handleChange}
                className={inputClass('transactionDate')}
              />
              <Calendar size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            {errors.transactionDate && (
              <p className="mt-1.5 text-xs font-medium text-rose-600">
                {errors.transactionDate}
              </p>
            )}
          </div>

          {/* Ghi chú */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="transaction-note" className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Ghi chú
              </label>
              <span className="text-[11px] text-slate-400">
                {form.note.length}/500
              </span>
            </div>
            <div className="relative">
              <textarea
                id="transaction-note"
                name="note"
                rows={3}
                maxLength={500}
                value={form.note}
                onChange={handleChange}
                placeholder="Ví dụ: Ăn trưa với đồng nghiệp..."
                className={inputClass('note')}
              />
              <FileText size={16} className="pointer-events-none absolute right-3.5 top-3.5 text-slate-300" />
            </div>
            {errors.note && (
              <p className="mt-1.5 text-xs font-medium text-rose-600">
                {errors.note}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || availableCategories.length === 0}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>{transaction ? 'Lưu thay đổi' : 'Lưu giao dịch'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TransactionModal({
  open,
  transaction,
  categories,
  saving,
  onClose,
  onSave,
}) {
  if (!open) return null

  return (
    <TransactionModalContent
      key={transaction ? `tx-${transaction.id}-${transaction.amount}-${transaction.categoryId}` : 'new-tx'}
      transaction={transaction}
      categories={categories}
      saving={saving}
      onClose={onClose}
      onSave={onSave}
    />
  )
}
