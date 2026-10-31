import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { CalendarMonthContent } from '../components/calendar/MonthCalendar'
import { useQuickAdd } from '../contexts/QuickAddContext'
import { getCalendarMonth } from '../services/calendarService'
import { getApiErrorMessage, isRequestCancelled } from '../api/errors'
import { isCalendarPeriod, shiftMonth } from '../utils/calendar'
import { localToday } from '../utils/transactionForm'

export default function Calendar() {
  const today = localToday()
  const [todayYear, todayMonth] = today.split('-').map(Number)
  const [period, setPeriod] = useState(() => ({ year: todayYear, month: todayMonth }))
  const [selectedDate, setSelectedDate] = useState(today)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const { mutationVersion } = useQuickAdd()
  const { year, month } = period
  const key = `${year}-${month}-${attempt}-${mutationVersion}`
  const current = result?.key === key ? result : null
  const previous = shiftMonth(period, -1), next = shiftMonth(period, 1)

  useEffect(() => {
    const controller = new AbortController()
    getCalendarMonth(year, month, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data, error: '' })
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRequestCancelled(error)) {
          setResult({ key, data: null, error: getApiErrorMessage(error) })
        }
      })
    // Bỏ response tháng/phiên cũ khi chuyển tháng hoặc rời trang.
    return () => controller.abort()
  }, [year, month, key])

  const changeMonth = (value) => {
    if (!value) return
    setPeriod(value)
    setSelectedDate(value.year === todayYear && value.month === todayMonth ? today : '')
  }
  const controlClass = 'flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'

  return (
    <section aria-labelledby="calendar-title" className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 id="calendar-title" className="text-2xl font-bold text-slate-900 dark:text-slate-100">Lịch thu chi</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Theo dõi tổng thu và chi từng ngày.</p>
        </div>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} disabled={!current}
          className={controlClass} aria-label="Tải lại lịch"><RefreshCw size={17} aria-hidden="true" /></button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className={controlClass} disabled={!previous} onClick={() => changeMonth(previous)} aria-label="Tháng trước"><ChevronLeft size={18} aria-hidden="true" /></button>
          <h2 aria-live="polite" aria-atomic="true" className="min-w-32 text-center font-bold text-slate-900 dark:text-slate-100">Tháng {month}/{year}</h2>
          <button type="button" className={controlClass} disabled={!next} onClick={() => changeMonth(next)} aria-label="Tháng sau"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
        <button type="button" className={controlClass} disabled={!isCalendarPeriod(todayYear, todayMonth)} onClick={() => changeMonth({ year: todayYear, month: todayMonth })}>Tháng hiện tại</button>
      </div>
      <CalendarMonthContent result={current} year={year} month={month} selectedDate={selectedDate} today={today}
        onSelect={setSelectedDate} onRetry={() => setAttempt((value) => value + 1)} />
    </section>
  )
}
