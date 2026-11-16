import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

let server, RollingNumber, formatMoney

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    // Expose the page's existing formatter only in this test server.
    plugins: [{
      name: 'dashboard-money-test',
      transform(code, id) {
        if (id.replaceAll('\\', '/').endsWith('/src/pages/Dashboard.jsx')) {
          return `${code}\nexport { formatMoney }`
        }
      },
    }],
  })
  RollingNumber = (await server.ssrLoadModule('/src/components/dashboard/RollingNumber.jsx')).default
  formatMoney = (await server.ssrLoadModule('/src/pages/Dashboard.jsx')).formatMoney
})
after(async () => { await server?.close() })

for (const [value, expected] of [
  [200.10, '200,1'], [120.10, '120,1'], [0.01, '0,01'],
  [-200.10, '-200,1'], [-120.10, '-120,1'], [-0.01, '-0,01'], [0, '0'],
]) {
  test(`Dashboard giữ tiền lẻ ${value} cho formatter và screen reader của RollingNumber`, () => {
    assert.equal(formatMoney(value).replace(/\s/g, ' '), `${expected} ₫`)
    const html = renderToStaticMarkup(createElement(RollingNumber, { value }))
    assert.ok(html.includes(`<span class="sr-only">${expected} ₫</span>`))
    assert.match(html, /aria-hidden="true"/)
    const withoutCurrency = renderToStaticMarkup(createElement(RollingNumber, { value, currency: false }))
    assert.ok(withoutCurrency.includes(`<span class="sr-only">${expected}</span>`))
    assert.doesNotMatch(withoutCurrency, /₫/)
  })
}
