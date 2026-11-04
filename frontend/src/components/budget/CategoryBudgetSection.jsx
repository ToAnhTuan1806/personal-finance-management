import { Plus, Wallet, AlertCircle, Loader2 } from 'lucide-react'
import CategoryBudgetCard from './CategoryBudgetCard'

export default function CategoryBudgetSection({
  budgets = [],
  categories = [],
  loading = false,
  error = '',
  onRetry,
  onAdd,
  onEdit,
  onDelete,
  disabled = false,
}) {
  return (
    <section
      aria-labelledby="category-budget-section-title"
      className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-sm transition-colors dark:border-slate-800 dark:bg-[#182234]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <h2
            id="category-budget-section-title"
            className="text-lg font-bold text-slate-900 dark:text-slate-100"
          >
            Ngân sách theo danh mục
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Kiểm soát chi tiêu chi tiết cho từng hạng mục trong tháng.
          </p>
        </div>

        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled || loading}
            aria-label="Thêm ngân sách danh mục"
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} />
            <span>Thêm ngân sách</span>
          </button>
        )}
      </div>

      {/* Content states: Loading, Error, Empty, List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Đang tải ngân sách theo danh mục...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/70 p-8 text-center dark:border-rose-900/50 dark:bg-rose-950/30"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">{error}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Không thể tải dữ liệu ngân sách danh mục lúc này.
            </p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Thử lại
            </button>
          )}
        </div>
      ) : budgets.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Wallet size={28} />
          </div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            Chưa có ngân sách theo danh mục nào.
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Thiết lập hạn mức cho từng danh mục để kiểm soát chi tiêu tốt hơn.
          </p>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              disabled={disabled}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Plus size={14} />
              <span>Thêm ngân sách đầu tiên</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {budgets.map((b) => (
            <CategoryBudgetCard
              key={b.id || b.categoryId}
              budget={b}
              category={categories.find((c) => c.id === b.categoryId)}
              onEdit={onEdit}
              onDelete={onDelete}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </section>
  )
}

