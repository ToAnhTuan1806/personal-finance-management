import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { monthDates } from '../src/utils/calendar.js'

let server, MonthCalendar, CalendarMonthContent
const dataFor = (year, month) => ({ year, month, incomeTotal: 0, expenseTotal: 0,
  days: monthDates(year, month).map((date) => ({ date, incomeTotal: 0, expenseTotal: 0 })) })
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  const components = await server.ssrLoadModule('/src/components/calendar/MonthCalendar.jsx')
  MonthCalendar = components.default
  CalendarMonthContent = components.CalendarMonthContent
})
after(async () => { await server?.close() })
const render = (data, props = {}) => renderToStaticMarkup(createElement(MonthCalendar, { data, onSelect() {}, ...props }))

test('Calendar có 7 tiêu đề T2–CN và đủ nút ngày ở tháng trống', () => {
  const html = render(dataFor(2026, 2))
  assert.equal((html.match(/scope="col"/g) || []).length, 7)
  assert.ok(html.indexOf('>T2<') < html.indexOf('>CN<'))
  assert.equal((html.match(/<button /g) || []).length, 28)
  assert.ok(html.includes('2026-02-01: Thu 0 ₫, Chi 0 ₫'))
  assert.ok(html.includes('2026-02-28: Thu 0 ₫, Chi 0 ₫'))
})

test('năm nhuận render 29 ngày, lựa chọn và hôm nay có trạng thái accessible', () => {
  const html = render(dataFor(2028, 2), { selectedDate: '2028-02-29', today: '2028-02-28' })
  assert.equal((html.match(/<button /g) || []).length, 29)
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1)
  assert.equal((html.match(/aria-current="date"/g) || []).length, 1)
  assert.match(html, /aria-label="2028-02-29[^>]*aria-pressed="true"/)
})

test('mỗi ô giữ số tiền đầy đủ cho screen reader, không làm tròn mất phần lẻ', () => {
  const data = dataFor(2026, 12)
  data.days[30].incomeTotal = 9999999999999.99
  data.days[30].expenseTotal = 0.01
  const html = render(data)
  assert.ok(html.includes('2026-12-31: Thu 9.999.999.999.999,99 ₫, Chi 0,01 ₫'))
  assert.ok(html.includes('table-fixed') && html.includes('dark:'))
})

test('Calendar không render chi tiết giao dịch hoặc nút thêm thuộc D05', () => {
  const html = render(dataFor(2026, 10))
  assert.ok(!html.includes('type="submit"'))
  assert.ok(!html.includes('/transactions'))
  assert.equal((html.match(/<button /g) || []).length, 31)
})

const renderContent = (props = {}) => renderToStaticMarkup(createElement(CalendarMonthContent, {
  year: 2028, month: 2, onRetry() {}, onSelect() {}, ...props,
}))

test('đang tải không hiển thị tổng tiền tháng cũ hoặc thông báo tháng trống', () => {
  const html = renderContent({ result: null })
  assert.ok(html.includes('Đang tải lịch tháng 2/2028'))
  assert.ok(!html.includes('Tổng thu tháng') && !html.includes('chưa có giao dịch'))
})

test('lỗi Calendar có nút retry, không dùng dữ liệu cũ hoặc tổng 0 giả', () => {
  const html = renderContent({ result: { error: 'TEST_NETWORK_ERROR', data: null } })
  assert.ok(html.includes('role="alert"') && html.includes('TEST_NETWORK_ERROR'))
  assert.ok(html.includes('Thử lại'))
  assert.ok(!html.includes('Tổng thu tháng') && !html.includes('chưa có giao dịch'))
})

test('tháng trống hiển thị thông báo thật và vẫn giữ đầy đủ lưới ngày', () => {
  const html = renderContent({ result: { data: dataFor(2028, 2) } })
  assert.ok(html.includes('Tháng này chưa có giao dịch'))
  assert.equal((html.match(/aria-pressed=/g) || []).length, 29)
})

test('hiển thị tổng tháng từ DTO và tổng đầy đủ của ngày đã chọn', () => {
  const data = dataFor(2028, 2)
  data.incomeTotal = 1234567.89
  data.expenseTotal = 0.01
  data.days[28].incomeTotal = 1234567.89
  data.days[28].expenseTotal = 0.01
  const html = renderContent({ result: { data }, selectedDate: '2028-02-29' })
  assert.ok(html.includes('1.234.567,89 ₫') && html.includes('0,01 ₫'))
  assert.ok(html.includes('Ngày 29/02/2028'))
  assert.ok(!html.includes('chưa có giao dịch'))
})
