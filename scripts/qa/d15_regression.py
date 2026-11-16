"""Run D15 regression; preserve logs and count fresh JUnit/Node results, never infer PASS."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
RUN_NAME = os.environ.get('D15_RUN_NAME', 'd15-20261116-r1')
assert re.fullmatch(r'd15-[a-zA-Z0-9-]+', RUN_NAME)
OUT = ROOT / 'docs/qa/evidence' / RUN_NAME


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    jobs = [
        ('backend', 'backend', ['cmd.exe', '/d', '/c', 'gradlew.bat --offline test verifyD03IntegrationTests --console=plain']),
        ('frontend-test', 'frontend', ['cmd.exe', '/d', '/c', 'npm.cmd test']),
        ('frontend-lint', 'frontend', ['cmd.exe', '/d', '/c', 'npm.cmd run lint']),
        ('frontend-build', 'frontend', ['cmd.exe', '/d', '/c', 'npm.cmd run build']),
        ('backend-jar', 'backend', ['cmd.exe', '/d', '/c', 'gradlew.bat --offline bootJar --console=plain']),
    ]
    if '--fresh-backend' in sys.argv:
        jobs = [('backend-fresh', 'backend', ['cmd.exe', '/d', '/c',
                 'gradlew.bat --offline test verifyD03IntegrationTests --console=plain --rerun-tasks'])]
    if any((OUT / (name + '.log')).exists() for name, _, _ in jobs):
        raise SystemExit('Evidence already exists; choose a fresh D15_RUN_NAME')
    for name, directory, command in jobs:
        started = time.time()
        path = OUT / (name + '.log')
        with path.open('wb') as log:
            process = subprocess.run(command, cwd=ROOT / directory, stdout=log, stderr=subprocess.STDOUT)
        body = path.read_text(encoding='utf-8', errors='replace')
        item = {'name': name, 'command': command[-1], 'exitCode': process.returncode,
                'startedEpoch': started, 'durationSeconds': round(time.time() - started, 2),
                'status': 'PASS' if process.returncode == 0 else 'ERROR',
                'logSha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        if name.startswith('backend') and name != 'backend-jar':
            suites = []
            for xml in sorted((ROOT / 'backend/build/test-results/test').glob('TEST-*.xml')):
                suite = ET.parse(xml).getroot()
                suites.append({'name': suite.get('name'), 'fresh': xml.stat().st_mtime >= started,
                               **{key: int(suite.get(key, '0')) for key in ['tests', 'failures', 'errors', 'skipped']}})
            item['suites'] = suites
            fresh = [suite for suite in suites if suite['fresh']]
            item['counts'] = {key: sum(s[key] for s in fresh) for key in ['tests', 'failures', 'errors', 'skipped']}
            item['counts']['passed'] = item['counts']['tests'] - sum(item['counts'][k] for k in ['failures', 'errors', 'skipped'])
            if not fresh:
                item['status'] = 'NOT_RUN' if process.returncode == 0 else 'BLOCKED'
            # Persist case names/status + original XML hashes without system-out/credentials.
            snapshots = []
            for xml in sorted((ROOT / 'backend/build/test-results/test').glob('TEST-*.xml')):
                if xml.stat().st_mtime >= started:
                    suite = ET.parse(xml).getroot()
                    cases = [{'name': c.get('name'), 'class': c.get('classname'),
                              'status': next((s.upper() for s in ['failure', 'error', 'skipped'] if c.find(s) is not None), 'PASS')}
                             for c in suite.findall('testcase')]
                    snapshots.append({'suite': suite.get('name'), 'xmlSha256': hashlib.sha256(xml.read_bytes()).hexdigest(), 'cases': cases})
            (OUT / 'junit-cases.json').write_text(json.dumps(snapshots, indent=2), encoding='utf-8')
        elif name == 'frontend-test':
            item['counts'] = {key: int(value) for key, value in re.findall(r'^(?:#|\u2139) (tests|pass|fail|cancelled|skipped|todo) (\d+)', body, re.M)}
        results.append(item)
        result_name = 'backend-fresh.json' if '--fresh-backend' in sys.argv else 'regression.json'
        (OUT / result_name).write_text(json.dumps(results, indent=2), encoding='utf-8')
        print(name, item['status'], item.get('counts', {}), flush=True)


if __name__ == '__main__':
    main()
