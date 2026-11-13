import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import axios from 'axios'
import client, { createApiClient } from '../src/api/axiosClient.js'
import { createSessionStore, session } from '../src/auth/session.js'
import {
  EXPORT_LIMIT_EXCEEDED_MESSAGE,
  buildTransactionExportParams,
  exportReportTransactionsCsv,
  exportTransactionsCsv,
  extractCsvFilename,
  getCsvExportErrorMessage,
  monthRangeToDateRange,
  readBlobErrorPayload,
  sanitizeCsvFilename,
  sanitizeExportQueryParams,
} from '../src/services/csvExportService.js'

let server
let TransactionsPage
let ReportsPage

const render = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props))

const memory = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

const makeUser = (id) => ({
  accessToken: `test-token-${id}`,
  user: { id, fullName: `User ${id}`, email: `${id}@example.test` },
})

const makeResponse = (config, data, status = 200, headers = {}) => ({
  config,
  data,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  headers,
})

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  const txMod = await server.ssrLoadModule('/src/pages/Transactions.jsx')
  TransactionsPage = txMod.TransactionsPage
  const repMod = await server.ssrLoadModule('/src/pages/Reports.jsx')
  ReportsPage = repMod.ReportsPage
})

after(async () => {
  await server?.close()
})

test('CSV Filters - Transactions: gửi đúng bộ lọc đã áp dụng, bỏ qua keyword nháp chưa bấm Tìm kiếm và không gửi page/size/sort', () => {
  const paramsByMonth = buildTransactionExportParams({
    filters: { month: '2026-11', type: 'EXPENSE', categoryId: '12' },
    dateRange: { startDate: '', endDate: '' },
    searchKeyword: 'ăn trưa',
  })

  assert.deepEqual(paramsByMonth, {
    month: '2026-11',
    type: 'EXPENSE',
    categoryId: '12',
    keyword: 'ăn trưa',
  })
  assert.equal('page' in paramsByMonth, false)
  assert.equal('size' in paramsByMonth, false)
  assert.equal('sort' in paramsByMonth, false)

  // Khi có khoảng ngày, chỉ gửi startDate/endDate, không gửi month
  const paramsByRange = buildTransactionExportParams({
    filters: { month: '2026-11', type: 'INCOME', categoryId: '' },
    dateRange: { startDate: '2026-11-01', endDate: '2026-11-15' },
    searchKeyword: '   ',
  })

  assert.deepEqual(paramsByRange, {
    startDate: '2026-11-01',
    endDate: '2026-11-15',
    type: 'INCOME',
  })
  assert.equal('month' in paramsByRange, false)
  assert.equal('keyword' in paramsByRange, false)

  // sanitizeExportQueryParams loại bỏ tuyệt đối page, size, sort, userId nếu bị truyền nhầm
  const cleaned = sanitizeExportQueryParams({
    month: '2026-11',
    page: 2,
    size: 10,
    sort: 'transactionDate,desc',
    userId: 999,
  })
  assert.deepEqual(cleaned, { month: '2026-11' })
})

test('CSV Filters - Reports: chuyển khoảng tháng sang startDate và endDate bao gồm trọn ngày cuối tháng (kể cả năm nhuận)', () => {
  assert.deepEqual(monthRangeToDateRange('2026-09', '2026-11'), {
    startDate: '2026-09-01',
    endDate: '2026-11-30',
  })

  assert.deepEqual(monthRangeToDateRange('2026-02', '2026-02'), {
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  })

  assert.deepEqual(monthRangeToDateRange('2028-01', '2028-02'), {
    startDate: '2028-01-01',
    endDate: '2028-02-29',
  })

  assert.deepEqual(monthRangeToDateRange('2026-12', '2026-12'), {
    startDate: '2026-12-01',
    endDate: '2026-12-31',
  })

  assert.throws(
    () => monthRangeToDateRange('2026-11', '2026-09'),
    { code: 'INVALID_REPORT_RANGE' }
  )
  assert.throws(
    () => monthRangeToDateRange('2026-04', '2026-11'),
    { code: 'INVALID_REPORT_RANGE' }
  )
})

test('Filename CSV: trích xuất Content-Disposition hợp lệ và chặn tên file nguy hiểm (path traversal / không phải .csv)', () => {
  const fixedNow = new Date('2026-11-09T10:00:00+07:00')

  assert.equal(
    extractCsvFilename(
      { 'content-disposition': 'attachment; filename="smart-expense-20261109.csv"' },
      fixedNow
    ),
    'smart-expense-20261109.csv'
  )

  assert.equal(
    extractCsvFilename(
      { 'Content-Disposition': "attachment; filename*=UTF-8''smart-expense-20261109.csv" },
      fixedNow
    ),
    'smart-expense-20261109.csv'
  )

  // Không có header hoặc bị chặn bởi CORS -> dùng fallback an toàn
  assert.equal(extractCsvFilename({}, fixedNow), 'smart-expense-20261109.csv')

  // Chặn path traversal, ký tự lạ, hoặc đuôi thực thi
  for (const unsafe of [
    '../../../etc/passwd',
    '..\\secret.csv',
    'file/name.csv',
    'malware.exe',
    '<script>.csv',
    '.hidden.csv',
    '',
  ]) {
    assert.equal(sanitizeCsvFilename(unsafe, fixedNow), 'smart-expense-20261109.csv')
  }
})

test('exportTransactionsCsv: tải thành công Blob CSV, gắn JWT, tạo và revoke Object URL đầy đủ', async () => {
  const store = createSessionStore(memory())
  store.authenticate(makeUser('trang'), 0)
  const api = createApiClient(store, '/api')

  const csvPayload = '\uFEFF"Mã giao dịch","Ngày giao dịch","Loại","Danh mục","Số tiền","Ghi chú"\r\n"1","2026-11-09","EXPENSE","Ăn uống","50000.00","Cơm trưa"\r\n'
  const csvBlob = new Blob([csvPayload], { type: 'text/csv;charset=utf-8' })

  const capturedConfigs = []
  api.defaults.adapter = async (config) => {
    capturedConfigs.push(config)
    return makeResponse(config, csvBlob, 200, {
      'content-type': 'text/csv; charset=UTF-8',
      'content-disposition': 'attachment; filename="smart-expense-20261109.csv"',
    })
  }

  const createdUrls = []
  const revokedUrls = []
  const clickedLinks = []

  const fakeDom = {
    URL: {
      createObjectURL(blob) {
        assert.ok(blob instanceof Blob)
        const url = 'blob:smartexpense/test-csv-1'
        createdUrls.push(url)
        return url
      },
      revokeObjectURL(url) {
        revokedUrls.push(url)
      },
    },
    document: {
      body: {
        appendChild() {},
        removeChild() {},
      },
      createElement(tag) {
        assert.equal(tag, 'a')
        return {
          style: {},
          click() {
            clickedLinks.push({ href: this.href, download: this.download })
          },
          remove() {},
        }
      },
    },
  }

  const result = await exportTransactionsCsv(
    { month: '2026-11', type: 'EXPENSE', page: 3, size: 10 },
    { apiClient: api, sessionStore: store, dom: fakeDom }
  )

  assert.equal(capturedConfigs.length, 1)
  assert.equal(capturedConfigs[0].url, '/transactions/export')
  assert.equal(capturedConfigs[0].responseType, 'blob')
  assert.equal(capturedConfigs[0].headers.Authorization, 'Bearer test-token-trang')
  assert.deepEqual(capturedConfigs[0].params, {
    month: '2026-11',
    type: 'EXPENSE',
  })

  assert.equal(result.filename, 'smart-expense-20261109.csv')
  assert.deepEqual(
    new Uint8Array(await result.blob.arrayBuffer()),
    new TextEncoder().encode(csvPayload)
  )
  assert.deepEqual(createdUrls, ['blob:smartexpense/test-csv-1'])
  assert.deepEqual(revokedUrls, ['blob:smartexpense/test-csv-1'])
  assert.deepEqual(clickedLinks, [
    { href: 'blob:smartexpense/test-csv-1', download: 'smart-expense-20261109.csv' },
  ])
})

test('exportReportTransactionsCsv: chuyển đúng from/to sang startDate/endDate khi gọi /transactions/export', async () => {
  session.clear()
  const captured = []
  client.defaults.adapter = async (config) => {
    captured.push(config)
    return makeResponse(
      config,
      new Blob(['\uFEFFheader\r\n'], { type: 'text/csv;charset=utf-8' }),
      200,
      { 'content-type': 'text/csv; charset=UTF-8' }
    )
  }

  await exportReportTransactionsCsv(
    { from: '2026-09', to: '2026-11' },
    { download: false }
  )

  assert.equal(captured.length, 1)
  assert.equal(captured[0].url, '/transactions/export')
  assert.deepEqual(captured[0].params, {
    startDate: '2026-09-01',
    endDate: '2026-11-30',
  })
})

test('Xử lý lỗi CSV 422 EXPORT_LIMIT_EXCEEDED trong Blob: đọc JSON từ Blob, không tải file .csv, hiển thị đúng thông báo quy định', async () => {
  session.clear()
  let downloaded = false

  const errorJson = JSON.stringify({
    status: 422,
    code: 'EXPORT_LIMIT_EXCEEDED',
    message: 'Chỉ được xuất tối đa 10.000 giao dịch; vui lòng thu hẹp bộ lọc',
  })
  const errorBlob = new Blob([errorJson], { type: 'application/json' })

  client.defaults.adapter = async (config) => {
    throw new axios.AxiosError(
      'Unprocessable Entity',
      'ERR_BAD_RESPONSE',
      config,
      null,
      makeResponse(config, errorBlob, 422, { 'content-type': 'application/json' })
    )
  }

  const fakeDom = {
    URL: {
      createObjectURL() {
        downloaded = true
        return 'blob:should-not-create'
      },
      revokeObjectURL() {},
    },
  }

  let caughtError
  try {
    await exportTransactionsCsv({ month: '2026-11' }, { dom: fakeDom })
  } catch (err) {
    caughtError = err
  }

  assert.ok(caughtError, 'Phải reject khi Backend trả 422')
  assert.equal(downloaded, false, 'Tuyệt đối không tải Blob lỗi thành file CSV')
  assert.equal(caughtError.code, 'EXPORT_LIMIT_EXCEEDED')
  assert.equal(
    getCsvExportErrorMessage(caughtError),
    'Có quá nhiều giao dịch để xuất. Vui lòng thu hẹp khoảng thời gian hoặc bộ lọc.'
  )
  assert.equal(getCsvExportErrorMessage(caughtError), EXPORT_LIMIT_EXCEEDED_MESSAGE)
})

test('Xử lý lỗi CSV 400, 401, 500, JSON hỏng trong Blob và lỗi mạng: không bao giờ hiện [object Blob]', async () => {
  // 1. 400 với JSON trong Blob
  const badRequestBlob = new Blob(
    [JSON.stringify({ status: 400, code: 'VALIDATION_ERROR', message: 'Khoảng ngày không hợp lệ' })],
    { type: 'application/json' }
  )
  client.defaults.adapter = async (config) => {
    throw new axios.AxiosError(
      'Bad Request',
      'ERR_BAD_RESPONSE',
      config,
      null,
      makeResponse(config, badRequestBlob, 400, { 'content-type': 'application/json' })
    )
  }

  await assert.rejects(
    async () => {
      try {
        await exportTransactionsCsv({ month: '2026-13' }, { download: false })
      } catch (err) {
        const msg = getCsvExportErrorMessage(err)
        assert.equal(msg, 'Khoảng ngày không hợp lệ')
        assert.ok(!msg.includes('[object Blob]'))
        throw err
      }
    }
  )

  // 2. 500 với nội dung không phải JSON hợp lệ trong Blob
  const malformedBlob = new Blob(['<html>502 Bad Gateway</html>'], { type: 'text/html' })
  client.defaults.adapter = async (config) => {
    throw new axios.AxiosError(
      'Internal Server Error',
      'ERR_BAD_RESPONSE',
      config,
      null,
      makeResponse(config, malformedBlob, 500, { 'content-type': 'text/html' })
    )
  }

  await assert.rejects(
    async () => {
      try {
        await exportTransactionsCsv({ month: '2026-11' }, { download: false })
      } catch (err) {
        const msg = getCsvExportErrorMessage(err)
        assert.equal(msg, 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.')
        assert.ok(!msg.includes('[object Blob]'))
        throw err
      }
    }
  )

  // 3. 401 giữ nguyên cơ chế xóa phiên hiện có
  const store = createSessionStore(memory())
  store.authenticate(makeUser('userA'), 0)
  const api = createApiClient(store, '/api')
  const unauthorizedBlob = new Blob(
    [JSON.stringify({ status: 401, code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập lại' })],
    { type: 'application/json' }
  )
  api.defaults.adapter = async (config) => {
    throw new axios.AxiosError(
      'Unauthorized',
      'ERR_BAD_RESPONSE',
      config,
      null,
      makeResponse(config, unauthorizedBlob, 401, { 'content-type': 'application/json' })
    )
  }

  await assert.rejects(
    exportTransactionsCsv({ month: '2026-11' }, { apiClient: api, sessionStore: store, download: false })
  )
  assert.equal(store.getToken(), null)
  assert.equal(store.getSnapshot().reason, 'expired')

  // 4. Lỗi mạng
  client.defaults.adapter = async (config) => {
    throw new axios.AxiosError('Network Error', 'ERR_NETWORK', config)
  }
  await assert.rejects(
    async () => {
      try {
        await exportTransactionsCsv({ month: '2026-11' }, { download: false })
      } catch (err) {
        const msg = getCsvExportErrorMessage(err)
        assert.equal(msg, 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.')
        throw err
      }
    }
  )

  // 5. Giới hạn kích thước đọc Blob lỗi lớn
  const hugeText = '{"status":422,"code":"EXPORT_LIMIT_EXCEEDED","padding":"' + 'A'.repeat(40000) + '"}'
  const parsedHuge = await readBlobErrorPayload(new Blob([hugeText]), 1024)
  assert.equal(parsedHuge, null, 'Blob vượt giới hạn cắt cụt không làm crash JSON.parse')
})

test('Phiên đăng nhập đổi giữa lúc đang tải CSV: hủy kết quả và không tải xuống file của phiên cũ', async () => {
  const store = createSessionStore(memory())
  store.authenticate(makeUser('A'), 0)
  const api = createApiClient(store, '/api')

  let finishRequest
  let started
  const ready = new Promise((resolve) => {
    started = resolve
  })

  api.defaults.adapter = (config) =>
    new Promise((resolve) => {
      finishRequest = () =>
        resolve(
          makeResponse(
            config,
            new Blob(['\uFEFFprivate-A\r\n'], { type: 'text/csv' }),
            200,
            { 'content-type': 'text/csv; charset=UTF-8' }
          )
        )
      started()
    })

  let downloadTriggered = false
  const fakeDom = {
    URL: {
      createObjectURL() {
        downloadTriggered = true
        return 'blob:test'
      },
      revokeObjectURL() {},
    },
  }

  const pending = exportTransactionsCsv(
    { month: '2026-11' },
    { apiClient: api, sessionStore: store, dom: fakeDom }
  )
  await ready

  store.clear()
  store.authenticate(makeUser('B'), store.getSnapshot().revision)
  finishRequest()

  await assert.rejects(pending, { code: 'ERR_CANCELED' })
  assert.equal(downloadTriggered, false, 'Không được tải file của phiên A sau khi đã đổi sang phiên B')
})

test('UI nút Tải CSV trên Transactions và Reports: hiển thị đúng trạng thái bình thường, loading, disabled, focus-visible và thông báo lỗi 422', () => {
  const txHtml = render(TransactionsPage, {
    initialLoading: false,
    initialExporting: false,
  })
  assert.match(txHtml, /id="transactions-export-csv-btn"/)
  assert.match(txHtml, /Tải CSV/)
  assert.match(txHtml, /focus-visible:ring-2/)

  const txLoadingHtml = render(TransactionsPage, {
    initialLoading: false,
    initialExporting: true,
    initialExportError: EXPORT_LIMIT_EXCEEDED_MESSAGE,
  })
  assert.match(txLoadingHtml, /id="transactions-export-csv-btn"[^>]*disabled=""/)
  assert.match(txLoadingHtml, /aria-busy="true"/)
  assert.ok(txLoadingHtml.includes(EXPORT_LIMIT_EXCEEDED_MESSAGE))

  const repHtml = render(ReportsPage, {
    anchorMonth: '2026-11',
    initialLoading: false,
    initialExporting: false,
  })
  assert.match(repHtml, /id="reports-export-csv-btn"/)
  assert.match(repHtml, /Tải CSV/)

  const repLoadingHtml = render(ReportsPage, {
    anchorMonth: '2026-11',
    initialLoading: false,
    initialExporting: true,
    initialExportError: EXPORT_LIMIT_EXCEEDED_MESSAGE,
  })
  assert.match(repLoadingHtml, /id="reports-export-csv-btn"[^>]*disabled=""/)
  assert.match(repLoadingHtml, /aria-busy="true"/)
  assert.ok(repLoadingHtml.includes(EXPORT_LIMIT_EXCEEDED_MESSAGE))
})
