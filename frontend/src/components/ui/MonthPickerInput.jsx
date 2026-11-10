import { Calendar } from 'lucide-react'
import { formatMonthLabel, formatShortMonthLabel } from '../reports/reportUtils.js'

export default function MonthPickerInput({
  id,
  name,
  value = '',
  onChange,
  min = '1900-01',
  max = '2100-12',
  disabled = false,
  format = 'full', // 'full': "Tháng 11/2026", 'short': "11/2026"
  theme = 'default', // 'default' | 'dark-panel' | 'compact'
  className = '',
  'aria-label': ariaLabel,
}) {
  const displayLabel = value
    ? format === 'short'
      ? formatShortMonthLabel(value)
      : formatMonthLabel(value)
    : 'Chọn tháng'

  const isDarkPanel = theme === 'dark-panel'
  const isCompact = theme === 'compact'

  const handleContainerClick = () => {
    if (disabled || !id) return
    const input = document.getElementById(id)
    if (input && typeof input.showPicker === 'function') {
      try {
        input.showPicker()
      } catch {
        input.focus()
      }
    }
  }

  return (
    <div
      onClick={handleContainerClick}
      className={`relative flex items-center justify-between transition-all ${
        isDarkPanel
          ? 'rounded-xl border border-white/20 bg-slate-900/60 px-3.5 py-2 text-xs sm:text-sm font-bold text-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400'
          : isCompact
            ? 'rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500'
            : 'rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3.5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/40 shadow-2xs'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500'} ${className}`}
    >
      <span className="truncate select-none">
        {displayLabel}
      </span>
      <Calendar
        size={isCompact ? 13 : 16}
        className={`shrink-0 ml-2 pointer-events-none ${
          isDarkPanel
            ? 'text-blue-200'
            : 'text-slate-400 dark:text-slate-500'
        }`}
        aria-hidden="true"
      />
      <input
        id={id}
        name={name}
        type="month"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={onChange}
        onClick={(e) => {
          try {
            e.target.showPicker?.()
          } catch {
            // Ignore if showPicker is unsupported
          }
        }}
        className="custom-month-input absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
      />
    </div>
  )
}
