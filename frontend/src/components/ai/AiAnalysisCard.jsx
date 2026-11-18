import { Link } from 'react-router'
import { formatReportMoney } from '../reports/reportUtils.js'
import { buildAnalysisTransactionLink } from '../../utils/transactionLinks.js'

const dayLabel = value => value.split('-').reverse().join('/')

export default function AiAnalysisCard({ analysis, onNavigate }) {
  if (!analysis) return null
  const { title, summary, metrics, highlights, drivers, evidence, transactionFilter, assumptions, kind, status } = analysis
  return <section aria-label={title} className="min-w-0 space-y-3 text-xs leading-relaxed text-slate-800 sm:text-sm dark:text-slate-100">
    <header>
      <h3 className="font-bold text-slate-950 dark:text-white">{title}</h3>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Dữ liệu {dayLabel(analysis.startDate)} – {dayLabel(analysis.endDate)}</p>
    </header>
    <p className="break-words font-semibold">{summary}</p>
    {kind === 'PURCHASE_SIMULATION' && <p className="rounded-lg bg-blue-50 px-2 py-1.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">Mô phỏng ngân sách · Chưa lưu giao dịch</p>}
    {metrics.length > 0 && <dl className="grid min-w-0 grid-cols-1 gap-2">
      {metrics.map(metric => <div key={metric.label} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
        <dt className="text-[11px] text-slate-600 dark:text-slate-400">{metric.label}</dt>
        <dd className={`whitespace-nowrap font-bold tabular-nums ${metric.value < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-950 dark:text-slate-100'}`}>{formatReportMoney(metric.value)}</dd>
      </div>)}
    </dl>}
    {drivers.length > 0 && <div>
      <h4 className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Biến động theo danh mục</h4>
      <ul className="mt-1 space-y-1.5">{drivers.map(driver => <li key={driver.categoryId} className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-900/50">
        <span className="break-words">{driver.categoryName}</span>
        <strong className={`tabular-nums ${driver.delta > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{driver.delta > 0 ? '+' : ''}{formatReportMoney(driver.delta)}</strong>
      </li>)}</ul>
    </div>}
    {highlights.length > 0 && <ul className="list-disc space-y-1 pl-4 text-slate-600 dark:text-slate-300">{highlights.map(line => <li key={line} className="break-words">{line}</li>)}</ul>}
    {evidence.length > 0 && <details className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
      <summary className="cursor-pointer font-semibold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300">Xem {evidence.length} giao dịch lớn liên quan</summary>
      <ul className="mt-2 space-y-2">{evidence.map(item => <li key={item.id} className="border-t border-slate-100 pt-2 dark:border-slate-800">
        <div className="flex flex-wrap justify-between gap-2"><time dateTime={item.date}>{dayLabel(item.date)}</time><strong className="tabular-nums">{formatReportMoney(item.amount)}</strong></div>
        <p className="break-words text-slate-600 dark:text-slate-300">{item.note || item.categoryName}</p>
      </li>)}</ul>
    </details>}
    {assumptions.length > 0 && <details className="text-[11px] text-slate-600 dark:text-slate-400">
      <summary className="cursor-pointer rounded py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Cách tính và giới hạn</summary>
      <p className="mt-1">Ngày chốt dữ liệu: {dayLabel(analysis.asOf)}.</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">{assumptions.map(line => <li key={line} className="break-words">{line}</li>)}</ul>
    </details>}
    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
      {transactionFilter && <Link to={buildAnalysisTransactionLink(transactionFilter)} onClick={onNavigate} className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Xem giao dịch liên quan</Link>}
      {kind !== 'SPENDING_INSIGHT' && status !== 'NEEDS_AMOUNT' && <Link to="/budgets" onClick={onNavigate} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{status === 'BUDGET_NOT_SET' ? 'Đặt ngân sách tháng' : 'Xem ngân sách'}</Link>}
    </div>
  </section>
}
