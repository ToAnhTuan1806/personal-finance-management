import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  FileText,
  Info,
  Pencil,
  Trash2,
} from 'lucide-react'
import CategoryBadge from '../category/CategoryBadge'
import {
  DAY_31_NOTICE,
  formatDayOfMonth,
  formatMoney,
  isDay31,
} from './recurringTemplateUtils'

export default function RecurringTemplateCard({
  template,
  category,
  onEdit,
  onDelete,
  onToggleActive,
  disabled = false,
}) {
  if (!template) return null

  const categoryName = template.categoryName || category?.name || 'Danh mục'
  const categoryData = category || {
    id: template.categoryId,
    name: categoryName,
    icon: template.categoryIcon || template.icon,
    color: template.categoryColor || template.color,
  }

  const isExpense = template.type === 'EXPENSE'
  const is31 = isDay31(template.dayOfMonth)

  return (
    <div
      role="region"
      aria-label={`Mẫu định kỳ ${categoryName}`}
      className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs transition-all hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-[#1E293B]/70 dark:hover:border-blue-700/60"
    >
      <div>
        {/* Header: Category info, Type badge, Status and Actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CategoryBadge category={categoryData} size={18} />
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-sm font-bold text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400"
                title={categoryName}
              >
                {categoryName}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    isExpense
                      ? 'border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                  }`}
                >
                  {isExpense ? (
                    <>
                      <ArrowDownRight size={12} />
                      <span>Chi tiêu</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpRight size={12} />
                      <span>Thu nhập</span>
                    </>
                  )}
                </span>

                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    template.active
                      ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {template.active ? 'Đang bật' : 'Đã tắt'}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-1">
            {onToggleActive && (
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(template.active)}
                aria-label={`Bật tắt mẫu định kỳ ${categoryName}`}
                disabled={disabled}
                onClick={() => onToggleActive(template)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  template.active ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    template.active ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            )}

            <button
              type="button"
              onClick={() => onEdit?.(template)}
              disabled={disabled}
              aria-label={`Sửa mẫu định kỳ ${categoryName}`}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-blue-400"
            >
              <Pencil size={15} />
            </button>

            <button
              type="button"
              onClick={() => onDelete?.(template)}
              disabled={disabled}
              aria-label={`Xóa mẫu định kỳ ${categoryName}`}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Amount */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Số tiền định kỳ
          </p>
          <p
            className={`mt-0.5 text-xl font-black tracking-tight ${
              isExpense
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {isExpense ? '-' : '+'}
            {formatMoney(template.amount)}
          </p>
        </div>

        {/* Schedule */}
        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          <Calendar size={14} className="text-slate-400 shrink-0" />
          <span>{formatDayOfMonth(template.dayOfMonth)}</span>
        </div>

        {/* Notice if Day 31 */}
        {is31 && (
          <div className="mt-2.5 flex items-start gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <Info size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="leading-snug">{DAY_31_NOTICE}</span>
          </div>
        )}

        {/* Note if present */}
        {template.note && (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <FileText size={13} className="mt-0.5 shrink-0 text-slate-400" />
            <p className="line-clamp-2 italic">{template.note}</p>
          </div>
        )}
      </div>
    </div>
  )
}
