import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Download,
  Filter,
  Loader2,
  RefreshCw,
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
import { Button } from '../components/ui/button.jsx'
import {
  MAX_REPORT_MONTHS,
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR,
  REPORT_PRESETS,
  buildPresetRange,
  formatShortMonthLabel,
  getCurrentVietnamMonth,
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

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Báo cáo thu – chi &amp; Thống kê
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đang xem {formatShortMonthLabel(appliedRange.from)}
            {appliedRange.from !== appliedRange.to && ` – ${formatShortMonthLabel(appliedRange.to)}`}
          </p>
        </div>
        <div role="group" aria-label="Chọn nhanh kỳ báo cáo" className="flex flex-wrap gap-2">
          {REPORT_PRESETS.map((preset) => {
            const isSelected = activePreset === preset.id && !isDraftChanged
            return (
              <Button
                key={preset.id}
                variant={isSelected ? 'default' : 'outline'}
                aria-pressed={isSelected}
                onClick={() => handleSelectPreset(preset.id)}
                className="min-h-10 px-3 text-xs"
              >
                {preset.label}
              </Button>
            )
          })}
        </div>
      </div>

      <section aria-label="Chọn kỳ báo cáo" className="rounded-2xl border border-border bg-card p-4 shadow-panel">
        <form
          onSubmit={handleApplyRange}
          aria-label="Bộ lọc khoảng tháng báo cáo"
          aria-describedby="report-range-limit"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[8rem] flex-1">
            <label htmlFor="report-from-month" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Từ tháng
            </label>
            <MonthPickerInput
              id="report-from-month"
              min={`${MIN_REPORT_YEAR}-01`}
              max={`${MAX_REPORT_YEAR}-12`}
              value={draftFrom}
              onChange={(event) => {
                setDraftFrom(event.target.value)
                setActivePreset('')
              }}
            />
          </div>

          <div className="min-w-[8rem] flex-1">
            <label htmlFor="report-to-month" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Đến tháng
            </label>
            <MonthPickerInput
              id="report-to-month"
              min={`${MIN_REPORT_YEAR}-01`}
              max={`${MAX_REPORT_YEAR}-12`}
              value={draftTo}
              onChange={(event) => {
                setDraftTo(event.target.value)
                setActivePreset('')
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!draftValidation.valid || loading} className="px-3">
              <Filter size={15} aria-hidden="true" />
              Xem báo cáo
            </Button>
            <Button variant="outline" onClick={handleRetry} disabled={loading} aria-label="Làm mới dữ liệu báo cáo" className="px-3">
              <RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
              Làm mới
            </Button>
            <Button
              id="reports-export-csv-btn"
              variant="outline"
              onClick={handleExportCsv}
              disabled={exporting || !appliedValidation.valid}
              aria-busy={exporting}
              className="px-3"
            >
              {exporting ? (
                <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Download size={15} aria-hidden="true" />
              )}
              Tải CSV
            </Button>
          </div>
        </form>
        <p id="report-range-limit" className="mt-2 text-xs text-muted-foreground">Chọn tối đa {MAX_REPORT_MONTHS} tháng.</p>

        {!draftValidation.valid && (
          <div role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
            <span>{draftValidation.message}</span>
          </div>
        )}
      </section>
      {/* Cảnh báo lỗi xuất CSV hoặc lỗi API */}
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

      {/* Biểu đồ thu – chi và bảng chi tiêu theo danh mục */}
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
