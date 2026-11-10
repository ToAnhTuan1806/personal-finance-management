import axios from 'axios'
import axiosClient from '../api/axiosClient.js'
import {
  EXPORT_LIMIT_EXCEEDED_MESSAGE,
  getApiErrorMessage,
  isRequestCancelled,
} from '../api/errors.js'
import { session } from '../auth/session.js'
import {
  parseMonthString,
  validateMonthRange,
} from '../components/reports/reportUtils.js'
import { monthDates } from '../utils/calendar.js'

export const MAX_ERROR_BLOB_BYTES = 16 * 1024
export { EXPORT_LIMIT_EXCEEDED_MESSAGE }

const SAFE_FILENAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.csv$/i

export function formatVietnamCompactDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (year && month && day) {
    return `${year}${month}${day}`
  }
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export function sanitizeCsvFilename(candidate, now = new Date()) {
  const fallback = `smart-expense-${formatVietnamCompactDate(now)}.csv`
  if (typeof candidate !== 'string') return fallback

  const trimmed = candidate.trim().replace(/^["']+|["']+$/g, '').trim()
  if (!trimmed) return fallback
  const hasControlChar = [...trimmed].some((ch) => {
    const code = ch.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
  if (
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    hasControlChar
  ) {
    return fallback
  }

  if (!SAFE_FILENAME_REGEX.test(trimmed)) {
    return fallback
  }

  return trimmed
}

export function extractCsvFilename(headers, now = new Date()) {
  let disposition = ''
  if (headers) {
    if (typeof headers.get === 'function') {
      disposition =
        headers.get('content-disposition') ||
        headers.get('Content-Disposition') ||
        ''
    } else if (typeof headers === 'object') {
      disposition =
        headers['content-disposition'] ||
        headers['Content-Disposition'] ||
        ''
    }
  }

  if (typeof disposition !== 'string' || !disposition.trim()) {
    return sanitizeCsvFilename('', now)
  }

  const utf8Match = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\r\n]+)/i.exec(
    disposition
  )
  if (utf8Match?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ''))
      const sanitized = sanitizeCsvFilename(decoded, now)
      if (sanitized) return sanitized
    } catch {
      // Fallback sang filename thường hoặc tên mặc định an toàn
    }
  }

  const quotedMatch = /filename\s*=\s*"([^"\r\n]+)"/i.exec(disposition)
  if (quotedMatch?.[1]) {
    return sanitizeCsvFilename(quotedMatch[1], now)
  }

  const plainMatch = /filename\s*=\s*([^;\s\r\n]+)/i.exec(disposition)
  if (plainMatch?.[1]) {
    return sanitizeCsvFilename(plainMatch[1], now)
  }

  return sanitizeCsvFilename('', now)
}

export function buildTransactionExportParams({
  filters = {},
  dateRange = {},
  searchKeyword = '',
} = {}) {
  const hasStart = typeof dateRange?.startDate === 'string' && dateRange.startDate.trim() !== ''
  const hasEnd = typeof dateRange?.endDate === 'string' && dateRange.endDate.trim() !== ''
  const hasRange = hasStart && hasEnd

  const params = {}
  if (hasRange) {
    params.startDate = dateRange.startDate.trim()
    params.endDate = dateRange.endDate.trim()
  } else if (typeof filters?.month === 'string' && filters.month.trim() !== '') {
    params.month = filters.month.trim()
  }

  if (typeof filters?.type === 'string' && filters.type.trim() !== '') {
    params.type = filters.type.trim()
  }

  if (
    filters?.categoryId !== undefined &&
    filters?.categoryId !== null &&
    String(filters.categoryId).trim() !== ''
  ) {
    params.categoryId = filters.categoryId
  }

  if (typeof searchKeyword === 'string' && searchKeyword.trim() !== '') {
    params.keyword = searchKeyword.trim()
  }

  return params
}

export function monthRangeToDateRange(from, to) {
  const validation = validateMonthRange(from, to)
  if (!validation.valid) {
    throw Object.assign(new Error(validation.message), {
      code: 'INVALID_REPORT_RANGE',
    })
  }

  const startParsed = parseMonthString(from)
  const endParsed = parseMonthString(to)
  const startMonthDates = monthDates(startParsed.year, startParsed.month)
  const endMonthDates = monthDates(endParsed.year, endParsed.month)

  return {
    startDate: startMonthDates[0],
    endDate: endMonthDates[endMonthDates.length - 1],
  }
}

export function sanitizeExportQueryParams(params = {}) {
  if (!params || typeof params !== 'object') return {}

  const clean = {}
  const hasRange =
    typeof params.startDate === 'string' &&
    params.startDate.trim() !== '' &&
    typeof params.endDate === 'string' &&
    params.endDate.trim() !== ''

  if (hasRange) {
    clean.startDate = params.startDate.trim()
    clean.endDate = params.endDate.trim()
  } else if (typeof params.month === 'string' && params.month.trim() !== '') {
    clean.month = params.month.trim()
  }

  if (typeof params.type === 'string' && params.type.trim() !== '') {
    clean.type = params.type.trim()
  }

  if (
    params.categoryId !== undefined &&
    params.categoryId !== null &&
    String(params.categoryId).trim() !== ''
  ) {
    clean.categoryId = params.categoryId
  }

  if (typeof params.keyword === 'string' && params.keyword.trim() !== '') {
    clean.keyword = params.keyword.trim()
  }

  return clean
}

function normalizeParsedErrorJson(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const result = {}
  if (typeof parsed.status === 'number' && Number.isFinite(parsed.status)) {
    result.status = parsed.status
  }
  if (typeof parsed.code === 'string' && parsed.code.trim() !== '') {
    result.code = parsed.code.trim().slice(0, 100)
  }
  if (typeof parsed.message === 'string' && parsed.message.trim() !== '') {
    result.message = parsed.message.trim().slice(0, 300)
  }
  if (parsed.errors && typeof parsed.errors === 'object' && !Array.isArray(parsed.errors)) {
    result.errors = parsed.errors
  }

  return Object.keys(result).length > 0 ? result : null
}

export async function readBlobErrorPayload(data, maxBytes = MAX_ERROR_BLOB_BYTES) {
  if (!data) return null

  try {
    let rawText = ''

    if (typeof data === 'string') {
      rawText = data.slice(0, maxBytes)
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const sliced = typeof data.slice === 'function' ? data.slice(0, maxBytes) : data
      if (typeof sliced.text === 'function') {
        rawText = await sliced.text()
      } else if (typeof sliced.arrayBuffer === 'function') {
        const buffer = await sliced.arrayBuffer()
        rawText = new TextDecoder('utf-8').decode(buffer.slice(0, maxBytes))
      }
    } else if (typeof data.text === 'function') {
      const sliced = typeof data.slice === 'function' ? data.slice(0, maxBytes) : data
      rawText = await (typeof sliced.text === 'function' ? sliced.text() : data.text())
      rawText = String(rawText).slice(0, maxBytes)
    } else if (data instanceof ArrayBuffer) {
      rawText = new TextDecoder('utf-8').decode(data.slice(0, maxBytes))
    } else if (ArrayBuffer.isView(data)) {
      const view = new Uint8Array(data.buffer, data.byteOffset, Math.min(data.byteLength, maxBytes))
      rawText = new TextDecoder('utf-8').decode(view)
    } else if (typeof data === 'object') {
      return normalizeParsedErrorJson(data)
    }

    if (!rawText || typeof rawText !== 'string') return null
    const trimmed = rawText.trim()
    if (!trimmed.startsWith('{')) return null

    const parsed = JSON.parse(trimmed)
    return normalizeParsedErrorJson(parsed)
  } catch {
    return null
  }
}

export function getCsvExportErrorMessage(error) {
  if (isRequestCancelled(error)) return ''
  if (error?.code === 'INVALID_REPORT_RANGE' && typeof error?.message === 'string') {
    return error.message
  }

  const status = error?.response?.status
  const code =
    typeof error?.response?.data?.code === 'string'
      ? error.response.data.code
      : typeof error?.code === 'string'
        ? error.code
        : ''

  if (code === 'EXPORT_LIMIT_EXCEEDED' || status === 422) {
    return EXPORT_LIMIT_EXCEEDED_MESSAGE
  }

  const msg = getApiErrorMessage(error, 'Không thể xuất file CSV. Vui lòng thử lại.')
  if (typeof msg !== 'string' || msg.includes('[object Blob]')) {
    return 'Không thể xuất file CSV. Vui lòng thử lại.'
  }
  return msg
}

export function triggerCsvDownload(blob, filename, dom = globalThis) {
  const urlApi = dom?.URL || globalThis.URL
  if (!urlApi || typeof urlApi.createObjectURL !== 'function') {
    throw new Error('Trình duyệt không hỗ trợ tạo liên kết tải file.')
  }

  const objectUrl = urlApi.createObjectURL(blob)
  try {
    const doc = dom?.document || globalThis.document
    if (doc && typeof doc.createElement === 'function') {
      const link = doc.createElement('a')
      link.href = objectUrl
      link.download = filename
      link.rel = 'noopener'
      if (link.style) {
        link.style.display = 'none'
      }
      if (doc.body && typeof doc.body.appendChild === 'function') {
        doc.body.appendChild(link)
      }
      if (typeof link.click === 'function') {
        link.click()
      }
      if (typeof link.remove === 'function') {
        link.remove()
      } else if (doc.body && typeof doc.body.removeChild === 'function') {
        doc.body.removeChild(link)
      }
    }
  } finally {
    if (typeof urlApi.revokeObjectURL === 'function') {
      urlApi.revokeObjectURL(objectUrl)
    }
  }
}

function getHeaderContentType(headers, blob) {
  let headerType = ''
  if (headers) {
    if (typeof headers.get === 'function') {
      headerType = headers.get('content-type') || headers.get('Content-Type') || ''
    } else if (typeof headers === 'object') {
      headerType = headers['content-type'] || headers['Content-Type'] || ''
    }
  }
  if (!headerType && blob && typeof blob.type === 'string') {
    headerType = blob.type
  }
  return String(headerType || '').toLowerCase()
}

export async function exportTransactionsCsv(params = {}, options = {}) {
  const {
    apiClient = axiosClient,
    sessionStore = session,
    download = true,
    dom = globalThis,
    now,
    ...requestOptions
  } = options

  const cleanParams = sanitizeExportQueryParams(params)
  const startRevision = sessionStore.getSnapshot().revision

  const ensureSessionUnchanged = () => {
    if (
      sessionStore.getSnapshot().revision !== startRevision ||
      requestOptions.signal?.aborted
    ) {
      throw new axios.CanceledError('Phiên đăng nhập đã thay đổi.')
    }
  }

  let response
  try {
    response = await apiClient.get('/transactions/export', {
      ...requestOptions,
      params: cleanParams,
      responseType: 'blob',
    })
  } catch (error) {
    if (error?.response) {
      const parsed = await readBlobErrorPayload(error.response.data)
      error.response.data = parsed || {}
      if (parsed?.code) {
        error.code = parsed.code
      }
    }
    ensureSessionUnchanged()
    throw error
  }

  ensureSessionUnchanged()

  const status = response?.status ?? 200
  const contentType = getHeaderContentType(response?.headers, response?.data)

  if (
    status !== 200 ||
    contentType.includes('application/json') ||
    contentType.includes('application/problem+json')
  ) {
    const parsed = await readBlobErrorPayload(response?.data)
    ensureSessionUnchanged()
    const errorStatus = parsed?.status || (status !== 200 ? status : 500)
    const err = new axios.AxiosError(
      parsed?.message || 'Không thể xuất file CSV.',
      parsed?.code || 'ERR_BAD_RESPONSE',
      response?.config,
      null,
      {
        ...response,
        status: errorStatus,
        data: parsed || {},
      }
    )
    if (parsed?.code) err.code = parsed.code
    throw err
  }

  if (response?.data === null || response?.data === undefined) {
    throw Object.assign(new Error('Phản hồi CSV từ máy chủ trống.'), {
      code: 'INVALID_API_RESPONSE',
    })
  }

  const blob =
    typeof Blob !== 'undefined' && response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: 'text/csv;charset=utf-8;' })

  const filename = extractCsvFilename(response?.headers, now)

  ensureSessionUnchanged()

  if (download) {
    triggerCsvDownload(blob, filename, dom)
  }

  return {
    blob,
    filename,
  }
}

export async function exportReportTransactionsCsv({ from, to } = {}, options = {}) {
  const range = monthRangeToDateRange(from, to)
  return exportTransactionsCsv(range, options)
}

export const csvExportService = {
  exportTransactionsCsv,
  exportReportTransactionsCsv,
  buildTransactionExportParams,
  monthRangeToDateRange,
  sanitizeExportQueryParams,
  extractCsvFilename,
  sanitizeCsvFilename,
  readBlobErrorPayload,
  getCsvExportErrorMessage,
  triggerCsvDownload,
}

export default csvExportService
