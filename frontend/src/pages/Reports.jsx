import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { getApiErrorMessage, isRequestCancelled } from '../api/errors.js'
import { useQuickAdd } from '../contexts/QuickAddContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { getMonthlyReport } from '../services/reportService.js'
import {
  exportTransactionsCsv,
  getCsvExportErrorMessage,
  monthRangeToDateRange,
} from '../services/csvExportService.js'
import MonthlyComparisonChart from '../components/reports/MonthlyComparisonChart.jsx'
import CategoryBreakdownSection from '../components/reports/CategoryBreakdownSection.jsx'
import MonthPickerInput from '../components/ui/MonthPickerInput.jsx'
import {
  MAX_REPORT_MONTHS,
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR,
  REPORT_PRESETS,
  buildPresetRange,
  formatReportMoney,
  formatReportPercent,
  formatShortMonthLabel,
  getCurrentVietnamMonth,
  summarizeReportMonths,
  validateMonthRange,
} from '../components/reports/reportUtils.js'

export function ReportsPage({
  anchorMonth,
  initialReport = null,
  initialLoading = true,
  initialError = '',
  initialExporting = false,
  initialExportError = '',
  fetchReport = getMonthlyReport,
  onExportCsv = exportTransactionsCsv,
  toast = null,
}) {
  let mutationVersion
  try {
    const quickAdd = useQuickAdd()
    mutationVersion = quickAdd?.mutationVersion ?? 0
  } catch {
    mutationVersion = 0
  }

  const resolvedAnchor = useMemo(
    () => anchorMonth || getCurrentVietnamMonth(),
    [anchorMonth]
  )

  const defaultRange = useMemo(
    () =>
      initialReport?.from && initialReport?.to
        ? {
            from: initialReport.from,
            to: initialReport.to,
          }
        : buildPresetRange('3M', resolvedAnchor),
    [initialReport, resolvedAnchor]
  )

  const [draftFrom, setDraftFrom] = useState(defaultRange.from)
  const [draftTo, setDraftTo] = useState(defaultRange.to)
  const [appliedRange, setAppliedRange] = useState(defaultRange)
  const [activePreset, setActivePreset] = useState('3M')

  const [report, setReport] = useState(initialReport)
  const [loading, setLoading] = useState(initialLoading)
  const [error, setError] = useState(initialError)
  const [exporting, setExporting] = useState(initialExporting)
  const [exportError, setExportError] = useState(initialExportError)
  const exportingRef = useRef(false)
  const [reloadKey, setReloadKey] = useState(0)

  const appliedValidation = useMemo(
    () => validateMonthRange(appliedRange.from, appliedRange.to),
    [appliedRange.from, appliedRange.to]
  )

  const draftValidation = useMemo(
    () => validateMonthRange(draftFrom, draftTo),
    [draftFrom, draftTo]
  )

  const isDraftChanged =
    draftFrom !== appliedRange.from || draftTo !== appliedRange.to

  useEffect(() => {
    if (
      initialReport !== null &&
      reloadKey === 0 &&
      appliedRange.from === defaultRange.from &&
      appliedRange.to === defaultRange.to &&
      !initialLoading
    ) {
      return undefined
    }

    let ignore = false

    fetchReport({
      from: appliedRange.from,
      to: appliedRange.to,
    })
      .then((data) => {
        if (ignore) return
        setReport(data)
        setError('')
      })
      .catch((err) => {
        if (ignore) return
        setReport(null)
        const msg = getApiErrorMessage(err)
        if (msg) setError(msg)
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [
    appliedRange.from,
    appliedRange.to,
    reloadKey,
    mutationVersion,
    fetchReport,
    initialReport,
    initialLoading,
    defaultRange.from,
    defaultRange.to,
  ])

  const handleSelectPreset = (presetId) => {
    const nextRange = buildPresetRange(presetId, resolvedAnchor)
    setDraftFrom(nextRange.from)
    setDraftTo(nextRange.to)
    setActivePreset(presetId)

    const validation = validateMonthRange(nextRange.from, nextRange.to)
    if (validation.valid) {
      setLoading(true)
      setError('')
      setExportError('')
      setAppliedRange(nextRange)
      setReloadKey((prev) => prev + 1)
    }
  }

  const handleApplyRange = (event) => {
    if (event) event.preventDefault()
    if (!draftValidation.valid) return
    setLoading(true)
    setError('')
    setExportError('')
    setAppliedRange({
      from: draftFrom,
      to: draftTo,
    })
    setReloadKey((prev) => prev + 1)
  }

  const handleRetry = () => {
    setLoading(true)
    setError('')
    setReloadKey((prev) => prev + 1)
  }

  const handleExportCsv = async () => {
    if (exportingRef.current || exporting) return
    exportingRef.current = true
    setExporting(true)
    setExportError('')

    try {
      const dateRange = monthRangeToDateRange(appliedRange.from, appliedRange.to)
      await onExportCsv(dateRange)
      toast?.success('Đã tải xuống file CSV báo cáo.')
    } catch (err) {
      if (!isRequestCancelled(err)) {
        const msg = getCsvExportErrorMessage(err)
        if (msg) {
          setExportError(msg)
          toast?.error(msg)
        }
      }
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }

  const summary = useMemo(
    () =>
      report?.summary ??
      summarizeReportMonths(Array.isArray(report?.months) ? report.months : []),
    [report]
  )

  const totalIncome = Number(summary.totalIncome || 0)
  const totalExpense = Number(summary.totalExpense || 0)
  const balance = Number(summary.balance ?? totalIncome - totalExpense)
  const savingRate =
    totalIncome > 0 && balance > 0 ? (balance / totalIncome) * 100 : 0
  const expenseRatio =
    totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header & Bộ lọc khoảng tháng */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 sm:p-8 text-white shadow-xl shadow-blue-900/10">
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200 backdrop-blur-md">
              <BarChart3 size={14} className="text-amber-300" />
              <span>Phân tích đa kỳ (tối đa {MAX_REPORT_MONTHS} tháng)</span>
            </span>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Báo cáo thu – chi &amp; Thống kê
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-2xl">
              So sánh thu nhập, chi tiêu và chênh lệch từ{' '}
              <strong className="text-white">
                {formatShortMonthLabel(appliedRange.from)}
              </strong>{' '}
              đến{' '}
              <strong className="text-white">
                {formatShortMonthLabel(appliedRange.to)}
              </strong>{' '}
              cùng cơ cấu chi tiêu theo danh mục.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {REPORT_PRESETS.map((preset) => {
              const isSelected = activePreset === preset.id && !isDraftChanged
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  aria-pressed={isSelected}
                  className={`min-h-9 rounded-xl px-3.5 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-md'
                      : 'border border-white/15 bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Form chọn khoảng tháng */}
        <form
          onSubmit={handleApplyRange}
          className="relative z-10 mt-6 flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-end"
          aria-label="Bộ lọc khoảng tháng báo cáo"
        >
          <div className="flex-1 min-w-[160px]">
            <label
              htmlFor="report-from-month"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-blue-200"
            >
              <Calendar size={13} />
              <span>Từ tháng</span>
            </label>
            <MonthPickerInput
              id="report-from-month"
              min={`${MIN_REPORT_YEAR}-01`}
              max={`${MAX_REPORT_YEAR}-12`}
              value={draftFrom}
              theme="dark-panel"
              onChange={(event) => {
                setDraftFrom(event.target.value)
                setActivePreset('')
              }}
            />
          </div>

          <div className="flex-1 min-w-[160px]">
            <label
              htmlFor="report-to-month"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-blue-200"
            >
              <Calendar size={13} />
              <span>Đến tháng</span>
            </label>
            <MonthPickerInput
              id="report-to-month"
              min={`${MIN_REPORT_YEAR}-01`}
              max={`${MAX_REPORT_YEAR}-12`}
              value={draftTo}
              theme="dark-panel"
              onChange={(event) => {
                setDraftTo(event.target.value)
                setActivePreset('')
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1 sm:pt-0">
            <button
              type="submit"
              disabled={!draftValidation.valid || loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-500/25 transition-all hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Filter size={15} />
              <span>Xem báo cáo</span>
            </button>

            <button
              type="button"
              onClick={handleRetry}
              disabled={loading}
              aria-label="Làm mới dữ liệu báo cáo"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
            >
              <RefreshCw
                size={15}
                className={loading ? 'animate-spin' : ''}
              />
              <span>Làm mới</span>
            </button>

            <button
              type="button"
              id="reports-export-csv-btn"
              onClick={handleExportCsv}
              disabled={exporting || !appliedValidation.valid}
              aria-busy={exporting}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <Download size={15} aria-hidden="true" />
              )}
              <span>Tải CSV</span>
            </button>
          </div>
        </form>

        {/* Thông báo lỗi khoảng tháng nếu không hợp lệ */}
        {!draftValidation.valid && (
          <div
            role="alert"
            className="relative z-10 mt-3 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-3.5 py-2.5 text-xs font-semibold text-amber-200"
          >
            <AlertCircle size={16} className="shrink-0 text-amber-300" />
            <span>{draftValidation.message}</span>
          </div>
        )}
      </section>

      {/* 2. Cảnh báo lỗi xuất CSV hoặc lỗi API nếu có */}
      {exportError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={19} className="shrink-0" />
            <span>{exportError}</span>
          </div>
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={19} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <RefreshCw size={14} />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* 3. Ba thẻ KPI Tổng hợp kỳ báo cáo */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Tổng thu nhập */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tổng thu nhập
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ArrowDownRight size={20} />
            </span>
          </div>
          <div className="mt-3">
            {report ? (
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {formatReportMoney(totalIncome)}
              </p>
            ) : (
              <span
                className="text-2xl font-bold text-slate-400"
                aria-label="Chưa tải được tổng thu nhập"
              >
                —
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            Cộng dồn từ {formatShortMonthLabel(appliedRange.from)} đến{' '}
            {formatShortMonthLabel(appliedRange.to)}
          </p>
        </div>

        {/* Tổng chi tiêu */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tổng chi tiêu
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <ArrowUpRight size={20} />
            </span>
          </div>
          <div className="mt-3">
            {report ? (
              <p className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
                {formatReportMoney(totalExpense)}
              </p>
            ) : (
              <span
                className="text-2xl font-bold text-slate-400"
                aria-label="Chưa tải được tổng chi tiêu"
              >
                —
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            {report && totalIncome > 0
              ? `Chiếm ${formatReportPercent(expenseRatio)} tổng thu nhập kỳ này`
              : 'Tổng các khoản chi tiêu trong kỳ báo cáo'}
          </p>
        </div>

        {/* Chênh lệch thu - chi */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500/40 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-purple-500/10 p-5 sm:p-6 shadow-md dark:border-blue-500/40 dark:from-[#182234] dark:to-[#1E293B]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Chênh lệch thu – chi
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/30">
              <Wallet size={20} />
            </span>
          </div>
          <div className="mt-3">
            {report ? (
              <p
                className={`text-2xl sm:text-3xl font-black ${
                  balance >= 0
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {balance > 0 ? '+' : ''}
                {formatReportMoney(balance)}
              </p>
            ) : (
              <span
                className="text-2xl font-bold text-slate-400"
                aria-label="Chưa tải được chênh lệch thu chi"
              >
                —
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
            {report
              ? savingRate > 0
                ? `Tiết kiệm ${formatReportPercent(savingRate)} thu nhập trong kỳ`
                : balance < 0
                ? 'Chi tiêu vượt thu nhập trong kỳ đã chọn'
                : 'Thu – chi cân bằng trong kỳ đã chọn'
              : 'Số dư ròng trong khoảng thời gian đã chọn'}
          </p>
        </div>
      </div>

      {/* 4. Biểu đồ cột thu – chi & Bảng chi tiêu theo danh mục */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MonthlyComparisonChart
          report={report}
          loading={loading}
          error={error}
          onRetry={handleRetry}
        />

        <CategoryBreakdownSection
          report={report}
          loading={loading}
          error={error}
          onRetry={handleRetry}
        />
      </div>
    </div>
  )
}

export default function Reports() {
  const toast = useToast()
  return <ReportsPage toast={toast} />
}
