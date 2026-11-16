"""Targeted real-browser verification of FE D15 fixes. Never edits the FE worktree."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal

ROOT = Path(__file__).resolve().parents[2]
FE = Path(r'F:\RikkeiEdu\personal-finance-management-FE')
NAME = os.environ.get('D15_TARGETED_RUN', 'd15-fix-targeted-r1')
assert NAME.startswith('d15-fix-targeted-') and Path(NAME).name == NAME
OUT = ROOT / 'docs/qa/evidence' / NAME
# Reuse the tested disposable-container/migration/bootstrap helpers, not the 35-case suite.
os.environ['D15_RUN_NAME'] = NAME
import d15_financial_qa as shared


def git(*args):
    return subprocess.check_output(['git', '-C', str(FE), *args], encoding='utf-8').strip()


def snapshot_git():
    return {'head': git('rev-parse', 'HEAD'), 'branch': git('branch', '--show-current'),
            'statusShortBranch': git('status', '--short', '--branch'), 'porcelain': git('status', '--porcelain=v1', '--untracked-files=all'),
            'stash': git('stash', 'list'),
            'sourceHashes': {p: hashlib.sha256((FE / p).read_bytes()).hexdigest()
                             for p in git('ls-files', 'frontend/src', 'frontend/tests', 'frontend/vite.config.js', 'frontend/package.json', 'frontend/package-lock.json').splitlines()}}


def main():
    if OUT.exists():
        raise SystemExit('Evidence directory exists; choose a fresh D15_TARGETED_RUN')
    before = snapshot_git()
    gates = before['branch'] == 'feature/trang' and not before['porcelain']
    for commit in ['c4add4f', '7716cc5']:
        gates = gates and subprocess.run(['git', '-C', str(FE), 'merge-base', '--is-ancestor', commit, 'HEAD']).returncode == 0
    if not gates:
        print('BLOCKED: FE baseline/working tree gate failed; no environment started')
        raise SystemExit(2)
    OUT.mkdir(parents=True)
    (OUT / 'git-before.json').write_text(json.dumps(before, indent=2, ensure_ascii=False), encoding='utf-8')
    (OUT / 'git-before.log').write_text(before['statusShortBranch'] + '\nHEAD ' + before['head'] + '\n' + before['stash'] + '\n', encoding='utf-8')
    qa = shared.QA()
    evidence = {'task': 'D15 frontend fix targeted Browser QA', 'startedUtc': datetime.now(timezone.utc).isoformat(),
                'frontendHead': before['head'], 'frontendWorktree': str(FE), 'baselineGate': 'PASS',
                'backendHead': shared.run(['git', 'rev-parse', 'HEAD']), 'oracle': [], 'tests': [], 'cleanup': {'status': 'NOT_RUN'}}
    try:
        qa.setup()
        email = 'd15-fix-' + secrets.token_hex(8) + '@example.test'
        password = secrets.token_urlsafe(24)
        code, user = qa.request('/auth/register', owner=None, body={'fullName': 'QA D15 Fix Targeted', 'email': email, 'password': password}, method='POST')
        assert code == 201, 'Targeted registration failed'
        code, auth = qa.request('/auth/login', owner=None, body={'email': email, 'password': password}, method='POST')
        assert code == 200, 'Targeted login failed'
        qa.auth['TARGET'] = auth
        _, categories = qa.request('/categories', 'TARGET')
        cats = {kind: next(c['id'] for c in categories if c['type'] == kind) for kind in ['INCOME', 'EXPENSE']}
        matrix = [('2026-11', '200.10', '80.00', '120.10'), ('2026-10', '0.01', '0.02', '-0.01')]
        for month, income, expense, balance in matrix:
            for kind, amount in [('INCOME', income), ('EXPENSE', expense)]:
                qa.sql(f"INSERT INTO transactions(user_id,category_id,type,amount,transaction_date,note,created_at) VALUES ({user['id']},{cats[kind]},'{kind}',{amount},'{month}-15','D15_FIX_TARGETED_{kind}',NOW(6));")
            y, m = map(int, month.split('-'))
            assert qa.request(f'/budgets/{y}/{m}', 'TARGET', body={'amountLimit': '100.00'}, method='PUT')[0] == 200
            oracle = qa.oracle('TARGET', month)
            code, dashboard = qa.request('/dashboard/summary?month=' + month, 'TARGET')
            rcode, report = qa.request(f'/reports/monthly?from={month}&to={month}', 'TARGET')
            expected = {'totalIncome': Decimal(income), 'totalExpense': Decimal(expense), 'balance': Decimal(balance)}
            assert code == rcode == 200 and all(oracle[k] == dashboard[k] == report['months'][0][k] == v for k, v in expected.items()), 'SQL/API fixture mismatch'
            evidence['oracle'].append({'month': month, 'sql': oracle, 'dashboard': dashboard, 'report': report})
        evidence['backendUrl'] = qa.base
        evidence['environment'] = qa.evidence['environment']
        evidence['schemaInputs'] = qa.evidence['schemaInputs']
        evidence['backendJarSha256'] = qa.evidence['jarSha256']
        evidence['beforeReads'] = qa.snapshot()
        payload = {'frontend': str(FE / 'frontend'), 'backend': qa.base, 'output': str(OUT),
                   'frontendHead': before['head'], 'email': email, 'password': password,
                   'matrix': [{'month': m, 'values': [i, e, b]} for m, i, e, b in matrix]}
        # Credentials remain only in process memory/stdin; no requests/response bodies logged.
        with (OUT / 'browser-targeted.log').open('wb') as log:
            p = subprocess.Popen(['node', str(ROOT / 'scripts/qa/d15_fix_targeted.mjs')], stdin=subprocess.PIPE,
                                 stdout=log, stderr=subprocess.STDOUT)
            try:
                p.communicate(json.dumps(payload).encode(), timeout=300)
            except subprocess.TimeoutExpired:
                p.terminate()
                p.wait(timeout=15)
                raise RuntimeError('Browser targeted timeout; inspect owned process cleanup')
        evidence['browserExitCode'] = p.returncode
        if (OUT / 'browser-targeted-results.json').exists():
            evidence.update(json.loads((OUT / 'browser-targeted-results.json').read_text(encoding='utf-8')))
        else:
            raise RuntimeError('Browser result missing')
        evidence['afterReads'] = qa.snapshot()
        assert evidence['beforeReads'] == evidence['afterReads'], 'Unexpected mutation during browser reads/login'
        evidence['zeroMutation'] = 'PASS: eight-table hashes/counts and COUNT_WRITE unchanged'
    except Exception as error:
        evidence['tests'].append({'id': 'ENVIRONMENT', 'status': 'ERROR', 'expected': 'Real FE/BE/MySQL and all browser modes available',
                                  'actual': type(error).__name__ + ': ' + str(error), 'mode': 'environment', 'viewport': None, 'theme': None})
    finally:
        if qa.app:
            # Oracle javapath/java.exe may be a launcher with a child JVM.
            # Stop this owned process tree before the launcher can orphan it.
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(qa.app.pid), '/T', '/F'], capture_output=True)
            else:
                qa.app.terminate()
            try:
                qa.app.wait(timeout=15)
            except subprocess.TimeoutExpired:
                qa.app.kill()
                qa.app.wait(timeout=10)
        if qa.log:
            qa.log.close()
        try:
            if qa.container:
                shared.run(['docker', 'rm', '-f', qa.container])
                inspected = subprocess.run(['docker', 'inspect', qa.container], capture_output=True)
                assert inspected.returncode != 0, 'Container still present'
            if qa.temp:
                qa.temp.cleanup()
            evidence['cleanup'] = {'status': 'PASS', 'containerId': qa.container,
                                   'actual': 'Only this newly created disposable container removed; fixtures removed with it; Backend stopped'}
        except Exception as error:
            evidence['cleanup'] = {'status': 'ERROR', 'actual': str(error)}
        after = snapshot_git()
        evidence['sourceGateAfter'] = 'PASS' if after == before else 'FAIL'
        evidence['frontendSourceUnchanged'] = after['sourceHashes'] == before['sourceHashes']
        (OUT / 'git-after.json').write_text(json.dumps(after, indent=2, ensure_ascii=False), encoding='utf-8')
        (OUT / 'git-after.log').write_text(after['statusShortBranch'] + '\nHEAD ' + after['head'] + '\n' + after['stash'] + '\n', encoding='utf-8')
        evidence['counts'] = {s: sum(t['status'] == s for t in evidence['tests']) for s in ['PASS', 'FAIL', 'ERROR', 'NOT_RUN']}
        passed = bool(evidence['tests']) and all(t['status'] == 'PASS' for t in evidence['tests'])
        passed = passed and evidence.get('zeroMutation', '').startswith('PASS') and evidence['sourceGateAfter'] == 'PASS' and evidence['cleanup']['status'] == 'PASS' and evidence.get('browserHelpersCleanup') == 'PASS'
        evidence['status'] = 'TARGETED QA PASS' if passed else 'TARGETED QA NOT PASS'
        evidence['finishedUtc'] = datetime.now(timezone.utc).isoformat()
        evidence['scope'] = 'Targeted only. Prior Browser QA: 33 PASS / 2 FAIL at 4650bd9. The 33 unrelated cases were not rerun; inherit prior evidence by risk assessment only if targeted gates all pass.'
        (OUT / 'browser-targeted-results.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False, default=str), encoding='utf-8')
        files = [{'file': p.name, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size}
                 for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'manifest.json']
        (OUT / 'manifest.json').write_text(json.dumps(files, indent=2), encoding='utf-8')
        print(evidence['status'], evidence['counts'], flush=True)
        print('FE source gate:', evidence['sourceGateAfter'], 'Cleanup:', evidence['cleanup']['status'], flush=True)


if __name__ == '__main__':
    main()
