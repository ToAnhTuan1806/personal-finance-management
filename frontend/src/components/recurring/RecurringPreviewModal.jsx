/**
 * RecurringPreviewModal.jsx
 * Modal Xem trước và Áp dụng giao dịch định kỳ cho SmartExpense 2.0 — D09-FE (FR-08)
 *
 * Hành vi an toàn:
 *  - Preview chỉ gọi GET, không ghi dữ liệu.
 *  - Khi thay đổi tháng hoặc năm, Preview cũ bị vô hiệu hóa ngay lập tức.
 *  - Chống race condition: bỏ qua response out-of-order khi người dùng đổi kỳ hoặc gọi xem trước mới.
 *  - Không cho Apply khi dữ liệu chưa được Preview cho đúng kỳ đã chọn.
 *  - Apply chỉ gửi POST sau khi người dùng bấm "Xác nhận" trong dialog confirm.
 *  - applyInFlightRef khóa và ngăn double-submit trong suốt lần POST.
 *  - Mọi lỗi mạng không rõ kết quả POST đều hủy confirm, yêu cầu Preview lại, tuyệt đối không retry tự động.
 *  - canApply=false → nút Apply không hiển thị, có badge và mô tả lý do phù hợp.
 *  - HTTP 409 thực tế từ Backend (code=CONFLICT, message=ALREADY_APPLIED / TEMPLATE_INACTIVE) được xử lý chính xác.
 *  - Cảnh báo ngày cuối tháng chỉ hiển thị khi dayOfMonth > lastDay của tháng/năm đã chọn.
 *  - Định dạng transactionDate ISO (YYYY-MM-DD) sang DD/MM/YYYY chuẩn giao diện người dùng.
 *  - Hỗ trợ focus trap, Escape, restore focus qua hook useModalFocus.
 *  - Tự động dọn dẹp state sạch sẽ khi đóng/mở lại hoặc chuyển template.
 */

import { useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react'
import useModalFocus from '../../hooks/useModalFocus'
import {
  formatDisplayDate,
  formatMoney,
  getCurrentRecurringPeriod,
  getRecurringPreviewMonthOptions,
  getRecurringPreviewYearOptions,
  isDayClampedToMonthEnd,
  isRecurringPreviewPeriodAllowed,
} from './recurringTemplateUtils'

/* ─── Hằng số ────────────────────────────────────────────────── */
/* ─── Helpers ────────────────────────────────────────────────── */
/**
 * Xác định trạng thái nghiệp vụ từ Preview DTO.
 * Ưu tiên: ALREADY_APPLIED > TEMPLATE_INACTIVE > FUTURE_DATE > READY
 */
function resolveStatus(preview) {
  if (!preview) return null
  if (preview.alreadyApplied) return 'ALREADY_APPLIED'
  if (!preview.canApply && preview.reasonCode === 'TEMPLATE_INACTIVE') return 'TEMPLATE_INACTIVE'
  if (!preview.canApply && preview.reasonCode === 'FUTURE_DATE') return 'FUTURE_DATE'
  if (preview.canApply) return 'READY'
  return 'UNKNOWN'
}

/* ─── Sub-components ─────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    ALREADY_APPLIED: {
      label: 'Đã ghi nhận tháng này',
      icon: <CheckCircle2 size={14} />,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
    },
    TEMPLATE_INACTIVE: {
      label: 'Mẫu đã tắt',
      icon: <Info size={14} />,
      cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    },
    FUTURE_DATE: {
      label: 'Chưa đến ngày ghi nhận',
      icon: <Clock size={14} />,
      cls: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50',
    },
    READY: {
      label: 'Sẵn sàng ghi nhận',
      icon: <Info size={14} />,
      cls: 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/50',
    },
  }
  const info = map[status] || map['READY']
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${info.cls}`}
    >
      {info.icon}
      {info.label}
    </span>
  )
}

/* ─── Component Nội Dung ──────────────────────────────────────── */
function RecurringPreviewModalContent({
  template,
  onClose,
  onPreview,
  onApply,
  onApplySuccess,
}) {
  const [{ year: currentYear, month: currentMonth }] = useState(getCurrentRecurringPeriod)
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const yearOptions = getRecurringPreviewYearOptions(currentYear)
  const monthOptions = getRecurringPreviewMonthOptions(year, currentYear, currentMonth)

  /* Preview state */
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  /* Confirm & Apply state */
  const [showConfirm, setShowConfirm] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')

  /* Guard refs: chống race condition & double-submit */
  const previewSeqRef = useRef(0)
  const applyInFlightRef = useRef(false)

  /* Focus trap, Escape, restore focus */
  const dialogRef = useModalFocus(onClose, applying)

  /* ── Thay đổi kỳ: Vô hiệu hóa ngay preview cũ & request in-flight ── */
  const handleMonthChange = (e) => {
    previewSeqRef.current += 1
    setMonth(Number(e.target.value))
    setPreview(null)
    setPreviewError('')
    setApplyError('')
    setShowConfirm(false)
  }

  const handleYearChange = (e) => {
    previewSeqRef.current += 1
    const nextYear = Number(e.target.value)
    setYear(nextYear)
    setMonth((previousMonth) =>
      nextYear === currentYear && previousMonth < currentMonth
        ? currentMonth
        : previousMonth
    )
    setPreview(null)
    setPreviewError('')
    setApplyError('')
    setShowConfirm(false)
  }

  /* ── Tải Preview ── */
  const handlePreview = async () => {
    if (previewLoading || applying) return
    if (!isRecurringPreviewPeriodAllowed(year, month, currentYear, currentMonth)) {
      setPreview(null)
      setPreviewError(
        `Bạn chỉ có thể kiểm tra giao dịch từ tháng ${currentMonth}/${currentYear} đến tháng 12/2100.`
      )
      return
    }
    const currentSeq = ++previewSeqRef.current
    const requestedYear = year
    const requestedMonth = month

    setPreviewLoading(true)
    setPreviewError('')
    setPreview(null)
    setApplyError('')
    setShowConfirm(false)

    try {
      const data = await onPreview(template.id, requestedYear, requestedMonth)
      // Chống race condition: bỏ qua response nếu người dùng đã đổi kỳ hoặc gọi lại
      if (currentSeq !== previewSeqRef.current) return
      // Xác thực dữ liệu preview trả về đúng kỳ yêu cầu
      if (
        data &&
        (Number(data.year) !== requestedYear || Number(data.month) !== requestedMonth)
      ) {
        setPreviewError('Thông tin giao dịch không khớp kỳ đã chọn. Vui lòng kiểm tra lại.')
        return
      }
      setPreview(data)
    } catch (err) {
      if (currentSeq !== previewSeqRef.current) return
      const status = err?.response?.status
      const serverMsg = err?.response?.data?.message
      if (!status) {
        setPreviewError('Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.')
      } else if (status === 401) {
        setPreviewError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
      } else if (status === 404) {
        setPreviewError('Mẫu định kỳ không còn tồn tại hoặc bạn không có quyền truy cập.')
      } else if (status === 400) {
        setPreviewError(serverMsg || 'Tháng/năm không hợp lệ. Vui lòng kiểm tra lại.')
      } else {
        setPreviewError('Chưa thể kiểm tra giao dịch. Vui lòng thử lại sau.')
      }
    } finally {
      if (currentSeq === previewSeqRef.current) {
        setPreviewLoading(false)
      }
    }
  }

  /* ── Xác nhận & Áp dụng ── */
  const isPreviewMatchingPeriod =
    preview &&
    Number(preview.year) === Number(year) &&
    Number(preview.month) === Number(month)

  const handleApplyConfirm = async () => {
    /* Chặn double-submit tuyệt đối */
    if (applyInFlightRef.current || applying) return

    /* Không cho Apply khi dữ liệu chưa được Preview cho đúng kỳ */
    if (!isPreviewMatchingPeriod || !preview?.canApply) {
      setApplyError('Giao dịch chưa được kiểm tra cho đúng kỳ hoặc chưa thể ghi nhận.')
      setShowConfirm(false)
      return
    }

    applyInFlightRef.current = true
    setApplying(true)
    setApplyError('')

    const currentSeq = previewSeqRef.current

    try {
      await onApply(template.id, year, month)
      applyInFlightRef.current = false
      setApplying(false)
      setShowConfirm(false)
      onApplySuccess?.({ year, month })
      onClose?.()
    } catch (err) {
      applyInFlightRef.current = false
      setApplying(false)
      const httpStatus = err?.response?.status
      const serverMsg = err?.response?.data?.message
      const code = err?.response?.data?.code

      /* Mọi lỗi mạng / timeout / không có HTTP response từ máy chủ:
       * Không rõ kết quả POST (server có thể đã ghi dữ liệu hoặc chưa).
       * Hủy xác nhận ngay, hiển thị lỗi yêu cầu Preview lại, tuyệt đối KHÔNG retry tự động. */
      if (!httpStatus) {
        setShowConfirm(false)
        setApplyError(
          'Chưa thể xác định giao dịch đã được ghi nhận hay chưa do mất kết nối hoặc quá thời gian chờ. Vui lòng bấm “Kiểm tra” lại trước khi thử tiếp.'
        )
      } else if (httpStatus === 401) {
        setApplyError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
      } else if (httpStatus === 404) {
        setApplyError('Mẫu định kỳ không còn tồn tại hoặc bạn không có quyền truy cập.')
      } else if (httpStatus === 409) {
        /* Xử lý HTTP 409 thực tế từ Backend: code=CONFLICT kèm message=ALREADY_APPLIED hoặc TEMPLATE_INACTIVE */
        setShowConfirm(false)
        const isAlreadyApplied =
          code === 'ALREADY_APPLIED' ||
          serverMsg === 'ALREADY_APPLIED' ||
          (typeof serverMsg === 'string' && serverMsg.includes('ALREADY_APPLIED'))
        const isTemplateInactive =
          code === 'TEMPLATE_INACTIVE' ||
          serverMsg === 'TEMPLATE_INACTIVE' ||
          (typeof serverMsg === 'string' && serverMsg.includes('TEMPLATE_INACTIVE'))

        if (isAlreadyApplied) {
          setApplyError(
            'Giao dịch định kỳ này đã được ghi nhận cho tháng/năm đã chọn và không thể ghi nhận lần nữa.'
          )
        } else if (isTemplateInactive) {
          setApplyError('Mẫu định kỳ đã bị tắt. Vui lòng bật lại trước khi ghi nhận.')
        } else {
          setApplyError(serverMsg || 'Dữ liệu đang bị xung đột. Vui lòng kiểm tra lại.')
        }
        // Cập nhật ngầm preview mới nhất từ server nhưng GIỮ NGUYÊN applyError cho người dùng đọc
        onPreview(template.id, year, month)
          .then((updated) => {
            if (previewSeqRef.current === currentSeq) {
              setPreview(updated)
            }
          })
          .catch(() => {})
      } else if (httpStatus >= 500) {
        setApplyError('Máy chủ đang gặp sự cố. Vui lòng thử lại sau.')
      } else {
        setApplyError(serverMsg || 'Chưa thể ghi nhận giao dịch. Vui lòng thử lại.')
      }
    }
  }

  /* ── Render ── */
  const status = resolveStatus(preview)
  const isExpense = template.type === 'EXPENSE'

  // Định dạng transactionDate ISO (YYYY-MM-DD) sang DD/MM/YYYY
  const resolvedDate = formatDisplayDate(
    preview?.transactionDate,
    template.dayOfMonth,
    year,
    month
  )

  // Cảnh báo ngày cuối tháng chỉ khi dayOfMonth > lastDay của tháng/năm đang chọn
  const lastDay = new Date(year, month, 0).getDate()
  const isClampedToLastDay = isDayClampedToMonthEnd(template.dayOfMonth, year, month)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !applying) onClose?.()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-slate-100 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#182234]"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <RefreshCw size={18} />
            </div>
            <div>
              <h2
                id="preview-modal-title"
                className="text-base font-bold text-slate-800 dark:text-slate-100"
              >
                Kiểm tra trước khi ghi nhận
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {template.categoryName || 'Mẫu định kỳ'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !applying && onClose?.()}
            disabled={applying}
            aria-label="Đóng cửa sổ kiểm tra giao dịch"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="space-y-5 p-5">
          {/* Chọn tháng/năm */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Chọn kỳ muốn ghi nhận
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              {/* Tháng */}
              <div className="min-w-0">
                <label
                  htmlFor="preview-month"
                  className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Tháng
                </label>
                <select
                  id="preview-month"
                  value={month}
                  onChange={handleMonthChange}
                  disabled={applying || previewLoading}
                  aria-describedby="preview-period-help"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-xs transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Năm */}
              <div className="min-w-0">
                <label
                  htmlFor="preview-year"
                  className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Năm
                </label>
                <select
                  id="preview-year"
                  value={year}
                  onChange={handleYearChange}
                  disabled={applying || previewLoading}
                  aria-describedby="preview-period-help"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-xs transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nút kiểm tra */}
              <div className="col-span-2 flex items-end sm:col-span-1">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewLoading || applying}
                  aria-label="Kiểm tra giao dịch trước khi ghi nhận"
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50 sm:w-auto"
                >
                  {previewLoading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                  <span>Kiểm tra</span>
                </button>
              </div>
            </div>
            <p
              id="preview-period-help"
              className="mt-2 text-xs text-slate-500 dark:text-slate-400"
            >
              Bạn có thể chọn tháng{' '}
              <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                {currentMonth}/{currentYear}
              </span>{' '}
              hoặc một tháng trong tương lai.
            </p>
          </div>

          {/* Lỗi Preview */}
          {previewError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/70 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
            >
              <WifiOff size={15} className="mt-0.5 shrink-0" />
              <span>{previewError}</span>
            </div>
          )}

          {/* Kết quả Preview */}
          {preview && isPreviewMatchingPeriod && (
            <div className="space-y-3">
              {/* Trạng thái */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Trạng thái
                </span>
                <StatusBadge status={status} />
              </div>

              {/* Chi tiết giao dịch dự kiến */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-800/40">
                {/* Loại + Ngày */}
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      isExpense
                        ? 'border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
                        : 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                    }`}
                  >
                    {isExpense ? (
                      <>
                        <ArrowDownRight size={11} />
                        <span>Chi tiêu</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpRight size={11} />
                        <span>Thu nhập</span>
                      </>
                    )}
                  </span>
                  {resolvedDate && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Calendar size={13} className="shrink-0" />
                      {resolvedDate}
                    </span>
                  )}
                </div>

                {/* Danh mục */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Danh mục</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {preview.categoryName || template.categoryName || '—'}
                  </span>
                </div>

                {/* Số tiền */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Số tiền</span>
                  <span
                    className={`text-base font-black ${
                      isExpense
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {isExpense ? '-' : '+'}
                    {formatMoney(preview.amount ?? template.amount)}
                  </span>
                </div>

                {/* Ghi chú */}
                {(preview.note || template.note) && (
                  <div className="flex items-start gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-700">
                    <FileText size={13} className="mt-0.5 shrink-0 text-slate-400" />
                    <p className="text-xs italic text-slate-500 dark:text-slate-400 line-clamp-3">
                      {preview.note || template.note}
                    </p>
                  </div>
                )}
              </div>

              {/* Cảnh báo ngày cuối tháng: CHỈ HIỂN THỊ KHI dayOfMonth > lastDay */}
              {isClampedToLastDay && (
                <div className="flex items-start gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  <Info size={13} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    Ngày {template.dayOfMonth} không tồn tại trong tháng {month}/{year} — hệ thống
                    sẽ dùng ngày {lastDay} (ngày cuối tháng).
                  </span>
                </div>
              )}

              {/* Lỗi sau Apply */}
              {applyError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/70 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                >
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{applyError}</span>
                </div>
              )}

              {/* Nút Áp dụng (chỉ khi canApply=true, chưa confirm, không đang apply và không có lỗi) */}
              {preview.canApply && !showConfirm && !applying && !applyError && (
                <button
                  type="button"
                  id="btn-apply-recurring"
                  onClick={() => setShowConfirm(true)}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-95"
                >
                  Ghi nhận giao dịch tháng {month}/{year}
                </button>
              )}
            </div>
          )}

          {/* Lỗi Apply hiển thị khi preview chưa tải hoặc đã bị vô hiệu hóa */}
          {applyError && (!preview || !isPreviewMatchingPeriod) && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/70 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{applyError}</span>
            </div>
          )}

          {/* Hướng dẫn ban đầu khi chưa xem trước hoặc sau khi đổi kỳ */}
          {(!preview || !isPreviewMatchingPeriod) && !previewLoading && !previewError && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-6 text-center dark:border-slate-700">
              <RefreshCw size={22} className="text-slate-300 dark:text-slate-600" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chọn tháng/năm rồi bấm{' '}
                <strong className="font-semibold text-blue-600 dark:text-blue-400">Kiểm tra</strong>{' '}
                để xem ngày, danh mục và số tiền trước khi ghi nhận.
              </p>
            </div>
          )}
        </div>

        {/* ── Confirm Dialog (inline) ── */}
        {showConfirm && isPreviewMatchingPeriod && (
          <div className="border-t border-slate-100 p-5 dark:border-slate-800">
            <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-blue-200/80 bg-blue-50/70 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
              <Info size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <p className="text-xs text-blue-800 dark:text-blue-200">
                Xác nhận tạo giao dịch{' '}
                <strong className="font-semibold">
                  {isExpense ? 'Chi tiêu' : 'Thu nhập'}{' '}
                  {formatMoney(preview?.amount ?? template.amount)}
                </strong>{' '}
                cho tháng {month}/{year}? Hành động này sẽ tạo một giao dịch thật trong hệ thống.
              </p>
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false)
                  setApplyError('')
                }}
                disabled={applying}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Huỷ
              </button>
              <button
                type="button"
                id="btn-confirm-apply-recurring"
                onClick={handleApplyConfirm}
                disabled={applying}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {applying ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <span>Xác nhận ghi nhận</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Wrapper Modal (Quản lý vòng đời & reset state sạch sẽ) ─── */
export default function RecurringPreviewModal(props) {
  if (!props.isOpen || !props.template) return null
  return <RecurringPreviewModalContent key={props.template.id} {...props} />
}
