import { AiComparisonChart } from './AiFinancialCharts.jsx'
import { normalizeAiComparison } from '../../services/aiChatService.js'
import { formatMonthLabel, formatReportMoney, formatReportPercent } from '../reports/reportUtils.js'

const direction = (value) => value > 0 ? 'Tăng' : value < 0 ? 'Giảm' : 'Không đổi'
const signedMoney = (value) => `${value > 0 ? '+' : ''}${formatReportMoney(value)}`
const expenseTone = (value) => value > 0
  ? 'text-rose-700 dark:text-rose-300' : value < 0
    ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'

export default function AiComparisonCard({ comparison, period }) {
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

  return (
    <section aria-label="So sánh thu chi hai tháng" className="min-w-0 space-y-3">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs dark:border-blue-800 dark:bg-blue-950/40">
        <p className="font-bold text-blue-800 dark:text-blue-200">Kỳ gốc → kỳ đang xem</p>
        <p className="mt-1 break-words text-blue-700 dark:text-blue-300">{formatMonthLabel(data.baseMonth)} → {formatMonthLabel(data.targetMonth)}</p>
      </div>
      <AiComparisonChart comparison={data} />
      {empty && <p className="text-xs text-slate-600 dark:text-slate-300">Không có giao dịch trong cả hai tháng.</p>}
      <div className="space-y-2">
        {metrics.map(([key, label]) => (
          <div key={key} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</h3>
            <dl className="mt-2 grid min-w-0 grid-cols-2 gap-2 text-[11px]">
              <div className="min-w-0"><dt className="text-slate-500 dark:text-slate-400">Kỳ gốc</dt><dd className="mt-0.5 font-semibold [overflow-wrap:anywhere]">{formatReportMoney(data.base[key])}</dd></div>
              <div className="min-w-0"><dt className="text-slate-500 dark:text-slate-400">Kỳ đang xem</dt><dd className="mt-0.5 font-semibold [overflow-wrap:anywhere]">{formatReportMoney(data.target[key])}</dd></div>
            </dl>
            <p className={`mt-2 break-words text-xs font-semibold ${key === 'totalExpense' ? expenseTone(data.delta[key]) : 'text-blue-700 dark:text-blue-300'}`}>
              {direction(data.delta[key])} · Chênh lệch: <span className="[overflow-wrap:anywhere]">{signedMoney(data.delta[key])}</span>
            </p>
          </div>
        ))}
      </div>
      <p className={`break-words text-xs font-semibold ${expenseTone(data.delta.totalExpense)}`}>
        {data.expenseChangePercent === null ? 'Không tính được % thay đổi chi tiêu vì kỳ gốc bằng 0.'
          : `Chi tiêu ${direction(data.delta.totalExpense).toLowerCase()} · ${formatReportPercent(data.expenseChangePercent)}`}
      </p>
      <div aria-label="Xu hướng chi tiêu theo danh mục" className="min-w-0 space-y-2">
        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">Biến động danh mục</h3>
        {data.categoryTrends.length === 0
          ? <p className="text-xs text-slate-500 dark:text-slate-400">Không có chi tiêu theo danh mục trong cả hai tháng.</p>
          : <ul className="space-y-2">{data.categoryTrends.map((item) => (
            <li key={item.categoryId} className="min-w-0 space-y-1 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs font-semibold [overflow-wrap:anywhere]">{item.categoryName}</p>
              <p className="text-[11px] text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">{formatReportMoney(item.baseExpense)} → {formatReportMoney(item.targetExpense)}</p>
              <p className={`text-xs font-semibold [overflow-wrap:anywhere] ${expenseTone(item.delta)}`}>{direction(item.delta)} · {signedMoney(item.delta)}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.changePercent === null ? 'Không tính được % vì kỳ gốc bằng 0.' : `Thay đổi: ${formatReportPercent(item.changePercent)}`}</p>
            </li>
          ))}</ul>}
      </div>
    </section>
  )
}
