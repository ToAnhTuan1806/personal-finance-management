import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import axios from 'axios'
import { createQuickAddSubmission } from '../src/utils/quickAddSubmission.js'
import { transactionPayload, validateTransactionForm } from '../src/utils/transactionForm.js'
import { getApiErrorMessage } from '../src/api/errors.js'

// Cô lập phiên kiểm thử, không đọc credential trình duyệt hoặc gọi DB thật.
const storage = new Map()
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} })
const { default: client } = await import('../src/api/axiosClient.js')
const { session } = await import('../src/auth/session.js')
const { createTransaction } = await import('../src/services/transactionService.js')

const originalAdapter = client.defaults.adapter
afterEach(() => { client.defaults.adapter = originalAdapter; session.clear() })
const formFor = (type) => ({ type, categoryId: type === 'INCOME' ? '2' : '1', amount: '12.34', transactionDate: '2028-02-29', note: 'Ghi chú tiếng Việt' })
const categories = [{ id: 1, type: 'EXPENSE' }, { id: 2, type: 'INCOME' }]
const login = () => session.authenticate({ accessToken: 'quick-add-test-only', user: { id: 1, fullName: 'TEST', email: 'quick@example.test' } }, session.getSnapshot().revision)
const response = (config, data, status = 201) => ({ config, data, status, statusText: '', headers: {} })
const submission = () => {
  const events = []
  return { events, save: createQuickAddSubmission({
    create: createTransaction,
    onSaving: (value) => events.push(['saving', value]),
    onSaved: (data) => events.push(['saved', data]),
    onError: (error) => events.push(['error', getApiErrorMessage(error)]),
  }) }
}

for (const type of ['INCOME', 'EXPENSE']) {
  test(`Quick Add ${type}: validation → DTO → Axios/JWT → phản hồi 201, chỉ một POST`, async () => {
    login()
    const form = formFor(type)
    assert.deepEqual(validateTransactionForm(form, categories), {})
    const payload = transactionPayload(form), sent = []
    let finish, started
    const ready = new Promise((resolve) => { started = resolve })
    client.defaults.adapter = (config) => new Promise((resolve) => {
      sent.push(config)
      finish = () => resolve(response(config, { id: 123, ...payload }))
      started()
    })
    const { save, events } = submission()
    const first = save(payload), duplicate = save(payload)
    assert.equal(first, duplicate)
    await ready
    assert.deepEqual(events, [['saving', true]])
    assert.equal(sent.length, 1)
    assert.equal(sent[0].url, '/transactions')
    assert.equal(sent[0].method, 'post')
    assert.equal(sent[0].headers.Authorization, 'Bearer quick-add-test-only')
    assert.deepEqual(JSON.parse(sent[0].data), payload)
    assert.equal(payload.userId, undefined)
    finish()
    await Promise.all([first, duplicate])
    assert.deepEqual(events, [['saving', true], ['saved', { id: 123, ...payload }], ['saving', false]])
  })
}

// Adapter chỉ chạy trong test; không gọi Backend hoặc sử dụng DB production.
for (const [code, status] of [['ERR_NETWORK', undefined], ['ECONNABORTED', undefined], ['ERR_BAD_REQUEST', 400], ['ERR_BAD_REQUEST', 401], ['ERR_BAD_REQUEST', 403]]) {
  test(`Quick Add lỗi ${status || code}: không báo thành công/làm mới, giữ form và không tự POST lại`, async () => {
    login()
    const form = formFor('EXPENSE'), snapshot = structuredClone(form)
    let calls = 0
    client.defaults.adapter = async (config) => {
      calls++
      throw new axios.AxiosError('TEST', code, config, null, status ? response(config, { message: 'TEST_VALIDATION' }, status) : undefined)
    }
    const { save, events } = submission()
    await assert.rejects(save(transactionPayload(form)), { code })
    assert.equal(calls, 1)
    assert.deepEqual(form, snapshot)
    assert.equal(events.some(([event]) => event === 'saved'), false)
    assert.deepEqual(events.map(([event]) => event), ['saving', 'error', 'saving'])
    assert.equal(events.at(-1)[1], false)
    if (code === 'ECONNABORTED') assert.match(events[1][1], /kiểm tra/i)
    if (status === 401) assert.equal(session.getToken(), null)
  })
}

test('lỗi được mở khóa để người dùng chủ động gửi lại, thành công chỉ được thông báo một lần', async () => {
  let calls = 0
  client.defaults.adapter = async (config) => {
    if (++calls === 1) throw new axios.AxiosError('TEST', 'ERR_NETWORK', config)
    return response(config, { id: 1 })
  }
  const { save, events } = submission()
  await assert.rejects(save(transactionPayload(formFor('INCOME'))))
  await save(transactionPayload(formFor('INCOME')))
  assert.equal(calls, 2)
  assert.equal(events.filter(([event]) => event === 'saved').length, 1)
})

test('đổi phiên trong lúc lưu: bỏ phản hồi cũ và không báo thành công/lỗi cho tài khoản mới', async () => {
  login()
  let finish, started
  const ready = new Promise((resolve) => { started = resolve })
  client.defaults.adapter = (config) => new Promise((resolve) => {
    finish = () => resolve(response(config, { id: 1 }))
    started()
  })
  const { save, events } = submission()
  const pending = save(transactionPayload(formFor('INCOME')))
  await ready
  session.clear()
  finish()
  await assert.rejects(pending, { code: 'ERR_CANCELED' })
  assert.deepEqual(events, [['saving', true], ['saving', false]])
})
