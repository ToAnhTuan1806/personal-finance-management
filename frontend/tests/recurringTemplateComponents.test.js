import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  DAY_31_NOTICE,
  DISCLAIMER_NOTICE,
  formatDayOfMonth,
  formatMoney,
  isDay31,
  validateRecurringTemplateForm,
} from '../src/components/recurring/recurringTemplateUtils.js'
import { navigation } from '../src/components/layout/navigation.js'

let server
let RecurringTemplateCard
let RecurringTemplateModal
let RecurringTemplatesPage

const render = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props))

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  RecurringTemplateCard = (
    await server.ssrLoadModule('/src/components/recurring/RecurringTemplateCard.jsx')
  ).default
  RecurringTemplateModal = (
    await server.ssrLoadModule('/src/components/recurring/RecurringTemplateModal.jsx')
  ).default
  RecurringTemplatesPage = (
    await server.ssrLoadModule('/src/pages/RecurringTemplates.jsx')
  ).default
})

after(async () => {
  await server?.close()
})

/* ========================================================================== */
/* 1. Unit Tests for recurringTemplateUtils                                   */
/* ========================================================================== */

test('recurringTemplateUtils: constants chính xác theo SRS', () => {
  assert.equal(
    DISCLAIMER_NOTICE,
    'Đây chỉ là mẫu giao dịch định kỳ. Hệ thống chưa tự động ghi nhận thu hoặc chi.'
  )
  assert.equal(
    DAY_31_NOTICE,
    'Nếu tháng không có ngày 31, hệ thống sẽ dùng ngày cuối tháng.'
  )
})

test('recurringTemplateUtils.formatMoney: định dạng đúng VNĐ', () => {
  assert.match(formatMoney(3000000), /3\.000\.000\s*₫/)
  assert.match(formatMoney(0), /0\s*₫/)
  assert.match(formatMoney('50000'), /50\.000\s*₫/)
  assert.equal(formatMoney('invalid'), '0 ₫')
})

test('recurringTemplateUtils.formatDayOfMonth: hiển thị ngày lặp chuẩn', () => {
  assert.equal(formatDayOfMonth(1), 'Ngày 1 hằng tháng')
  assert.equal(formatDayOfMonth(15), 'Ngày 15 hằng tháng')
  assert.equal(formatDayOfMonth('31'), 'Ngày 31 hằng tháng')
  assert.equal(formatDayOfMonth(''), '')
})

test('recurringTemplateUtils.isDay31: kiểm tra ngày 31 chính xác', () => {
  assert.equal(isDay31(31), true)
  assert.equal(isDay31('31'), true)
  assert.equal(isDay31(30), false)
  assert.equal(isDay31(1), false)
  assert.equal(isDay31(null), false)
})

test('recurringTemplateUtils.validateRecurringTemplateForm: hợp lệ khi đủ dữ liệu chuẩn', () => {
  const categories = [
    { id: 1, name: 'Tiền thuê nhà', type: 'EXPENSE' },
    { id: 2, name: 'Lương', type: 'INCOME' },
  ]
  const validForm = {
    type: 'EXPENSE',
    categoryId: 1,
    amount: '3500000',
    dayOfMonth: '5',
    note: 'Đóng tiền nhà',
    active: true,
  }
  const result = validateRecurringTemplateForm(validForm, categories)
  assert.equal(result.isValid, true)
  assert.deepEqual(result.errors, {})
})

test('recurringTemplateUtils.validateRecurringTemplateForm: bắt lỗi type không hợp lệ hoặc thiếu', () => {
  const result = validateRecurringTemplateForm({
    type: 'INVALID',
    categoryId: 1,
    amount: 100000,
    dayOfMonth: 1,
  })
  assert.equal(result.isValid, false)
  assert.match(result.errors.type, /loại giao dịch/)
})

test('recurringTemplateUtils.validateRecurringTemplateForm: bắt lỗi categoryId rỗng hoặc không khớp type', () => {
  const categories = [
    { id: 1, name: 'Tiền nhà', type: 'EXPENSE' },
    { id: 2, name: 'Lương', type: 'INCOME' },
  ]

  // Rỗng
  const res1 = validateRecurringTemplateForm({ type: 'EXPENSE', categoryId: '' }, categories)
  assert.equal(res1.isValid, false)
  assert.match(res1.errors.categoryId, /chọn danh mục/)

  // Không khớp type (chọn category INCOME cho form EXPENSE)
  const res2 = validateRecurringTemplateForm(
    { type: 'EXPENSE', categoryId: 2, amount: 50000, dayOfMonth: 10 },
    categories
  )
  assert.equal(res2.isValid, false)
  assert.match(res2.errors.categoryId, /không thuộc loại giao dịch đã chọn/)
})

test('recurringTemplateUtils.validateRecurringTemplateForm: bắt lỗi số tiền <= 0, định dạng sai, quá lớn hoặc nhiều thập phân', () => {
  // Rỗng
  assert.match(
    validateRecurringTemplateForm({ amount: '' }).errors.amount,
    /nhập số tiền/
  )
  // Bằng 0
  assert.match(
    validateRecurringTemplateForm({ amount: '0' }).errors.amount,
    /lớn hơn 0/
  )
  // Âm
  assert.match(
    validateRecurringTemplateForm({ amount: '-1000' }).errors.amount,
    /định dạng|lớn hơn 0/
  )
  // Chữ cái
  assert.match(
    validateRecurringTemplateForm({ amount: 'abc' }).errors.amount,
    /định dạng/
  )
  // Quá 13 chữ số nguyên
  assert.match(
    validateRecurringTemplateForm({ amount: '12345678901234' }).errors.amount,
    /quá lớn/
  )
  // Quá 2 chữ số thập phân
  assert.match(
    validateRecurringTemplateForm({ amount: '100.123' }).errors.amount,
    /tối đa 2 chữ số thập phân/
  )
})

test('recurringTemplateUtils.validateRecurringTemplateForm: bắt lỗi dayOfMonth ngoài khoảng 1 - 31', () => {
  // Rỗng
  assert.match(
    validateRecurringTemplateForm({ dayOfMonth: '' }).errors.dayOfMonth,
    /nhập ngày/
  )
  // Nhỏ hơn 1
  assert.match(
    validateRecurringTemplateForm({ dayOfMonth: '0' }).errors.dayOfMonth,
    /1 đến 31/
  )
  // Lớn hơn 31
  assert.match(
    validateRecurringTemplateForm({ dayOfMonth: '32' }).errors.dayOfMonth,
    /1 đến 31/
  )
  // Không phải số nguyên
  assert.match(
    validateRecurringTemplateForm({ dayOfMonth: '15.5' }).errors.dayOfMonth,
    /số nguyên/
  )
})

test('recurringTemplateUtils.validateRecurringTemplateForm: bắt lỗi ghi chú vượt quá 500 ký tự', () => {
  const longNote = 'a'.repeat(501)
  const res = validateRecurringTemplateForm({ note: longNote })
  assert.match(res.errors.note, /tối đa 500 ký tự/)
})

/* ========================================================================== */
/* 2. Component Tests for RecurringTemplateCard                               */
/* ========================================================================== */

test('RecurringTemplateCard: render đầy đủ thông tin mẫu EXPENSE và không có nút Áp dụng', () => {
  const template = {
    id: 10,
    categoryId: 1,
    categoryName: 'Ăn uống',
    type: 'EXPENSE',
    amount: 1500000,
    dayOfMonth: 15,
    note: 'Tiền ăn trưa cố định',
    active: true,
  }

  const html = render(RecurringTemplateCard, { template })
  assert.match(html, /Ăn uống/)
  assert.match(html, /Chi tiêu/)
  assert.match(html, /1\.500\.000/)
  assert.match(html, /Ngày 15 hằng tháng/)
  assert.match(html, /Đang bật/)
  assert.match(html, /Tiền ăn trưa cố định/)
  assert.match(html, /aria-label="Sửa mẫu định kỳ Ăn uống"/)
  assert.match(html, /aria-label="Xóa mẫu định kỳ Ăn uống"/)

  // KHÔNG có nút Áp dụng trong D08
  assert.doesNotMatch(html, /Áp dụng/)
  assert.doesNotMatch(html, />Apply</)

  // Không có thông báo ngày 31 khi dayOfMonth là 15
  assert.doesNotMatch(html, new RegExp(DAY_31_NOTICE))
})

test('RecurringTemplateCard: render thông báo ngày 31 khi dayOfMonth === 31', () => {
  const template = {
    id: 11,
    categoryId: 2,
    categoryName: 'Thuê nhà',
    type: 'EXPENSE',
    amount: 5000000,
    dayOfMonth: 31,
    active: true,
  }

  const html = render(RecurringTemplateCard, { template })
  assert.match(html, /Ngày 31 hằng tháng/)
  assert.match(html, new RegExp(DAY_31_NOTICE))
})

test('RecurringTemplateCard: render mẫu INCOME với trạng thái Đã tắt', () => {
  const template = {
    id: 12,
    categoryId: 3,
    categoryName: 'Lương cố định',
    type: 'INCOME',
    amount: 25000000,
    dayOfMonth: 5,
    active: false,
  }

  const html = render(RecurringTemplateCard, { template })
  assert.match(html, /Lương cố định/)
  assert.match(html, /Thu nhập/)
  assert.match(html, /25\.000\.000/)
  assert.match(html, /Đã tắt/)
})

/* ========================================================================== */
/* 3. Component Tests for RecurringTemplateModal                              */
/* ========================================================================== */

test('RecurringTemplateModal: không render khi isOpen=false và template=null', () => {
  const html = render(RecurringTemplateModal, { isOpen: false, template: null })
  assert.equal(html, '')
})

test('RecurringTemplateModal: render form thêm mới với tiêu đề và các trường bắt buộc', () => {
  const categories = [
    { id: 1, name: 'Tiền trọ', type: 'EXPENSE' },
    { id: 2, name: 'Lương', type: 'INCOME' },
  ]

  const html = render(RecurringTemplateModal, {
    isOpen: true,
    template: null,
    categories,
  })

  assert.match(html, /Thêm mẫu định kỳ mới/)
  assert.match(html, /Loại giao dịch/)
  assert.match(html, /Chi tiêu/)
  assert.match(html, /Thu nhập/)
  assert.match(html, /Danh mục/)
  assert.match(html, /Số tiền định kỳ/)
  assert.match(html, /Ngày lặp hằng tháng/)
  assert.match(html, /Ghi chú \(tùy chọn\)/)
  assert.match(html, /Kích hoạt mẫu này/)
  assert.match(html, /Lưu mẫu/)
})

test('RecurringTemplateModal: render form chỉnh sửa với dữ liệu mẫu đã có', () => {
  const categories = [
    { id: 1, name: 'Tiền trọ', type: 'EXPENSE' },
  ]
  const template = {
    id: 99,
    categoryId: 1,
    type: 'EXPENSE',
    amount: 4000000,
    dayOfMonth: 31,
    note: 'Chuyển khoản ngày 31',
    active: true,
  }

  const html = render(RecurringTemplateModal, {
    isOpen: true,
    template,
    categories,
  })

  assert.match(html, /Chỉnh sửa mẫu định kỳ/)
  assert.match(html, /Cập nhật mẫu/)
  assert.match(html, /Chuyển khoản ngày 31/)
  // Hiển thị chú thích ngày 31 khi template có dayOfMonth = 31
  assert.match(html, new RegExp(DAY_31_NOTICE))
})

/* ========================================================================== */
/* 4. Component Tests for RecurringTemplates Page                             */
/* ========================================================================== */

test('RecurringTemplates: render tiêu đề trang, nút Thêm mẫu và cảnh báo bắt buộc', () => {
  const html = render(RecurringTemplatesPage, {})
  assert.match(html, /Giao dịch định kỳ/)
  assert.match(html, /Thêm mẫu/)
  assert.match(html, new RegExp(DISCLAIMER_NOTICE))
  assert.match(html, /Tất cả/)
  assert.match(html, /Đang bật/)
  assert.match(html, /Đã tắt/)
})

test('RecurringTemplates: render empty state khi danh sách rỗng', () => {
  const html = render(RecurringTemplatesPage, { initialTemplates: [] })
  assert.match(html, /Chưa có mẫu giao dịch định kỳ nào/)
  assert.match(html, /Thêm mẫu đầu tiên/)
})

test('RecurringTemplates: render danh sách các card mẫu khi có dữ liệu', () => {
  const initialTemplates = [
    {
      id: 1,
      categoryId: 10,
      categoryName: 'Tiền mạng',
      type: 'EXPENSE',
      amount: 300000,
      dayOfMonth: 12,
      active: true,
    },
    {
      id: 2,
      categoryId: 11,
      categoryName: 'Thu nhập phụ',
      type: 'INCOME',
      amount: 2000000,
      dayOfMonth: 20,
      active: false,
    },
  ]

  const html = render(RecurringTemplatesPage, { initialTemplates })
  assert.match(html, /Tiền mạng/)
  assert.match(html, /Thu nhập phụ/)
  assert.match(html, /300\.000/)
  assert.match(html, /2\.000\.000/)
  assert.doesNotMatch(html, /Chưa có mẫu giao dịch định kỳ nào/)
})

/* ========================================================================== */
/* 5. Navigation Configuration Test                                           */
/* ========================================================================== */

test('navigation: cấu hình đúng route /recurring-templates cho giao dịch định kỳ', () => {
  const recurringNav = navigation.find((item) => item.path === '/recurring-templates')
  assert.ok(recurringNav, 'Phải có mục navigation /recurring-templates')
  assert.equal(recurringNav.label, 'Định kỳ')
  assert.equal(recurringNav.authRequired, true)
  assert.ok(recurringNav.icon, 'Phải có Icon lucide')
})

