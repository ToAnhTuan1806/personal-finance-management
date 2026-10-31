import { getTransactions } from './transactionService.js'
import { isValidDate } from '../utils/transactionForm.js'

export const DAY_PAGE_SIZE = 10
const invalid = () => Object.assign(new Error('Response chi tiết ngày không hợp lệ.'), { code: 'INVALID_API_RESPONSE' })
export async function getDayTransactions(date, page = 0, options = {}) {
  if (!isValidDate(date) || !Number.isInteger(page) || page < 0 || page * DAY_PAGE_SIZE > 2147483647) throw new RangeError('Ngày/trang không hợp lệ.')
  // Backend cố định sort ngày DESC/id DESC; không gửi month, sort hoặc userId.
  const data = await getTransactions({ startDate: date, endDate: date, page, size: DAY_PAGE_SIZE }, options)
  if (!Array.isArray(data?.content) || data.number !== page || data.size !== DAY_PAGE_SIZE ||
    !Number.isInteger(data.totalElements) || data.totalElements < 0 ||
    !Number.isInteger(data.totalPages) || data.totalPages !== Math.ceil(data.totalElements / DAY_PAGE_SIZE) ||
    data.content.length > DAY_PAGE_SIZE || data.content.some((row) => !row || row.transactionDate !== date ||
      !Number.isInteger(row.id) || !Number.isInteger(row.categoryId) || !['INCOME', 'EXPENSE'].includes(row.type) ||
      typeof row.categoryName !== 'string' || typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount <= 0 ||
      (row.note !== null && typeof row.note !== 'string'))) throw invalid()
  return data
}
