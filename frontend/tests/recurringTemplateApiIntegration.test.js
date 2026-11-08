import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import client from '../src/api/axiosClient.js'
import * as recurringService from '../src/services/recurringTemplateService.js'

let server
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
  RecurringTemplatesPage = (
    await server.ssrLoadModule('/src/pages/RecurringTemplates.jsx')
  ).default
})

after(async () => {
  client.defaults.adapter = originalAdapter
  await server?.close()
})

/* ========================================================================== */
/* 1. Recurring Template Service API Tests                                    */
/* ========================================================================== */

test('getRecurringTemplates: gửi GET /recurring-templates với các tham số hợp lệ', async () => {
  const captured = []
  const mockPageData = {
    content: [
      {
        id: 1,
        categoryId: 10,
        categoryName: 'Tiền thuê nhà',
        type: 'EXPENSE',
        amount: 3500000,
        dayOfMonth: 31,
        note: 'Tiền nhà',
        active: true,
      },
    ],
    totalPages: 1,
    totalElements: 1,
    number: 0,
    size: 6,
  }

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockPageData)
  }

  // Gọi với active=true
  const resActive = await recurringService.getRecurringTemplates({
    active: true,
    page: 0,
    size: 6,
  })

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'get')
  assert.equal(captured[0].url, '/recurring-templates')
  assert.deepEqual(captured[0].params, { active: true, page: 0, size: 6 })
  assert.deepEqual(resActive, mockPageData)

  // Gọi không lọc active (Tất cả)
  captured.length = 0
  await recurringService.getRecurringTemplates({ page: 1, size: 10 })
  assert.equal(captured.length, 1)
  assert.deepEqual(captured[0].params, { page: 1, size: 10 })
  assert.equal(captured[0].params.active, undefined)
})

test('getRecurringTemplateById: gửi GET /recurring-templates/{id}', async () => {
  const captured = []
  const mockDetail = {
    id: 99,
    categoryId: 2,
    categoryName: 'Lương cố định',
    type: 'INCOME',
    amount: 20000000,
    dayOfMonth: 5,
    note: 'Lương tháng',
    active: true,
  }

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockDetail)
  }

  const result = await recurringService.getRecurringTemplateById(99)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'get')
  assert.equal(captured[0].url, '/recurring-templates/99')
  assert.deepEqual(result, mockDetail)
})

test('createRecurringTemplate: gửi POST /recurring-templates với TemplateInput chuẩn, không chứa userId', async () => {
  const captured = []
  const mockCreated = {
    id: 101,
    categoryId: 5,
    categoryName: 'Internet',
    type: 'EXPENSE',
    amount: 250000,
    dayOfMonth: 15,
    note: 'Cước mạng',
    active: true,
  }

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockCreated, 201)
  }

  const inputData = {
    categoryId: '5',
    type: 'EXPENSE',
    amount: '250000',
    dayOfMonth: '15',
    note: '  Cước mạng  ',
    active: true,
  }

  const result = await recurringService.createRecurringTemplate(inputData)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'post')
  assert.equal(captured[0].url, '/recurring-templates')

  const body =
    typeof captured[0].data === 'string'
      ? JSON.parse(captured[0].data)
      : captured[0].data

  assert.equal(body.categoryId, 5)
  assert.equal(body.type, 'EXPENSE')
  assert.equal(body.amount, 250000)
  assert.equal(body.dayOfMonth, 15)
  assert.equal(body.note, 'Cước mạng', 'Note phải được trim')
  assert.equal(body.active, true)
  assert.equal(
    body.userId,
    undefined,
    'Client không được gửi userId, backend tự xác thực bằng JWT'
  )
  assert.deepEqual(result, mockCreated)
})

test('updateRecurringTemplate: gửi PUT /recurring-templates/{id} với dữ liệu cập nhật đầy đủ', async () => {
  const captured = []
  const mockUpdated = {
    id: 88,
    categoryId: 4,
    categoryName: 'Điện nước',
    type: 'EXPENSE',
    amount: 600000,
    dayOfMonth: 20,
    note: null,
    active: false,
  }

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, mockUpdated, 200)
  }

  const updateData = {
    categoryId: 4,
    type: 'EXPENSE',
    amount: 600000,
    dayOfMonth: 20,
    note: '',
    active: false,
  }

  const result = await recurringService.updateRecurringTemplate(88, updateData)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'put')
  assert.equal(captured[0].url, '/recurring-templates/88')

  const body =
    typeof captured[0].data === 'string'
      ? JSON.parse(captured[0].data)
      : captured[0].data

  assert.equal(body.categoryId, 4)
  assert.equal(body.amount, 600000)
  assert.equal(body.dayOfMonth, 20)
  assert.equal(body.note, null, 'Ghi chú rỗng phải gửi null theo hợp đồng')
  assert.equal(body.active, false)
  assert.deepEqual(result, mockUpdated)
})

test('deleteRecurringTemplate: gửi DELETE /recurring-templates/{id}', async () => {
  const captured = []

  client.defaults.adapter = async (config) => {
    captured.push(config)
    return response(config, null, 204)
  }

  await recurringService.deleteRecurringTemplate(55)

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'delete')
  assert.equal(captured[0].url, '/recurring-templates/55')
})

test('deleteRecurringTemplate: xử lý lỗi 409 TEMPLATE_IN_USE khi mẫu đã áp dụng', async () => {
  client.defaults.adapter = async (config) => {
    const error = new Error('Request failed with status code 409')
    error.config = config
    error.response = {
      status: 409,
      data: {
        code: 'TEMPLATE_IN_USE',
        message: 'Mẫu đã được áp dụng, không thể xóa.',
      },
    }
    throw error
  }

  await assert.rejects(
    async () => {
      await recurringService.deleteRecurringTemplate(12)
    },
    (err) => {
      assert.equal(err.response?.status, 409)
      assert.equal(err.response?.data?.code, 'TEMPLATE_IN_USE')
      return true
    }
  )
})

test('getRecurringTemplates: reject khi mạng lỗi, không trả dữ liệu giả lập', async () => {
  client.defaults.adapter = async (config) => {
    const error = new Error('Network Error')
    error.config = config
    error.isAxiosError = true
    throw error
  }

  await assert.rejects(
    async () => {
      await recurringService.getRecurringTemplates()
    },
    (err) => {
      assert.equal(err.message, 'Network Error')
      return true
    }
  )
})

/* ========================================================================== */
/* 2. UI & API Integration Tests                                              */
/* ========================================================================== */

test('RecurringTemplates: render dữ liệu danh sách từ Backend', () => {
  const backendTemplates = [
    {
      id: 101,
      categoryId: 1,
      categoryName: 'Tiền trọ',
      type: 'EXPENSE',
      amount: 3200000,
      dayOfMonth: 31,
      note: 'Trả ngày cuối tháng',
      active: true,
    },
    {
      id: 102,
      categoryId: 2,
      categoryName: 'Dạy thêm',
      type: 'INCOME',
      amount: 4500000,
      dayOfMonth: 10,
      note: 'Thu tiền học sinh',
      active: false,
    },
  ]

  const html = render(RecurringTemplatesPage, {
    initialTemplates: backendTemplates,
  })

  assert.match(html, /Tiền trọ/)
  assert.match(html, /3\.200\.000/)
  assert.match(html, /Trả ngày cuối tháng/)
  assert.match(html, /Dạy thêm/)
  assert.match(html, /4\.500\.000/)
  assert.match(html, /Thu tiền học sinh/)
  assert.match(html, /Tổng số:.*2.*mẫu/)
})

test('RecurringTemplates: render trạng thái lỗi khi API báo lỗi', () => {
  const html = render(RecurringTemplatesPage, {
    error: 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.',
  })

  assert.match(html, /Không thể kết nối máy chủ/)
  assert.match(html, /Thử lại/)
})

