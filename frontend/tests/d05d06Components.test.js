import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { categoryForm, CATEGORY_ICONS } from '../src/utils/categoryAppearance.js'

let server, DayContent, Picker, Badge, Modal, TransactionModal
const noOp = () => {}
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  DayContent = (await server.ssrLoadModule('/src/components/calendar/DayTransactions.jsx')).DayTransactionsContent
  Picker = (await server.ssrLoadModule('/src/components/category/CategoryAppearancePicker.jsx')).default
  Badge = (await server.ssrLoadModule('/src/components/category/CategoryBadge.jsx')).default
  Modal = (await server.ssrLoadModule('/src/components/CategoryModal.jsx')).default
  TransactionModal = (await server.ssrLoadModule('/src/components/TransactionModal.jsx')).default
})
after(async () => { await server?.close() })
const renderDay = (result, page = 0) => render(DayContent, { date: '2028-02-29', page, result, onPage: noOp, onRetry: noOp, onAdd: noOp })
const dayResult = (content = [], total = content.length, page = 0) => ({ categories: [], data: { content, number: page, totalElements: total, totalPages: Math.ceil(total / 10), size: 10 } })

test('chi tiết ngày loading/error tách biệt empty, có retry và nút thêm Thu/Chi', () => {
  const loading = renderDay(null), error = renderDay({ error: 'TEST_API_ERROR' })
  assert.ok(loading.includes('Đang tải giao dịch') && !loading.includes('chưa có giao dịch'))
  assert.ok(error.includes('role="alert"') && error.includes('Thử lại'))
  for (const html of [loading, error]) assert.ok(html.includes('Thêm giao dịch thu') && html.includes('Thêm giao dịch chi'))
})
test('ngày trống không tạo dòng giả; tổng và pager bằng 0', () => {
  const html = renderDay(dayResult())
  assert.ok(html.includes('Ngày này chưa có giao dịch.') && html.includes('0 giao dịch'))
  assert.ok(html.includes('Trang 0/0'))
  assert.equal((html.match(/<li /g) || []).length, 0)
})
test('dòng ngày hiển thị đủ DTO, phần lẻ và escape ghi chú', () => {
  const html = renderDay(dayResult([{ id: 1, categoryId: 1, categoryName: 'TEST_CATEGORY', type: 'INCOME', amount: 0.01, note: '<script>TEST</script>', transactionDate: '2028-02-29' }]))
  assert.ok(html.includes('TEST_CATEGORY') && html.includes('Thu nhập') && html.includes('29/02/2028') && html.includes('0,01 ₫'))
  assert.ok(html.includes('&lt;script&gt;TEST&lt;/script&gt;') && !html.includes('<script>'))
})
test('pager trang cuối/vượt phạm vi vẫn có cách quay trang đầu', () => {
  const html = renderDay(dayResult([], 11, 2), 2)
  assert.ok(html.includes('Trang này không còn giao dịch') && html.includes('Trang đầu'))
  assert.match(html, /<button[^>]*disabled=""[^>]*>Sau<\/button>/)
})
test('picker có đúng 20 icon với trạng thái chọn và nút reset', () => {
  const html = render(Picker, { form: { ...categoryForm(), icon: 'gift' }, errors: {}, onChange: noOp })
  for (const item of CATEGORY_ICONS) assert.ok(html.includes(`(${item.key})`))
  assert.ok(html.includes('Quà tặng (gift)') && html.includes('aria-pressed="true"'))
  assert.ok(html.includes('Đặt lại biểu tượng mặc định') && html.includes('Đặt lại màu mặc định'))
})
test('picker khóa toàn bộ control khi lưu và gắn lỗi field đúng chỗ', () => {
  const html = render(Picker, { form: categoryForm(), errors: { icon: 'ICON_ERROR', color: 'COLOR_ERROR' }, disabled: true, onChange: noOp })
  assert.match(html, /<fieldset[^>]*disabled=""/)
  assert.ok(html.includes('category-icon-error') && html.includes('category-color-error'))
  assert.ok(html.includes('ICON_ERROR') && html.includes('COLOR_ERROR'))
})
test('badge dữ liệu cũ dùng fallback an toàn; màu/icon ngoài allowlist không đi vào style', () => {
  const html = render(Badge, { category: { icon: '<svg>', color: 'url(javascript:TEST)' } })
  assert.ok(html.includes('background-color:#64748B') && html.includes('lucide-tag'))
  assert.ok(!html.includes('javascript:'))
})
test('CategoryModal sửa tên vẫn hiển thị metadata hiện có', () => {
  const html = render(Modal, { open: true, category: { id: 1, name: 'TEST_OLD', type: 'EXPENSE', icon: 'gift', color: '#123456' }, saving: false, onSave: noOp, onClose: noOp })
  assert.ok(html.includes('value="TEST_OLD"') && html.includes('value="#123456"') && html.includes('lucide-gift'))
})
test('Quick Add hiển thị icon/màu danh mục đã chọn từ dữ liệu Category API', () => {
  const category = { id: 1, name: 'TEST_CHOICE', type: 'INCOME', icon: 'gift', color: '#ABCDEF' }
  const html = render(TransactionModal, { open: true, transaction: { id: 1, categoryId: 1, type: 'INCOME', amount: 1, transactionDate: '2028-02-29', note: '' }, categories: [category], onSave: noOp, onClose: noOp })
  assert.ok(html.includes('background-color:#ABCDEF') && html.includes('lucide-gift'))
})

// Gọi handler của component thuần để kiểm tra tham số; không coi đây là tương tác DOM/browser.
function elements(element) {
  if (!element || typeof element !== 'object') return []
  return [element, ...[element.props?.children].flat(Infinity).flatMap(elements)]
}
test('nút thêm từ ngày chọn truyền đúng INCOME/EXPENSE và DATE nguyên vẹn', () => {
  const calls = []
  const tree = DayContent({ date: '2028-02-29', page: 0, result: dayResult(), onPage: noOp, onRetry: noOp, onAdd: (...args) => calls.push(args) })
  for (const name of ['Thêm giao dịch chi', 'Thêm giao dịch thu']) elements(tree).find((node) => node.type === 'button' && node.props.children === name).props.onClick()
  assert.deepEqual(calls, [['EXPENSE', '2028-02-29'], ['INCOME', '2028-02-29']])
})
test('handler phân trang chuyển đúng trang trước/sau và trang đầu', () => {
  const calls = []
  const tree = DayContent({ date: '2028-02-29', page: 1, result: dayResult([], 30, 1), onPage: (page) => calls.push(page), onRetry: noOp, onAdd: noOp })
  for (const name of ['Trước', 'Sau', 'Trang đầu']) elements(tree).find((node) => node.type === 'button' && node.props.children === name).props.onClick()
  assert.deepEqual(calls, [0, 2, 0])
})
test('picker truyền đúng key/màu đã chọn và null khi reset từng field', () => {
  const calls = []
  const tree = Picker({ form: categoryForm(), errors: {}, disabled: false, onChange: (...args) => calls.push(args) })
  const nodes = elements(tree)
  nodes.find((node) => node.props?.['aria-label'] === 'Quà tặng (gift)').props.onClick()
  nodes.find((node) => node.props?.['aria-label'] === 'Màu #F59E0B').props.onClick()
  nodes.find((node) => node.props?.children === 'Đặt lại màu mặc định').props.onClick()
  nodes.find((node) => node.props?.children === 'Đặt lại biểu tượng mặc định').props.onClick()
  assert.deepEqual(calls, [['icon', 'gift'], ['color', '#F59E0B'], ['color', null], ['icon', null]])
})
