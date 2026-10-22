import datetime, json, os, pathlib, signal, sys, time

repo = pathlib.Path(sys.argv[1]).resolve()
evidence = pathlib.Path(sys.argv[2])
marker = 'zero wrong on spent-s4:'
deadline = time.monotonic() + 1800
while time.monotonic() < deadline:
    log = (evidence / 'node.log').read_text(errors='replace')
    skipped = any(marker in line and '# SKIP BROWSER_UNAVAILABLE: browserContext.waitForEvent' in line
                  for line in log.splitlines())
    if skipped:
        tests = []
        browsers = []
        for path in pathlib.Path('/proc').iterdir():
            if not path.name.isdecimal():
                continue
            try:
                argv = (path / 'cmdline').read_bytes().split(b'\0')
                if (path / 'cwd').resolve() != repo:
                    continue
                if b'tests/career-extension-workday.test.cjs' in argv and b'--test' not in argv:
                    tests.append(int(path.name))
            except (OSError, PermissionError):
                pass
        for path in pathlib.Path('/proc').iterdir():
            if not path.name.isdecimal():
                continue
            try:
                cmd = (path / 'cmdline').read_bytes()
                status = (path / 'status').read_text()
                parent = int(next(line.split()[1] for line in status.splitlines() if line.startswith('PPid:')))
                if parent in tests and cmd.startswith(b'/usr/lib/chromium/chromium\0') and b'--load-extension=' in cmd:
                    browsers.append((int(path.name), parent))
            except (OSError, PermissionError, StopIteration):
                pass
        if browsers:
            record = {
                'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'action': 'SIGTERM test-owned browser after extension setup failed and every Workday test was skipped; unblock world.close cleanup only',
                'browser_and_parent_pids': browsers,
                'parent_test_file': 'tests/career-extension-workday.test.cjs',
                'outcome': 'Workday cases remain NOT_RUN; no assertions changed',
            }
            (evidence / 'extension-cleanup.json').write_text(json.dumps(record, indent=2) + '\n')
            for pid, _ in browsers:
                os.kill(pid, signal.SIGTERM)
            print(json.dumps(record), flush=True)
            raise SystemExit(0)
    if (evidence / 'node.json').exists():
        print('Node suite completed; cleanup was not needed.', flush=True)
        raise SystemExit(0)
    time.sleep(1)
raise SystemExit('Cleanup watcher expired without acting.')
