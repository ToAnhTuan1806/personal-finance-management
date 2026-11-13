import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import axios from 'axios'
import client from '../src/api/axiosClient.js'
import * as categoryBudgetService from '../src/services/categoryBudgetService.js'
import {
  formatMoney,
  getBudgetStatus,
  getBudgetUsagePercentage,
} from '../src/components/budget/categoryBudgetUtils.js'

let server, CategoryBudgetCard, CategoryBudgetModal, CategoryBudgetSection, BudgetsPage

const response = (config, data, status = 200) => ({
  config,
  data,
  status,
  statusText: '',
  headers: {},
})

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  CategoryBudgetCard = (await server.ssrLoadModule('/src/components/budget/CategoryBudgetCard.jsx')).default
  CategoryBudgetModal = (await server.ssrLoadModule('/src/components/budget/CategoryBudgetModal.jsx')).default
  CategoryBudgetSection = (await server.ssrLoadModule('/src/components/budget/CategoryBudgetSection.jsx')).default
  BudgetsPage = (await server.ssrLoadModule('/src/pages/Budgets.jsx')).default
})

after(async () => {
  await server?.close()
})

/* ========================================================================== */
/* 1. Category Budget Service API Tests                                      */
/* ========================================================================== */

test('getCategoryBudgets: gửi đúng GET /category-budgets với query year và month', async () => {
  const captured = []
  const mockData = [
    {
      id: 1,
      categoryId: 10,
      categoryName: 'Ăn uống',
      year: 2026,
      month: 11,
      amountLimit: 3000000,
      spentAmount: 1200000,
      remainingAmount: 1800000,
      usagePercentage: 40,
      exceeded: false,
      status: 'SAFE',
    },
  ]

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockData)
  }

  const result = await categoryBudgetService.getCategoryBudgets(2026, 11)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'get')
  assert.equal(captured[0].url, '/category-budgets')
  assert.deepEqual(captured[0].params, { year: 2026, month: 11 })
  assert.deepEqual(result, mockData)
})

test('createCategoryBudget: gửi POST /category-budgets với { categoryId, year, month, amountLimit } không có userId', async () => {
  const captured = []
  const mockCreated = {
    id: 42,
    categoryId: 5,
    year: 2026,
    month: 11,
    amountLimit: 2500000,
  }

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockCreated, 200)
  }

  const result = await categoryBudgetService.createCategoryBudget({
    categoryId: 5,
    year: 2026,
    month: 11,
    amountLimit: 2500000,
  })

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'post')
  assert.equal(captured[0].url, '/category-budgets')

  const body = typeof captured[0].data === 'string' ? JSON.parse(captured[0].data) : captured[0].data
  assert.equal(body.categoryId, 5)
  assert.equal(body.year, 2026)
  assert.equal(body.month, 11)
  assert.equal(body.amountLimit, 2500000)
  assert.equal(body.userId, undefined, 'Backend tự xác thực user qua JWT, client không được gửi userId')
  assert.deepEqual(result, mockCreated)
})

test('getCategoryBudgetById: gửi GET /category-budgets/{id}', async () => {
  const captured = []
  const mockDetail = { id: 77, categoryId: 3, amountLimit: 1000000 }

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockDetail)
  }

  const result = await categoryBudgetService.getCategoryBudgetById(77)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'get')
  assert.equal(captured[0].url, '/category-budgets/77')
  assert.deepEqual(result, mockDetail)
})

test('updateCategoryBudget: gửi PUT /category-budgets/{id} chỉ với { amountLimit }', async () => {
  const captured = []
  const mockUpdated = { id: 88, categoryId: 3, year: 2026, month: 11, amountLimit: 4000000 }

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockUpdated, 200)
  }

  const result = await categoryBudgetService.updateCategoryBudget(88, 4000000)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'put')
  assert.equal(captured[0].url, '/category-budgets/88')

  const body = typeof captured[0].data === 'string' ? JSON.parse(captured[0].data) : captured[0].data
  assert.equal(body.amountLimit, 4000000)
  assert.equal(body.categoryId, undefined, 'UPDATE không được đổi categoryId')
  assert.equal(body.year, undefined, 'UPDATE không được đổi year')
  assert.equal(body.month, undefined, 'UPDATE không được đổi month')
  assert.equal(body.userId, undefined, 'UPDATE không được gửi userId')
  assert.deepEqual(result, mockUpdated)
})

test('deleteCategoryBudget: gửi DELETE /category-budgets/{id} và hoàn tất với HTTP 204', async () => {
  const captured = []

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, null, 204)
  }

  await categoryBudgetService.deleteCategoryBudget(99)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'delete')
  assert.equal(captured[0].url, '/category-budgets/99')
})

test('categoryBudgetService: các API reject khi lỗi mạng, không sinh dữ liệu giả', async () => {
  client.defaults.adapter = async (config) => {
    throw new axios.AxiosError('Network Error', 'ERR_NETWORK', config)
  }

  await assert.rejects(categoryBudgetService.getCategoryBudgets(2026, 11), { code: 'ERR_NETWORK' })
  await assert.rejects(categoryBudgetService.createCategoryBudget({ categoryId: 1, year: 2026, month: 11, amountLimit: 100 }), { code: 'ERR_NETWORK' })
  await assert.rejects(categoryBudgetService.getCategoryBudgetById(1), { code: 'ERR_NETWORK' })
  await assert.rejects(categoryBudgetService.updateCategoryBudget(1, 200), { code: 'ERR_NETWORK' })
  await assert.rejects(categoryBudgetService.deleteCategoryBudget(1), { code: 'ERR_NETWORK' })
})

/* ========================================================================== */
/* 2. CategoryBudgetModal & Section UI Tests                                  */
/* ========================================================================== */

test('CategoryBudgetModal: chế độ Sửa hiển thị tên danh mục cố định, không cho phép đổi', () => {
  const categories = [
    { id: 1, name: 'Ăn uống', type: 'EXPENSE' },
    { id: 2, name: 'Đi lại', type: 'EXPENSE' },
  ]
  const existingBudget = {
    id: 10,
    categoryId: 1,
    categoryName: 'Ăn uống',
    amountLimit: 2000000,
  }

  const html = renderToStaticMarkup(
    createElement(CategoryBudgetModal, {
      open: true,
      budget: existingBudget,
      categories,
      month: 11,
      year: 2026,
      onClose: () => {},
      onSave: () => {},
    })
  )

  assert.ok(html.includes('Cập nhật ngân sách danh mục'))
  assert.ok(html.includes('Ăn uống'))
  assert.ok(html.includes('(Không thể đổi danh mục)'))
  assert.ok(!html.includes('id="category-budget-select"'), 'Chế độ sửa không render select chọn danh mục')
})

test('CategoryBudgetModal: khi chưa có danh mục chi tiêu, hiển thị hướng dẫn và khóa submit', () => {
  // Chỉ có danh mục INCOME, không có EXPENSE
  const categories = [
    { id: 10, name: 'Lương', type: 'INCOME' },
    { id: 11, name: 'Thưởng', type: 'INCOME' },
  ]

  const html = renderToStaticMarkup(
    createElement(CategoryBudgetModal, {
      open: true,
      budget: null,
      categories,
      month: 11,
      year: 2026,
      onClose: () => {},
      onSave: () => {},
    })
  )

  assert.ok(html.includes('-- Chưa có danh mục chi tiêu nào --'))
  assert.ok(html.includes('Chưa có danh mục chi tiêu nào. Vui lòng tạo danh mục chi tiêu trước khi thiết lập ngân sách.'))
  assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'Nút lưu hoặc select bị disabled')
})

test('CategoryBudgetSection: hỗ trợ retry độc lập khi tải ngân sách danh mục lỗi', () => {
  const html = renderToStaticMarkup(
    createElement(CategoryBudgetSection, {
      budgets: [],
      categories: [],
      loading: false,
      error: 'Không thể kết nối máy chủ.',
      onRetry: () => {},
    })
  )

  assert.ok(html.includes('Không thể kết nối máy chủ.'))
  assert.ok(html.includes('Thử lại'))
})

test('BudgetsPage: render khu vực Ngân sách theo danh mục bên dưới ngân sách tổng', async () => {
  const { ToastProvider } = await server.ssrLoadModule('/src/contexts/ToastContext.jsx')
  const { QuickAddProvider } = await server.ssrLoadModule('/src/contexts/QuickAddContext.jsx')

  const html = renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(
        QuickAddProvider,
        null,
        createElement(BudgetsPage)
      )
    )
  )

  assert.ok(html.includes('Ngân sách hàng tháng'), 'Có tiêu đề ngân sách hàng tháng')
  assert.ok(html.includes('Ngân sách theo danh mục'), 'Có tiêu đề khu vực ngân sách danh mục')
  assert.ok(html.includes('Kiểm soát chi tiêu chi tiết cho từng hạng mục trong tháng.'))
})

/* ========================================================================== */
/* 3. Ngưỡng ngân sách & Phân biệt chính xác theo D07 Specification           */
/* ========================================================================== */

test('Ngưỡng ngân sách: 0%, 79.99% (SAFE), 80%, 99.99% (WARNING), 100%, 120% (OVER_BUDGET)', () => {
  // 0% -> SAFE
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 0 }), 'SAFE')
  // 79.99% -> SAFE
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 799900 }), 'SAFE')
  // 80% -> WARNING
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 800000 }), 'WARNING')
  // 99.99% -> WARNING
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 999900 }), 'WARNING')
  // 100% -> OVER_BUDGET
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 1000000 }), 'OVER_BUDGET')
  // 120% -> OVER_BUDGET
  assert.equal(getBudgetStatus({ amountLimit: 1000000, spentAmount: 1200000 }), 'OVER_BUDGET')

  // getBudgetUsagePercentage không ép về 100% khi vượt
  assert.equal(getBudgetUsagePercentage({ amountLimit: 1000000, spentAmount: 1200000 }), 120)
  assert.equal(getBudgetUsagePercentage({ usagePercentage: 120 }), 120)
})

test('CategoryBudgetCard tại đúng 100%: hiển thị nhãn "Còn lại", số tiền "0 ₫" (không hiển thị "Chi vượt" hay "-0 ₫")', () => {
  const budgetAt100 = {
    id: 10,
    categoryId: 1,
    categoryName: 'Ăn uống',
    amountLimit: 1000000,
    spentAmount: 1000000,
    remainingAmount: 0,
    usagePercentage: 100,
    exceeded: false,
    status: 'OVER_BUDGET',
  }

  const html = renderToStaticMarkup(
    createElement(CategoryBudgetCard, {
      budget: budgetAt100,
      onEdit: () => {},
      onDelete: () => {},
    })
  )

  // Đúng 100% không được hiển thị "Chi vượt" hoặc "-0 ₫"
  assert.ok(!html.includes('Chi vượt'), 'Tại 100% không được hiển thị Chi vượt')
  assert.ok(!html.includes('-0 ₫'), 'Tại 100% không được hiển thị -0 ₫')
  assert.ok(!html.includes('>-0'), 'Tại 100% không có tiền âm')
  // Phải hiển thị "Còn lại" và "0 ₫"
  assert.ok(html.includes('Còn lại'), 'Tại 100% hiển thị nhãn Còn lại')
  assert.ok(html.includes('Đã sử dụng hết ngân sách'), 'Tại 100% hiển thị đúng trạng thái đã dùng hết')
  assert.ok(!html.includes('Vượt ngân sách'), 'Tại 100% không được hiển thị trạng thái vượt ngân sách')
  assert.ok(html.includes(formatMoney(0)), 'Hiển thị đúng 0 ₫')
  // ARIA chuẩn
  assert.ok(html.includes('aria-valuenow="100"'))
  assert.ok(html.includes('aria-valuetext="100%"'))
  assert.ok(html.includes('100%'))
})

test('CategoryBudgetCard tại 120%: hiển thị nhãn "Chi vượt", số tiền thực chi vượt, ARIA không vượt quá aria-valuemax', () => {
  const budgetAt120 = {
    id: 11,
    categoryId: 2,
    categoryName: 'Mua sắm',
    amountLimit: 1000000,
    spentAmount: 1200000,
    remainingAmount: -200000,
    usagePercentage: 120,
    exceeded: true,
    status: 'OVER_BUDGET',
  }

  const html = renderToStaticMarkup(
    createElement(CategoryBudgetCard, {
      budget: budgetAt120,
      onEdit: () => {},
      onDelete: () => {},
    })
  )

  // Trên 100% mới hiển thị "Chi vượt"
  assert.ok(html.includes('Chi vượt'), 'Vượt 100% phải hiển thị nhãn Chi vượt')
  assert.ok(html.includes(`-${formatMoney(200000)}`), 'Hiển thị chính xác số tiền thực tế chi vượt -200.000 ₫')
  // ARIA valuenow không được vượt quá valuemax (100)
  assert.ok(html.includes('aria-valuenow="100"'), 'aria-valuenow được giới hạn ở 100')
  assert.ok(html.includes('aria-valuemax="100"'))
  assert.ok(html.includes('aria-valuetext="120%"'), 'aria-valuetext công bố tỷ lệ thực tế 120% cho screen reader')
  // Visual percentage hiển thị đúng 120%
  assert.ok(html.includes('120%'), 'Hiển thị đúng 120% cho người dùng xem')
})

test('CategoryBudgetCard: giữ nguyên precision tiền lẻ trong định dạng tiền tệ', () => {
  const budgetWithDecimals = {
    id: 12,
    categoryId: 3,
    categoryName: 'Dịch vụ',
    amountLimit: 1000000.5,
    spentAmount: 500000.25,
    remainingAmount: 500000.25,
    usagePercentage: 50,
    exceeded: false,
    status: 'SAFE',
  }

  const html = renderToStaticMarkup(
    createElement(CategoryBudgetCard, {
      budget: budgetWithDecimals,
      onEdit: () => {},
      onDelete: () => {},
    })
  )

  assert.ok(html.includes(formatMoney(1000000.5)))
  assert.ok(html.includes(formatMoney(500000.25)))
})

test('CategoryBudgetCard: trạng thái hiển thị dựa trên số đã chi và hạn mức', () => {
  // Backend có logic so sánh BigDecimal riêng
  const budgetFromBackend = {
    id: 13,
    categoryId: 4,
    categoryName: 'Giáo dục',
    amountLimit: 1000000,
    spentAmount: 799999,
    status: 'WARNING', // Backend gắn WARNING
  }

  const html = renderToStaticMarkup(
    createElement(CategoryBudgetCard, {
      budget: budgetFromBackend,
      onEdit: () => {},
      onDelete: () => {},
    })
  )

  assert.ok(html.includes('Trong ngân sách'))
})

/* ========================================================================== */
/* 4. Kiểm thử Đồng bộ Dữ liệu, Upsert và Độc lập giữa các khu vực           */
/* ========================================================================== */

test('CategoryBudgetSection: hiển thị đầy đủ danh sách card ngân sách danh mục độc lập', () => {
  const categories = [{ id: 1, name: 'Ăn uống', type: 'EXPENSE', icon: 'utensils', color: '#F59E0B' }]
  const budgets = [
    {
      id: 1,
      categoryId: 1,
      categoryName: 'Ăn uống',
      amountLimit: 2000000,
      spentAmount: 500000,
      remainingAmount: 1500000,
      usagePercentage: 25,
      exceeded: false,
      status: 'SAFE',
    },
  ]

  const html = renderToStaticMarkup(
    createElement(CategoryBudgetSection, {
      budgets,
      categories,
      loading: false,
      error: '',
    })
  )

  assert.ok(html.includes('Ăn uống'))
  assert.ok(html.includes(formatMoney(2000000)))
  assert.ok(html.includes(formatMoney(500000)))
  assert.ok(html.includes(formatMoney(1500000)))
  assert.ok(html.includes('Trong ngân sách'))
})

test('CategoryBudgetModal: giữ nguyên dữ liệu đã nhập và hiển thị lỗi cụ thể khi API thất bại', () => {
  const categories = [{ id: 1, name: 'Ăn uống', type: 'EXPENSE' }]
  const html = renderToStaticMarkup(
    createElement(CategoryBudgetModal, {
      open: true,
      budget: null,
      categories,
      month: 11,
      year: 2026,
      error: 'Hạn mức ngân sách phải lớn hơn 0.',
      onClose: () => {},
      onSave: () => {},
    })
  )

  assert.ok(html.includes('Hạn mức ngân sách phải lớn hơn 0.'))
  assert.ok(html.includes('role="alert"'))
  assert.ok(html.includes('Ăn uống'))
})

test('createCategoryBudget: gọi POST /category-budgets thực hiện upsert cho cùng danh mục và kỳ', async () => {
  let callCount = 0
  client.defaults.adapter = async (config) => {
    callCount++
    return response(config, {
      id: 10,
      categoryId: 1,
      year: 2026,
      month: 11,
      amountLimit: callCount === 1 ? 2000000 : 3000000,
    })
  }

  const first = await categoryBudgetService.createCategoryBudget({
    categoryId: 1,
    year: 2026,
    month: 11,
    amountLimit: 2000000,
  })
  const second = await categoryBudgetService.createCategoryBudget({
    categoryId: 1,
    year: 2026,
    month: 11,
    amountLimit: 3000000,
  })

  assert.equal(callCount, 2)
  assert.equal(first.id, 10)
  assert.equal(second.id, 10)
  assert.equal(second.amountLimit, 3000000)
})

test('BudgetsPage: bộ chọn tháng dùng giao diện tiếng Việt thay cho lịch gốc', async () => {
  const { ToastProvider } = await server.ssrLoadModule('/src/contexts/ToastContext.jsx')
  const { QuickAddProvider } = await server.ssrLoadModule('/src/contexts/QuickAddContext.jsx')

  const html = renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(
        QuickAddProvider,
        null,
        createElement(BudgetsPage)
      )
    )
  )

  assert.ok(html.includes('id="budget-month"'))
  assert.ok(html.includes('data-month-picker-trigger="vi"'))
  assert.ok(html.includes('aria-haspopup="dialog"'))
  assert.ok(!html.includes('type="month"'))
})
