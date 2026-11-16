import { formatMoney, getBudgetDisplayStatus, getBudgetUsagePercentage, getStatusConfig, getBudgetRemaining } from './categoryBudgetUtils.js'

export default function BudgetUsage({ budget }) {
  const status = getBudgetDisplayStatus(budget)
  const config = getStatusConfig(status, { clarifyWarning: true })
  const percentage = getBudgetUsagePercentage(budget)
  const width = Math.min(100, Math.max(0, percentage))
  return (
    <div className="space-y-2" data-budget-status={status}>
      <div role="progressbar" aria-label="Tỷ lệ sử dụng ngân sách tháng" aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} aria-valuetext={`${percentage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% · ${config.label}`} className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${config.barColor}`} style={{ width: `${width}%` }} />
      </div>
      <p role="status" className={`text-xs font-semibold ${config.textColor}`}>
        {config.label} · Đã sử dụng {percentage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%
        {status === 'OVER_BUDGET' && ` · Số tiền vượt: ${formatMoney(-getBudgetRemaining(budget))}`}
      </p>
    </div>
  )
}
