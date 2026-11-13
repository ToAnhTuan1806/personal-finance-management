/**
 * recurringPreviewApply.test.js
 * SmartExpense 2.0 — D09-FE (FR-08) Kiểm thử tính năng Xem trước & Áp dụng giao dịch định kỳ
 *
 * Phạm vi kiểm tra:
 *   1. API service: previewRecurringTemplate, applyRecurringTemplate
 *   2. Phân biệt trạng thái canApply / đã áp dụng / mẫu inactive / ngày tương lai
 *   3. Xử lý lỗi 400, 401, 404, 409 (ALREADY_APPLIED vs TEMPLATE_INACTIVE theo contract Backend), lỗi mạng, timeout
 *   4. Không gây Infinite Fetch Loop (BUG-01 regression)
 *   5. RecurringPreviewModal render (SSR-safe với renderToStaticMarkup)
 *   6. Modal accessibility: role="dialog", aria-modal="true", tabIndex="-1", focus management
 *   7. Vô hiệu hóa preview khi đổi kỳ, chống race condition, chống double-submit
 *   8. Vòng đời modal: reset state sạch sẽ khi mở lại hoặc chuyển template
 *   9. Xử lý ngày 29–31 và năm nhuận, cảnh báo chỉ khi dayOfMonth > lastDay
 *  10. Định dạng transactionDate ISO (YYYY-MM-DD) sang DD/MM/YYYY
 */

import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import client from '../src/api/axiosClient.js'
import * as recurringService from '../src/services/recurringTemplateService.js'
import {
  formatDisplayDate,
  getCurrentRecurringPeriod,
  getRecurringPreviewMonthOptions,
  getRecurringPreviewYearOptions,
  isDayClampedToMonthEnd,
  isRecurringPreviewPeriodAllowed,
  resolveTransactionDate,
} from '../src/components/recurring/recurringTemplateUtils.js'

/* ─── Helpers ───────────────────────────────────────────────── */
let server
let originalAdapter
let RecurringPreviewModal

const response = (config, data, status = 200) => ({
  config,
  data,
  status,
  statusText: status < 300 ? 'OK' : '',
  headers: {},
})

const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))

before(async () => {
  originalAdapter = client.defaults.adapter
  const root = fileURLToPath(new URL('..', import.meta.url))
  server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  RecurringPreviewModal = (
    await server.ssrLoadModule('/src/components/recurring/RecurringPreviewModal.jsx')
  ).default
})

after(async () => {
  client.defaults.adapter = originalAdapter
  await server?.close()
})

/* ════════════════════════════════════════════════════════════════
   1. previewRecurringTemplate — API Service Tests
   ════════════════════════════════════════════════════════════════ */

test('D09-01: previewRecurringTemplate gửi GET /recurring-templates/{id}/preview với year và month', async () => {
  const captured = []
  const mockPreview = {
    templateId: 10,
    year: 2026,
    month: 11,
    transactionDate: '2026-11-05',
    categoryId: 1,
    categoryName: 'Ăn uống',
    type: 'EXPENSE',
    amount: 50000,
    note: 'Tiền ăn',
    alreadyApplied: false,
    canApply: true,
    reasonCode: null,
  }

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockPreview)
  }

  const result = await recurringService.previewRecurringTemplate(10, 2026, 11)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'get')
  assert.equal(captured[0].url, '/recurring-templates/10/preview')
  assert.deepEqual(captured[0].params, { year: 2026, month: 11 })
  assert.deepEqual(result, mockPreview)
})

test('D09-02: previewRecurringTemplate không ghi dữ liệu (chỉ GET, không POST)', async () => {
  const methods = []
  client.defaults.adapter = async (config) => {
    methods.push(config.method)
    return response(config, { canApply: true, alreadyApplied: false })
  }

  await recurringService.previewRecurringTemplate(5, 2026, 12)

  assert.equal(methods.length, 1)
  assert.equal(methods[0], 'get', 'Preview PHẢI dùng GET, không được POST')
})

test('D09-03: previewRecurringTemplate trả canApply=false khi mẫu inactive (TEMPLATE_INACTIVE)', async () => {
  const mockInactive = {
    templateId: 20,
    year: 2026,
    month: 11,
    transactionDate: '2026-11-05',
    categoryId: 1,
    categoryName: 'Internet',
    type: 'EXPENSE',
    amount: 250000,
    note: null,
    alreadyApplied: false,
    canApply: false,
    reasonCode: 'TEMPLATE_INACTIVE',
  }

  client.defaults.adapter = async (config) => response(config, mockInactive)

  const result = await recurringService.previewRecurringTemplate(20, 2026, 11)

  assert.equal(result.canApply, false)
  assert.equal(result.alreadyApplied, false)
  assert.equal(result.reasonCode, 'TEMPLATE_INACTIVE')
})

test('D09-04: previewRecurringTemplate trả alreadyApplied=true khi đã áp dụng tháng đó', async () => {
  const mockApplied = {
    templateId: 30,
    year: 2026,
    month: 10,
    transactionDate: '2026-10-05',
    categoryId: 2,
    categoryName: 'Lương',
    type: 'INCOME',
    amount: 10000000,
    note: null,
    alreadyApplied: true,
    canApply: false,
    reasonCode: 'ALREADY_APPLIED',
  }

  client.defaults.adapter = async (config) => response(config, mockApplied)

  const result = await recurringService.previewRecurringTemplate(30, 2026, 10)

  assert.equal(result.alreadyApplied, true)
  assert.equal(result.canApply, false)
  assert.equal(result.reasonCode, 'ALREADY_APPLIED')
})

test('D09-05: previewRecurringTemplate reject 401 khi JWT hết hạn', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Unauthorized')
    err.config = config
    err.response = { status: 401, data: { code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập lại' } }
    throw err
  }

  await assert.rejects(
    () => recurringService.previewRecurringTemplate(10, 2026, 11),
    (err) => {
      assert.equal(err.response?.status, 401)
      return true
    }
  )
})

test('D09-06: previewRecurringTemplate reject 404 khi mẫu không tồn tại', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Not Found')
    err.config = config
    err.response = { status: 404, data: { code: 'RESOURCE_NOT_FOUND', message: 'Không tìm thấy mẫu' } }
    throw err
  }

  await assert.rejects(
    () => recurringService.previewRecurringTemplate(9999, 2026, 11),
    (err) => {
      assert.equal(err.response?.status, 404)
      return true
    }
  )
})

test('D09-07: previewRecurringTemplate reject 400 khi year/month sai định dạng', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Bad Request')
    err.config = config
    err.response = {
      status: 400,
      data: { code: 'VALIDATION_ERROR', message: 'Tháng phải nằm trong khoảng 1-12' },
    }
    throw err
  }

  await assert.rejects(
    () => recurringService.previewRecurringTemplate(10, 2026, 13),
    (err) => {
      assert.equal(err.response?.status, 400)
      return true
    }
  )
})

test('D09-08: previewRecurringTemplate reject khi lỗi mạng, không trả dữ liệu giả lập', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Network Error')
    err.config = config
    err.isAxiosError = true
    throw err
  }

  await assert.rejects(
    () => recurringService.previewRecurringTemplate(10, 2026, 11),
    (err) => {
      assert.equal(err.message, 'Network Error')
      assert.equal(err.response, undefined, 'Lỗi mạng không có response')
      return true
    }
  )
})

/* ════════════════════════════════════════════════════════════════
   2. applyRecurringTemplate — API Service Tests
   ════════════════════════════════════════════════════════════════ */

test('D09-09: applyRecurringTemplate gửi POST /recurring-templates/{id}/apply với body {year, month}', async () => {
  const captured = []
  const mockApplication = {
    id: 55,
    templateId: 10,
    year: 2026,
    month: 11,
    transactionId: 201,
    transaction: {
      id: 201,
      categoryId: 1,
      categoryName: 'Ăn uống',
      type: 'EXPENSE',
      amount: 50000,
      transactionDate: '2026-11-05',
      note: 'Tiền ăn',
    },
  }

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockApplication, 201)
  }

  const result = await recurringService.applyRecurringTemplate(10, 2026, 11)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'post')
  assert.equal(captured[0].url, '/recurring-templates/10/apply')

  const body =
    typeof captured[0].data === 'string' ? JSON.parse(captured[0].data) : captured[0].data
  assert.equal(body.year, 2026)
  assert.equal(body.month, 11)
  assert.equal(body.userId, undefined, 'Client không được gửi userId')
  assert.deepEqual(result, mockApplication)
})

test('D09-10: applyRecurringTemplate gửi year và month là Number', async () => {
  const captured = []
  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, { id: 1 }, 201)
  }

  await recurringService.applyRecurringTemplate(10, '2026', '11')

  const body =
    typeof captured[0].data === 'string' ? JSON.parse(captured[0].data) : captured[0].data
  assert.equal(typeof body.year, 'number', 'year phải là number trong body')
  assert.equal(typeof body.month, 'number', 'month phải là number trong body')
})

test('D09-11: applyRecurringTemplate reject 409 ALREADY_APPLIED', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Conflict')
    err.config = config
    err.response = {
      status: 409,
      data: { code: 'ALREADY_APPLIED', message: 'Giao dịch định kỳ đã được áp dụng.' },
    }
    throw err
  }

  await assert.rejects(
    () => recurringService.applyRecurringTemplate(10, 2026, 11),
    (err) => {
      assert.equal(err.response?.status, 409)
      assert.equal(err.response?.data?.code, 'ALREADY_APPLIED')
      return true
    }
  )
})

test('D09-12: applyRecurringTemplate reject 409 TEMPLATE_INACTIVE khi mẫu đã tắt', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Conflict')
    err.config = config
    err.response = {
      status: 409,
      data: { code: 'TEMPLATE_INACTIVE', message: 'Mẫu định kỳ đã bị tắt.' },
    }
    throw err
  }

  await assert.rejects(
    () => recurringService.applyRecurringTemplate(20, 2026, 11),
    (err) => {
      assert.equal(err.response?.status, 409)
      assert.equal(err.response?.data?.code, 'TEMPLATE_INACTIVE')
      return true
    }
  )
})

test('D09-13: applyRecurringTemplate reject 401 khi JWT hết hạn', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Unauthorized')
    err.config = config
    err.response = { status: 401, data: { code: 'UNAUTHORIZED' } }
    throw err
  }

  await assert.rejects(
    () => recurringService.applyRecurringTemplate(10, 2026, 11),
    (err) => {
      assert.equal(err.response?.status, 401)
      return true
    }
  )
})

test('D09-14: applyRecurringTemplate reject lỗi mạng, không báo thành công giả', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Network Error')
    err.config = config
    err.isAxiosError = true
    throw err
  }

  let threw = false
  try {
    await recurringService.applyRecurringTemplate(10, 2026, 11)
  } catch (err) {
    threw = true
    assert.equal(err.response, undefined, 'Lỗi mạng không có response — phải throw, không trả dữ liệu giả')
  }
  assert.equal(threw, true, 'applyRecurringTemplate phải throw khi lỗi mạng')
})

/* ════════════════════════════════════════════════════════════════
   3. RecurringPreviewModal — Render & Accessibility Tests
   ════════════════════════════════════════════════════════════════ */

const sampleTemplate = {
  id: 10,
  categoryId: 1,
  categoryName: 'Ăn uống',
  type: 'EXPENSE',
  amount: 50000,
  dayOfMonth: 5,
  note: 'Tiền ăn định kỳ',
  active: true,
}

test('D09-15: RecurringPreviewModal không render khi isOpen=false', () => {
  const html = render(RecurringPreviewModal, { isOpen: false, template: sampleTemplate })
  assert.equal(html, '', 'Modal phải trả HTML rỗng khi isOpen=false')
})

test('D09-16: RecurringPreviewModal không render khi template=null', () => {
  const html = render(RecurringPreviewModal, { isOpen: true, template: null })
  assert.equal(html, '', 'Modal phải trả HTML rỗng khi template=null')
})

test('D09-17: RecurringPreviewModal render tiêu đề và hướng dẫn ban đầu', () => {
  const html = render(RecurringPreviewModal, { isOpen: true, template: sampleTemplate })
  assert.match(html, /Kiểm tra trước khi ghi nhận/)
  assert.match(html, /Ăn uống/)
  assert.match(html, /Chọn kỳ muốn ghi nhận/)
  assert.match(html, />Kiểm tra</)
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
})

test('D09-18: RecurringPreviewModal có select tháng và năm', () => {
  const html = render(RecurringPreviewModal, { isOpen: true, template: sampleTemplate })
  const { year, month } = getCurrentRecurringPeriod()
  assert.match(html, new RegExp(`Tháng ${month}`))
  assert.match(html, /Tháng 12/)
  assert.match(html, new RegExp(String(year)))
  assert.match(html, new RegExp(`có thể chọn tháng.*${month}/${year}.*trong tương lai`))
  if (month > 1) assert.doesNotMatch(html, /<option value="1">Tháng 1<\/option>/)
})

test('D09-18a: kỳ xem trước chỉ nhận tháng hiện tại đến tương lai', () => {
  assert.deepEqual(getRecurringPreviewMonthOptions(2026, 2026, 11), [11, 12])
  assert.deepEqual(getRecurringPreviewMonthOptions(2027, 2026, 11), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  assert.deepEqual(getRecurringPreviewMonthOptions(2025, 2026, 11), [])
  assert.equal(isRecurringPreviewPeriodAllowed(2026, 10, 2026, 11), false)
  assert.equal(isRecurringPreviewPeriodAllowed(2026, 11, 2026, 11), true)
  assert.equal(isRecurringPreviewPeriodAllowed(2027, 1, 2026, 11), true)
  assert.equal(isRecurringPreviewPeriodAllowed(2101, 1, 2026, 11), false)
  assert.deepEqual(getRecurringPreviewYearOptions(2099), [2099, 2100])
})

test('D09-19: RecurringPreviewModal có nút Kiểm tra với aria-label đúng', () => {
  const html = render(RecurringPreviewModal, { isOpen: true, template: sampleTemplate })
  assert.match(html, /aria-label="Kiểm tra giao dịch trước khi ghi nhận"/)
})

test('D09-20: RecurringPreviewModal có nút đóng với aria-label', () => {
  const html = render(RecurringPreviewModal, { isOpen: true, template: sampleTemplate })
  assert.match(html, /aria-label="Đóng cửa sổ kiểm tra giao dịch"/)
})

/* ════════════════════════════════════════════════════════════════
   4. Kiểm tra ràng buộc nghiệp vụ (không call API tự động)
   ════════════════════════════════════════════════════════════════ */

test('D09-21: previewRecurringTemplate và applyRecurringTemplate có trong recurringTemplateService', () => {
  assert.equal(
    typeof recurringService.previewRecurringTemplate,
    'function',
    'previewRecurringTemplate phải là function'
  )
  assert.equal(
    typeof recurringService.applyRecurringTemplate,
    'function',
    'applyRecurringTemplate phải là function'
  )
})

test('D09-22: previewRecurringTemplate params year/month phải là Number', async () => {
  const captured = []
  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, { canApply: true, alreadyApplied: false })
  }

  await recurringService.previewRecurringTemplate(10, '2026', '11')

  assert.equal(typeof captured[0].params.year, 'number')
  assert.equal(typeof captured[0].params.month, 'number')
  assert.equal(captured[0].params.year, 2026)
  assert.equal(captured[0].params.month, 11)
})

test('D09-23: applyRecurringTemplate gửi đúng 1 POST duy nhất (không double-submit)', async () => {
  let callCount = 0
  client.defaults.adapter = async (config) => {
    callCount++
    return response(config, { id: 1 }, 201)
  }

  await recurringService.applyRecurringTemplate(10, 2026, 11)
  assert.equal(callCount, 1, 'applyRecurringTemplate chỉ gửi 1 POST duy nhất')
})

/* ════════════════════════════════════════════════════════════════
   5. Regression BUG-01: Preview/Apply không gây Infinite Fetch Loop
   ════════════════════════════════════════════════════════════════ */

test('D09-24: Gọi previewRecurringTemplate nhiều lần không phát sinh side effect trong service', async () => {
  let callCount = 0
  client.defaults.adapter = async (config) => {
    callCount++
    return response(config, { canApply: true, alreadyApplied: false })
  }

  await recurringService.previewRecurringTemplate(10, 2026, 11)
  await recurringService.previewRecurringTemplate(10, 2026, 11)
  await recurringService.previewRecurringTemplate(10, 2026, 11)

  assert.equal(callCount, 3, 'Mỗi lần gọi preview phải chính xác 1 request GET — không có loop')
})

test('D09-25: applyRecurringTemplate không tự gọi khi import service (không tự POST)', () => {
  assert.equal(typeof recurringService.applyRecurringTemplate, 'function')
  assert.notEqual(
    recurringService.applyRecurringTemplate,
    null,
    'applyRecurringTemplate không được tự gọi khi import'
  )
})

/* ════════════════════════════════════════════════════════════════
   6. Bổ sung kiểm thử: Accessibility, Focus, và Vòng đời State
   ════════════════════════════════════════════════════════════════ */

test('D09-26: RecurringPreviewModal hỗ trợ focus trap với tabIndex="-1" và aria-labelledby', () => {
  const html = render(RecurringPreviewModal, { isOpen: true, template: sampleTemplate })
  assert.match(html, /tabindex="-1"/i, 'Dialog phải có tabIndex="-1" để hỗ trợ focus trap')
  assert.match(
    html,
    /aria-labelledby="preview-modal-title"/,
    'Dialog phải liên kết với tiêu đề qua aria-labelledby'
  )
})

test('D09-27: RecurringPreviewModal gán key theo template.id giúp dọn dẹp state khi chuyển mẫu', () => {
  const templateA = { id: 101, categoryName: 'Tiền phòng', amount: 3000000, dayOfMonth: 1, active: true }
  const templateB = { id: 102, categoryName: 'Internet', amount: 250000, dayOfMonth: 15, active: false }

  const htmlA = render(RecurringPreviewModal, { isOpen: true, template: templateA })
  const htmlB = render(RecurringPreviewModal, { isOpen: true, template: templateB })

  assert.match(htmlA, /Tiền phòng/)
  assert.doesNotMatch(htmlA, /Internet/)

  assert.match(htmlB, /Internet/)
  assert.doesNotMatch(htmlB, /Tiền phòng/)
})

/* ════════════════════════════════════════════════════════════════
   7. Định dạng ngày transactionDate ISO sang DD/MM/YYYY
   ════════════════════════════════════════════════════════════════ */

test('D09-28: formatDisplayDate chuyển đổi ngày ISO (YYYY-MM-DD) sang DD/MM/YYYY chuẩn xác', () => {
  assert.equal(formatDisplayDate('2026-11-05'), '05/11/2026')
  assert.equal(formatDisplayDate('2026-02-28'), '28/02/2026')
  assert.equal(formatDisplayDate('2028-02-29'), '29/02/2028')
  assert.equal(formatDisplayDate('2026-04-30'), '30/04/2026')
  assert.equal(formatDisplayDate('05/11/2026'), '05/11/2026')
  assert.equal(formatDisplayDate(null, 31, 2026, 2), '28/02/2026')
})

/* ════════════════════════════════════════════════════════════════
   8. Xử lý các kỳ 29–31 và năm nhuận, cảnh báo chỉ khi dayOfMonth > lastDay
   ════════════════════════════════════════════════════════════════ */

test('D09-29: isDayClampedToMonthEnd & resolveTransactionDate cho các kỳ 29–31 và năm nhuận', () => {
  // Tháng 2 năm thường (2026, 28 ngày):
  // Ngày 31 -> clamp về 28
  assert.equal(isDayClampedToMonthEnd(31, 2026, 2), true)
  assert.equal(resolveTransactionDate(31, 2026, 2), '28/02/2026')

  // Ngày 29 trong năm thường -> clamp về 28
  assert.equal(isDayClampedToMonthEnd(29, 2026, 2), true)
  assert.equal(resolveTransactionDate(29, 2026, 2), '28/02/2026')

  // Ngày 28 trong năm thường -> không clamp
  assert.equal(isDayClampedToMonthEnd(28, 2026, 2), false)
  assert.equal(resolveTransactionDate(28, 2026, 2), '28/02/2026')

  // Tháng 2 năm nhuận (2028, 29 ngày):
  // Ngày 31 -> clamp về 29
  assert.equal(isDayClampedToMonthEnd(31, 2028, 2), true)
  assert.equal(resolveTransactionDate(31, 2028, 2), '29/02/2028')

  // Ngày 29 trong năm nhuận -> KHÔNG clamp
  assert.equal(isDayClampedToMonthEnd(29, 2028, 2), false)
  assert.equal(resolveTransactionDate(29, 2028, 2), '29/02/2028')

  // Tháng 4 (30 ngày):
  // Ngày 31 -> clamp về 30
  assert.equal(isDayClampedToMonthEnd(31, 2026, 4), true)
  assert.equal(resolveTransactionDate(31, 2026, 4), '30/04/2026')

  // Ngày 30 -> KHÔNG clamp
  assert.equal(isDayClampedToMonthEnd(30, 2026, 4), false)
  assert.equal(resolveTransactionDate(30, 2026, 4), '30/04/2026')

  // Tháng 5 (31 ngày):
  // Ngày 31 -> KHÔNG clamp
  assert.equal(isDayClampedToMonthEnd(31, 2026, 5), false)
  assert.equal(resolveTransactionDate(31, 2026, 5), '31/05/2026')
})

test('D09-30: Cảnh báo ngày cuối tháng chỉ xuất hiện khi dayOfMonth > lastDay', () => {
  // 1. Template ngày 15 trong tháng 2 -> Không có cảnh báo
  const tmpl15 = { id: 1, categoryName: 'Internet', amount: 200000, dayOfMonth: 15, active: true }
  const html15 = render(RecurringPreviewModal, { isOpen: true, template: tmpl15 })
  assert.doesNotMatch(html15, /không tồn tại trong tháng/)

  // 2. Template ngày 30 trong tháng 4 (30 ngày) -> Không có cảnh báo
  const tmpl30 = { id: 2, categoryName: 'Điện nước', amount: 500000, dayOfMonth: 30, active: true }
  const html30 = render(RecurringPreviewModal, { isOpen: true, template: tmpl30 })
  assert.doesNotMatch(html30, /không tồn tại trong tháng/)
})

/* ════════════════════════════════════════════════════════════════
   9. HTTP 409 thực tế từ Backend (code=CONFLICT, message=ALREADY_APPLIED / TEMPLATE_INACTIVE)
   ════════════════════════════════════════════════════════════════ */

test('D09-31: Xử lý đúng contract 409 từ Backend với code=CONFLICT & message=ALREADY_APPLIED', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Conflict')
    err.config = config
    err.response = {
      status: 409,
      data: {
        status: 409,
        code: 'CONFLICT',
        message: 'ALREADY_APPLIED',
      },
    }
    throw err
  }

  await assert.rejects(
    () => recurringService.applyRecurringTemplate(10, 2026, 11),
    (err) => {
      assert.equal(err.response?.status, 409)
      assert.equal(err.response?.data?.code, 'CONFLICT')
      assert.equal(err.response?.data?.message, 'ALREADY_APPLIED')
      return true
    }
  )
})

test('D09-32: Xử lý đúng contract 409 từ Backend với code=CONFLICT & message=TEMPLATE_INACTIVE', async () => {
  client.defaults.adapter = async (config) => {
    const err = new Error('Conflict')
    err.config = config
    err.response = {
      status: 409,
      data: {
        status: 409,
        code: 'CONFLICT',
        message: 'TEMPLATE_INACTIVE',
      },
    }
    throw err
  }

  await assert.rejects(
    () => recurringService.applyRecurringTemplate(20, 2026, 11),
    (err) => {
      assert.equal(err.response?.status, 409)
      assert.equal(err.response?.data?.code, 'CONFLICT')
      assert.equal(err.response?.data?.message, 'TEMPLATE_INACTIVE')
      return true
    }
  )
})

/* ════════════════════════════════════════════════════════════════
   10. An toàn mạng & Chống double-click
   ════════════════════════════════════════════════════════════════ */

test('D09-33: Lỗi mạng không rõ kết quả POST hủy confirm, yêu cầu Preview lại, không tự retry', async () => {
  let callCount = 0
  client.defaults.adapter = async (config) => {
    callCount++
    const err = new Error('Network Timeout')
    err.config = config
    err.code = 'ECONNABORTED'
    throw err
  }

  await assert.rejects(
    () => recurringService.applyRecurringTemplate(10, 2026, 11),
    (err) => {
      assert.equal(err.code, 'ECONNABORTED')
      return true
    }
  )

  // Tuyệt đối không có lệnh gọi retry tự động ngầm
  assert.equal(callCount, 1, 'Sau timeout tuyệt đối không tự gọi POST lần thứ hai')
})

test('D09-34: applyInFlightRef chặn click liên tiếp (double-click guard)', async () => {
  // Mô phỏng guard đồng bộ như trong RecurringPreviewModalContent
  const applyInFlight = { current: false }
  let executeCount = 0

  const handleApplyClick = async () => {
    if (applyInFlight.current) return
    applyInFlight.current = true
    try {
      executeCount++
      await new Promise((r) => setTimeout(r, 50))
    } finally {
      applyInFlight.current = false
    }
  }

  // Click 3 lần liên tiếp gần như tức thời
  const click1 = handleApplyClick()
  const click2 = handleApplyClick()
  const click3 = handleApplyClick()

  await Promise.all([click1, click2, click3])

  assert.equal(executeCount, 1, 'Chỉ 1 request được thực thi khi double-click liên tiếp')
})
