import { useState } from 'react'
import { X, Loader2, AlertCircle, Coins } from 'lucide-react'

function BudgetModalContent({
  budget,
  monthLabel,
  saving,
  onClose,
  onSave,
}) {
  const [amount, setAmount] = useState(() => (budget ? String(budget.amountLimit) : ''))
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()

    const value = amount.trim()

    // BigDecimal Backend: tối đa 13 chữ số nguyên, 2 số lẻ
    if (!value) {
      setError('Vui lòng nhập hạn mức ngân sách.')
      return
    }

    if (!/^\d{1,13}(\.\d{1,2})?$/.test(value)) {
      setError('Số tiền tối đa 13 chữ số và 2 chữ số thập phân.')
      return
    }

    if (Number(value) <= 0) {
      setError('Ngân sách phải lớn hơn 0.')
      return
    }

    setError('')

    try {
      await onSave(Number(value))
    } catch (err) {
      if (err.response?.status === 400) {
        setError('Hạn mức không hợp lệ. Vui lòng kiểm tra lại.')
      } else {
        setError('Không thể lưu ngân sách. Vui lòng thử lại.')
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-modal-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100"
      >
        <div className="mb-4 flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2
              id="budget-modal-title"
              className="text-xl font-black tracking-tight text-slate-900"
            >
              {budget ? 'Cập nhật ngân sách' : 'Thiết lập ngân sách'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Hạn mức chi tiêu cho {monthLabel}
            </p>
          </div>

          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="budget-amount"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
            >
              Hạn mức ngân sách (VNĐ) <span className="text-rose-500">*</span>
            </label>

            <div className="relative">
              <input
                id="budget-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setError('')
                }}
                placeholder="Ví dụ: 3000000"
                aria-invalid={!!error}
                aria-describedby={error ? 'budget-error' : undefined}
                className={`w-full rounded-xl border p-3 pl-10 text-sm outline-none transition-all ${
                  error
                    ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200'
                    : 'border-slate-300 bg-white text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                }`}
              />
              <Coins size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                ₫
              </span>
            </div>

            {error && (
              <p
                id="budget-error"
                role="alert"
                className="mt-2 text-xs font-medium text-rose-600 flex items-center gap-1.5"
              >
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <p className="mt-2 text-xs text-slate-400">
              Nhập số tiền không có dấu phân cách hàng nghìn (ví dụ: 3000000).
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>Lưu ngân sách</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function BudgetModal({
  open,
  budget,
  monthLabel,
  saving,
  onClose,
  onSave,
}) {
  if (!open) return null

  return (
    <BudgetModalContent
      key={budget ? `budget-${budget.year}-${budget.month}-${budget.amountLimit}` : 'new-budget'}
      budget={budget}
      monthLabel={monthLabel}
      saving={saving}
      onClose={onClose}
      onSave={onSave}
    />
  )
}
