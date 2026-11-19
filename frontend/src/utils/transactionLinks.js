import { isValidDate } from './transactionForm.js'
import { isValidMonthString } from '../components/reports/reportUtils.js'

const validDay = (value) => isValidDate(value) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2100
const validId = (value) => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value))

export function buildAnalysisTransactionLink(filter) {
  if (!filter || !validDay(filter.startDate) || !validDay(filter.endDate) || filter.startDate > filter.endDate
      || (filter.categoryId != null && !validId(filter.categoryId))) return '/transactions'
  const params = new URLSearchParams({ startDate: filter.startDate, endDate: filter.endDate, type: 'EXPENSE' })
  if (filter.categoryId != null) params.set('categoryId', String(filter.categoryId))
  return `/transactions?${params}`
}

export function parseTransactionSearch(search, fallbackMonth) {
  const empty = { filters: { month: fallbackMonth, type: '', categoryId: '' }, dateRange: { startDate: '', endDate: '' } }
  const params = new URLSearchParams(search || '')
  if (['month', 'type', 'categoryId', 'startDate', 'endDate'].some(key => params.getAll(key).length > 1)) return empty
  const month = params.get('month'), type = params.get('type') || '', categoryId = params.get('categoryId') || ''
  const startDate = params.get('startDate') || '', endDate = params.get('endDate') || ''
  const hasRange = Boolean(startDate || endDate)
  if ((type && !['INCOME', 'EXPENSE'].includes(type)) || (categoryId && !validId(categoryId))
      || (month && (!isValidMonthString(month) || month.trim() !== month))
      || (hasRange && (month || !validDay(startDate) || !validDay(endDate) || startDate > endDate))) return empty
  return { filters: { month: hasRange ? '' : month || fallbackMonth, type, categoryId }, dateRange: { startDate, endDate } }
}
