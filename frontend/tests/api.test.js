import assert from 'node:assert/strict'
import test from 'node:test'
import axios from 'axios'
import client, { createApiClient } from '../src/api/axiosClient.js'
import { createSessionStore, session } from '../src/auth/session.js'
import { getApiErrorMessage, getApiFieldErrors } from '../src/api/errors.js'
import * as transactions from '../src/services/transactionService.js'
import * as categories from '../src/services/categoryService.js'
import * as budgets from '../src/services/budgetService.js'
import dashboard from '../src/services/dashboardService.js'

const memory = () => {
  const values = new Map()
  return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
}
const user = (id) => ({ accessToken: 'test-token-' + id, user: { id, fullName: 'Test', email: id + '@example.test' } })
const response = (config, data, status = 200) => ({ config, data, status, statusText: '', headers: {} })
const fail = (status) => async (config) => { throw new axios.AxiosError('Test-only failure', 'ERR_BAD_RESPONSE', config, null, response(config, {}, status)) }

test('JWT gắn ở API bảo vệ; login/register công khai không nhận bearer', async () => {
  const store = createSessionStore(memory())
  store.authenticate(user('A'), 0)
  const api = createApiClient(store, '/api'), captured = []
  api.defaults.adapter = async (config) => { captured.push(config); return response(config, {}) }
  await api.get('/transactions')
  await api.post('/auth/login', {})
  await api.post('/auth/register', {})
  assert.equal(captured[0].headers.Authorization, 'Bearer test-token-A')
  assert.equal(captured[1].headers.Authorization, undefined)
  assert.equal(captured[2].headers.Authorization, undefined)
})

test('401 API bảo vệ xóa cả phiên và báo hết hạn', async () => {
  const storage = memory(), store = createSessionStore(storage)
  store.authenticate(user('A'), 0)
  const api = createApiClient(store, '/api')
  api.defaults.adapter = fail(401)
  await assert.rejects(api.get('/transactions'))
  assert.equal(store.getToken(), null)
  assert.equal(storage.getItem('currentUser'), undefined)
  assert.equal(store.getSnapshot().reason, 'expired')
})

for (const [path, status] of [['/auth/login', 401], ['/auth/register', 401], ['/categories', 403]]) {
  test(status + ' tại ' + path + ' không xóa phiên đang hợp lệ', async () => {
    const store = createSessionStore(memory())
    store.authenticate(user('A'), 0)
    const api = createApiClient(store, '/api')
    api.defaults.adapter = fail(status)
    await assert.rejects(api.post(path, {}))
    assert.equal(store.getSnapshot().user.id, 'A')
  })
}

for (const status of [200, 401]) {
  test('response ' + status + ' của A không ảnh hưởng phiên B', async () => {
    const store = createSessionStore(memory())
    store.authenticate(user('A'), 0)
    const api = createApiClient(store, '/api')
    let finish, started
    const ready = new Promise((resolve) => { started = resolve })
    api.defaults.adapter = (config) => new Promise((resolve, reject) => {
      finish = () => status === 200 ? resolve(response(config, { private: 'A' })) : reject(new axios.AxiosError('Test', 'ERR_BAD_RESPONSE', config, null, response(config, {}, 401)))
      started()
    })
    const pending = api.get('/transactions')
    await ready
    store.clear()
    store.authenticate(user('B'), store.getSnapshot().revision)
    finish()
    await assert.rejects(pending, { code: 'ERR_CANCELED' })
    assert.equal(store.getSnapshot().user.id, 'B')
  })
}

// Adapter giả lập ở test, không tạo kết quả demo trong ứng dụng hoặc gọi DB thật.
for (const [name, run] of [
  ['đọc giao dịch', () => transactions.getTransactions()], ['tạo giao dịch', () => transactions.createTransaction({})],
  ['sửa giao dịch', () => transactions.updateTransaction(1, {})], ['xóa giao dịch', () => transactions.deleteTransaction(1)],
  ['đọc danh mục', () => categories.getCategories()], ['tạo danh mục', () => categories.createCategory({})],
  ['sửa danh mục', () => categories.updateCategory(1, {})], ['xóa danh mục', () => categories.deleteCategory(1)],
  ['đọc ngân sách', () => budgets.getBudget(2026, 10)], ['lưu ngân sách', () => budgets.saveBudget(2026, 10, 100)],
  ['xóa ngân sách', () => budgets.deleteBudget(2026, 10)], ['Dashboard', () => dashboard.getSummary('2026-10')],
  ['biểu đồ', () => dashboard.getExpenseChartData('2026-10')],
]) {
  test(name + ' phải reject khi mất mạng, không trả dữ liệu giả', async () => {
    session.clear()
    client.defaults.adapter = async (config) => { throw new axios.AxiosError('Network Error', 'ERR_NETWORK', config) }
    await assert.rejects(run(), { code: 'ERR_NETWORK' })
  })
}

test('CRUD thật giữ nguyên method, request và response', async () => {
  const sent = []
  client.defaults.adapter = async (config) => { sent.push(config); return response(config, { id: 123, amount: 0.01 }, 201) }
  assert.deepEqual(await transactions.createTransaction({ amount: 0.01, type: 'INCOME', categoryId: 2, transactionDate: '2026-10-31', note: '' }), { id: 123, amount: 0.01 })
  await transactions.updateTransaction(123, { amount: 1 })
  await transactions.deleteTransaction(123)
  assert.deepEqual(sent.map((config) => config.method), ['post', 'put', 'delete'])
  assert.equal(JSON.parse(sent[0].data).amount, 0.01)
  assert.equal(JSON.parse(sent[0].data).userId, undefined)
})

for (const data of [{}, { totalIncome: null, totalExpense: 1, balance: 0 }, { totalIncome: 'bad', totalExpense: 1, balance: 0 }]) {
  test('Dashboard không che response sai cấu trúc bằng số mẫu: ' + JSON.stringify(data), async () => {
    client.defaults.adapter = async (config) => response(config, data)
    await assert.rejects(dashboard.getSummary('2026-10'), { code: 'INVALID_API_RESPONSE' })
  })
}

test('Dashboard hợp lệ tháng rỗng vẫn trả số 0 thật', async () => {
  client.defaults.adapter = async (config) => response(config, { totalIncome: 0, totalExpense: 0, balance: 0 })
  assert.equal((await dashboard.getSummary('2026-10')).balance, 0)
})

test('phân biệt mạng, timeout, 400, 401, 403 và 500; không lộ lỗi nội bộ', () => {
  const messages = [{}, { code: 'ECONNABORTED' }, ...[400, 401, 403, 500].map((status) => ({ response: { status, data: {} } }))].map((error) => getApiErrorMessage(error))
  assert.equal(new Set(messages).size, 6)
  assert.ok(!getApiErrorMessage({ response: { status: 500, data: { message: 'PRIVATE_SQL_DETAIL' } } }).includes('PRIVATE_SQL_DETAIL'))
  assert.deepEqual(getApiFieldErrors({ response: { status: 400, data: { errors: { amount: 'Tiền sai', unknown: 'Hidden' } } } }, ['amount']), { amount: 'Tiền sai' })
  assert.equal(getApiErrorMessage(new axios.CanceledError()), '')
  assert.equal(typeof getApiErrorMessage({ response: { status: 400, data: { message: { internal: 'Not text' } } } }), 'string')
})
