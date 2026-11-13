import { Pencil, Trash2 } from 'lucide-react'
import CategoryBadge from '../category/CategoryBadge'
import {
  formatMoney,
  getBudgetDisplayStatus,
  getBudgetUsagePercentage,
  getStatusConfig,
} from './categoryBudgetUtils'

export default function CategoryBudgetCard({
  budget,
  category,
  onEdit,
  onDelete,
  disabled = false,
}) {
  if (!budget) return null

  const categoryName = budget.categoryName || category?.name || 'Danh mục'
  const categoryData = category || {
    id: budget.categoryId,
    name: categoryName,
    icon: budget.categoryIcon || budget.icon,
    color: budget.categoryColor || budget.color,
  }

  const status = getBudgetDisplayStatus(budget)
  const config = getStatusConfig(status)
  const percentage = getBudgetUsagePercentage(budget)
  const progressWidth = Math.min(100, Math.max(0, percentage))

  const limit = Number(budget.amountLimit || 0)
  const spent = Number(budget.spentAmount || 0)
  const remaining = Number(budget.remainingAmount != null ? budget.remainingAmount : limit - spent)
  const isExceeded = Boolean(
    budget.exceeded === true || remaining < 0 || (limit > 0 && spent > limit)
  )

  return (
    <div
      role="region"
      aria-label={`Ngân sách danh mục ${categoryName}`}
      className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs transition-all hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-[#1E293B]/70 dark:hover:border-blue-700/60"
    >
      {/* Header: Category Badge, Name, Status, Actions */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CategoryBadge category={categoryData} size={18} />
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-sm font-bold text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400"
                title={categoryName}
              >
                {categoryName}
              </h3>
              <span
                className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.badgeClass}`}
              >
                {config.label}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit?.(budget)}
              disabled={disabled}
              aria-label={`Sửa ngân sách danh mục ${categoryName}`}
              title="Sửa ngân sách"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
            >
              <Pencil size={15} />
            </button>

            <button
              type="button"
              onClick={() => onDelete?.(budget)}
              disabled={disabled}
              aria-label={`Xóa ngân sách danh mục ${categoryName}`}
              title="Xóa ngân sách"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-400"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Progress Bar & Percentage */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-500 dark:text-slate-400">Tiến độ chi tiêu</span>
            <span className={`font-bold ${config.textColor}`}>
              {percentage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={Math.round(progressWidth)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${percentage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`}
            aria-label={`Tiến độ ngân sách danh mục ${categoryName}`}
            className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${config.barColor}`}
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>
      </div>

      {/* Financial Details */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
        <div>
          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">Hạn mức</span>
          <span className="mt-0.5 block truncate font-bold text-slate-800 dark:text-slate-100" title={formatMoney(limit)}>
            {formatMoney(limit)}
          </span>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">Đã chi</span>
          <span className="mt-0.5 block truncate font-bold text-slate-800 dark:text-slate-100" title={formatMoney(spent)}>
            {formatMoney(spent)}
          </span>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {isExceeded ? 'Chi vượt' : 'Còn lại'}
          </span>
          <span
            className={`mt-0.5 block truncate font-bold ${
              isExceeded
                ? 'text-rose-600 dark:text-rose-400'
                : status === 'AT_LIMIT'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
            }`}
            title={isExceeded ? `-${formatMoney(Math.abs(remaining))}` : formatMoney(remaining)}
          >
            {isExceeded ? `-${formatMoney(Math.abs(remaining))}` : formatMoney(remaining)}
          </span>
        </div>
      </div>
    </div>
  )
}

