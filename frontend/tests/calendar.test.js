import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import axios from 'axios'
import process from 'node:process'
import { monthDates, monthCells, shiftMonth, isCalendarPeriod, formatCalendarMoney } from '../src/utils/calendar.js'

// Node không có sessionStorage; dùng bộ nhớ riêng trước khi nạp Axios/session thật.
const storage = new Map()
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} })
const { default: client } = await import('../src/api/axiosClient.js')
const { session } = await import('../src/auth/session.js')
const { getCalendarMonth, validateCalendarMonth } = await import('../src/services/calendarService.js')

const originalAdapter = client.defaults.adapter
afterEach(() => { client.defaults.adapter = originalAdapter; session.clear() })
const dto = (year = 2028, month = 2) => ({
  year, month, incomeTotal: 0, expenseTotal: 0,
  days: monthDates(year, month).map((date) => ({ date, incomeTotal: 0, expenseTotal: 0 })),
})
const response = (config, data, status = 200) => ({ config, data, status, statusText: '', headers: {} })

for (const [year, month, count] of [[2026, 2, 28], [2028, 2, 29], [1900, 2, 28], [2000, 2, 29], [2100, 2, 28], [2026, 4, 30], [2026, 12, 31]]) {
  test(`tháng ${month}/${year} có đủ ${count} ngày thật`, () => {
    const dates = monthDates(year, month)
    assert.equal(dates.length, count)
    assert.equal(Number(dates.at(-1).slice(-2)), count)
    assert.equal(new Set(dates).size, count)
  })
}

test('lưới bắt đầu thứ Hai, đủ hàng 7 ô, không đưa ngày tháng khác vào tổng', () => {
  const monday = monthCells(2026, 6), sunday = monthCells(2026, 2)
  assert.equal(monday[0], '2026-06-01')
  assert.deepEqual(sunday.slice(0, 6), Array(6).fill(null))
  assert.equal(sunday[6], '2026-02-01')
  for (const cells of [monday, sunday, monthCells(2028, 2), monthCells(2026, 8)]) {
    assert.equal(cells.length % 7, 0)
    assert.ok(cells.length <= 42)
  }
})

test('chuyển tháng qua ranh giới năm và chặn vượt miền Backend', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 })
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 })
  assert.equal(shiftMonth({ year: 1900, month: 1 }, -1), null)
  assert.equal(shiftMonth({ year: 2100, month: 12 }, 1), null)
})

test('số ngày và vị trí thứ không đổi theo timezone máy chạy', () => {
  const oldTZ = process.env.TZ
  try {
    const outputs = ['Asia/Ho_Chi_Minh', 'America/Los_Angeles', 'Pacific/Kiritimati'].map((zone) => {
      process.env.TZ = zone
      return monthCells(2028, 2)
    })
    assert.deepEqual(outputs[0], outputs[1])
    assert.deepEqual(outputs[1], outputs[2])
  } finally {
    if (oldTZ === undefined) delete process.env.TZ
    else process.env.TZ = oldTZ
  }
})

for (const [year, month] of [[1899, 1], [2101, 1], [2026, 0], [2026, 13], [2026, 1.5], ['2026', 1], [NaN, 1]]) {
  test(`kỳ ${year}/${month} sai bị từ chối trước khi gửi API`, async () => {
    let calls = 0
    client.defaults.adapter = async (config) => { calls++; return response(config, {}) }
    assert.equal(isCalendarPeriod(year, month), false)
    await assert.rejects(getCalendarMonth(year, month), RangeError)
    assert.equal(calls, 0)
  })
}

test('GET Calendar gửi year/month và JWT, không gửi owner hoặc lấy danh sách giao dịch', async () => {
  session.authenticate({ accessToken: 'calendar-test-only', user: { id: 1, fullName: 'TEST', email: 'calendar@example.test' } }, session.getSnapshot().revision)
  const data = dto()
  data.incomeTotal = 0.3
  data.expenseTotal = 9999999999999.99
  data.days[0].incomeTotal = 0.3
  data.days[28].expenseTotal = 9999999999999.99
  const captured = []
  client.defaults.adapter = async (config) => { captured.push(config); return response(config, data) }
  assert.deepEqual(await getCalendarMonth(2028, 2), data)
  assert.equal(captured.length, 1)
  assert.equal(captured[0].url, '/calendar/month')
  assert.equal(captured[0].method, 'get')
  assert.deepEqual(captured[0].params, { year: 2028, month: 2 })
  assert.equal(captured[0].headers.Authorization, 'Bearer calendar-test-only')
  assert.equal(captured[0].data, undefined)
  assert.ok(formatCalendarMoney(0.01).includes('0,01'))
  assert.ok(formatCalendarMoney(9999999999999.99).includes('9.999.999.999.999,99'))
})

test('tháng trống thật giữ đủ ngày bằng 0', async () => {
  const data = dto(2026, 2)
  client.defaults.adapter = async (config) => response(config, data)
  assert.deepEqual(await getCalendarMonth(2026, 2), data)
})

for (const [name, change] of [
  ['sai năm', (d) => { d.year = 2027 }], ['sai tháng', (d) => { d.month = 3 }],
  ['thiếu ngày', (d) => { d.days.pop() }], ['ngày trùng', (d) => { d.days[1] = d.days[0] }],
  ['ngày ngoài tháng', (d) => { d.days[0].date = '2028-01-31' }],
  ['ngày sai thứ tự', (d) => { d.days.reverse() }], ['null ngày', (d) => { d.days[0] = null }],
  ['null tổng', (d) => { d.incomeTotal = null }], ['số âm', (d) => { d.days[0].expenseTotal = -1 }],
  ['tiền string sai DTO', (d) => { d.expenseTotal = '0' }], ['NaN', (d) => { d.days[0].incomeTotal = NaN }],
]) {
  test('response Calendar ' + name + ' phải báo lỗi, không điền dữ liệu giả', () => {
    const data = dto()
    change(data)
    assert.throws(() => validateCalendarMonth(data, 2028, 2), { code: 'INVALID_API_RESPONSE' })
  })
}

for (const [code, status] of [['ERR_NETWORK', undefined], ['ECONNABORTED', undefined], ['ERR_BAD_REQUEST', 400], ['ERR_BAD_REQUEST', 401], ['ERR_BAD_REQUEST', 403], ['ERR_BAD_RESPONSE', 500]]) {
  test(`Calendar chuyển lỗi ${status || code} về UI, không fallback tổng 0`, async () => {
    client.defaults.adapter = async (config) => { throw new axios.AxiosError('TEST', code, config, null, status ? response(config, {}, status) : undefined) }
    await assert.rejects(getCalendarMonth(2028, 2), { code })
  })
}

test('hủy request tháng cũ khi chuyển tháng, không nhận response cũ', async () => {
  const controller = new AbortController()
  let finish, started
  const ready = new Promise((resolve) => { started = resolve })
  client.defaults.adapter = (config) => new Promise((resolve) => {
    finish = () => resolve(response(config, dto()))
    started()
  })
  const pending = getCalendarMonth(2028, 2, { signal: controller.signal })
  await ready
  controller.abort()
  finish()
  await assert.rejects(pending, { code: 'ERR_CANCELED' })
})

test('response Calendar của A không được hiện sau khi chuyển sang B', async () => {
  const login = (id) => session.authenticate({ accessToken: 'calendar-test-' + id, user: { id, fullName: 'TEST', email: id + '@example.test' } }, session.getSnapshot().revision)
  login('A')
  let finish, started
  const ready = new Promise((resolve) => { started = resolve })
  client.defaults.adapter = (config) => new Promise((resolve) => {
    finish = () => resolve(response(config, dto()))
    started()
  })
  const pending = getCalendarMonth(2028, 2)
  await ready
  session.clear()
  login('B')
  finish()
  await assert.rejects(pending, { code: 'ERR_CANCELED' })
  assert.equal(session.getSnapshot().user.id, 'B')
})
