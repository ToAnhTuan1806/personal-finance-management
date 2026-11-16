import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router'
import { createServer } from 'vite'
import { landingPreview } from '../src/components/dashboard/landingPreview.js'

test('landing sample ledger reconciles income, expense, balance, chart and budget', () => {
  const { transactions, totalIncome, totalExpense, balance, categoryExpenses, budget, savingRate } = landingPreview
  assert.equal(transactions.filter((item) => item.type === 'EXPENSE').reduce((sum, item) => sum + item.amount, 0), 4_850_000)
  assert.equal(totalExpense, 4_850_000)
  assert.equal(totalIncome, 15_000_000)
  assert.equal(balance, 10_150_000)
  assert.equal(categoryExpenses.reduce((sum, item) => sum + item.amount, 0), totalExpense)
  for (const category of categoryExpenses) {
    assert.equal(category.amount, transactions.filter((item) => item.type === 'EXPENSE' && item.categoryName === category.categoryName).reduce((sum, item) => sum + item.amount, 0))
  }
  assert.equal(budget.spentAmount, totalExpense)
  assert.equal(savingRate, balance / totalIncome * 100)
})

let server, MainLayout, Dashboard, AuthProvider, ThemeProvider, ToastProvider, session, navigation, Donut, BudgetUsage
const memory = new Map()
const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) }

before(async () => {
  globalThis.sessionStorage = storage
  globalThis.localStorage = storage
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  MainLayout = (await server.ssrLoadModule('/src/components/layout/MainLayout.jsx')).default
  Dashboard = (await server.ssrLoadModule('/src/pages/Dashboard.jsx')).default
  AuthProvider = (await server.ssrLoadModule('/src/contexts/AuthContext.jsx')).AuthProvider
  ThemeProvider = (await server.ssrLoadModule('/src/contexts/ThemeContext.jsx')).ThemeProvider
  ToastProvider = (await server.ssrLoadModule('/src/contexts/ToastContext.jsx')).ToastProvider
  session = (await server.ssrLoadModule('/src/auth/session.js')).session
  navigation = await server.ssrLoadModule('/src/components/layout/navigation.js')
  Donut = (await server.ssrLoadModule('/src/components/dashboard/ExpenseDonutChart.jsx')).default
  BudgetUsage = (await server.ssrLoadModule('/src/components/budget/BudgetUsage.jsx')).default
})
after(async () => {
  await server?.close()
  delete globalThis.sessionStorage
  delete globalThis.localStorage
})

function renderLayout(path = '/', content = createElement('p', null, 'PAGE_CONTENT')) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(ThemeProvider, null, createElement(ToastProvider, null, createElement(AuthProvider, null,
      createElement(Routes, null, createElement(Route, { element: createElement(MainLayout) },
        createElement(Route, { path, element: content }))))))))
}

test('guest landing renders auth links and sample ledger, with no app navigation or account badge', () => {
  session.clear()
  const html = renderLayout('/', createElement(Dashboard))
  assert.match(html, /aria-label="Điều hướng khách"/)
  assert.match(html, /href="\/login"/)
  assert.match(html, /href="\/register"/)
  for (const forbidden of ['smart-sidebar', 'Điều hướng mobile', 'Khách truy cập', 'Mở Quick Add', 'href="/transactions"']) assert.ok(!html.includes(forbidden), forbidden)
  assert.match(html, /Dữ liệu minh họa/)
  assert.match(html, /4\.850\.000/)
  assert.match(html, /role="progressbar"/)
  for (const transaction of landingPreview.transactions) assert.ok(html.includes(transaction.note.replace('&', '&amp;')))
})

test('signed-in shell has grouped sidebar, accessible icon links and unchanged mobile Quick Add route', () => {
  session.authenticate({ accessToken: 'TEST_ONLY', user: { id: 1, fullName: 'UI Test', email: 'ui@example.test' } }, session.getSnapshot().revision)
  memory.set('smartSidebarExpanded', 'false')
  const html = renderLayout('/transactions')
  const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))
  assert.ok(sidebar.includes('THEO DÕI') && sidebar.includes('CẤU HÌNH'))
  assert.ok(!sidebar.includes('href="/quick-add"') && !sidebar.includes('Ghi chép'))
  for (const item of navigation.sidebarNavigation) {
    assert.ok(sidebar.includes(`href="${item.path}"`))
    assert.ok(sidebar.includes(`aria-label="${item.label}"`) && sidebar.includes(`title="${item.label}"`))
    assert.equal(navigation.pageTitles[item.path], item.label)
  }
  assert.match(sidebar, /aria-current="page"/)
  assert.match(html, /href="\/quick-add"/)
  assert.match(html, /aria-label="Mở Quick Add"/)
  assert.match(html, /id="logout-btn"/)
  assert.match(html, /id="theme-toggle-btn"/)
  assert.ok(!html.includes('Điều hướng khách'))
  session.clear()
  assert.match(renderLayout(), /Điều hướng khách/)
})

test('reused preview widgets preserve empty states and accessible budget progress', () => {
  const empty = renderToStaticMarkup(createElement(Donut, { data: [] }))
  assert.match(empty, /Chưa có dữ liệu chi tiêu/)
  assert.ok(!empty.includes('NaN'))
  const budget = renderToStaticMarkup(createElement(BudgetUsage, { budget: landingPreview.budget }))
  const progress = Number(budget.match(/aria-valuenow="([^"]+)"/)[1])
  assert.ok(Math.abs(progress - 4_850_000 / 6_000_000 * 100) < 1e-10)
  assert.match(budget, /Gần hết ngân sách/)
})
