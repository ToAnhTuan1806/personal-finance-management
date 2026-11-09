import { useMemo } from 'react'
import {
  AlertCircle,
  Loader2,
  PieChart,
  RefreshCw,
} from 'lucide-react'
import ExpenseDonutChart from '../dashboard/ExpenseDonutChart.jsx'
import CategoryBadge from '../category/CategoryBadge.jsx'
import {
  calculateExpensePercentage,
  formatReportMoney,
  formatReportPercent,
  formatShortMonthLabel,
} from './reportUtils.js'

const RANK_COLORS = [
  '#F97316',
  '#0EA5E9',
  '#10B981',
  '#EF4444',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#6366F1',
]

export default function CategoryBreakdownSection({
  report,
  loading = false,
  error = '',
  onRetry,
}) {
  const expensesByCategory = useMemo(
    () =>
      Array.isArray(report?.expensesByCategory)
        ? report.expensesByCategory.filter(
            (item) => Number(item?.totalAmount || 0) > 0
          )
        : [],
    [report]
  )

  const totalCategoryExpense = useMemo(() => {
    let cents = 0
    for (const item of expensesByCategory) {
      cents += Math.round(Number(item.totalAmount || 0) * 100)
    }
    return cents / 100
  }, [expensesByCategory])

  const subtitle =
    report?.from && report?.to
      ? `Kỳ báo cáo: ${formatShortMonthLabel(report.from)} – ${formatShortMonthLabel(report.to)}`
      : 'Phân bổ chi tiêu theo danh mục'

  return (
    <section
      aria-label="Phân bổ chi tiêu theo danh mục"
      className="flex min-w-0 flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234]"
    >
      {loading ? (
        <div>
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Chi tiêu theo danh mục
            </h2>
          </div>
          <div
            role="status"
            className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <Loader2
              size={26}
              className="animate-spin text-blue-600 dark:text-blue-400"
            />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Đang tải thống kê chi tiêu theo danh mục...
            </p>
          </div>
        </div>
      ) : error ? (
        <div>
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Chi tiêu theo danh mục
            </h2>
          </div>
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
        </div>
      ) : expensesByCategory.length === 0 ? (
        <div>
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Chi tiêu theo danh mục
            </h2>
          </div>
          <div className="my-2 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-800 dark:bg-slate-800/40">
            <PieChart size={32} className="mb-2.5 text-slate-400" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              Chưa có khoản chi tiêu nào trong khoảng thời gian đã chọn
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              Khi có giao dịch chi tiêu hợp lệ, biểu đồ tròn và bảng chi tiêu
              theo danh mục sẽ tự động hiển thị tại đây.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-w-0 space-y-5">
          <div className="min-w-0 [&>.se097]:border-0 [&>.se097]:p-0 [&>.se097]:shadow-none [&>.se097]:bg-transparent [&_.se097-chart]:max-w-full">
            <ExpenseDonutChart
              data={expensesByCategory}
              title="Chi tiêu theo danh mục"
              subtitle={subtitle}
            />
          </div>

          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Bảng chi tiêu theo danh mục ({expensesByCategory.length} danh
                mục)
              </h3>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Tổng chi danh mục: {formatReportMoney(totalCategoryExpense)}
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <table
                className="w-full min-w-[440px] text-left text-xs"
                aria-label="Bảng chi tiêu theo danh mục"
              >
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-3.5 py-2.5">
                      Hạng
                    </th>
                    <th scope="col" className="px-3.5 py-2.5">
                      Danh mục
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Số tiền chi
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Tỷ trọng
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {expensesByCategory.map((item, index) => {
                    const color = RANK_COLORS[index % RANK_COLORS.length]
                    const percentage = calculateExpensePercentage(
                      item.totalAmount,
                      totalCategoryExpense
                    )
                    const barWidth = Math.min(100, Math.max(0, percentage))

                    return (
                      <tr
                        key={item.categoryId}
                        className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-3.5 py-2.5 font-bold text-slate-500 dark:text-slate-400">
                          #{index + 1}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <CategoryBadge
                                category={{
                                  name: item.categoryName,
                                  color,
                                }}
                                size={16}
                              />
                              <span className="font-bold text-slate-800 dark:text-slate-100">
                                {item.categoryName}
                              </span>
                            </div>
                            <div
                              className="h-1.5 w-full max-w-44 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                              role="progressbar"
                              aria-label={`Tỷ trọng chi tiêu ${item.categoryName}`}
                              aria-valuenow={percentage}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            >
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${barWidth}%`,
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-rose-600 dark:text-rose-400">
                          {formatReportMoney(item.totalAmount)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-extrabold text-slate-800 dark:text-slate-100">
                          {formatReportPercent(percentage)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
