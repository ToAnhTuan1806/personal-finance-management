import { compactCalendarMoney, formatCalendarMoney, monthCells, WEEKDAYS } from '../../utils/calendar'
import AsyncState from '../ui/AsyncState'

export function CalendarMonthContent({ result, year, month, selectedDate, today, onSelect, onRetry }) {
  if (!result) return <AsyncState kind="loading" message={`Đang tải lịch tháng ${month}/${year}…`} />
  if (result.error) return <AsyncState message={result.error} onRetry={onRetry} />
  const { data } = result
  const selected = data.days.find((day) => day.date === selectedDate)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-sm text-emerald-800 dark:text-emerald-200">Tổng thu tháng</p>
          <p className="mt-1 break-words text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatCalendarMoney(data.incomeTotal)}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-sm text-rose-800 dark:text-rose-200">Tổng chi tháng</p>
          <p className="mt-1 break-words text-xl font-bold text-rose-700 dark:text-rose-300">{formatCalendarMoney(data.expenseTotal)}</p>
        </div>
      </div>
      {data.days.every((day) => day.incomeTotal === 0 && day.expenseTotal === 0) &&
        <p role="status" className="text-sm text-slate-600 dark:text-slate-300">Tháng này chưa có giao dịch. Các ngày có tổng bằng 0.</p>}
      <p className="text-xs text-slate-600 dark:text-slate-300">Dấu + là thu, dấu − là chi. Số lớn trong ô được viết gọn; chọn ngày để xem tổng đầy đủ.</p>
      <MonthCalendar data={data} selectedDate={selectedDate} today={today} onSelect={onSelect} />
      <div role="status" aria-live="polite" aria-atomic="true" className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
        {selected ? <><strong>Ngày {selected.date.split('-').reverse().join('/')}</strong><p className="mt-2 break-words">Thu: {formatCalendarMoney(selected.incomeTotal)} · Chi: {formatCalendarMoney(selected.expenseTotal)}</p></> : 'Chọn một ngày để xem tổng thu và chi.'}
      </div>
    </>
  )
}

// Lưới chỉ hiển thị tổng từ Calendar API, không cộng danh sách giao dịch phân trang.
export default function MonthCalendar({ data, selectedDate, today, onSelect }) {
  const cells = monthCells(data.year, data.month)
  const days = new Map(data.days.map((day) => [day.date, day]))
  const rows = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#182234]">
      <table className="w-full table-fixed border-collapse text-center">
        <caption className="sr-only">Lịch thu chi tháng {data.month} năm {data.year}; đơn vị đồng</caption>
        <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <tr>{WEEKDAYS.map((day) => <th key={day} scope="col" className="py-3 font-semibold">{day}</th>)}</tr>
        </thead>
        <tbody>{rows.map((row, index) => (
          <tr key={index}>{row.map((date, column) => {
            if (!date) return <td key={`blank-${column}`} className="border border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30" />
            const day = days.get(date)
            const summary = `${date}: Thu ${formatCalendarMoney(day.incomeTotal)}, Chi ${formatCalendarMoney(day.expenseTotal)}`
            return (
              <td key={date} className="border border-slate-100 p-0.5 align-top dark:border-slate-800 sm:p-1">
                <button type="button" onClick={() => onSelect(date)} aria-label={summary} title={summary}
                  aria-pressed={selectedDate === date} aria-current={today === date ? 'date' : undefined}
                  className={'flex min-h-24 w-full min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 py-2 outline-offset-2 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-blue-950/40 sm:min-h-28 sm:gap-2 ' +
                    (selectedDate === date ? 'bg-blue-50 ring-2 ring-inset ring-blue-600 dark:bg-blue-950/40 dark:ring-blue-400' : '')}>
                  <span className={'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold sm:text-sm ' +
                    (today === date ? 'bg-blue-600 text-white' : 'text-slate-800 dark:text-slate-100')}>{Number(date.slice(-2))}</span>
                  <span aria-hidden="true" className="w-full truncate text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 sm:text-xs">+{compactCalendarMoney(day.incomeTotal)}</span>
                  <span aria-hidden="true" className="w-full truncate text-[10px] font-semibold text-rose-700 dark:text-rose-300 sm:text-xs">−{compactCalendarMoney(day.expenseTotal)}</span>
                </button>
              </td>
            )
          })}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}
