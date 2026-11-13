import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'
import axios from 'axios'
import client, { createApiClient } from '../src/api/axiosClient.js'
import { createSessionStore } from '../src/auth/session.js'
import {
  AI_CHAT_TIMEOUT_MS,
  AI_ERROR_MESSAGES,
  AI_SUGGESTED_QUESTIONS,
  createAiChatController,
  formatAiReplyForDisplay,
  getAiChatErrorMessage,
  normalizeAiChatResponse,
  getAiSuggestedQuestions,
  normalizeAiContext,
  validateAiChatRequest,
  getDefaultCompareMonth,
  sendAiChatMessage,
} from '../src/services/aiChatService.js'

let server
let AiAssistantWidget
let AiAssistantPanelView
let AiStructuredResponseCard

const render = (Component, props) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(Component, props))
  )

const elements = (element) => {
  if (!element || typeof element !== 'object') return []
  return [element, ...[element.props?.children].flat(Infinity).flatMap(elements)]
}

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
  assert.deepEqual(AI_SUGGESTED_QUESTIONS.slice(0, 4), [
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
  assert.match(hiddenWhenDrawerOpen, /hidden=""/)
  assert.match(hiddenWhenDrawerOpen, /display:none/)

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
  assert.doesNotMatch(emptyOpenHtml, /Hỏi về thu chi, danh mục và ngân sách của bạn\./)
  assert.match(emptyOpenHtml, /Xem câu hỏi gợi ý phía trước/)
  assert.match(emptyOpenHtml, /Xem thêm câu hỏi gợi ý/)
  assert.match(emptyOpenHtml, /cursor-grab/)
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
  assert.match(budgetSetHtml, /Trong ngân sách/)
  assert.match(budgetSetHtml, /10\.000\.000 ₫/)
  assert.match(budgetSetHtml, /2\.000\.000 ₫/)
  assert.match(budgetSetHtml, /Mua sắm/)
  assert.match(budgetSetHtml, /Vượt ngân sách \(125%\)/)
})



const p2Response = (intent = 'COMPARISON') => ({
  reply: 'So sánh thu chi theo dữ liệu Backend.', period: '2026-11', intent,
  stats: { totalIncome: 200.2, totalExpense: 20.5, balance: 179.7 }, topCategories: [], budget: null,
  comparison: {
    baseMonth: '2026-10', targetMonth: '2026-11',
    base: { totalIncome: 100.1, totalExpense: 10.1, balance: 90 },
    target: { totalIncome: 200.2, totalExpense: 20.5, balance: 179.7 },
    delta: { totalIncome: 100.1, totalExpense: 10.4, balance: 89.7 }, expenseChangePercent: 102.97,
    categoryTrends: [
      { categoryId: 12, categoryName: 'Ăn uống', baseExpense: 10.1, targetExpense: 20.5, delta: 10.4, changePercent: 102.97 },
      { categoryId: 13, categoryName: 'Đi lại', baseExpense: 50, targetExpense: 0, delta: -50, changePercent: -100 },
      { categoryId: 14, categoryName: 'Không đổi', baseExpense: 5, targetExpense: 5, delta: 0, changePercent: 0 },
      { categoryId: 15, categoryName: 'Mới phát sinh', baseExpense: 0, targetExpense: 1, delta: 1, changePercent: null },
    ],
  },
})

test('D13 thêm hai câu gợi ý P2, giữ bốn câu P1', () => {
  assert.deepEqual(AI_SUGGESTED_QUESTIONS.slice(4), [
    'So sánh thu chi với tháng trước.', 'Danh mục nào tăng chi tiêu nhiều nhất?',
  ])
})

for (const intent of ['COMPARISON', 'CATEGORY_TREND']) {
  test(`D13 ${intent}: số liệu Backend và mini-card gốc/đích, tiền lẻ, tăng/giảm/không đổi`, () => {
    const normalized = normalizeAiChatResponse(p2Response(intent), '2026-11', '2026-10')
    assert.equal(normalized.comparison.delta.totalExpense, 10.4)
    assert.equal(normalized.comparison.expenseChangePercent, 102.97)
    assert.equal(normalized.comparison.categoryTrends[3].changePercent, null)
    const html = render(AiStructuredResponseCard, { message: { ...normalized, role: 'assistant' } })
    for (const label of ['Kỳ gốc', 'Kỳ đang xem', 'Tháng 10/2026', 'Tháng 11/2026', 'Tổng thu', 'Tổng chi', 'Số dư', '100,1 ₫', '200,2 ₫', '+10,4 ₫', '102,97%', '-100%', 'Tăng', 'Giảm', 'Không đổi']) {
      assert.ok(html.includes(label), label)
    }
    assert.doesNotMatch(html, /NaN|Infinity/)
  })
}

for (const [name, mutate] of [
  ['thiếu comparison', r => { delete r.comparison }],
  ['comparison rỗng', r => { r.comparison = {} }],
  ['kỳ gốc ngoài miền', r => { r.comparison.baseMonth = '1899-12' }],
  ['sai kỳ đích', r => { r.comparison.targetMonth = '2026-12' }],
  ['hai kỳ trùng', r => { r.comparison.baseMonth = '2026-11' }],
  ['thiếu stats gốc', r => { delete r.comparison.base }],
  ['thiếu số tiền', r => { delete r.comparison.target.totalExpense }],
  ['NaN', r => { r.comparison.delta.balance = NaN }],
  ['Infinity', r => { r.comparison.expenseChangePercent = Infinity }],
  ['chuỗi số giả', r => { r.comparison.base.totalIncome = '' }],
  ['object thay số', r => { r.comparison.target.totalExpense = [] }],
  ['thu kỳ gốc âm', r => { r.comparison.base.totalIncome = -1 }],
  ['thiếu mảng danh mục', r => { r.comparison.categoryTrends = null }],
  ['ID trùng', r => { r.comparison.categoryTrends.push(r.comparison.categoryTrends[0]) }],
  ['ID sai', r => { r.comparison.categoryTrends[0].categoryId = -1 }],
  ['tên trống', r => { r.comparison.categoryTrends[0].categoryName = ' ' }],
  ['thiếu %', r => { delete r.comparison.categoryTrends[0].changePercent }],
  ['% giả khi gốc 0', r => { r.comparison.categoryTrends[3].changePercent = 0 }],
]) {
  test(`D13 chặn response ${name} trước khi render`, () => {
    const response = p2Response()
    mutate(response)
    assert.throws(() => normalizeAiChatResponse(response, '2026-11', '2026-10'), { code: 'INVALID_API_RESPONSE' })
  })
}

test('D13 hai tháng rỗng: zero từ Backend, tỷ lệ null không thành 0%, không tạo số liệu cho response thiếu', () => {
  const response = p2Response()
  response.stats = { totalIncome: 0, totalExpense: 0, balance: 0 }
  Object.assign(response.comparison, { base: response.stats, target: response.stats,
    delta: response.stats, expenseChangePercent: null, categoryTrends: [] })
  const normalized = normalizeAiChatResponse(response)
  const html = render(AiStructuredResponseCard, { message: { ...normalized, role: 'assistant' } })
  assert.match(html, /Không có giao dịch trong cả hai tháng/)
  assert.match(html, /Không tính được % thay đổi chi tiêu vì kỳ gốc bằng 0/)
  assert.doesNotMatch(html, /NaN|Infinity|0%/)
  const invalid = render(AiStructuredResponseCard, { message: { role: 'assistant', intent: 'COMPARISON' } })
  assert.match(invalid, /Chưa nhận được dữ liệu so sánh hợp lệ/)
  assert.doesNotMatch(invalid, /0 ₫|NaN|Infinity/)
})

test('D13 kỳ đích rỗng vẫn hiển thị giảm 100%, delta thu/chi âm hợp lệ', () => {
  const response = p2Response()
  Object.assign(response.comparison, { target: { totalIncome: 0, totalExpense: 0, balance: 0 },
    delta: { totalIncome: -100.1, totalExpense: -10.1, balance: -90 }, expenseChangePercent: -100, categoryTrends: [] })
  const html = render(AiStructuredResponseCard, { message: { ...normalizeAiChatResponse(response), role: 'assistant' } })
  assert.match(html, /-100%/)
  assert.match(html, /-100,1 ₫/)
  assert.match(html, /Giảm/)
})

test('D13 P1 không cần comparison; request cũ hai field vẫn hợp lệ', () => {
  for (const intent of ['SUMMARY', 'CATEGORIES', 'BUDGET', 'ADVICE']) {
    const response = p2Response(intent)
    delete response.comparison
    assert.equal(normalizeAiChatResponse(response).comparison, null)
  }
  assert.deepEqual(validateAiChatRequest({ message: 'Tổng chi?', month: '2026-11' }).payload,
    { message: 'Tổng chi?', month: '2026-11' })
})

test('D13 validation hai tháng, qua năm và tháng trước ngoài 1900–2100', () => {
  assert.equal(getDefaultCompareMonth('2026-01'), '2025-12')
  assert.equal(getDefaultCompareMonth('2024-03'), '2024-02')
  assert.equal(getDefaultCompareMonth('1900-01'), '')
  assert.equal(getDefaultCompareMonth('2100-12'), '2100-11')
  for (const compareMonth of ['', '2026-11', '1899-12', '2101-01', '2026-13', '2026-1', 202610]) {
    assert.equal(validateAiChatRequest({ message: 'So sánh', month: '2026-11', compareMonth }).valid, false)
  }
  assert.equal(validateAiChatRequest({ message: 'So sánh', month: '1900-01', compareMonth: '2100-12' }).valid, true)
})

test('D13 POST gửi đúng ba field, timeout 35s và không gửi userId', async () => {
  let payload, config
  const result = await sendAiChatMessage({ message: 'So sánh', month: '2026-11', compareMonth: '2026-10', userId: 999 }, {
    apiClient: { post: async (url, body, options) => {
      assert.equal(url, '/ai/chat'); payload = body; config = options
      return { data: p2Response() }
    } },
  })
  assert.deepEqual(payload, { message: 'So sánh', month: '2026-11', compareMonth: '2026-10' })
  assert.equal(config.timeout, 35000)
  assert.equal(result.comparison.baseMonth, '2026-10')
})

test('D13 đổi nhanh hai kỳ: abort và loại response cũ kể cả transport bỏ qua abort', async () => {
  const store = createSessionStore(memory()); store.authenticate(makeUser('A'), 0)
  const pending = []
  const controller = createAiChatController({ sessionStore: store, getDefaultMonth: () => '2026-11',
    sendChat: (payload, { signal }) => new Promise(resolve => pending.push({ payload, signal, resolve })) })
  const first = controller.askQuestion('So sánh')
  controller.setMonth('2026-01')
  assert.equal(pending[0].signal.aborted, true)
  assert.equal(controller.getSnapshot().compareMonth, '2025-12')
  const second = controller.askQuestion('So sánh')
  controller.setCompareMonth('2025-11')
  assert.equal(pending[1].signal.aborted, true)
  const third = controller.askQuestion('So sánh')
  assert.equal(pending[2].payload.compareMonth, '2025-11')
  pending[0].resolve({ ...p2Response(), reply: 'STALE_FIRST' })
  pending[1].resolve({ ...p2Response(), reply: 'STALE_SECOND' })
  await first; await second
  assert.equal(controller.getSnapshot().loading, true)
  assert.ok(!JSON.stringify(controller.getSnapshot()).includes('STALE_'))
  const latest = p2Response()
  latest.period = '2026-01'; latest.comparison.targetMonth = '2026-01'; latest.comparison.baseMonth = '2025-11'
  pending[2].resolve(latest)
  await third
  assert.equal(controller.getSnapshot().loading, false)
  assert.ok(controller.getSnapshot().messages.at(-1).comparison)
  controller.destroy()
})

test('D13 logout/đổi A sang B hủy P2, xóa comparison và khôi phục cặp kỳ mặc định', async () => {
  const store = createSessionStore(memory()); store.authenticate(makeUser('A'), 0)
  let finish, signal
  const controller = createAiChatController({ sessionStore: store, getDefaultMonth: () => '2026-11',
    sendChat: (_, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve }) } })
  controller.setCompareMonth('2026-09')
  const request = controller.askQuestion('So sánh')
  store.clear(); store.authenticate(makeUser('B'), store.getSnapshot().revision)
  assert.equal(signal.aborted, true)
  assert.equal(controller.getSnapshot().compareMonth, '2026-10')
  finish(p2Response()); await request
  assert.deepEqual(controller.getSnapshot().messages, [])
  controller.destroy()
})

test('D13 Retry giữ cặp kỳ đã chọn và lỗi compareMonth từ API', async () => {
  const store = createSessionStore(memory()); store.authenticate(makeUser('A'), 0)
  const calls = []
  const controller = createAiChatController({ sessionStore: store, getDefaultMonth: () => '2026-11',
    sendChat: async (payload) => { calls.push(payload); if (calls.length === 1) throw { response: { status: 503 } }; return p2Response() } })
  controller.setCompareMonth('2026-08')
  await controller.askQuestion('So sánh')
  await controller.retryLastMessage()
  assert.deepEqual(calls[0], calls[1])
  assert.equal(controller.getSnapshot().messages.length, 2)
  assert.equal(getAiChatErrorMessage({ response: { status: 400, data: { errors: { compareMonth: 'Kỳ gốc không hợp lệ' } } } }), 'Kỳ gốc không hợp lệ')
  controller.destroy()
})

test('D13 UI giữ hai bộ chọn tháng tiếng Việt, keyboard label, loading/retry và khoảng cách Bottom Navigation', () => {
  const html = render(AiAssistantPanelView, { open: true, month: '2026-11', compareMonth: '2026-10', loading: true })
  assert.match(html, /aria-label="Tháng đang xem"/)
  assert.match(html, /aria-label="Tháng so sánh"/)
  assert.match(html, /id="ai-chat-compare-month"/)
  assert.match(html, /10.5rem/)
  assert.match(html, /motion-reduce:animate-none/)
  const pickers = [...html.matchAll(/<button[^>]*data-month-picker-trigger="vi"[^>]*>/g)].map(
    (match) => match[0]
  )
  assert.equal(pickers.length, 2)
  assert.ok(pickers.every((picker) => !/\sdisabled(?:=|\s|>)/.test(picker)))
  assert.doesNotMatch(html, /type="month"/)
})

test('D13 tên danh mục và reply HTML chỉ render text, không thực thi XSS', () => {
  const response = p2Response('CATEGORY_TREND')
  response.comparison.categoryTrends[0].categoryName = '<img src=x onerror="evil()">'
  response.reply = '<script>evil()</script>'
  const html = render(AiStructuredResponseCard, { message: { ...normalizeAiChatResponse(response), role: 'assistant' } })
  assert.doesNotMatch(html, /<img src=x|<script>evil/)
  assert.match(html, /&lt;img/)
})


test('D13 tháng 1900-01 vẫn cho hỏi P1 khi không có tháng trước hợp lệ', async () => {
  const store = createSessionStore(memory()); store.authenticate(makeUser('A'), 0)
  let sent
  const controller = createAiChatController({ sessionStore: store, getDefaultMonth: () => '1900-01',
    sendChat: async payload => { sent = payload; return { reply: 'Không có giao dịch.', period: '1900-01', intent: 'SUMMARY', stats: null, topCategories: [], budget: null } } })
  await controller.askQuestion('Tổng chi?')
  assert.equal(sent.month, '1900-01')
  assert.equal(sent.compareMonth, undefined)
  assert.equal(controller.getSnapshot().messages.length, 2)
  controller.destroy()
})


for (const intent of ['COMPARISON', 'CATEGORY_TREND']) {
  test(`NLU ${intent}: chấp nhận kỳ thực tế khác cả hai picker, vẫn giữ quan hệ target=period`, () => {
    const response = p2Response(intent)
    response.period = response.comparison.targetMonth = '2024-02'
    response.comparison.baseMonth = '2024-01'
    const result = normalizeAiChatResponse(response, '2026-11', '2026-10')
    assert.equal(result.period, '2024-02')
    assert.equal(result.comparison.baseMonth, '2024-01')
    const html = render(AiStructuredResponseCard, { message: { ...result, role: 'assistant' } })
    assert.match(html, /Tháng 02\/2024/)
    assert.match(html, /Biểu đồ so sánh thu chi/)
    response.comparison.targetMonth = '2024-03'
    assert.throws(() => normalizeAiChatResponse(response), { code: 'INVALID_API_RESPONSE' })
  })
}

for (const period of ['1899-12', '2101-01', '2026-13', '2026-1', '2026-11 ', '', null]) {
  test(`NLU từ chối period không hợp lệ: ${period}`, () => {
    assert.throws(() => normalizeAiChatResponse({ ...p2Response('SUMMARY'), period }), { code: 'INVALID_API_RESPONSE' })
  })
}

test('NLU SUMMARY và CATEGORIES không so khớp cứng tháng picker; biểu đồ theo kỳ thật', () => {
  const data = p2Response('CATEGORIES'); delete data.comparison; data.period = '2024-02'
  data.topCategories = [{ categoryId: 1, categoryName: 'Ăn uống', totalAmount: 20.5, sharePercentage: 100 }]
  const response = normalizeAiChatResponse(data, '2026-11')
  const html = render(AiStructuredResponseCard, { message: { ...response, role: 'assistant' } })
  assert.match(html, /Biểu đồ chi tiêu theo danh mục/)
  assert.match(html, /Tháng 02\/2024/)
  assert.match(html, /20,5 ₫/)
})

const unknownResponse = () => ({ reply: 'Mình hỗ trợ 6 khả năng; thử một trong 3 câu hỏi mẫu.', period: '2026-11', intent: 'UNKNOWN', stats: null, topCategories: [], budget: null })

test('NLU UNKNOWN hiển thị hướng dẫn, không giả số liệu hoặc nhãn kỳ thống kê', () => {
  const html = render(AiStructuredResponseCard, { message: { ...normalizeAiChatResponse(unknownResponse()), role: 'assistant' } })
  assert.match(html, /Cần làm rõ/)
  assert.match(html, /Xin chào! Mình có thể giúp bạn/)
  assert.doesNotMatch(html, /SUMMARY|CATEGORIES|BUDGET|ADVICE|COMPARISON|CATEGORY_TREND/)
  assert.doesNotMatch(html, /Kỳ thống kê|0 ₫|NaN|Infinity/)
  assert.equal(getAiSuggestedQuestions({ lastIntent: 'UNKNOWN' }).length, 3)
  assert.throws(() => normalizeAiChatResponse({ ...unknownResponse(), stats: { totalIncome: 123 } }), { code: 'INVALID_API_RESPONSE' })
})

test('UI AI Việt hóa mã kỹ thuật trong nội dung phản hồi', () => {
  const display = formatAiReplyForDisplay(
    'SUMMARY, CATEGORIES, BUDGET, ADVICE, COMPARISON, CATEGORY_TREND.',
    'ADVICE'
  )
  assert.equal(
    display,
    'tổng quan thu chi, phân tích danh mục, kiểm tra ngân sách, tư vấn quản lý chi tiêu, so sánh hai tháng, xu hướng chi tiêu theo danh mục.'
  )
})

test('Liên kết nội bộ AI dùng React Router và chỉ đóng panel, không xóa hội thoại', () => {
  let navigated = 0
  const tree = AiStructuredResponseCard({
    message: {
      role: 'assistant',
      reply: 'Bạn có thể xem thêm thông tin.',
      intent: 'ADVICE',
      period: '2026-11',
      stats: null,
      topCategories: [],
      budget: null,
    },
    onNavigate: () => { navigated += 1 },
  })
  const nodes = elements(tree)
  const budgetLink = nodes.find((node) => node.props?.to === '/budgets')
  const reportLink = nodes.find((node) => node.props?.to === '/reports')

  assert.ok(budgetLink, 'Quản lý ngân sách phải dùng Link nội bộ')
  assert.ok(reportLink, 'Xem báo cáo chi tiết phải dùng Link nội bộ')
  assert.equal(budgetLink.props.href, undefined)
  assert.equal(reportLink.props.href, undefined)

  budgetLink.props.onClick()
  reportLink.props.onClick()
  assert.equal(navigated, 2)
})

test('NLU context được giới hạn ba field, không mang owner, tiền, prompt hay token', () => {
  assert.deepEqual(normalizeAiContext({ intent: 'COMPARISON', month: '2024-02', compareMonth: '2024-01', userId: 999, totalIncome: 999, jwt: 'fake' }),
    { intent: 'COMPARISON', month: '2024-02', compareMonth: '2024-01' })
  for (const context of [{}, { intent: 'UNKNOWN', month: '2024-02' }, { intent: 'SUMMARY', month: '2101-01' }, { intent: 'COMPARISON', month: '2024-02', compareMonth: '2024-02' }]) {
    assert.equal(validateAiChatRequest({ message: 'Còn kỳ đó?', month: '2026-11', context }).valid, false)
  }
})

test('NLU service POST gửi context hợp lệ và giữ timeout/AbortSignal', async () => {
  const abort = new AbortController(); let payload
  await sendAiChatMessage({ message: 'Còn tháng trước thì sao?', month: '2026-11', context: { intent: 'SUMMARY', month: '2024-02' } }, {
    signal: abort.signal,
    apiClient: { post: async (_, body, config) => { payload = body; assert.equal(config.signal, abort.signal); assert.equal(config.timeout, 35000); return { data: { ...p2Response('SUMMARY'), period: '2026-10' } } } },
  })
  assert.deepEqual(payload.context, { intent: 'SUMMARY', month: '2024-02' })
})

test('NLU controller nhớ kỳ phản hồi, chips động và gửi follow-up bằng context thay vì base picker', async () => {
  const storage = memory(); const store = createSessionStore(storage); store.authenticate(makeUser('A'), 0)
  const calls = []
  const controller = createAiChatController({ sessionStore: store, getDefaultMonth: () => '2026-11', sendChat: async payload => {
    calls.push(payload)
    return { ...p2Response('CATEGORIES'), comparison: null, period: calls.length === 1 ? '2024-02' : '2026-10' }
  } })
  await controller.askQuestion('Danh mục chi tháng 2/2024')
  assert.deepEqual(controller.getSnapshot().context, { intent: 'CATEGORIES', month: '2024-02' })
  const chips = getAiSuggestedQuestions(controller.getSnapshot())
  assert.ok(chips.includes('Còn tháng trước thì sao?'))
  assert.ok(chips.some(chip => chip.includes('02/2024')))
  await controller.askQuestion('Còn tháng trước thì sao?')
  assert.deepEqual(calls[1].context, { intent: 'CATEGORIES', month: '2024-02' })
  assert.equal(calls[1].compareMonth, undefined)
  assert.equal(controller.getSnapshot().context.month, '2026-10')
  assert.deepEqual([...storage.values.keys()].sort(), ['accessToken', 'currentUser'])
  controller.destroy()
})

test('NLU clear/logout/đổi A-B xóa context và abort không cho response cũ khôi phục', async () => {
  const store = createSessionStore(memory()); store.authenticate(makeUser('A'), 0)
  let finish, signal; let count = 0
  const controller = createAiChatController({ sessionStore: store, getDefaultMonth: () => '2026-11', sendChat: (_, config) => {
    if (++count === 1) return Promise.resolve(p2Response())
    signal = config.signal; return new Promise(resolve => { finish = resolve })
  } })
  await controller.askQuestion('So sánh')
  assert.ok(controller.getSnapshot().context.compareMonth)
  const old = controller.askQuestion('Còn tháng trước?')
  controller.clearConversation()
  assert.equal(controller.getSnapshot().context, null); assert.equal(signal.aborted, true)
  finish(p2Response()); await old
  assert.equal(controller.getSnapshot().context, null)
  const second = controller.askQuestion('So sánh')
  store.clear(); store.authenticate(makeUser('B'), store.getSnapshot().revision)
  assert.equal(signal.aborted, true); finish(p2Response()); await second
  assert.equal(controller.getSnapshot().context, null); assert.deepEqual(controller.getSnapshot().messages, [])
  controller.destroy()
})

test('NLU lỗi/Retry giữ context, UNKNOWN mới xóa context và trả ba gợi ý ban đầu', async () => {
  const store = createSessionStore(memory()); store.authenticate(makeUser('A'), 0)
  let count = 0; const calls = []
  const controller = createAiChatController({ sessionStore: store, getDefaultMonth: () => '2026-11', sendChat: async payload => {
    calls.push(payload); count++
    if (count === 2) throw { response: { status: 503 } }
    return count === 4 ? unknownResponse() : p2Response()
  } })
  await controller.askQuestion('So sánh')
  const context = controller.getSnapshot().context
  await controller.askQuestion('Còn kỳ đó?')
  assert.deepEqual(controller.getSnapshot().context, context)
  await controller.retryLastMessage()
  assert.deepEqual(calls[1], calls[2])
  await controller.askQuestion('Xin chào')
  assert.equal(controller.getSnapshot().context, null)
  assert.equal(getAiSuggestedQuestions(controller.getSnapshot()).length, 3)
  controller.destroy()
})

test('NLU chart số dư âm/zero không NaN và context UI dùng kỳ thành công gần nhất', () => {
  const data = p2Response(); data.comparison.base.balance = -10; data.comparison.target.balance = -20
  const html = render(AiStructuredResponseCard, { message: { ...normalizeAiChatResponse(data), role: 'assistant' } })
  assert.match(html, /Biểu đồ so sánh thu chi/); assert.doesNotMatch(html, /NaN|Infinity/)
  const panel = render(AiAssistantPanelView, { open: true, context: { intent: 'SUMMARY', month: '2024-02' } })
  assert.match(panel, /Ngữ cảnh hội thoại/); assert.match(panel, /Tháng 02\/2024/)
})
