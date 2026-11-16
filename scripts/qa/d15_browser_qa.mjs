// Real Chromium + integrated React routes + proxy to disposable D15 Backend/MySQL.
// stdin contains ephemeral test JWT only; never persist it to evidence.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
let input = ''
for await (const chunk of process.stdin) input += chunk
const settings = JSON.parse(input)
input = ''
assert.match(settings.outputName || 'd15-20261116-r1', /^d15-[a-zA-Z0-9-]+$/)
const out = path.join(root, 'docs/qa/evidence', settings.outputName || 'd15-20261116-r1')
assert.match(settings.backend, /^http:\/\/127\.0\.0\.1:\d+$/)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const tests = [], errors = [], expectedNetworkErrors = []
let server, chrome, cdp, profile, injectedFault = false

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map() }
  async connect() {
    this.ws = new WebSocket(this.url)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', event => {
      const value = JSON.parse(String(event.data))
      if (value.id) {
        const pending = this.pending.get(value.id)
        if (!pending) return
        this.pending.delete(value.id)
        clearTimeout(pending.timer)
        value.error ? pending.reject(new Error(value.error.message)) : pending.resolve(value.result)
      } else for (const callback of this.listeners.get(value.method) || []) callback(value.params)
    })
  }
  on(name, fn) { this.listeners.set(name, [...(this.listeners.get(name) || []), fn]) }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout ${method}`)) }, 15000)
      this.pending.set(id, { resolve, reject, timer })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result?.value
  }
}

async function wait(expression, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try { if (await cdp.eval(`Boolean(${expression})`)) return } catch {}
    await sleep(100)
  }
  throw new Error(`Timeout: ${expression}`)
}

async function check(id, action) {
  try {
    tests.push({ id, status: 'PASS', detail: await action() })
  } catch (error) {
    tests.push({ id, status: error instanceof assert.AssertionError ? 'FAIL' : 'ERROR', detail: String(error.message).slice(0, 1500),
      observed: await cdp?.eval(`({route:location.pathname,text:document.body.innerText.slice(-3000)})`).catch(() => null) })
  }
  console.log(id, tests.at(-1).status)
}

async function click(selector) {
  const point = await cdp.eval(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
  assert.ok(point, `Missing ${selector}`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
}

async function select(selector, value) {
  await cdp.eval(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await sleep(100)
}

async function picker(selector, month) {
  await click(selector)
  await wait(`document.querySelector('[data-month-picker-locale] select')`)
  await select('[data-month-picker-locale] select', month.slice(0, 4))
  await click(`[data-month="${month}"]`)
  await wait(`!document.querySelector('[data-month-picker-locale]')`)
}

async function navigate(route, theme = 'light', owner = 'A') {
  const auth = settings.auth[owner]
  const script = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `sessionStorage.setItem('accessToken',${JSON.stringify(auth.accessToken)}); localStorage.setItem('smartExpenseTheme',${JSON.stringify(theme)});` })
  await cdp.send('Page.navigate', { url: server.resolvedUrls.local[0] + route })
  await wait(`document.querySelector('main') && !location.pathname.includes('/login')`)
  await sleep(300)
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier })
}

async function dashboardMonth(month) {
  await select('select[aria-label="Chọn tháng thống kê"]', month)
  await wait(`document.querySelectorAll('.se098-number > .sr-only').length>=3 && !document.body.innerText.includes('Đang tải so sánh')`)
  await sleep(200)
}

async function text() { return cdp.eval('document.body.innerText') }

async function reportRange(from, to) {
  await picker('#report-from-month', from)
  await picker('#report-to-month', to)
  await click('form[aria-label="Bộ lọc khoảng tháng báo cáo"] button[type="submit"]')
  await wait(`document.querySelector('table tbody tr') && !document.querySelector('button[type="submit"]:disabled')`)
  await sleep(300)
}

try {
  const { createServer } = await import(pathToFileURL(path.join(root, 'frontend/node_modules/vite/dist/node/index.js')))
  server = await createServer({ root: path.join(root, 'frontend'), configFile: path.join(root, 'frontend/vite.config.js'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: settings.backend } } } })
  await server.listen()
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'se-d15-chrome-'))
  const executable = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  assert.ok(fs.existsSync(executable), 'Chrome not installed')
  chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  const activePort = path.join(profile, 'DevToolsActivePort')
  for (let i = 0; i < 150 && !fs.existsSync(activePort); i++) await sleep(100)
  assert.ok(fs.existsSync(activePort), 'Chrome did not start')
  const debugPort = fs.readFileSync(activePort, 'utf8').split('\n')[0]
  const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
  cdp = new CDP(pages.find(p => p.type === 'page').webSocketDebuggerUrl)
  await cdp.connect()
  await cdp.send('Page.enable')
  const browserVersion = await cdp.send('Browser.getVersion')
  settings.browserVersion = browserVersion.product
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  cdp.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text))
  cdp.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push(p.args.map(a => a.value || a.description).join(' ').slice(0, 500)) })
  cdp.on('Log.entryAdded', p => {
    if (p.entry.level !== 'error') return
    const item = { text: p.entry.text, url: p.entry.url }
    if (/404/.test(item.text) && /\/api\/budgets\//.test(item.url || '')) expectedNetworkErrors.push({ ...item, reason: 'NOT_SET returns 404 by contract' })
    else if (injectedFault && /500|ERR_FAILED/.test(item.text)) expectedNetworkErrors.push({ ...item, reason: 'deliberate fault injection' })
    else errors.push(item)
  })
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(profile, 'downloads') })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })

  await check('UI-DASHBOARD-CURRENT-DELTA', async () => {
    await navigate('dashboard')
    await dashboardMonth('2026-11')
    const statuses = await cdp.eval(`[...document.querySelectorAll('p[role="status"]')].map(e=>e.textContent)`)
    assert.ok(statuses.some(t => t.includes('7.919,99') && t.includes('Giảm')), JSON.stringify(statuses))
    assert.ok(statuses.some(t => t.includes('Không đổi')), JSON.stringify(statuses))
    return { month: '2026-11', statuses }
  })
  await check('UI-DASHBOARD-CENTS', async () => {
    const kpi = await cdp.eval(`[...document.querySelectorAll('.se098-number > .sr-only')].slice(0,3).map(e=>e.textContent)`)
    const expected = ['200,1 ₫', '80 ₫', '120,1 ₫']
    assert.deepEqual(kpi.map(s => s.replace(/\u00a0/g, ' ')), expected, `Expected exact 200.10/80.00/120.10; actual ${JSON.stringify(kpi)}`)
    return { kpi }
  })
  await check('UI-DASHBOARD-BASE-ZERO', async () => {
    await dashboardMonth('2026-09')
    const t = await text()
    assert.ok(t.includes('Mới phát sinh') && !t.includes('Infinity') && !t.includes('NaN'))
    return { statuses: await cdp.eval(`[...document.querySelectorAll('p[role="status"]')].map(e=>e.textContent)`) }
  })
  await check('UI-DASHBOARD-EMPTY-MONTH', async () => {
    await dashboardMonth('2026-08')
    const values = await cdp.eval(`[...document.querySelectorAll('.se098-number > .sr-only')].slice(0,3).map(e=>e.textContent)`)
    assert.ok(values.every(v => v === '0 ₫'), JSON.stringify(values))
    const t = await text()
    assert.ok(t.includes('Không có dữ liệu kỳ trước') && t.includes('Chưa có ngân sách'))
    return { values, baseZero: true, budget: 'NOT_SET' }
  })
  await check('UI-DASHBOARD-RAPID-MONTH', async () => {
    // Hold old October responses to ensure they cannot overwrite final November.
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*api/reports/monthly*', requestStage: 'Request' }] })
    const held = []
    cdp.on('Fetch.requestPaused', p => {
      if (p.request.url.includes('from=2026-09')) held.push(p.requestId)
      else cdp.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {})
    })
    await select('select[aria-label="Chọn tháng thống kê"]', '2026-10')
    await select('select[aria-label="Chọn tháng thống kê"]', '2026-11')
    assert.ok(held.length > 0, 'Race control did not intercept the old response')
    for (const requestId of held) await cdp.send('Fetch.continueRequest', { requestId }).catch(() => {})
    await cdp.send('Fetch.disable')
    await wait(`document.querySelector('select[aria-label="Chọn tháng thống kê"]').value==='2026-11' && document.querySelectorAll('.se098-number > .sr-only').length>=3`)
    await sleep(300)
    const values = await cdp.eval(`[...document.querySelectorAll('.se098-number > .sr-only')].map(e=>e.textContent)`)
    assert.ok(values[1].includes('80') && !values[1].includes('8.000'), JSON.stringify(values))
    return { selected: '2026-11', values }
  })
  await check('UI-DASHBOARD-LOADING-ERROR-RETRY', async () => {
    injectedFault = true
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*api/reports/monthly*', requestStage: 'Request' }] })
    const held = []
    // Replace previous listener for this controlled scenario.
    cdp.listeners.set('Fetch.requestPaused', [p => held.push(p.requestId)])
    await select('select[aria-label="Chọn tháng thống kê"]', '2026-10')
    await wait(`document.body.innerText.includes('Đang tải so sánh')`)
    for (let i = 0; i < 20 && held.length < 2; i++) await sleep(50)
    for (const requestId of held) await cdp.send('Fetch.fulfillRequest', { requestId, responseCode: 500,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"status":500,"code":"INTERNAL_ERROR","message":"D15 QA injected error"}').toString('base64') })
    await cdp.send('Fetch.disable')
    await wait(`document.body.innerText.includes('Không tải được dữ liệu so sánh tháng trước')`)
    assert.ok(await cdp.eval(`Boolean(document.querySelector('[aria-label="Chưa tải được tổng thu"]'))`))
    await cdp.eval(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Thử lại so sánh')).click()`)
    await wait(`document.querySelectorAll('.se098-number > .sr-only').length>=3 && !document.body.innerText.includes('Đang tải so sánh')`)
    return { loadingObserved: true, errorObserved: true, retryRecovered: true, transport: 'CDP injected 500 only in this case' }
  })

  const states = [['2026-09', 'SAFE', 'Trong ngân sách'], ['2026-10', 'SAFE', 'Trong ngân sách'],
    ['2026-11', 'WARNING', 'Gần hết ngân sách'], ['2026-12', 'AT_LIMIT', 'Đã sử dụng hết ngân sách'],
    ['2027-01', 'OVER_BUDGET', 'Vượt ngân sách'], ['2027-02', 'NOT_SET', 'Chưa thiết lập']]
  await navigate('budgets')
  for (const [month, state, label] of states) await check('UI-BUDGET-' + state + '-' + month, async () => {
    await picker('[data-month-picker-trigger]', month)
    await wait(`!document.body.innerText.includes('Đang tải ngân sách')`)
    await sleep(400)
    const t = await text()
    const bars = await cdp.eval(`[...document.querySelectorAll('[role="progressbar"]')].map(e=>({min:e.getAttribute('aria-valuemin'),max:e.getAttribute('aria-valuemax'),now:e.getAttribute('aria-valuenow'),text:e.getAttribute('aria-valuetext')}))`)
    assert.ok(t.includes(label), `${month}: expected ${label}; ${t.slice(0, 1800)}`)
    if (state === 'NOT_SET') assert.equal(bars.length, 0)
    else {
      assert.ok(bars.length >= 2 && bars.every(b => b.min === '0' && b.max === '100' && Number(b.now) >= 0 && Number(b.now) <= 100 && b.text))
      assert.ok(await cdp.eval(`Boolean(document.querySelector('[data-budget-status="${state}"]'))`), 'Category card status differs')
    }
    if (state === 'AT_LIMIT') assert.ok(!t.includes('Bạn đã chi vượt'))
    if (state === 'OVER_BUDGET') assert.ok(t.includes('0,01'), 'Expected exact overspent 0.01')
    if (month === '2026-10') assert.ok(!t.includes('Gần hết ngân sách'), 'Rounded 80% incorrectly changes state')
    return { month, state, progress: bars, text: t.slice(-2500) }
  })

  await check('UI-REPORTS-YEAR-CHART-TABLE-CSV', async () => {
    await navigate('reports')
    await wait(`document.querySelector('table tbody tr')`)
    await reportRange('2026-12', '2027-02')
    const rows = await cdp.eval(`[...document.querySelectorAll('table')][0].innerText`)
    for (const amount of ['120,4', '120,41', '79,69']) assert.ok(rows.includes(amount), `Missing ${amount}: ${rows}`)
    assert.ok(rows.includes('02/2027') && rows.includes('01/2027') && rows.includes('12/2026'), rows)
    assert.ok(await cdp.eval(`document.querySelectorAll('.recharts-surface').length>0`), 'No chart SVG')
    await cdp.eval(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('CSV')).click()`)
    const downloads = path.join(profile, 'downloads')
    for (let i = 0; i < 80 && (!fs.existsSync(downloads) || !fs.readdirSync(downloads).some(f => f.endsWith('.csv'))); i++) await sleep(100)
    const file = fs.readdirSync(downloads).find(f => f.endsWith('.csv'))
    assert.ok(file, 'No CSV download')
    const csv = fs.readFileSync(path.join(downloads, file), 'utf8')
    for (const value of ['100.10', '20.05', '0.25', '120.41']) assert.ok(csv.includes(value), `CSV missing ${value}`)
    assert.ok(!csv.includes('999999'), 'CSV owner leak')
    return { rows, chart: true, csvDownloaded: true, csvBytes: Buffer.byteLength(csv) }
  })
  await check('UI-REPORTS-EMPTY-MONTH', async () => {
    await reportRange('2027-02', '2027-02')
    const t = await text()
    assert.ok(t.includes('Chưa có') || t.includes('không có'), t.slice(-1500))
    assert.ok(!t.includes('NaN') && !t.includes('Infinity'))
    return { text: t.slice(-1800) }
  })
  for (const width of [360, 390, 1280]) for (const theme of ['light', 'dark']) for (const route of ['dashboard', 'reports', 'budgets']) {
    await check(`UI-LAYOUT-${route}-${width}-${theme}`, async () => {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
      await navigate(route, theme)
      await wait(route === 'dashboard' ? `document.querySelectorAll('.se098-number > .sr-only').length>=3` : route === 'reports' ? `document.querySelector('table tbody tr')` : `document.querySelector('[role="progressbar"]')`)
      const layout = await cdp.eval(`({viewport:innerWidth,scroll:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,main:!!document.querySelector('main')})`)
      assert.equal(layout.theme, theme)
      assert.ok(layout.scroll <= width + 1, JSON.stringify(layout))
      return layout
    })
  }
  await check('UI-KEYBOARD-FOCUS-PICKER', async () => {
    await navigate('budgets')
    await wait(`document.querySelector('[data-month-picker-trigger]')`)
    await cdp.eval(`document.querySelector('[data-month-picker-trigger]').focus()`)
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) })
    await wait(`document.querySelector('[data-month-picker-locale]')`)
    await wait(`document.querySelector('[data-month-picker-locale]').contains(document.activeElement)`)
    const inside = await cdp.eval(`document.querySelector('[data-month-picker-locale]').contains(document.activeElement)`)
    assert.ok(inside, 'Picker did not receive keyboard focus')
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await wait(`!document.querySelector('[data-month-picker-locale]')`)
    await wait(`document.activeElement.matches('[data-month-picker-trigger]')`)
    assert.ok(await cdp.eval(`document.activeElement.matches('[data-month-picker-trigger]')`), 'Focus not restored')
    return { enterOpened: true, focusInside: inside, escapeClosed: true, focusRestored: true }
  })
  await check('UI-OWNER-B-THEN-A', async () => {
    await navigate('dashboard', 'light', 'B')
    await dashboardMonth('2026-11')
    const b = await cdp.eval(`[...document.querySelectorAll('.se098-number > .sr-only')].map(e=>e.textContent)`)
    assert.ok(b[0].includes('10.000.000') && b[1].includes('1.000.000'), JSON.stringify(b))
    await navigate('dashboard', 'light', 'A')
    await dashboardMonth('2026-11')
    const a = await cdp.eval(`[...document.querySelectorAll('.se098-number > .sr-only')].map(e=>e.textContent)`)
    assert.ok(a[1].includes('80') && !a.some(t => t.includes('1.000.000')), JSON.stringify(a))
    return { b, a, note: 'Owner totals rounded by existing Dashboard; exactness tested separately' }
  })
  await check('UI-CONSOLE-UNEXPECTED-ERRORS', async () => { assert.equal(errors.length, 0, JSON.stringify(errors)); return { count: 0, expectedNetworkErrors } })
} catch (error) {
  tests.push({ id: 'BROWSER-ENVIRONMENT', status: 'BLOCKED', detail: String(error.message).slice(0, 1500) })
} finally {
  fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ baseline: '4650bd9dd8c5d150b3fb25aa40913ac13784faf5',
    browserVersion: settings.browserVersion,
    mode: 'Real Chrome headless, integrated app, live loopback API/MySQL; only error/race cases use CDP transport control',
    tests, counts: Object.fromEntries(['PASS', 'FAIL', 'ERROR', 'BLOCKED', 'SKIPPED'].map(s => [s, tests.filter(t => t.status === s).length])),
    errors, expectedNetworkErrors, printPdf: 'NOT_APPLICABLE: no print/PDF UI implemented' }, null, 2))
  if (cdp) { await cdp.send('Browser.close').catch(() => {}); cdp.ws.close() }
  chrome?.kill()
  await server?.close()
  // This is the fresh mkdtemp directory above, never a user browser profile.
  if (profile && path.dirname(profile) === os.tmpdir() && path.basename(profile).startsWith('se-d15-chrome-')) {
    for (let i = 0; i < 10; i++) { try { fs.rmSync(profile, { recursive: true }); break } catch { await sleep(300) } }
  }
}
