import { isValidDate } from '../utils/transactionForm.js'

export const AI_ANALYSIS_INTENTS = ['SPENDING_INSIGHT', 'BUDGET_FORECAST', 'PURCHASE_SIMULATION']
export const AI_ANALYSIS_QUESTIONS = ['Vì sao tháng này tôi chi nhiều?', 'Dự báo ngân sách tháng này', 'Thử mô phỏng một khoản mua']
const statuses = {
  SPENDING_INSIGHT: ['READY', 'NO_DATA'],
  BUDGET_FORECAST: ['READY', 'NOT_CURRENT_MONTH', 'BUDGET_NOT_SET', 'INSUFFICIENT_DATA'],
  PURCHASE_SIMULATION: ['READY', 'NOT_CURRENT_MONTH', 'BUDGET_NOT_SET', 'INSUFFICIENT_DATA', 'NEEDS_AMOUNT'],
}
const fail = () => { throw Object.assign(new Error('Kết quả phân tích tài chính không hợp lệ.'), { code: 'INVALID_API_RESPONSE' }) }
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const text = (value, max = 600) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail()
  return value.trim()
}
const number = (value, negative = false) => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))
      || (!negative && Number(value) < 0)) fail()
  return Object.is(Number(value), -0) ? 0 : Number(value)
}
const id = value => { if (!Number.isSafeInteger(value) || value <= 0) fail(); return value }
const date = value => {
  if (!isValidDate(value) || Number(value.slice(0, 4)) < 1900 || Number(value.slice(0, 4)) > 2100) fail()
  return value
}
const list = (value, max, map) => {
  if (!Array.isArray(value) || value.length > max) fail()
  return value.map(map)
}
export function normalizeAiAnalysis(raw, intent, period) {
  if (!object(raw) || raw.kind !== intent || !statuses[intent]?.includes(raw.status)) fail()
  const startDate = date(raw.startDate), endDate = date(raw.endDate)
  if (startDate > endDate || startDate.slice(0, 7) !== period || endDate.slice(0, 7) !== period) fail()
  const drivers = list(raw.drivers, 3, item => {
    if (!object(item)) fail()
    return { categoryId: id(item.categoryId), categoryName: text(item.categoryName, 100),
      previousAmount: number(item.previousAmount), currentAmount: number(item.currentAmount), delta: number(item.delta, true) }
  })
  if (new Set(drivers.map(d => d.categoryId)).size !== drivers.length) fail()
  const evidence = list(raw.evidence, 3, item => {
    if (!object(item)) fail()
    const day = date(item.date)
    if (day < startDate || day > endDate || (item.note != null && (typeof item.note !== 'string' || item.note.length > 500))) fail()
    const amount = number(item.amount)
    if (amount <= 0) fail()
    return { id: id(item.id), date: day, categoryName: text(item.categoryName, 100), note: item.note || '', amount }
  })
  if (new Set(evidence.map(e => e.id)).size !== evidence.length) fail()
  let transactionFilter = null
  if (raw.transactionFilter != null) {
    const f = raw.transactionFilter
    if (!object(f) || f.startDate !== startDate || f.endDate !== endDate) fail()
    transactionFilter = { startDate, endDate, categoryId: f.categoryId == null ? null : id(f.categoryId) }
    if (transactionFilter.categoryId != null && !drivers.some(d => d.categoryId === transactionFilter.categoryId)) fail()
  }
  return { kind: intent, status: raw.status, title: text(raw.title, 100), summary: text(raw.summary),
    asOf: date(raw.asOf), startDate, endDate,
    metrics: list(raw.metrics, 3, item => {
      if (!object(item) || item.format !== 'MONEY') fail()
      return { label: text(item.label, 100), value: number(item.value, true), format: 'MONEY' }
    }),
    highlights: list(raw.highlights, 3, value => text(value)), drivers, evidence, transactionFilter,
    assumptions: list(raw.assumptions, 6, value => text(value, 800)) }
}
