#!/usr/bin/env python3
"""Verify exact scenario coverage and source identity before reporting scores."""
import argparse, collections, hashlib, json, pathlib
p=argparse.ArgumentParser();p.add_argument('--out',required=True);args=p.parse_args();root=pathlib.Path(args.out)
launch=json.loads((root/'launch.json').read_text());results=[];links=[]
for worker in launch['workers']:
 out=pathlib.Path(worker['out']);report=json.loads((out/'report.json').read_text())
 assert report['commit']==launch['commit'] and report['router_bundle_sha256']==launch['router_bundle_sha256'],'Source changed during campaign'
 assert report['trial_count']==1 and report['model_configured'],'Wrong run mode'
 expected={f'C{i+1:05d}' for i in range(worker['start_index'],worker['end_index'])}
 assert {r['id'] for r in report['results']}==expected and len(report['results'])==len(expected),'Missing or duplicate worker cases'
 for shard in report['shards']:
  assert hashlib.sha256((out/shard['file']).read_bytes()).hexdigest()==shard['sha256'],'Transcript changed'
  links.append(str((out/shard['markdown']).relative_to(root)))
 results.extend(report['results'])
assert len(results)==3500 and len({r['id'] for r in results})==3500,'Missing/duplicate cases'
results.sort(key=lambda r:r['id']);dimensions=['capability','awareness','fluency','memory','planning','tool_grounding','recovery_safety'];scores={}
for dimension in dimensions:
 counts=collections.Counter(r['dimensions'][dimension] for r in results);evaluated=counts['PASS']+counts['FAIL'];scores[dimension]={**counts,'evaluated':evaluated,'percent':100*counts['PASS']/evaluated if evaluated else None}
report={'scope':'Actual handler; synthetic authentication/database; gpt-5-nano response and provisional same-model grading. 3500 variants across 100 families, one trial each. Blocked grades are not passes. Exact coverage and transcript SHA256 verified.','commit':launch['commit'],'scenario_count':3500,'status_counts':dict(collections.Counter(r['status'] for r in results)),'dimension_scores':scores,'results':results,'conversations':links}
(root/'report.json').write_text(json.dumps(report,indent=2)+'\n')
lines=['# Full 3,500-scenario paid audit','',report['scope'],'',f"Build: {report['commit']}",'',str(report['status_counts']),'','| Dimension | Pass | Fail | Evaluated | Blocked | % evaluated |','| --- | --- | --- | --- | --- | --- |']
for d,s in scores.items():lines.append(f"| {d} | {s.get('PASS',0)} | {s.get('FAIL',0)} | {s['evaluated']} | {s.get('BLOCKED',0)} | {s['percent'] if s['percent'] is not None else 'unmeasured'} |")
lines+=['','## Every conversation','']+[f'- [{name}]({name})' for name in links]
(root/'README.md').write_text('\n'.join(lines)+'\n');print(json.dumps({'scenario_count':3500,'status_counts':report['status_counts'],'scores':scores}))
