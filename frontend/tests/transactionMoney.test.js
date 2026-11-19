import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, TransactionsPage
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  TransactionsPage = (await server.ssrLoadModule('/src/pages/Transactions.jsx')).TransactionsPage
})
after(async () => { await server?.close() })
for (const [amount, expected] of [[1.25, '1,25'], [200.1, '200,1'], [0.01, '0,01']]) {
  test(`D16 transaction desktop/mobile rows preserve ${amount}`, () => {
    const html = renderToStaticMarkup(createElement(TransactionsPage, {
      initialLoading: false,
      initialTransactions: [{ id: 1, type: 'EXPENSE', categoryId: 1, categoryName: 'Ăn uống',
        amount, transactionDate: '2026-11-17', note: 'D16 fractional expense' }],
    }))
    assert.equal(html.split('-' + expected).length - 1, 2, 'Expense amount appears in both responsive transaction views')
    assert.match(html, /D16 fractional expense/)
  })
}
