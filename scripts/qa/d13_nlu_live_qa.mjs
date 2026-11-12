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



const out=path.resolve('docs/qa/evidence/d13-fe-nlu');fs.mkdirSync(out,{recursive:true});
const results=[], requests=[], consoleErrors=[];let cdp;
async function check(id,fn){try{const detail=await fn();results.push({id,status:'PASS',detail});console.log('PASS',id);}catch(e){results.push({id,status:'FAIL',detail:String(e.message).slice(0,500)});console.log('FAIL',id,String(e.message).slice(0,120));}}
async function api(route,body,token,method='POST'){const r=await fetch('http://localhost:8080/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>null)};}
async function fill(selector,value){await cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function ask(message,expected){await fill('#ai-chat-input',message);await cdp.eval(`document.querySelector('#ai-chat-send-btn').click()`);await waitFor(cdp,`!document.querySelector('[aria-label="Trợ lý đang xử lý"]')`,40000);if(expected)await waitFor(cdp,`document.querySelector('[role=log]').innerText.includes(${JSON.stringify(expected)})`);const error=await cdp.eval(`document.querySelector('[role=alert]')?.innerText||''`);assert.equal(error,'');}
async function clear(){await cdp.eval(`document.querySelector('#ai-chat-clear-btn').click()`);await waitFor(cdp,`document.body.innerText.includes('Chưa có cuộc trò chuyện nào')`);}
async function login(user,password){await cdp.send('Page.navigate',{url:'http://localhost:5173/login'});await waitFor(cdp,`document.querySelector('input[type=email]')`);await fill('input[type=email]',user.email);await fill('input[type=password]',password);await cdp.eval(`document.querySelector('form button[type=submit]').click()`);await waitFor(cdp,`document.querySelector('#ai-assistant-launcher')`);await cdp.eval(`document.querySelector('#ai-assistant-launcher').click()`);await waitFor(cdp,`document.querySelector('#ai-chat-input')`);}
async function shot(name){if(name==='categories-chart'){await cdp.eval(`document.querySelector('[aria-label="Biểu đồ chi tiêu theo danh mục"]')?.scrollIntoView({block:'center',behavior:'instant'})`);}else if(name==='comparison-chart'||name.startsWith('live-')){await cdp.eval(`document.querySelector('[aria-label="Biểu đồ so sánh thu chi"]')?.scrollIntoView({block:'center',behavior:'instant'})`);}await sleep(150);const p=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(p.data,'base64'));}
async function run(){
 assert.equal(process.env.D13_QA_WRITES_APPROVED,'true','Requires confirmed disposable QA database');
 assert.equal((await fetch('http://localhost:8080/api/categories')).status,401);
 const password='Qa!'+crypto.randomUUID(),users=[];
 for(const label of ['A','B']){const email=`d13_nlu_${label}_${Date.now()}@example.test`;assert.equal((await api('/auth/register',{fullName:'NLU QA '+label,email,password})).status,201);const r=await api('/auth/login',{email,password});assert.equal(r.status,200);const cats=await api('/categories',null,r.data.accessToken,'GET');users.push({email,token:r.data.accessToken,id:r.data.user.id,expenses:cats.data.filter(c=>c.type==='EXPENSE'),income:cats.data.find(c=>c.type==='INCOME')});}
 const [a,b]=users;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).formatToParts(new Date());const now=parts.find(x=>x.type==='year').value+'-'+parts.find(x=>x.type==='month').value;const dt=new Date(now+'-01T00:00:00Z');dt.setUTCMonth(dt.getUTCMonth()-1);const previous=dt.toISOString().slice(0,7);
 for(const [u,date,type,amount,index]of [[a,'2024-02-29','EXPENSE',0.1,0],[a,'2024-02-29','EXPENSE',0.2,1],[a,'2024-03-01','EXPENSE',0.7,0],[a,'2024-02-01','INCOME',100.1,0],[a,previous+'-01','EXPENSE',20.5,0],[b,'2024-02-29','EXPENSE',999.99,0],[a,'2025-12-31','EXPENSE',0.1,0],[a,'2026-01-01','EXPENSE',0.3,0]]){assert.equal((await api('/transactions',{categoryId:type==='INCOME'?u.income.id:u.expenses[index].id,type,amount,transactionDate:date},u.token)).status,201);}
 for(const [id,body,validate,owner]of [
 ['HTTP-NLU-SUMMARY',{message:'Tổng chi tháng 2/2024?',month:'2025-05',compareMonth:'2025-04'},d=>{assert.equal(d.period,'2024-02');assert.equal(d.stats.totalExpense,0.3);assert.equal(d.stats.balance,99.8);}],
 ['HTTP-NLU-CATEGORIES',{message:'Danh mục chi tháng 2/2024',month:'2025-05'},d=>{assert.equal(d.intent,'CATEGORIES');assert.equal(d.topCategories.length,2);assert.equal(d.period,'2024-02');}],
 ['HTTP-NLU-TWO-MONTHS',{message:'So sánh thu chi tháng 2/2024 và tháng 3/2024',month:'2025-05',compareMonth:'2025-04'},d=>{assert.equal(d.period,'2024-03');assert.equal(d.comparison.baseMonth,'2024-02');assert.equal(d.comparison.expenseChangePercent,133.33);}],
 ['HTTP-NLU-FOLLOWUP',{message:'Còn tháng trước thì sao?',month:'2025-05',context:{intent:'CATEGORIES',month:'2024-02'}},d=>{assert.equal(d.intent,'CATEGORIES');assert.equal(d.period,previous);assert.equal(d.stats.totalExpense,20.5);}],
 ['HTTP-NLU-UNKNOWN',{message:'Xin chào',month:'2025-05'},d=>{assert.equal(d.intent,'UNKNOWN');assert.equal(d.stats,null);assert.ok(d.reply.includes('SUMMARY'));}],
 ['HTTP-NLU-ANNUAL',{message:'Tổng thu năm nay',month:'2025-05'},d=>{assert.equal(d.intent,'UNKNOWN');assert.equal(d.stats,null);assert.ok(d.reply.includes('cả năm'));}],
 ['HTTP-NLU-NULL',{message:'So sánh danh mục tháng 1/2024 và tháng 2/2024',month:'2025-05'},d=>{assert.equal(d.comparison.expenseChangePercent,null);assert.ok(d.comparison.categoryTrends.every(c=>c.changePercent===null));}],
 ['HTTP-NLU-YEAR',{message:'So sánh tháng 12/2025 và tháng 1/2026',month:'2025-05'},d=>{assert.equal(d.period,'2026-01');assert.equal(d.comparison.baseMonth,'2025-12');}],
 ['HTTP-NLU-OWNER-B',{message:'Tổng chi tháng 2/2024',month:'2025-05',userId:a.id},d=>{assert.equal(d.stats.totalExpense,999.99);},b],
 ])await check(id,async()=>{const r=await api('/ai/chat',body,(owner||a).token);assert.equal(r.status,200);validate(r.data);fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(r.data,null,2));});
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'d13-nlu-chrome-'));
 const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore',windowsHide:true});
 let browser;
 try{
 let port;for(let i=0;i<60;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await sleep(150);}}assert.ok(port,'Chrome CDP unavailable');const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();cdp=new CDP(pages.find(x=>x.type==='page').webSocketDebuggerUrl);await cdp.connect();browser=await cdp.send('Browser.getVersion');await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 cdp.on('Runtime.exceptionThrown',p=>consoleErrors.push(p.exceptionDetails.text));cdp.on('Runtime.consoleAPICalled',p=>{if(p.type==='error')consoleErrors.push(p.args.map(x=>x.value||x.description||'').join(' '));});
 cdp.on('Network.requestWillBeSent',p=>{if(p.request.url.endsWith('/api/ai/chat')&&p.request.postData){const body=JSON.parse(p.request.postData);requests.push({message:body.message,month:body.month,compareMonth:body.compareMonth,context:body.context});}});
 console.log('Waiting 60s for owner rate window before Chrome NLU tests');await sleep(60000);
 await login(a,password);await fill('#ai-chat-month','2025-05');await fill('#ai-chat-compare-month','2025-04');
 await check('CHROME-NLU-PICKER-OVERRIDE',async()=>{await ask('Tổng chi tháng 2/2024?','Tháng 02/2024');assert.ok(await cdp.eval(`document.querySelector('[role=log]').innerText.includes('0,3 ₫')`));assert.equal(await cdp.eval(`document.querySelector('#ai-chat-month').value`),'2025-05');assert.ok(await cdp.eval(`document.querySelector('[aria-label="Ngữ cảnh hội thoại"]').innerText.includes('02/2024')`));await shot('summary-actual-period');});
 await check('CHROME-NLU-CATEGORIES-CHIPS',async()=>{await ask('Danh mục chi tháng 2/2024','Tháng 02/2024');assert.ok(await cdp.eval(`Boolean(document.querySelector('[aria-label="Biểu đồ chi tiêu theo danh mục"]'))`));assert.ok(await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).some(b=>b.innerText.includes('02/2024'))`));await shot('categories-chart');});
 await check('CHROME-NLU-FOLLOWUP',async()=>{await cdp.eval(`Array.from(document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button')).find(b=>b.innerText==='Còn tháng trước thì sao?').click()`);await waitFor(cdp,`!document.querySelector('[aria-label="Trợ lý đang xử lý"]')`);await waitFor(cdp,`document.querySelector('[aria-label="Ngữ cảnh hội thoại"]').innerText.includes(${JSON.stringify(previous.slice(5)+'/'+previous.slice(0,4))})`);const req=requests.at(-1);assert.deepEqual(req.context,{intent:'CATEGORIES',month:'2024-02'});assert.equal(req.compareMonth,undefined);});
 await check('CHROME-NLU-TWO-MONTHS',async()=>{await ask('So sánh thu chi tháng 2/2024 và tháng 3/2024','133,33%');assert.ok(await cdp.eval(`document.querySelector('[aria-label="Biểu đồ so sánh thu chi"]')!==null`));assert.ok(await cdp.eval(`document.querySelector('[aria-label="Ngữ cảnh hội thoại"]').innerText.includes('03/2024')`));await shot('comparison-chart');});
 for(const width of [320,375,430,768,1440])for(const theme of ['light','dark']){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await cdp.eval(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);await sleep(120);await check(`CHROME-NLU-${width}-${theme}`,async()=>{const m=await cdp.eval(`(()=>{const p=document.querySelector('#ai-assistant-dialog'),log=p.querySelector('[role=log]'),nav=document.querySelector('nav[aria-label="Điều hướng mobile"]');return{documentOverflow:document.documentElement.scrollWidth>innerWidth,panelOverflow:p.scrollWidth>p.clientWidth,logOverflow:log.scrollWidth>log.clientWidth,panelBottom:p.getBoundingClientRect().bottom,navTop:nav.getBoundingClientRect().top,text:log.innerText}})()`);assert.equal(m.documentOverflow,false);assert.equal(m.panelOverflow,false);assert.equal(m.logOverflow,false);if(width<1024)assert.ok(m.panelBottom<=m.navTop);assert.ok(!/NaN|Infinity/.test(m.text));delete m.text;await shot(`live-${width}-${theme}`);return m;});}
 await check('CHROME-NLU-UNKNOWN-CLEARS-CONTEXT',async()=>{await ask('Xin chào','Cần làm rõ');assert.equal(await cdp.eval(`Boolean(document.querySelector('[aria-label="Ngữ cảnh hội thoại"]'))`),false);assert.equal(await cdp.eval(`document.querySelectorAll('[aria-label="Câu hỏi gợi ý"] button').length`),3);await shot('unknown');});
 await check('CHROME-NLU-CLEAR-FOLLOWUP',async()=>{await clear();await ask('Còn tháng trước thì sao?','Cần làm rõ');assert.equal(requests.at(-1).context,undefined);});
 await clear();
 await check('CHROME-NLU-NETWORK-RETRY',async()=>{await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await fill('#ai-chat-input','Tổng chi tháng 2/2024?');await cdp.eval(`document.querySelector('#ai-chat-send-btn').click()`);await waitFor(cdp,`document.querySelector('[role=alert]')`);await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cdp.eval(`document.querySelector('[role=alert] button').click()`);await waitFor(cdp,`document.querySelector('[aria-label="Ngữ cảnh hội thoại"]')?.innerText.includes('02/2024')`);});
 await check('CHROME-NLU-ABORT-STALE-CONTEXT',async()=>{const previousContext=await cdp.eval(`document.querySelector('[aria-label="Ngữ cảnh hội thoại"]').innerText`);await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:1000,downloadThroughput:1000000,uploadThroughput:1000000});await fill('#ai-chat-input','Tổng chi tháng 3/2024');await cdp.eval(`document.querySelector('#ai-chat-send-btn').click()`);await fill('#ai-chat-month','2025-06');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await sleep(1400);assert.equal(await cdp.eval(`document.querySelector('[aria-label="Ngữ cảnh hội thoại"]').innerText`),previousContext);});
 await check('CHROME-NLU-ESCAPE',async()=>{await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',windowsVirtualKeyCode:27});await waitFor(cdp,`!document.querySelector('#ai-assistant-dialog')`);assert.equal(await cdp.eval(`document.activeElement.id`),'ai-assistant-launcher');});
 await check('CHROME-NLU-LOGOUT-A-B',async()=>{await cdp.eval(`document.querySelector('#logout-btn').click()`);await waitFor(cdp,`!document.querySelector('#ai-assistant-launcher')`);await login(b,password);await waitFor(cdp,`document.body.innerText.includes('Chưa có cuộc trò chuyện nào')`);assert.equal(await cdp.eval(`Boolean(document.querySelector('[aria-label="Ngữ cảnh hội thoại"]'))`),false);await ask('Tổng chi tháng 2/2024','999,99 ₫');assert.equal(requests.at(-1).context,undefined);await shot('owner-b');});
 await check('CHROME-NLU-P1-BUDGET',async()=>{await ask('Ngân sách tháng này còn bao nhiêu?','Chưa thiết lập');});
 await check('CHROME-NLU-P1-ADVICE',async()=>{await fill('#ai-chat-input','Tôi nên quản lý chi tiêu như thế nào?');await cdp.eval(`document.querySelector('#ai-chat-send-btn').click()`);await waitFor(cdp,`!document.querySelector('[aria-label="Trợ lý đang xử lý"]')`,40000);let retried=false;if(await cdp.eval(`Boolean(document.querySelector('[role=alert]'))`)){retried=true;await cdp.eval(`document.querySelector('[role=alert] button').click()`);await waitFor(cdp,`!document.querySelector('[aria-label="Trợ lý đang xử lý"]')`,40000);}assert.equal(await cdp.eval(`Boolean(document.querySelector('[role=alert]'))`),false);return{retried};});
 await check('CHROME-NLU-JWT-CLEARS-CONTEXT',async()=>{cdp.on('Fetch.requestPaused',p=>{const headers=Object.entries(p.request.headers).filter(([k])=>k.toLowerCase()!=='authorization').map(([name,value])=>({name,value:String(value)}));headers.push({name:'Authorization',value:'Bearer invalid-qa-jwt'});cdp.send('Fetch.continueRequest',{requestId:p.requestId,headers}).catch(()=>{});});await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*api/ai/chat',requestStage:'Request'}]});await fill('#ai-chat-input','Tổng chi?');await cdp.eval(`document.querySelector('#ai-chat-send-btn').click()`);await waitFor(cdp,`location.pathname==='/login'&&!document.querySelector('#ai-assistant-launcher')`);assert.equal(await cdp.eval(`sessionStorage.getItem('accessToken')===null`),true);await cdp.send('Fetch.disable');});
 await check('CHROME-NLU-CONSOLE',async()=>{assert.deepEqual(consoleErrors,[]);});
 }finally{cdp?.close();chrome.kill();const tempRoot=path.resolve(os.tmpdir())+path.sep;if(path.resolve(profile).startsWith(tempRoot)&&path.basename(profile).startsWith('d13-nlu-chrome-')){try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({date:new Date().toISOString(),browser,results,requests,consoleErrors},null,2));}
 const count=results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});console.log(JSON.stringify(count));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
run().catch(e=>{console.error('QA_STOPPED',e.message);process.exitCode=1;});
