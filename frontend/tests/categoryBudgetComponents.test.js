import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  formatMoney,
  getBudgetDisplayStatus,
  getBudgetStatus,
  getBudgetUsagePercentage,
  getStatusConfig,
  validateCategoryBudgetForm,
} from '../src/components/budget/categoryBudgetUtils.js'

let server, CategoryBudgetCard, CategoryBudgetModal, CategoryBudgetSection

const noOp = () => {}
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))

function elements(element) {
  if (!element || typeof element !== 'object') return []
  return [element, ...[element.props?.children].flat(Infinity).flatMap(elements)]
}

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  server = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  CategoryBudgetCard = (await server.ssrLoadModule('/src/components/budget/CategoryBudgetCard.jsx')).default
  CategoryBudgetModal = (await server.ssrLoadModule('/src/components/budget/CategoryBudgetModal.jsx')).default
  CategoryBudgetSection = (await server.ssrLoadModule('/src/components/budget/CategoryBudgetSection.jsx')).default
})

after(async () => {
  await server?.close()
})

/* ========================================================================== */
/* 1. Unit Tests for categoryBudgetUtils                                      */
/* ========================================================================== */

test('categoryBudgetUtils.getBudgetStatus: phân loại chính xác SAFE (<80%), WARNING (80% - <100%), OVER_BUDGET (>=100%)', () => {
  // Dưới 80% -> SAFE
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 799999 }), 'SAFE')
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 0 }), 'SAFE')

  // Từ 80% đến dưới 100% -> WARNING
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 800000 }), 'WARNING')
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 999999 }), 'WARNING')

  // Từ 100% trở lên -> OVER_BUDGET
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 1000000 }), 'OVER_BUDGET')
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 1200000 }), 'OVER_BUDGET')

  // Biên limit <= 0
  assert.equal(getBudgetStatus({ amountLimit: 0, spentAmount: 100 }), 'SAFE')

  // Giữ nguyên status hợp lệ có sẵn từ DTO Backend
  assert.equal(getBudgetStatus({ status: 'OVER_BUDGET', amountLimit: 1000, spentAmount: 500 }), 'OVER_BUDGET')
})

test('categoryBudgetUtils.getBudgetUsagePercentage: tính phần trăm hoặc dùng giá trị từ DTO', () => {
  // Dùng giá trị có sẵn từ Backend
  assert.equal(getBudgetUsagePercentage({ usagePercentage: 75.5 }), 75.5)
  assert.equal(getBudgetUsagePercentage({ usagePercentage: 120 }), 120)

  // Tự tính khi không có usagePercentage
  assert.equal(getBudgetUsagePercentage({ amountLimit: 1000, spentAmount: 500 }), 50)
  assert.equal(getBudgetUsagePercentage({ amountLimit: 0, spentAmount: 100 }), 0)
})

test('categoryBudgetUtils.getBudgetDisplayStatus: phân biệt dưới, bằng và vượt hạn mức', () => {
  assert.equal(getBudgetDisplayStatus({ amountLimit: 1000000, spentAmount: 999999 }), 'WARNING')
  assert.equal(getBudgetDisplayStatus({ amountLimit: 1000000, spentAmount: 1000000 }), 'AT_LIMIT')
  assert.equal(getBudgetDisplayStatus({ amountLimit: 1000000, spentAmount: 1000001 }), 'OVER_BUDGET')
})

test('categoryBudgetUtils.getStatusConfig: nhãn tiếng Việt và màu sắc phù hợp', () => {
  const safe = getStatusConfig('SAFE')
  assert.equal(safe.label, 'Trong ngân sách')
  assert.ok(safe.barColor.includes('bg-emerald'))

  const warning = getStatusConfig('WARNING')
  assert.equal(warning.label, 'Trong ngân sách')
  assert.ok(warning.barColor.includes('bg-amber'))

  const over = getStatusConfig('OVER_BUDGET')
  assert.equal(over.label, 'Vượt ngân sách')
  assert.ok(over.barColor.includes('bg-rose'))

  const atLimit = getStatusConfig('AT_LIMIT')
  assert.equal(atLimit.label, 'Đã sử dụng hết ngân sách')
  assert.ok(atLimit.barColor.includes('bg-amber'))
})

test('categoryBudgetUtils.validateCategoryBudgetForm: xác thực danh mục và số tiền', () => {
  // Tạo mới thiếu categoryId
  const noCat = validateCategoryBudgetForm({ categoryId: '', amountLimit: 500000, isEditing: false })
  assert.equal(noCat.isValid, false)
  assert.equal(noCat.errors.categoryId, 'Vui lòng chọn danh mục chi tiêu.')

  // Chế độ sửa không bắt buộc categoryId
  const editNoCat = validateCategoryBudgetForm({ categoryId: '', amountLimit: 500000, isEditing: true })
  assert.equal(editNoCat.isValid, true)

  // Tiền rỗng
  const emptyAmount = validateCategoryBudgetForm({ categoryId: 1, amountLimit: '' })
  assert.equal(emptyAmount.isValid, false)
  assert.equal(emptyAmount.errors.amountLimit, 'Vui lòng nhập hạn mức ngân sách.')

  // Tiền bằng 0 hoặc âm
  const zeroAmount = validateCategoryBudgetForm({ categoryId: 1, amountLimit: 0 })
  assert.equal(zeroAmount.isValid, false)
  assert.equal(zeroAmount.errors.amountLimit, 'Hạn mức ngân sách phải lớn hơn 0.')

  const negAmount = validateCategoryBudgetForm({ categoryId: 1, amountLimit: -1000 })
  assert.equal(negAmount.isValid, false)

  // Sai định dạng số (>13 chữ số nguyên hoặc >2 chữ số thập phân)
  const invalidFormat = validateCategoryBudgetForm({ categoryId: 1, amountLimit: '123.456' })
  assert.equal(invalidFormat.isValid, false)
  assert.equal(invalidFormat.errors.amountLimit, 'Số tiền tối đa 13 chữ số và 2 chữ số thập phân.')

  // Hợp lệ
  const valid = validateCategoryBudgetForm({ categoryId: 1, amountLimit: '1500000.50' })
  assert.equal(valid.isValid, true)
  assert.deepEqual(valid.errors, {})
})

/* ========================================================================== */
/* 2. Component Tests for CategoryBudgetCard                                  */
/* ========================================================================== */

test('CategoryBudgetCard: hiển thị đầy đủ thông tin danh mục, số tiền và thanh tiến độ SAFE (<80%)', () => {
  const budget = {
    id: 1,
    categoryId: 10,
    categoryName: 'Ăn uống',
    categoryIcon: 'utensils',
    categoryColor: '#F59E0B',
    amountLimit: 1000000,
    spentAmount: 600000,
    remainingAmount: 400000,
    usagePercentage: 60,
    status: 'SAFE',
  }

  const html = render(CategoryBudgetCard, { budget, onEdit: noOp, onDelete: noOp })

  // Tên danh mục
  assert.ok(html.includes('Ăn uống'))
  // Nhãn trạng thái dưới hạn mức
  assert.ok(html.includes('Trong ngân sách'))
  // Số tiền định dạng VNĐ
  assert.ok(html.includes(formatMoney(1000000)))
  assert.ok(html.includes(formatMoney(600000)))
  assert.ok(html.includes(formatMoney(400000)))
  // Phần trăm
  assert.ok(html.includes('60%'))
  // Thanh tiến độ width 60%
  assert.ok(html.includes('style="width:60%"'))
  assert.ok(html.includes('role="progressbar"'))
  assert.ok(html.includes('aria-valuenow="60"'))
  // Nút sửa và xóa có aria-label tương ứng
  assert.ok(html.includes('aria-label="Sửa ngân sách danh mục Ăn uống"'))
  assert.ok(html.includes('aria-label="Xóa ngân sách danh mục Ăn uống"'))
})

test('CategoryBudgetCard: thanh tiến độ OVER_BUDGET (>=100%) giới hạn tối đa 100% chiều rộng', () => {
  const budget = {
    id: 2,
    categoryId: 11,
    categoryName: 'Mua sắm',
    amountLimit: 1000000,
    spentAmount: 1500000,
    remainingAmount: -500000,
    usagePercentage: 150,
    status: 'OVER_BUDGET',
  }

  const html = render(CategoryBudgetCard, { budget, onEdit: noOp, onDelete: noOp })

  // Nhãn OVER_BUDGET
  assert.ok(html.includes('Vượt ngân sách'))
  // Phần trăm hiển thị 150%
  assert.ok(html.includes('150%'))
  // Thanh tiến độ tối đa 100%
  assert.ok(html.includes('style="width:100%"'))
  // Hiển thị chi vượt
  assert.ok(html.includes('Chi vượt'))
  assert.ok(html.includes(formatMoney(500000)))
})

test('CategoryBudgetCard: trạng thái WARNING (80% - <100%) vẫn hiển thị Trong ngân sách', () => {
  const budget = {
    id: 3,
    categoryId: 12,
    categoryName: 'Đi lại',
    amountLimit: 1000000,
    spentAmount: 850000,
    remainingAmount: 150000,
    usagePercentage: 85,
    status: 'WARNING',
  }

  const html = render(CategoryBudgetCard, { budget, onEdit: noOp, onDelete: noOp })

  assert.ok(html.includes('Trong ngân sách'))
  assert.ok(html.includes('85%'))
  assert.ok(html.includes('style="width:85%"'))
})

test('CategoryBudgetCard: gọi đúng onEdit và onDelete với tham số budget', () => {
  const budget = { id: 5, categoryId: 20, categoryName: 'Giải trí', amountLimit: 500000 }
  let edited = null
  let deleted = null

  const tree = CategoryBudgetCard({
    budget,
    onEdit: (b) => { edited = b },
    onDelete: (b) => { deleted = b },
    disabled: false,
  })

  const nodes = elements(tree)
  const editBtn = nodes.find((n) => n.props?.['aria-label'] === 'Sửa ngân sách danh mục Giải trí')
  const deleteBtn = nodes.find((n) => n.props?.['aria-label'] === 'Xóa ngân sách danh mục Giải trí')

  assert.ok(editBtn)
  assert.ok(deleteBtn)

  editBtn.props.onClick()
  assert.equal(edited, budget)

  deleteBtn.props.onClick()
  assert.equal(deleted, budget)
})

/* ========================================================================== */
/* 3. Component Tests for CategoryBudgetModal                                 */
/* ========================================================================== */

test('CategoryBudgetModal: lọc và chỉ hiển thị các danh mục EXPENSE trong select', () => {
  const categories = [
    { id: 1, name: 'Ăn uống', type: 'EXPENSE' },
    { id: 2, name: 'Đi lại', type: 'EXPENSE' },
    { id: 3, name: 'Tiền lương', type: 'INCOME' },
    { id: 4, name: 'Tiền thưởng', type: 'INCOME' },
  ]

  const html = render(CategoryBudgetModal, {
    open: true,
    budget: null,
    categories,
    month: 11,
    year: 2026,
    saving: false,
    onClose: noOp,
    onSave: noOp,
  })

  // Có hiển thị danh mục EXPENSE
  assert.ok(html.includes('>Ăn uống</option>'))
  assert.ok(html.includes('>Đi lại</option>'))
  assert.ok(html.includes('value="1"'))
  assert.ok(html.includes('value="2"'))
  // KHÔNG có danh mục INCOME
  assert.ok(!html.includes('Tiền lương'))
  assert.ok(!html.includes('Tiền thưởng'))
  // Hiển thị tháng 11/2026
  assert.ok(html.includes('tháng 11/2026'))
  // Tiêu đề thiết lập mới
  assert.ok(html.includes('Thiết lập ngân sách danh mục'))
})

test('CategoryBudgetModal: chế độ sửa khóa đổi danh mục và hiển thị tiêu đề cập nhật', () => {
  const categories = [
    { id: 1, name: 'Ăn uống', type: 'EXPENSE', icon: 'utensils', color: '#F59E0B' },
  ]
  const budget = {
    id: 10,
    categoryId: 1,
    categoryName: 'Ăn uống',
    amountLimit: 2000000,
  }

  const html = render(CategoryBudgetModal, {
    open: true,
    budget,
    categories,
    month: 11,
    year: 2026,
    saving: false,
    onClose: noOp,
    onSave: noOp,
  })

  // Tiêu đề cập nhật
  assert.ok(html.includes('Cập nhật ngân sách danh mục'))
  // Thông báo không thể đổi danh mục
  assert.ok(html.includes('Không thể đổi danh mục'))
  // Không có select dropdown
  assert.ok(!html.includes('<select'))
  // Giá trị hạn mức cũ
  assert.ok(html.includes('value="2000000"'))
})

test('CategoryBudgetModal: trạng thái saving khóa nút và hiển thị spinner', () => {
  const html = render(CategoryBudgetModal, {
    open: true,
    budget: null,
    categories: [{ id: 1, name: 'Ăn uống', type: 'EXPENSE' }],
    month: 11,
    year: 2026,
    saving: true,
    onClose: noOp,
    onSave: noOp,
  })

  assert.ok(html.includes('Đang lưu...'))
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
})

test('CategoryBudgetModal: hiển thị lỗi khi có prop error', () => {
  const html = render(CategoryBudgetModal, {
    open: true,
    budget: null,
    categories: [{ id: 1, name: 'Ăn uống', type: 'EXPENSE' }],
    month: 11,
    year: 2026,
    error: 'Lỗi xung đột ngân sách từ máy chủ',
    saving: false,
    onClose: noOp,
    onSave: noOp,
  })

  assert.ok(html.includes('Lỗi xung đột ngân sách từ máy chủ'))
  assert.ok(html.includes('role="alert"'))
})

/* ========================================================================== */
/* 4. Component Tests for CategoryBudgetSection                               */
/* ========================================================================== */

test('CategoryBudgetSection: hiển thị tiêu đề và nút thêm ngân sách', () => {
  const html = render(CategoryBudgetSection, {
    budgets: [],
    categories: [],
    loading: false,
    onAdd: noOp,
  })

  assert.ok(html.includes('Ngân sách theo danh mục'))
  assert.ok(html.includes('Thêm ngân sách'))
})

test('CategoryBudgetSection: trạng thái loading hiển thị spinner và thông báo đang tải', () => {
  const html = render(CategoryBudgetSection, {
    budgets: [],
    categories: [],
    loading: true,
  })

  assert.ok(html.includes('Đang tải ngân sách theo danh mục...'))
  assert.ok(!html.includes('Chưa có ngân sách theo danh mục nào'))
})

test('CategoryBudgetSection: trạng thái error hiển thị thông báo lỗi và nút thử lại', () => {
  const html = render(CategoryBudgetSection, {
    budgets: [],
    categories: [],
    loading: false,
    error: 'Không thể kết nối máy chủ',
    onRetry: noOp,
  })

  assert.ok(html.includes('role="alert"'))
  assert.ok(html.includes('Không thể kết nối máy chủ'))
  assert.ok(html.includes('Thử lại'))
})

test('CategoryBudgetSection: trạng thái rỗng hiển thị thông báo và nút thêm đầu tiên', () => {
  const html = render(CategoryBudgetSection, {
    budgets: [],
    categories: [],
    loading: false,
    onAdd: noOp,
  })

  assert.ok(html.includes('Chưa có ngân sách theo danh mục nào.'))
  assert.ok(html.includes('Thêm ngân sách đầu tiên'))
})

test('CategoryBudgetSection: hiển thị danh sách các card ngân sách khi có dữ liệu', () => {
  const categories = [
    { id: 1, name: 'Ăn uống', type: 'EXPENSE', icon: 'utensils', color: '#F59E0B' },
    { id: 2, name: 'Đi lại', type: 'EXPENSE', icon: 'car', color: '#3B82F6' },
  ]
  const budgets = [
    { id: 101, categoryId: 1, categoryName: 'Ăn uống', amountLimit: 2000000, spentAmount: 1000000, status: 'SAFE' },
    { id: 102, categoryId: 2, categoryName: 'Đi lại', amountLimit: 1000000, spentAmount: 900000, status: 'WARNING' },
  ]

  const html = render(CategoryBudgetSection, {
    budgets,
    categories,
    loading: false,
    onAdd: noOp,
    onEdit: noOp,
    onDelete: noOp,
  })

  // Hiển thị cả 2 danh mục
  assert.ok(html.includes('Ăn uống'))
  assert.ok(html.includes('Đi lại'))
  // Cả hai mức dưới hạn mức đều hiển thị cùng trạng thái
  assert.equal((html.match(/Trong ngân sách/g) || []).length, 2)
})
