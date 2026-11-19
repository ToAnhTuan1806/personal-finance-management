import { AiComparisonChart } from './AiFinancialCharts.jsx'
import { normalizeAiComparison } from '../../services/aiChatService.js'
import { formatMonthLabel, formatReportMoney, formatReportPercent } from '../reports/reportUtils.js'

const direction = (value) => value > 0 ? 'Tăng' : value < 0 ? 'Giảm' : 'Không đổi'
const signedMoney = (value) => `${value > 0 ? '+' : ''}${formatReportMoney(value)}`
const expenseTone = (value) => value > 0
  ? 'text-expense' : value < 0
    ? 'text-income' : 'text-muted-foreground'

function CategoryTrends({ items }) {
  return <ul className="space-y-2">{items.map(item => (
    <li key={item.categoryId} className="min-w-0 rounded-xl border border-border bg-muted p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-1 text-xs">
        <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{item.categoryName}</span>
        <span className={`font-semibold tabular-nums [overflow-wrap:anywhere] ${expenseTone(item.delta)}`}>{direction(item.delta)} · {signedMoney(item.delta)}</span>
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground [overflow-wrap:anywhere]">
        {formatReportMoney(item.baseExpense)} → {formatReportMoney(item.targetExpense)}
        {' · '}{item.changePercent === null ? 'Không tính được % vì kỳ gốc bằng 0.' : `Thay đổi: ${formatReportPercent(item.changePercent)}`}
      </p>
    </li>
  ))}</ul>
}

export default function AiComparisonCard({ comparison, period, intent = 'COMPARISON' }) {
  let data
  try {
    data = normalizeAiComparison(comparison, period)
  } catch {
    return <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">Chưa nhận được dữ liệu so sánh hợp lệ. Vui lòng thử lại.</p>
  }
  const metrics = [
    ['totalIncome', 'Tổng thu'], ['totalExpense', 'Tổng chi'], ['balance', 'Số dư'],
  ]
  const empty = data.base.totalIncome === 0 && data.base.totalExpense === 0
    && data.target.totalIncome === 0 && data.target.totalExpense === 0 && data.categoryTrends.length === 0
  const categoryPreview = intent === 'CATEGORY_TREND'
  const rankedCategories = [...data.categoryTrends].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.categoryId - b.categoryId)
  const detailsClass = 'cursor-pointer rounded-lg py-2 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <section aria-label="So sánh thu chi hai tháng" className="min-w-0 space-y-3">
      <p className="break-words text-[11px] text-muted-foreground">{formatMonthLabel(data.baseMonth)} → {formatMonthLabel(data.targetMonth)}</p>
      {!categoryPreview && <dl aria-label="Tổng chi hai tháng" className="grid min-w-0 grid-cols-2 gap-2 rounded-xl bg-accent p-2.5 text-xs text-accent-foreground">
        <div className="min-w-0"><dt className="text-muted-foreground">Tháng {data.baseMonth.slice(5)}/{data.baseMonth.slice(0, 4)}</dt><dd className="mt-1 font-bold tabular-nums [overflow-wrap:anywhere]">{formatReportMoney(data.base.totalExpense)}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Tháng {data.targetMonth.slice(5)}/{data.targetMonth.slice(0, 4)}</dt><dd className="mt-1 font-bold tabular-nums [overflow-wrap:anywhere]">{formatReportMoney(data.target.totalExpense)}</dd></div>
      </dl>}
      {empty && <p className="text-xs text-muted-foreground">Không có giao dịch trong cả hai tháng.</p>}
      {data.expenseChangePercent === null && <p className="text-xs text-muted-foreground">Không tính được % thay đổi chi tiêu vì kỳ gốc bằng 0.</p>}

      {categoryPreview && data.categoryTrends.length > 0 && (
        <div aria-label="Danh mục nổi bật" className="space-y-2">
          <h3 className="text-xs font-bold text-foreground">Thay đổi nhiều nhất</h3>
          <CategoryTrends items={rankedCategories.slice(0, 3)} />
        </div>
      )}

      <details className="min-w-0 rounded-xl border border-border px-2.5">
        <summary className={detailsClass}>Xem số liệu và biểu đồ</summary>
        <div className="space-y-3 pb-2.5">
          <p className="text-xs font-semibold text-muted-foreground">Kỳ gốc → kỳ đang xem</p>
          <AiComparisonChart comparison={data} />
          <div className="space-y-2">{metrics.map(([key, label]) => (
            <div key={key} className="min-w-0 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900/60">
              <h3 className="text-xs font-bold text-foreground">{label}</h3>
              <dl className="mt-2 grid min-w-0 grid-cols-2 gap-2 text-[11px]">
                <div className="min-w-0"><dt className="text-muted-foreground">Kỳ gốc</dt><dd className="mt-0.5 font-semibold tabular-nums [overflow-wrap:anywhere]">{formatReportMoney(data.base[key])}</dd></div>
                <div className="min-w-0"><dt className="text-muted-foreground">Kỳ đang xem</dt><dd className="mt-0.5 font-semibold tabular-nums [overflow-wrap:anywhere]">{formatReportMoney(data.target[key])}</dd></div>
              </dl>
              <p className={`mt-2 break-words text-xs font-semibold tabular-nums ${key === 'totalExpense' ? expenseTone(data.delta[key]) : 'text-primary'}`}>
                {direction(data.delta[key])} · Chênh lệch: <span className="[overflow-wrap:anywhere]">{signedMoney(data.delta[key])}</span>
              </p>
            </div>
          ))}</div>
          {data.expenseChangePercent !== null && <p className={`text-xs font-semibold tabular-nums ${expenseTone(data.delta.totalExpense)}`}>Thay đổi chi tiêu: {formatReportPercent(data.expenseChangePercent)}</p>}
        </div>
      </details>

      {(!categoryPreview || data.categoryTrends.length > 3) && (
        <details aria-label="Xu hướng chi tiêu theo danh mục" className="min-w-0 rounded-xl border border-border px-2.5">
          <summary className={detailsClass}>{categoryPreview ? `Xem thêm ${data.categoryTrends.length - 3} danh mục` : 'Xem biến động danh mục'}</summary>
          <div className="pb-2.5">
            {data.categoryTrends.length === 0
              ? <p className="text-xs text-muted-foreground">Không có chi tiêu theo danh mục trong cả hai tháng.</p>
              : <CategoryTrends items={categoryPreview ? rankedCategories.slice(3) : rankedCategories} />}
          </div>
        </details>
      )}
      {categoryPreview && data.categoryTrends.length === 0 && <p className="text-xs text-muted-foreground">Không có chi tiêu theo danh mục trong cả hai tháng.</p>}
    </section>
  )
}
