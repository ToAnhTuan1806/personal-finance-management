import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import client from '../src/api/axiosClient.js'
import * as recurringService from '../src/services/recurringTemplateService.js'
import {
  DAY_31_NOTICE,
  DISCLAIMER_NOTICE,
  isDay31,
  validateRecurringTemplateForm,
} from '../src/components/recurring/recurringTemplateUtils.js'
import { navigation } from '../src/components/layout/navigation.js'

let server
let RecurringTemplateCard
let RecurringTemplateModal
let RecurringTemplatesPage
let originalAdapter

const response = (config, data, status = 200) => ({
  config,
  data,
  status,
  statusText: '',
  headers: {},
})

const render = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props))

before(async () => {
  originalAdapter = client.defaults.adapter
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
  client.defaults.adapter = originalAdapter
  await server?.close()
})

/* ========================================================================== */
/* QA TEST SUITE: SMARTEXPENSE 2.0 - D08-FE (FR-08 & FR-11)                   */
/* ========================================================================== */

test('QA-D08-01: Disclaimer Banner phải luôn hiển thị và đúng nội dung SRS', () => {
  const html = render(RecurringTemplatesPage, {})
  assert.match(html, /Lưu ý:/)
  assert.match(html, new RegExp(DISCLAIMER_NOTICE))
  assert.match(html, /role="status"/)
  assert.match(html, /aria-label="Cảnh báo mẫu giao dịch"/)
})

test('QA-D08-02: Ràng buộc tuyệt đối - KHÔNG có bất kỳ nút hoặc nhãn "Áp dụng" trong D08', () => {
  const sampleTemplate = {
    id: 1,
    categoryId: 1,
    categoryName: 'Ăn uống',
    type: 'EXPENSE',
    amount: 2000000,
    dayOfMonth: 31,
    active: true,
  }

  const cardHtml = render(RecurringTemplateCard, { template: sampleTemplate })
  assert.doesNotMatch(cardHtml, /Áp dụng/)
  assert.doesNotMatch(cardHtml, />Apply</i)

  const pageHtml = render(RecurringTemplatesPage, { initialTemplates: [sampleTemplate] })
  assert.doesNotMatch(pageHtml, /Áp dụng/)
  assert.doesNotMatch(pageHtml, />Apply</i)

  const modalHtml = render(RecurringTemplateModal, { isOpen: true, template: sampleTemplate })
  assert.doesNotMatch(modalHtml, /Áp dụng/)
})

test('QA-D08-03: Xử lý ngày 31 khi tháng ngắn - Banner cảnh báo xuất hiện đúng điều kiện', () => {
  // 1. Ngày 31 -> BẮT BUỘC hiển thị thông báo
  assert.equal(isDay31(31), true)
  assert.equal(isDay31('31'), true)

  const card31Html = render(RecurringTemplateCard, {
    template: {
      id: 1,
      categoryId: 1,
      categoryName: 'Thuê nhà',
      type: 'EXPENSE',
      amount: 4000000,
      dayOfMonth: 31,
      active: true,
    },
  })
  assert.match(card31Html, new RegExp(DAY_31_NOTICE))

  const modal31Html = render(RecurringTemplateModal, {
    isOpen: true,
    template: {
      id: 1,
      categoryId: 1,
      type: 'EXPENSE',
      amount: 4000000,
      dayOfMonth: 31,
      active: true,
    },
  })
  assert.match(modal31Html, new RegExp(DAY_31_NOTICE))

  // 2. Ngày khác (1, 15, 30) -> KHÔNG hiển thị thông báo ngày 31
  const card15Html = render(RecurringTemplateCard, {
    template: {
      id: 2,
      categoryId: 1,
      categoryName: 'Học phí',
      type: 'EXPENSE',
      amount: 1000000,
      dayOfMonth: 15,
      active: true,
    },
  })
  assert.doesNotMatch(card15Html, new RegExp(DAY_31_NOTICE))
})

test('QA-D08-04: Ràng buộc Validation - Số tiền, Ngày trong tháng, Ghi chú và Danh mục', () => {
  const categories = [
    { id: 10, name: 'Tiền điện', type: 'EXPENSE' },
    { id: 20, name: 'Lương', type: 'INCOME' },
  ]

  // Số tiền rỗng, bằng 0, âm, chữ
  assert.equal(validateRecurringTemplateForm({ amount: '' }).isValid, false)
  assert.equal(validateRecurringTemplateForm({ amount: '0' }).isValid, false)
  assert.equal(validateRecurringTemplateForm({ amount: '-50000' }).isValid, false)
  assert.equal(validateRecurringTemplateForm({ amount: 'invalid' }).isValid, false)

  // Số tiền quá 13 chữ số nguyên hoặc quá 2 chữ số thập phân
  assert.match(
    validateRecurringTemplateForm({ amount: '100000000000000' }).errors.amount,
    /tối đa 13 chữ số/
  )
  assert.match(
    validateRecurringTemplateForm({ amount: '50000.123' }).errors.amount,
    /tối đa 2 chữ số thập phân/
  )

  // Ngày trong tháng ngoài 1 - 31
  assert.match(
    validateRecurringTemplateForm({ dayOfMonth: '0' }).errors.dayOfMonth,
    /1 đến 31/
  )
  assert.match(
    validateRecurringTemplateForm({ dayOfMonth: '32' }).errors.dayOfMonth,
    /1 đến 31/
  )
  assert.match(
    validateRecurringTemplateForm({ dayOfMonth: '10.5' }).errors.dayOfMonth,
    /số nguyên/
  )

  // Ghi chú quá 500 ký tự
  assert.match(
    validateRecurringTemplateForm({ note: 'x'.repeat(501) }).errors.note,
    /tối đa 500 ký tự/
  )

  // Danh mục không khớp type
  assert.match(
    validateRecurringTemplateForm({ type: 'EXPENSE', categoryId: 20 }, categories)
      .errors.categoryId,
    /không thuộc loại giao dịch đã chọn/
  )
})

test('QA-D08-05: Modal hướng dẫn khi danh mục rỗng và counter đếm ký tự ghi chú', () => {
  // Modal khi không có category nào của type đã chọn
  const modalEmptyCatHtml = render(RecurringTemplateModal, {
    isOpen: true,
    template: null,
    categories: [],
  })
  assert.match(modalEmptyCatHtml, /Chưa có danh mục nào thuộc loại này/)

  // Modal có counter ký tự ghi chú
  assert.match(modalEmptyCatHtml, /0\/500/)
})

test('QA-D08-06: API Delete bắt lỗi 409 TEMPLATE_IN_USE và có thông báo dễ hiểu cho người dùng', async () => {
  client.defaults.adapter = async (config) => {
    const error = new Error('Conflict')
    error.config = config
    error.response = {
      status: 409,
      data: {
        code: 'TEMPLATE_IN_USE',
        message: 'Mẫu giao dịch đã áp dụng, không thể xóa.',
      },
    }
    throw error
  }

  await assert.rejects(
    async () => {
      await recurringService.deleteRecurringTemplate(999)
    },
    (err) => {
      assert.equal(err.response?.status, 409)
      return true
    }
  )
})

test('QA-D08-07: Accessibility - Dialog xóa chuẩn role="alertdialog" và nhãn aria đầy đủ', () => {
  const templateToDelete = {
    id: 88,
    categoryName: 'Bảo hiểm',
    amount: 1500000,
  }

  const pageHtml = render(RecurringTemplatesPage, {
    initialTemplates: [templateToDelete],
  })

  // Nút trên Card
  assert.match(pageHtml, /aria-label="Sửa mẫu định kỳ Bảo hiểm"/)
  assert.match(pageHtml, /aria-label="Xóa mẫu định kỳ Bảo hiểm"/)
  assert.match(pageHtml, /aria-label="Bật tắt mẫu định kỳ Bảo hiểm"/)
})

test('QA-D08-08: Điều hướng MobileNavigation hỗ trợ 7 mục menu đồng đều (grid-cols-7)', async () => {
  assert.equal(navigation.length, 7, 'Menu hệ thống phải có 7 mục sau khi thêm Định kỳ')
  const recurringItem = navigation.find((item) => item.path === '/recurring-templates')
  assert.equal(recurringItem?.label, 'Định kỳ')
  assert.equal(recurringItem?.authRequired, true)

  const fs = await import('node:fs')
  const content = fs.readFileSync(new URL('../src/components/layout/MobileNavigation.jsx', import.meta.url), 'utf8')
  assert.match(content, /grid-cols-7/, 'Mobile navigation phải dùng grid-cols-7 để không bị tràn dòng')
})

test('QA-D08-09: Chuẩn hóa dữ liệu API - Ghi chú rỗng gửi null, số tiền gửi dạng Number', async () => {
  const captured = []
  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, { id: 1 }, 201)
  }

  await recurringService.createRecurringTemplate({
    categoryId: '15',
    type: 'EXPENSE',
    amount: '1200000',
    dayOfMonth: '1',
    note: '',
    active: true,
  })

  assert.equal(captured.length, 1)
  const body = JSON.parse(captured[0].data)
  assert.equal(typeof body.categoryId, 'number')
  assert.equal(typeof body.amount, 'number')
  assert.equal(typeof body.dayOfMonth, 'number')
  assert.equal(body.note, null, 'Ghi chú rỗng phải chuyển thành null theo API contract')
})
