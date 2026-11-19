import { Link } from 'react-router'
import { formatReportMoney } from '../reports/reportUtils.js'
import { buildAnalysisTransactionLink } from '../../utils/transactionLinks.js'

const dayLabel = value => value.split('-').reverse().join('/')

export default function AiAnalysisCard({ analysis, onNavigate }) {
  if (!analysis) return null
  const { title, summary, metrics, highlights, drivers, evidence, transactionFilter, assumptions, kind, status } = analysis
  return <section aria-label={title} className="min-w-0 space-y-3 text-xs leading-relaxed text-foreground sm:text-sm">
    <header>
      <h3 className="font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">Dữ liệu {dayLabel(analysis.startDate)} – {dayLabel(analysis.endDate)}</p>
    </header>
    <p className="break-words font-semibold">{summary}</p>
    {kind === 'PURCHASE_SIMULATION' && <p className="rounded-lg bg-accent px-2 py-1.5 text-[11px] font-medium text-accent-foreground">Mô phỏng ngân sách · Chưa lưu giao dịch</p>}
    {metrics.length > 0 && <dl className="grid min-w-0 grid-cols-1 gap-2">
      {metrics.map(metric => <div key={metric.label} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-border bg-muted p-2.5">
        <dt className="text-[11px] text-muted-foreground">{metric.label}</dt>
        <dd className={`whitespace-nowrap font-bold tabular-nums ${metric.value < 0 ? 'text-expense' : 'text-foreground'}`}>{formatReportMoney(metric.value)}</dd>
      </div>)}
    </dl>}
    {drivers.length > 0 && <div>
      <h4 className="text-[11px] font-semibold text-muted-foreground">Biến động theo danh mục</h4>
      <ul className="mt-1 space-y-1.5">{drivers.map(driver => <li key={driver.categoryId} className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-lg bg-muted px-2 py-1.5">
        <span className="break-words">{driver.categoryName}</span>
        <strong className={`tabular-nums ${driver.delta > 0 ? 'text-expense' : 'text-income'}`}>{driver.delta > 0 ? '+' : ''}{formatReportMoney(driver.delta)}</strong>
      </li>)}</ul>
    </div>}
    {highlights.length > 0 && <ul className="list-disc space-y-1 pl-4 text-muted-foreground">{highlights.map(line => <li key={line} className="break-words">{line}</li>)}</ul>}
    {evidence.length > 0 && <details className="rounded-xl border border-border p-2.5">
      <summary className="cursor-pointer font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Xem {evidence.length} giao dịch lớn liên quan</summary>
      <ul className="mt-2 space-y-2">{evidence.map(item => <li key={item.id} className="border-t border-border pt-2">
        <div className="flex flex-wrap justify-between gap-2"><time dateTime={item.date}>{dayLabel(item.date)}</time><strong className="tabular-nums">{formatReportMoney(item.amount)}</strong></div>
        <p className="break-words text-muted-foreground">{item.note || item.categoryName}</p>
      </li>)}</ul>
    </details>}
    {assumptions.length > 0 && <details className="text-[11px] text-muted-foreground">
      <summary className="cursor-pointer rounded py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Cách tính và giới hạn</summary>
      <p className="mt-1">Ngày chốt dữ liệu: {dayLabel(analysis.asOf)}.</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">{assumptions.map(line => <li key={line} className="break-words">{line}</li>)}</ul>
    </details>}
    <div className="flex flex-wrap gap-2 border-t border-border pt-2">
      {transactionFilter && <Link to={buildAnalysisTransactionLink(transactionFilter)} onClick={onNavigate} className="rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Xem giao dịch liên quan</Link>}
      {kind !== 'SPENDING_INSIGHT' && status !== 'NEEDS_AMOUNT' && <Link to="/budgets" onClick={onNavigate} className="rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{status === 'BUDGET_NOT_SET' ? 'Đặt ngân sách tháng' : 'Xem ngân sách'}</Link>}
    </div>
  </section>
}
