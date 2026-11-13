import axiosClient from '../api/axiosClient.js'
import {
  isValidMonthString,
  summarizeReportMonths,
  validateMonthRange,
} from '../components/reports/reportUtils.js'
import {
  exportReportTransactionsCsv,
  monthRangeToDateRange,
} from './csvExportService.js'

const invalidResponse = (message) =>
  Object.assign(new Error(message), { code: 'INVALID_API_RESPONSE' })

const invalidRange = (message) =>
  Object.assign(new Error(message), { code: 'INVALID_REPORT_RANGE' })

function toFiniteNumber(value, fieldName, { allowNegative = false } = {}) {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    throw invalidResponse(`Trường ${fieldName} từ Backend không hợp lệ`)
  }
  const num = Number(value)
  if (!Number.isFinite(num)) {
    throw invalidResponse(`Trường ${fieldName} từ Backend không phải là số hợp lệ`)
  }
  if (!allowNegative && num < 0) {
    throw invalidResponse(`Trường ${fieldName} từ Backend không được âm`)
  }
  return Object.is(num, -0) ? 0 : num
}

export function normalizeMonthlyReport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw invalidResponse('Phản hồi báo cáo thu chi từ Backend không đúng cấu trúc')
  }

  if (!isValidMonthString(data.from) || !isValidMonthString(data.to)) {
    throw invalidResponse('Phản hồi báo cáo thu chi thiếu khoảng tháng hợp lệ (from, to)')
  }

  if (!Array.isArray(data.months)) {
    throw invalidResponse('Phản hồi báo cáo thu chi thiếu danh sách months')
  }

  if (!Array.isArray(data.expensesByCategory)) {
    throw invalidResponse('Phản hồi báo cáo thu chi thiếu danh sách expensesByCategory')
  }

  const months = data.months.map((item, index) => {
    if (!item || typeof item !== 'object' || !isValidMonthString(item.month)) {
      throw invalidResponse(`Mục months[${index}] không có tháng hợp lệ`)
    }

    return {
      month: item.month,
      totalIncome: toFiniteNumber(item.totalIncome, `months[${index}].totalIncome`),
      totalExpense: toFiniteNumber(item.totalExpense, `months[${index}].totalExpense`),
      balance: toFiniteNumber(item.balance, `months[${index}].balance`, { allowNegative: true }),
    }
  })

  const expensesByCategory = data.expensesByCategory.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw invalidResponse(`Mục expensesByCategory[${index}] không đúng cấu trúc`)
    }
    if (!Number.isInteger(item.categoryId) || item.categoryId <= 0) {
      throw invalidResponse(`Mục expensesByCategory[${index}].categoryId không hợp lệ`)
    }
    if (typeof item.categoryName !== 'string' || item.categoryName.trim() === '') {
      throw invalidResponse(`Mục expensesByCategory[${index}].categoryName không hợp lệ`)
    }

    return {
      categoryId: item.categoryId,
      categoryName: item.categoryName.trim(),
      totalAmount: toFiniteNumber(
        item.totalAmount,
        `expensesByCategory[${index}].totalAmount`
      ),
    }
  })

  return {
    from: data.from,
    to: data.to,
    months,
    expensesByCategory,
    summary: summarizeReportMonths(months),
  }
}

export async function getMonthlyReport(params = {}, options = {}) {
  const { from, to } = params || {}
  const validation = validateMonthRange(from, to)
  if (!validation.valid) {
    throw invalidRange(validation.message)
  }

  const response = await axiosClient.get('/reports/monthly', {
    ...options,
    params: { from, to },
  })

  const result = normalizeMonthlyReport(response.data)
  if (result.from !== from || result.to !== to) {
    throw invalidResponse('Khoảng tháng phản hồi từ Backend không khớp với yêu cầu')
  }

  return result
}

export { exportReportTransactionsCsv, monthRangeToDateRange }

export const reportService = {
  getMonthlyReport,
  normalizeMonthlyReport,
  exportReportTransactionsCsv,
  monthRangeToDateRange,
}

export default reportService
