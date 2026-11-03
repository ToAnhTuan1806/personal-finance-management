import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionStore } from '../src/auth/session.js'
import { createAuthActions } from '../src/auth/actions.js'

const user = (id) => ({ id, fullName: 'Test ' + id, email: id + '@example.test' })
const loginData = (id) => ({ accessToken: 'test-token-' + id, user: user(id) })
const memory = (values = {}) => {
  const data = new Map(Object.entries(values))
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }
}
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('login chỉ xác thực từ response thật và logout xóa toàn bộ phiên', async () => {
  const storage = memory(), store = createSessionStore(storage)
  const actions = createAuthActions(store, { login: async () => loginData('A') })
  await actions.login('a@example.test', 'test-only')
  assert.equal(store.getSnapshot().user.id, 'A')
  actions.logout()
  assert.equal(store.getSnapshot().user, null)
  assert.equal(store.getToken(), null)
  assert.equal(storage.getItem('currentUser'), null)
})

for (const error of [new Error('Network Error'), { code: 'ECONNABORTED' }, { response: { status: 401 } }]) {
  test('login không tạo user/token khi thất bại: ' + (error.code || error.response?.status || 'network'), async () => {
    const store = createSessionStore(memory())
    const actions = createAuthActions(store, { login: async () => { throw error } })
    await assert.rejects(actions.login('a@example.test', 'test-only'))
    assert.equal(store.getSnapshot().user, null)
    assert.equal(store.getToken(), null)
  })
}

test('không tin currentUser cache khi không có token', async () => {
  const storage = memory({ currentUser: JSON.stringify(user('A')) })
  const store = createSessionStore(storage)
  const actions = createAuthActions(store, { getCurrentUser: () => assert.fail('Không được gọi API') })
  await actions.restore()
  assert.equal(store.getSnapshot().user, null)
  assert.equal(storage.getItem('currentUser'), null)
})

test('restore mất mạng không cấp quyền từ cache; cho phép xác minh lại token', async () => {
  const store = createSessionStore(memory({ accessToken: 'test-token', currentUser: JSON.stringify(user('A')) }))
  await createAuthActions(store, { getCurrentUser: async () => { throw new Error('Offline') } }).restore()
  assert.equal(store.getSnapshot().user, null)
  assert.equal(store.getSnapshot().loading, false)
  assert.ok(store.getSnapshot().error)
  await createAuthActions(store, { getCurrentUser: async () => user('A') }).restore()
  assert.equal(store.getSnapshot().user.id, 'A')
})

test('restore 401 xóa phiên, không coi lỗi mạng là đăng nhập thành công', async () => {
  const storage = memory({ accessToken: 'test-token', currentUser: JSON.stringify(user('A')) })
  const store = createSessionStore(storage)
  await createAuthActions(store, { getCurrentUser: async () => { throw { response: { status: 401 } } } }).restore()
  assert.equal(store.getSnapshot().reason, 'expired')
  assert.equal(store.getToken(), null)
  assert.equal(storage.getItem('currentUser'), null)
})

// Response chậm của A không được khôi phục quyền hoặc thay thế B.
test('bỏ response login cũ sau khi logout và đăng nhập tài khoản khác', async () => {
  const store = createSessionStore(memory()), wait = deferred()
  const pending = createAuthActions(store, { login: () => wait.promise }).login('a@example.test', 'test-only')
  store.clear()
  store.authenticate(loginData('B'), store.getSnapshot().revision)
  wait.resolve(loginData('A'))
  await assert.rejects(pending, { code: 'ERR_CANCELED' })
  assert.equal(store.getSnapshot().user.id, 'B')
})

test('bỏ response restore cũ sau logout', async () => {
  const store = createSessionStore(memory({ accessToken: 'test-token' })), wait = deferred()
  const pending = createAuthActions(store, { getCurrentUser: () => wait.promise }).restore()
  store.clear()
  wait.resolve(user('A'))
  await pending
  assert.equal(store.getSnapshot().user, null)
  assert.equal(store.getToken(), null)
})

test('response login thiếu user/token bị từ chối', async () => {
  const store = createSessionStore(memory())
  await assert.rejects(createAuthActions(store, { login: async () => ({ accessToken: 'test-only' }) }).login('a', 'b'), { code: 'INVALID_API_RESPONSE' })
  assert.equal(store.getSnapshot().user, null)
})

test('storage bị chặn vẫn xóa quyền và token trong bộ nhớ', () => {
  let blocked = false
  const storage = memory()
  const store = createSessionStore({ ...storage, removeItem: (key) => { if (blocked) throw new Error('Blocked'); storage.removeItem(key) } })
  store.authenticate(loginData('A'), 0)
  blocked = true
  store.clear()
  assert.equal(store.getToken(), null)
  assert.equal(store.getSnapshot().user, null)
})
