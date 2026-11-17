"""D16-D17 local integration, restore drill and browser environment. No production credentials."""
import argparse, base64, csv, hashlib, io, json, os, re, secrets, socket, subprocess, sys, tempfile, time
import urllib.request, urllib.error
from pathlib import Path
from decimal import Decimal

ROOT = Path(r'F:\RikkeiEdu\personal-finance-management')
FE = Path(r'F:\RikkeiEdu\personal-finance-management-FE')
DB = Path(r'F:\RikkeiEdu\personal-finance-management-DB')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--backend-commit', required=True, help='Expected full SHA of the Backend checkout')
parser.add_argument('--frontend-commit', required=True, help='Expected full SHA of the Frontend checkout')
parser.add_argument('--output', type=Path, help='New evidence directory; existing directories are rejected')
parser.add_argument('--check-only', action='store_true', help='Validate Git revisions only; do not create fixtures')
parser.add_argument('--no-browser', action='store_true', help='Finish and clean up after API/SQL/restore checks')
args = parser.parse_args()

def verify_checkout(root, expected, module):
    if not re.fullmatch(r'[a-f0-9]{40}', expected):
        raise SystemExit('Expected commit must be a full lowercase SHA: ' + module)
    head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if head != expected:
        raise SystemExit('Unexpected ' + module + ' commit; review the checkout before running QA')
    dirty = subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain', '--', module], text=True).strip()
    if dirty:
        raise SystemExit('Uncommitted changes in ' + module + '; record them in a reviewed commit first')
    return head

backend_head = verify_checkout(ROOT, args.backend_commit, 'backend')
frontend_head = verify_checkout(FE, args.frontend_commit, 'frontend')
if args.check_only:
    print(json.dumps({'status': 'PASS', 'backendCommit': backend_head, 'frontendCommit': frontend_head, 'fixturesCreated': False}))
    raise SystemExit(0)

JAR = ROOT / 'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'
build_inputs = [ROOT / 'backend/build.gradle', *(ROOT / 'backend/src/main').rglob('*')]
if not JAR.is_file() or JAR.stat().st_mtime < max(p.stat().st_mtime for p in build_inputs if p.is_file()):
    raise SystemExit('Backend JAR is missing/stale; run gradlew.bat bootJar for the reviewed commit first')
jar_sha256 = hashlib.sha256(JAR.read_bytes()).hexdigest()
OUT = args.output or DB / 'docs/qa/evidence' / ('d16-local-' + time.strftime('%Y%m%dT%H%M%S'))
OUT.mkdir(parents=True, exist_ok=False)
def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]
def run(args, data=None, env=None, timeout=120):
    p = subprocess.run(args, input=data, capture_output=True, text=True, encoding='utf-8', env=env, timeout=timeout)
    if p.returncode:
        (OUT/'last-subprocess-error.log').write_text(p.stdout+'\n'+p.stderr,encoding='utf-8')
        raise RuntimeError(f'{Path(str(args[0])).name}: exit {p.returncode}: {p.stderr[-300:]}')
    return p.stdout.strip()
tests=[]
def check(name, fn):
    try:
        detail=fn(); tests.append({'name':name,'status':'PASS','detail':detail})
    except Exception as e: tests.append({'name':name,'status':'FAIL','detail':str(e)[:500]})
    print(name, tests[-1]['status'], flush=True)
def require(ok, text):
    if not ok: raise AssertionError(text)
cid=app=vite=None
tmp=tempfile.TemporaryDirectory(prefix='se-d16-local-')
db='qa_d16_'+secrets.token_hex(6)
rootpw=secrets.token_urlsafe(32)
dbport, webport, feport=port(),port(),port()
base=f'http://127.0.0.1:{webport}'
auth={}
def sql(q, database=db):
    return run(['docker','exec','-i',cid,'sh','-c','exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --batch --raw --skip-column-names --default-character-set=utf8mb4 '+database],q)
def request(path, owner='A', body=None, method='GET', token=None):
    headers={'Content-Type':'application/json'}
    t=token if token is not None else auth.get(owner,{}).get('accessToken')
    if t: headers['Authorization']='Bearer '+t
    req=urllib.request.Request(base+'/api'+path,headers=headers,method=method,data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req,timeout=30) as r: code,raw=r.status,r.read().decode('utf-8-sig')
    except urllib.error.HTTPError as e: code,raw=e.code,e.read().decode('utf-8-sig')
    try: return code,json.loads(raw,parse_float=Decimal)
    except json.JSONDecodeError: return code,raw
try:
    head=run(['git','-C',str(ROOT),'rev-parse','HEAD'])
    require(head==args.backend_commit,'Backend baseline changed')
    require(verify_checkout(FE,args.frontend_commit,'frontend')==frontend_head,'Frontend baseline changed')
    context=json.loads(run(['docker','context','inspect']))[0]['Endpoints']['docker']['Host']
    require(context.startswith(('npipe:////./pipe/','unix:///')),'Docker must be local')
    env=dict(os.environ, MYSQL_ROOT_PASSWORD=rootpw,MYSQL_DATABASE=db)
    cid=run(['docker','run','--pull=never','--rm','-d','--name','smartexpense-backup-qa-'+secrets.token_hex(6),
        '--label','com.smartexpense.test=d16-local','-p',f'127.0.0.1:{dbport}:3306',
        '-e','MYSQL_ROOT_PASSWORD','-e','MYSQL_DATABASE','mysql:8.0'],env=env)
    require(re.fullmatch('[a-f0-9]{64}',cid),'Unexpected container ID')
    for _ in range(120):
        try: sql('SELECT 1;'); break
        except RuntimeError: time.sleep(1)
    schemas=[ROOT/'backend/src/test/resources/d06-legacy-schema.sql',*sorted((ROOT/'database/migrations').glob('V00[2-6]__*.sql'))]
    require(len(schemas)==6,'Expected MVP schema plus V002-V006')
    sql('\n'.join(p.read_text(encoding='utf-8') for p in schemas))
    require(len(sql('SHOW TABLES;').splitlines())==8,'Expected 8 tables')
    config=Path(tmp.name)/'qa.properties'
    config.write_text('\n'.join(['server.address=127.0.0.1',f'server.port={webport}',
        f'spring.datasource.url=jdbc:mysql://127.0.0.1:{dbport}/{db}?useSSL=false&allowPublicKeyRetrieval=true',
        'spring.datasource.username=root','spring.datasource.password='+rootpw,
        'spring.jpa.hibernate.ddl-auto=validate','spring.jpa.show-sql=false','spring.jpa.open-in-view=false',
        'spring.sql.init.mode=never','app.jwt.secret='+base64.b64encode(secrets.token_bytes(32)).decode(),
        'app.jwt.expiration=3600','logging.level.root=WARN','app.ai.enabled=false']),encoding='utf-8')
    clean={k:v for k,v in os.environ.items() if not k.startswith(('SPRING_','APP_','JWT_','GEMINI_','SMTP_','DB_'))}
    log=(OUT/'backend-local.log').open('wb')
    app=subprocess.Popen(['java','-Xms128m','-Xmx320m','-XX:+UseSerialGC','-jar',str(JAR),
        '--spring.config.location='+config.as_uri()],env=clean,stdout=log,stderr=subprocess.STDOUT)
    for _ in range(120):
        require(app.poll() is None,'Backend exited')
        try:
            if request('/users/me',owner=None)[0]==401: break
        except (urllib.error.URLError,TimeoutError): pass
        time.sleep(1)
    check('MVP plus V002-V006 validates against all 8 JPA tables',lambda: sql('SELECT VERSION();'))
    cats={}
    for owner in ['A','B']:
        body={'fullName':'QA D16 '+owner,'email':'d16-'+owner.lower()+'@example.test','password':'Local-QA-Only-2026!'}
        require(request('/auth/register',owner=None,method='POST',body=body)[0]==201,'Register failed')
        code,a=request('/auth/login',owner=None,method='POST',body={k:body[k] for k in ['email','password']})
        require(code==200,'Login failed');auth[owner]=a
        code,c=request('/categories',owner)
        require(len(c)==17,'Expected 17 private default categories')
        cats[owner]={kind:next(x['id'] for x in c if x['type']==kind) for kind in ['INCOME','EXPENSE']}
    check('Registration creates private 17-category sets for A/B',lambda: require(cats['A']!=cats['B'],'Categories shared'))
    created=[]
    for kind,amount in [('INCOME','200.10'),('EXPENSE','80.00')]:
        code,t=request('/transactions',method='POST',body={'categoryId':cats['A'][kind],'type':kind,'amount':amount,'transactionDate':'2026-11-15','note':'Kiểm tra tiếng Việt '+kind})
        require(code==201,'Transaction creation failed');created.append(t)
    request('/budgets/2026/11',method='PUT',body={'amountLimit':'100.00'})
    request('/category-budgets',method='POST',body={'categoryId':cats['A']['EXPENSE'],'year':2026,'month':11,'amountLimit':'79.99'})
    code,template=request('/recurring-templates',method='POST',body={'categoryId':cats['A']['EXPENSE'],'type':'EXPENSE','amount':15.50,'dayOfMonth':5,'note':'Khoản định kỳ','active':True})
    require(code==201 or code==200,'Recurring template creation failed')
    def oracle():
        code,d=request('/dashboard/summary?month=2026-11'); rcode,r=request('/reports/monthly?from=2026-11&to=2026-11')
        require(code==rcode==200,'Dashboard/report HTTP')
        for k,v in [('totalIncome','200.10'),('totalExpense','80.00'),('balance','120.10')]:
            require(d[k]==r['months'][0][k]==Decimal(v),'Money mismatch '+k)
        inc,exp=map(Decimal,sql("SELECT SUM(CASE WHEN type='INCOME' THEN amount ELSE 0 END),SUM(CASE WHEN type='EXPENSE' THEN amount ELSE 0 END) FROM transactions WHERE user_id="+str(auth['A']['user']['id'])).split('\t'))
        require(inc==Decimal('200.10') and exp==Decimal('80.00'),'SQL mismatch')
        return {'income':str(inc),'expense':str(exp),'balance':str(inc-exp)}
    check('SQL/API Dashboard and Reports exact cents',oracle)
    for endpoint in ['/transactions/'+str(created[0]['id']),'/recurring-templates/'+str(template['id'])]:
        check('B cannot read A '+endpoint,lambda ep=endpoint:require(request(ep,'B')[0]==404,'Owner leak'))
    check('B cannot write A transaction',lambda:require(request('/transactions/'+str(created[0]['id']),'B',method='PUT',body={'categoryId':cats['B']['INCOME'],'type':'INCOME','amount':'200.10','transactionDate':'2026-11-15','note':'forbidden'})[0]==404,'Owner write allowed'))
    check('A cannot use B category',lambda:require(request('/transactions',method='POST',body={'categoryId':cats['B']['EXPENSE'],'type':'EXPENSE','amount':'1.00','transactionDate':'2026-11-15'})[0]==400,'Foreign category accepted'))
    def export():
        code,raw=request('/transactions/export?month=2026-11')
        rows=list(csv.DictReader(io.StringIO(raw)))
        require(code==200 and len(rows)==2 and any('Kiểm tra tiếng Việt' in x['Ghi chú'] for x in rows),'CSV mismatch')
        require(request('/transactions/export?month=2026-11','B')[1].count('\n')==1,'CSV owner leak')
        return {'rows':len(rows),'utf8':'PASS'}
    check('CSV UTF-8, filter and A/B isolation',export)
    for endpoint in ['/transactions','/reports/monthly?from=2026-11&to=2026-11','/transactions/export']:
        check('Anonymous rejected '+endpoint,lambda ep=endpoint:require(request(ep,owner=None)[0]==401,'Anonymous allowed'))
    dump=Path(tmp.name)/'source.sql'; env2=dict(os.environ,DB_ROOT_PASSWORD=rootpw)
    env2['PSModulePath']=str(Path(os.environ['SystemRoot'])/'System32/WindowsPowerShell/v1.0/Modules')
    name=run(['docker','inspect','--format','{{.Name}}',cid]).lstrip('/')
    ps=run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(DB/'scripts/test-db-scripts.ps1'),'-ContainerName',name,'-RootPassword',rootpw],env=env2)
    (OUT/'backup-script-tests.log').write_text(ps,encoding='utf-8')
    check('Backup/restore scripts, decimals, UTF-8, failures and unsafe names',lambda:require('Passed: 22' in ps,'Expected 22 script tests'))
    dumpdir=Path(tmp.name)/'full backup'
    run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(DB/'scripts/backup-db.ps1'),'-ContainerName',name,'-DbName',db,'-BackupDir',str(dumpdir)],env=env2)
    dump=next(dumpdir.glob('*.sql')); restored=db+'_restored';sql('CREATE DATABASE '+restored+' CHARACTER SET utf8mb4;')
    copy=Path(tmp.name)/'restore.sql';copy.write_text(dump.read_text(encoding='utf-8').replace(db,restored),encoding='utf-8')
    run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(DB/'scripts/restore-db.ps1'),'-ContainerName',name,'-DbName',restored,'-BackupFile',str(copy)],env=env2)
    def restore_check():
        checks={}
        for table in sql('SHOW TABLES;').splitlines():
            before=sql('CHECKSUM TABLE '+table+' EXTENDED;').split('\t')[-1]
            after=sql('CHECKSUM TABLE '+table+' EXTENDED;',restored).split('\t')[-1]
            require(before==after and before.isdigit(),'Checksum mismatch '+table);checks[table]=before
        return {'tables':len(checks),'checksumMatch':True,'dumpSha256':hashlib.sha256(dump.read_bytes()).hexdigest()}
    check('Full 8-table backup restored to isolated schema with matching checksums',restore_check)
    (OUT/'api-sql-restore-results.json').write_text(json.dumps({'baseline':head,'frontendCommit':frontend_head,'backendJarSha256':jar_sha256,'tests':tests,'status':'PASS' if all(x['status']=='PASS' for x in tests) else 'FAIL'},ensure_ascii=False,indent=2),encoding='utf-8')
    require(all(x['status']=='PASS' for x in tests),'API/SQL/restore failed; browser QA is not ready')
    if args.no_browser:
        print('API_SQL_RESTORE_PASS',flush=True)
        raise SystemExit(0)
    # Vite config lives in an ephemeral directory and points only to this local API.
    js=Path(tmp.name)/'vite.mjs'
    vite_uri=(FE/'frontend/node_modules/vite/dist/node/index.js').as_uri()
    options={'root':str(FE/'frontend'),'configFile':str(FE/'frontend/vite.config.js'),'define':{'import.meta.env.VITE_API_URL':json.dumps('/api')},'server':{'host':'127.0.0.1','port':feport,'strictPort':True,'proxy':{'/api':{'target':base}}}}
    js.write_text('import {createServer} from '+json.dumps(vite_uri)+'; const s=await createServer('+json.dumps(options)+");await s.listen();console.log('READY');",encoding='utf-8')
    vLog=(OUT/'vite-local.log').open('wb');vite=subprocess.Popen(['node',str(js)],stdout=vLog,stderr=subprocess.STDOUT,env=clean)
    (OUT/'environment.json').write_text(json.dumps({'frontend':f'http://127.0.0.1:{feport}','backend':base,'containerId':cid,'mysql':sql('SELECT VERSION();'),'baseline':head,'frontendCommit':frontend_head,'backendJarSha256':jar_sha256,'schemaFiles':[str(x.relative_to(ROOT)) for x in schemas]},indent=2),encoding='utf-8')
    print('BROWSER_READY http://127.0.0.1:'+str(feport),flush=True)
    input('Press Enter after browser QA to clean up this owned environment: ')
finally:
    for process in [vite,app]:
        if process and process.poll() is None:
            process.terminate()
            try: process.wait(timeout=20)
            except subprocess.TimeoutExpired: process.kill();process.wait()
    container_removed = None
    if cid and re.fullmatch('[a-f0-9]{64}',cid):
        container_removed = subprocess.run(['docker','rm','-f',cid],capture_output=True).returncode == 0
    tmp.cleanup()
    (OUT/'cleanup.json').write_text(json.dumps({'ownedContainerRemoved':container_removed,'backendStopped':not app or app.poll() is not None,'viteStopped':not vite or vite.poll() is not None,'temporaryConfigRemoved':not Path(tmp.name).exists()},indent=2),encoding='utf-8')
    print('CLEANUP COMPLETE',flush=True)
