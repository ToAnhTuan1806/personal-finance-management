import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

// Real Chrome through CDP, expressly authorized for D14. No Playwright dependency.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(root, 'docs/qa/evidence/d14-fe')
const fixture = path.join(root, 'scripts/qa/d14_robot_fixture.jsx')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(output, { recursive: true })
const results = [], consoleErrors = [], requests = []
let browser, cdp, vite, chrome, profile

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map() }
  async connect() {
    this.ws = new WebSocket(this.url)
    await new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }) })
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
      } else for (const callback of this.listeners.get(message.method) || []) callback(message.params)
    })
  }
  on(method, callback) { const items = this.listeners.get(method) || []; items.push(callback); this.listeners.set(method, items) }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })) })
  }
  async eval(expression) {
    const value = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text)
    return value.result?.value
  }
  close() { this.ws?.close() }
}
async function wait(expression, timeout = 12000) {
  const started = Date.now()
  while (Date.now() - started < timeout) { try { if (await cdp.eval(`Boolean(${expression})`)) return } catch {} await sleep(80) }
  throw new Error(`Timeout waiting: ${expression}`)
}
async function check(id, work) {
  try { const detail = await work(); results.push({ id, status: 'PASS', detail }); console.log('PASS', id) }
  catch (error) { results.push({ id, status: 'FAIL', detail: String(error.message).slice(0, 700) }); console.log('FAIL', id, String(error.message).slice(0, 160)) }
}
async function screenshot(name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64'))
  return `${name}.png`
}
async function click(selector) {
  const point = await cdp.eval(`(() => {
    const element=document.querySelector(${JSON.stringify(selector)});
    if(!element)throw new Error('Missing click target');
    const rect=element.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    const hit=document.elementFromPoint(x,y);
    return {x,y,width:rect.width,height:rect.height,hit:Boolean(hit&&(hit===element||element.contains(hit)))};
  })()`)
  assert.ok(point.width>0&&point.height>0&&point.hit, `Pointer target is hidden/covered: ${selector}`)
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y})
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1})
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1})
}
async function key(key, code, value) {
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : ''
  await cdp.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code,
    windowsVirtualKeyCode: value, nativeVirtualKeyCode: value, modifiers: 0,
    ...(text ? { text, unmodifiedText: text } : {}) })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code,
    windowsVirtualKeyCode: value, nativeVirtualKeyCode: value, modifiers: 0 })
}

async function navigate(query = '') {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:5184/__d14qa.html${query}` })
  await wait(`document.querySelector('#ai-assistant-launcher') && window.d14qa`)
}
async function robotReady() {
  await wait(`document.querySelector('[data-robot-canvas]')?.style.visibility === 'visible'`)
  assert.equal(await cdp.eval('window.__d14Gpu.created'), 1)
}
async function open() {
  if (!await cdp.eval(`Boolean(document.querySelector('#ai-assistant-dialog'))`)) await click('#ai-assistant-launcher')
  await wait(`document.querySelector('#ai-assistant-dialog')`)
}
async function prompt(text) {
  await cdp.eval(`(() => { const input = document.querySelector('#ai-chat-input'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await click('#ai-chat-send-btn')
}
function response(payload) {
  const period = /2\/2024/.test(payload.message) ? '2024-02' : payload.month
  const stats = { totalIncome: 1500.10, totalExpense: 800.20, balance: 699.90 }
  const isComparison = /so sánh|xu hướng/i.test(payload.message)
  const base = { totalIncome: 1000, totalExpense: 400.10, balance: 599.90 }
  return {
    reply: 'D14 synthetic HTTP response. Đây là dữ liệu fixture để kiểm tra robot và giữ nguyên giao diện D13.', period,
    intent: isComparison ? 'CATEGORY_TREND' : 'SUMMARY', stats, topCategories: [], budget: null,
    ...(isComparison ? { comparison: {
      baseMonth: payload.compareMonth || '2026-10', targetMonth: period, base, target: stats,
      delta: { totalIncome: 500.10, totalExpense: 400.10, balance: 100 }, expenseChangePercent: 100,
      categoryTrends: [{ categoryId: 1, categoryName: 'Ăn uống và chi phí sinh hoạt có tên dài để kiểm tra xuống dòng', baseExpense: 400.10, targetExpense: 800.20, delta: 400.10, changePercent: 100 }],
    } } : {}),
  }
}
const instrumentation = `(() => {
  const info = window.__d14Gpu = { created: 0, lost: 0, drawCalls: 0, attempts: 0 };
  const canvases = new WeakSet(); const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      info.attempts++;
      if (new URLSearchParams(location.search).get('webgl') === 'off') return null;
      const context = original.call(this, type, ...args);
      if (context && !canvases.has(this)) { canvases.add(this); info.created++; this.addEventListener('webglcontextlost', () => info.lost++); }
      return context;
    }
    return original.call(this, type, ...args);
  };
  for (const klass of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (klass) {
    for (const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
      const fn = klass.prototype[method]; if (!fn) continue;
      klass.prototype[method] = function(...args) { info.drawCalls++; return fn.apply(this, args); };
    }
  }
})();`

async function run() {
  const { createServer } = await import(pathToFileURL(path.join(root, 'frontend/node_modules/vite/dist/node/index.js')).href)
  const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/${fixture.replaceAll('\\','/')}"></script></body></html>`
  vite = await createServer({
    root: path.join(root, 'frontend'), configFile: path.join(root, 'frontend/vite.config.js'),
    server: { host: '127.0.0.1', port: 5184, strictPort: true, fs: { allow: [root] } },
    plugins: [{ name: 'd14-qa-only', configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/__d14qa.html')) { res.setHeader('Content-Type','text/html'); res.end(await server.transformIndexHtml('/__d14qa.html', html)); return }
        if (!req.url?.startsWith('/__d14mock/api/ai/chat')) return next()
        let raw = ''; for await (const chunk of req) raw += chunk
        const payload = JSON.parse(raw || '{}')
        requests.push({ method: req.method, route: '/__d14mock/api/ai/chat', keys: Object.keys(payload), outcome: req.url.includes('outcome=error') ? 'error' : 'success' })
        await sleep(1500)
        res.setHeader('Content-Type', 'application/json')
        if (req.url.includes('outcome=error')) { res.statusCode = 503; res.end(JSON.stringify({ status: 503, code: 'AI_UNAVAILABLE', message: 'Synthetic upstream unavailable' })) }
        else res.end(JSON.stringify(response(payload)))
      })
    } }],
  })
  await vite.listen()
  const executable = [process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')].filter(Boolean).find(p => fs.existsSync(p))
  assert.ok(executable, 'Installed Google Chrome not found')
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'se2-d14-chrome-'))
  chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let port
  for (let i=0;i<80;i++) { try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break } catch { await sleep(100) } }
  assert.ok(port, 'Chrome CDP did not start')
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  cdp = new CDP(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await cdp.connect(); await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Network.enable')
  cdp.on('Runtime.exceptionThrown', event => consoleErrors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text))
  cdp.on('Runtime.consoleAPICalled', event => { if (event.type === 'error') consoleErrors.push(event.args.map(arg => arg.value || arg.description || '').join(' ').slice(0,500)) })
  browser = await cdp.send('Browser.getVersion')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await navigate()
  await check('CHROME-WEBGL-IDLE', async () => { await robotReady(); assert.equal(await cdp.eval(`document.querySelector('#ai-assistant-launcher').dataset.robotState`), 'IDLE'); await screenshot('idle-1440-light'); return await cdp.eval(`({gpu:__d14Gpu,renderer:document.querySelector('canvas[data-robot-canvas]').getContext('webgl2').getParameter(7937)})`) })
  await check('CHROME-LOADING-SUCCESS-REAL-CONTROLLER', async () => {
    await open(); assert.equal(await cdp.eval('document.activeElement.id'), 'ai-chat-input')
    await prompt('Tổng chi tháng này bao nhiêu?'); await wait(`document.querySelector('#ai-assistant-launcher').dataset.robotState==='LOADING'`)
    await screenshot('loading-1440-light'); assert.equal(await cdp.eval('d14qa.snapshot().loading'), true)
    await wait(`document.querySelector('#ai-assistant-launcher').dataset.robotState==='SUCCESS'`)
    assert.equal(await cdp.eval('d14qa.getCalls()'),1); assert.equal(await cdp.eval('d14qa.snapshot().messages.length'),2)
    return { screenshot: await screenshot('success-1440-light'), localHttpRequests: 1 }
  })
  await check('CHROME-ERROR-RETRY', async () => {
    await click('#qa-error'); await prompt('Ngân sách tháng này?')
    await wait(`document.querySelector('#ai-assistant-launcher').dataset.robotState==='ERROR'`)
    assert.ok(await cdp.eval(`document.querySelector('[role=alert]').innerText.includes('Thử lại')`))
    await screenshot('error-1440-light'); const count = await cdp.eval('d14qa.snapshot().messages.filter(m=>m.role==="user").length')
    await click('#qa-success'); await click('[role=alert] button'); await wait(`document.querySelector('#ai-assistant-launcher').dataset.robotState==='SUCCESS'`)
    assert.equal(await cdp.eval('d14qa.snapshot().messages.filter(m=>m.role==="user").length'),count)
  })
  await check('CHROME-NLU-PERIOD-FROM-RESPONSE', async () => { await prompt('Tổng chi tháng 2/2024?'); await wait(`d14qa.snapshot().context?.month==='2024-02'`); assert.ok(await cdp.eval(`document.querySelector('[role=log]').innerText.includes('2024-02')`)) })
  await check('CHROME-COMPARISON-CHARTS', async () => { await prompt('So sánh thu chi'); await wait(`document.querySelector('[aria-label="So sánh thu chi hai tháng"]')`); assert.ok(await cdp.eval(`document.querySelector('[role=log]').innerText.includes('100,00%') || document.querySelector('[role=log]').innerText.includes('100%')`)); return { screenshot: await screenshot('comparison-chart') } })
  for (const width of [320,375,430,768,1440]) for (const theme of ['light','dark']) await check(`CHROME-RESPONSIVE-${width}-${theme}`, async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 })
    await cdp.eval(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`); await sleep(100)
    const metrics = await cdp.eval(`(() => {
      const button=document.querySelector('#ai-assistant-launcher'), panel=document.querySelector('#ai-assistant-dialog'), nav=document.querySelector('nav[aria-label="Điều hướng mobile"]'), log=panel.querySelector('[role=log]');
      const rect=x=>({top:x.top,right:x.right,bottom:x.bottom,left:x.left,width:x.width,height:x.height});
      return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth||panel.scrollWidth>panel.clientWidth||log.scrollWidth>log.clientWidth,launcher:rect(button.getBoundingClientRect()),panel:rect(panel.getBoundingClientRect()),nav:rect(nav.getBoundingClientRect()),targets:[...panel.querySelectorAll('button,a')].map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height})),canvasVisible:getComputedStyle(document.querySelector('[data-robot-canvas]')).visibility};
    })()`)
    assert.equal(metrics.overflow,false); assert.ok(metrics.panel.top>=0); assert.ok(metrics.launcher.right<=width); assert.ok(metrics.launcher.width>=44&&metrics.launcher.height>=44)
    assert.ok(metrics.panel.bottom<=metrics.launcher.top); if(width<1024)assert.ok(metrics.launcher.bottom<=metrics.nav.top)
    assert.ok(metrics.targets.every(target=>target.width>=43.9&&target.height>=43.9)); assert.equal(metrics.canvasVisible,'visible')
    metrics.screenshot = await screenshot(`${width}-${theme}`); return metrics
  })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await check('CHROME-ENTER-SPACE-ESCAPE-FOCUS', async () => {
    let stage = 'close and focus'
    await cdp.send('Page.bringToFront')
    await cdp.eval(`(() => {
      window.__d14Keys=[];
      for(const type of ['keydown','keypress','keyup'])document.addEventListener(type,e=>{ __d14Keys.push({type,key:e.key,code:e.code,target:e.target.id,trusted:e.isTrusted}); }, true);
    })()`)
    try {
      await click('#ai-chat-close-btn'); await wait(`!document.querySelector('#ai-assistant-dialog')`); await wait(`document.activeElement.id==='ai-assistant-launcher'`)
      stage = 'Enter opens panel'
      await key('Enter','Enter',13); await wait(`document.querySelector('#ai-assistant-dialog')`); assert.equal(await cdp.eval('document.activeElement.id'),'ai-chat-input')
      stage = 'Escape closes panel and restores focus'
      await key('Escape','Escape',27); await wait(`!document.querySelector('#ai-assistant-dialog') && document.activeElement.id==='ai-assistant-launcher'`)
      stage = 'Space opens panel'
      await key(' ','Space',32); await wait(`document.querySelector('#ai-assistant-dialog')`)
      return { stages: ['Enter opens panel','Escape closes and restores focus','Space opens panel'], keyEvents: await cdp.eval('__d14Keys') }
    } catch(error) {
      const detail=await cdp.eval(`({focus:document.activeElement?.id,expanded:document.querySelector('#ai-assistant-launcher')?.getAttribute('aria-expanded'),keys:__d14Keys})`)
      throw new Error(`Keyboard stage ${stage}: ${error.message}; ${JSON.stringify(detail)}`)
    }
  })
  await check('CHROME-ONE-CONTEXT-AFTER-20-TOGGLES', async () => {
    await cdp.eval(`void(window.__d14OriginalCanvas=document.querySelector('[data-robot-canvas]'))`)
    for(let i=0;i<20;i++){ const expanded=await cdp.eval(`document.querySelector('#ai-assistant-launcher').getAttribute('aria-expanded')`); await click('#ai-assistant-launcher'); await wait(`document.querySelector('#ai-assistant-launcher').getAttribute('aria-expanded')!==${JSON.stringify(expanded)}`) }
    assert.equal(await cdp.eval(`document.querySelector('[data-robot-canvas]')===__d14OriginalCanvas`),true); assert.equal(await cdp.eval('__d14Gpu.created'),1); return await cdp.eval('__d14Gpu')
  })
  await check('CHROME-DRAWER-PAUSES-ANIMATION', async () => {
    await click('#qa-drawer'); await wait(`document.querySelector('#ai-assistant-launcher').hidden`); await sleep(100)
    const before = await cdp.eval('__d14Gpu.drawCalls'); await sleep(350); assert.equal(await cdp.eval('__d14Gpu.drawCalls'),before)
    await click('#qa-drawer'); await wait(`!document.querySelector('#ai-assistant-launcher').hidden`); await sleep(180); assert.ok(await cdp.eval('__d14Gpu.drawCalls')>before); return {drawCallsWhileHidden:0}
  })
  await check('CHROME-REDUCED-MOTION', async () => {
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]}); await sleep(100)
    const before=await cdp.eval('__d14Gpu.drawCalls'); await sleep(350); assert.equal(await cdp.eval('__d14Gpu.drawCalls'),before)
    return {continuousDrawCalls:0,screenshot:await screenshot('reduced-motion')}
  })
  await check('CHROME-DISPOSE-ON-REAL-UNMOUNT', async () => {
    const before=await cdp.eval('__d14Gpu.lost'); await click('#qa-mount'); await wait(`!document.querySelector('#ai-assistant-launcher')`); await wait(`__d14Gpu.lost>${before}`)
    const draws=await cdp.eval('__d14Gpu.drawCalls'); await sleep(150); assert.equal(await cdp.eval('__d14Gpu.drawCalls'),draws); return await cdp.eval('__d14Gpu')
  })
  await cdp.send('Emulation.setEmulatedMedia',{features:[]}); await navigate()
  await check('CHROME-CONTEXT-LOST-SVG-FALLBACK', async () => {
    await robotReady(); await cdp.eval(`document.querySelector('[data-robot-canvas]').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`)
    await wait(`document.querySelector('[data-robot-canvas]').style.visibility==='hidden' && document.querySelector('#ai-assistant-launcher svg')`)
    await sleep(250); assert.equal(await cdp.eval('__d14Gpu.created'),1); await open(); return {screenshot:await screenshot('context-lost-fallback'),gpu:await cdp.eval('__d14Gpu')}
  })
  await navigate('?webgl=off')
  await check('CHROME-NO-WEBGL-SVG-FALLBACK', async () => {
    await wait(`__d14Gpu.attempts>0 && document.querySelector('[data-robot-canvas]')?.style.visibility==='hidden'`)
    assert.ok(await cdp.eval(`Boolean(document.querySelector('#ai-assistant-launcher svg'))`)); assert.equal(await cdp.eval('__d14Gpu.created'),0)
    await open(); assert.ok(await cdp.eval(`Boolean(document.querySelector('#ai-chat-input'))`)); return {screenshot:await screenshot('no-webgl-fallback')}
  })
  await check('CHROME-JAVASCRIPT-CONSOLE', async () => {
    const unexpected = consoleErrors.filter(error=>!error.includes('Error creating WebGL context')&&!error.includes('Failed to load resource: the server responded with a status of 503'))
    assert.deepEqual(unexpected,[]); return {expectedErrors:consoleErrors.length}
  })
}
try { await run() } catch(error) { results.push({id:'CHROME-QA-INFRASTRUCTURE',status:'BLOCKED',detail:String(error.message).slice(0,800)}); console.error('QA_STOPPED',error.message); process.exitCode=1 }
finally {
  const summary={pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length,blocked:results.filter(x=>x.status==='BLOCKED').length}
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({timestamp:new Date().toISOString(),mode:'real Chrome headless, CDP, isolated profile, production components; synthetic session/local HTTP fixture; not live Backend/Gemini',browser,summary,results,requests,consoleErrors},null,2))
  console.log(JSON.stringify(summary)); if(summary.fail||summary.blocked)process.exitCode=1
  cdp?.close(); chrome?.kill(); await vite?.close()
  if(profile && path.dirname(path.resolve(profile))===path.resolve(os.tmpdir()) && path.basename(profile).startsWith('se2-d14-chrome-'))try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
