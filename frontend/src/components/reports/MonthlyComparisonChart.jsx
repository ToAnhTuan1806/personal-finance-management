import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertCircle,
  BarChart3,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  formatMonthLabel,
  formatReportAxisTick,
  formatReportMoney,
  formatReportPercent,
  formatShortMonthLabel,
  summarizeReportMonths,
} from './reportUtils.js'

export function MonthlyReportTooltip({ active, payload }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null
  }

  const row = payload[0]?.payload
  if (!row) return null

  const totalIncome = Number(row.totalIncome || 0)
  const totalExpense = Number(row.totalExpense || 0)
  const balance = Number(row.balance ?? totalIncome - totalExpense)

  return (
    <div
      className="min-w-52 rounded-2xl border border-slate-700/80 bg-[#182234] p-3.5 text-xs text-slate-100 shadow-xl"
      role="status"
    >
      <p className="mb-2 border-b border-slate-700/70 pb-1.5 font-bold text-white">
        {formatMonthLabel(row.month)}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Tổng thu
          </span>
          <span className="font-bold text-emerald-300">
            {formatReportMoney(totalIncome)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            Tổng chi
          </span>
          <span className="font-bold text-rose-300">
            {formatReportMoney(totalExpense)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-slate-700/70 pt-1.5">
          <span className="font-semibold text-slate-300">Chênh lệch</span>
          <span
            className={`font-extrabold ${
              balance >= 0 ? 'text-blue-300' : 'text-amber-300'
            }`}
          >
            {balance > 0 ? '+' : ''}
            {formatReportMoney(balance)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function MonthlyComparisonChart({
  report,
  loading = false,
  error = '',
  onRetry,
}) {
  const months = useMemo(
    () => (Array.isArray(report?.months) ? report.months : []),
    [report]
  )

  const chartData = useMemo(
    () =>
      months.map((item) => ({
        ...item,
        shortMonth: formatShortMonthLabel(item.month),
      })),
    [months]
  )

  const totals = useMemo(() => summarizeReportMonths(months), [months])

  const hasAnyActivity = useMemo(
    () =>
      months.some(
        (item) => Number(item.totalIncome) > 0 || Number(item.totalExpense) > 0
      ),
    [months]
  )

  const rangeSubtitle =
    report?.from && report?.to
      ? `Kỳ báo cáo: ${formatShortMonthLabel(report.from)} – ${formatShortMonthLabel(report.to)}`
      : 'So sánh thu nhập và chi tiêu theo từng tháng'

  return (
    <section
      aria-label="Biểu đồ cột thu chi theo từng tháng"
      className="flex min-w-0 flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234]"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {rangeSubtitle}
          </p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Biểu đồ thu – chi theo từng tháng
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Tổng thu
          </span>
          <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            Tổng chi
          </span>
        </div>
      </div>

      {loading ? (
        <div
          role="status"
          className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <Loader2
            size={26}
            className="animate-spin text-blue-600 dark:text-blue-400"
          />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Đang tải biểu đồ thu – chi theo tháng...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <AlertCircle size={28} />
          <p className="max-w-md font-medium">{error}</p>
          {typeof onRetry === 'function' && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <RefreshCw size={14} />
              <span>Thử lại</span>
            </button>
          )}
        </div>
      ) : !hasAnyActivity ? (
        <div className="my-2 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-800 dark:bg-slate-800/40">
          <BarChart3 size={32} className="mb-2.5 text-slate-400" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Chưa có phát sinh thu – chi trong khoảng thời gian đã chọn
          </p>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            Tất cả các tháng trong khoảng từ{' '}
            {formatShortMonthLabel(report?.from)} đến{' '}
            {formatShortMonthLabel(report?.to)} đều có thu nhập và chi tiêu bằng
            0 ₫.
          </p>
        </div>
      ) : (
        <div className="mt-2 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 12, left: -10, bottom: 4 }}
              barGap={6}
            >
              <defs>
                <linearGradient
                  id="reportTotalIncomeGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                </linearGradient>
                <linearGradient
                  id="reportTotalExpenseGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#E11D48" stopOpacity={0.75} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#cbd5e1"
                strokeOpacity={0.4}
              />
              <XAxis
                dataKey="shortMonth"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1', strokeWidth: 0.6 }}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1', strokeWidth: 0.6 }}
                tickFormatter={formatReportAxisTick}
              />
              <Tooltip
                content={<MonthlyReportTooltip />}
                cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
              />
              <Bar
                dataKey="totalIncome"
                name="Tổng thu"
                fill="url(#reportTotalIncomeGradient)"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
              <Bar
                dataKey="totalExpense"
                name="Tổng chi"
                fill="url(#reportTotalExpenseGradient)"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && !error && months.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Bảng tổng hợp số liệu từng tháng ({months.length} tháng)
            </h3>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <table
              className="w-full min-w-[520px] text-left text-xs"
              aria-label="Bảng tổng hợp số liệu từng tháng"
            >
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-3.5 py-2.5">
                    Tháng
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 text-right">
                    Tổng thu
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 text-right">
                    Tổng chi
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 text-right">
                    Chênh lệch
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 text-right">
                    Tỷ lệ tiết kiệm
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {months.map((item) => {
                  const totalIncome = Number(item.totalIncome || 0)
                  const totalExpense = Number(item.totalExpense || 0)
                  const balance = Number(
                    item.balance ?? totalIncome - totalExpense
                  )
                  const savingRate =
                    totalIncome > 0 && balance > 0
                      ? (balance / totalIncome) * 100
                      : 0

                  return (
                    <tr
                      key={item.month}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-3.5 py-2.5 font-bold text-slate-800 dark:text-slate-100">
                        {formatShortMonthLabel(item.month)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatReportMoney(totalIncome)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-semibold text-rose-600 dark:text-rose-400">
                        {formatReportMoney(totalExpense)}
                      </td>
                      <td
                        className={`px-3.5 py-2.5 text-right font-bold ${
                          balance >= 0
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {balance > 0 ? '+' : ''}
                        {formatReportMoney(balance)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {totalIncome > 0
                          ? balance >= 0
                            ? formatReportPercent(savingRate)
                            : 'Thâm hụt'
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/90 font-bold dark:border-slate-700 dark:bg-slate-800/70">
                <tr>
                  <td className="px-3.5 py-2.5 text-slate-900 dark:text-slate-100">
                    Tổng cộng
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                    {formatReportMoney(totals.totalIncome)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-rose-600 dark:text-rose-400">
                    {formatReportMoney(totals.totalExpense)}
                  </td>
                  <td
                    className={`px-3.5 py-2.5 text-right ${
                      totals.balance >= 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {totals.balance > 0 ? '+' : ''}
                    {formatReportMoney(totals.balance)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-slate-700 dark:text-slate-300">
                    {totals.totalIncome > 0 && totals.balance > 0
                      ? formatReportPercent(
                          (totals.balance / totals.totalIncome) * 100
                        )
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
