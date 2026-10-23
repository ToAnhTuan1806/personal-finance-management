import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDailyCashFlow,
  formatCashFlowTick,
  loadMonthlyTransactions,
} from '../src/utils/cashFlow.js'

test('loads every page of the month, including early income beyond the latest 8 or 100 records', async () => {
  const transactions = Array.from({ length: 205 }, (_, index) => ({
    id: index + 1,
    type: index === 204 ? 'INCOME' : 'EXPENSE',
    amount: index === 204 ? '15500000.00' : '1000.50',
    transactionDate: index === 204 ? '2026-10-01' : '2026-10-23',
  }))
  const requestedPages = []
  const loaded = await loadMonthlyTransactions('2026-10', async params => {
    assert.equal(params.month, '2026-10')
    assert.equal(params.size, 100)
    requestedPages.push(params.page)
    return {
      content: transactions.slice(params.page * 100, (params.page + 1) * 100),
      totalPages: 3,
      totalElements: transactions.length,
    }
  })
  assert.deepEqual(requestedPages, [0, 1, 2])
  assert.deepEqual(loaded, transactions)
  const trend = buildDailyCashFlow('2026-10', loaded)
  assert.equal(trend.reduce((sum, day) => sum + day.income, 0), 15500000)
  assert.equal(trend.reduce((sum, day) => sum + day.expense, 0), 204102)
})

test('loads an empty month without additional page requests', async () => {
  let requests = 0
  const result = await loadMonthlyTransactions('2026-09', async () => {
    requests++
    return { content: [], totalPages: 0, totalElements: 0 }
  })
  assert.deepEqual(result, [])
  assert.equal(requests, 1)
})

test('does not return a partial month when a later page fails', async () => {
  await assert.rejects(loadMonthlyTransactions('2026-10', async ({ page }) => {
    if (page === 1) throw new Error('Network Error')
    return { content: [{ id: 1 }], totalPages: 2, totalElements: 2 }
  }), /Network Error/)
})

test('rejects invalid pagination or missing records rather than plotting incomplete totals', async () => {
  await assert.rejects(loadMonthlyTransactions('2026-10', async () => ({ content: null })), /không hợp lệ/)
  await assert.rejects(loadMonthlyTransactions('2026-10', async () => ({
    content: [], totalPages: 1, totalElements: 1,
  })), /đã thay đổi/)
  await assert.rejects(loadMonthlyTransactions('2026-10', async ({ page }) => ({
    content: page === 0 ? [{ id: 1 }] : [], totalPages: 2, totalElements: 2,
  })), /Không tải đủ/)
})

test('groups income and expenses by date with zeroes for days without transactions', () => {
  const trend = buildDailyCashFlow('2026-10', [
    { type: 'INCOME', amount: '15000000.00', transactionDate: '2026-10-01' },
    { type: 'INCOME', amount: '500000.00', transactionDate: '2026-10-15' },
    { type: 'EXPENSE', amount: '0.10', transactionDate: '2026-10-23' },
    { type: 'EXPENSE', amount: '0.20', transactionDate: '2026-10-23' },
    { type: 'EXPENSE', amount: '7000', transactionDate: '2026-09-30' },
  ])
  assert.equal(trend.length, 31)
  assert.deepEqual(trend[0], { date: '01/10', income: 15000000, expense: 0 })
  assert.deepEqual(trend[1], { date: '02/10', income: 0, expense: 0 })
  assert.equal(trend[14].income, 500000)
  assert.equal(trend[22].expense, 0.3)
  assert.deepEqual(trend[30], { date: '31/10', income: 0, expense: 0 })
})

test('supports a single transaction, empty months and leap years', () => {
  assert.deepEqual(buildDailyCashFlow('2026-10', []), [])
  const leap = buildDailyCashFlow('2024-02', [
    { type: 'EXPENSE', amount: 200000, transactionDate: '2024-02-29' },
  ])
  assert.equal(leap.length, 29)
  assert.equal(leap[28].expense, 200000)
  const normal = buildDailyCashFlow('2026-02', [
    { type: 'INCOME', amount: 1000000, transactionDate: '2026-02-01' },
  ])
  assert.equal(normal.length, 28)
})

test('formats nonzero sub-million axis labels without rounding them to 0tr', () => {
  for (const [value, label] of [
    [0, '0'], [500, '500'], [1000, '1k'], [100000, '100k'],
    [200000, '200k'], [125500, '125,5k'], [1000000, '1tr'],
    [1500000, '1,5tr'], [15500000, '15,5tr'], [-200000, '-200k'],
  ]) assert.equal(formatCashFlowTick(value), label)
})
