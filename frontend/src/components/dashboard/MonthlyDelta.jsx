import { calculateMonthlyDelta } from './monthlyInsights.js'
import { formatReportMoney, formatReportPercent, formatShortMonthLabel, shiftMonthString } from '../reports/reportUtils.js'

export default function MonthlyDelta({ current, previous, field, month, onRetry }) {
  if (current.status === 'loading' || previous.status === 'loading') {
    return <p role="status" className="mt-2 text-xs text-slate-500 dark:text-slate-400">Đang tải so sánh tháng trước…</p>
  }
  if (current.status === 'error' || previous.status === 'error') {
    return (
      <div role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
        <p>Không tải được dữ liệu so sánh tháng trước.</p>
        <button type="button" onClick={onRetry} className="min-h-10 underline focus-visible:outline-2 focus-visible:outline-blue-500">Thử lại so sánh</button>
      </div>
    )
  }
  const { delta, direction, percentage } = calculateMonthlyDelta(current.data[field], previous.data[field])
  const label = { increase: 'Tăng', decrease: 'Giảm', unchanged: 'Không đổi' }[direction]
  return (
    <p role="status" className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
      {label} {formatReportMoney(Math.abs(delta))}
      {percentage === null
        ? ` · ${delta === 0 ? 'Không có dữ liệu kỳ trước' : 'Mới phát sinh'}`
        : ` (${formatReportPercent(Math.abs(percentage))})`}
      {' '}so với {formatShortMonthLabel(shiftMonthString(month, -1))}.
    </p>
  )
}
