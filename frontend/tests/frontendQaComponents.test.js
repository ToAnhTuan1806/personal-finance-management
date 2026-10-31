import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { monthDates } from '../src/utils/calendar.js'

let server, Modal, MoneyInput, CategoryModal, BudgetModal, CalendarContent, ThemeProvider, ThemeToggle
const noOp = () => {}
const categories = [{ id: 1, name: 'KIEM_THU_CHI', type: 'EXPENSE' }, { id: 2, name: 'KIEM_THU_THU', type: 'INCOME' }]
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const renderModal = (props = {}) => render(Modal, { open: true, categories, onSave: noOp, onClose: noOp, ...props })

before(async () => {
  // Chỉ render component thật trong bộ nhớ; không giả lập trình duyệt hoặc gọi database.
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  Modal = (await server.ssrLoadModule('/src/components/TransactionModal.jsx')).default
  MoneyInput = (await server.ssrLoadModule('/src/components/ui/MoneyInput.jsx')).default
  CategoryModal = (await server.ssrLoadModule('/src/components/CategoryModal.jsx')).default
  BudgetModal = (await server.ssrLoadModule('/src/components/BudgetModal.jsx')).default
  CalendarContent = (await server.ssrLoadModule('/src/components/calendar/MonthCalendar.jsx')).CalendarMonthContent
  ThemeProvider = (await server.ssrLoadModule('/src/contexts/ThemeContext.jsx')).ThemeProvider
  ThemeToggle = (await server.ssrLoadModule('/src/components/layout/ThemeToggle.jsx')).default
})
after(async () => { await server?.close() })

test('Quick Add có label liên kết đủ 4 trường nhập liệu và nút đóng có tên', () => {
  const html = renderModal()
  for (const id of ['transaction-category', 'transaction-amount', 'transaction-date', 'transaction-note']) {
    assert.ok(html.includes(`for="${id}"`) && html.includes(`id="${id}"`))
  }
  assert.match(html, /aria-label="Đóng"/)
  assert.ok(html.includes('aria-labelledby="transaction-modal-title"'))
})

test('Quick Add escape tên danh mục và thông báo API chứa HTML', () => {
  const unsafe = '<img src=x onerror="TEST_ONLY">'
  const html = renderModal({ categories: [{ id: 1, name: unsafe, type: 'EXPENSE' }], categoriesError: unsafe, onRetryCategories: noOp })
  assert.ok(!html.includes('<img src=x'))
  assert.ok(html.includes('&lt;img'))
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
})

test('form sửa giữ ghi chú tiếng Việt 500 ký tự và ngày nhuận, escape nội dung HTML', () => {
  const unsafe = '<script>TEST_ONLY</script>'
  const prefix = 'ấ'.repeat(500 - unsafe.length)
  const note = prefix + unsafe
  assert.equal(note.length, 500)
  const html = renderModal({ transaction: { id: 1, type: 'EXPENSE', categoryId: 1, amount: 0.01, transactionDate: '2028-02-29', note } })
  assert.ok(html.includes('value="0.01"') && html.includes('value="2028-02-29"'))
  assert.ok(html.includes(prefix))
  assert.ok(html.includes('&lt;script&gt;TEST_ONLY&lt;/script&gt;'))
  assert.ok(!html.includes('<script>'))
})

test('MoneyInput giữ phần lẻ 0.01 trên input thật, có bàn phím decimal và nhãn trợ giúp', () => {
  const html = render(MoneyInput, { id: 'qa-money', value: '0.01', onChange: noOp })
  assert.match(html, /<input[^>]*inputMode="decimal"[^>]*aria-describedby="qa-money-help"[^>]*value="0.01"/)
  assert.ok(html.includes('for="qa-money"') && html.includes('id="qa-money-help"'))
})

test('MoneyInput lỗi có aria-invalid và thông báo gắn đúng input', () => {
  const html = render(MoneyInput, { id: 'qa-money', value: '0', error: 'KIEM_THU_LOI_TIEN', onChange: noOp })
  assert.ok(html.includes('aria-invalid="true"') && html.includes('aria-describedby="qa-money-error"'))
  assert.ok(html.includes('id="qa-money-error" role="alert"'))
  assert.ok(html.includes('KIEM_THU_LOI_TIEN'))
})

test('MoneyInput đang lưu khóa cả textbox và mọi nút cộng nhanh', () => {
  const html = render(MoneyInput, { id: 'qa-money', value: '12.34', disabled: true, onChange: noOp })
  assert.match(html, /<input[^>]*disabled=""/)
  const buttons = html.match(/<button[^>]*>/g) || []
  assert.ok(buttons.length > 0 && buttons.every((button) => button.includes('disabled=""')))
})

test('Calendar đang lỗi che toàn bộ data cũ, không giả thành tháng trống', () => {
  const oldData = { year: 2028, month: 2, incomeTotal: 123456, expenseTotal: 0,
    days: monthDates(2028, 2).map((date) => ({ date, incomeTotal: 0, expenseTotal: 0 })) }
  const html = render(CalendarContent, { year: 2028, month: 3, result: { error: 'KIEM_THU_MAT_MANG', data: oldData }, onRetry: noOp })
  assert.ok(html.includes('KIEM_THU_MAT_MANG') && html.includes('Thử lại'))
  assert.ok(!html.includes('123.456') && !html.includes('Tổng thu tháng') && !html.includes('chưa có giao dịch'))
})

test('đổi tháng không đánh dấu ngày chọn của tháng trước trên lịch mới', () => {
  const data = { year: 2028, month: 3, incomeTotal: 0, expenseTotal: 0,
    days: monthDates(2028, 3).map((date) => ({ date, incomeTotal: 0, expenseTotal: 0 })) }
  const html = render(CalendarContent, { year: 2028, month: 3, result: { data }, selectedDate: '2028-02-29', today: '2028-02-29', onSelect: noOp })
  assert.ok(!html.includes('aria-pressed="true"') && !html.includes('aria-current="date"'))
  assert.ok(html.includes('Chọn một ngày'))
  assert.equal((html.match(/aria-pressed=/g) || []).length, 31)
})

test('regression CategoryModal giữ name/type cũ, khóa trường khi đang lưu', () => {
  const html = render(CategoryModal, { open: true, category: { id: 1, name: 'KIEM_THU_DANH_MUC', type: 'INCOME' }, saving: true, onSave: noOp, onClose: noOp })
  assert.ok(html.includes('value="KIEM_THU_DANH_MUC"'))
  assert.match(html, /<option value="INCOME" selected="">/)
  // Chấp nhận khóa từng trường hoặc cả fieldset, không ép cách triển khai.
  const fieldsLocked = /<fieldset[^>]*disabled=""/.test(html) ||
    (/<input[^>]*disabled=""/.test(html) && /<select[^>]*disabled=""/.test(html))
  assert.ok(fieldsLocked, 'Tên và loại danh mục vẫn sửa được khi saving=true')
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
})

test('CategoryModal mở khóa khi saving=false và giữ nguyên dữ liệu form sửa', () => {
  const html = render(CategoryModal, { open: true, category: { id: 1, name: 'KIEM_THU_DANH_MUC', type: 'INCOME' }, saving: false, onSave: noOp, onClose: noOp })
  assert.ok(html.includes('value="KIEM_THU_DANH_MUC"'))
  assert.match(html, /<option value="INCOME" selected="">/)
  assert.ok(!/<fieldset[^>]*disabled=""/.test(html))
  assert.ok(!/<(?:input|select|button)[^>]*disabled=""/.test(html))
  assert.ok(html.includes('aria-busy="false"'))
})

test('regression BudgetModal giữ hạn mức lẻ và khóa submit khi lưu', () => {
  const html = render(BudgetModal, { open: true, budget: { amountLimit: 123.45 }, monthLabel: '02/2028', saving: true, onSave: noOp, onClose: noOp })
  assert.ok(html.includes('value="123.45"') && html.includes('02/2028'))
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
})

for (const [theme, label] of [['light', 'Sáng'], ['dark', 'Tối'], ['system', 'Hệ thống']]) {
  test(`ThemeToggle đọc preference ${theme} và có nhãn accessible đúng (chỉ render)`, () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => theme } })
    try {
      const html = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(ThemeToggle)))
      assert.ok(html.includes(`Chọn giao diện (hiện tại: ${label})`))
      assert.ok(html.includes('aria-haspopup="menu"') && html.includes('aria-expanded="false"'))
    } finally {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
      else delete globalThis.localStorage
    }
  })
}
