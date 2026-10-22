import collections, json, pathlib, re, sys

base = pathlib.Path(sys.argv[1])
candidate = pathlib.Path(sys.argv[2])
report = {}
for suite in ['node', 'edge', 'architect']:
    def failures(directory):
        text = (directory / (suite + '.log')).read_text(errors='replace')
        if suite == 'node':
            names = re.findall(r'^\s*not ok \d+ - (.*)$', text, re.M)
        else:
            names = re.findall(r'^(.*?) => (\./tests/[^\r\n]+):\d+:\d+$', text, re.M)
            names = sorted(set(names))
            names = [' => '.join(x) for x in names]
        return collections.Counter(names)
    before, after = failures(base), failures(candidate)
    added, removed = list((after - before).elements()), list((before - after).elements())
    report[suite] = {
        'base': json.loads((base / (suite + '.json')).read_text()),
        'candidate': json.loads((candidate / (suite + '.json')).read_text()),
        'new_failure_names': added, 'resolved_failure_names': removed,
        'baseline_failure_names': sorted(before.elements()),
        'candidate_failure_names': sorted(after.elements()),
    }
    for side in ['base', 'candidate']:
        report[suite][side].pop('command', None)
        if not report[suite][side].get('node_summary') and not report[suite][side].get('deno_summary'):
            report[suite]['new_failure_names'].append('SUITE_DID_NOT_COMPLETE')
report['regression'] = any(x['new_failure_names'] for x in report.values())
(candidate / 'comparison.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
raise SystemExit(1 if report['regression'] else 0)
