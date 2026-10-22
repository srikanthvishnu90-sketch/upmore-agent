import argparse, hashlib, json, os, pathlib, re, subprocess, time

p = argparse.ArgumentParser()
p.add_argument('repo')
p.add_argument('label')
p.add_argument('suite', choices=['node', 'edge', 'architect'])
a = p.parse_args()
repo = pathlib.Path(a.repo)
out = pathlib.Path('/tmp/integration-20261022-evidence') / a.label
out.mkdir(parents=True, exist_ok=True)
env = {k: v for k, v in os.environ.items() if k in {'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'USER'}}
env.update({
    'PATH': '/tmp/case2-test-tools/node_modules/.bin:' + env.get('PATH', ''),
    'HOME': '/tmp/integration-20261022-clean-home',
    'DENO_DIR': '/tmp/case2-deno-cache',
    'DENO_BIN': '/tmp/case2-test-tools/node_modules/.bin/deno',
    'NO_COLOR': '1',
    'UPMORE_PLAYWRIGHT_PATH': '/tmp/case2-test-tools/node_modules/playwright',
    'UPMORE_CHROMIUM_PATH': '/usr/bin/chromium',
    'ESBUILD_BIN': '/tmp/case2-test-tools/node_modules/.bin/esbuild',
})
pathlib.Path(env['HOME']).mkdir(exist_ok=True)
if a.suite == 'node':
    files = sorted(str(x.relative_to(repo)) for x in (repo / 'tests').glob('*.cjs'))
    cmd = ['node', '--experimental-vm-modules', '--test', '--test-concurrency=2', *files]
else:
    cmd = [env['DENO_BIN'], 'test', '--cached-only', '--import-map=/tmp/f009-deps/import-map.json',
           '--allow-read', '--allow-write=/tmp', '--allow-run', '--allow-env',
           '--allow-net=127.0.0.1,localhost', '--no-check']
    if a.suite == 'architect':
        cmd += ['--ignore=tests/architect/pending']
    cmd += ['tests/' + a.suite]
    files = []
start = time.time()
with (out / (a.suite + '.log')).open('w') as f:
    result = subprocess.run(cmd, cwd=repo, env=env, stdout=f, stderr=subprocess.STDOUT)
log = (out / (a.suite + '.log')).read_text(errors='replace')
record = {
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
    'suite': a.suite, 'command': cmd, 'cwd': str(repo), 'exit_code': result.returncode,
    'seconds': round(time.time() - start, 3), 'provider_credentials': 'not inherited',
    'deno_network': 'loopback only', 'node_files': len(files), 'new_spend_usd': 0,
    'log_sha256': hashlib.sha256(log.encode()).hexdigest(),
    'node_summary': re.findall(r'^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) .*$', log, re.M)[-8:],
    'deno_summary': re.findall(r'^.*\d+ passed.*\d+ failed.*$', log, re.M)[-1:],
}
(out / (a.suite + '.json')).write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({k: v for k, v in record.items() if k != 'command'}), flush=True)
raise SystemExit(result.returncode)
