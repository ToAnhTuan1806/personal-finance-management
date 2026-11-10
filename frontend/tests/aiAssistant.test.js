import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import axios from 'axios'
import client, { createApiClient } from '../src/api/axiosClient.js'
import { createSessionStore } from '../src/auth/session.js'
import {
  AI_CHAT_TIMEOUT_MS,
  AI_ERROR_MESSAGES,
  AI_SUGGESTED_QUESTIONS,
  createAiChatController,
  getAiChatErrorMessage,
  normalizeAiChatResponse,
  sendAiChatMessage,
} from '../src/services/aiChatService.js'

let server
let AiAssistantWidget
let AiAssistantPanelView
let AiStructuredResponseCard

const render = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props))

const memory = () => {
  const values = new Map()
  return {
    values,
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

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  const aiMod = await server.ssrLoadModule(
    '/src/components/ai/AiAssistantWidget.jsx'
  )
  AiAssistantWidget = aiMod.default
  AiAssistantPanelView = aiMod.AiAssistantPanelView
  AiStructuredResponseCard = aiMod.AiStructuredResponseCard
})

after(async () => {
  await server?.close()
})

test('Timeout cấu hình: Axios mặc định giữ nguyên 10.000 ms, chỉ POST /api/ai/chat dùng timeout riêng 35.000 ms', async () => {
  assert.equal(client.defaults.timeout, 10000, 'Axios mặc định phải giữ nguyên 10.000 ms')
  assert.equal(AI_CHAT_TIMEOUT_MS, 35000, 'AI Chat timeout phải là 35.000 ms')

  const store = createSessionStore(memory())
  store.authenticate(makeUser('trang'), 0)
  const api = createApiClient(store, '/api')
  assert.equal(api.defaults.timeout, 10000)

  const captured = []
  api.defaults.adapter = async (config) => {
    captured.push(config)
    if (config.url === '/ai/chat') {
      return makeResponse(config, {
        reply: 'Tổng chi tháng 11 là 5.000.000 ₫.',
        period: '2026-11',
        intent: 'SUMMARY',
        stats: { totalIncome: 15000000, totalExpense: 5000000, balance: 10000000 },
        topCategories: [],
        budget: null,
      })
    }
    return makeResponse(config, { content: [], totalElements: 0, totalPages: 0 })
  }

  await sendAiChatMessage(
    { message: 'Tháng này tôi đã chi bao nhiêu?', month: '2026-11' },
    { apiClient: api }
  )
  await api.get('/transactions')

  assert.equal(captured.length, 2)
  assert.equal(captured[0].url, '/ai/chat')
  assert.equal(captured[0].method, 'post')
  assert.equal(captured[0].timeout, 35000, 'Request /ai/chat phải override timeout thành 35000 ms')
  assert.equal(captured[0].headers.Authorization, 'Bearer test-token-trang')
  assert.deepEqual(JSON.parse(captured[0].data), {
    message: 'Tháng này tôi đã chi bao nhiêu?',
    month: '2026-11',
  })

  assert.equal(captured[1].url, '/transactions')
  assert.equal(captured[1].timeout, 10000, 'Request khác vẫn giữ timeout mặc định 10000 ms')
})

test('Bốn câu hỏi gợi ý P1 và chuẩn hóa đầy đủ DTO từ Backend (SUMMARY, CATEGORIES, BUDGET SET/NOT_SET, ADVICE)', () => {
  assert.deepEqual(AI_SUGGESTED_QUESTIONS, [
    'Tháng này tôi đã chi bao nhiêu?',
    'Danh mục nào tôi chi nhiều nhất?',
    'Ngân sách tháng này còn bao nhiêu?',
    'Tôi nên quản lý chi tiêu như thế nào?',
  ])

  // 1. SUMMARY
  const summaryRes = normalizeAiChatResponse(
    {
      reply: 'Trong tháng 11/2026, bạn đã chi 8.500.000 ₫.',
      period: '2026-11',
      intent: 'SUMMARY',
      stats: { totalIncome: 16000000, totalExpense: 8500000, balance: 7500000 },
      topCategories: [],
      budget: null,
    },
    '2026-11'
  )
  assert.equal(summaryRes.intent, 'SUMMARY')
  assert.deepEqual(summaryRes.stats, {
    totalIncome: 16000000,
    totalExpense: 8500000,
    balance: 7500000,
  })

  // 2. CATEGORIES
  const categoriesRes = normalizeAiChatResponse(
    {
      reply: 'Danh mục chi nhiều nhất là Ăn uống.',
      period: '2026-11',
      intent: 'CATEGORIES',
      stats: { totalIncome: 16000000, totalExpense: 8500000, balance: 7500000 },
      topCategories: [
        {
          categoryId: 1,
          categoryName: 'Ăn uống',
          totalAmount: 4250000,
          sharePercentage: 50,
        },
      ],
      budget: null,
    },
    '2026-11'
  )
  assert.equal(categoriesRes.topCategories.length, 1)
  assert.equal(categoriesRes.topCategories[0].sharePercentage, 50)

  // 3. BUDGET khi chưa đặt ngân sách (NOT_SET / monthly = null): không biến thành 0
  const budgetNotSet = normalizeAiChatResponse(
    {
      reply: 'Bạn chưa thiết lập ngân sách tổng cho tháng 11/2026.',
      period: '2026-11',
      intent: 'BUDGET',
      stats: { totalIncome: 10000000, totalExpense: 2000000, balance: 8000000 },
      topCategories: [],
      budget: {
        status: 'NOT_SET',
        monthly: null,
        categories: [],
      },
    },
    '2026-11'
  )
  assert.equal(budgetNotSet.budget.status, 'NOT_SET')
  assert.equal(budgetNotSet.budget.monthly, null)

  // 4. BUDGET khi đã đặt ngân sách (SET)
  const budgetSet = normalizeAiChatResponse(
    {
      reply: 'Ngân sách tháng 11 của bạn còn lại 1.500.000 ₫.',
      period: '2026-11',
      intent: 'BUDGET',
      stats: { totalIncome: 16000000, totalExpense: 8500000, balance: 7500000 },
      topCategories: [],
      budget: {
        status: 'SET',
        monthly: {
          id: 10,
          year: 2026,
          month: 11,
          amountLimit: 10000000,
          spentAmount: 8500000,
          remainingAmount: 1500000,
          exceeded: false,
        },
        categories: [
          {
            id: 41,
            categoryId: 1,
            categoryName: 'Ăn uống',
            year: 2026,
            month: 11,
            amountLimit: 4000000,
            spentAmount: 4250000,
            remainingAmount: -250000,
            usagePercentage: 106.25,
            exceeded: true,
            status: 'OVER_BUDGET',
          },
        ],
      },
    },
    '2026-11'
  )
  assert.equal(budgetSet.budget.status, 'SET')
  assert.equal(budgetSet.budget.monthly.remainingAmount, 1500000)
  assert.equal(budgetSet.budget.categories[0].status, 'OVER_BUDGET')
})

test('Xử lý lỗi Gemini / AI Chat: 504 AI_TIMEOUT, 429 RATE_LIMIT/QUOTA, 503 UNAVAILABLE, 401, 400 và lỗi mạng', () => {
  // 504 / AI_TIMEOUT / ECONNABORTED
  assert.equal(
    getAiChatErrorMessage({
      response: { status: 504, data: { code: 'AI_TIMEOUT', message: 'Timeout' } },
    }),
    'Trợ lý phản hồi quá lâu. Vui lòng thử lại sau.'
  )
  assert.equal(
    getAiChatErrorMessage({ code: 'ECONNABORTED' }),
    'Trợ lý phản hồi quá lâu. Vui lòng thử lại sau.'
  )

  // 429 / AI_RATE_LIMITED / AI_QUOTA_EXCEEDED
  for (const code of ['AI_RATE_LIMITED', 'AI_QUOTA_EXCEEDED']) {
    assert.equal(
      getAiChatErrorMessage({
        response: { status: 429, data: { code, message: 'Quota' } },
      }),
      'Bạn đã đạt giới hạn yêu cầu. Vui lòng thử lại sau.'
    )
  }

  // 503 / AI_UNAVAILABLE / AI_NOT_CONFIGURED
  for (const code of ['AI_UNAVAILABLE', 'AI_NOT_CONFIGURED']) {
    assert.equal(
      getAiChatErrorMessage({
        response: { status: 503, data: { code, message: 'Busy' } },
      }),
      'Trợ lý AI đang tạm thời bận. Vui lòng thử lại sau ít phút.'
    )
  }

  // 401
  assert.equal(
    getAiChatErrorMessage({ response: { status: 401, data: {} } }),
    'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  )

  // 400
  assert.equal(
    getAiChatErrorMessage({
      response: { status: 400, data: { message: 'Câu hỏi tối đa 500 ký tự' } },
    }),
    'Câu hỏi tối đa 500 ký tự'
  )

  // Lỗi mạng
  assert.equal(
    getAiChatErrorMessage(new axios.AxiosError('Network Error', 'ERR_NETWORK')),
    'Không thể kết nối tới trợ lý AI. Vui lòng kiểm tra kết nối mạng.'
  )
  assert.equal(AI_ERROR_MESSAGES.TIMEOUT, 'Trợ lý phản hồi quá lâu. Vui lòng thử lại sau.')
  assert.equal(AI_ERROR_MESSAGES.RATE_LIMIT, 'Bạn đã đạt giới hạn yêu cầu. Vui lòng thử lại sau.')
  assert.equal(AI_ERROR_MESSAGES.UNAVAILABLE, 'Trợ lý AI đang tạm thời bận. Vui lòng thử lại sau ít phút.')
  assert.equal(AI_ERROR_MESSAGES.NETWORK, 'Không thể kết nối tới trợ lý AI. Vui lòng kiểm tra kết nối mạng.')
})

test('Controller AI Chat: chống double-submit, giữ lịch sử khi đóng/mở lại hoặc khi lỗi, hỗ trợ Thử lại và Xóa hội thoại', async () => {
  const store = createSessionStore(memory())
  store.authenticate(makeUser('A'), 0)

  let callCount = 0
  let resolvePending
  const controller = createAiChatController({
    sessionStore: store,
    getDefaultMonth: () => '2026-11',
    sendChat: ({ message, month }) => {
      callCount += 1
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolvePending = () =>
            resolve({
              reply: 'Phản hồi câu 1',
              period: month,
              intent: 'SUMMARY',
              stats: { totalIncome: 100, totalExpense: 50, balance: 50 },
              topCategories: [],
              budget: null,
            })
        })
      }
      if (callCount === 2) {
        return Promise.reject({
          response: { status: 429, data: { code: 'AI_RATE_LIMITED' } },
        })
      }
      return Promise.resolve({
        reply: `Phản hồi thành công cho: ${message}`,
        period: month,
        intent: 'ADVICE',
        stats: { totalIncome: 100, totalExpense: 50, balance: 50 },
        topCategories: [],
        budget: null,
      })
    },
  })

  controller.openPanel()
  assert.equal(controller.getSnapshot().open, true)

  const firstPromise = controller.askQuestion(AI_SUGGESTED_QUESTIONS[0])
  assert.equal(controller.getSnapshot().loading, true)

  // Double-click trong lúc đang loading bị chặn hoàn toàn
  const duplicatePromise = controller.askQuestion(AI_SUGGESTED_QUESTIONS[1])
  assert.equal(await duplicatePromise, null)
  assert.equal(callCount, 1)

  resolvePending()
  await firstPromise
  assert.equal(controller.getSnapshot().loading, false)
  assert.equal(controller.getSnapshot().messages.length, 2)

  // Đóng rồi mở lại trong cùng phiên vẫn giữ nguyên lịch sử hội thoại
  controller.closePanel()
  assert.equal(controller.getSnapshot().open, false)
  controller.openPanel()
  assert.equal(controller.getSnapshot().messages.length, 2)

  // Câu hỏi thứ 2 gặp lỗi 429: không xóa lịch sử cũ, giữ lại câu hỏi để Thử lại
  await controller.askQuestion('Tôi nên quản lý chi tiêu như thế nào?')
  const afterFail = controller.getSnapshot()
  assert.equal(afterFail.loading, false)
  assert.equal(afterFail.error, 'Bạn đã đạt giới hạn yêu cầu. Vui lòng thử lại sau.')
  assert.equal(afterFail.lastFailedMessage, 'Tôi nên quản lý chi tiêu như thế nào?')
  assert.equal(afterFail.draft, 'Tôi nên quản lý chi tiêu như thế nào?')
  assert.equal(afterFail.messages.length, 3, 'Lịch sử trước đó + câu hỏi vừa gửi không bị mất')

  // Bấm Thử lại thành công mà không bị nhân đôi câu hỏi của user
  await controller.retryLastMessage()
  const afterRetry = controller.getSnapshot()
  assert.equal(afterRetry.error, '')
  assert.equal(afterRetry.messages.length, 4)
  assert.equal(
    afterRetry.messages[3].reply,
    'Phản hồi thành công cho: Tôi nên quản lý chi tiêu như thế nào?'
  )

  // Người dùng chủ động Xóa hội thoại
  controller.clearConversation()
  assert.equal(controller.getSnapshot().messages.length, 0)
  assert.equal(controller.getSnapshot().error, '')

  controller.destroy()
})

test('Cô lập phiên A/B và Logout: xóa ngay hội thoại khi logout/đổi user, hủy request cũ và không lưu localStorage', async () => {
  const storage = memory()
  const store = createSessionStore(storage)
  store.authenticate(makeUser('A'), 0)

  let finishSlowRequestFromA
  let callIndex = 0
  const controller = createAiChatController({
    sessionStore: store,
    getDefaultMonth: () => '2026-11',
    sendChat: ({ message, month }) => {
      callIndex += 1
      if (callIndex === 1) {
        return Promise.resolve({
          reply: 'Dữ liệu riêng của A',
          period: month,
          intent: 'SUMMARY',
          stats: { totalIncome: 5000000, totalExpense: 1000000, balance: 4000000 },
          topCategories: [],
          budget: null,
        })
      }
      return new Promise((resolve) => {
        finishSlowRequestFromA = () =>
          resolve({
            reply: `Bí mật của A: ${message}`,
            period: month,
            intent: 'SUMMARY',
            stats: { totalIncome: 9999999, totalExpense: 0, balance: 9999999 },
            topCategories: [],
            budget: null,
          })
      })
    },
  })

  await controller.askQuestion('Tháng này tôi đã chi bao nhiêu?')
  assert.equal(controller.getSnapshot().messages.length, 2)

  // Không lưu lịch sử chat vào storage
  for (const key of storage.values.keys()) {
    assert.ok(
      key === 'accessToken' || key === 'currentUser',
      `Không được lưu lịch sử chat tài chính vào storage: phát hiện key ${key}`
    )
  }

  // Gửi thêm một request chậm từ phiên A, sau đó logout và đăng nhập tài khoản B trước khi response về
  const pendingFromA = controller.askQuestion('Ngân sách tháng này còn bao nhiêu?')
  assert.equal(controller.getSnapshot().loading, true)

  store.clear()
  // Ngay khi logout, lịch sử chat phải bị xóa sạch
  assert.equal(controller.getSnapshot().messages.length, 0)
  assert.equal(controller.getSnapshot().loading, false)
  assert.equal(controller.getSnapshot().open, false)

  // Đăng nhập User B
  store.authenticate(makeUser('B'), store.getSnapshot().revision)
  finishSlowRequestFromA()
  await pendingFromA

  // Phản hồi muộn của A tuyệt đối không được xuất hiện trong phiên của B
  assert.equal(controller.getSnapshot().messages.length, 0)
  assert.equal(
    JSON.stringify(controller.getSnapshot().messages).includes('Bí mật của A'),
    false
  )

  controller.destroy()
})

test('Giao diện Chatbot & XSS Safety: render đầy đủ tiêu đề, 4 câu hỏi P1, số liệu DTO, trạng thái Chưa thiết lập ngân sách và escape HTML nguy hiểm', () => {
  // 1. Launcher khi đóng
  const closedHtml = render(AiAssistantWidget, { mobileMenuOpen: false })
  assert.match(closedHtml, /id="ai-assistant-launcher"/)
  assert.match(closedHtml, /Trợ lý tài chính/)

  // Ẩn launcher khi Drawer menu mobile đang mở
  const hiddenWhenDrawerOpen = render(AiAssistantWidget, { mobileMenuOpen: true })
  assert.equal(hiddenWhenDrawerOpen, '')

  // 2. Panel mở ở trạng thái chưa có hội thoại
  const emptyOpenHtml = render(AiAssistantPanelView, {
    open: true,
    month: '2026-11',
    draft: '',
    messages: [],
    loading: false,
    error: '',
  })
  assert.match(emptyOpenHtml, /Trợ lý tài chính/)
  assert.match(
    emptyOpenHtml,
    /Hỏi về thu chi, danh mục và ngân sách của bạn\./
  )
  assert.match(emptyOpenHtml, /Chưa có cuộc trò chuyện nào/)
  for (const question of AI_SUGGESTED_QUESTIONS) {
    assert.ok(
      emptyOpenHtml.includes(question),
      `Phải hiển thị câu hỏi gợi ý: ${question}`
    )
  }
  assert.match(emptyOpenHtml, /aria-label="Xóa hội thoại"/)
  assert.match(emptyOpenHtml, /aria-label="Đóng trợ lý tài chính"/)
  assert.match(emptyOpenHtml, /aria-label="Gửi câu hỏi"/)

  // 3. Render response có đủ stats, topCategories, budget NOT_SET và kiểm tra chống XSS
  const maliciousReply = 'Cảnh báo <script>alert("XSS")</script> và <img src=x onerror="hack()">'
  const maliciousCategory = '<svg onload="evil()">Ăn uống</svg>'

  const populatedHtml = render(AiAssistantPanelView, {
    open: true,
    month: '2026-11',
    draft: '',
    loading: false,
    error: AI_ERROR_MESSAGES.UNAVAILABLE,
    onRetry: () => {},
    messages: [
      {
        id: 'u1',
        role: 'user',
        content: 'Tháng này tôi đã chi bao nhiêu?',
        period: '2026-11',
      },
      {
        id: 'a1',
        role: 'assistant',
        reply: maliciousReply,
        content: maliciousReply,
        period: '2026-11',
        intent: 'CATEGORIES',
        stats: {
          totalIncome: 15000000,
          totalExpense: 6000000,
          balance: 9000000,
        },
        topCategories: [
          {
            categoryId: 1,
            categoryName: maliciousCategory,
            totalAmount: 3000000,
            sharePercentage: 50,
          },
        ],
        budget: {
          status: 'NOT_SET',
          monthly: null,
          categories: [],
        },
      },
    ],
  })

  // Escape toàn bộ thẻ HTML nguy hiểm
  assert.ok(!populatedHtml.includes('<script>alert'))
  assert.ok(!populatedHtml.includes('<img src=x'))
  assert.ok(!populatedHtml.includes('<svg onload'))
  assert.ok(populatedHtml.includes('&lt;script&gt;'))
  assert.ok(populatedHtml.includes('&lt;svg onload'))

  // Hiển thị đúng số liệu từ DTO
  assert.match(populatedHtml, /Kỳ thống kê: Tháng 11\/2026 \(2026-11\)/)
  assert.match(populatedHtml, /15\.000\.000 ₫/)
  assert.match(populatedHtml, /6\.000\.000 ₫/)
  assert.match(populatedHtml, /\+9\.000\.000 ₫/)
  assert.match(populatedHtml, /3\.000\.000 ₫/)
  assert.match(populatedHtml, /\(50%\)/)

  // Ngân sách chưa đặt phải hiện "Chưa thiết lập"
  assert.match(populatedHtml, /Chưa thiết lập/)
  assert.match(populatedHtml, /Chưa thiết lập hạn mức ngân sách tổng cho kỳ này\./)

  // Thông báo lỗi kèm nút Thử lại
  assert.ok(populatedHtml.includes(AI_ERROR_MESSAGES.UNAVAILABLE))
  assert.match(populatedHtml, /Thử lại/)

  // 4. Render ngân sách đã thiết lập (SET) và danh mục vượt ngân sách
  const budgetSetHtml = render(AiStructuredResponseCard, {
    message: {
      role: 'assistant',
      reply: 'Ngân sách của bạn đang trong tầm kiểm soát.',
      period: '2026-11',
      intent: 'BUDGET',
      stats: { totalIncome: 20000000, totalExpense: 8000000, balance: 12000000 },
      topCategories: [],
      budget: {
        status: 'SET',
        monthly: {
          id: 1,
          year: 2026,
          month: 11,
          amountLimit: 10000000,
          spentAmount: 8000000,
          remainingAmount: 2000000,
          exceeded: false,
        },
        categories: [
          {
            id: 2,
            categoryId: 10,
            categoryName: 'Mua sắm',
            year: 2026,
            month: 11,
            amountLimit: 2000000,
            spentAmount: 2500000,
            remainingAmount: -500000,
            usagePercentage: 125,
            exceeded: true,
            status: 'OVER_BUDGET',
          },
        ],
      },
    },
  })
  assert.match(budgetSetHtml, /Đã thiết lập/)
  assert.match(budgetSetHtml, /10\.000\.000 ₫/)
  assert.match(budgetSetHtml, /2\.000\.000 ₫/)
  assert.match(budgetSetHtml, /Mua sắm/)
  assert.match(budgetSetHtml, /Vượt ngân sách \(125%\)/)
})

