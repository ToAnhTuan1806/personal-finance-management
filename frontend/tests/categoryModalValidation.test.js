import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { categoryForm, categoryPayload, validateCategoryForm, COLOR_PALETTE } from '../src/utils/categoryAppearance.js'

let server, Picker, Modal

const noOp = () => {}
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))

function elements(element) {
  if (!element || typeof element !== 'object') return []
  return [element, ...[element.props?.children].flat(Infinity).flatMap(elements)]
}

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  server = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  Picker = (await server.ssrLoadModule('/src/components/category/CategoryAppearancePicker.jsx')).default
  Modal = (await server.ssrLoadModule('/src/components/CategoryModal.jsx')).default
})

after(async () => {
  await server?.close()
})

test('CategoryAppearancePicker: nút reset không có underline và mang style nút phụ dark/light', () => {
  const html = render(Picker, { form: categoryForm(), errors: {}, disabled: false, onChange: noOp })

  // Không còn class underline
  assert.ok(!html.includes('underline'))

  // Nút reset có style nút phụ tinh tế, hỗ trợ dark/light
  assert.ok(html.includes('border-slate-200'))
  assert.ok(html.includes('dark:border-slate-700'))
  assert.ok(html.includes('dark:bg-slate-800'))
  assert.ok(html.includes('Đặt lại biểu tượng mặc định'))
  assert.ok(html.includes('Đặt lại màu mặc định'))
})

test('CategoryAppearancePicker: không có ô nhập HEX (type="text") và không có ô chọn màu tự do (type="color")', () => {
  const html = render(Picker, { form: categoryForm(), errors: {}, disabled: false, onChange: noOp })

  assert.ok(!html.includes('type="color"'))
  assert.ok(!html.includes('id="category-color" type="text"'))
  assert.ok(!html.includes('Chọn màu tùy chỉnh'))
  assert.ok(!html.includes('Màu #RRGGBB'))
})

test('CategoryAppearancePicker: hiển thị đủ 17 nút màu preset từ COLOR_PALETTE', () => {
  const html = render(Picker, { form: categoryForm(), errors: {}, disabled: false, onChange: noOp })

  assert.equal(COLOR_PALETTE.length, 17)
  for (const color of COLOR_PALETTE) {
    assert.ok(html.includes(`aria-label="Màu ${color}"`))
    assert.ok(html.includes(`background-color:${color}`))
  }
})

test('CategoryAppearancePicker: giữ khả năng hiển thị dữ liệu màu cũ nằm ngoài 17 preset', () => {
  const customColor = '#123456'
  const html = render(Picker, {
    form: { ...categoryForm(), color: customColor },
    errors: {},
    disabled: false,
    onChange: noOp,
  })

  // Hiển thị trong badge preview
  assert.ok(html.includes(`background-color:${customColor}`))
  // Hiển thị indicator thông báo màu hiện tại
  assert.ok(html.includes('Màu hiện tại (tùy chỉnh):'))
  assert.ok(html.includes(customColor))
})

test('CategoryAppearancePicker: gọi onChange(null) khi bấm reset biểu tượng và màu', () => {
  const calls = []
  const tree = Picker({
    form: categoryForm(),
    errors: {},
    disabled: false,
    onChange: (field, val) => calls.push([field, val]),
  })
  const nodes = elements(tree)

  const resetIconBtn = nodes.find((n) => n.props?.children === 'Đặt lại biểu tượng mặc định')
  const resetColorBtn = nodes.find((n) => n.props?.children === 'Đặt lại màu mặc định')

  assert.ok(resetIconBtn)
  assert.ok(resetColorBtn)

  resetIconBtn.props.onClick()
  resetColorBtn.props.onClick()

  assert.deepEqual(calls, [
    ['icon', null],
    ['color', null],
  ])
})

test('CategoryModal: hiển thị loại danh mục bằng tiếng Việt "Chi tiêu" và "Thu nhập", giá trị EXPENSE/INCOME', () => {
  const html = render(Modal, {
    open: true,
    category: null,
    saving: false,
    onSave: noOp,
    onClose: noOp,
    categories: [],
  })

  // Option text tiếng Việt
  assert.ok(html.includes('>Chi tiêu</option>'))
  assert.ok(html.includes('>Thu nhập</option>'))
  assert.ok(html.includes('value="EXPENSE"'))
  assert.ok(html.includes('value="INCOME"'))
  // Không còn đuôi kỹ thuật (EXPENSE) / (INCOME) trong label option
  assert.ok(!html.includes('Chi tiêu (EXPENSE)'))
  assert.ok(!html.includes('Thu nhập (INCOME)'))
})

test('CategoryModal: khi có lỗi tên, hiển thị lỗi màu đỏ ngay dưới ô tên', () => {
  const categoryWithError = { id: 1, name: 'Ăn uống', type: 'EXPENSE' }
  const html = render(Modal, {
    open: true,
    category: categoryWithError,
    saving: false,
    onSave: noOp,
    onClose: noOp,
  })

  // Trường tên danh mục có id="category-name"
  assert.ok(html.includes('id="category-name"'))
  assert.ok(html.includes('Tên danh mục'))
})

test('validateCategoryForm: kiểm tra trùng tên cùng loại (không phân biệt chữ hoa/thường, khoảng trắng)', () => {
  const existingCategories = [
    { id: 1, name: 'Ăn uống', type: 'EXPENSE' },
    { id: 2, name: 'Tiền lương', type: 'INCOME' },
  ]

  // Trùng chính xác
  const errExact = validateCategoryForm({ name: 'Ăn uống', type: 'EXPENSE' }, existingCategories)
  assert.equal(errExact.name, 'Tên danh mục đã tồn tại trong loại này.')

  // Trùng chữ thường
  const errLower = validateCategoryForm({ name: 'ăn uống', type: 'EXPENSE' }, existingCategories)
  assert.equal(errLower.name, 'Tên danh mục đã tồn tại trong loại này.')

  // Trùng khoảng trắng đầu/cuối
  const errSpace = validateCategoryForm({ name: '   Ăn Uống   ', type: 'EXPENSE' }, existingCategories)
  assert.equal(errSpace.name, 'Tên danh mục đã tồn tại trong loại này.')

  // Không trùng
  const okUnique = validateCategoryForm({ name: 'Mua sắm', type: 'EXPENSE' }, existingCategories)
  assert.equal(okUnique.name, undefined)
})

test('validateCategoryForm: khác loại (EXPENSE vs INCOME) được phép trùng tên', () => {
  const existingCategories = [
    { id: 1, name: 'Ăn uống', type: 'EXPENSE' },
  ]

  // Tạo loại INCOME có tên 'Ăn uống' -> hợp lệ
  const errors = validateCategoryForm({ name: 'Ăn uống', type: 'INCOME' }, existingCategories)
  assert.equal(errors.name, undefined)
})

test('validateCategoryForm: UPDATE loại trừ Category đang sửa khỏi kiểm tra trùng', () => {
  const existingCategories = [
    { id: 1, name: 'Ăn uống', type: 'EXPENSE' },
    { id: 2, name: 'Đi lại', type: 'EXPENSE' },
  ]

  const editingCategory = { id: 1, name: 'Ăn uống', type: 'EXPENSE' }

  // Sửa chính mình: giữ nguyên hoặc thay đổi chữ hoa/thường
  const selfErrors = validateCategoryForm(
    { name: '  ăN UỐNG  ', type: 'EXPENSE' },
    existingCategories,
    editingCategory
  )
  assert.equal(selfErrors.name, undefined)

  // Sửa thành tên trùng với category khác trong cùng loại
  const duplicateErrors = validateCategoryForm(
    { name: 'đi lại', type: 'EXPENSE' },
    existingCategories,
    editingCategory
  )
  assert.equal(duplicateErrors.name, 'Tên danh mục đã tồn tại trong loại này.')
})

test('categoryPayload: khi sửa Category cũ, không tự ghi đè color nếu màu nằm ngoài 17 preset', () => {
  const oldCategory = {
    id: 99,
    name: 'Danh mục màu lạ',
    type: 'EXPENSE',
    icon: 'briefcase',
    color: '#123456', // Màu ngoài 17 preset
  }

  const form = categoryForm(oldCategory)
  assert.equal(form.color, '#123456')

  // Người dùng chỉ sửa tên, không đổi màu (changed rỗng)
  form.name = 'Tên mới'
  const payload = categoryPayload(form, true, {})

  assert.equal(payload.name, 'Tên mới')
  assert.equal(payload.type, 'EXPENSE')
  // payload.color KHÔNG được sinh ra khi editing=true và changed.color chưa thay đổi
  assert.equal(payload.color, undefined)
})

test('categoryPayload: khi người dùng chủ động đổi màu hoặc reset, payload gửi đúng giá trị', () => {
  const oldCategory = {
    id: 99,
    name: 'Danh mục',
    type: 'EXPENSE',
    icon: 'tag',
    color: '#123456',
  }

  const form = categoryForm(oldCategory)

  // Đổi sang màu preset
  form.color = '#3B82F6'
  const payloadChanged = categoryPayload(form, true, { color: true })
  assert.equal(payloadChanged.color, '#3B82F6')

  // Reset về null
  form.color = null
  const payloadReset = categoryPayload(form, true, { color: true })
  assert.equal(payloadReset.color, null)
})
