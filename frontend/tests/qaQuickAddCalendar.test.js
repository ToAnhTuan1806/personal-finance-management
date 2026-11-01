import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createQuickAddSubmission } from '../src/utils/quickAddSubmission.js'
import { monthDates } from '../src/utils/calendar.js'

// Module service thật chỉ được nạp sau storage test; mọi request trong file trỏ loopback riêng.
const memory = new Map()
globalThis.sessionStorage = { getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) }
const { default: client } = await import('../src/api/axiosClient.js')
const { session } = await import('../src/auth/session.js')
const { createTransaction } = await import('../src/services/transactionService.js')
const { getCalendarMonth } = await import('../src/services/calendarService.js')
const original = { baseURL: client.defaults.baseURL, timeout: client.defaults.timeout, proxy: client.defaults.proxy }
const payload = () => ({ type: 'EXPENSE', categoryId: 1, amount: 0.01, transactionDate: '2028-02-29', note: 'D03_QA_ONLY' })
const respond = (response, status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
async function fixture(t, handler, timeout = 5000) {
  const server = createServer(handler)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  client.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`
  client.defaults.timeout = timeout
  client.defaults.proxy = false
  session.authenticate({ accessToken: 'qa-local-only-' + randomUUID(), user: { id: 1, fullName: 'QA', email: 'qa@example.test' } }, session.getSnapshot().revision)
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    Object.assign(client.defaults, original)
    session.clear()
  })
}
function submission() {
  const events = []
  return { events, save: createQuickAddSubmission({ create: createTransaction,
    onSaving: (value) => events.push(['saving', value]), onSaved: () => events.push(['saved']), onError: () => events.push(['error']),
  }) }
}

test('QA Quick Add: 20 lời gọi đồng thời chỉ gửi một POST và nhận một xác nhận', async (t) => {
  let calls = 0
  await fixture(t, (request, response) => {
    calls++
    assert.equal(request.url, '/api/transactions')
    assert.equal(request.method, 'POST')
    respond(response, 201, { id: 1, ...payload() })
  })
  const { save, events } = submission()
  const requests = Array.from({ length: 20 }, () => save(payload()))
  assert.ok(requests.every((request) => request === requests[0]))
  await Promise.all(requests)
  assert.equal(calls, 1)
  assert.deepEqual(events, [['saving', true], ['saved'], ['saving', false]])
})

for (const failure of [400, 401, 403, 500, 'network', 'timeout']) {
  test('QA Quick Add HTTP ' + failure + ': không xác nhận lưu hoặc tự gửi lại', async (t) => {
    let calls = 0
    await fixture(t, (request, response) => {
      calls++
      if (failure === 'network') request.socket.destroy()
      else if (failure !== 'timeout') respond(response, failure, { status: failure, message: 'QA_ERROR' })
    }, failure === 'timeout' ? 100 : 5000)
    const form = payload(), before = structuredClone(form)
    const { save, events } = submission()
    await assert.rejects(save(form))
    assert.equal(calls, 1)
    assert.equal(events.filter(([name]) => name === 'saved').length, 0)
    assert.deepEqual(events, [['saving', true], ['error'], ['saving', false]])
    assert.deepEqual(form, before)
  })
}

test('QA mất ACK: timeout không chứng minh server chưa nhận/lưu request', async (t) => {
  let acceptedByFixture = 0
  // Mô phỏng đã nhận POST rồi không gửi response; đây là fault server trong RAM, không phải MySQL.
  await fixture(t, (request) => {
    request.resume()
    request.on('end', () => { acceptedByFixture++ })
  }, 100)
  const { save, events } = submission()
  await assert.rejects(save(payload()), { code: 'ECONNABORTED' })
  assert.equal(acceptedByFixture, 1)
  assert.equal(events.some(([name]) => name === 'saved'), false)
  // Không chủ động retry ở test này: người dùng phải kiểm tra dữ liệu trước khi gửi lại.
})

for (const failure of [400, 401, 403, 500, 'network', 'timeout']) {
  test('QA Calendar HTTP ' + failure + ': reject, không thay lỗi bằng tháng 0 giả', async (t) => {
    let calls = 0
    await fixture(t, (request, response) => {
      calls++
      if (failure === 'network') request.socket.destroy()
      else if (failure !== 'timeout') respond(response, failure, { status: failure, message: 'QA_ERROR' })
    }, failure === 'timeout' ? 100 : 5000)
    await assert.rejects(getCalendarMonth(2028, 2))
    assert.equal(calls, 1)
  })
}

test('QA Calendar lỗi rồi retry chủ động trả tháng rỗng thật, đủ 29 ngày', async (t) => {
  let calls = 0
  const month = { year: 2028, month: 2, incomeTotal: 0, expenseTotal: 0,
    days: monthDates(2028, 2).map((date) => ({ date, incomeTotal: 0, expenseTotal: 0 })) }
  await fixture(t, (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    assert.equal(url.pathname, '/api/calendar/month')
    assert.equal(url.searchParams.get('year'), '2028')
    assert.equal(url.searchParams.get('month'), '2')
    if (++calls === 1) respond(response, 500, { status: 500 })
    else respond(response, 200, month)
  })
  await assert.rejects(getCalendarMonth(2028, 2))
  assert.equal(calls, 1)
  assert.deepEqual(await getCalendarMonth(2028, 2), month)
  assert.equal(calls, 2)
})
