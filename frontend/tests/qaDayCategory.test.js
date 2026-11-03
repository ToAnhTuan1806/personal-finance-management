import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createServer as createHttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter } from 'react-router'
import { createServer } from 'vite'
import { calendarSelection, calendarParams } from '../src/utils/calendarSelection.js'
import { categoryForm, categoryPayload, validateCategoryForm, COLOR_PALETTE } from '../src/utils/categoryAppearance.js'
import { createSubmitGuard } from '../src/utils/transactionForm.js'
import { getApiErrorMessage, getApiFieldErrors } from '../src/api/errors.js'

const storage = new Map()
globalThis.sessionStorage = { getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
const { default: client } = await import('../src/api/axiosClient.js')
const { session } = await import('../src/auth/session.js')
const { getDayTransactions } = await import('../src/services/dayTransactionService.js')
const { createCategory, updateCategory } = await import('../src/services/categoryService.js')
const original = { baseURL: client.defaults.baseURL, timeout: client.defaults.timeout, proxy: client.defaults.proxy }
const identity = (id) => session.authenticate({ accessToken: 'qa-only-' + randomUUID(), user: { id, fullName: 'QA', email: id + '@example.test' } }, session.getSnapshot().revision)
const reply = (response, status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
const page = (date, number = 0) => ({ number, size: 10, totalElements: 11, totalPages: 2,
  content: [{ id: 11 - number, categoryId: 1, categoryName: 'QA', type: 'INCOME', amount: 0.01, transactionDate: date, note: null }] })
async function fixture(t, handler, timeout = 5000) {
  const server = createHttpServer(handler)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  client.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`; client.defaults.proxy = false; client.defaults.timeout = timeout
  identity('A')
  t.after(async () => {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve))
    Object.assign(client.defaults, original); session.clear()
  })
}
let vite, DayContent, Picker, Modal, TransactionModal
const noOp = () => {}
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
function nodes(element) {
  if (!element || typeof element !== 'object') return []
  return [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)]
}
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  DayContent = (await vite.ssrLoadModule('/src/components/calendar/DayTransactions.jsx')).DayTransactionsContent
  Picker = (await vite.ssrLoadModule('/src/components/category/CategoryAppearancePicker.jsx')).default
  Modal = (await vite.ssrLoadModule('/src/components/CategoryModal.jsx')).default
  TransactionModal = (await vite.ssrLoadModule('/src/components/TransactionModal.jsx')).default
})
after(async () => { await vite?.close() })

test('QA router memory Back/Forward khôi phục tháng/ngày/trang và reset trang khi đổi ngày', async () => {
  const first = '/calendar?' + new URLSearchParams(calendarParams({ year: 2028, month: 2 }, '2028-02-29', 1))
  const second = '/calendar?' + new URLSearchParams(calendarParams({ year: 2028, month: 3 }, '2028-03-01'))
  const router = createMemoryRouter([{ path: '/calendar', element: createElement('div') }], { initialEntries: [first] })
  try {
    const read = () => calendarSelection(new URLSearchParams(router.state.location.search), '2026-11-01')
    await router.navigate(second)
    assert.deepEqual(read(), { year: 2028, month: 3, date: '2028-03-01', page: 0 })
    await router.navigate(-1)
    assert.deepEqual(read(), { year: 2028, month: 2, date: '2028-02-29', page: 1 })
    await router.navigate(1)
    assert.deepEqual(read(), { year: 2028, month: 3, date: '2028-03-01', page: 0 })
  } finally { router.dispose() }
})

for (const status of [200, 401]) {
  test(`QA HTTP chi tiết ngày: response A ${status} đến sau phiên B bị loại`, async (t) => {
    let complete, started
    const ready = new Promise((resolve) => { started = resolve })
    await fixture(t, (_request, response) => { complete = () => reply(response, status, status === 200 ? page('2028-02-29') : { status }); started() })
    const pending = getDayTransactions('2028-02-29')
    await ready
    session.clear(); identity('B'); complete()
    await assert.rejects(pending, { code: 'ERR_CANCELED' })
    assert.equal(session.getSnapshot().user.id, 'B')
  })
}

test('QA HTTP đổi ngày: hủy response cũ, giữ đúng dữ liệu ngày mới', async (t) => {
  let oldResponse, started
  const ready = new Promise((resolve) => { started = resolve })
  await fixture(t, (request, response) => {
    const date = new URL(request.url, 'http://127.0.0.1').searchParams.get('startDate')
    if (date === '2028-02-29') { oldResponse = response; started() }
    else reply(response, 200, page(date))
  })
  const controller = new AbortController()
  const old = getDayTransactions('2028-02-29', 0, { signal: controller.signal })
  // Gắn catch ngay để việc hủy không tạo unhandled rejection trong test.
  const rejected = assert.rejects(old, { code: 'ERR_CANCELED' })
  await ready
  const latest = await getDayTransactions('2028-03-01')
  controller.abort(); reply(oldResponse, 200, page('2028-02-29'))
  await rejected
  assert.equal(latest.content[0].transactionDate, '2028-03-01')
})

for (const failure of [400, 401, 403, 500, 'network', 'timeout']) {
  test('QA Category save ' + failure + ': reject, giữ model metadata và không tự retry', async (t) => {
    let calls = 0
    await fixture(t, (request, response) => {
      calls++
      if (failure === 'network') request.socket.destroy()
      else if (failure !== 'timeout') reply(response, failure, { status: failure, errors: { color: 'QA_COLOR_ERROR' } })
    }, failure === 'timeout' ? 100 : 5000)
    const form = { ...categoryForm({ icon: 'gift', color: '#123456' }), name: 'QA_PRESERVE', color: '#ABCDEF' }
    const before = structuredClone(form), guard = createSubmitGuard()
    await assert.rejects(guard.run(() => updateCategory(1, categoryPayload(form, true, { color: true }))))
    assert.equal(calls, 1)
    assert.equal(guard.isPending(), false)
    assert.deepEqual(form, before)
  })
}

test('QA Category guard: nhiều lời gọi đồng thời chỉ gửi một PUT với đúng field đã sửa', async (t) => {
  let calls = 0, sent
  await fixture(t, (request, response) => {
    calls++
    let data = ''; request.on('data', (chunk) => { data += chunk }); request.on('end', () => { sent = JSON.parse(data); reply(response, 200, { id: 1, ...sent }) })
  })
  const guard = createSubmitGuard(), form = { ...categoryForm({ icon: 'gift', color: '#123456' }), name: 'QA_EDIT' }
  const pending = Array.from({ length: 10 }, () => guard.run(() => updateCategory(1, categoryPayload(form, true))))
  await Promise.all(pending)
  assert.equal(calls, 1)
  assert.deepEqual(sent, { name: 'QA_EDIT', type: 'EXPENSE' })
})

for (const method of ['POST', 'PUT']) {
  test(`QA Category ${method} 409: giữ đúng thông báo, không retry tự động và cho phép gửi lại có chủ đích`, async (t) => {
    const message = 'Tên danh mục đã tồn tại với loại này'
    const requests = []
    await fixture(t, (request, response) => {
      let raw = ''
      request.on('data', (chunk) => { raw += chunk })
      request.on('end', () => {
        requests.push({ method: request.method, path: request.url, body: JSON.parse(raw) })
        if (requests.length === 1) reply(response, 409, { status: 409, code: 'CONFLICT', message })
        else reply(response, 200 + (method === 'POST' ? 1 : 0), {
          id: 1, ...requests.at(-1).body, icon: 'gift', color: '#ABCDEF',
        })
      })
    })
    const guard = createSubmitGuard()
    const save = method === 'POST' ? createCategory : (body) => updateCategory(1, body)
    const form = { ...categoryForm({ icon: 'gift', color: '#ABCDEF' }), name: '  Ăn uống  ' }
    const payload = (name) => categoryPayload({ ...form, name }, method === 'PUT')
    await assert.rejects(guard.run(() => save(payload(form.name))), (error) => {
      assert.equal(error.response.status, 409)
      assert.equal(error.response.data.code, 'CONFLICT')
      assert.equal(getApiErrorMessage(error), message)
      assert.deepEqual(getApiFieldErrors(error, ['name', 'type', 'icon', 'color']), {})
      return true
    })
    assert.equal(requests.length, 1)
    assert.equal(guard.isPending(), false)
    assert.equal(session.getSnapshot().user.id, 'A')
    const saved = await guard.run(() => save(payload('Tên QA mới')))
    assert.equal(saved.name, 'Tên QA mới')
    assert.equal(requests.length, 2)
    assert.equal(requests[0].method, method)
    assert.equal(requests[0].path, method === 'POST' ? '/api/categories' : '/api/categories/1')
    assert.equal(requests[0].body.name, 'Ăn uống')
    assert.equal(requests[1].body.name, 'Tên QA mới')
    assert.equal(guard.isPending(), false)
  })
}

test('QA thêm từ ngày chọn nối handler tới TransactionModal với DATE đúng và loại Thu/Chi', () => {
  for (const type of ['INCOME', 'EXPENSE']) {
    let selected
    const tree = DayContent({ date: '2028-02-29', page: 0, result: null, onAdd: (...args) => { selected = args }, onPage: noOp, onRetry: noOp })
    const label = type === 'INCOME' ? 'Thêm giao dịch thu' : 'Thêm giao dịch chi'
    nodes(tree).find((node) => node.type === 'button' && node.props.children === label).props.onClick()
    const html = render(TransactionModal, { open: true, initialType: selected[0], initialDate: selected[1], categories: [{ id: 1, type, name: 'QA', icon: 'gift', color: '#ABCDEF' }], onSave: noOp, onClose: noOp })
    assert.equal(selected[0], type)
    assert.ok(html.includes('value="2028-02-29"'))
    assert.ok(html.includes(type === 'INCOME' ? '<option value="INCOME" selected="">' : '<option value="EXPENSE" selected="">'))
  }
})

test('QA picker: chọn màu preset đúng và lỗi màu liên kết accessible', () => {
  let form = { ...categoryForm(), name: 'QA' }
  const change = (field, value) => { form = { ...form, [field]: value } }
  const tree = Picker({ form, errors: {}, disabled: false, onChange: change })
  // UI mới chỉ có preset; không giả lập nhập vào hidden input như kiểm thử UI.
  const color = COLOR_PALETTE.at(-1)
  const swatch = nodes(tree).find((node) => node.type === 'button' && node.props?.['aria-label'] === `Màu ${color}`)
  assert.ok(swatch)
  swatch.props.onClick()
  assert.equal(form.color, color)
  assert.deepEqual(validateCategoryForm(form), {})
  const errors = { color: 'QA_COLOR_ERROR' }
  const html = render(Picker, { form, errors, disabled: false, onChange: change })
  assert.ok(html.includes('aria-describedby="category-color-error"') && html.includes('role="alert"'))
})

test('QA metadata xuất hiện trong preview và chi tiết ngày; modal đang lưu khóa toàn bộ picker', () => {
  const category = { id: 1, name: 'QA_BADGE', type: 'INCOME', icon: 'gift', color: '#ABCDEF' }
  const html = render(DayContent, { date: '2028-02-29', page: 0, result: { data: page('2028-02-29'), categories: [category] }, onAdd: noOp, onPage: noOp, onRetry: noOp })
  assert.ok(html.includes('lucide-gift') && html.includes('background-color:#ABCDEF'))
  const modal = render(Modal, { open: true, category, saving: true, onSave: noOp, onClose: noOp })
  assert.match(modal, /<fieldset[^>]*disabled=""/)
  assert.ok(modal.includes('aria-busy="true"') && modal.includes('value="#ABCDEF"'))
})

test('QA hết trang sau xóa: có hành động quay đầu, retry không gọi POST', () => {
  const calls = []
  const result = { data: { content: [], totalElements: 10, totalPages: 1 }, categories: [] }
  const tree = DayContent({ date: '2028-02-29', page: 1, result, onPage: (page) => calls.push(page), onAdd: noOp, onRetry: noOp })
  nodes(tree).find((node) => node.type === 'button' && node.props.children === 'Trang đầu').props.onClick()
  assert.deepEqual(calls, [0])
  const html = render(DayContent, { date: '2028-02-29', page: 1, result, onPage: noOp, onAdd: noOp, onRetry: noOp })
  assert.ok(html.includes('Trang này không còn giao dịch'))
})
