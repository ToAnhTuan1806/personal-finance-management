import { useEffect, useState } from 'react'
import AsyncState from '../ui/AsyncState'
import CategoryBadge from '../category/CategoryBadge'
import { useQuickAdd } from '../../contexts/QuickAddContext'
import { getDayTransactions } from '../../services/dayTransactionService'
import { getCategories } from '../../services/categoryService'
import { getApiErrorMessage, isRequestCancelled } from '../../api/errors'
import { formatCalendarMoney } from '../../utils/calendar'

export function DayTransactionsContent({ date, page, result, onPage, onRetry, onAdd }) {
  const data = result?.data
  const buttonClass = 'min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40 dark:border-slate-600 dark:text-slate-100'
  return <section id="calendar-day-details" aria-labelledby="day-transactions-title" aria-busy={!result} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#182234] sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="day-transactions-title" aria-live="polite" className="font-bold text-slate-900 dark:text-slate-100">Giao dịch ngày {date.split('-').reverse().join('/')}</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onAdd('EXPENSE', date)} className={buttonClass}>Thêm giao dịch chi</button>
        <button type="button" onClick={() => onAdd('INCOME', date)} className={buttonClass}>Thêm giao dịch thu</button>
      </div>
    </div>
    {!result ? <AsyncState kind="loading" message="Đang tải giao dịch trong ngày…" /> : result.error ?
      <AsyncState message={result.error} onRetry={onRetry} /> : <>
        {data.content.length === 0 ? <AsyncState kind="empty" message={data.totalElements === 0 ? 'Ngày này chưa có giao dịch.' : 'Trang này không còn giao dịch. Hãy quay về trang đầu.'} /> :
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">{data.content.map((row) => <li key={row.id} className="flex min-w-0 flex-wrap items-start gap-3 py-4">
            <CategoryBadge category={result.categories.find((category) => category.id === row.categoryId)} />
            <div className="min-w-0 flex-1 basis-32 text-slate-800 dark:text-slate-100">
              <p className="break-words font-semibold">{row.categoryName}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{row.type === 'INCOME' ? 'Thu nhập' : 'Chi tiêu'} · {row.transactionDate.split('-').reverse().join('/')}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{row.note || 'Không có ghi chú'}</p>
            </div>
            <p className={'max-w-full break-all text-right font-bold ' + (row.type === 'INCOME' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>
              {row.type === 'INCOME' ? '+' : '−'}{formatCalendarMoney(row.amount)}
            </p>
          </li>)}</ul>}
        <nav aria-label="Phân trang giao dịch trong ngày" className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{data.totalElements} giao dịch · Trang {data.totalPages ? page + 1 : 0}/{data.totalPages}</p>
          <div className="flex gap-2">
            {page > 0 && <button type="button" className={buttonClass} onClick={() => onPage(0)}>Trang đầu</button>}
            <button type="button" className={buttonClass} disabled={page === 0} onClick={() => onPage(page - 1)}>Trước</button>
            <button type="button" className={buttonClass} disabled={page + 1 >= data.totalPages} onClick={() => onPage(page + 1)}>Sau</button>
          </div>
        </nav>
      </>}
  </section>
}

export default function DayTransactions({ date, page, onPage }) {
  const { openQuickAdd, mutationVersion } = useQuickAdd()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const key = `${date}-${page}-${mutationVersion}-${attempt}`
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getDayTransactions(date, page, { signal: controller.signal }), getCategories(null, { signal: controller.signal })])
      .then(([data, categories]) => {
        if (!Array.isArray(categories)) throw Object.assign(new Error(), { code: 'INVALID_API_RESPONSE' })
        if (!controller.signal.aborted) setResult({ key, data, categories, error: '' })
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRequestCancelled(error)) setResult({ key, data: null, error: getApiErrorMessage(error) })
      })
    // Không để response ngày/trang cũ đè dữ liệu của lựa chọn mới.
    return () => controller.abort()
  }, [date, page, key])
  return <DayTransactionsContent date={date} page={page} result={result?.key === key ? result : null}
    onPage={onPage} onRetry={() => setAttempt((value) => value + 1)} onAdd={openQuickAdd} />
}
