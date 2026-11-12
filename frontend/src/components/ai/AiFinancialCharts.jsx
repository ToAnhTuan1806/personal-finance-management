import { formatMonthLabel, formatReportMoney, formatReportPercent } from '../reports/reportUtils.js'

// Tỷ lệ dưới đây chỉ phục vụ vẽ; tiền/delta/% nghiệp vụ luôn lấy nguyên từ Backend.
export function AiComparisonChart({ comparison }) {
  const metrics = [['totalIncome', 'Tổng thu'], ['totalExpense', 'Tổng chi'], ['balance', 'Số dư']]
  if (!comparison || !metrics.every(([key]) => Number.isFinite(comparison.base?.[key]) && Number.isFinite(comparison.target?.[key]))) return null
  const max = Math.max(...metrics.flatMap(([key]) => [Math.abs(comparison.base[key]), Math.abs(comparison.target[key])]), 1)
  const description = metrics.map(([key, label]) => `${label}: ${formatReportMoney(comparison.base[key])} đến ${formatReportMoney(comparison.target[key])}`).join('; ')
  return (
    <figure aria-label="Biểu đồ so sánh thu chi" className="min-w-0 rounded-xl border border-slate-200 p-2 dark:border-slate-700">
      <figcaption className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        <p><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded bg-slate-400" />Kỳ gốc: {formatMonthLabel(comparison.baseMonth)}</p>
        <p><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded bg-blue-600 dark:bg-blue-400" />Kỳ đích: {formatMonthLabel(comparison.targetMonth)}</p>
      </figcaption>
      <svg viewBox="0 0 320 240" className="mt-1 block h-auto w-full text-slate-600 dark:text-slate-300" role="img" aria-label={description}>
        <title>{description}</title>
        <line x1="160" x2="160" y1="0" y2="235" stroke="currentColor" strokeDasharray="3 3" opacity="0.4" />
        {metrics.map(([key, label], index) => <g key={key}>
          <text x="4" y={index * 78 + 17} fill="currentColor" fontSize="12">{label}</text>
          {['base', 'target'].map((period, row) => {
            const value = comparison[period][key]
            const width = Math.abs(value) / max * 150
            return <rect key={period} x={value < 0 ? 160 - width : 160} y={index * 78 + 27 + row * 20} width={width} height="13" rx="3" className={period === 'base' ? 'fill-slate-400' : 'fill-blue-600 dark:fill-blue-400'} />
          })}
        </g>)}
      </svg>
    </figure>
  )
}

export function AiCategoryChart({ categories, period }) {
  if (!Array.isArray(categories) || !categories.length || !categories.every(c => Number.isFinite(c.totalAmount) && c.totalAmount >= 0)) return null
  const max = Math.max(...categories.map(c => c.totalAmount), 1)
  return <figure aria-label="Biểu đồ chi tiêu theo danh mục" className="min-w-0 space-y-2">
    <figcaption className="text-[11px] text-slate-500 dark:text-slate-400">{formatMonthLabel(period)} · Độ dài thanh theo số tiền</figcaption>
    <ul className="space-y-2">{categories.map(category => <li key={category.categoryId} className="min-w-0 space-y-1">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 text-xs">
        <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{category.categoryName}</span>
        <span className="max-w-full text-right font-bold [overflow-wrap:anywhere]">{formatReportMoney(category.totalAmount)} <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">({formatReportPercent(category.sharePercentage)})</span></span>
      </div>
      <svg viewBox="0 0 280 8" className="block h-2 w-full" role="img" aria-label={`${category.categoryName}: ${formatReportMoney(category.totalAmount)}`}>
        <rect width="280" height="8" rx="4" className="fill-slate-200 dark:fill-slate-700" />
        <rect width={category.totalAmount / max * 280} height="8" rx="4" className="fill-blue-600 dark:fill-blue-400" />
      </svg>
    </li>)}</ul>
  </figure>
}
