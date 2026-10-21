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
    } catch {
      setError('Không thể xóa ngân sách. Vui lòng thử lại.')
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

  const exceeded = budget?.exceeded === true
  const reached = Boolean(budget && !exceeded && remaining <= 0)

  return (
    <div className="space-y-6">
      {/* Tiêu đề và bộ chọn tháng */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Ngân sách hàng tháng
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kiểm soát hạn mức chi tiêu và quản lý tài chính thông minh theo từng tháng.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label
              htmlFor="budget-month"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
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
                className="rounded-xl border border-slate-300 bg-white py-2.5 pl-4 pr-10 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs"
              />
              <Calendar size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-sm text-rose-800 flex items-center gap-2.5 shadow-xs"
        >
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 border border-emerald-200/80 p-3.5 text-sm text-emerald-800 flex items-center gap-2.5 shadow-xs"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {!validMonth ? (
        <div className="rounded-2xl bg-white p-12 text-center border border-slate-200/80 shadow-sm">
          <p className="text-sm font-semibold text-rose-600">
            Vui lòng chọn tháng hợp lệ từ năm 1900 đến 2100.
          </p>
        </div>
      ) : loading ? (
        <div className="rounded-2xl bg-white p-16 text-center border border-slate-200/80 shadow-sm flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-500">
            Đang tải dữ liệu ngân sách...
          </p>
        </div>
      ) : !budget ? (
        // Chưa thiết lập ngân sách
        <div className="rounded-2xl bg-white p-12 text-center shadow-sm border border-slate-200/80">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-4">
            <Wallet size={36} />
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            Chưa thiết lập ngân sách
          </h2>

          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            Bạn chưa đặt hạn mức chi tiêu cho <strong className="text-slate-700">{monthLabel}</strong>. Hãy đặt ngân sách để bắt đầu theo dõi tiến độ chi tiêu.
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
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200/80 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Hạn mức ngân sách
                </p>
                <p className="mt-2 text-2xl font-black text-blue-700">
                  {formatMoney(limit)}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Đã cấu hình cho {monthLabel}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shrink-0">
                <Wallet size={24} />
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200/80 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Đã chi trong tháng
                </p>
                <p className="mt-2 text-2xl font-black text-rose-600">
                  {formatMoney(spent)}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Từ các giao dịch chi tiêu</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shrink-0">
                <TrendingDown size={24} />
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200/80 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ngân sách còn lại
                </p>
                <p
                  className={`mt-2 text-2xl font-black ${
                    remaining < 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {formatMoney(remaining)}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {remaining < 0 ? 'Đã chi vượt hạn mức' : 'Hạn mức khả dụng'}
                </p>
              </div>
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl shrink-0 ${
                  remaining < 0
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                <TrendingUp size={24} />
              </div>
            </div>
          </div>

          {/* Tiến độ sử dụng ngân sách */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200/80">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Tiến độ ngân sách
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tỷ lệ phần trăm đã sử dụng của {monthLabel}
                </p>
              </div>

              <span
                className={`text-xl font-black ${
                  exceeded
                    ? 'text-rose-600'
                    : reached
                      ? 'text-amber-600'
                      : 'text-blue-700'
                }`}
              >
                {percentage.toLocaleString('vi-VN', {
                  maximumFractionDigits: 1,
                })}%
              </span>
            </div>

            <div className="mt-5 h-3.5 overflow-hidden rounded-full bg-slate-100 p-0.5 border border-slate-200/60">
              <div
                role="progressbar"
                aria-label="Tỷ lệ sử dụng ngân sách"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressWidth)}
                className={`h-full rounded-full transition-all duration-500 ${
                  exceeded
                    ? 'bg-rose-500'
                    : reached
                      ? 'bg-amber-500'
                      : 'bg-blue-600'
                }`}
                style={{ width: `${progressWidth}%` }}
              />
            </div>

            <p className="mt-3 text-xs font-medium text-slate-500">
              Đã sử dụng <strong className="text-slate-800">{formatMoney(spent)}</strong> trên tổng{' '}
              <strong className="text-slate-800">{formatMoney(limit)}</strong>.
            </p>

            {/* Cảnh báo theo trạng thái thực tế */}
            {exceeded ? (
              <div
                role="alert"
                className="mt-5 flex items-start gap-3 rounded-xl bg-rose-50 border border-rose-200/80 p-4 text-rose-800 shadow-xs"
              >
                <AlertTriangle className="shrink-0 text-rose-600 mt-0.5" size={20} />
                <div>
                  <p className="font-bold text-sm">
                    Cảnh báo vượt ngân sách!
                  </p>
                  <p className="mt-1 text-xs">
                    Bạn đã chi vượt {formatMoney(Math.abs(remaining))} trong {monthLabel}.
                  </p>
                </div>
              </div>
            ) : reached ? (
              <div
                role="alert"
                className="mt-5 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200/80 p-4 text-amber-800 shadow-xs"
              >
                <AlertTriangle size={20} className="shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">
                    Đã đạt hạn mức chi tiêu
                  </p>
                  <p className="mt-1 text-xs">
                    Bạn đã sử dụng hết 100% ngân sách tháng này.
                  </p>
                </div>
              </div>
            ) : (
              <div
                role="status"
                className="mt-5 flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200/80 p-4 text-emerald-800 shadow-xs"
              >
                <CheckCircle2 size={20} className="shrink-0 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">
                    Chi tiêu an toàn
                  </p>
                  <p className="mt-1 text-xs">
                    Chi tiêu đang trong hạn mức. Còn {formatMoney(remaining)} có thể sử dụng.
                  </p>
                </div>
              </div>
            )}
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
              className="flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-2.5 font-semibold text-sm text-rose-600 hover:bg-rose-50 active:scale-95 transition-all shadow-2xs"
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
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3
                  id="delete-budget-title"
                  className="text-base font-bold text-slate-800"
                >
                  Xác nhận xóa ngân sách
                </h3>
                <p className="text-xs text-slate-500">
                  Thao tác cho {monthLabel}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-2">
              Bạn có chắc chắn muốn xóa ngân sách của <strong className="text-slate-800 font-semibold">{monthLabel}</strong>?
            </p>

            <p className="text-xs text-slate-500 mb-6 bg-slate-50 p-3 rounded-xl border border-slate-100">
              💡 Thao tác này chỉ xóa hạn mức ngân sách đã đặt, hoàn toàn không xóa các giao dịch thu chi của bạn.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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
