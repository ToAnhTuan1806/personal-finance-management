import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useQuickAdd } from '../contexts/QuickAddContext'

export default function QuickAdd() {
  const { openQuickAdd } = useQuickAdd()
  return (
    <section aria-labelledby="quick-add-title" className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 id="quick-add-title" className="text-2xl font-bold text-slate-900 dark:text-slate-100">Ghi thu chi nhanh</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Chọn Thu hoặc Chi → nhập thông tin → lưu giao dịch.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => openQuickAdd('EXPENSE')}
          className="flex min-h-36 items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-lg font-bold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <ArrowDownRight aria-hidden="true" /> Thêm chi tiêu
        </button>
        <button type="button" onClick={() => openQuickAdd('INCOME')}
          className="flex min-h-36 items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-lg font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <ArrowUpRight aria-hidden="true" /> Thêm thu nhập
        </button>
      </div>
      <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
        Khi mất kết nối, form giữ dữ liệu và báo lỗi. Nếu yêu cầu quá thời gian chờ, hãy kiểm tra lịch sử trước khi gửi lại.
      </p>
    </section>
  )
}
