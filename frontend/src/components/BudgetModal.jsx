import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import MoneyInput from './ui/MoneyInput'

function BudgetModalContent({
  budget,
  monthLabel,
  saving,
  onClose,
  onSave,
}) {
  const [amount, setAmount] = useState(() => (budget ? String(budget.amountLimit) : ''))
  const [error, setError] = useState('')

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !saving) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saving, onClose])

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
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#182234] p-6 shadow-2xl border border-slate-100 dark:border-slate-800 transition-colors"
      >
        <div className="mb-4 flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2
              id="budget-modal-title"
              className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100"
            >
              {budget ? 'Cập nhật ngân sách' : 'Thiết lập ngân sách'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Hạn mức chi tiêu cho {monthLabel}
            </p>
          </div>

          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit}>
          <MoneyInput
            id="budget-amount"
            name="amountLimit"
            label="Hạn mức ngân sách (VNĐ)"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value)
              setError('')
            }}
            error={error}
            disabled={saving}
            quickAmounts={[500000, 1000000, 2000000]}
          />

          <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
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
