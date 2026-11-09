import assert from 'node:assert/strict'
import test from 'node:test'
import axios from 'axios'
import client, { createApiClient } from '../src/api/axiosClient.js'
import { createSessionStore, session } from '../src/auth/session.js'
import {
  getMonthlyReport,
  normalizeMonthlyReport,
} from '../src/services/reportService.js'

const memory = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

const makeUser = (id) => ({
  accessToken: `test-token-${id}`,
  user: { id, fullName: `User ${id}`, email: `${id}@example.test` },
})

const makeResponse = (config, data, status = 200) => ({
  config,
  data,
  status,
  statusText: 'OK',
  headers: {},
})

test('getMonthlyReport: gửi đúng GET /reports/monthly?from=YYYY-MM&to=YYYY-MM và chuẩn hóa đúng contract D10-BE', async () => {
  session.clear()

  const captured = []
  client.defaults.adapter = async (config) => {
    captured.push(config)
    return makeResponse(config, {
      from: '2026-09',
      to: '2026-11',
      months: [
        {
          month: '2026-09',
          totalIncome: 100.1,
          totalExpense: 20.05,
          balance: 80.05,
        },
        {
          month: '2026-10',
          totalIncome: 0,
          totalExpense: 0,
          balance: 0,
        },
        {
          month: '2026-11',
          totalIncome: 0,
          totalExpense: 30.15,
          balance: -30.15,
        },
      ],
      expensesByCategory: [
        {
          categoryId: 1,
          categoryName: 'Ăn uống',
          totalAmount: 50.2,
        },
      ],
    })
  }

  const result = await getMonthlyReport({
    from: '2026-09',
    to: '2026-11',
  })

  assert.equal(captured.length, 1)
  assert.equal(captured[0].method, 'get')
  assert.equal(captured[0].url, '/reports/monthly')
  assert.deepEqual(captured[0].params, {
    from: '2026-09',
    to: '2026-11',
  })

  assert.equal(result.from, '2026-09')
  assert.equal(result.to, '2026-11')
  assert.equal(result.months.length, 3)
  assert.deepEqual(result.months[1], {
    month: '2026-10',
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
  })
  assert.deepEqual(result.expensesByCategory, [
    {
      categoryId: 1,
      categoryName: 'Ăn uống',
      totalAmount: 50.2,
    },
  ])
  assert.deepEqual(result.summary, {
    totalIncome: 100.1,
    totalExpense: 50.2,
    balance: 49.9,
  })
})

test('JWT Authorization: gắn Bearer token khi gọi GET /reports/monthly và xóa phiên khi nhận 401', async () => {
  const storage = memory()
  const store = createSessionStore(storage)
  store.authenticate(makeUser('trang'), 0)
  const api = createApiClient(store, '/api')

  const captured = []
  api.defaults.adapter = async (config) => {
    captured.push(config)
    return makeResponse(config, {
      from: '2026-09',
      to: '2026-11',
      months: [],
      expensesByCategory: [],
    })
  }

  await api.get('/reports/monthly', {
    params: { from: '2026-09', to: '2026-11' },
  })
  assert.equal(captured[0].headers.Authorization, 'Bearer test-token-trang')

  api.defaults.adapter = async (config) => {
    throw new axios.AxiosError(
      'Unauthorized',
      'ERR_BAD_RESPONSE',
      config,
      null,
      makeResponse(config, { status: 401, code: 'UNAUTHORIZED', message: 'Hết hạn' }, 401)
    )
  }

  await assert.rejects(
    api.get('/reports/monthly', { params: { from: '2026-09', to: '2026-11' } })
  )
  assert.equal(store.getToken(), null)
  assert.equal(store.getSnapshot().reason, 'expired')
})

test('getMonthlyReport: tháng rỗng và danh mục rỗng vẫn giữ nguyên số 0 hợp lệ, không phát sinh dữ liệu giả', async () => {
  session.clear()

  client.defaults.adapter = async (config) =>
    makeResponse(config, {
      from: '2026-10',
      to: '2026-10',
      months: [
        {
          month: '2026-10',
          totalIncome: 0,
          totalExpense: 0,
          balance: 0,
        },
      ],
      expensesByCategory: [],
    })

  const result = await getMonthlyReport({
    from: '2026-10',
    to: '2026-10',
  })

  assert.equal(result.months.length, 1)
  assert.equal(result.months[0].totalIncome, 0)
  assert.equal(result.months[0].totalExpense, 0)
  assert.equal(result.months[0].balance, 0)
  assert.deepEqual(result.expensesByCategory, [])
  assert.deepEqual(result.summary, {
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
  })
})

test('getMonthlyReport: chặn khoảng tháng không hợp lệ hoặc vượt quá 6 tháng trước khi gửi request mạng', async () => {
  let networkCalled = false
  client.defaults.adapter = async () => {
    networkCalled = true
    throw new Error('Should not reach network')
  }

  for (const invalidParams of [
    { from: '2026-11', to: '2026-09' },
    { from: '2026-05', to: '2026-11' },
    { from: '2025-11', to: '2026-11' },
    { from: '1899-12', to: '1900-01' },
    { from: '2026-13', to: '2026-12' },
    {},
  ]) {
    await assert.rejects(
      () => getMonthlyReport(invalidParams),
      { code: 'INVALID_REPORT_RANGE' }
    )
  }

  assert.equal(networkCalled, false)
})

test('getMonthlyReport: phải reject khi mất mạng hoặc lỗi HTTP (400, 500), không trả fallback giả', async () => {
  session.clear()

  client.defaults.adapter = async (config) => {
    throw new axios.AxiosError('Network Error', 'ERR_NETWORK', config)
  }

  await assert.rejects(
    getMonthlyReport({ from: '2026-09', to: '2026-11' }),
    { code: 'ERR_NETWORK' }
  )

  for (const status of [400, 500]) {
    client.defaults.adapter = async (config) => {
      throw new axios.AxiosError(
        'Server Error',
        'ERR_BAD_RESPONSE',
        config,
        null,
        makeResponse(config, { status, code: 'ERR', message: 'Lỗi' }, status)
      )
    }

    await assert.rejects(
      getMonthlyReport({ from: '2026-09', to: '2026-11' })
    )
  }
})

test('Phân tách phiên đăng nhập: response báo cáo của phiên A bị hủy và không rò rỉ sang phiên B', async () => {
  const store = createSessionStore(memory())
  store.authenticate(makeUser('A'), 0)
  const api = createApiClient(store, '/api')

  let finishRequest
  let requestStarted
  const ready = new Promise((resolve) => {
    requestStarted = resolve
  })

  api.defaults.adapter = (config) =>
    new Promise((resolve) => {
      finishRequest = () =>
        resolve(
          makeResponse(config, {
            from: '2026-09',
            to: '2026-11',
            months: [],
            expensesByCategory: [],
          })
        )
      requestStarted()
    })

  const pending = api.get('/reports/monthly', {
    params: { from: '2026-09', to: '2026-11' },
  })
  await ready

  store.clear()
  store.authenticate(makeUser('B'), store.getSnapshot().revision)
  finishRequest()

  await assert.rejects(pending, { code: 'ERR_CANCELED' })
  assert.equal(store.getSnapshot().user.id, 'B')
})

test('normalizeMonthlyReport: từ chối response sai cấu trúc hoặc thiếu trường bắt buộc', async () => {
  const malformedPayloads = [
    null,
    {},
    {
      from: '2026-09',
      to: '2026-11',
      months: 'not-array',
      expensesByCategory: [],
    },
    {
      from: '2026-09',
      to: '2026-11',
      months: [],
      expensesByCategory: 'not-array',
    },
    {
      from: '2026-09',
      to: '2026-11',
      months: [{ month: 'bad', totalIncome: 0, totalExpense: 0, balance: 0 }],
      expensesByCategory: [],
    },
    {
      from: '2026-09',
      to: '2026-11',
      months: [{ month: '2026-09', totalIncome: -10, totalExpense: 0, balance: -10 }],
      expensesByCategory: [],
    },
    {
      from: '2026-09',
      to: '2026-11',
      months: [],
      expensesByCategory: [{ categoryId: 0, categoryName: 'Ăn uống', totalAmount: 100 }],
    },
    {
      from: '2026-09',
      to: '2026-11',
      months: [],
      expensesByCategory: [{ categoryId: 1, categoryName: '', totalAmount: 100 }],
    },
    {
      from: '2026-09',
      to: '2026-11',
      months: [],
      expensesByCategory: [{ categoryId: 1, categoryName: 'Ăn uống', totalAmount: -5 }],
    },
  ]

  for (const bad of malformedPayloads) {
    assert.throws(() => normalizeMonthlyReport(bad), {
      code: 'INVALID_API_RESPONSE',
    })
  }
})

test('getMonthlyReport: từ chối khi Backend trả về khoảng tháng (from, to) lệch với request', async () => {
  session.clear()

  client.defaults.adapter = async (config) =>
    makeResponse(config, {
      from: '2026-08',
      to: '2026-11',
      months: [],
      expensesByCategory: [],
    })

  await assert.rejects(
    () => getMonthlyReport({ from: '2026-09', to: '2026-11' }),
    { code: 'INVALID_API_RESPONSE' }
  )
})
