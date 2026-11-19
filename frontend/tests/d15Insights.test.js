import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import client from '../src/api/axiosClient.js'
import { calculateMonthlyDelta, loadDashboardMonths } from '../src/components/dashboard/monthlyInsights.js'
import { getBudgetDisplayStatus, getBudgetStatus, getBudgetRemaining, getBudgetUsagePercentage } from '../src/components/budget/categoryBudgetUtils.js'

let server, MonthlyDelta, BudgetUsage, CategoryBudgetCard, ReportsPage, MonthlyComparisonChart
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const success = (value) => ({ status: 'success', data: { totalIncome: value, totalExpense: value } })
const reportFor = (month, value = 10) => ({
  from: month, to: month,
  months: [{ month, totalIncome: value, totalExpense: value, balance: 0 }],
  expensesByCategory: [],
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
  })
  MonthlyDelta = (await server.ssrLoadModule('/src/components/dashboard/MonthlyDelta.jsx')).default
  BudgetUsage = (await server.ssrLoadModule('/src/components/budget/BudgetUsage.jsx')).default
  CategoryBudgetCard = (await server.ssrLoadModule('/src/components/budget/CategoryBudgetCard.jsx')).default
  ReportsPage = (await server.ssrLoadModule('/src/pages/Reports.jsx')).ReportsPage
  MonthlyComparisonChart = (await server.ssrLoadModule('/src/components/reports/MonthlyComparisonChart.jsx')).default
})
after(async () => { await server?.close() })

for (const [current, previous, delta, direction, percentage] of [
  [150, 100, 50, 'increase', 50],
  [50, 100, -50, 'decrease', -50],
  [100, 100, 0, 'unchanged', 0],
  [30, 0, 30, 'increase', null],
  [0, 0, 0, 'unchanged', null],
  [-30, 0, -30, 'decrease', null],
  [-50, -100, 50, 'increase', 50],
  [-150, -100, -50, 'decrease', -50],
  [0.3, 0.2, 0.1, 'increase', 50],
  [-0.05, 0.1, -0.15, 'decrease', -150],
]) {
  test(`D15 delta: ${current} so với ${previous}`, () => {
    assert.deepEqual(calculateMonthlyDelta(current, previous), { delta, direction, percentage })
  })
}

test('D15: tháng 01 gọi đúng Reports API cho tháng 12 năm trước và tháng đang chọn, giữ tiền lẻ', async () => {
  const original = client.defaults.adapter
  const calls = []
  client.defaults.adapter = async (config) => {
    calls.push(config)
    return { config, data: reportFor(config.params.from, 12.34), status: 200, statusText: 'OK', headers: {} }
  }
  try {
    const results = {}
    await loadDashboardMonths('2026-01', (key, result) => { results[key] = result }).done
    assert.equal(calls.length, 2)
    assert.ok(calls.every((call) => call.method === 'get' && call.url === '/reports/monthly'))
    assert.deepEqual(calls.map((call) => call.params), [
      { from: '2026-01', to: '2026-01' }, { from: '2025-12', to: '2025-12' },
    ])
    assert.equal(results.current.data.totalIncome, 12.34)
    assert.equal(results.previous.data.month, '2025-12')
  } finally { client.defaults.adapter = original }
})

test('D15: tháng trước đang tải rồi lỗi không chặn/xóa dữ liệu tháng hiện tại', async () => {
  const previous = deferred()
  const events = []
  const request = loadDashboardMonths('2026-01', (key, result) => events.push([key, result]),
    ({ from }) => from === '2026-01' ? Promise.resolve(reportFor(from)) : previous.promise)
  await Promise.resolve()
  assert.equal(events.length, 1)
  assert.equal(events[0][0], 'current')
  assert.equal(events[0][1].data.totalIncome, 10)
  previous.reject(new Error('Previous unavailable'))
  await request.done
  assert.equal(events[1][0], 'previous')
  assert.equal(events[1][1].status, 'error')
  assert.equal(events[0][1].status, 'success')
})

test('D15: lỗi tháng hiện tại độc lập với thành công tháng trước; không tạo số 0 giả', async () => {
  const results = {}
  await loadDashboardMonths('2026-01', (key, result) => { results[key] = result }, async ({ from }) => {
    if (from === '2026-01') throw new Error('Current unavailable')
    return reportFor(from)
  }).done
  assert.equal(results.current.status, 'error')
  assert.equal(results.current.data, undefined)
  assert.equal(results.previous.status, 'success')
})

for (const staleError of [false, true]) {
  test(`D15: đổi tháng nhanh chặn response cũ ${staleError ? 'error' : 'success'}, kể cả bỏ qua abort`, async () => {
    const old = deferred()
    const events = []
    const signals = []
    const first = loadDashboardMonths('2026-01', (key, result) => events.push([key, result]), (_, options) => {
      signals.push(options.signal)
      return old.promise
    })
    first.cancel()
    await loadDashboardMonths('2026-02', (key, result) => events.push([key, result]), async ({ from }) => reportFor(from, 20)).done
    if (staleError) old.reject(new Error('Late error'))
    else old.resolve(reportFor('2026-01'))
    await first.done
    assert.equal(signals.every((signal) => signal.aborted), true)
    assert.equal(events.length, 2)
    assert.ok(events.every(([, result]) => result.month === '2026-02' && result.status === 'success'))
  })
}

test('D15: response thiếu tháng yêu cầu là lỗi, không thay bằng dữ liệu rỗng thành công', async () => {
  const results = {}
  await loadDashboardMonths('2026-01', (key, result) => { results[key] = result }, async () => ({ months: [] })).done
  assert.equal(results.current.status, 'error')
  assert.equal(results.previous.status, 'error')
})

test('D15: kỳ 1900-01 giữ số liệu hiện tại khi tháng trước nằm ngoài miền API', async () => {
  const calls = []
  const results = {}
  await loadDashboardMonths('1900-01', (key, result) => { results[key] = result }, async ({ from }) => {
    calls.push(from)
    return reportFor(from)
  }).done
  assert.deepEqual(calls, ['1900-01'])
  assert.equal(results.current.status, 'success')
  assert.equal(results.previous.status, 'error')
})

for (const [spentAmount, status, label] of [
  [79.99, 'SAFE', 'Trong ngân sách'],
  [80, 'WARNING', 'Gần hết ngân sách'],
  [99.99, 'WARNING', 'Gần hết ngân sách'],
  [100, 'AT_LIMIT', 'Đã sử dụng hết ngân sách'],
  [100.01, 'OVER_BUDGET', 'Vượt ngân sách'],
]) {
  test(`D15 budget ${spentAmount}%: chung trạng thái/màu/aria trên Dashboard và danh mục`, () => {
    const budget = { amountLimit: 100, spentAmount, usagePercentage: Math.round(spentAmount), status: 'OVER_BUDGET' }
    assert.equal(getBudgetDisplayStatus(budget), status)
    assert.equal(getBudgetUsagePercentage(budget), spentAmount)
    for (const Component of [BudgetUsage, CategoryBudgetCard]) {
      const html = render(Component, { budget })
      assert.ok(html.includes(label))
      assert.ok(html.includes(`data-budget-status="${status}"`))
      assert.match(html, /role="progressbar"/)
      assert.match(html, /aria-valuemax="100"/)
      assert.match(html, /dark:/)
      if (status !== 'OVER_BUDGET') assert.doesNotMatch(html, /Vượt ngân sách|Chi vượt/)
    }
    const card = render(CategoryBudgetCard, { budget })
    if (status === 'OVER_BUDGET') assert.match(card, /ring-rose-400 dark:ring-rose-500/)
    else if (status !== 'SAFE') assert.match(card, /ring-amber-400 dark:ring-amber-500/)
    else assert.doesNotMatch(card, /ring-2 ring-amber|ring-2 ring-rose/)
    if (status === 'OVER_BUDGET') {
      assert.equal(getBudgetRemaining(budget), -0.01)
      assert.match(render(BudgetUsage, { budget }), /Số tiền vượt: 0,01/)
    }
  })
}

test('D15: ngưỡng 80% với tiền lẻ tránh sai số 0.05 * 0.8', () => {
  assert.equal(getBudgetDisplayStatus({ amountLimit: 0.05, spentAmount: 0.04 }), 'WARNING')
})

test('D15: NOT_SET khác hạn mức 0; enum Backend đúng 100% vẫn OVER_BUDGET', () => {
  assert.equal(getBudgetDisplayStatus(null), 'NOT_SET')
  assert.equal(getBudgetDisplayStatus(undefined), 'NOT_SET')
  assert.equal(getBudgetDisplayStatus({ amountLimit: 0, spentAmount: 0 }), 'AT_LIMIT')
  assert.equal(getBudgetDisplayStatus({ amountLimit: 0, spentAmount: 0.01 }), 'OVER_BUDGET')
  const atLimit = { amountLimit: 100, spentAmount: 100, status: 'OVER_BUDGET' }
  assert.equal(getBudgetStatus(atLimit), 'OVER_BUDGET')
  assert.equal(getBudgetDisplayStatus(atLimit), 'AT_LIMIT')
})

test('D15 MonthlyDelta: số tiền lẻ, tăng/giảm/không đổi và phần trăm khi có base', () => {
  for (const [current, previous, label] of [[0.3, 0.2, 'Tăng 0,1'], [0.1, 0.2, 'Giảm 0,1'], [0.2, 0.2, 'Không đổi 0']]) {
    const html = render(MonthlyDelta, { current: success(current), previous: success(previous), field: 'totalIncome', month: '2026-01' })
    assert.ok(html.includes(label))
    assert.match(html, /%/)
    assert.match(html, /12\/2025/)
    assert.match(html, /dark:text-slate-200/)
  }
})

test('D15 MonthlyDelta: base 0 hiển thị Mới phát sinh hoặc Không có dữ liệu kỳ trước, không có % giả', () => {
  for (const [current, label] of [[30, 'Mới phát sinh'], [0, 'Không có dữ liệu kỳ trước']]) {
    const html = render(MonthlyDelta, { current: success(current), previous: success(0), field: 'totalExpense', month: '2026-01' })
    assert.ok(html.includes(label))
    assert.doesNotMatch(html, /Infinity|NaN|%/)
  }
})

test('D15 MonthlyDelta: loading và error có Retry bàn phím, không hiển thị kết luận', () => {
  const loading = render(MonthlyDelta, { current: success(20), previous: { status: 'loading' } })
  assert.match(loading, /Đang tải so sánh/)
  const error = render(MonthlyDelta, { current: success(20), previous: { status: 'error' } })
  assert.match(error, /Không tải được dữ liệu so sánh/)
  assert.match(error, /<button type="button"/)
  assert.match(error, /focus-visible:/)
  assert.match(error, /dark:text-amber-300/)
  assert.doesNotMatch(error, /Tăng|Giảm|%/)
})

test('D15 Reports: toàn kỳ rỗng có empty state, không kết luận cân bằng/tiết kiệm', () => {
  const report = reportFor('2026-01', 0)
  const html = render(ReportsPage, { initialReport: report, initialLoading: false })
  assert.match(html, /Chưa có phát sinh thu – chi/)
  assert.doesNotMatch(html, /Thu – chi cân bằng|Tiết kiệm \d|recharts-responsive-container/)
  assert.match(html, /border-dashed border-border bg-muted/)
})

test('D15 Reports: loading/error ẩn số liệu và kết luận cũ dù còn report trong state', () => {
  for (const props of [{ initialLoading: true }, { initialLoading: false, initialError: 'Không tải được báo cáo' }]) {
    const html = render(ReportsPage, { initialReport: reportFor('2026-01', 12345.67), ...props })
    assert.doesNotMatch(html, /12\.345,67|Thu – chi cân bằng|recharts-responsive-container/)
  }
})

test('D15 Reports: bảng mobile cuộn ngang bằng bàn phím, giữ số tiền và Light/Dark', () => {
  const html = render(MonthlyComparisonChart, { report: reportFor('2026-01', 1234567890123.45) })
  assert.match(html, /overflow-x-auto/)
  assert.match(html, /tabindex="0"/)
  assert.match(html, /whitespace-nowrap/)
  assert.match(html, /min-w-\[520px\]/)
  assert.match(html, /1\.234\.567\.890\.123,45/)
  assert.match(html, /dark:bg-card/)
})

test('D15 Budgets: tiền lẻ của số vượt không bị làm tròn hoặc cắt trên mobile', () => {
  const html = render(CategoryBudgetCard, { budget: { categoryName: 'Đi lại', amountLimit: 100, spentAmount: 100.01 } })
  assert.match(html, /Chi vượt/)
  assert.match(html, /0,01/)
  assert.match(html, /grid-cols-1/)
  assert.match(html, /sm:grid-cols-3/)
  assert.match(html, /break-words/)
  assert.match(html, /-0,01/)
})
