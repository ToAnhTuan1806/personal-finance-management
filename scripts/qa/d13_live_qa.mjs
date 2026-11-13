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


const output = path.resolve('docs/qa/evidence/d13-fe');
fs.mkdirSync(output, {recursive:true});
const results=[];
async function check(id, fn) { try { const detail=await fn(); results.push({id,status:'PASS',detail}); console.log('PASS',id); } catch(e) { results.push({id,status:'FAIL',detail:String(e.message).slice(0,400)}); console.log('FAIL',id,String(e.message).slice(0,100)); } }
const api='http://localhost:8080/api';
async function request(route, body, token, method='POST') {
 const r=await fetch(api+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>null);return {status:r.status,data};
}
const fixture={reply:'So sánh dữ liệu tổng hợp dùng kiểm tra layout, không phải Live Integration.',period:'2026-11',intent:'CATEGORY_TREND',stats:{totalIncome:200.2,totalExpense:20.5,balance:179.7},topCategories:[],budget:null,comparison:{baseMonth:'2026-10',targetMonth:'2026-11',base:{totalIncome:100.1,totalExpense:10.1,balance:90},target:{totalIncome:200.2,totalExpense:20.5,balance:179.7},delta:{totalIncome:100.1,totalExpense:10.4,balance:89.7},expenseChangePercent:102.97,categoryTrends:[{categoryId:12,categoryName:'Ăn uống và chi phí sinh hoạt với tên danh mục dài để kiểm tra xuống dòng',baseExpense:10.1,targetExpense:20.5,delta:10.4,changePercent:102.97}]}};
async function run(){
 let reachable=false;try{reachable=(await request('/ai/chat',{message:'So sánh',month:'2026-11'})).status===401;}catch{}
 // Required after verifying the actual Backend datasource is a disposable QA schema.
 const live=reachable && process.env.D13_QA_WRITES_APPROVED==='true';
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'d13-chrome-'));
 const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore',windowsHide:true});
 let cdp;const consoleErrors=[];
 try {
 let port;for(let i=0;i<60;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await sleep(150);}}
 assert.ok(port,'Chrome CDP did not start');
 const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();cdp=new CDP(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await cdp.connect();
 await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Network.enable');
 cdp.on('Runtime.exceptionThrown',e=>consoleErrors.push(e.exceptionDetails.text));
 cdp.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')consoleErrors.push(e.args.map(x=>x.value||x.description||'').join(' ').slice(0,200));});
 const browser=await cdp.send('Browser.getVersion');
 await cdp.send('Page.navigate',{url:'http://localhost:5173/'});await waitFor(cdp,'document.querySelector("#root")');
 // Component QA: actual Chrome and production component, synthetic fixture explicitly labeled.
 await cdp.eval(`(async()=>{ const React=await import('/node_modules/.vite/deps/react.js'); const DOM=await import('/node_modules/.vite/deps/react-dom_client.js'); const mod=await import('/src/components/ai/AiAssistantWidget.jsx'); window.qaReact=React.default||React;window.qaMod=mod;const host=document.createElement('div');host.id='d13-layout-qa';document.body.appendChild(host);window.qaRoot=(DOM.createRoot||DOM.default.createRoot)(host);window.qaRoot.render(qaReact.createElement(mod.AiAssistantPanelView,{open:true,month:'2026-11',compareMonth:'2026-10',messages:[{...${JSON.stringify(fixture)},id:'qa',role:'assistant'}]})); })()`);
 await waitFor(cdp,'document.querySelector("#ai-assistant-dialog")');
 for(const width of [320,375,430,768,1440])for(const theme of ['light','dark']){
 await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
 await cdp.eval(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);await sleep(120);
 await check(`CHROME-FIXTURE-${width}-${theme}`,async()=>{
 const metrics=await cdp.eval(`(()=>{const p=document.querySelector('#ai-assistant-dialog'),r=p.getBoundingClientRect(),log=p.querySelector('[role=log]');return{width:innerWidth,documentOverflow:document.documentElement.scrollWidth>innerWidth,panelOverflow:p.scrollWidth>p.clientWidth,logOverflow:log.scrollWidth>log.clientWidth,bottom:r.bottom,top:r.top,scrollHeight:log.scrollHeight,clientHeight:log.clientHeight,text:p.innerText}})()`);
 assert.equal(metrics.documentOverflow,false);assert.equal(metrics.panelOverflow,false);assert.equal(metrics.logOverflow,false);assert.ok(metrics.top>=0);if(width<1024)assert.ok(metrics.bottom<=900-70);assert.ok(metrics.scrollHeight>metrics.clientHeight);assert.ok(metrics.text.includes('102,97%'));assert.ok(!/NaN|Infinity/.test(metrics.text));
 delete metrics.text;const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`${width}-${theme}.png`),Buffer.from(shot.data,'base64'));return metrics;
 });}
 await check('CHROME-FIXTURE-empty-null',async()=>{
 const zero={totalIncome:0,totalExpense:0,balance:0};const empty=structuredClone(fixture);Object.assign(empty.comparison,{base:zero,target:zero,delta:zero,expenseChangePercent:null,categoryTrends:[]});
 await cdp.eval(`qaRoot.render(qaReact.createElement(qaMod.AiAssistantPanelView,{open:true,month:'2026-11',compareMonth:'2026-10',messages:[{...${JSON.stringify(empty)},id:'empty',role:'assistant'}]}))`);await waitFor(cdp,`document.body.innerText.includes('Không có giao dịch trong cả hai tháng')`);assert.ok(await cdp.eval(`document.body.innerText.includes('Không tính được % thay đổi chi tiêu vì kỳ gốc bằng 0')`));});
 if(live){
 const password='Qa!'+crypto.randomUUID();const users=[];
 for(const suffix of ['A','B']){const email=`d13_${suffix}_${Date.now()}@example.test`;const reg=await request('/auth/register',{fullName:'D13 QA '+suffix,email,password});assert.equal(reg.status,201);const login=await request('/auth/login',{email,password});assert.equal(login.status,200);users.push({token:login.data.accessToken,email});}
 const [a,b]=users;
 for(const u of users){const cats=await request('/categories',null,u.token,'GET');u.expense=cats.data.find(c=>c.type==='EXPENSE').id;u.income=cats.data.find(c=>c.type==='INCOME').id;}
 for(const [u,date,type,amount]of [[a,'2026-10-01','INCOME',100.10],[a,'2026-11-01','INCOME',200.20],[a,'2026-10-31','EXPENSE',10.10],[a,'2026-11-11','EXPENSE',20.50],[a,'2025-12-31','EXPENSE',0.10],[a,'2026-01-01','EXPENSE',0.30],[b,'2026-11-01','EXPENSE',999.99]]){const r=await request('/transactions',{categoryId:type==='INCOME'?u.income:u.expense,type,amount,transactionDate:date},u.token);assert.equal(r.status,201);}
 for(const [id,body,validate]of [
 ['HTTP-COMPARISON',{message:'So sánh thu chi',month:'2026-11',compareMonth:'2026-10'},d=>{assert.equal(d.intent,'COMPARISON');assert.equal(d.comparison.delta.totalExpense,10.4);assert.equal(d.comparison.expenseChangePercent,102.97);} ],
 ['HTTP-CATEGORY_TREND',{message:'Danh mục nào tăng chi tiêu nhiều nhất?',month:'2026-11',compareMonth:'2026-10'},d=>{assert.equal(d.intent,'CATEGORY_TREND');assert.equal(d.comparison.categoryTrends[0].delta,10.4);} ],
 ['HTTP-EMPTY',{message:'So sánh',month:'2026-08',compareMonth:'2026-07'},d=>{assert.equal(d.comparison.expenseChangePercent,null);assert.deepEqual(d.comparison.categoryTrends,[]);} ],
 ['HTTP-YEAR',{message:'So sánh',month:'2026-01',compareMonth:'2025-12'},d=>{assert.equal(d.comparison.target.totalExpense,0.3);assert.equal(d.comparison.base.totalExpense,0.1);} ],
 ['HTTP-BASE-ZERO',{message:'So sánh danh mục',month:'2026-11',compareMonth:'2026-08'},d=>{assert.equal(d.comparison.expenseChangePercent,null);assert.equal(d.comparison.categoryTrends[0].changePercent,null);} ],
 ])await check(id,async()=>{const r=await request('/ai/chat',body,a.token);assert.equal(r.status,200);validate(r.data);fs.writeFileSync(path.join(output,id+'.json'),JSON.stringify(r.data,null,2));});
 await check('HTTP-OWNER-B',async()=>{const r=await request('/ai/chat',{message:'So sánh',month:'2026-11',compareMonth:'2026-10',userId:1},b.token);assert.equal(r.data.comparison.target.totalExpense,999.99);});
 await check('HTTP-JWT',async()=>{for(const t of [null,'invalid'])assert.equal((await request('/ai/chat',{message:'So sánh',month:'2026-11'},t)).status,401);});
 // Real login via Chrome. Fixture host is removed; no injected token/session.
 await cdp.send('Page.navigate',{url:'http://localhost:5173/login'});await waitFor(cdp,'document.querySelector("input[type=email]")');
 await setInput(cdp,'input[type=email]',a.email);await setInput(cdp,'input[type=password]',password);await cdp.eval(`document.querySelector('form button[type=submit]').click()`);await waitFor(cdp,'document.querySelector("#ai-assistant-launcher")');
 await cdp.eval(`document.querySelector('#ai-assistant-launcher').click()`);await waitFor(cdp,'document.querySelector("#ai-chat-month")');
 await setInput(cdp,'#ai-chat-month','2026-11');await setInput(cdp,'#ai-chat-compare-month','2026-10');
 await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText.includes('So sánh')).click()`);
 await check('CHROME-LIVE-COMPARISON',async()=>{await waitFor(cdp,`document.querySelector('[aria-label="So sánh thu chi hai tháng"]')`);assert.ok(await cdp.eval(`document.body.innerText.includes('102,97%')`));});

 for(const width of [320,375,430,768,1440])for(const theme of ['light','dark']){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await cdp.eval(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);await sleep(120);await check(`CHROME-LIVE-${width}-${theme}`,async()=>{const metrics=await cdp.eval(`(()=>{const p=document.querySelector('#ai-assistant-dialog'),nav=document.querySelector('nav[aria-label="Điều hướng mobile"]'),log=p.querySelector('[role=log]');return {overflow:document.documentElement.scrollWidth>innerWidth||p.scrollWidth>p.clientWidth||log.scrollWidth>log.clientWidth,panelBottom:p.getBoundingClientRect().bottom,navTop:nav.getBoundingClientRect().top,text:p.innerText}})()`);assert.equal(metrics.overflow,false);if(width<1024)assert.ok(metrics.panelBottom<=metrics.navTop);assert.ok(metrics.text.includes('102,97%'));delete metrics.text;const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`live-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));return metrics;});}
 await check('CHROME-LIVE-TREND' ,async()=>{await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText.includes('tăng chi')).click()`);await waitFor(cdp,`document.querySelectorAll('[aria-label="So sánh thu chi hai tháng"]').length===2`);});
 for(const question of ['Tháng này tôi đã chi bao nhiêu?','Danh mục nào tôi chi nhiều nhất?','Ngân sách tháng này còn bao nhiêu?'])await check('CHROME-P1-'+question,async()=>{const before=await cdp.eval(`document.querySelectorAll('[role=log] > div').length`);await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText===${JSON.stringify(question)}).click()`);await waitFor(cdp,`!document.querySelector('[aria-label="Trợ lý đang xử lý"]') && document.querySelectorAll('[role=log] > div').length>${before+1}`);});

 await cdp.eval(`document.querySelector('#ai-chat-clear-btn').click()`);
 // Wait for the owner rate window to expire before network/abort scenarios.
 console.log('Waiting for per-owner rate window before network QA');await sleep(60000);
 for(const [id,body,expected]of [
 ['HTTP-DECREASE',{message:'So sánh danh mục',month:'2026-10',compareMonth:'2026-11'},-50.73],
 ['HTTP-TARGET-EMPTY',{message:'So sánh danh mục',month:'2026-08',compareMonth:'2026-11'},-100]
 ])await check(id,async()=>{const r=await request('/ai/chat',body,a.token);assert.equal(r.status,200);assert.equal(r.data.comparison.expenseChangePercent,expected);assert.ok(r.data.comparison.delta.totalExpense<0);assert.ok(r.data.comparison.categoryTrends[0].delta<0);fs.writeFileSync(path.join(output,id+'.json'),JSON.stringify(r.data,null,2));});
 await check('HTTP-VALIDATION',async()=>{for(const compareMonth of ['2026-11','1899-12','2026-13'])assert.equal((await request('/ai/chat',{message:'So sánh',month:'2026-11',compareMonth},a.token)).status,400);});

 await check('CHROME-FAST-PERIOD-ABORT',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:1000,downloadThroughput:1000000,uploadThroughput:1000000});await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText.includes('So sánh')).click()`);await setInput(cdp,'#ai-chat-month','2026-01');await setInput(cdp,'#ai-chat-compare-month','2025-12');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await sleep(1500);assert.equal(await cdp.eval(`document.querySelectorAll('[aria-label="So sánh thu chi hai tháng"]').length`),0);});
 await check('CHROME-NETWORK-RETRY',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText.includes('So sánh')).click()`);await waitFor(cdp,`document.querySelector('[role=alert]')?.innerText.includes('Không thể kết nối')`);await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cdp.eval(`document.querySelector('[role=alert] button').click()`);await waitFor(cdp,`document.querySelector('[aria-label="So sánh thu chi hai tháng"]')`);});
 await check('CHROME-EMPTY-NULL-LIVE',async()=>{await setInput(cdp,'#ai-chat-month','2026-08');await setInput(cdp,'#ai-chat-compare-month','2026-07');await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText.includes('So sánh')).click()`);await waitFor(cdp,`document.body.innerText.includes('Không có giao dịch trong cả hai tháng')`);});
 await check('CHROME-ESCAPE',async()=>{await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await waitFor(cdp,`!document.querySelector('#ai-assistant-dialog')`);assert.equal(await cdp.eval(`document.activeElement?.id`),'ai-assistant-launcher');});
 await check('CHROME-LOGOUT-A-LOGIN-B',async()=>{await cdp.eval(`document.querySelector('#ai-assistant-launcher').click()`);await waitFor(cdp,`document.querySelector('#ai-assistant-dialog')`);await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:1000,downloadThroughput:1000000,uploadThroughput:1000000});await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText.includes('So sánh')).click()`);await cdp.eval(`document.querySelector('#logout-btn').click()`);await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await waitFor(cdp,`!document.querySelector('#ai-assistant-launcher')`);await cdp.send('Page.navigate',{url:'http://localhost:5173/login'});await waitFor(cdp,'document.querySelector("input[type=email]")');await setInput(cdp,'input[type=email]',b.email);await setInput(cdp,'input[type=password]',password);await cdp.eval(`document.querySelector('form button[type=submit]').click()`);await waitFor(cdp,'document.querySelector("#ai-assistant-launcher")');await cdp.eval(`document.querySelector('#ai-assistant-launcher').click()`);await waitFor(cdp,`document.body.innerText.includes('Chưa có cuộc trò chuyện nào')`);assert.ok(!(await cdp.eval(`document.querySelector('[role=log]').innerText`)).includes('102,97%'));await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText.includes('So sánh')).click()`);await waitFor(cdp,`document.querySelector('[aria-label="So sánh thu chi hai tháng"]')`);assert.ok(await cdp.eval(`document.querySelector('[role=log]').innerText.includes('999,99')`));});
 await check('CHROME-P1-ADVICE',async()=>{await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText.includes('Tôi nên')).click()`);await waitFor(cdp,`!document.querySelector('[aria-label="Trợ lý đang xử lý"]')`,40000);let error=await cdp.eval(`document.querySelector('[role=alert]')?.innerText||''`);let retried=false;if(error){retried=true;await cdp.eval(`document.querySelector('[role=alert] button').click()`);await waitFor(cdp,`!document.querySelector('[aria-label="Trợ lý đang xử lý"]')`,40000);error=await cdp.eval(`document.querySelector('[role=alert]')?.innerText||''`);}if(error)throw new Error('ADVICE provider live unavailable after one explicit Retry: '+error);assert.ok(await cdp.eval(`document.querySelector('[role=log]').innerText.includes('Tôi nên')`));return {retried};});
 await check('CHROME-JWT-401-CLEARS-SESSION',async()=>{cdp.on('Fetch.requestPaused',p=>{const headers=p.request.headers;const clean=Object.entries(headers).filter(([k])=>k.toLowerCase()!=='authorization').map(([name,value])=>({name,value:String(value)}));clean.push({name:'Authorization',value:'Bearer invalid-qa-jwt'});cdp.send('Fetch.continueRequest',{requestId:p.requestId,headers:clean}).catch(()=>{});});await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*api/ai/chat',requestStage:'Request'}]});await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText.includes('So sánh')).click()`);await waitFor(cdp,`location.pathname==='/login'&&!document.querySelector('#ai-assistant-launcher')`);assert.equal(await cdp.eval(`sessionStorage.getItem('accessToken')`),null);await cdp.send('Fetch.disable');});
 }else results.push({id:'LIVE-INTEGRATION'  ,status:'BLOCKED',detail:reachable?'Backend returns 401 but test datasource not yet confirmed; no writes approved':'localhost:8080 connection refused; no authenticated HTTP/browser tests executed'});
 await check('CHROME-JS-CONSOLE',async()=>{assert.deepEqual(consoleErrors.filter(x=>!x.includes('Network Error')&&!x.includes('ERR_INTERNET_DISCONNECTED')&&!x.includes('Failed to load resource')),[]);return 'No JS exceptions or console.error in component QA; network failures reported separately';});
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({date:new Date().toISOString(),browser,live,results,consoleErrors},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
 console.log(JSON.stringify({pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length,blocked:results.filter(x=>x.status==='BLOCKED').length}));
 }finally{cdp?.close();chrome.kill(); const tempRoot=path.resolve(os.tmpdir())+path.sep;if(path.resolve(profile).startsWith(tempRoot)&&path.basename(profile).startsWith('d13-chrome-')){try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}}}
}
run().catch(e=>{console.error('QA_STOPPED',e.message);process.exitCode=1;});
