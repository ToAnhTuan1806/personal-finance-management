"""Package D15 evidence as JSON/log. Does not run tests or infer missing outcomes."""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'docs/qa/evidence'
R1 = EVIDENCE / 'd15-20261116-r1'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, encoding='utf-8').strip()


def main():
    # Only files created by this task under its new R1 directory; never legacy d15-db.
    snapshots = []
    xmls = sorted(R1.glob('TEST-*.xml'))
    for xml in xmls:
        assert xml.resolve().parent == R1.resolve()
        suite = ET.parse(xml).getroot()
        cases = [{'name': c.get('name'), 'class': c.get('classname'),
                  'status': next((s.upper() for s in ['failure', 'error', 'skipped'] if c.find(s) is not None), 'PASS')}
                 for c in suite.findall('testcase')]
        snapshots.append({'suite': suite.get('name'), 'xmlSha256': digest(xml), 'cases': cases})
    if snapshots:
        (R1 / 'junit-cases.json').write_text(json.dumps(snapshots, indent=2), encoding='utf-8')
        for xml in xmls:
            xml.unlink()
    regression_path = R1 / 'regression.json'
    regression = json.loads(regression_path.read_text(encoding='utf-8'))
    for item in regression:
        if item['name'] == 'frontend-test':
            body = (R1 / 'frontend-test.log').read_text(encoding='utf-8')
            item['counts'] = {key: int(value) for key, value in re.findall(r'^(?:#|\u2139) (tests|pass|fail|cancelled|skipped|todo) (\d+)', body, re.M)}
            assert item['counts'], 'No Node result counters'
    regression_path.write_text(json.dumps(regression, indent=2), encoding='utf-8')
    # Exclude JWT/body DEBUG lines from the first runtime log. Keep unknown old evidence intact.
    redactions = {}
    if (R1 / 'git-final.json').exists():
        redactions.update(json.loads((R1 / 'git-final.json').read_text(encoding='utf-8')).get('logRedactions', {}))
    for directory in [EVIDENCE / f'd15-20261116-r{i}' for i in [1, 2, 3]]:
        for log in directory.glob('*.log'):
            body = log.read_text(encoding='utf-8', errors='replace')
            lines = body.splitlines(keepends=True)
            safe = ''.join('[REDACTED QA auth response log]\n' if 'accessToken=' in line else line for line in lines)
            safe, count = re.subn(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED QA JWT]', safe)
            count += sum('accessToken=' in line for line in lines)
            if safe != body:
                log.write_text(safe, encoding='utf-8')
                redactions[log.relative_to(ROOT).as_posix()] = count
    # Refresh stored log checksums after any sanitization.
    for name in ['regression.json', 'backend-fresh.json']:
        p = R1 / name
        data = json.loads(p.read_text(encoding='utf-8'))
        for job in data:
            job['logSha256'] = digest(R1 / (job['name'] + '.log'))
        p.write_text(json.dumps(data, indent=2), encoding='utf-8')
    metadata = {'head': git('rev-parse', 'HEAD'), 'branch': git('branch', '--show-current'),
                'upstream': git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'),
                'dev': git('rev-parse', 'origin/dev'), 'aheadBehindDev': git('rev-list', '--left-right', '--count', 'HEAD...origin/dev'),
                'stash': git('stash', 'list'), 'worktrees': git('worktree', 'list'), 'status': git('status', '--porcelain=v1', '--untracked-files=all'),
                'trackedDiff': git('diff', '--stat'), 'logRedactions': redactions,
                'remoteDevVerified': '4650bd9dd8c5d150b3fb25aa40913ac13784faf5 (git ls-remote during session)',
                'preexistingEvidence': 'Unknown origin; preserved, excluded from results; JSON incomplete',
                'backendIntegration': '9638350b16691ea0dea236e37938ceeff4767c53; merge 4437f1e8022d1bcc81d1cc2c0b24c2e4b865ebcd',
                'frontendIntegration': '8317699f39e6b95c79ceff4ddd7b7ad5977363e5; merge 4650bd9dd8c5d150b3fb25aa40913ac13784faf5'}
    previous = json.loads((R1 / 'preexisting-sha256.json').read_text(encoding='utf-8-sig'))
    metadata['preexistingUnchanged'] = all(digest(Path(p['Path'])).upper() == p['Hash'] for p in previous)
    assert metadata['preexistingUnchanged'], 'Pre-existing evidence changed'
    (R1 / 'git-final.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding='utf-8')
    files = []
    for directory in [EVIDENCE / f'd15-20261116-r{i}' for i in [1, 2, 3]]:
        for p in sorted(directory.glob('*')):
            if p.is_file() and p.name != 'manifest.json':
                files.append({'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)})
    for p in sorted((ROOT / 'scripts/qa').glob('d15_*')):
        if p.suffix == '.py':
            ast.parse(p.read_text(encoding='utf-8'))
        if p.is_file():
            files.append({'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)})
    for p in [ROOT / 'docs/qa/D15.md', ROOT / 'docs/qa/README.md']:
        files.append({'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)})
    (R1 / 'manifest.json').write_text(json.dumps({'baseline': metadata['head'], 'files': files}, indent=2), encoding='utf-8')
    print('Packaged', len(files), 'files; pre-existing evidence unchanged; Python AST valid')


if __name__ == '__main__':
    main()
