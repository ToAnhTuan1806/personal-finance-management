"""D15: disposable local MySQL 8, migrated schema, Decimal SQL oracle, real HTTP/Chrome.

No external database option. Passwords/JWT stay in memory or a temporary private
runtime directory; evidence never contains credentials. Cleanup targets only
the full container ID returned by this invocation.
"""
from __future__ import annotations
import base64
import csv
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

ROOT = Path(__file__).resolve().parents[2]
RUN_NAME = os.environ.get('D15_RUN_NAME', 'd15-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6])
assert re.fullmatch(r'd15-[a-zA-Z0-9-]+', RUN_NAME)
OUT = ROOT / 'docs/qa/evidence' / RUN_NAME
MONTHS = ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']
LIMITS = ['100.00', '10000.00', '100.00', '120.40', '120.40', None]
SPENT = ['79.99', '7999.99', '80.00', '120.40', '120.41', '0.00']


def run(args, data=None, env=None, timeout=90):
    p = subprocess.run(args, input=data, capture_output=True, encoding='utf-8', env=env, timeout=timeout)
    if p.returncode:
        raise RuntimeError(f'{Path(args[0]).name} exit {p.returncode}')
    return p.stdout.strip()


def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def next_month(month):
    y, m = map(int, month.split('-'))
    return f'{y + (m == 12):04d}-{m % 12 + 1:02d}'


def require(value, message):
    if not value:
        raise AssertionError(message)


class QA:
    def __init__(self):
        self.results = []
        self.evidence = {'task': 'SE2-D15-DB', 'startedUtc': datetime.now(timezone.utc).isoformat(),
                         'baseline': run(['git', 'rev-parse', 'HEAD']), 'tests': self.results,
                         'initialCleanGate': 'BLOCKED: two pre-existing untracked files of unknown origin'}
        self.container = self.app = self.temp = self.log = None
        self.db = 'se_d15_qa_' + uuid.uuid4().hex
        self.password = secrets.token_urlsafe(32)
        self.key = secrets.token_bytes(32)
        self.dbport, self.webport = port(), port()
        self.base = f'http://127.0.0.1:{self.webport}'
        self.auth = {}

    def check(self, ident, action):
        try:
            detail = action()
            self.results.append({'id': ident, 'status': 'PASS', 'detail': detail})
        except AssertionError as e:
            self.results.append({'id': ident, 'status': 'FAIL', 'detail': str(e)})
        except Exception as e:
            self.results.append({'id': ident, 'status': 'ERROR', 'detail': type(e).__name__ + ': ' + str(e)})
        print(ident, self.results[-1]['status'], flush=True)

    def sql(self, sql, root=False):
        require(bool(self.container) and bool(re.fullmatch(r'se_d15_qa_[a-f0-9]{32}', self.db)), 'Unsafe SQL target')
        command = 'exec mysql --batch --raw --skip-column-names --default-character-set=utf8mb4 '
        command += '-uroot -p"$MYSQL_ROOT_PASSWORD"' if root else '-u"$MYSQL_USER" -p"$MYSQL_PASSWORD"'
        return run(['docker', 'exec', '-i', self.container, 'sh', '-c', command + ' "$MYSQL_DATABASE"'], data=sql)

    def request(self, path, owner='A', token=None, body=None, method='GET'):
        headers = {'Content-Type': 'application/json'}
        auth = self.auth.get(owner, {}).get('accessToken') if token is None else token
        if auth:
            headers['Authorization'] = 'Bearer ' + auth
        req = urllib.request.Request(self.base + '/api' + path, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                code, raw = r.status, r.read().decode('utf-8-sig')
        except urllib.error.HTTPError as e:
            code, raw = e.code, e.read().decode('utf-8-sig')
        try:
            return code, json.loads(raw, parse_float=Decimal)
        except json.JSONDecodeError:
            return code, raw

    def setup(self):
        require(run(['git', 'branch', '--show-current']) == 'feature/quynh', 'Wrong branch')
        require(run(['git', 'rev-parse', 'HEAD']) == run(['git', 'rev-parse', 'origin/dev']), 'Baseline differs from dev')
        for commit in ['9638350b16691ea0dea236e37938ceeff4767c53', '8317699f39e6b95c79ceff4ddd7b7ad5977363e5']:
            run(['git', 'merge-base', '--is-ancestor', commit, 'HEAD'])
        context = json.loads(run(['docker', 'context', 'inspect']))[0]['Endpoints']['docker']['Host']
        require(context.startswith('npipe:////./pipe/') or context.startswith('unix:///'), 'Docker must be local')
        jar = ROOT / 'backend/build/libs/backend-0.0.1-SNAPSHOT.jar'
        require(jar.is_file(), 'Build bootJar first')
        sources = [ROOT / p for p in run(['git', 'ls-files', 'backend/src/main', 'frontend/src']).splitlines()]
        self.evidence['sourceHashes'] = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in sources}
        self.evidence['jarSha256'] = sha(jar.read_bytes())
        env = dict(os.environ, MYSQL_ROOT_PASSWORD=secrets.token_urlsafe(32), MYSQL_PASSWORD=self.password,
                   MYSQL_DATABASE=self.db, MYSQL_USER='d15_qa')
        self.container = run(['docker', 'run', '--pull=never', '--rm', '-d', '--name', 'se-d15-' + uuid.uuid4().hex[:12],
                              '--label', 'com.smartexpense.test=d15-db', '-p', f'127.0.0.1:{self.dbport}:3306',
                              '-e', 'MYSQL_ROOT_PASSWORD', '-e', 'MYSQL_PASSWORD', '-e', 'MYSQL_DATABASE', '-e', 'MYSQL_USER', 'mysql:8.0'], env=env)
        require(bool(re.fullmatch('[a-f0-9]{64}', self.container)), 'Invalid new container ID')
        deadline = time.monotonic() + 120
        while True:
            try:
                metadata = self.sql('SELECT DATABASE(),CURRENT_USER(),VERSION();').split('\t')
                require(metadata[0] == self.db and metadata[1].startswith('d15_qa@') and metadata[2].startswith('8.'), 'Wrong DB')
                break
            except RuntimeError:
                require(time.monotonic() < deadline, 'MySQL startup timed out')
                time.sleep(1)
        self.evidence['environment'] = {'mysql': metadata[2], 'database': self.db, 'containerId': self.container,
                                        'dockerEndpoint': context, 'hibernate': 'validate', 'transport': '127.0.0.1 only'}
        schema = [ROOT / 'backend/src/test/resources/d06-legacy-schema.sql', *sorted((ROOT / 'database/migrations').glob('V00[2-6]__*.sql'))]
        require(len(schema) == 6, 'Expected existing MVP and V002-V006')
        self.sql('\n'.join(p.read_text(encoding='utf-8') for p in schema))
        self.evidence['schemaInputs'] = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in schema}
        self.temp = tempfile.TemporaryDirectory(prefix='se-d15-')
        config = Path(self.temp.name) / 'qa.properties'
        config.write_text('\n'.join([
            'server.address=127.0.0.1', f'server.port={self.webport}',
            f'spring.datasource.url=jdbc:mysql://127.0.0.1:{self.dbport}/{self.db}?useSSL=false&allowPublicKeyRetrieval=true',
            'spring.datasource.username=d15_qa', 'spring.datasource.password=' + self.password,
            'spring.jpa.hibernate.ddl-auto=validate', 'spring.jpa.generate-ddl=false',
            'spring.sql.init.mode=never', 'spring.jpa.open-in-view=false', 'spring.jpa.show-sql=false',
            'app.jwt.secret=' + base64.b64encode(self.key).decode(), 'app.jwt.expiration=3600000',
            'logging.level.root=WARN', 'logging.level.org.springframework=WARN',
            'logging.level.org.hibernate.SQL=OFF', 'logging.level.com.smartexpense=WARN',
            'app.ai.enabled=false']), encoding='utf-8')
        self.log = (OUT / 'live-backend.log').open('wb')
        app_env = {k: v for k, v in os.environ.items() if not k.startswith(('SPRING_', 'APP_', 'JWT_', 'GEMINI_', 'DEBUG'))}
        self.app = subprocess.Popen(['java', '-jar', str(jar), '--spring.config.location=' + config.as_uri(),
                                     '--logging.level.org.springframework=WARN', '--logging.level.org.hibernate.SQL=OFF',
                                     '--logging.level.com.smartexpense=WARN'], env=app_env, stdout=self.log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 100
        while True:
            require(self.app.poll() is None, 'Backend failed startup; see live-backend.log')
            try:
                if self.request('/dashboard/summary?month=2026-12', owner=None)[0] == 401:
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            require(time.monotonic() < deadline, 'Backend startup timeout')
            time.sleep(1)
        for owner in ['A', 'B']:
            email = 'd15-' + owner.lower() + '-' + uuid.uuid4().hex + '@example.test'
            password = secrets.token_urlsafe(24)
            code, user = self.request('/auth/register', owner=None, body={'fullName': 'QA D15 ' + owner, 'email': email, 'password': password}, method='POST')
            require(code == 201, 'Register failed')
            code, auth = self.request('/auth/login', owner=None, body={'email': email, 'password': password}, method='POST')
            require(code == 200 and auth['user']['id'] == user['id'], 'Login failed')
            self.auth[owner] = auth
        self.cats = {}
        for owner in ['A', 'B']:
            self.cats[owner] = {}
            for kind in ['INCOME', 'EXPENSE']:
                code, cat = self.request('/categories', owner, body={'name': f'D15_{owner}_{kind}', 'type': kind}, method='POST')
                require(code == 201, 'Category fixture failed')
                self.cats[owner][kind] = cat['id']
        code, other_cat = self.request('/categories', body={'name': 'D15_A_EXPENSE_OTHER', 'type': 'EXPENSE'}, method='POST')
        require(code == 201, 'Second expense category fixture failed')
        self.other_cat = other_cat['id']
        for month, spent, limit in zip(MONTHS, SPENT, LIMITS):
            y, m = map(int, month.split('-'))
            for owner in ['A', 'B']:
                uid = self.auth[owner]['user']['id']
                if owner == 'A' and month == '2027-02':
                    continue
                values = [('INCOME', '9999999.99' if owner == 'B' else '200.10'),
                          ('EXPENSE', '999999.99' if owner == 'B' else spent)]
                if owner == 'A' and month == '2026-12':
                    values = [('INCOME', a) for a in ['100.10', '20.05', '0.25']] + [('EXPENSE', a) for a in ['100.10', '20.05', '0.25']]
                for i, (kind, amount) in enumerate(values):
                    category_id = self.other_cat if owner == 'A' and month == '2026-12' and kind == 'EXPENSE' and amount == '0.25' else self.cats[owner][kind]
                    self.sql(f"INSERT INTO transactions(user_id,category_id,type,amount,transaction_date,note,created_at) VALUES ({uid},{category_id},'{kind}',{amount},'{month}-{'01' if i == 0 else '28'}','D15_{owner}_{month}_{i}',NOW(6));")
                if limit is not None or owner == 'B':
                    value = limit if owner == 'A' else '2000000.00'
                    # Fixtures deliberately include client userId; later checks prove owner remains JWT.
                    code, _ = self.request(f'/budgets/{y}/{m}', owner, body={'amountLimit': value, 'userId': self.auth['B' if owner == 'A' else 'A']['user']['id']}, method='PUT')
                    require(code == 200, 'Monthly budget fixture failed')
                    category_limit = '120.15' if owner == 'A' and month == '2026-12' else value
                    code, _ = self.request('/category-budgets', owner, body={'categoryId': self.cats[owner]['EXPENSE'], 'year': y, 'month': m, 'amountLimit': category_limit, 'userId': self.auth['B' if owner == 'A' else 'A']['user']['id']}, method='POST')
                    require(code == 200, 'Category budget fixture failed')
                    if owner == 'A' and month == '2026-12':
                        code, _ = self.request('/category-budgets', body={'categoryId': self.other_cat, 'year': y, 'month': m, 'amountLimit': '1.00'}, method='POST')
                        require(code == 200, 'Second category budget fixture failed')
        self.evidence['owners'] = {o: a['user']['id'] for o, a in self.auth.items()}
        self.evidence['fixture'] = [{'month': m, 'spent': s, 'limit': l} for m, s, l in zip(MONTHS, SPENT, LIMITS)]
        self.evidence['categoryFixtureDecember'] = {'primaryId': self.cats['A']['EXPENSE'], 'primarySpent': '120.15',
            'primaryLimit': '120.15', 'otherId': self.other_cat, 'otherSpent': '0.25', 'otherLimit': '1.00'}
        self.evidence['harnessSha256'] = {p.name: sha(p.read_bytes()) for p in (ROOT / 'scripts/qa').glob('d15_*') if p.is_file()}

    def oracle(self, owner, month):
        uid = self.auth[owner]['user']['id']
        query = ("SELECT COALESCE(SUM(CASE WHEN type='INCOME' THEN amount ELSE 0 END),0),"
                 "COALESCE(SUM(CASE WHEN type='EXPENSE' THEN amount ELSE 0 END),0) "
                 f"FROM transactions WHERE user_id={uid} AND transaction_date>='{month}-01' AND transaction_date<'{next_month(month)}-01';")
        inc, exp = map(Decimal, self.sql(query).split('\t'))
        return {'month': month, 'totalIncome': inc, 'totalExpense': exp, 'balance': inc - exp, 'sql': query}

    def snapshot(self):
        tables = self.sql('SHOW TABLES;').splitlines()
        result = {}
        for table in tables:
            require(bool(re.fullmatch('[a-z_]+', table)), 'Unsafe table identifier')
            result[table] = {'rows': int(self.sql(f'SELECT COUNT(*) FROM `{table}`;')),
                             'sha256': sha(self.sql(f'SELECT * FROM `{table}` ORDER BY id;').encode())}
        writes = self.sql("SELECT OBJECT_NAME,COUNT_WRITE FROM performance_schema.table_io_waits_summary_by_table WHERE OBJECT_SCHEMA=DATABASE() ORDER BY OBJECT_NAME;", root=True)
        require(bool(writes), 'Missing performance_schema write counters')
        return {'tables': result, 'writeCounters': writes}

    def reconcile(self, owner, month, spoof=False):
        expected = self.oracle(owner, month)
        extra = '&userId=' + str(self.auth['B' if owner == 'A' else 'A']['user']['id']) if spoof else ''
        code, dash = self.request('/dashboard/summary?month=' + month + extra, owner)
        require(code == 200, f'Dashboard HTTP {code}')
        code, report = self.request(f'/reports/monthly?from={month}&to={month}' + extra, owner)
        require(code == 200 and len(report['months']) == 1, 'Report HTTP/shape')
        for key in ['totalIncome', 'totalExpense', 'balance']:
            require(dash[key] == report['months'][0][key] == expected[key], f'{key} differs: SQL={expected[key]}, Dashboard={dash[key]}, Report={report["months"][0][key]}')
        code, cats = self.request('/dashboard/expenses-by-category?month=' + month + extra, owner)
        require(code == 200 and cats == report['expensesByCategory'], 'Category chart differs from report')
        require(sum((c['totalAmount'] for c in cats), Decimal('0')) == expected['totalExpense'], 'Category sum differs')
        return {'sql': expected, 'dashboard': dash, 'report': report, 'spoofedUserId': spoof}

    def budget(self, owner, month, limit):
        y, m = map(int, month.split('-'))
        other = self.auth['B' if owner == 'A' else 'A']['user']['id']
        code, data = self.request(f'/budgets/{y}/{m}?userId={other}', owner)
        ccode, cats = self.request(f'/category-budgets?year={y}&month={m}&userId={other}', owner)
        if limit is None:
            require(code == 404 and ccode == 200 and cats == [], 'NOT_SET must be 404/empty, never a zero budget')
            return {'http': code, 'categoryBudgets': cats, 'displayExpected': 'NOT_SET'}
        exp = self.oracle(owner, month)['totalExpense']
        amount = Decimal(limit)
        expected = {'amountLimit': amount, 'spentAmount': exp, 'remainingAmount': amount - exp, 'exceeded': exp > amount}
        require(code == ccode == 200 and len(cats) == (2 if owner == 'A' and month == '2026-12' else 1), 'Budget status/shape')
        for field, value in expected.items():
            require(data[field] == value, f'{field} differs from SQL {value}')
        category_oracles = []
        for cat in cats:
            uid = self.auth[owner]['user']['id']
            require(cat['categoryId'] in [self.cats[owner]['EXPENSE'], self.other_cat] and cat['year'] == y and cat['month'] == m, 'Category owner/period mismatch')
            query = f"SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id={uid} AND category_id={cat['categoryId']} AND type='EXPENSE' AND transaction_date>='{month}-01' AND transaction_date<'{next_month(month)}-01';"
            cspent = Decimal(self.sql(query))
            clim = Decimal('1.00') if cat['categoryId'] == self.other_cat else Decimal('120.15') if owner == 'A' and month == '2026-12' else amount
            require(cat['spentAmount'] == cspent and cat['amountLimit'] == clim and cat['remainingAmount'] == clim - cspent and cat['exceeded'] == (cspent > clim), 'Category SQL cents mismatch')
            cstatus = 'OVER_BUDGET' if cspent >= clim else 'WARNING' if cspent * 5 >= clim * 4 else 'SAFE'
            require(cat['status'] == cstatus, 'Category exact threshold mismatch')
            require(cat['usagePercentage'] == (cspent * 100 / clim).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP), 'Category rounded percentage mismatch')
            category_oracles.append({'sql': query, 'spent': cspent, 'limit': clim, 'status': cstatus})
        # D07 API enum intentionally uses OVER_BUDGET at equality; FE D15 must show AT_LIMIT.
        api_status = 'OVER_BUDGET' if exp >= amount else 'WARNING' if exp * 5 >= amount * 4 else 'SAFE'
        require(cats[0]['status'] == api_status, 'Primary category raw status mismatch')
        display = 'OVER_BUDGET' if exp > amount else 'AT_LIMIT' if exp == amount else 'WARNING' if exp * 5 >= amount * 4 else 'SAFE'
        return {'monthly': data, 'categories': cats, 'categoryOracles': category_oracles, 'displayExpected': display,
                'exactPercentage': str(exp * 100 / amount), 'display2dp': str((exp * 100 / amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
                'overspent': max(Decimal('0'), exp - amount)}

    def expired(self):
        encode = lambda data: base64.urlsafe_b64encode(data).rstrip(b'=').decode()
        header = encode(b'{"alg":"HS256"}')
        payload = encode(json.dumps({'sub': str(self.auth['A']['user']['id']), 'iat': int(time.time()) - 1200, 'exp': int(time.time()) - 600}).encode())
        signed = header + '.' + payload
        return signed + '.' + encode(hmac.new(self.key, signed.encode(), hashlib.sha256).digest())

    def auth_check(self, path, token):
        code, body = self.request(path, token=token)
        require(code == 401 and body['code'] == 'UNAUTHORIZED', f'Expected 401, got {code}')
        return {'path': path, 'http': code}

    def checks(self):
        self.evidence['beforeReads'] = self.snapshot()
        for owner in ['A', 'B']:
            for month in MONTHS:
                self.check(f'RECONCILE-{owner}-{month}', lambda o=owner, m=month: self.reconcile(o, m))
        for month, limit in zip(MONTHS, LIMITS):
            self.check('BUDGET-A-' + month, lambda m=month, l=limit: self.budget('A', m, l))
        self.check('BUDGET-B-LARGE', lambda: self.budget('B', '2026-12', '2000000.00'))
        for owner in ['A', 'B']:
            self.check('OWNER-QUERY-' + owner, lambda o=owner: self.reconcile(o, '2026-12', True))
        self.check('OWNER-GET-BODY', self.owner_body)
        self.check('RANGE-CROSS-YEAR-EMPTY', self.range_check)
        self.check('DELTA-TARGET-MINUS-BASE', self.delta_check)
        self.check('CSV-DECIMALS-OWNER', self.csv_check)
        paths = ['/dashboard/summary?month=2026-12', '/dashboard/expenses-by-category?month=2026-12',
                 '/reports/monthly?from=2026-12&to=2027-02', '/budgets/2026/12', '/category-budgets?year=2026&month=12', '/transactions/export?month=2026-12']
        for i, path in enumerate(paths):
            for kind, token in [('MISSING', ''), ('INVALID', 'invalid.jwt.token'), ('EXPIRED', self.expired())]:
                self.check(f'JWT-{i + 1}-{kind}', lambda p=path, t=token: self.auth_check(p, t))
        _, cats_b = self.request('/category-budgets?year=2026&month=12', 'B')
        self.check('OWNER-CATEGORY-B-ID', lambda: self.owner_id(cats_b[0]['id']))
        self.evidence['afterHttpReads'] = self.snapshot()
        self.check('ZERO-MUTATION-HTTP', lambda: self.no_mutation('afterHttpReads'))

    def owner_id(self, ident):
        code, _ = self.request(f'/category-budgets/{ident}')
        require(code == 404, f'Foreign budget returned {code}')
        return {'foreignBudgetId': ident, 'http': code}

    def owner_body(self):
        code, data = self.request('/dashboard/summary?month=2026-12', body={'userId': self.auth['B']['user']['id']})
        require(code == 200 and data['totalIncome'] == Decimal('120.40') and data['totalExpense'] == Decimal('120.40'), 'GET body changed JWT owner')
        return {'http': code, 'summary': data, 'spoofedUserId': self.auth['B']['user']['id']}

    def range_check(self):
        code, report = self.request('/reports/monthly?from=2026-09&to=2027-02')
        expected = [{k: v for k, v in self.oracle('A', m).items() if k != 'sql'} for m in MONTHS]
        require(code == 200 and report['months'] == expected, 'Missing empty month, order or year boundary mismatch')
        return report

    def delta_check(self):
        base, target = self.oracle('A', '2026-12'), self.oracle('A', '2027-01')
        result = {k: target[k] - base[k] for k in ['totalIncome', 'totalExpense', 'balance']}
        require(result == {'totalIncome': Decimal('79.70'), 'totalExpense': Decimal('0.01'), 'balance': Decimal('79.69')}, 'Delta oracle differs')
        # This proves oracle arithmetic; browser separately checks actual rendered deltas.
        return {'base': base, 'target': target, 'delta': result, 'scope': 'SQL oracle only'}

    def csv_check(self):
        code, raw = self.request('/transactions/export?startDate=2026-12-01&endDate=2027-02-28')
        require(code == 200 and isinstance(raw, str), 'CSV response missing')
        rows = list(csv.reader(io.StringIO(raw)))
        require(len(rows) == 9 and '999999' not in raw, f'Unexpected CSV rows {len(rows)} / foreign data')
        for value in ['100.10', '20.05', '0.25', '120.41']:
            require(any(value in row for row in rows), 'CSV missing exact amount ' + value)
        (OUT / 'export-A.csv.log').write_text(raw, encoding='utf-8')
        return {'dataRows': len(rows) - 1, 'sha256': sha(raw.encode()), 'headers': rows[0]}

    def no_mutation(self, key):
        require(self.evidence['beforeReads'] == self.evidence[key], 'Read APIs changed rows or performance_schema COUNT_WRITE')
        return {'snapshot': key, 'equal': True}

    def browser(self):
        payload = {'backend': self.base, 'auth': self.auth, 'outputName': OUT.name}
        with (OUT / 'browser-run.log').open('wb') as log:
            p = subprocess.run(['node', str(ROOT / 'scripts/qa/d15_browser_qa.mjs')], input=json.dumps(payload).encode(), stdout=log, stderr=subprocess.STDOUT, timeout=360)
        self.evidence['browserExitCode'] = p.returncode
        self.evidence['afterBrowserReads'] = self.snapshot()
        self.check('ZERO-MUTATION-BROWSER', lambda: self.no_mutation('afterBrowserReads'))

    def finish(self):
        self.evidence['sourceUnchanged'] = all(sha((ROOT / name).read_bytes()) == digest for name, digest in self.evidence.get('sourceHashes', {}).items())
        if self.app:
            self.app.terminate()
            try:
                self.app.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.app.kill()
                self.app.wait(timeout=10)
        if self.log:
            self.log.close()
        if self.container:
            try:
                run(['docker', 'rm', '-f', self.container])
                self.evidence['cleanup'] = 'PASS: only newly created container removed (including all fixtures)'
            except Exception:
                self.evidence['cleanup'] = 'ERROR: check container ID in environment'
        if self.temp:
            self.temp.cleanup()
        self.evidence['counts'] = {s: sum(t['status'] == s for t in self.results) for s in ['PASS', 'FAIL', 'ERROR', 'SKIPPED']}
        self.evidence['finishedUtc'] = datetime.now(timezone.utc).isoformat()
        self.evidence['status'] = 'BLOCKED' if 'environmentError' in self.evidence else 'FAIL' if any(t['status'] != 'PASS' for t in self.results) else 'PARTIAL: initial clean gate blocked'
        (OUT / 'live-results.json').write_text(json.dumps(self.evidence, indent=2, ensure_ascii=False, default=str), encoding='utf-8')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    if (OUT / 'live-results.json').exists():
        raise SystemExit('Evidence already exists; choose a fresh D15_RUN_NAME')
    qa = QA()
    try:
        qa.setup()
        qa.checks()
        qa.browser()
    except Exception as error:
        qa.evidence['environmentError'] = type(error).__name__ + ': ' + str(error)
        print('ENVIRONMENT ERROR', qa.evidence['environmentError'], flush=True)
    finally:
        qa.finish()
