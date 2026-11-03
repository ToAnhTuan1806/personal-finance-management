import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import axios from 'axios'
import { calendarSelection, calendarParams, dateInMonth } from '../src/utils/calendarSelection.js'

const memory = new Map()
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key),
} })
const { default: client } = await import('../src/api/axiosClient.js')
const { session } = await import('../src/auth/session.js')
const { getDayTransactions } = await import('../src/services/dayTransactionService.js')
const original = client.defaults.adapter
afterEach(() => { client.defaults.adapter = original; session.clear() })
const date = '2028-02-29'
const row = (id) => ({ id, categoryId: 1, categoryName: 'TEST', type: 'EXPENSE', amount: 0.01, note: null, transactionDate: date })
const response = (config, data, status = 200) => ({ config, data, status, statusText: '', headers: {} })
const dto = (page = 0, total = 11) => ({ number: page, size: 10, totalElements: total, totalPages: Math.ceil(total / 10),
  content: Array.from({ length: Math.min(10, Math.max(0, total - page * 10)) }, (_, index) => row(total - page * 10 - index)) })
const login = (id) => session.authenticate({ accessToken: 'day-test-' + id, user: { id, fullName: 'TEST', email: id + '@example.test' } }, session.getSnapshot().revision)

test('lấy đủ các trang một ngày, đúng filter/JWT, không gửi month/sort/owner', async () => {
  login('A')
  const sent = []
  client.defaults.adapter = async (config) => { sent.push(config); return response(config, dto(config.params.page)) }
  const first = await getDayTransactions(date, 0), next = await getDayTransactions(date, 1)
  assert.equal(first.content.length, 10)
  assert.equal(next.content.length, 1)
  assert.equal(new Set([...first.content, ...next.content].map((item) => item.id)).size, 11)
  assert.deepEqual(sent[0].params, { startDate: date, endDate: date, page: 0, size: 10 })
  assert.equal(sent[0].url, '/transactions')
  assert.equal(sent[0].headers.Authorization, 'Bearer day-test-A')
})

test('ngày trống và trang vượt phạm vi giữ Page rỗng thật', async () => {
  for (const data of [dto(0, 0), dto(2, 11)]) {
    client.defaults.adapter = async (config) => response(config, data)
    assert.deepEqual(await getDayTransactions(date, data.number), data)
  }
})

for (const [badDate, page] of [['2026-02-29', 0], [date, -1], [date, 1.1], [date, 214748365]]) {
  test(`input sai ${badDate}/${page} không gọi API`, async () => {
    let calls = 0
    client.defaults.adapter = async (config) => { calls++; return response(config, dto()) }
    await assert.rejects(getDayTransactions(badDate, page), RangeError)
    assert.equal(calls, 0)
  })
}

for (const [name, change] of [
  ['sai ngày', (data) => { data.content[0].transactionDate = '2028-03-01' }],
  ['sai trang', (data) => { data.number = 1 }], ['thiếu metadata', (data) => { delete data.totalElements }],
  ['size sai', (data) => { data.size = 100 }], ['amount null', (data) => { data.content[0].amount = null }],
]) {
  test('không hiển thị Page sai DTO: ' + name, async () => {
    const data = dto()
    change(data)
    client.defaults.adapter = async (config) => response(config, data)
    await assert.rejects(getDayTransactions(date), { code: 'INVALID_API_RESPONSE' })
  })
}

for (const [code, status] of [['ERR_NETWORK', undefined], ['ECONNABORTED', undefined], ['ERR_BAD_REQUEST', 400], ['ERR_BAD_REQUEST', 401], ['ERR_BAD_REQUEST', 403]]) {
  test('lỗi chi tiết ngày ' + (status || code) + ' không fallback dữ liệu', async () => {
    login('A')
    client.defaults.adapter = async (config) => { throw new axios.AxiosError('TEST', code, config, null, status ? response(config, {}, status) : undefined) }
    await assert.rejects(getDayTransactions(date), { code })
    if (status === 401) assert.equal(session.getToken(), null)
    if (status === 403) assert.ok(session.getToken())
  })
}

for (const changeAccount of [false, true]) {
  test(changeAccount ? 'response A không dùng sau khi B đăng nhập' : 'hủy response khi đổi ngày/trang', async () => {
    login('A')
    const controller = new AbortController()
    let complete, started
    const ready = new Promise((resolve) => { started = resolve })
    client.defaults.adapter = (config) => new Promise((resolve) => { complete = () => resolve(response(config, dto())); started() })
    const pending = getDayTransactions(date, 0, { signal: controller.signal })
    await ready
    if (changeAccount) { session.clear(); login('B') } else controller.abort()
    complete()
    await assert.rejects(pending, { code: 'ERR_CANCELED' })
  })
}

test('URL lưu được tháng/ngày/trang để Back/Forward khôi phục lựa chọn', () => {
  const params = new URLSearchParams(calendarParams({ year: 2028, month: 2 }, date, 2))
  assert.deepEqual(calendarSelection(params, '2026-10-31'), { year: 2028, month: 2, date, page: 2 })
})
test('URL sai hoặc ngày lệch tháng dùng lựa chọn hợp lệ, không lệch timezone', () => {
  assert.deepEqual(calendarSelection(new URLSearchParams('month=2028-02&date=2028-03-01&page=-1'), '2026-10-31'),
    { year: 2028, month: 2, date: '2028-02-01', page: 0 })
  assert.equal(calendarSelection(new URLSearchParams('month=9999-99'), '2026-10-31').date, '2026-10-31')
})
test('chuyển tháng/năm giữ ngày phù hợp và reset trang bằng URL mới', () => {
  assert.equal(dateInMonth({ year: 2028, month: 2 }, '2028-01-31'), '2028-02-29')
  assert.equal(dateInMonth({ year: 2026, month: 2 }, '2026-01-31'), '2026-02-28')
  assert.equal(dateInMonth({ year: 2028, month: 1 }, '2027-12-31'), '2028-01-31')
  assert.equal(calendarParams({ year: 2028, month: 1 }, '2028-01-31').page, '0')
})
