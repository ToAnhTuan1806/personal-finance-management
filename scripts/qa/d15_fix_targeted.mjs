// Targeted CDP QA only; actual FE worktree, real login/API/MySQL, real AX tree.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

let raw = ''
for await (const c of process.stdin) raw += c
const settings = JSON.parse(raw); raw = ''
const out = settings.output
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const tests = [], sessions = [], chatAttempts = []
let server, runtime, current

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map() }
  async connect() {
    this.ws = new WebSocket(this.url)
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject })
    this.ws.onmessage = event => {
      const m = JSON.parse(String(event.data))
      if (m.id) {
        const p = this.pending.get(m.id)
        if (!p) return
        clearTimeout(p.timer); this.pending.delete(m.id)
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
      } else for (const callback of this.listeners.get(m.method) || []) callback(m.params)
    }
  }
  on(name, fn) { this.listeners.set(name, [...(this.listeners.get(name) || []), fn]) }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout ' + method)) }, 12000)
      this.pending.set(id, { resolve, reject, timer }); this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result?.value
  }
}

async function wait(expression, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try { if (await current.cdp.eval(`Boolean(${expression})`)) return } catch {}
    await sleep(80)
  }
  throw new Error('Timeout: ' + expression)
}

async function check(id, expected, work) {
  const c = current.config
  const result = { id, expected, mode: c.mode, webglDisabled: c.disabled, viewport: c.viewport, theme: c.theme, evidence: [] }
  try { result.actual = await work(result); result.status = 'PASS' }
  catch (e) {
    result.status = e.notRun ? 'NOT_RUN' : e instanceof assert.AssertionError ? 'FAIL' : 'ERROR'
    result.actual = String(e.message).slice(0, 2200)
    if (!e.notRun) result.bug = { id: `D15-FIX-TGT-${String(tests.filter(t => t.bug).length + 1).padStart(2, '0')}`,
      priority: id.startsWith('A-') ? 'P1' : 'P2', steps: ['Start Chrome with this case mode/flags/viewport/theme', 'Log in as isolated D15 targeted QA owner', 'Select specified month or navigate Dashboard → Budgets → Reports', 'Compare actual with expected; see linked evidence'] }
  }
  tests.push(result); console.log(id, c.mode, c.disabled ? 'WebGL-disabled' : 'normal', result.status)
}

async function mouse(selector) {
  const point = await current.cdp.eval(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return null; e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);return {x,y,hit:!!hit&&(hit===e||e.contains(hit))}})()`)
  assert.ok(point?.hit, 'Click target unavailable or obscured: ' + selector)
  const { x, y } = point
  await current.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await current.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

async function screenshot(name, kpis = false) {
  let clip
  if (kpis) clip = await current.cdp.eval(`(() => {const cards=[...document.querySelectorAll('.se098-number')].slice(0,3).map(e=>e.closest('div.relative').getBoundingClientRect());const x=Math.max(0,Math.min(...cards.map(r=>r.x))),y=Math.max(0,Math.min(...cards.map(r=>r.y)));return {x,y,width:Math.min(innerWidth-x,Math.max(...cards.map(r=>r.right))-x),height:Math.max(...cards.map(r=>r.bottom))-y,scale:1}})()`)
  const image = await current.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, ...(clip ? { clip } : {}) })
  fs.writeFileSync(path.join(out, name), Buffer.from(image.data, 'base64'))
  return name
}

async function login() {
  await current.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('smartExpenseTheme',${JSON.stringify(current.config.theme)})` })
  await current.cdp.send('Page.navigate', { url: server.resolvedUrls.local[0] + 'login' })
  if (current.config.mode === 'headed') {
    const {windowId} = await current.cdp.send('Browser.getWindowForTarget')
    await current.cdp.send('Browser.setWindowBounds', {windowId,bounds:{windowState:'normal'}})
  }
  await current.cdp.send('Page.bringToFront')
  if (current.config.mode === 'headed') await wait(`document.visibilityState==='visible'`)
  await wait(`document.querySelector('#login-email') && !document.querySelector('#login-email').disabled`)
  for (const [selector, value] of [['#login-email', settings.email], ['#login-password', settings.password]]) {
    await mouse(selector)
    await current.cdp.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`)
    await current.cdp.send('Input.insertText', { text: value })
    await sleep(80)
  }
  const formReady = await current.cdp.eval(`document.querySelector('#login-email').value===${JSON.stringify(settings.email)} && document.querySelector('#login-password').value===${JSON.stringify(settings.password)}`)
  assert.ok(formReady, 'Browser input did not reach the login form')
  await mouse('button[type="submit"]')
  await wait(`location.pathname==='/'`, 25000)
  await wait(`document.querySelectorAll('.se098-number').length>=3`, 25000)
  assert.equal(await current.cdp.eval('document.documentElement.dataset.theme'), current.config.theme)
  console.log('Login via browser UI succeeded:', current.config.mode)
}

async function month(value) {
  await current.cdp.eval(`(() => {const e=document.querySelector('select[aria-label="Chọn tháng thống kê"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await wait(`document.querySelector('select[aria-label="Chọn tháng thống kê"]').value===${JSON.stringify(value)} && document.querySelectorAll('.se098-number').length>=3 && !document.body.innerText.includes('Đang tải so sánh')`)
  // Two real animation frames, then wait beyond the longest digit transition/delay.
  await current.cdp.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  await sleep(1400)
}

const canonical = text => String(text).replace(/[−–]/g, '-').replace(/[\s\u00a0]/g, '').replace(/\./g, '').replace(/,([0-9]*?)0+(?=₫)/, (_, v) => v ? ',' + v : '')
function expectedMoney(value) {
  const [whole, decimal = ''] = value.split('.')
  const fraction = decimal.replace(/0+$/, '')
  return whole + (fraction ? ',' + fraction : '') + '₫'
}

async function visual() {
  return current.cdp.eval(`(() => [...document.querySelectorAll('.se098-number-visual')].slice(0,3).map(e=>{
    const details=[];
    const text=[...e.children].map(c=>{
      if(!c.classList.contains('se098-digit-window'))return c.textContent;
      const w=c.getBoundingClientRect();
      const candidates=[...c.querySelectorAll('.se098-digit-column > span')].map(d=>{const r=d.getBoundingClientRect();return {digit:d.textContent,overlap:Math.max(0,Math.min(w.bottom,r.bottom)-Math.max(w.top,r.top))/w.height}}).sort((a,b)=>b.overlap-a.overlap);
      details.push(candidates[0]);return candidates[0].digit;
    }).join('');
    return {text,digits:details,visible:getComputedStyle(e).visibility==='visible',rect:{width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}};
  }))()`)
}

async function axSnapshot() {
  const cdp = current.cdp
  try {
    await cdp.send('Accessibility.enable')
    const document = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: document.root.nodeId, selector: '.se098-number > .sr-only' })
    assert.ok(nodeIds.length >= 3, 'Three KPI accessibility DOM targets missing')
    // PartialAXTree can omit children of an ignored generic DOM span. Resolve
    // its real AX child IDs against Chrome's full tree, never against DOM text.
    const full = await cdp.send('Accessibility.getFullAXTree')
    const byId = new Map(full.nodes.map(n => [n.nodeId, n]))
    const snapshots = []
    for (const nodeId of nodeIds.slice(0, 3)) {
      const partial = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: true })
      const nodes = [], seen = new Set()
      const visit = n => {
        if (!n || seen.has(n.nodeId)) return
        seen.add(n.nodeId); nodes.push(n)
        for (const id of n.childIds || []) visit(byId.get(id) || partial.nodes.find(c => c.nodeId === id))
      }
      visit(partial.nodes[0])
      snapshots.push({nodes,partialAncestors:partial.nodes.slice(1),source:'Chrome partial target plus full AX descendant nodes'})
    }
    return snapshots
  } catch (error) {
    if (/not found|wasn't found|not supported|Accessibility/i.test(error.message) && !(error instanceof assert.AssertionError)) error.notRun = true
    throw error
  }
}

async function route(pathname) {
  if (await current.cdp.eval('location.pathname') !== pathname) {
    // Real router Link handler; no history manipulation, page mock or financial response mock.
    await current.cdp.eval(`(() => {const e=document.querySelector('a[href="${pathname}"]');if(!e)throw Error('Route link missing');e.click()})()`)
  }
  await wait(`location.pathname===${JSON.stringify(pathname)}`)
  const ready = pathname === '/' ? `document.querySelectorAll('.se098-number').length>=3` : pathname === '/budgets' ? `document.querySelector('[role="progressbar"]')` : `document.querySelector('table tbody tr')`
  await wait(ready)
}

async function launcher() {
  await wait(`document.querySelector('#ai-assistant-launcher')`)
  await current.cdp.eval(`document.querySelector('#ai-assistant-launcher').focus()`)
  await wait(`document.querySelector('#ai-assistant-launcher [data-robot-canvas]')`)
  await sleep(500)
  return current.cdp.eval(`(() => {const b=document.querySelector('#ai-assistant-launcher');const c=b.querySelector('canvas');const svg=b.querySelector('svg image');const r=b.getBoundingClientRect();return {focusable:document.activeElement===b,disabled:b.disabled,canvasCount:b.querySelectorAll('canvas').length,canvasVisibility:c?getComputedStyle(c).visibility:null,fallbackVisible:!!svg&&svg.getBoundingClientRect().width>0&&getComputedStyle(svg).visibility==='visible',fallbackImage:svg?.getAttribute('href'),launcherWidth:r.width,launcherHeight:r.height,viewportVisible:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}})()`)
}

async function openClose() {
  await mouse('#ai-assistant-launcher')
  await wait(`document.querySelector('#ai-assistant-dialog') && document.querySelector('#ai-assistant-launcher').getAttribute('aria-expanded')==='true'`)
  await mouse('button[aria-label="Đóng trợ lý tài chính"]')
  await wait(`document.querySelector('#ai-assistant-launcher').getAttribute('aria-expanded')==='false'`)
  await sleep(100)
}

async function cycle(result, disabled) {
  const states = []
  let previousCanvas
  const observations = []
  for (const pathname of ['/', '/budgets', '/reports', '/', '/budgets', '/reports']) {
    await route(pathname)
    const state = await launcher()
    assert.ok(state.focusable && !state.disabled && state.viewportVisible && state.launcherWidth >= 40, JSON.stringify(state))
    assert.ok(state.canvasVisibility === 'visible' || state.fallbackVisible, 'Blank launcher')
    if (disabled) assert.ok(state.fallbackVisible && state.canvasVisibility === 'hidden', 'Disabled WebGL did not show static fallback: ' + JSON.stringify(state))
    await openClose()
    observations.push(state.canvasCount)
    if (previousCanvas === undefined) previousCanvas = state.canvasCount
    assert.equal(state.canvasCount, previousCanvas, 'Canvas count grows after route changes')
    states.push({ route: pathname, ...state, openClose: true })
    if (disabled && states.length === 3) result.evidence.push(await screenshot(`fallback-${current.config.viewport.width}-${current.config.theme}.png`))
  }
  // No component/context monkeypatch: confirm disabled capability with a separate throwaway canvas.
  if (disabled) assert.equal(await current.cdp.eval(`document.createElement('canvas').getContext('webgl2')===null`), true)
  const stable = await launcher(); await sleep(1200); const later = await launcher()
  assert.equal(stable.canvasCount, later.canvasCount, 'Canvas creation loop')
  return { states, canvasCountsAcrossSixRoutes: observations, unchangedAfterIdle: true }
}

async function start(config) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'se-d15-fix-chrome-'))
  const flags = ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--enable-automation',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
    `--user-data-dir=${profile}`, '--window-size=' + config.viewport.width + ',' + config.viewport.height,
    ...(config.mode === 'headless' ? ['--headless=new'] : []), ...(config.disabled ? ['--disable-webgl', '--disable-webgl2'] : []), 'about:blank']
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', flags, { windowsHide: config.mode !== 'headed', stdio: 'ignore' })
  const s = { config, profile, chrome, flags: flags.filter(f=>!f.startsWith('--user-data-dir')), errors: [], warnings: [], pageErrors: [], networkErrors: [], requests: [], cancellations: [] }
  current = s; sessions.push(s)
  const active = path.join(profile, 'DevToolsActivePort')
  for (let i = 0; i < 150 && !fs.existsSync(active); i++) await sleep(100)
  assert.ok(fs.existsSync(active), 'Chrome mode did not start')
  const port = fs.readFileSync(active, 'utf8').split('\n')[0]
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  s.cdp = new CDP(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await s.cdp.connect()
  s.browserVersion = (await s.cdp.send('Browser.getVersion')).product
  for (const method of ['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable']) await s.cdp.send(method)
  await s.cdp.send('Emulation.setDeviceMetricsOverride', { ...config.viewport, deviceScaleFactor: 1, mobile: config.viewport.width < 500 })
  const requestMap = new Map()
  s.cdp.on('Runtime.consoleAPICalled', p => {
    const item = { type: p.type, message: p.args.map(a=>a.value || a.description).join(' ').slice(0,1800), time: p.timestamp }
    if (p.type === 'error') s.errors.push(item)
    if (p.type === 'warning' || p.type === 'warn') s.warnings.push(item)
  })
  s.cdp.on('Runtime.exceptionThrown', p => s.pageErrors.push({ message: p.exceptionDetails.exception?.description || p.exceptionDetails.text }))
  s.cdp.on('Log.entryAdded', p => {
    if (p.entry.level === 'error') s.errors.push({ source: p.entry.source, message: p.entry.text, url: p.entry.url })
    if (p.entry.level === 'warning') s.warnings.push({ source: p.entry.source, message: p.entry.text, url: p.entry.url })
  })
  s.cdp.on('Network.requestWillBeSent', p => {
    const url = p.request.url
    requestMap.set(p.requestId, url)
    if (new URL(url).pathname.startsWith('/api/')) s.requests.push({ url, method: p.request.method })
    if (url.includes('/api/ai/chat')) chatAttempts.push({ mode: config.mode, url })
  })
  s.cdp.on('Network.responseReceived', p => { if(p.response.status >= 400) s.networkErrors.push({ url:p.response.url, status:p.response.status }) })
  s.cdp.on('Network.loadingFailed', p => {
    const item={url:requestMap.get(p.requestId),error:p.errorText,canceled:p.canceled}
    if(p.canceled && p.errorText==='net::ERR_ABORTED') s.cancellations.push(item)
    else s.networkErrors.push(item)
  })
  return s
}

async function stop(s) {
  if(s.cdp) { await s.cdp.send('Browser.close').catch(()=>{}); s.cdp.ws.close() }
  if(s.chrome) {
    if(s.chrome.exitCode===null) await Promise.race([new Promise(r=>s.chrome.once('exit',r)),sleep(3000)])
    if(s.chrome.exitCode===null) s.chrome.kill()
  }
  if(path.dirname(s.profile)===os.tmpdir() && path.basename(s.profile).startsWith('se-d15-fix-chrome-')) {
    for(let i=0;i<20;i++) { try { fs.rmSync(s.profile,{recursive:true}); break } catch { await sleep(200) } }
  }
  s.cleanup = fs.existsSync(s.profile) ? 'ERROR' : 'PASS'
}

try {
  runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'se-d15-fix-vite-'))
  const { createServer } = await import(pathToFileURL(path.join(settings.frontend, 'node_modules/vite/dist/node/index.js')))
  server = await createServer({ root: settings.frontend, configFile: path.join(settings.frontend,'vite.config.js'), cacheDir: path.join(runtime,'cache'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
    plugins: [{ name:'qa-block-chat', configureServer(vite) { vite.middlewares.use((req,res,next)=>{
      if(req.url?.startsWith('/api/ai/chat')) { chatAttempts.push({blockedBeforeBackend:true,path:'/api/ai/chat'});res.statusCode=403;res.end();return } next()
    }) } }], server: { host:'127.0.0.1', port:0, proxy:{'/api':{target:settings.backend}} } })
  await server.listen()
  const configs = [
    {mode:'headless',disabled:false,viewport:{width:1280,height:800},theme:'light'},
    {mode:'headed',disabled:false,viewport:{width:1280,height:800},theme:'dark'},
    {mode:'headless',disabled:true,viewport:{width:1280,height:800},theme:'light'},
    {mode:'headless',disabled:true,viewport:{width:390,height:844},theme:'dark'},
  ]
  for(const config of configs) {
    try {
      await start(config); await login()
      if(!config.disabled) {
        for(const fixture of settings.matrix) {
          await month(fixture.month)
          const expected=fixture.values.map(expectedMoney)
          await check('A-VISUAL-'+fixture.month, 'Rendered digits/signs preserve '+fixture.values.join('/')+'; no NaN/Infinity; settled RAF/transition', async r=>{
            const actual=await visual()
            const file=`kpi-${config.mode}-${fixture.month}.png`
            r.evidence.push(await screenshot(file,true))
            assert.ok(actual.every(a=>a.visible&&a.rect.width>0&&a.digits.every(d=>d.overlap>0.9)),JSON.stringify(actual))
            assert.deepEqual(actual.map(a=>canonical(a.text)),expected)
            assert.ok(actual.every(a=>!/NaN|Infinity/.test(a.text)))
            return {values:actual,expectedCanonical:expected,framesWaited:2,transitionWaitMs:1400}
          })
          await check('A-ACCESSIBILITY-'+fixture.month, 'Actual Chrome AX StaticText for each KPI equals exact SQL/API values '+fixture.values.join('/'), async r=>{
            const ax=await axSnapshot()
            const file=`accessibility-${config.mode}-${fixture.month}.json`
            fs.writeFileSync(path.join(out,file),JSON.stringify({month:fixture.month,expected,source:'Chrome Accessibility.getPartialAXTree, not DOM textContent',kpis:ax},null,2));r.evidence.push(file)
            const names=ax.map(tree=>tree.nodes.filter(n=>!n.ignored&&n.role?.value==='StaticText').map(n=>n.name?.value||''))
            assert.ok(names.every((list,i)=>list.some(name=>canonical(name)===expected[i])),JSON.stringify(names))
            assert.ok(names.every(list=>list.every(n=>!/NaN|Infinity/.test(n))))
            return {staticTextByKpi:names,expectedCanonical:expected}
          })
        }
      }
      await check(config.disabled?'C-FALLBACK-ROUTE-CYCLE':'B-NORMAL-ROUTE-CYCLE',
        'Six SPA route visits Dashboard/Budgets/Reports twice; robot or static mascot visible; launcher focus/click/open/close; no renderer/canvas loop; no chat API',
        r=>cycle(r,config.disabled))
      await check(config.disabled?'C-ERROR-GATE':'B-ERROR-GATE', 'Zero console.error, page error, unexpected network errors and /api/ai/chat attempts (no WebGL filtering)', async r=>{
        await sleep(500)
        const file=`console-${config.mode}-${config.disabled?'disabled-'+config.viewport.width:'normal'}.json`
        fs.writeFileSync(path.join(out,file),JSON.stringify({errors:current.errors,warnings:current.warnings,pageErrors:current.pageErrors,networkErrors:current.networkErrors,canceledNavigationRequests:current.cancellations,apiRequests:current.requests,chatAttempts},null,2));r.evidence.push(file)
        assert.equal(current.errors.length,0,JSON.stringify(current.errors))
        assert.equal(current.pageErrors.length,0,JSON.stringify(current.pageErrors))
        assert.equal(current.networkErrors.length,0,JSON.stringify(current.networkErrors))
        assert.equal(chatAttempts.length,0,'Chat API attempted')
        return {consoleErrors:0,pageErrors:0,networkErrors:0,chatAttempts:0,warnings:current.warnings.length,apiRequests:current.requests.length}
      })
    } catch(e) {
      tests.push({id:'SESSION-ENVIRONMENT',status:'ERROR',mode:config.mode,webglDisabled:config.disabled,viewport:config.viewport,theme:config.theme,
        expected:'Chrome session/login and required routes available',actual:String(e.message),evidence:[]})
      console.log('SESSION ERROR',config.mode,String(e.message).slice(0,500))
    } finally {
      if(current) {
        current.diagnostics = await current.cdp?.eval(`({route:location.pathname,readyState:document.readyState,visibility:document.visibilityState,hasFocus:document.hasFocus(),bodyText:document.body.innerText.slice(-1800)})`).catch(()=>null)
        const name=`session-${config.mode}-${config.disabled?'disabled-'+config.viewport.width:'normal'}.json`
        fs.writeFileSync(path.join(out,name),JSON.stringify({config,diagnostics:current.diagnostics,errors:current.errors,warnings:current.warnings,pageErrors:current.pageErrors,networkErrors:current.networkErrors,canceledNavigationRequests:current.cancellations,apiRequests:current.requests,chatAttempts},null,2))
        await stop(current)
      }
    }
  }
} catch(e) {
  tests.push({id:'BROWSER-ENVIRONMENT',status:'ERROR',expected:'Real frontend/Chrome available',actual:String(e.message),mode:'environment',viewport:null,theme:null,evidence:[]})
} finally {
  const frontendUrl=server?.resolvedUrls?.local?.[0]
  await server?.close()
  if(runtime && path.dirname(runtime)===os.tmpdir() && path.basename(runtime).startsWith('se-d15-fix-vite-')) fs.rmSync(runtime,{recursive:true,force:true})
  const helpers=sessions.every(s=>s.cleanup==='PASS') && (!runtime||!fs.existsSync(runtime))
  fs.writeFileSync(path.join(out,'browser-targeted-results.json'),JSON.stringify({tests,frontendUrl,backendUrl:settings.backend,frontendHead:settings.frontendHead,
    browserHelpersCleanup:helpers?'PASS':'ERROR',chatAttempts,
    sessions:sessions.map(s=>({config:s.config,flags:s.flags,browserVersion:s.browserVersion,cleanup:s.cleanup,errorCount:s.errors.length,warningCount:s.warnings.length,pageErrorCount:s.pageErrors.length,networkErrorCount:s.networkErrors.length})),
    description:'Actual app, browser UI login, real HTTP/MySQL. Visible digits reconstructed from rendered clipping geometry, actual Chrome AX snapshots; no React/financial response mocks. No WebGL errors filtered.'},null,2))
}
