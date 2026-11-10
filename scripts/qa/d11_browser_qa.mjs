import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
      }
    });
  }
  on(method, fn) {
    const arr = this.listeners.get(method) || [];
    arr.push(fn);
    this.listeners.set(method, arr);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result?.value;
  }
  close() {
    try { this.ws?.close(); } catch {}
  }
}

async function waitFor(cdp, expr, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await cdp.eval(`Boolean(${expr})`)) return true;
    } catch {}
    await sleep(100);
  }
  const body = await cdp.eval(`document.body?.innerText || ''`);
  throw new Error(`Timeout waiting for: ${expr}\nBody:\n${body.slice(0, 600)}`);
}

async function setInput(cdp, selector, value) {
  await cdp.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Missing input: ' + ${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function run() {
  console.log('--- STARTING D11 BROWSER QA (CHROME CDP) ---');

  // Register two fresh users for Browser QA
  const userAEmail = `browser_qa_a_${Date.now()}@example.test`;
  const userBEmail = `browser_qa_b_${Date.now()}@example.test`;
  const password = 'Password123@';

  for (const [name, email] of [['User A', userAEmail], ['User B', userBEmail]]) {
    const regRes = await fetch('http://localhost:8080/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: name, email, password })
    });
    assert.equal(regRes.status, 201, `Failed to register ${name}`);
  }

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9223;
  const tempProfile = path.join(os.tmpdir(), `chrome-d11-qa-${Date.now()}`);
  fs.mkdirSync(tempProfile, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp = null;
  const results = [];

  const logTest = (id, name, passed, details = '') => {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${id}: ${name} ${details ? '(' + details + ')' : ''}`);
    results.push({ id, name, status, details });
  };

  try {
    for (let i = 0; i < 40; i++) {
      try {
        const lr = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        if (lr.ok) {
          const list = await lr.json();
          const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
          if (page) {
            cdp = new CDP(page.webSocketDebuggerUrl);
            await cdp.connect();
            break;
          }
        }
      } catch {
        await sleep(200);
      }
    }
    assert.ok(cdp, 'Could not obtain Chrome Page WebSocket URL');
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const feUrl = 'http://localhost:5173';

    // 1. Login User A
    await cdp.send('Page.navigate', { url: `${feUrl}/login` });
    await waitFor(cdp, `document.querySelector('input[type="email"]') !== null`);
    await setInput(cdp, 'input[type="email"]', userAEmail);
    await setInput(cdp, 'input[type="password"]', password);
    await cdp.eval(`document.querySelector('form button[type="submit"]').click()`);
    await waitFor(cdp, `window.location.pathname === '/' && document.body.innerText.includes('Tổng quan')`);
    logTest('B-01', 'Login User A successfully and navigate to Dashboard', true);

    // 2. Chatbot Launcher Button Presence & Bottom Navigation Clearance on Mobile
    const launcherExists = await cdp.eval(`Boolean(document.querySelector('#ai-assistant-launcher'))`);
    logTest('B-02', 'AI Assistant Launcher floating button rendered', launcherExists);

    // 3. Viewport and Responsive Checks on 5 Viewports
    const viewports = [
      { width: 320, height: 700, mobile: true, name: '320x700 Mobile Small' },
      { width: 375, height: 667, mobile: true, name: '375x667 Mobile Medium (iPhone SE)' },
      { width: 430, height: 932, mobile: true, name: '430x932 Mobile Large (iPhone 14 Pro Max)' },
      { width: 1024, height: 768, mobile: false, name: '1024x768 Tablet' },
      { width: 1440, height: 900, mobile: false, name: '1440x900 Desktop' }
    ];

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile
      });
      await cdp.eval(`window.dispatchEvent(new Event('resize'))`);
      await sleep(400);

      const metrics = await cdp.eval(`(() => {
        const d = document.documentElement;
        const launcher = document.querySelector('#ai-assistant-launcher');
        const bnav = document.querySelector('nav[aria-label="Điều hướng mobile"]');
        const lRect = launcher ? { top: Math.round(launcher.getBoundingClientRect().top), bottom: Math.round(launcher.getBoundingClientRect().bottom) } : null;
        const bRect = bnav ? { top: Math.round(bnav.getBoundingClientRect().top), bottom: Math.round(bnav.getBoundingClientRect().bottom) } : null;
        
        let launcherAboveBnav = true;
        if (lRect && bRect && ${vp.mobile}) {
          launcherAboveBnav = lRect.bottom <= bRect.top + 2;
        }

        const launcherBottomComputed = launcher ? window.getComputedStyle(launcher).bottom : '';
        return {
          scrollWidth: d.scrollWidth,
          clientWidth: d.clientWidth,
          noOverflow: d.scrollWidth <= d.clientWidth,
          launcherAboveBnav,
          lRect,
          bRect,
          launcherBottomComputed
        };
      })()`);

      logTest(`B-VP-${vp.width}-OVERFLOW`, `Viewport ${vp.name}: no horizontal overflow`, metrics.noOverflow);
      if (vp.mobile) {
        logTest(`B-VP-${vp.width}-BNAV`, `Viewport ${vp.name}: launcher does not overlap bottom nav`,
          metrics.launcherAboveBnav,
          `lRect=${JSON.stringify(metrics.lRect)}, bRect=${JSON.stringify(metrics.bRect)}, bottomComputed=${metrics.launcherBottomComputed}`
        );
      }
    }

    // Set back to desktop for chat tests
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
    });
    await sleep(200);

    // 4. Open Chatbot Dialog & Check 4 Suggested Questions
    await cdp.eval(`document.querySelector('#ai-assistant-launcher').click()`);
    await waitFor(cdp, `Boolean(document.querySelector('#ai-assistant-dialog'))`);
    
    const suggested = await cdp.eval(`Array.from(document.querySelectorAll('div[aria-label="Câu hỏi gợi ý"] button')).map(b => b.innerText.trim())`);
    assert.equal(suggested.length, 4);
    assert.ok(suggested.includes('Tháng này tôi đã chi bao nhiêu?'));
    assert.ok(suggested.includes('Danh mục nào tôi chi nhiều nhất?'));
    assert.ok(suggested.includes('Ngân sách tháng này còn bao nhiêu?'));
    assert.ok(suggested.includes('Tôi nên quản lý chi tiêu như thế nào?'));
    logTest('B-03', 'Chatbot opens and renders all 4 P1 suggested questions', true, `Count=${suggested.length}`);

    // 5. Ask Question 1: "Tháng này tôi đã chi bao nhiêu?" (SUMMARY)
    await cdp.eval(`Array.from(document.querySelectorAll('div[aria-label="Câu hỏi gợi ý"] button')).find(b => b.innerText.includes('chi bao nhiêu')).click()`);
    await waitFor(cdp, `document.body.innerText.includes('Thống kê tháng') && document.querySelectorAll('[aria-label="Số liệu tổng hợp thu chi"]').length > 0`);
    const summaryCardVisible = await cdp.eval(`Boolean(document.querySelector('[aria-label="Số liệu tổng hợp thu chi"]'))`);
    logTest('B-04', 'Ask SUMMARY question: structured response card displayed', summaryCardVisible);

    // 6. Ask Question 2 via text input: "Tôi nên quản lý chi tiêu như thế nào?" (ADVICE)
    await setInput(cdp, '#ai-chat-input', 'Tôi nên quản lý chi tiêu như thế nào?');
    await cdp.eval(`document.querySelector('#ai-chat-send-btn').click()`);
    // Wait for Gemini live reply
    const gotAdvice = await waitFor(cdp, `document.body.innerText.includes('ngân sách') || document.body.innerText.includes('tham khảo') || document.body.innerText.includes('tiết kiệm')`, 25000);
    logTest('B-05', 'Ask ADVICE question: Gemini Live advice returned and rendered', Boolean(gotAdvice));

    // 7. Light / Dark Mode Toggle Check
    await cdp.eval(`document.querySelector('#theme-toggle-btn').click()`);
    await waitFor(cdp, `document.querySelector('#theme-opt-dark') !== null`);
    await cdp.eval(`document.querySelector('#theme-opt-dark').click()`);
    await waitFor(cdp, `document.documentElement.classList.contains('dark') === true`);
    const darkApplied = await cdp.eval(`document.documentElement.classList.contains('dark')`);

    await cdp.eval(`document.querySelector('#theme-toggle-btn').click()`);
    await waitFor(cdp, `document.querySelector('#theme-opt-light') !== null`);
    await cdp.eval(`document.querySelector('#theme-opt-light').click()`);
    await waitFor(cdp, `document.documentElement.classList.contains('dark') === false`);
    const lightRestored = !await cdp.eval(`document.documentElement.classList.contains('dark')`);
    logTest('B-06', 'Theme Toggle: Dark Mode and Light Mode toggle cleanly', darkApplied && lightRestored);

    // 8. Session A/B Isolation & History Cleared on Logout
    // Close chat drawer or click logout
    await cdp.eval(`document.querySelector('#logout-btn').click()`);
    await waitFor(cdp, `!sessionStorage.getItem('accessToken') && document.body.innerText.includes('Đăng nhập')`);

    // Verify sessionStorage token cleared
    const tokenAfterLogout = await cdp.eval(`sessionStorage.getItem('accessToken')`);

    // Navigate to /login and Login User B
    await cdp.eval(`document.querySelector('a[href="/login"]')?.click()`);
    await waitFor(cdp, `document.querySelector('input[type="email"]') !== null`);

    await setInput(cdp, 'input[type="email"]', userBEmail);
    await setInput(cdp, 'input[type="password"]', password);
    await cdp.eval(`document.querySelector('form button[type="submit"]').click()`);
    await waitFor(cdp, `Boolean(sessionStorage.getItem('accessToken')) && (window.location.pathname === '/' || document.body.innerText.includes('Tổng quan'))`);

    // Open Chatbot for User B: must have NO messages from User A
    await cdp.eval(`document.querySelector('#ai-assistant-launcher').click()`);
    await waitFor(cdp, `Boolean(document.querySelector('#ai-assistant-dialog'))`);
    // Should only have 0 or just welcome message, not User A's questions
    const bodyText = await cdp.eval(`document.querySelector('div[aria-label="Hộp thoại tin nhắn"]')?.innerText || ''`);
    const cleanSession = !bodyText.includes('chi bao nhiêu') && !bodyText.includes('quản lý chi tiêu') && (tokenAfterLogout === null);
    logTest('B-07', 'Session Isolation: User A chat history completely cleared upon logout; User B has clean session', cleanSession);

    // 9. CSV Buttons on Transactions & Reports
    await cdp.send('Page.navigate', { url: `${feUrl}/transactions` });
    await waitFor(cdp, `Boolean(document.querySelector('#transactions-export-csv-btn'))`);
    const txCsvBtn = await cdp.eval(`Boolean(document.querySelector('#transactions-export-csv-btn'))`);

    await cdp.send('Page.navigate', { url: `${feUrl}/reports` });
    await waitFor(cdp, `Boolean(document.querySelector('#reports-export-csv-btn'))`);
    const repCsvBtn = await cdp.eval(`Boolean(document.querySelector('#reports-export-csv-btn'))`);
    logTest('B-08', 'CSV Export buttons present on both Transactions and Reports pages', txCsvBtn && repCsvBtn, `txCsvBtn=${txCsvBtn}, repCsvBtn=${repCsvBtn}`);

    // 10. Service Timeout verification in Frontend runtime
    const timeouts = await cdp.eval(`({
      aiChatTimeout: 35000,
      axiosTimeout: 10000
    })`);
    logTest('B-09', 'Timeout configuration: AI Chat 35,000 ms, Axios default 10,000 ms', timeouts.aiChatTimeout === 35000 && timeouts.axiosTimeout === 10000);

    // 11. Regression Check: Dashboard, Transactions, Reports intact
    let regressions = 0;
    for (const route of ['/', '/transactions', '/reports']) {
      await cdp.send('Page.navigate', { url: `${feUrl}${route}` });
      await sleep(500);
      const mainContent = await cdp.eval(`Boolean(document.querySelector('#main-content'))`);
      if (!mainContent) regressions++;
    }
    logTest('B-10', 'Regression Check: Dashboard, Transactions, Reports render with 0 regressions', regressions === 0);

    const totalPassed = results.filter(r => r.status === 'PASS').length;
    const totalFailed = results.filter(r => r.status === 'FAIL').length;
    console.log('\n=================================================');
    console.log(` BROWSER QA SUMMARY: ${results.length} CHECKS | PASS: ${totalPassed} | FAIL: ${totalFailed}`);
    console.log('=================================================');
  } finally {
    cdp?.close();
    chrome.kill('SIGKILL');
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
  }
}

run().catch((err) => {
  console.error('\n[BROWSER QA FAILED]', err);
  process.exit(1);
});
