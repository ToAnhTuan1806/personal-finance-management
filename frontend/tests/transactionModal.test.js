import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, Modal
const categories = [{ id: 1, name: 'TEST_EXPENSE', type: 'EXPENSE' }, { id: 2, name: 'TEST_INCOME', type: 'INCOME' }]
before(async () => {
  // Render component thật bằng Vite sẵn có; không mở HTTP server hoặc gọi API.
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  Modal = (await server.ssrLoadModule('/src/components/TransactionModal.jsx')).default
})
after(async () => { await server?.close() })
const render = (props = {}) => renderToStaticMarkup(createElement(Modal, {
  open: true, categories, saving: false, onClose() {}, onSave() {}, ...props,
}))

test('modal INCOME lọc danh mục và giữ nguyên ngày đã chọn', () => {
  const html = render({ initialType: 'INCOME', initialDate: '2028-02-29' })
  assert.ok(html.includes('role="dialog"') && html.includes('aria-modal="true"'))
  assert.ok(html.includes('TEST_INCOME') && !html.includes('TEST_EXPENSE'))
  assert.ok(html.includes('value="2028-02-29"'))
})
test('modal EXPENSE không hiển thị category INCOME', () => {
  const html = render({ initialType: 'EXPENSE' })
  assert.ok(html.includes('TEST_EXPENSE') && !html.includes('TEST_INCOME'))
})
test('đang tải danh mục khóa submit, không thông báo là chưa có danh mục', () => {
  const html = render({ categories: [], categoriesLoading: true })
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
  assert.ok(!html.includes('Chưa có danh mục'))
})
test('tải danh mục lỗi có retry và khóa submit, phân biệt với danh sách rỗng', () => {
  const html = render({ categories: [], categoriesError: 'TEST_API_ERROR', onRetryCategories() {} })
  assert.ok(html.includes('role="alert"') && html.includes('TEST_API_ERROR'))
  assert.ok(html.includes('Thử tải lại danh mục') && !html.includes('Chưa có danh mục'))
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
})
test('danh mục rỗng thật có hướng dẫn và không cho gửi thiếu category', () => {
  const html = render({ categories: [] })
  assert.ok(html.includes('Chưa có danh mục'))
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
})
test('đang lưu khóa toàn bộ trường và nút submit', () => {
  const html = render({ saving: true })
  assert.match(html, /<fieldset[^>]*disabled=""/)
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
  assert.ok(html.includes('Đang lưu...'))
})
test('form sửa MVP vẫn giữ category, ngày, tiền và ghi chú', () => {
  const html = render({ transaction: { id: 11, categoryId: 1, type: 'EXPENSE', amount: 12.34, transactionDate: '2026-10-31', note: 'TEST_NOTE' } })
  assert.ok(html.includes('value="12.34"') && html.includes('value="2026-10-31"'))
  assert.ok(html.includes('TEST_NOTE') && html.includes('Lưu thay đổi'))
})
test('modal đóng không render trường hoặc dữ liệu cũ', () => assert.equal(render({ open: false }), ''))
