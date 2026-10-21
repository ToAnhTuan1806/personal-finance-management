import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

function CategoryModalContent({
  category,
  onClose,
  onSave,
  saving,
}) {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    type: category?.type ?? 'EXPENSE',
  })
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    const name = form.name.trim()

    if (!name) {
      setError('Vui lòng nhập tên danh mục.')
      return
    }

    if (name.length > 100) {
      setError('Tên danh mục tối đa 100 ký tự.')
      return
    }

    setError('')

    try {
      await onSave({
        name,
        type: form.type,
      })
    } catch (err) {
      if (err.response?.status === 409) {
        setError('Danh mục bị trùng hoặc không thể đổi loại.')
      } else if (err.response?.status === 400) {
        setError(err.response?.data?.message || 'Thông tin danh mục không hợp lệ.')
      } else {
        setError('Không thể lưu danh mục. Vui lòng thử lại.')
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
      className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100"
    >
      <div className="mb-6 flex items-center justify-between pb-3 border-b border-slate-100">
        <h2
          id="category-modal-title"
          className="text-lg font-bold text-slate-800"
        >
          {category ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}
        </h2>

        <button
          onClick={onClose}
          disabled={saving}
          aria-label="Đóng"
          className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
        >
          <X size={20} />
        </button>
      </div>

      <form noValidate onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="category-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Tên danh mục
          </label>

          <input
            id="category-name"
            value={form.name}
            maxLength={101}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, name: e.target.value }))
              setError('')
            }}
            placeholder="Ví dụ: Ăn uống, Tiền lương..."
            aria-invalid={!!error}
            className={`w-full rounded-xl border p-3 text-sm outline-none transition
              ${error
                ? 'border-red-500 bg-red-50 focus:border-red-600'
                : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20'}`}
          />
        </div>

        <div className="mb-5">
          <label htmlFor="category-type" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Loại danh mục
          </label>

          <select
            id="category-type"
            value={form.type}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, type: e.target.value }))
            }
            className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
          >
            <option value="EXPENSE">Chi tiêu (EXPENSE)</option>
            <option value="INCOME">Thu nhập (INCOME)</option>
          </select>
        </div>

        {error && (
          <p role="alert" className="mb-4 text-xs font-medium text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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
