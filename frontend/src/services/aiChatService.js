import axiosClient from '../api/axiosClient.js'
import { getApiErrorMessage, isRequestCancelled } from '../api/errors.js'
import { session } from '../auth/session.js'
import { AI_ANALYSIS_INTENTS, AI_ANALYSIS_QUESTIONS, normalizeAiAnalysis } from './aiAnalysis.js'
import { isValidDate, transactionDateError } from '../utils/transactionForm.js'
import {
  getCurrentVietnamMonth,
  isValidMonthString,
  shiftMonthString,
  formatShortMonthLabel,
  formatReportMoney,
  formatReportPercent,
} from '../components/reports/reportUtils.js'

export const AI_CHAT_TIMEOUT_MS = 35000
export const MAX_AI_MESSAGE_LENGTH = 500

export const AI_SUGGESTED_QUESTIONS = [
  'Tháng này tôi đã chi bao nhiêu?',
  'Danh mục nào tôi chi nhiều nhất?',
  'Ngân sách tháng này còn bao nhiêu?',
  'Tôi nên quản lý chi tiêu như thế nào?',
  'So sánh thu chi với tháng trước.',
  'Danh mục nào tăng chi tiêu nhiều nhất?',
]

export const AI_CONTEXT_INTENTS = ['SUMMARY', 'CATEGORIES', 'BUDGET', 'ADVICE', 'COMPARISON', 'CATEGORY_TREND', ...AI_ANALYSIS_INTENTS]

export const AI_UNKNOWN_DISPLAY_REPLY =
  'Mình chưa hiểu rõ. Bạn muốn ghi khoản chi hay xem thu chi? Để ghi chi, hãy nhập nội dung và số tiền.'

export const AI_GREETING_DISPLAY_REPLY =
  'Xin chào! Bạn muốn ghi khoản chi hay xem thu chi?\nGhi chi theo mẫu: nội dung + số tiền + ghi chú (nếu có). Mình sẽ chờ bạn xác nhận trước khi lưu.'

export const AI_UNSUPPORTED_DISPLAY_REPLY =
  'Yêu cầu này chưa nằm trong phạm vi trợ lý tài chính. Bạn có thể hỏi về thu chi, danh mục, ngân sách hoặc so sánh các tháng.'

const AI_TECHNICAL_LABELS = {
  CATEGORY_TREND: 'xu hướng chi tiêu theo danh mục',
  OVER_BUDGET: 'vượt ngân sách',
  COMPARISON: 'so sánh hai tháng',
  CATEGORIES: 'phân tích danh mục',
  NOT_SET: 'chưa thiết lập',
  SUMMARY: 'tổng quan thu chi',
  BUDGET: 'kiểm tra ngân sách',
  ADVICE: 'tư vấn quản lý chi tiêu',
  WARNING: 'sắp chạm hạn mức',
  SAFE: 'trong ngân sách',
  SET: 'đã thiết lập',
  UNKNOWN: 'chưa xác định yêu cầu',
  UNSUPPORTED: 'chưa được hỗ trợ',
  GREETING: 'lời chào',
  CREATE_EXPENSE: 'soạn khoản chi',
}

export function formatAiReplyForDisplay(reply, intent) {
  if (intent === 'GREETING') return AI_GREETING_DISPLAY_REPLY
  if (intent === 'UNKNOWN') return AI_UNKNOWN_DISPLAY_REPLY
  if (intent === 'UNSUPPORTED') return AI_UNSUPPORTED_DISPLAY_REPLY

  return Object.entries(AI_TECHNICAL_LABELS).reduce(
    (text, [technicalName, vietnameseLabel]) =>
      text.replace(new RegExp(`\\b${technicalName}\\b`, 'g'), vietnameseLabel),
    String(reply || '')
  )
}

// Chỉ dùng structured fields đã xác thực để tóm tắt; không phân tích số từ reply.
export function getAiResponseSummary(message) {
  const { intent, stats, topCategories, budget, comparison } = message || {}
  if (intent === 'SUMMARY' && stats) return 'Thu chi của bạn trong tháng:'
  if (intent === 'CATEGORIES' && stats) {
    if (stats.totalExpense === 0) return 'Kỳ này chưa có chi tiêu.'
    return topCategories?.length
      ? `Bạn chi nhiều nhất cho ${topCategories[0].categoryName}.`
      : 'Chưa có dữ liệu phân bổ chi tiêu theo danh mục.'
  }
  if (intent === 'BUDGET' && budget) {
    if (budget.status === 'NOT_SET') return 'Bạn chưa đặt ngân sách tháng. Hãy đặt hạn mức để theo dõi chi tiêu.'
    const monthly = budget.monthly
    if (monthly?.exceeded) return `Bạn đã vượt ngân sách ${formatReportMoney(Math.abs(monthly.remainingAmount))}. Hãy rà soát các khoản có thể hoãn.`
    if (monthly?.remainingAmount === 0) return 'Bạn đã dùng hết hạn mức tháng. Cân nhắc trước khi chi thêm.'
    return 'Ngân sách tháng vẫn còn. Xem số tiền còn lại bên dưới.'
  }
  if (['COMPARISON', 'CATEGORY_TREND'].includes(intent) && comparison) {
    const delta = comparison.delta.totalExpense
    const change = delta === 0 ? 'không đổi'
      : `${delta > 0 ? 'tăng' : 'giảm'} ${formatReportMoney(Math.abs(delta))}`
    const percent = delta !== 0 && comparison.expenseChangePercent !== null
      ? ` (${formatReportPercent(Math.abs(comparison.expenseChangePercent))})` : ''
    const summary = `Chi tiêu ${change}${percent} so với tháng ${formatShortMonthLabel(comparison.baseMonth)}.`
    if (intent !== 'CATEGORY_TREND') return summary
    const highest = comparison.categoryTrends.reduce((best, item) => item.delta > (best?.delta ?? 0) ? item : best, null)
    return `${summary}\n${highest ? `Tăng nhiều nhất: ${highest.categoryName}.` : 'Không có danh mục nào tăng chi tiêu.'}`
  }
  return null
}

function isAiFollowUp(message) {
  return /^(con|the|vay|va)\s/.test(String(message || '').normalize('NFKC').normalize('NFD').replace(/\p{M}|\p{Cf}/gu, '').toLowerCase().trim())
}

export function normalizeAiContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)
      || !AI_CONTEXT_INTENTS.includes(context.intent) || !isValidMonthString(context.month)
      || context.month.trim() !== context.month
      || (context.compareMonth != null && (!isValidMonthString(context.compareMonth)
        || context.compareMonth.trim() !== context.compareMonth || context.compareMonth === context.month))) {
    throw invalidRequest('Ngữ cảnh không hợp lệ')
  }
  return { intent: context.intent, month: context.month,
    ...(context.compareMonth == null ? {} : { compareMonth: context.compareMonth }) }
}

export function getAiResponseContext(response) {
  if (!AI_CONTEXT_INTENTS.includes(response?.intent)) return null
  try {
    return normalizeAiContext({ intent: response.intent, month: response.period,
      ...(response.comparison ? { compareMonth: response.comparison.baseMonth } : {}) })
  } catch { return null }
}

export function getAiSuggestedQuestions({ context, lastIntent } = {}) {
  if (lastIntent === 'GREETING') {
    return ['Số dư tháng này bao nhiêu?', 'Ngân sách tháng này còn bao nhiêu?', 'Danh mục nào tôi chi nhiều nhất?']
  }
  if (lastIntent === 'UNKNOWN' || lastIntent === 'UNSUPPORTED') {
    return [AI_SUGGESTED_QUESTIONS[0], AI_SUGGESTED_QUESTIONS[4], AI_SUGGESTED_QUESTIONS[5]]
  }
  if (!context || AI_ANALYSIS_INTENTS.includes(context.intent)) return [...AI_ANALYSIS_QUESTIONS, ...AI_SUGGESTED_QUESTIONS.slice(0, 3)]
  const period = formatShortMonthLabel(context.month)
  return [
    'Còn tháng trước thì sao?',
    context.intent === 'CATEGORIES' || context.intent === 'CATEGORY_TREND'
      ? `Xu hướng chi tiêu theo danh mục ${period} thay đổi thế nào?`
      : `Danh mục chi tiêu ${period} nào nhiều nhất?`,
    `Tổng thu chi tháng ${period} bao nhiêu?`,
    ...(getDefaultCompareMonth(context.month) ? [`So sánh thu chi ${period} với ${formatShortMonthLabel(getDefaultCompareMonth(context.month))}`] : []),
    `Ngân sách tháng ${period} còn bao nhiêu?`,
  ]
}

export const AI_ERROR_MESSAGES = {
  TIMEOUT: 'Trợ lý phản hồi quá lâu. Vui lòng thử lại sau.',
  RATE_LIMIT: 'Bạn đã đạt giới hạn yêu cầu. Vui lòng thử lại sau.',
  UNAVAILABLE: 'Trợ lý AI đang tạm thời bận. Vui lòng thử lại sau ít phút.',
  NETWORK: 'Không thể kết nối tới trợ lý AI. Vui lòng kiểm tra kết nối mạng.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  VALIDATION: 'Câu hỏi hoặc tháng không hợp lệ. Vui lòng kiểm tra lại.',
  INVALID_RESPONSE: 'Phản hồi từ trợ lý AI không hợp lệ. Vui lòng thử lại sau.',
}

const invalidResponse = (message) =>
  Object.assign(new Error(message), { code: 'INVALID_API_RESPONSE' })

const invalidRequest = (message) =>
  Object.assign(new Error(message), { code: 'INVALID_AI_REQUEST' })

function toFiniteNumber(value, fieldName, { allowNegative = false } = {}) {
  if (
    typeof value === 'boolean' ||
    value === null ||
    value === undefined ||
    value === ''
  ) {
    throw invalidResponse(`Trường ${fieldName} từ trợ lý AI không hợp lệ`)
  }
  const num = Number(value)
  if (!Number.isFinite(num)) {
    throw invalidResponse(`Trường ${fieldName} từ trợ lý AI không phải số hợp lệ`)
  }
  if (!allowNegative && num < 0) {
    throw invalidResponse(`Trường ${fieldName} từ trợ lý AI không được âm`)
  }
  return Object.is(num, -0) ? 0 : num
}

function normalizeStats(stats) {
  if (stats === null || stats === undefined) return null
  if (typeof stats !== 'object' || Array.isArray(stats)) {
    throw invalidResponse('Trường stats từ trợ lý AI không đúng cấu trúc')
  }
  return {
    totalIncome: toFiniteNumber(stats.totalIncome, 'stats.totalIncome'),
    totalExpense: toFiniteNumber(stats.totalExpense, 'stats.totalExpense'),
    balance: toFiniteNumber(stats.balance, 'stats.balance', {
      allowNegative: true,
    }),
  }
}

function normalizeTopCategories(topCategories) {
  if (!Array.isArray(topCategories)) {
    throw invalidResponse('Trường topCategories từ trợ lý AI phải là mảng')
  }
  return topCategories.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw invalidResponse(`Mục topCategories[${index}] không đúng cấu trúc`)
    }
    if (!Number.isInteger(item.categoryId) || item.categoryId <= 0) {
      throw invalidResponse(`Mục topCategories[${index}].categoryId không hợp lệ`)
    }
    if (typeof item.categoryName !== 'string' || item.categoryName.trim() === '') {
      throw invalidResponse(`Mục topCategories[${index}].categoryName không hợp lệ`)
    }
    return {
      categoryId: item.categoryId,
      categoryName: item.categoryName.trim(),
      totalAmount: toFiniteNumber(
        item.totalAmount,
        `topCategories[${index}].totalAmount`
      ),
      sharePercentage: toFiniteNumber(
        item.sharePercentage,
        `topCategories[${index}].sharePercentage`
      ),
    }
  })
}

function normalizeMonthlyBudget(monthly) {
  if (monthly === null || monthly === undefined) return null
  if (typeof monthly !== 'object' || Array.isArray(monthly)) {
    throw invalidResponse('Trường budget.monthly không đúng cấu trúc')
  }
  return {
    id: monthly.id ?? null,
    year: Number.isInteger(monthly.year) ? monthly.year : Number(monthly.year || 0),
    month: Number.isInteger(monthly.month) ? monthly.month : Number(monthly.month || 0),
    amountLimit: toFiniteNumber(monthly.amountLimit, 'budget.monthly.amountLimit'),
    spentAmount: toFiniteNumber(monthly.spentAmount, 'budget.monthly.spentAmount'),
    remainingAmount: toFiniteNumber(
      monthly.remainingAmount,
      'budget.monthly.remainingAmount',
      { allowNegative: true }
    ),
    exceeded: Boolean(monthly.exceeded),
  }
}

function normalizeCategoryBudgets(categories) {
  if (!Array.isArray(categories)) {
    throw invalidResponse('Trường budget.categories phải là mảng')
  }
  return categories.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw invalidResponse(`Mục budget.categories[${index}] không đúng cấu trúc`)
    }
    if (!Number.isInteger(item.categoryId) || item.categoryId <= 0) {
      throw invalidResponse(
        `Mục budget.categories[${index}].categoryId không hợp lệ`
      )
    }
    if (typeof item.categoryName !== 'string' || item.categoryName.trim() === '') {
      throw invalidResponse(
        `Mục budget.categories[${index}].categoryName không hợp lệ`
      )
    }
    return {
      id: item.id ?? null,
      categoryId: item.categoryId,
      categoryName: item.categoryName.trim(),
      year: Number.isInteger(item.year) ? item.year : Number(item.year || 0),
      month: Number.isInteger(item.month) ? item.month : Number(item.month || 0),
      amountLimit: toFiniteNumber(
        item.amountLimit,
        `budget.categories[${index}].amountLimit`
      ),
      spentAmount: toFiniteNumber(
        item.spentAmount,
        `budget.categories[${index}].spentAmount`
      ),
      remainingAmount: toFiniteNumber(
        item.remainingAmount,
        `budget.categories[${index}].remainingAmount`,
        { allowNegative: true }
      ),
      usagePercentage: toFiniteNumber(
        item.usagePercentage,
        `budget.categories[${index}].usagePercentage`
      ),
      exceeded: Boolean(item.exceeded),
      status: typeof item.status === 'string' ? item.status : 'SAFE',
    }
  })
}

function normalizeBudget(budget) {
  if (budget === null || budget === undefined) return null
  if (typeof budget !== 'object' || Array.isArray(budget)) {
    throw invalidResponse('Trường budget từ trợ lý AI không đúng cấu trúc')
  }

  const status = budget.status
  if (status !== 'SET' && status !== 'NOT_SET') {
    throw invalidResponse('Trường budget.status phải là SET hoặc NOT_SET')
  }

  // Nếu chưa đặt ngân sách (NOT_SET hoặc monthly === null), tuyệt đối không biến thành ngân sách 0.
  const monthly =
    status === 'NOT_SET' || budget.monthly === null || budget.monthly === undefined
      ? null
      : normalizeMonthlyBudget(budget.monthly)

  if (status === 'SET' && !monthly) {
    throw invalidResponse('Trường budget.monthly bị thiếu khi status là SET')
  }

  const categories = normalizeCategoryBudgets(budget.categories ?? [])

  return {
    status: monthly ? 'SET' : 'NOT_SET',
    monthly,
    categories,
  }
}

export function getDefaultCompareMonth(month) {
  return shiftMonthString(month, -1) || ''
}

// P2 chỉ nhận số JSON hữu hạn từ Backend; không tự tính số liệu hoặc bù field thiếu bằng 0.
export function normalizeAiComparison(value, targetMonth) {
  const object = (item) => item && typeof item === 'object' && !Array.isArray(item)
  const number = (item, allowNegative = false) => {
    if (typeof item !== 'number' || !Number.isFinite(item) || (!allowNegative && item < 0)) {
      throw invalidResponse('Số liệu comparison không hợp lệ')
    }
    return Object.is(item, -0) ? 0 : item
  }
  const stats = (item, delta = false) => {
    if (!object(item)) throw invalidResponse('Thiếu số liệu comparison')
    return {
      totalIncome: number(item.totalIncome, delta),
      totalExpense: number(item.totalExpense, delta),
      balance: number(item.balance, true),
    }
  }
  const percent = (item, baseExpense) => {
    if (baseExpense === 0) {
      if (item !== null) throw invalidResponse('Tỷ lệ comparison phải null khi kỳ gốc bằng 0')
      return null
    }
    return number(item, true)
  }
  if (!object(value) || !isValidMonthString(value.baseMonth) || !isValidMonthString(value.targetMonth)
      || value.baseMonth.trim() !== value.baseMonth || value.targetMonth.trim() !== value.targetMonth
      || value.baseMonth === value.targetMonth || (targetMonth && value.targetMonth !== targetMonth)
      || !Array.isArray(value.categoryTrends)) {
    throw invalidResponse('Kỳ hoặc cấu trúc comparison không hợp lệ')
  }
  const base = stats(value.base)
  const target = stats(value.target)
  const ids = new Set()
  const categoryTrends = value.categoryTrends.map((item) => {
    if (!object(item) || !Number.isSafeInteger(item.categoryId) || item.categoryId <= 0
        || ids.has(item.categoryId) || typeof item.categoryName !== 'string' || !item.categoryName.trim()) {
      throw invalidResponse('Danh mục comparison không hợp lệ')
    }
    ids.add(item.categoryId)
    const baseExpense = number(item.baseExpense)
    return {
      categoryId: item.categoryId, categoryName: item.categoryName.trim(), baseExpense,
      targetExpense: number(item.targetExpense), delta: number(item.delta, true),
      changePercent: percent(item.changePercent, baseExpense),
    }
  })
  return {
    baseMonth: value.baseMonth, targetMonth: value.targetMonth, base, target,
    delta: stats(value.delta, true),
    expenseChangePercent: percent(value.expenseChangePercent, base.totalExpense), categoryTrends,
  }
}

export function normalizeSuggestedExpense(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw invalidResponse('Thiếu đề xuất chi tiêu hợp lệ')
  }
  const number = (value, field) => {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') {
      throw invalidResponse(`Trường ${field} của đề xuất chi tiêu không hợp lệ`)
    }
    return toFiniteNumber(value, field)
  }
  const amount = number(raw.amount, 'amount')
  const categoryId = raw.categoryId == null ? null : number(raw.categoryId, 'categoryId')
  const type = raw.type == null ? 'EXPENSE' : raw.type
  if (amount <= 0 || !/^\d{1,13}(?:\.\d{1,2})?$/.test(String(amount))
      || (categoryId !== null && (!Number.isSafeInteger(categoryId) || categoryId <= 0))
      || (raw.categoryName != null && typeof raw.categoryName !== 'string')
      || typeof raw.note !== 'string' || raw.note.length > 500
      || !isValidDate(raw.transactionDate) || type !== 'EXPENSE') {
    throw invalidResponse('Thông tin đề xuất chi tiêu không hợp lệ')
  }
  return { amount, categoryId, categoryName: raw.categoryName?.trim() || null,
    note: raw.note, transactionDate: raw.transactionDate, type }
}

export function normalizeAiChatResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw invalidResponse('Phản hồi trợ lý AI không đúng cấu trúc đối tượng')
  }

  if (typeof data.reply !== 'string' || data.reply.trim() === '') {
    throw invalidResponse('Phản hồi trợ lý AI thiếu nội dung reply hợp lệ')
  }

  if (typeof data.period !== 'string' || !isValidMonthString(data.period)) {
    throw invalidResponse('Phản hồi trợ lý AI thiếu kỳ thống kê period hợp lệ')
  }

  if (data.period.trim() !== data.period) throw invalidResponse('Kỳ thống kê phải đúng YYYY-MM')

  if (typeof data.intent !== 'string' || data.intent.trim() === '') {
    throw invalidResponse('Phản hồi trợ lý AI thiếu trường intent')
  }

  const intent = data.intent.trim()
  const isAnalysis = AI_ANALYSIS_INTENTS.includes(intent)
  const withoutStats = ['UNKNOWN', 'UNSUPPORTED', 'GREETING', 'CREATE_EXPENSE'].includes(intent) || isAnalysis
  if (!isAnalysis && data.analysis != null) throw invalidResponse('Phân tích không khớp intent')
  const analysis = isAnalysis ? normalizeAiAnalysis(data.analysis, intent, data.period) : null
  if (![...AI_CONTEXT_INTENTS, 'UNKNOWN', 'UNSUPPORTED', 'GREETING', 'CREATE_EXPENSE'].includes(intent)) {
    throw invalidResponse('Intent không thuộc API Contract')
  }
  if (withoutStats
      && (data.stats != null || data.budget != null || data.comparison != null || data.topCategories?.length)) {
    throw invalidResponse('Phản hồi không xác định không được chứa số liệu')
  }
  if (intent !== 'CREATE_EXPENSE' && data.suggestedExpense != null) {
    throw invalidResponse('Đề xuất chi tiêu phải thuộc intent CREATE_EXPENSE')
  }
  const comparison = ['COMPARISON', 'CATEGORY_TREND'].includes(data.intent.trim())
    ? normalizeAiComparison(data.comparison, data.period) : null

  return {
    comparison,
    reply: data.reply.trim(),
    period: data.period,
    intent,
    stats: normalizeStats(data.stats),
    topCategories: normalizeTopCategories(data.topCategories
      ?? (['GREETING', 'CREATE_EXPENSE'].includes(intent) ? [] : data.topCategories)),
    budget: normalizeBudget(data.budget),
    ...(intent === 'CREATE_EXPENSE' ? { suggestedExpense: normalizeSuggestedExpense(data.suggestedExpense) } : {}),
    ...(analysis ? { analysis } : {}),
  }
}

export function validateAiChatRequest({ message, month, compareMonth, context } = {}) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : ''
  const trimmedMonth = typeof month === 'string' ? month.trim() : ''

  if (!trimmedMessage) {
    return {
      valid: false,
      message: 'Vui lòng nhập câu hỏi cho trợ lý tài chính.',
    }
  }

  if (trimmedMessage.length > MAX_AI_MESSAGE_LENGTH) {
    return {
      valid: false,
      message: `Câu hỏi tối đa ${MAX_AI_MESSAGE_LENGTH} ký tự.`,
    }
  }

  if (!isValidMonthString(trimmedMonth)) {
    return {
      valid: false,
      message: trimmedMonth
        ? 'Tháng đã chọn chưa hợp lệ. Vui lòng chọn lại tháng trong lịch.'
        : 'Vui lòng chọn tháng muốn xem trước khi gửi câu hỏi.',
    }
  }

  if (compareMonth !== undefined && compareMonth !== null
      && (!isValidMonthString(compareMonth) || compareMonth.trim() === trimmedMonth)) {
    return { valid: false, message: 'Vui lòng chọn một tháng so sánh hợp lệ, khác với tháng đang xem.' }
  }

  let safeContext
  if (context != null) {
    try { safeContext = normalizeAiContext(context) } catch {
      return { valid: false, message: 'Ngữ cảnh hội thoại không hợp lệ. Hãy xóa hội thoại và thử lại.' }
    }
  }
  return {
    valid: true,
    message: '',
    payload: {
      message: trimmedMessage,
      month: trimmedMonth,
      ...(compareMonth == null ? {} : { compareMonth: compareMonth.trim() }),
      ...(safeContext ? { context: safeContext } : {}),
    },
  }
}

export function getAiChatErrorMessage(error) {
  if (isRequestCancelled(error)) return ''

  if (error?.code === 'INVALID_AI_REQUEST' && typeof error?.message === 'string') {
    return error.message
  }

  if (error?.code === 'INVALID_API_RESPONSE') {
    return AI_ERROR_MESSAGES.INVALID_RESPONSE
  }

  const status = error?.response?.status
  const serverCode =
    typeof error?.response?.data?.code === 'string'
      ? error.response.data.code
      : typeof error?.code === 'string'
        ? error.code
        : ''

  if (
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT' ||
    serverCode === 'AI_TIMEOUT' ||
    status === 504
  ) {
    return AI_ERROR_MESSAGES.TIMEOUT
  }

  if (
    status === 429 ||
    serverCode === 'AI_RATE_LIMITED' ||
    serverCode === 'AI_QUOTA_EXCEEDED'
  ) {
    return AI_ERROR_MESSAGES.RATE_LIMIT
  }

  if (
    status === 503 ||
    serverCode === 'AI_UNAVAILABLE' ||
    serverCode === 'AI_NOT_CONFIGURED'
  ) {
    return AI_ERROR_MESSAGES.UNAVAILABLE
  }

  if (status === 401) {
    return AI_ERROR_MESSAGES.UNAUTHORIZED
  }

  if (status === 400) {
    const fieldErrors = error?.response?.data?.errors
    if (fieldErrors && typeof fieldErrors === 'object') {
      if (typeof fieldErrors.message === 'string' && fieldErrors.message.trim()) {
        return fieldErrors.message.trim().slice(0, 200)
      }
      if (typeof fieldErrors.compareMonth === 'string' && fieldErrors.compareMonth.trim()) {
        return fieldErrors.compareMonth.trim().slice(0, 200)
      }
      if (typeof fieldErrors.month === 'string' && fieldErrors.month.trim()) {
        return fieldErrors.month.trim().slice(0, 200)
      }
    }
    const serverMessage =
      typeof error?.response?.data?.message === 'string'
        ? error.response.data.message.trim().slice(0, 200)
        : ''
    return serverMessage || AI_ERROR_MESSAGES.VALIDATION
  }

  if (!status) {
    return AI_ERROR_MESSAGES.NETWORK
  }

  return AI_ERROR_MESSAGES.UNAVAILABLE
}

export async function sendAiChatMessage({ message, month, compareMonth, context } = {}, options = {}) {
  const { apiClient = axiosClient, ...requestOptions } = options
  const validation = validateAiChatRequest({ message, month, compareMonth, context })
  if (!validation.valid) {
    throw invalidRequest(validation.message)
  }

  const response = await apiClient.post('/ai/chat', validation.payload, {
    ...requestOptions,
    timeout: AI_CHAT_TIMEOUT_MS,
  })

  return normalizeAiChatResponse(response.data)
}

export function createAiChatController({
  sessionStore = session,
  sendChat = sendAiChatMessage,
  getDefaultMonth = getCurrentVietnamMonth,
} = {}) {
  const listeners = new Set()
  let sequence = 0
  let activeController = null
  let activeRequestId = 0
  let destroyed = false

  const initialSession = sessionStore.getSnapshot()
  let trackedRevision = initialSession.revision
  let trackedUserId = initialSession.user?.id ?? null

  const initialState = () => {
    const month = getDefaultMonth()
    return {
      open: false,
      month,
      compareMonth: getDefaultCompareMonth(month),
      draft: '',
      messages: [],
      loading: false,
      error: '',
      lastFailedMessage: '',
      context: null,
      lastIntent: '',
    }
  }
  let state = initialState()

  const publish = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  const abortActiveRequest = () => {
    activeRequestId += 1
    if (activeController) {
      try {
        activeController.abort()
      } catch {
        // Ignore abort error
      }
      activeController = null
    }
  }

  const resetForSessionChange = () => {
    abortActiveRequest()
    state = initialState()
    listeners.forEach((listener) => listener())
  }

  const unsubscribeSession = sessionStore.subscribe(() => {
    const snap = sessionStore.getSnapshot()
    const nextUserId = snap.user?.id ?? null
    if (snap.revision !== trackedRevision || nextUserId !== trackedUserId || !snap.user) {
      trackedRevision = snap.revision
      trackedUserId = nextUserId
      resetForSessionChange()
    }
  })

  const sendPromptInternal = async (rawMessage, { preserveDraftOnSuccess = false } = {}) => {
    if (state.loading) return null

    const snap = sessionStore.getSnapshot()
    const requestRevision = snap.revision
    const requestUserId = snap.user?.id ?? null
    const targetMonth = state.month

    const validation = validateAiChatRequest({
      message: rawMessage,
      month: targetMonth,
      compareMonth: state.context && isAiFollowUp(rawMessage) ? undefined : state.compareMonth || undefined,
      context: state.context,
    })
    if (!validation.valid) {
      publish({
        error: validation.message,
        lastFailedMessage: typeof rawMessage === 'string' ? rawMessage : '',
      })
      return null
    }

    const { message: cleanMessage, month: cleanMonth } = validation.payload
    const userMessage = {
      id: `user-${++sequence}`,
      role: 'user',
      content: cleanMessage,
      period: cleanMonth,
    }

    const controller = new AbortController()
    activeController = controller
    const requestId = ++activeRequestId

    publish({
      loading: true,
      error: '',
      lastFailedMessage: '',
      draft: preserveDraftOnSuccess ? state.draft : '',
      messages: [...state.messages, userMessage],
    })

    try {
      const response = await sendChat(
        validation.payload,
        { signal: controller.signal }
      )

      const currentSnap = sessionStore.getSnapshot()
      if (
        requestId !== activeRequestId ||
        currentSnap.revision !== requestRevision ||
        (currentSnap.user?.id ?? null) !== requestUserId
      ) {
        return null
      }

      const assistantMessage = {
        id: `assistant-${++sequence}`,
        role: 'assistant',
        content: response.reply,
        reply: response.reply,
        period: response.period,
        intent: response.intent,
        stats: response.stats,
        topCategories: response.topCategories,
        budget: response.budget,
        comparison: response.comparison ?? null,
        ...(response.analysis ? { analysis: response.analysis } : {}),
        ...(response.suggestedExpense ? { suggestedExpense: response.suggestedExpense,
          expenseStatus: 'pending', expenseError: '' } : {}),
      }

      activeController = null
      publish({
        loading: false,
        error: '',
        lastFailedMessage: '',
        messages: [...state.messages, assistantMessage],
        context: getAiResponseContext(response),
        lastIntent: response.intent,
      })

      return assistantMessage
    } catch (error) {
      const currentSnap = sessionStore.getSnapshot()
      if (
        requestId !== activeRequestId ||
        currentSnap.revision !== requestRevision ||
        (currentSnap.user?.id ?? null) !== requestUserId ||
        isRequestCancelled(error)
      ) {
        return null
      }

      activeController = null
      const errorMsg = getAiChatErrorMessage(error)
      publish({
        loading: false,
        error: errorMsg,
        lastFailedMessage: cleanMessage,
        draft: state.draft || cleanMessage,
      })
      return null
    }
  }

  const updateExpense = (id, patch) => publish({
    messages: state.messages.map(message => message.id === id ? { ...message, ...patch } : message),
  })

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    openPanel() {
      publish({ open: true })
    },
    closePanel() {
      publish({ open: false })
    },
    togglePanel() {
      publish({ open: !state.open })
    },
    setDraft(value) {
      publish({
        draft: typeof value === 'string' ? value : '',
        ...(state.error ? { error: '' } : {}),
      })
    },
    setMonth(monthValue) {
      if (typeof monthValue !== 'string' || monthValue === state.month) return
      abortActiveRequest()
      publish({ month: monthValue, compareMonth: getDefaultCompareMonth(monthValue),
        loading: false, error: '', lastFailedMessage: '' })
    },
    setCompareMonth(compareMonth) {
      if (typeof compareMonth !== 'string' || compareMonth === state.compareMonth) return
      abortActiveRequest()
      publish({ compareMonth, loading: false, error: '', lastFailedMessage: '' })
    },
    clearConversation() {
      abortActiveRequest()
      publish({
        context: null,
        lastIntent: '',
        messages: [],
        loading: false,
        error: '',
        lastFailedMessage: '',
      })
    },
    submitDraft() {
      return sendPromptInternal(state.draft)
    },
    askQuestion(questionText) {
      return sendPromptInternal(questionText)
    },
    retryLastMessage() {
      const target = state.lastFailedMessage || state.draft
      if (!target || state.loading) return Promise.resolve(null)
      // Tránh nhân đôi tin nhắn user cuối nếu vừa thất bại cùng nội dung
      const lastMsg = state.messages[state.messages.length - 1]
      if (lastMsg?.role === 'user' && lastMsg.content === target.trim()) {
        publish({
          messages: state.messages.slice(0, -1),
        })
      }
      return sendPromptInternal(target)
    },
    async confirmExpense(id, createTransaction) {
      const message = state.messages.find(item => item.id === id && item.intent === 'CREATE_EXPENSE')
      const snap = sessionStore.getSnapshot()
      if (destroyed || !snap.user || !message?.suggestedExpense
          || ['saving', 'saved', 'cancelled'].includes(message.expenseStatus)) return null
      let payload
      try {
        const expense = normalizeSuggestedExpense(message.suggestedExpense)
        if (expense.categoryId === null) throw new Error('Vui lòng chọn danh mục trong biểu mẫu ghi khoản chi mới.')
        const dateError = transactionDateError(expense.transactionDate)
        if (dateError) throw new Error(dateError)
        const { amount, categoryId, transactionDate, note, type } = expense
        payload = { amount, categoryId, transactionDate, note, type }
      } catch (error) {
        updateExpense(id, { expenseStatus: 'error', expenseError: error.code === 'INVALID_API_RESPONSE'
          ? 'Đề xuất chi tiêu không hợp lệ. Vui lòng nhập lại yêu cầu.' : error.message })
        return null
      }
      // Cập nhật đồng bộ trước khi gọi API để chặn cả hai lần bấm trong cùng lượt sự kiện.
      updateExpense(id, { expenseStatus: 'saving', expenseError: '' })
      const isCurrent = () => !destroyed && sessionStore.getSnapshot().revision === snap.revision
        && sessionStore.getSnapshot().user?.id === snap.user.id && state.messages.some(item => item.id === id)
      try {
        const result = await createTransaction(payload)
        if (!isCurrent()) return null
        updateExpense(id, { expenseStatus: 'saved', expenseError: '' })
        return result
      } catch (error) {
        if (isCurrent()) updateExpense(id, { expenseStatus: 'error', expenseError: getApiErrorMessage(error)
          || 'Chưa lưu được giao dịch. Vui lòng kiểm tra và thử lại.' })
        return null
      }
    },
    cancelExpense(id) {
      const message = state.messages.find(item => item.id === id && item.intent === 'CREATE_EXPENSE')
      if (!message || ['saving', 'saved', 'cancelled'].includes(message.expenseStatus)) return
      updateExpense(id, { expenseStatus: 'cancelled', expenseError: '' })
    },
    destroy() {
      destroyed = true
      abortActiveRequest()
      unsubscribeSession()
      listeners.clear()
    },
  }
}

export const aiChatService = {
  AI_CHAT_TIMEOUT_MS,
  AI_SUGGESTED_QUESTIONS,
  AI_ERROR_MESSAGES,
  sendAiChatMessage,
  normalizeAiChatResponse,
  formatAiReplyForDisplay,
  validateAiChatRequest,
  getAiChatErrorMessage,
  createAiChatController,
}

export default aiChatService
