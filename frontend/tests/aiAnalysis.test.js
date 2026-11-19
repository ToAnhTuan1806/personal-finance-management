import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { normalizeAiChatResponse, createAiChatController, getAiSuggestedQuestions } from '../src/services/aiChatService.js'
import { normalizeAiAnalysis } from '../src/services/aiAnalysis.js'
import { buildAnalysisTransactionLink, parseTransactionSearch } from '../src/utils/transactionLinks.js'
import { createSessionStore } from '../src/auth/session.js'

const insight = () => ({ kind: 'SPENDING_INSIGHT', status: 'READY', title: 'Vì sao chi tiêu thay đổi?',
  summary: 'Chi tiêu tăng 300.000,25 ₫ so với kỳ đối chiếu.', asOf: '2026-11-10', startDate: '2026-11-01', endDate: '2026-11-10',
  metrics: [{ label: 'Đã chi', value: 500000.5, format: 'MONEY' }, { label: 'Kỳ đối chiếu', value: 200000.25, format: 'MONEY' }, { label: 'Chênh lệch', value: 300000.25, format: 'MONEY' }],
  highlights: ['Khoản lớn cần rà soát.'], drivers: [{ categoryId: 7, categoryName: 'Ăn uống', previousAmount: 200000.25, currentAmount: 500000.5, delta: 300000.25 }],
  evidence: [{ id: 9, date: '2026-11-05', categoryName: 'Ăn uống', note: '<script>private note</script>', amount: 250000.25 }],
  transactionFilter: { startDate: '2026-11-01', endDate: '2026-11-10', categoryId: 7 }, assumptions: ['Chỉ theo sổ SmartExpense.'] })
const response = (a = insight()) => ({ reply: a.summary, period: '2026-11', intent: a.kind, stats: null, topCategories: [], budget: null, analysis: a })
let vite, Card, Page
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  Card = (await vite.ssrLoadModule('/src/components/ai/AiAssistantWidget.jsx')).AiStructuredResponseCard
  Page = (await vite.ssrLoadModule('/src/pages/Transactions.jsx')).TransactionsPage
})
after(async () => { await vite?.close() })
const render = (component, props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component, props)))

test('analysis response preserves exact cents, evidence and comparison dates', () => {
  const normalized = normalizeAiChatResponse(response())
  assert.equal(normalized.analysis.metrics[0].value, 500000.5)
  assert.equal(normalized.analysis.metrics[2].value, 300000.25)
  assert.equal(normalized.analysis.evidence[0].amount, 250000.25)
  assert.equal(normalized.suggestedExpense, undefined)
})
for (const [name, mutate] of [
  ['wrong kind', a => { a.kind = 'BUDGET_FORECAST' }],
  ['wrong status', a => { a.status = 'NEEDS_AMOUNT' }],
  ['invalid date', a => { a.endDate = '2026-11-31' }],
  ['other period', a => { a.startDate = '2026-10-01' }],
  ['unsafe number', a => { a.metrics[0].value = true }],
  ['non-finite metric', a => { a.metrics[0].value = 'Infinity' }],
  ['unsupported unit', a => { a.metrics[0].format = 'HTML' }],
  ['duplicate driver', a => { a.drivers.push(a.drivers[0]) }],
  ['negative evidence amount', a => { a.evidence[0].amount = -1 }],
  ['evidence outside period', a => { a.evidence[0].date = '2026-11-20' }],
  ['filter outside period', a => { a.transactionFilter.endDate = '2026-11-30' }],
  ['filter foreign driver', a => { a.transactionFilter.categoryId = 99 }],
  ['unbounded highlights', a => { a.highlights = ['a', 'b', 'c', 'd'] }],
]) test(`analysis validator rejects ${name}`, () => {
  const a = insight(); mutate(a)
  assert.throws(() => normalizeAiChatResponse({ ...response(), analysis: a }))
})

test('analysis cannot arrive under a legacy intent or carry an expense proposal', () => {
  assert.throws(() => normalizeAiChatResponse({ ...response(), intent: 'SUMMARY' }))
  assert.throws(() => normalizeAiChatResponse({ ...response(), suggestedExpense: { amount: 5 } }))
  assert.throws(() => normalizeAiChatResponse({ ...response(), stats: { totalExpense: 1 } }))
})

test('analysis card is short, escapes notes, collapses details and links to exact transaction filters', () => {
  const html = render(Card, { message: { role: 'assistant', ...normalizeAiChatResponse(response()) } })
  assert.match(html, /500\.000,5/); assert.match(html, /300\.000,25/)
  assert.match(html, /Cách tính và giới hạn/); assert.match(html, /Xem 1 giao dịch lớn liên quan/)
  assert.doesNotMatch(html, /<details[^>]*open/); assert.doesNotMatch(html, /<script>private/)
  assert.match(html, /&lt;script&gt;private note&lt;\/script&gt;/)
  assert.match(html, /startDate=2026-11-01&amp;endDate=2026-11-10&amp;type=EXPENSE&amp;categoryId=7/)
  assert.doesNotMatch(html, /Số liệu tổng hợp thu chi|Xác nhận lưu/)
})

test('simulation clearly stays read-only and renders negative remaining budget', () => {
  const a = { ...insight(), kind: 'PURCHASE_SIMULATION', title: 'Thử trước khi mua', evidence: [], drivers: [], transactionFilter: null,
    metrics: [{ label: 'Ước còn cuối tháng', value: -100.25, format: 'MONEY' }] }
  const normalized = normalizeAiAnalysis(a, a.kind, '2026-11')
  const html = render(Card, { message: { role: 'assistant', ...response(normalized) } })
  assert.match(html, /Chưa lưu giao dịch/); assert.match(html, /-100,25/)
  assert.doesNotMatch(html, /Xác nhận lưu|Ghi khoản chi mới/)
})

test('transaction links populate range rather than conflicting month filters', () => {
  const link = buildAnalysisTransactionLink(insight().transactionFilter)
  assert.equal(link, '/transactions?startDate=2026-11-01&endDate=2026-11-10&type=EXPENSE&categoryId=7')
  const entry = parseTransactionSearch(link.split('?')[1], '2026-12')
  assert.deepEqual(entry.filters, { month: '', type: 'EXPENSE', categoryId: '7' })
  assert.deepEqual(entry.dateRange, { startDate: '2026-11-01', endDate: '2026-11-10' })
  const html = render(Page, { search: link.split('?')[1], initialLoading: false })
  assert.match(html, /01\/11\/2026/); assert.match(html, /10\/11\/2026/)
})
for (const search of ['?startDate=2026-11-31&endDate=2026-12-01', '?startDate=2026-11-01', '?categoryId=-1', '?categoryId=1&categoryId=2', '?type=DELETE', '?month=2026-11&startDate=2026-11-01&endDate=2026-11-10']) {
  test(`unsafe transaction link falls back safely: ${search}`, () => {
    assert.deepEqual(parseTransactionSearch(search, '2026-12'), { filters: { month: '2026-12', type: '', categoryId: '' }, dateRange: { startDate: '', endDate: '' } })
  })
}

test('controller keeps analysis through close/reopen and never invokes createTransaction', async () => {
  const data = new Map()
  const store = createSessionStore({ getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) })
  store.authenticate({ accessToken: 'fixture-token', user: { id: 1, fullName: 'Fixture', email: 'fixture@example.test' } }, 0)
  let writes = 0
  const controller = createAiChatController({ sessionStore: store, initialMonth: '2026-11', sendChat: async () => normalizeAiChatResponse(response()), createTransaction: async () => { writes++ } })
  await controller.askQuestion('Vì sao tháng này tôi chi nhiều?')
  assert.equal(controller.getSnapshot().messages.at(-1).analysis.kind, 'SPENDING_INSIGHT')
  controller.closePanel(); controller.openPanel()
  assert.equal(controller.getSnapshot().messages.at(-1).analysis.metrics[2].value, 300000.25)
  assert.equal(writes, 0)
  controller.destroy()
})

test('new analysis capabilities are discoverable without fixed purchase amounts', () => {
  const questions = getAiSuggestedQuestions()
  assert.ok(questions.includes('Vì sao tháng này tôi chi nhiều?'))
  assert.ok(questions.includes('Dự báo ngân sách tháng này'))
  assert.ok(questions.includes('Thử mô phỏng một khoản mua'))
  assert.ok(questions.every(q => !/65k|1200k/.test(q)))
})
