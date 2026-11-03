import { isCalendarPeriod, monthDates } from './calendar.js'
import { isValidDate } from './transactionForm.js'

export function calendarSelection(params, today) {
  const monthValue = params.get('month') || today.slice(0, 7)
  const [year, month] = monthValue.split('-').map(Number)
  const valid = /^\d{4}-\d{2}$/.test(monthValue) && isCalendarPeriod(year, month)
  const period = valid ? { year, month } : { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }
  const dates = monthDates(period.year, period.month)
  const requestedDate = params.get('date')
  const date = dates.includes(requestedDate) ? requestedDate : dates.includes(today) ? today : dates[0]
  const rawPage = params.get('page') || '0'
  const page = /^\d+$/.test(rawPage) && Number(rawPage) <= Math.floor(2147483647 / 10) ? Number(rawPage) : 0
  return { ...period, date, page }
}

export function calendarParams(period, date, page = 0) {
  const month = `${period.year}-${String(period.month).padStart(2, '0')}`
  return { month, date, page: String(page) }
}

// Giữ ngày tương ứng khi chuyển tháng, giảm về ngày cuối nếu tháng mới ngắn hơn.
export function dateInMonth(period, previousDate) {
  const dates = monthDates(period.year, period.month)
  const day = isValidDate(previousDate) ? Number(previousDate.slice(-2)) : 1
  return dates[Math.min(day, dates.length) - 1]
}
