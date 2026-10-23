import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  Calendar,
  Loader2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import BudgetModal from '../components/BudgetModal'
import { useToast } from '../contexts/ToastContext'
import {
  getBudget,
  saveBudget,
  deleteBudget,
} from '../services/budgetService'

// Lấy tháng hiện tại theo giờ địa phương YYYY-MM
const currentMonth = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

const formatMoney = (value) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(Number(value ?? 0))

export default function Budgets() {
  const toast = useToast()
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [budget, setBudget] = useState(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // YYYY-MM -> năm và tháng cho Budget API
  const [yearText, monthText] = (selectedMonth || '').split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const validMonth = (
    year >= 1900 &&
    year <= 2100 &&
    month >= 1 &&
    month <= 12
  )

  const monthLabel = validMonth
    ? `tháng ${month}/${year}`
    : 'tháng được chọn'

  // Lấy ngân sách từ Backend khi đổi tháng
  useEffect(() => {
    let ignore = false

    if (!validMonth) {
      return
    }

    getBudget(year, month)
      .then((result) => {
        if (!ignore) {
          setBudget(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!ignore) {
          if (err.response?.status === 404) {
            // Chưa đặt ngân sách là trạng thái bình thường
            setBudget(null)
          } else {
            setError('Không thể tải ngân sách. Vui lòng thử lại.')
          }
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [year, month, validMonth])

  // Thiết lập hoặc cập nhật ngân sách
  const handleSave = async (amountLimit) => {
    setSaving(true)

    try {
      const updated = await saveBudget(
        year,
        month,
        amountLimit
      )

      setBudget(updated)
      setModalOpen(false)
      setError('')
      setSuccess('Lưu ngân sách thành công.')
      toast.success('Lưu ngân sách thành công.')
    } catch (err) {
      toast.error('Không thể lưu ngân sách. Vui lòng thử lại.')
      throw err
    } finally {
      setSaving(false)
    }
  }

  // Xóa ngân sách sau khi xác nhận
  const handleDelete = async () => {
    setDeleting(true)
    setError('')

    try {
      await deleteBudget(year, month)

      setBudget(null)
      setConfirmDelete(false)
      setSuccess('Đã xóa ngân sách của tháng này.')
      toast.success('Đã xóa ngân sách của tháng này.')
    } catch {
      setError('Không thể xóa ngân sách. Vui lòng thử lại.')
      toast.error('Không thể xóa ngân sách. Vui lòng thử lại.')
    } finally {
      setDeleting(false)
    }
  }

  // Dữ liệu để hiển thị tiến độ
  const limit = Number(budget?.amountLimit ?? 0)
  const spent = Number(budget?.spentAmount ?? 0)
  const remaining = Number(budget?.remainingAmount ?? 0)

  const percentage = limit > 0
    ? (spent / limit) * 100
    : 0

  // Thanh tiến độ chỉ dài tối đa 100%
  const progressWidth = Math.min(
    Math.max(percentage, 0),
    100
  )

  const isExceeded = Boolean(
    budget && (budget.exceeded === true || percentage >= 100 || remaining < 0)
  )
  const isWarning = Boolean(
    budget && !isExceeded && percentage >= 80 && percentage < 100
  )
  const isSafe = Boolean(budget && !isExceeded && !isWarning)

  return (
    <div className="space-y-6">
      {/* Tiêu đề và bộ chọn tháng */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            Ngân sách hàng tháng
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Kiểm soát hạn mức chi tiêu và quản lý tài chính thông minh theo từng tháng.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label
              htmlFor="budget-month"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
            >
              Chọn tháng
            </label>
            <div className="relative">
              <input
                id="budget-month"
                type="month"
                min="1900-01"
                max="2100-12"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value)
                  setConfirmDelete(false)
                  setSuccess('')
                  setError('')
                  setLoading(true)
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] py-2.5 pl-4 pr-10 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all shadow-2xs"
              />
              <Calendar size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 border border-rose-200/80 dark:bg-rose-950/30 dark:border-rose-900/50 p-3.5 text-sm text-rose-800 dark:text-rose-300 flex items-center gap-2.5 shadow-xs"
        >
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 border border-emerald-200/80 dark:bg-emerald-950/30 dark:border-emerald-900/50 p-3.5 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5 shadow-xs"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {!validMonth ? (
        <div className="rounded-2xl bg-white dark:bg-[#182234] p-12 text-center border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
            Vui lòng chọn tháng hợp lệ từ năm 1900 đến 2100.
          </p>
        </div>
      ) : loading ? (
        <div className="rounded-2xl bg-white dark:bg-[#182234] p-16 text-center border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Đang tải dữ liệu ngân sách...
          </p>
        </div>
      ) : !budget ? (
        // Chưa thiết lập ngân sách
        <div className="rounded-2xl bg-white dark:bg-[#182234] p-12 text-center shadow-sm border border-slate-200/80 dark:border-slate-800">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 mb-4">
            <Wallet size={36} />
          </div>

          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Chưa thiết lập ngân sách
          </h2>

          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Bạn chưa đặt hạn mức chi tiêu cho <strong className="text-slate-700 dark:text-slate-200">{monthLabel}</strong>. Hãy đặt ngân sách để bắt đầu theo dõi tiến độ chi tiêu.
          </p>

          <button
            onClick={() => {
              setModalOpen(true)
              setSuccess('')
              setError('')
            }}
            className="mx-auto mt-6 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-sm text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Plus size={18} />
            <span>Thiết lập ngân sách</span>
          </button>
        </div>
      ) : (
        <>
          {/* Tổng quan ngân sách */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white dark:bg-[#182234] p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Hạn mức ngân sách
                </p>
                <p className="mt-2 text-2xl font-black text-blue-700 dark:text-blue-400">
                  {formatMoney(limit)}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Đã cấu hình cho {monthLabel}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0">
                <Wallet size={24} />
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#182234] p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Đã chi trong tháng
                </p>
                <p className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400">
                  {formatMoney(spent)}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Từ các giao dịch chi tiêu</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 shrink-0">
                <TrendingDown size={24} />
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#182234] p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Ngân sách còn lại
                </p>
                <p
                  className={`mt-2 text-2xl font-black ${
                    remaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatMoney(remaining)}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  {remaining < 0 ? 'Đã chi vượt hạn mức' : 'Hạn mức khả dụng'}
                </p>
              </div>
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl shrink-0 ${
                  remaining < 0
                    ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <TrendingUp size={24} />
              </div>
            </div>
          </div>

          {/* Tiến độ sử dụng ngân sách */}
          <div className="rounded-2xl bg-white dark:bg-[#182234] p-6 shadow-sm border border-slate-200/80 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Tiến độ ngân sách
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tỷ lệ phần trăm đã sử dụng của {monthLabel}
                </p>
              </div>

              <span
                className={`text-xl font-black ${
                  isExceeded
                    ? 'text-rose-600 dark:text-rose-400'
                    : isWarning
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {percentage.toLocaleString('vi-VN', {
                  maximumFractionDigits: 1,
                })}%
              </span>
            </div>

            <div className="mt-5 h-3.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/60 dark:border-slate-700">
              <div
                role="progressbar"
                aria-label="Tỷ lệ sử dụng ngân sách"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressWidth)}
                className={`h-full rounded-full transition-all duration-500 ${
                  isExceeded
                    ? 'bg-rose-500'
                    : isWarning
                      ? 'bg-amber-500'
                      : 'bg-emerald-600'
                }`}
                style={{ width: `${progressWidth}%` }}
              />
            </div>

            <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
              Đã sử dụng <strong className="text-slate-800 dark:text-slate-200">{formatMoney(spent)}</strong> trên tổng{' '}
              <strong className="text-slate-800 dark:text-slate-200">{formatMoney(limit)}</strong>.
            </p>

            {/* Ba trạng thái: Safe (< 80%), Warning (80% - 99%), Exceeded (>= 100%) */}
            {isExceeded ? (
              <div
                role="alert"
                className="mt-5 flex items-start gap-3 rounded-xl bg-rose-50 border border-rose-200/80 dark:bg-rose-950/40 dark:border-rose-900/60 p-4 text-rose-800 dark:text-rose-300 shadow-xs"
              >
                <AlertTriangle className="shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" size={20} />
                <div>
                  <p className="font-bold text-sm">
                    Cảnh báo vượt ngân sách! (Đã dùng &ge; 100%)
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Bạn đã chi vượt {formatMoney(Math.abs(remaining))} trong {monthLabel}. Hãy hạn chế các khoản chi không cần thiết.
                  </p>
                </div>
              </div>
            ) : isWarning ? (
              <div
                role="alert"
                className="mt-5 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-900/60 p-4 text-amber-800 dark:text-amber-300 shadow-xs"
              >
                <AlertCircle size={20} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">
                    Cảnh báo tiếp cận hạn mức (Đã dùng 80% - 99%)
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Bạn đã sử dụng {percentage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% ngân sách tháng này. Chỉ còn {formatMoney(remaining)} khả dụng.
                  </p>
                </div>
              </div>
            ) : isSafe ? (
              <div
                role="status"
                className="mt-5 flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-900/60 p-4 text-emerald-800 dark:text-emerald-300 shadow-xs"
              >
                <CheckCircle2 size={20} className="shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">
                    Chi tiêu an toàn (Dưới 80%)
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Chi tiêu đang trong hạn mức kiểm soát tốt. Còn {formatMoney(remaining)} có thể sử dụng.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Thao tác ngân sách */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setModalOpen(true)
                setSuccess('')
                setError('')
              }}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-sm text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
            >
              <Pencil size={16} />
              <span>Cập nhật ngân sách</span>
            </button>

            <button
              onClick={() => {
                setConfirmDelete(true)
                setSuccess('')
                setError('')
              }}
              className="flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-[#182234] px-5 py-2.5 font-semibold text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 transition-all shadow-2xs"
            >
              <Trash2 size={16} />
              <span>Xóa ngân sách</span>
            </button>
          </div>
        </>
      )}

      {/* Modal thiết lập và sửa */}
      <BudgetModal
        open={modalOpen}
        budget={budget}
        monthLabel={monthLabel}
        saving={saving}
        onClose={() => {
          if (!saving) setModalOpen(false)
        }}
        onSave={handleSave}
      />

      {/* Xác nhận xóa tùy chỉnh */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-budget-title"
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#182234] p-6 shadow-2xl border border-slate-100 dark:border-slate-800"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3
                  id="delete-budget-title"
                  className="text-base font-bold text-slate-800 dark:text-slate-100"
                >
                  Xác nhận xóa ngân sách
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Thao tác cho {monthLabel}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              Bạn có chắc chắn muốn xóa ngân sách của <strong className="text-slate-800 dark:text-slate-100 font-semibold">{monthLabel}</strong>?
            </p>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60">
              💡 Thao tác này chỉ xóa hạn mức ngân sách đã đặt, hoàn toàn không xóa các giao dịch thu chi của bạn.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Hủy
              </button>

              <button
                type="button"
                id="btn-confirm-delete-budget"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 shadow-sm shadow-rose-500/20 disabled:opacity-50 flex items-center gap-2 transition-all"
              >
                {deleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <span>Xác nhận xóa</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
