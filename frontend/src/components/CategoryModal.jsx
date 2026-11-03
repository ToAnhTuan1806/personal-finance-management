import { useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { getApiErrorMessage, getApiFieldErrors } from '../api/errors'
import useModalFocus from '../hooks/useModalFocus'
import { createSubmitGuard } from '../utils/transactionForm'
import { categoryForm, categoryPayload, validateCategoryForm } from '../utils/categoryAppearance'
import CategoryAppearancePicker from './category/CategoryAppearancePicker'

function CategoryModalContent({
  category,
  onClose,
  onSave,
  saving,
}) {
  const [form, setForm] = useState(() => categoryForm(category))
  const [changed, setChanged] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const guard = useRef(createSubmitGuard())
  const dialogRef = useModalFocus(onClose, saving)

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Chặn gửi lặp ngay cả trước khi React render trạng thái đang lưu.
    if (saving || guard.current.isPending()) return

    const validation = validateCategoryForm(form)
    setFieldErrors(validation)
    if (Object.keys(validation).length) {
      setError(Object.values(validation)[0])
      return
    }

    setError('')

    try {
      await guard.current.run(() => onSave(categoryPayload(form, Boolean(category), changed)))
    } catch (err) {
      setFieldErrors(getApiFieldErrors(err, ['name', 'type', 'icon', 'color']))
      setError(getApiErrorMessage(err))
    }
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
      className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white dark:bg-[#182234] p-4 sm:p-6 shadow-2xl border border-slate-100 dark:border-slate-800"
    >
      <div className="mb-6 flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <h2
          id="category-modal-title"
          className="text-lg font-bold text-slate-800 dark:text-slate-100"
        >
          {category ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}
        </h2>

        <button
          onClick={onClose}
          disabled={saving}
          aria-label="Đóng"
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
        >
          <X size={20} />
        </button>
      </div>

      <form noValidate onSubmit={handleSubmit} aria-busy={saving}>
        <div className="mb-4">
          <label htmlFor="category-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Tên danh mục
          </label>

          <input
            id="category-name"
            value={form.name}
            disabled={saving}
            maxLength={101}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, name: e.target.value }))
              setFieldErrors((previous) => ({ ...previous, name: '' }))
              setError('')
            }}
            placeholder="Ví dụ: Ăn uống, Tiền lương..."
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'category-form-error' : undefined}
            className={`w-full rounded-xl border p-3 text-sm outline-none transition
              ${fieldErrors.name
                ? 'border-red-500 bg-red-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 focus:border-red-600'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20'}`}
          />
        </div>

        <div className="mb-5">
          <label htmlFor="category-type" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Loại danh mục
          </label>

          <select
            id="category-type"
            value={form.type}
            disabled={saving}
            aria-invalid={Boolean(fieldErrors.type)}
            aria-describedby={fieldErrors.type ? 'category-form-error' : undefined}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, type: e.target.value }))
              setFieldErrors((previous) => ({ ...previous, type: '' }))
              setError('')
            }}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] text-slate-800 dark:text-slate-100 p-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="EXPENSE">Chi tiêu (EXPENSE)</option>
            <option value="INCOME">Thu nhập (INCOME)</option>
          </select>
        </div>

        <CategoryAppearancePicker form={form} errors={fieldErrors} disabled={saving} onChange={(field, value) => {
          setForm((previous) => ({ ...previous, [field]: value }))
          setChanged((previous) => ({ ...previous, [field]: true }))
          setFieldErrors({})
          setError('')
        }} />

        {error && (
          <p id="category-form-error" role="alert" className="mb-4 text-xs font-medium text-red-600 dark:text-rose-400 bg-red-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-red-200 dark:border-rose-900/50">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Hủy
          </button>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 disabled:opacity-50 transition-all"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Đang lưu...' : 'Lưu danh mục'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function CategoryModal({
  open,
  category,
  onClose,
  onSave,
  saving,
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <CategoryModalContent
        key={category ? `${category.id}-${category.name}` : 'new-category'}
        category={category}
        onClose={onClose}
        onSave={onSave}
        saving={saving}
      />
    </div>
  )
}
