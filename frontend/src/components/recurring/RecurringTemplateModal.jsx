import { useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  FileText,
  Info,
  Loader2,
  X,
} from 'lucide-react'
import CategoryBadge from '../category/CategoryBadge'
import MoneyInput from '../ui/MoneyInput'
import useModalFocus from '../../hooks/useModalFocus'
import { getApiErrorMessage, getApiFieldErrors } from '../../api/errors'
import {
  DAY_31_NOTICE,
  validateRecurringTemplateForm,
} from './recurringTemplateUtils'

function RecurringTemplateModalContent({
  template,
  categories = [],
  saving = false,
  error = '',
  onClose,
  onSave,
}) {
  const isEditing = Boolean(template)

  const [form, setForm] = useState(() => ({
    type: template?.type || 'EXPENSE',
    categoryId: template?.categoryId ? String(template.categoryId) : '',
    amount: template?.amount != null ? String(template.amount) : '',
    dayOfMonth: template?.dayOfMonth != null ? String(template.dayOfMonth) : '1',
    note: template?.note || '',
    active: template?.active !== undefined ? Boolean(template.active) : true,
  }))

  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(error || '')

  const dialogRef = useModalFocus(onClose, saving)

  // Lọc danh mục theo loại giao dịch được chọn
  const availableCategories = categories.filter((c) => c.type === form.type)
  const selectedCategory = availableCategories.find(
    (c) => String(c.id) === String(form.categoryId)
  )

  const is31 = Number(form.dayOfMonth) === 31

  const handleTypeSelect = (nextType) => {
    if (saving || form.type === nextType) return

    setForm((prev) => {
      // Nếu danh mục hiện tại không khớp với type mới, reset danh mục
      const matched = categories.find(
        (c) => String(c.id) === String(prev.categoryId) && c.type === nextType
      )
      return {
        ...prev,
        type: nextType,
        categoryId: matched ? prev.categoryId : '',
      }
    })

    setErrors((prev) => ({
      ...prev,
      type: '',
      categoryId: '',
    }))
    setServerError('')
  }

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    const nextVal = type === 'checkbox' ? checked : value

    setForm((prev) => ({
      ...prev,
      [name]: nextVal,
    }))

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
    setServerError('')
  }

  const handleAmountChange = (event) => {
    const val = event.target.value
    setForm((prev) => ({ ...prev, amount: val }))
    if (errors.amount) {
      setErrors((prev) => ({ ...prev, amount: '' }))
    }
    setServerError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    const validation = validateRecurringTemplateForm(form, categories)
    if (!validation.isValid) {
      setErrors(validation.errors)
      const firstField = Object.keys(validation.errors)[0]
      const element = dialogRef.current?.querySelector(`[name="${firstField}"]`)
      element?.focus()
      return
    }

    setErrors({})
    setServerError('')

    const payload = {
      categoryId: Number(form.categoryId),
      type: form.type,
      amount: Number(form.amount),
      dayOfMonth: Number(form.dayOfMonth),
      note: form.note?.trim() || null,
      active: Boolean(form.active),
    }

    try {
      await onSave?.(payload)
    } catch (err) {
      const fieldErrs = getApiFieldErrors(err, ['type', 'categoryId', 'amount', 'dayOfMonth', 'note'])
      if (Object.keys(fieldErrs).length > 0) {
        setErrors((prev) => ({ ...prev, ...fieldErrs }))
      }
      setServerError(getApiErrorMessage(err, 'Không thể lưu mẫu giao dịch định kỳ.'))
    }
  }

  const inputClass = (name) =>
    `w-full rounded-xl border p-2.5 text-sm outline-none transition-all ${
      errors[name]
        ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 dark:bg-rose-950/30 dark:text-rose-200 dark:focus:ring-rose-900/40'
        : 'border-slate-300 bg-white text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100 dark:focus:ring-blue-900/40'
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
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-template-modal-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#182234]"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2
              id="recurring-template-modal-title"
              className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100"
            >
              {isEditing ? 'Chỉnh sửa mẫu định kỳ' : 'Thêm mẫu định kỳ mới'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Thiết lập mẫu thu chi tự động gợi ý hằng tháng
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Server Error Alert */}
        {serverError && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{serverError}</span>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} aria-busy={saving}>
          <fieldset disabled={saving} className="min-w-0 space-y-4">
            {/* Segmented Type Toggle */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Loại giao dịch
              </label>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => handleTypeSelect('EXPENSE')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    form.type === 'EXPENSE'
                      ? 'border border-slate-200/60 bg-white text-rose-600 shadow-sm dark:border-slate-700 dark:bg-[#182234] dark:text-rose-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                  }`}
                >
                  <ArrowDownRight
                    size={16}
                    className={form.type === 'EXPENSE' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}
                  />
                  <span>Chi tiêu</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeSelect('INCOME')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                    form.type === 'INCOME'
                      ? 'border border-slate-200/60 bg-white text-emerald-600 shadow-sm dark:border-slate-700 dark:bg-[#182234] dark:text-emerald-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                  }`}
                >
                  <ArrowUpRight
                    size={16}
                    className={form.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}
                  />
                  <span>Thu nhập</span>
                </button>
              </div>
              {errors.type && (
                <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {errors.type}
                </p>
              )}
            </div>

            {/* Category Select */}
            <div>
              <label
                htmlFor="template-category"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
              >
                Danh mục <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  id="template-category"
                  name="categoryId"
                  value={form.categoryId}
                  onChange={handleChange}
                  className={inputClass('categoryId')}
                >
                  <option value="">-- Chọn danh mục --</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {availableCategories.length === 0 && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Chưa có danh mục nào thuộc loại này. Vui lòng tạo danh mục trước.
                </p>
              )}
              {errors.categoryId && (
                <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {errors.categoryId}
                </p>
              )}
              {selectedCategory && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <CategoryBadge category={selectedCategory} size={14} />
                  <span>
                    Đang chọn: <strong>{selectedCategory.name}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Amount (MoneyInput) */}
            <div>
              <MoneyInput
                id="template-amount"
                name="amount"
                label="Số tiền định kỳ"
                value={form.amount}
                onChange={handleAmountChange}
                error={errors.amount}
                disabled={saving}
              />
            </div>

            {/* Day of Month */}
            <div>
              <label
                htmlFor="template-day-of-month"
                className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
              >
                <span>
                  Ngày lặp hằng tháng (1 - 31) <span className="text-rose-500">*</span>
                </span>
                <span className="font-normal text-slate-400">Ví dụ: 5, 15, 31</span>
              </label>
              <div className="relative">
                <input
                  id="template-day-of-month"
                  name="dayOfMonth"
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  value={form.dayOfMonth}
                  onChange={handleChange}
                  placeholder="Nhập ngày (1 - 31)"
                  className={inputClass('dayOfMonth')}
                />
                <Calendar
                  size={16}
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>
              {errors.dayOfMonth && (
                <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {errors.dayOfMonth}
                </p>
              )}

              {/* Day 31 Notice */}
              {is31 && (
                <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  <Info size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="leading-snug">{DAY_31_NOTICE}</span>
                </div>
              )}
            </div>

            {/* Note */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <label htmlFor="template-note">Ghi chú (tùy chọn)</label>
                <span className={`font-normal ${form.note.length > 500 ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                  {form.note.length}/500
                </span>
              </div>
              <div className="relative">
                <textarea
                  id="template-note"
                  name="note"
                  rows={2}
                  maxLength={500}
                  value={form.note}
                  onChange={handleChange}
                  placeholder="Ví dụ: Tiền thuê nhà, Tiền điện nước..."
                  className={inputClass('note')}
                />
                <FileText
                  size={16}
                  className="pointer-events-none absolute right-3.5 top-3 text-slate-400"
                />
              </div>
              {errors.note && (
                <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {errors.note}
                </p>
              )}
            </div>

            {/* Active Switch */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-[#1E293B]/50">
              <div>
                <label
                  htmlFor="template-active-toggle"
                  className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Kích hoạt mẫu này
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {form.active
                    ? 'Đang bật: Sẵn sàng áp dụng cho các kỳ tới'
                    : 'Đã tắt: Tạm dừng sử dụng mẫu này'}
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  id="template-active-toggle"
                  name="active"
                  type="checkbox"
                  checked={form.active}
                  onChange={handleChange}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-300 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/20 dark:bg-slate-700 dark:peer-focus:ring-blue-800 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
              </label>
            </div>

            {/* Buttons */}
            <div className="mt-6 flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <span>{isEditing ? 'Cập nhật mẫu' : 'Lưu mẫu'}</span>
                )}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  )
}

export default function RecurringTemplateModal(props) {
  if (!props.isOpen && !props.template) return null
  return <RecurringTemplateModalContent {...props} />
}

