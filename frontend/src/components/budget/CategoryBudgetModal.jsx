import { useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import MoneyInput from '../ui/MoneyInput'
import CategoryBadge from '../category/CategoryBadge'
import useModalFocus from '../../hooks/useModalFocus'
import { validateCategoryBudgetForm } from './categoryBudgetUtils'

function CategoryBudgetModalContent({
  budget,
  categories = [],
  month,
  year,
  monthLabel,
  saving = false,
  error = '',
  onClose,
  onSave,
}) {
  const isEditing = Boolean(budget)
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE')

  const [categoryId, setCategoryId] = useState(() => {
    if (budget?.categoryId) return String(budget.categoryId)
    return expenseCategories[0]?.id ? String(expenseCategories[0].id) : ''
  })
  const [amount, setAmount] = useState(() => (budget ? String(budget.amountLimit) : ''))
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const dialogRef = useModalFocus(onClose, saving)

  const selectedCategory = categories.find((c) => String(c.id) === String(categoryId))
  const displayMonth = monthLabel || (month && year ? `tháng ${month}/${year}` : 'tháng được chọn')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    const validation = validateCategoryBudgetForm({
      categoryId,
      amountLimit: amount,
      isEditing,
    })

    if (!validation.isValid) {
      setFieldErrors(validation.errors)
      setFormError(Object.values(validation.errors)[0] || '')
      return
    }

    setFieldErrors({})
    setFormError('')

    try {
      await onSave?.({
        categoryId: Number(categoryId),
        amountLimit: Number(amount),
      })
    } catch (err) {
      // Nhận lỗi từ props/reject nếu caller ném
      const msg = err?.response?.data?.message || err?.message || 'Không thể lưu ngân sách danh mục.'
      setFormError(msg)
    }
  }

  const activeError = formError || error

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose?.()
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-budget-modal-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 transition-colors dark:border-slate-800 dark:bg-[#182234]"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2
              id="category-budget-modal-title"
              className="text-lg font-bold text-slate-800 dark:text-slate-100"
            >
              {isEditing ? 'Cập nhật ngân sách danh mục' : 'Thiết lập ngân sách danh mục'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Hạn mức chi tiêu cho {displayMonth}
            </p>
          </div>

          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} aria-busy={saving} className="space-y-4">
          {/* Category selection */}
          <div>
            <label
              htmlFor="category-budget-select"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Danh mục chi tiêu
            </label>

            {isEditing ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                {selectedCategory && <CategoryBadge category={selectedCategory} size={18} />}
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {budget?.categoryName || selectedCategory?.name || 'Danh mục'}
                </span>
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">(Không thể đổi danh mục)</span>
              </div>
            ) : (
              <div>
                <select
                  id="category-budget-select"
                  name="categoryId"
                  value={categoryId}
                  disabled={saving || expenseCategories.length === 0}
                  aria-invalid={Boolean(fieldErrors.categoryId)}
                  aria-describedby={fieldErrors.categoryId ? 'category-budget-select-error' : undefined}
                  onChange={(e) => {
                    setCategoryId(e.target.value)
                    setFieldErrors((prev) => ({ ...prev, categoryId: '' }))
                    setFormError('')
                  }}
                  className={`w-full rounded-xl border p-3 text-sm outline-none transition
                    ${
                      fieldErrors.categoryId
                        ? 'border-red-500 bg-red-50 text-rose-900 focus:border-red-600 dark:bg-rose-950/30 dark:text-rose-200'
                        : 'border-slate-300 bg-white text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100'
                    }`}
                >
                  {expenseCategories.length === 0 ? (
                    <option value="">-- Chưa có danh mục chi tiêu nào --</option>
                  ) : (
                    <>
                      <option value="">-- Chọn danh mục chi tiêu --</option>
                      {expenseCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>

                {fieldErrors.categoryId && (
                  <p id="category-budget-select-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-rose-400">
                    {fieldErrors.categoryId}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Amount input via MoneyInput */}
          <div>
            <MoneyInput
              id="category-budget-amount"
              name="amountLimit"
              label="Hạn mức ngân sách (VNĐ)"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setFieldErrors((prev) => ({ ...prev, amountLimit: '' }))
                setFormError('')
              }}
              error={fieldErrors.amountLimit}
              disabled={saving}
              quickAmounts={[500000, 1000000, 2000000, 5000000]}
            />
          </div>

          {/* Error Banner */}
          {activeError && !fieldErrors.amountLimit && !fieldErrors.categoryId && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
            >
              <AlertCircle size={16} className="shrink-0 text-red-600 dark:text-rose-400" />
              <span>{activeError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
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
              disabled={saving || (!isEditing && expenseCategories.length === 0)}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              <span>{saving ? 'Đang lưu...' : 'Lưu ngân sách'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CategoryBudgetModal({
  open,
  budget,
  categories = [],
  month,
  year,
  monthLabel,
  saving = false,
  error = '',
  onClose,
  onSave,
}) {
  if (!open) return null

  return (
    <CategoryBudgetModalContent
      key={budget ? `cat-budget-${budget.id || budget.categoryId}-${budget.amountLimit}` : `new-cat-budget-${month}-${year}`}
      budget={budget}
      categories={categories}
      month={month}
      year={year}
      monthLabel={monthLabel}
      saving={saving}
      error={error}
      onClose={onClose}
      onSave={onSave}
    />
  )
}

