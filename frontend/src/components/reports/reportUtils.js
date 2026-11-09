import { formatCashFlowTick } from '../../utils/cashFlow.js'

export const MIN_REPORT_YEAR = 1900
export const MAX_REPORT_YEAR = 2100
export const MAX_REPORT_MONTHS = 6
export const DEFAULT_PRESET_MONTHS = 3

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatReportMoney(amount) {
  const num = Number(amount)
  if (!Number.isFinite(num)) return '0 ₫'
  const normalized = Object.is(num, -0) ? 0 : num
  return `${vndFormatter.format(normalized)} ₫`
}

export function formatReportAxisTick(value) {
  return formatCashFlowTick(value)
}

export function calculateExpensePercentage(totalAmount, periodTotalExpense) {
  const amount = Number(totalAmount)
  const total = Number(periodTotalExpense)
  if (!Number.isFinite(amount) || !Number.isFinite(total) || amount <= 0 || total <= 0) {
    return 0
  }
  return Math.round(((amount / total) * 100 + Number.EPSILON) * 100) / 100
}

export function formatReportPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0%'
  return `${percentFormatter.format(num)}%`
}

export function parseMonthString(value) {
  if (typeof value !== 'string') return null
  const match = MONTH_PATTERN.exec(value.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  if (
    !Number.isInteger(year) ||
    year < MIN_REPORT_YEAR ||
    year > MAX_REPORT_YEAR ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null
  }

  return { year, month }
}

export function isValidMonthString(value) {
  return parseMonthString(value) !== null
}

export function formatMonthValue(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function formatMonthLabel(value) {
  const parsed = parseMonthString(value)
  if (!parsed) return String(value || '')
  return `Tháng ${String(parsed.month).padStart(2, '0')}/${parsed.year}`
}

export function formatShortMonthLabel(value) {
  const parsed = parseMonthString(value)
  if (!parsed) return String(value || '')
  return `${String(parsed.month).padStart(2, '0')}/${parsed.year}`
}

export function getCurrentVietnamMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  if (year && month) return `${year}-${month}`
  return formatMonthValue(now.getFullYear(), now.getMonth() + 1)
}

export function shiftMonthString(monthStr, deltaMonths) {
  const parsed = parseMonthString(monthStr)
  if (!parsed || !Number.isInteger(deltaMonths)) return null
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1 + deltaMonths, 1))
  const nextYear = date.getUTCFullYear()
  const nextMonth = date.getUTCMonth() + 1
  if (nextYear < MIN_REPORT_YEAR || nextYear > MAX_REPORT_YEAR) return null
  return formatMonthValue(nextYear, nextMonth)
}

export function countMonthsInclusive(from, to) {
  const start = parseMonthString(from)
  const end = parseMonthString(to)
  if (!start || !end) return NaN
  return (end.year - start.year) * 12 + (end.month - start.month) + 1
}

export function validateMonthRange(from, to) {
  const start = parseMonthString(from)
  const end = parseMonthString(to)

  if (!start || !end) {
    return {
      valid: false,
      code: 'INVALID_FORMAT',
      message: 'Kỳ báo cáo phải đúng định dạng YYYY-MM (năm từ 1900 đến 2100).',
    }
  }

  const monthCount = countMonthsInclusive(from, to)
  if (monthCount < 1) {
    return {
      valid: false,
      code: 'FROM_AFTER_TO',
      message: 'Tháng bắt đầu không được lớn hơn tháng kết thúc.',
    }
  }

  if (monthCount > MAX_REPORT_MONTHS) {
    return {
      valid: false,
      code: 'RANGE_TOO_LARGE',
      message: `Khoảng thời gian báo cáo tối đa ${MAX_REPORT_MONTHS} tháng (hiện đang chọn ${monthCount} tháng).`,
    }
  }

  return {
    valid: true,
    code: null,
    message: '',
    monthCount,
  }
}

export function buildPresetRange(presetKey, anchorMonth = getCurrentVietnamMonth()) {
  const anchor = parseMonthString(anchorMonth) ? anchorMonth : getCurrentVietnamMonth()

  if (presetKey === '1M') {
    return { from: anchor, to: anchor }
  }

  if (presetKey === '6M') {
    const start = shiftMonthString(anchor, -5) || `${MIN_REPORT_YEAR}-01`
    return { from: start, to: anchor }
  }

  const months = presetKey === '3M' ? 3 : DEFAULT_PRESET_MONTHS
  const start = shiftMonthString(anchor, -(months - 1)) || `${MIN_REPORT_YEAR}-01`
  return {
    from: start,
    to: anchor,
  }
}

export function summarizeReportMonths(months = []) {
  if (!Array.isArray(months) || months.length === 0) {
    return {
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
    }
  }

  let totalIncomeCents = 0
  let totalExpenseCents = 0
  let balanceCents = 0

  for (const item of months) {
    totalIncomeCents += Math.round(Number(item?.totalIncome || 0) * 100)
    totalExpenseCents += Math.round(Number(item?.totalExpense || 0) * 100)
    balanceCents += Math.round(Number(item?.balance || 0) * 100)
  }

  return {
    totalIncome: totalIncomeCents / 100,
    totalExpense: totalExpenseCents / 100,
    balance: balanceCents / 100,
  }
}

export const REPORT_PRESETS = [
  { id: '1M', label: 'Tháng này' },
  { id: '3M', label: '3 tháng gần nhất' },
  { id: '6M', label: '6 tháng gần nhất' },
]
