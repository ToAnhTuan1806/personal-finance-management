import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR,
  formatMonthLabel,
  formatMonthValue,
  formatShortMonthLabel,
  getCurrentVietnamMonth,
  parseMonthString,
} from '../reports/reportUtils.js'

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)
const POPUP_WIDTH = 304
const VIEWPORT_GAP = 8

function resolveBounds(min, max) {
  const parsedMin = parseMonthString(min) || { year: MIN_REPORT_YEAR, month: 1 }
  const parsedMax = parseMonthString(max) || { year: MAX_REPORT_YEAR, month: 12 }
  const minValue = formatMonthValue(parsedMin.year, parsedMin.month)
  const maxValue = formatMonthValue(parsedMax.year, parsedMax.month)

  if (minValue > maxValue) {
    return {
      minValue: `${MIN_REPORT_YEAR}-01`,
      maxValue: `${MAX_REPORT_YEAR}-12`,
      minYear: MIN_REPORT_YEAR,
      maxYear: MAX_REPORT_YEAR,
    }
  }

  return {
    minValue,
    maxValue,
    minYear: parsedMin.year,
    maxYear: parsedMax.year,
  }
}

function clampYear(year, minYear, maxYear) {
  return Math.min(Math.max(Number(year) || minYear, minYear), maxYear)
}

function isAllowedMonth(value, minValue, maxValue) {
  return Boolean(parseMonthString(value)) && value >= minValue && value <= maxValue
}

export function MonthPickerPanel({
  panelId,
  visibleYear,
  value,
  min = `${MIN_REPORT_YEAR}-01`,
  max = `${MAX_REPORT_YEAR}-12`,
  theme = 'default',
  onYearChange,
  onSelect,
  onClear,
  onClose,
  panelRef,
  activeMonthRef,
  style,
}) {
  const { minValue, maxValue, minYear, maxYear } = resolveBounds(min, max)
  const safeYear = clampYear(visibleYear, minYear, maxYear)
  const currentMonth = getCurrentVietnamMonth()
  const current = parseMonthString(currentMonth)
  const selected = parseMonthString(value)
  const yearOptions = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index),
    [minYear, maxYear]
  )
  const focusValue =
    selected?.year === safeYear && isAllowedMonth(value, minValue, maxValue)
      ? value
      : current?.year === safeYear && isAllowedMonth(currentMonth, minValue, maxValue)
        ? currentMonth
        : MONTHS.map((month) => formatMonthValue(safeYear, month)).find((monthValue) =>
            isAllowedMonth(monthValue, minValue, maxValue)
          )
  const isDarkPanel = theme === 'dark-panel'
  const selectClass = isDarkPanel
    ? 'border-white/15 bg-slate-800 text-white'
    : 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
  const surfaceClass = isDarkPanel
    ? 'border-white/15 bg-slate-900 text-white'
    : 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-[#182234] dark:text-slate-100'
  const iconButtonClass = isDarkPanel
    ? 'text-slate-300 hover:bg-white/10'
    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
  const currentMonthClass = isDarkPanel
    ? 'border-blue-700 bg-blue-950/50 text-blue-300'
    : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
  const idleMonthClass = isDarkPanel
    ? 'border-transparent bg-slate-800 text-slate-200 hover:border-blue-700 hover:bg-slate-700'
    : 'border-transparent bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:bg-slate-700'
  const dividerClass = isDarkPanel
    ? 'border-white/10'
    : 'border-slate-200 dark:border-slate-700'

  return (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="Chọn tháng và năm"
      data-month-picker-locale="vi"
      className={`fixed z-[100] rounded-2xl border p-3 shadow-2xl ${surfaceClass}`}
      style={style}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onYearChange?.(safeYear - 1)}
          disabled={safeYear <= minYear}
          aria-label="Năm trước"
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${iconButtonClass}`}
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>

        <label htmlFor={`${panelId}-year`} className="sr-only">
          Chọn năm
        </label>
        <select
          id={`${panelId}-year`}
          value={safeYear}
          onChange={(event) => onYearChange?.(Number(event.target.value))}
          className={`h-9 min-w-0 flex-1 rounded-lg border px-2 text-center text-sm font-bold focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${selectClass}`}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              Năm {year}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onYearChange?.(safeYear + 1)}
          disabled={safeYear >= maxYear}
          aria-label="Năm sau"
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${iconButtonClass}`}
        >
          <ChevronRight size={17} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bộ chọn tháng"
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${iconButtonClass}`}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Các tháng trong năm ${safeYear}`}>
        {MONTHS.map((month) => {
          const monthValue = formatMonthValue(safeYear, month)
          const isSelected = monthValue === value
          const isCurrent = monthValue === currentMonth
          const isDisabled = !isAllowedMonth(monthValue, minValue, maxValue)
          const shouldFocus = monthValue === focusValue

          return (
            <button
              key={month}
              ref={shouldFocus ? activeMonthRef : undefined}
              type="button"
              data-month={monthValue}
              onClick={() => onSelect?.(monthValue)}
              disabled={isDisabled}
              aria-label={`Tháng ${month} năm ${safeYear}`}
              aria-pressed={isSelected}
              aria-current={isCurrent ? 'date' : undefined}
              className={`relative min-h-10 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isSelected
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : isCurrent
                    ? currentMonthClass
                    : idleMonthClass
              } disabled:cursor-not-allowed disabled:opacity-30`}
            >
              <span>Tháng {month}</span>
              {isSelected && (
                <Check size={12} className="absolute right-1 top-1" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>

      <div className={`mt-3 flex items-center justify-between border-t pt-3 ${dividerClass}`}>
        <button
          type="button"
          onClick={onClear}
          disabled={!value}
          className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            isDarkPanel
              ? 'text-slate-300 hover:bg-white/10 hover:text-white'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Xóa lựa chọn
        </button>
        <button
          type="button"
          onClick={() => onSelect?.(currentMonth)}
          disabled={!isAllowedMonth(currentMonth, minValue, maxValue)}
          className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            isDarkPanel
              ? 'text-blue-300 hover:bg-blue-950/60'
              : 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40'
          }`}
        >
          Tháng hiện tại
        </button>
      </div>
    </div>
  )
}

export default function MonthPickerInput({
  id,
  name,
  value = '',
  onChange,
  min = `${MIN_REPORT_YEAR}-01`,
  max = `${MAX_REPORT_YEAR}-12`,
  disabled = false,
  format = 'full', // 'full': "Tháng 11/2026", 'short': "11/2026"
  theme = 'default', // 'default' | 'dark-panel' | 'compact'
  className = '',
  'aria-label': ariaLabel,
}) {
  const generatedId = useId().replaceAll(':', '')
  const triggerId = id || `month-picker-${generatedId}`
  const panelId = `${triggerId}-panel`
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const activeMonthRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0, width: POPUP_WIDTH })
  const { minYear, maxYear } = resolveBounds(min, max)
  const selected = parseMonthString(value)
  const current = parseMonthString(getCurrentVietnamMonth())
  const [visibleYear, setVisibleYear] = useState(() =>
    clampYear(selected?.year || current?.year || minYear, minYear, maxYear)
  )
  const pickerOpen = isOpen && !disabled

  const displayLabel = value
    ? format === 'short'
      ? formatShortMonthLabel(value)
      : formatMonthLabel(value)
    : 'Chọn tháng'

  const isDarkPanel = theme === 'dark-panel'
  const isCompact = theme === 'compact'

  const updatePanelPosition = () => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return

    const rect = trigger.getBoundingClientRect()
    const width = Math.min(POPUP_WIDTH, window.innerWidth - VIEWPORT_GAP * 2)
    const panelHeight = panelRef.current?.offsetHeight || 330
    const left = Math.min(
      Math.max(VIEWPORT_GAP, rect.left),
      Math.max(VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP)
    )
    const hasRoomBelow = window.innerHeight - rect.bottom >= panelHeight + VIEWPORT_GAP
    const top = hasRoomBelow
      ? rect.bottom + VIEWPORT_GAP
      : Math.max(VIEWPORT_GAP, rect.top - panelHeight - VIEWPORT_GAP)

    setPanelPosition({ top, left, width })
  }

  const closePicker = (restoreFocus = false) => {
    setIsOpen(false)
    if (restoreFocus && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
  }

  const openPicker = () => {
    if (disabled) return
    const nextYear = clampYear(selected?.year || current?.year || minYear, minYear, maxYear)
    setVisibleYear(nextYear)
    updatePanelPosition()
    setIsOpen(true)
  }

  const emitChange = (nextValue) => {
    const field = { id: triggerId, name, type: 'month', value: nextValue }
    onChange?.({ target: field, currentTarget: field })
  }

  const handleSelect = (nextValue) => {
    emitChange(nextValue)
    closePicker(true)
  }

  useEffect(() => {
    if (!pickerOpen) return undefined

    updatePanelPosition()
    const focusFrame = window.requestAnimationFrame(() => activeMonthRef.current?.focus())
    const handlePointerDown = (event) => {
      if (
        !rootRef.current?.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      ) {
        closePicker(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePicker(true)
      }
    }
    const handleViewportChange = () => updatePanelPosition()

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [pickerOpen])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        aria-controls={panelId}
        data-month-picker-trigger="vi"
        onClick={() => (pickerOpen ? closePicker(false) : openPicker())}
        className={`relative flex w-full items-center justify-between text-left transition-all ${
          isDarkPanel
            ? 'rounded-xl border border-white/20 bg-slate-900/60 px-3.5 py-2 text-xs font-bold text-white focus:border-blue-400 focus:ring-2 focus:ring-blue-400 sm:text-sm'
            : isCompact
              ? 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100'
              : 'rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100 dark:focus:ring-blue-900/40'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500'} ${className}`}
      >
        <span className="truncate select-none">{displayLabel}</span>
        <Calendar
          size={isCompact ? 13 : 16}
          className={`pointer-events-none ml-2 shrink-0 ${
            isDarkPanel ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'
          }`}
          aria-hidden="true"
        />
      </button>

      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}

      {pickerOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <MonthPickerPanel
            panelId={panelId}
            visibleYear={visibleYear}
            value={value}
            min={min}
            max={max}
            theme={theme}
            onYearChange={setVisibleYear}
            onSelect={handleSelect}
            onClear={() => {
              emitChange('')
              closePicker(true)
            }}
            onClose={() => closePicker(true)}
            panelRef={panelRef}
            activeMonthRef={activeMonthRef}
            style={panelPosition}
          />,
          document.body
        )}
    </div>
  )
}
