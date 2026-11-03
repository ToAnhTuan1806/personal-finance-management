export const MIN_CALENDAR_YEAR = 1900
export const MAX_CALENDAR_YEAR = 2100
export const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export function isCalendarPeriod(year, month) {
  return Number.isInteger(year) && year >= MIN_CALENDAR_YEAR && year <= MAX_CALENDAR_YEAR &&
    Number.isInteger(month) && month >= 1 && month <= 12
}

export function monthDates(year, month) {
  if (!isCalendarPeriod(year, month)) throw new RangeError('Tháng/năm không hợp lệ.')
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`)
}

// Chỉ dùng UTC để tính thứ/số ngày; ngày DATE từ API luôn giữ nguyên chuỗi.
export function monthCells(year, month) {
  const dates = monthDates(year, month)
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const cells = [...Array(offset).fill(null), ...dates]
  while (cells.length % 7) cells.push(null)
  return cells
}

export function shiftMonth({ year, month }, direction) {
  const date = new Date(Date.UTC(year, month - 1 + direction, 1))
  const next = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
  return isCalendarPeriod(next.year, next.month) ? next : null
}

const fullMoney = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
const shortMoney = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 })
export const formatCalendarMoney = (amount) => fullMoney.format(amount) + ' ₫'
export const compactCalendarMoney = (amount) => shortMoney.format(amount)
