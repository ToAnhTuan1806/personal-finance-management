import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createApiClient } from '../src/api/axiosClient.js'
import { createSessionStore } from '../src/auth/session.js'
import { createAuthActions } from '../src/auth/actions.js'
import { createQuickAddSubmission } from '../src/utils/quickAddSubmission.js'

const user = (id) => ({ id, fullName: 'Tài khoản QA', email: id + '@example.test' })
const authData = (id) => ({ accessToken: 'qa-local-only-' + randomUUID(), user: user(id) })
const storage = () => {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
}
const reply = (response, status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }

async function localHttp(t, handler, timeout = 1000) {
  // Fault server chỉ dùng loopback/cổng ngẫu nhiên, không giả thành Backend/MySQL thật trong báo cáo.
  const server = createServer(handler)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) })
  const store = createSessionStore(storage())
  const api = createApiClient(store, `http://127.0.0.1:${server.address().port}/api`)
  api.defaults.proxy = false
  api.defaults.timeout = timeout
  const actions = createAuthActions(store, {
    login: async (data) => (await api.post('/auth/login', data)).data,
    getCurrentUser: async (options) => (await api.get('/users/me', options)).data,
  })
  return { store, api, actions }
}

for (const status of [400, 401, 403, 500]) {
  test(`QA HTTP login ${status}: không tạo user/token hoặc đăng nhập giả`, async (t) => {
    const { store, actions } = await localHttp(t, (_request, response) => reply(response, status, { status, message: 'QA_ERROR' }))
    await assert.rejects(actions.login('qa@example.test', randomUUID()), (error) => error.response?.status === status)
    assert.equal(store.getSnapshot().user, null)
    assert.equal(store.getToken(), null)
  })
}

for (const mode of ['network', 'timeout']) {
  test('QA HTTP login ' + mode + ': phiên rỗng, không fallback thành công', async (t) => {
    const { store, actions } = await localHttp(t, (request) => { if (mode === 'network') request.socket.destroy() }, 100)
    await assert.rejects(actions.login('qa@example.test', randomUUID()))
    assert.equal(store.getSnapshot().user, null)
    assert.equal(store.getToken(), null)
  })
}

test('QA logout xóa phiên/storage; request sau logout không còn Bearer', async (t) => {
  const loginResponse = authData('A')
  const headers = []
  const { store, api, actions } = await localHttp(t, (request, response) => {
    headers.push(Boolean(request.headers.authorization))
    if (request.url === '/api/auth/login') reply(response, 200, loginResponse)
    else reply(response, request.headers.authorization ? 200 : 401, request.headers.authorization ? user('A') : { status: 401, code: 'UNAUTHORIZED' })
  })
  await actions.login('qa@example.test', randomUUID())
  assert.equal(store.getSnapshot().user.id, 'A')
  await api.get('/users/me')
  actions.logout()
  assert.equal(store.getSnapshot().user, null)
  assert.equal(store.getToken(), null)
  await assert.rejects(api.get('/users/me'), (error) => error.response?.status === 401)
  assert.deepEqual(headers, [false, true, false])
})

test('QA HTTP 403 giữ phiên hợp lệ, HTTP 401 xóa phiên và báo hết hạn', async (t) => {
  let status = 403
  const { store, api } = await localHttp(t, (_request, response) => reply(response, status, { status }))
  store.authenticate(authData('A'), store.getSnapshot().revision)
  await assert.rejects(api.get('/users/me'))
  assert.equal(store.getSnapshot().user.id, 'A')
  status = 401
  await assert.rejects(api.get('/users/me'))
  assert.equal(store.getSnapshot().user, null)
  assert.equal(store.getToken(), null)
  assert.equal(store.getSnapshot().reason, 'expired')
})

test('QA response 401 chậm của A không xóa phiên mới B qua HTTP thật', async (t) => {
  let complete, started
  const ready = new Promise((resolve) => { started = resolve })
  const { store, api } = await localHttp(t, (_request, response) => { complete = () => reply(response, 401, { status: 401 }); started() })
  store.authenticate(authData('A'), store.getSnapshot().revision)
  const pending = api.get('/users/me')
  await ready
  store.clear()
  store.authenticate(authData('B'), store.getSnapshot().revision)
  complete()
  await assert.rejects(pending, { code: 'ERR_CANCELED' })
  assert.equal(store.getSnapshot().user.id, 'B')
})

test('QA mất mạng khi lưu: không gọi thành công, không tự POST lại', async (t) => {
  let requests = 0, success = 0, errors = 0
  const { api } = await localHttp(t, (request) => { requests++; request.socket.destroy() })
  const save = createQuickAddSubmission({ create: (data) => api.post('/transactions', data),
    onSaving() {}, onSaved() { success++ }, onError() { errors++ } })
  await assert.rejects(save({ amount: 0.01, type: 'EXPENSE', categoryId: 1, transactionDate: '2026-10-31', note: 'QA_ONLY' }))
  assert.equal(requests, 1)
  assert.equal(success, 0)
  assert.equal(errors, 1)
})
