#!/usr/bin/env python3
"""Reproducible local checks. Never invokes live agent100 or deployment."""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import platform
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]

def extract_test_ids(log):
    plain=re.sub(r'\x1b\[[0-9;]*m','',log)
    names=[]
    for line in plain.splitlines():
        if ' ... ' in line and ('ok' in line or 'FAILED' in line):names.append(line.split(' ... ')[0].strip())
        if line.startswith('# Subtest: '):names.append(line.removeprefix('# Subtest: '))
        match=re.fullmatch(r'[✔✖] (.+) \([\d.]+(?:ms|s)\)',line)
        if match:names.append(match[1])
    return list(dict.fromkeys(names))

def classify(name, exit_code, log):
    if name == 'agent100-dry':
        summary=re.search(r'(\d+)/(\d+) agents pass',log)
        if not summary:return 'FAIL',{'reason':'Agent harness emitted no outcome summary.'}
        passed,total=map(int,summary.groups())
        return ('PASS' if exit_code==0 and total>0 and passed==total else 'FAIL'), {'passed':passed,'total':total,'failed':total-passed,'mode':'synthetic-dry'}
    return ('PASS' if exit_code==0 else 'FAIL'),None

def source_digest():
    digest = hashlib.sha256()
    for directory in ('src', 'packages', 'supabase/functions', 'supabase/migrations', 'tests', 'scripts'):
        for path in sorted((ROOT / directory).rglob('*')):
            relative=path.relative_to(ROOT)
            if any(part in ('node_modules','results','artifacts','__pycache__') for part in relative.parts):continue
            if path.is_file() and (path.suffix in ('.ts', '.js', '.cjs', '.sql', '.py', '.html', '.sh') or path.name=='parity-check'):
                digest.update(str(path.relative_to(ROOT)).encode() + b'\0' + path.read_bytes() + b'\0')
    return digest.hexdigest()

def capture(label, checks):
    observed = datetime.datetime.now(datetime.timezone.utc).isoformat()
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    before = source_digest()
    output = ROOT / 'docs/testing/runs' / label
    output.mkdir(parents=True, exist_ok=True)
    def run(check):
        name, command = check
        result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
        log = result.stdout + result.stderr
        plain=re.sub(r'\x1b\[[0-9;]*m','',log)
        status,outcomes=classify(name,result.returncode,plain)
        test_ids=extract_test_ids(log)
        path = output / (name + '.log')
        path.write_text(log)
        return {'id': label + ':' + name, 'command': command, 'observed_at': observed,
                'commit': commit, 'source_digest': before, 'environment': {'os': platform.platform()},
                'result':status,'reported_outcomes':outcomes,'exit_code': result.returncode,
                'log': str(path.relative_to(ROOT)), 'log_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'verification_level': 'LOCAL', 'provider_mode': 'synthetic', 'screenshots': [],
                'test_ids':test_ids,
                'limitations': ['Not browser, sandbox-provider or live verification.']}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(run, checks))
    after = source_digest()
    if before != after:
        raise RuntimeError('Source changed during checks; results cannot be certified together.')
    record = {'schema_version': 1, 'label': label, 'commit': commit, 'source_digest': before,
              'observed_at': observed, 'checks': rows,
              'not_run': ['Actual browser/accessibility inspection: no enabled browser surface.',
                          'Partner sandbox/live: adapters not registered; no production authorization.',
                          'Root lint/format/security script: no configured command identified.',
                          'Database harness: separate privileged invocation required.']}
    (output / 'results.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'record': str((output / 'results.json').relative_to(ROOT)),
                      'commit': commit, 'source_digest': before,
                      'results': {r['id']: r['result'] for r in rows}}, indent=2))
    return all(r['result'] == 'PASS' for r in rows)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('label')
    args = parser.parse_args()
    if not args.label.replace('-', '').replace('_', '').isalnum():
        parser.error('Use a simple run label.')
    checks = [('edge', ['deno', 'test', 'tests/edge']),
              ('ledger-render', ['node', '--test', 'tests/ledger-review-render.test.cjs']),
              ('bill-render', ['node', '--test', 'tests/bill-workflow-render.test.cjs']),
              ('chat-controller', ['node', '--test', 'tests/chat-request-controller.test.cjs']),
              ('chat-integration', ['node', '--test', 'tests/chat-request-integration.test.cjs']),
              ('private-finance', ['node', '--test', 'tests/private-finance-isolation.test.cjs']),
              ('subscription-case', ['node', '--test', 'tests/subscription-case.test.cjs']),
              ('recovery', ['node', '--test', 'tests/recovery.test.cjs']),
              ('recovery-render', ['node', '--test', 'tests/recovery-review-render.test.cjs']),
              ('finance-build', ['node', '--test', 'tests/finance-build.test.cjs']),
              ('parity-checker', ['python3', 'tests/parity-check.test.py','-v']),
              ('research-merge', ['python3', 'tests/merge-claude-research.test.py','-v']),
              ('check-capture', ['python3','tests/check-capture.test.py','-v']),
              ('agent100-extract', ['node','--test','tests/agent100-extract.test.cjs']),
              ('plaid', ['node', 'tests/plaid-sync.test.js']),
              ('investments', ['node', 'tests/investments.test.js']),
              ('agent100-validate', ['npm', '--prefix', 'tests/agent100', 'run', 'validate']),
              ('agent100-dry', ['npm', '--prefix', 'tests/agent100', 'run', 'dry']),
              ('generated-core', ['python3', 'scripts/build-financial-core.py', '--check']),
              ('diff-whitespace', ['git', 'diff', '--check'])]
    for entry in ('agent-chat', 'agent-workflows', 'agent-payments', 'agent-message-inbound',
                  'agent-message-turn', 'agent-message-worker', 'simplefin-proxy'):
        checks.append(('type-' + entry, ['deno', 'check', 'supabase/functions/' + entry + '/index.ts']))
    raise SystemExit(0 if capture(args.label, checks) else 1)
