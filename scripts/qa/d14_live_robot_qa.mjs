import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(root, 'docs/qa/evidence/d14-db')
const fixture = path.join(root, 'scripts/qa/d14_live_robot_fixture.jsx')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(output, { recursive: true })

const results = [], consoleErrors = []
let browser, cdp, vite, chrome, profile

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map() }
  async connect() {
    this.ws = new WebSocket(this.url)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
      } else {
        for (const callback of this.listeners.get(message.method) || []) callback(message.params)
      }
    })
  }
  on(method, callback) {
    const items = this.listeners.get(method) || []
    items.push(callback)
    this.listeners.set(method, items)
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const value = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text)
    return value.result?.value
  }
  close() { this.ws?.close() }
}

async function wait(expression, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      if (await cdp.eval(`Boolean(${expression})`)) return
    } catch {}
    await sleep(80)
  }
  throw new Error(`Timeout waiting: ${expression}`)
}

async function check(id, work) {
  try {
    const detail = await work()
    results.push({ id, status: 'PASS', detail })
    console.log('[PASS]', id)
  } catch (error) {
    results.push({ id, status: 'FAIL', detail: String(error.message).slice(0, 700) })
    console.log('[FAIL]', id, String(error.message).slice(0, 160))
  }
}

async function screenshot(name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64'))
  return `${name}.png`
}

async function click(selector) {
  const point = await cdp.eval(`(() => {
    const el = document.querySelector('${selector}')
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  assert.ok(point, `Element not found: ${selector}`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await sleep(60)
}

async function open() {
  if (!await cdp.eval(`Boolean(document.querySelector('#ai-assistant-dialog'))`)) await click('#ai-assistant-launcher')
  await wait(`document.querySelector('#ai-assistant-dialog')`)
}

async function key(key, code, value) {
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : ''
  await cdp.send('Input.dispatchKeyEvent', {
    type: text ? 'keyDown' : 'rawKeyDown', key, code,
    windowsVirtualKeyCode: value, nativeVirtualKeyCode: value, modifiers: 0,
    ...(text ? { text, unmodifiedText: text } : {})
  })
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code,
    windowsVirtualKeyCode: value, nativeVirtualKeyCode: value, modifiers: 0
  })
}

async function prompt(text) {
  await open()
  await cdp.eval(`window.d14live.controller.askQuestion(${JSON.stringify(text)})`)
}

async function setViewport(width, height = 900) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
  await cdp.send('Emulation.setVisibleSize', { width, height })
  await sleep(100)
}

async function setTheme(theme) {
  await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-color-scheme', value: theme }] })
  await cdp.eval(`(() => {
    if ('${theme}' === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  })()`)
  await sleep(60)
}

async function robotReady() {
  await wait(`document.querySelector('#ai-assistant-launcher')`)
  // Trigger hover to load lazy Three.js chunk
  await cdp.eval(`document.querySelector('#ai-assistant-launcher').dispatchEvent(new Event('focus'))`)
  await wait(`document.querySelector('canvas[data-robot-canvas]')`, 12000)
  await sleep(500)
}

const spyScript = `(() => {
  const info = window.__d14Gpu = { created: 0, lost: 0, attempts: 0, drawCalls: 0 }
  const canvases = new Set()
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      info.attempts++
      if (new URLSearchParams(location.search).get('webgl') === 'off') return null
      const context = original.call(this, type, ...args)
      if (context && !canvases.has(this)) {
        canvases.add(this)
        info.created++
        this.addEventListener('webglcontextlost', () => info.lost++)
      }
      return context
    }
    return original.call(this, type, ...args)
  }
  for (const klass of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (klass) {
      for (const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
        const fn = klass.prototype[method]
        if (!fn) continue
        klass.prototype[method] = function(...args) {
          info.drawCalls++
          return fn.apply(this, args)
        }
      }
    }
  }
})()`

async function run() {
  console.log('=' .repeat(70))
  console.log('SE2-D14-DB: LIVE CHROME CDP & THREE.JS ROBOT QA')
  console.log('Connecting to Real Backend on http://127.0.0.1:8085')
  console.log('=' .repeat(70))

  const feRoot = 'F:/RikkeiEdu/personal-finance-management-FE/frontend'
  const { createServer } = await import(pathToFileURL(path.join(feRoot, 'node_modules/vite/dist/node/index.js')).href)
  const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/${fixture.replaceAll('\\','/')}"></script></body></html>`

  vite = await createServer({
    root: feRoot,
    configFile: path.join(feRoot, 'vite.config.js'),
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
      fs: { allow: [root, 'F:/RikkeiEdu'] },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8085',
          changeOrigin: true,
          headers: {
            origin: 'http://localhost:5173'
          }
        }
      }
    },
    plugins: [{
      name: 'd14-live-qa',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith('/__d14live.html')) {
            res.setHeader('Content-Type', 'text/html')
            res.end(await server.transformIndexHtml('/__d14live.html', html))
            return
          }
          next()
        })
      }
    }]
  })
  await vite.listen()
  console.log('Vite test server listening on http://127.0.0.1:5173')

  // Find Chrome executable
  const executable = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')
  ].filter(Boolean).find(p => fs.existsSync(p))

  assert.ok(executable, 'Installed Google Chrome not found')
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'se2-d14-live-chrome-'))
  chrome = spawn(executable, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' })

  let port
  for (let i = 0; i < 80; i++) {
    try {
      port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]
      break
    } catch {
      await sleep(100)
    }
  }
  assert.ok(port, 'Chrome CDP did not start')

  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  cdp = new CDP(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await cdp.connect()
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')

  cdp.on('Runtime.exceptionThrown', event => {
    const text = event.exceptionDetails.exception?.description || event.exceptionDetails.text
    consoleErrors.push(text)
  })
  cdp.on('Runtime.consoleAPICalled', event => {
    if (event.type === 'error') {
      consoleErrors.push(event.args.map(arg => arg.value || arg.description || '').join(' ').slice(0, 500))
    }
  })

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: spyScript })
  browser = await cdp.eval('navigator.userAgent')
  console.log('Connected to Google Chrome:', browser)

  // Navigate to Live Fixture
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/__d14live.html' })
  await wait(`document.querySelector('#root')`)
  await wait(`document.querySelector('#active-user')?.innerText === 'user_a@example.com'`, 10000)
  console.log('Authenticated with Backend as user_a@example.com')

  // 1. Robot WebGL IDLE State
  await check('CHROME-LIVE-WEBGL-IDLE', async () => {
    await setViewport(1440, 900)
    await setTheme('light')
    await robotReady()
    const state = await cdp.eval(`document.querySelector('#ai-assistant-launcher').dataset.robotState`)
    assert.equal(state, 'IDLE')
    const shot = await screenshot('live-idle-1440-light')
    const gpu = await cdp.eval(`window.__d14Gpu`)
    assert.ok(gpu.created >= 1, 'WebGL context was not created')
    return { state, screenshot: shot, gpu }
  })

  // 2. Robot LOADING -> SUCCESS with REAL Backend Response (BUDGET Intent with D14 advice)
  await check('CHROME-LIVE-LOADING-TO-SUCCESS-BUDGET', async () => {
    await prompt('Ngân sách tháng 10/2026')
    await wait(`document.querySelector('#ai-assistant-launcher').dataset.robotState === 'SUCCESS'`, 15000)
    const logText = await cdp.eval(`document.querySelector('[role=log]')?.innerText || ''`)
    assert.ok(logText.includes('Đã vượt hạn mức 2.500.000,00 ₫'), 'Response does not include exceeded amount')
    assert.ok(logText.includes('125,00%') || logText.includes('125%'), 'Response does not include 125%')
    const shot = await screenshot('live-budget-success-1440-light')
    return { state: 'SUCCESS', screenshot: shot }
  })

  // 3. D13 Comparison Chart with Real Backend Data
  await check('CHROME-LIVE-COMPARISON-CHART', async () => {
    await prompt('So sánh thu chi tháng 9 và tháng 10/2026')
    await wait(`document.querySelector('[aria-label="So sánh thu chi hai tháng"]')`, 15000)
    const logText = await cdp.eval(`document.querySelector('[role=log]')?.innerText || ''`)
    assert.ok(logText.includes('25,00%') || logText.includes('25%'), 'Comparison percentage not found')
    const shot = await screenshot('live-comparison-chart')
    return { screenshot: shot }
  })

  // 4. D13 Category Chart with Real Backend Data
  await check('CHROME-LIVE-CATEGORIES-CHART', async () => {
    await prompt('Danh mục chi tiêu tháng 10/2026')
    await wait(`document.querySelector('[role=log]').innerText.includes('Ăn uống')`, 15000)
    const shot = await screenshot('live-categories-chart')
    return { screenshot: shot }
  })

  // 5. Robot ERROR state and Retry recovery
  await check('CHROME-LIVE-ERROR-RETRY', async () => {
    await click('#qa-force-error')
    await prompt('Ngân sách tháng 10/2026')
    await wait(`document.querySelector('#ai-assistant-launcher').dataset.robotState === 'ERROR'`, 10000)
    const errShot = await screenshot('live-error-state')
    // Now clear forced error and click Retry
    await click('#qa-clear-error')
    await click('[role=alert] button')
    await wait(`document.querySelector('#ai-assistant-launcher').dataset.robotState === 'SUCCESS'`, 15000)
    const recShot = await screenshot('live-retry-recovery')
    return { errorScreenshot: errShot, recoveryScreenshot: recShot }
  })

  // 6. SVG Fallback when WebGL disabled (?webgl=off)
  await check('CHROME-LIVE-SVG-FALLBACK', async () => {
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/__d14live.html?webgl=off' })
    await wait(`document.querySelector('#ai-assistant-launcher')`)
    await cdp.eval(`document.querySelector('#ai-assistant-launcher').dispatchEvent(new Event('focus'))`)
    await sleep(600)
    const hasSvg = await cdp.eval(`Boolean(document.querySelector('#ai-assistant-launcher svg'))`)
    const canvasVisible = await cdp.eval(`document.querySelector('canvas[data-robot-canvas]')?.style.visibility === 'visible'`)
    assert.ok(hasSvg, 'SVG fallback was not rendered')
    assert.ok(!canvasVisible, 'Canvas should not be visible when WebGL is off')
    const shot = await screenshot('live-no-webgl-fallback')
    return { hasSvg, canvasVisible, screenshot: shot }
  })

  // 7. Context-lost SVG Fallback
  await check('CHROME-LIVE-CONTEXT-LOST-FALLBACK', async () => {
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/__d14live.html' })
    await wait(`document.querySelector('#active-user')?.innerText === 'user_a@example.com'`, 10000)
    await robotReady()
    await cdp.eval(`(() => {
      const canvas = document.querySelector('canvas[data-robot-canvas]')
      const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl')
      ctx?.getExtension('WEBGL_lose_context')?.loseContext()
    })()`)
    await sleep(400)
    const hasSvg = await cdp.eval(`Boolean(document.querySelector('#ai-assistant-launcher svg'))`)
    assert.ok(hasSvg, 'SVG fallback not shown after context lost')
    const shot = await screenshot('live-context-lost-fallback')
    return { hasSvg, screenshot: shot }
  })

  // 8. Reduced Motion
  await check('CHROME-LIVE-REDUCED-MOTION', async () => {
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/__d14live.html' })
    await wait(`document.querySelector('#active-user')?.innerText === 'user_a@example.com'`, 10000)
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await robotReady()
    const callsBefore = await cdp.eval(`window.__d14Gpu.drawCalls`)
    await sleep(500)
    const callsAfter = await cdp.eval(`window.__d14Gpu.drawCalls`)
    // With reduced motion, RAF is canceled, so draw calls do not continuously increment!
    const delta = callsAfter - callsBefore
    assert.ok(delta <= 2, `Expected stationary draw calls, got ${delta}`)
    const shot = await screenshot('live-reduced-motion')
    // Reset emulation
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [] })
    return { deltaDrawCalls: delta, screenshot: shot }
  })

  // 9. Responsive Viewports (5 viewports x 2 themes)
  const viewports = [320, 375, 430, 768, 1440]
  for (const width of viewports) {
    for (const theme of ['light', 'dark']) {
      await check(`CHROME-LIVE-RESPONSIVE-${width}-${theme}`, async () => {
        await setViewport(width, 850)
        await setTheme(theme)
        await sleep(150)
        const metrics = await cdp.eval(`(() => {
          const doc = document.documentElement
          const launcher = document.querySelector('#ai-assistant-launcher')?.getBoundingClientRect()
          const panel = document.querySelector('#ai-assistant-dialog')?.getBoundingClientRect()
          return {
            overflow: doc.scrollWidth > window.innerWidth,
            launcherVisible: Boolean(launcher && launcher.width >= 44 && launcher.height >= 44),
            panelWidth: panel ? panel.width : null,
          }
        })()`)
        assert.ok(!metrics.overflow, `Horizontal overflow detected at ${width}px`)
        assert.ok(metrics.launcherVisible, `Launcher not properly visible/sized at ${width}px`)
        const shot = await screenshot(`live-${width}-${theme}`)
        return { metrics, screenshot: shot }
      })
    }
  }

  // 10. Keyboard & Focus Navigation
  await check('CHROME-LIVE-KEYBOARD-FOCUS', async () => {
    await setViewport(1440, 900)
    await setTheme('light')
    const isOpen = await cdp.eval(`Boolean(document.querySelector('#ai-assistant-dialog'))`)
    if (isOpen) {
      await click('button[aria-label="Đóng trợ lý tài chính"]')
      await wait(`!document.querySelector('#ai-assistant-dialog')`)
    }
    await cdp.eval(`document.querySelector('#ai-assistant-launcher')?.focus()`)
    await wait(`document.activeElement.id === 'ai-assistant-launcher'`)
    // Enter opens panel
    await key('Enter', 'Enter', 13)
    await wait(`document.querySelector('#ai-assistant-dialog')`)
    assert.equal(await cdp.eval('document.activeElement.id'), 'ai-chat-input')
    // Escape closes panel
    await key('Escape', 'Escape', 27)
    await wait(`!document.querySelector('#ai-assistant-dialog') && document.activeElement.id === 'ai-assistant-launcher'`)
    // Space opens panel
    await key(' ', 'Space', 32)
    await wait(`document.querySelector('#ai-assistant-dialog')`)
    return { accessible: true }
  })

  // 11. Account A/B Separation in Live UI
  await check('CHROME-LIVE-ACCOUNT-ISOLATION', async () => {
    // Switch to User B
    await click('#qa-switch-b')
    await wait(`document.querySelector('#active-user')?.innerText === 'user_b@example.com'`, 10000)
    await sleep(400)
    // Check that chat log was cleared
    const logUserBBefore = await cdp.eval(`document.querySelector('[role=log]')?.innerText || ''`)
    assert.ok(!logUserBBefore.includes('2.500.000,00 ₫'), 'User A data leaked into User B session')
    // Send prompt as User B
    await prompt('Tổng thu chi tháng 10/2026')
    await wait(`document.querySelector('#ai-assistant-launcher').dataset.robotState === 'SUCCESS'`, 15000)
    const logUserB = await cdp.eval(`document.querySelector('[role=log]').innerText`)
    assert.ok(logUserB.includes('30.000.000,00 ₫'), 'User B income not found')
    assert.ok(logUserB.includes('500.000,00 ₫'), 'User B expense not found')
    assert.ok(!logUserB.includes('12.500.000,00 ₫'), 'User A expense leaked to User B')
    const shot = await screenshot('live-user-b-chat')
    // Switch back to User A
    await click('#qa-switch-a')
    await wait(`document.querySelector('#active-user')?.innerText === 'user_a@example.com'`, 10000)
    return { isolationPassed: true, screenshot: shot }
  })

  // 12. Drawer Pause Animation
  await check('CHROME-LIVE-DRAWER-PAUSES-RAF', async () => {
    await click('#qa-drawer')
    await wait(`document.querySelector('#qa-drawer-open')`)
    await sleep(200)
    const callsBefore = await cdp.eval(`window.__d14Gpu.drawCalls`)
    await sleep(400)
    const callsAfter = await cdp.eval(`window.__d14Gpu.drawCalls`)
    const delta = callsAfter - callsBefore
    assert.ok(delta <= 2, `Draw calls increased while drawer open: ${delta}`)
    await click('#qa-drawer') // Close drawer
    return { paused: true, delta }
  })

  // 13. Dispose on Unmount
  await check('CHROME-LIVE-DISPOSE-ON-UNMOUNT', async () => {
    await click('#qa-mount')
    await sleep(200)
    const canvasExists = await cdp.eval(`Boolean(document.querySelector('canvas[data-robot-canvas]'))`)
    assert.ok(!canvasExists, 'Canvas should not exist when unmounted')
    await click('#qa-mount') // Remount
    await wait(`document.querySelector('#ai-assistant-launcher')`)
    return { cleanlyDisposed: true }
  })

  // 14. JavaScript Console Error Check
  await check('CHROME-LIVE-JAVASCRIPT-CONSOLE', async () => {
    const unhandledErrors = consoleErrors.filter(e =>
      !e.includes('Simulated network error') &&
      !e.includes('webgl=off') &&
      !e.includes('WEBGL_lose_context') &&
      !e.includes('Error creating WebGL context') &&
      !e.includes('Failed to load resource')
    )
    assert.equal(unhandledErrors.length, 0, `Unexpected JS errors: ${unhandledErrors.join('; ')}`)
    return { clean: true, totalExceptions: consoleErrors.length }
  })

  const total = results.length
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = total - passed

  const summary = {
    timestamp: new Date().toISOString(),
    browser,
    backendUrl: 'http://127.0.0.1:8085',
    mode: 'Real Google Chrome headless + CDP + Live Spring Boot Backend + isolated MySQL',
    total,
    passed,
    failed,
    status: failed === 0 ? 'PASS' : 'FAIL',
    results
  }

  fs.writeFileSync(path.join(output, 'SE2-D14-DB_ROBOT_RESULTS.json'), JSON.stringify(summary, null, 2))
  console.log('=' .repeat(70))
  console.log(`SE2-D14-DB ROBOT QA FINISHED: ${passed}/${total} PASS (${failed} FAIL)`)
  console.log(`Results saved to: ${path.join(output, 'SE2-D14-DB_ROBOT_RESULTS.json')}`)
  console.log('=' .repeat(70))
}

try {
  await run()
} catch (err) {
  console.error('Fatal error during Chrome QA:', err)
  process.exitCode = 1
} finally {
  cdp?.close()
  chrome?.kill()
  await vite?.close()
  if (profile && path.basename(profile).startsWith('se2-d14-live-chrome-')) {
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
  }
}
