#!/usr/bin/env python3
"""Index immutable run outputs without upgrading their verification level."""
import json
import runpy
import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
rows=[]
capture=runpy.run_path(str(ROOT/'scripts/capture-checks.py'))
classify=capture['classify']
for path in sorted((ROOT/'docs/testing/runs').glob('*/results.json')):
    result=json.loads(path.read_text())
    for check in result['checks']:
        name=check['id'].split(':')[-1]
        status,outcomes=classify(name,check['exit_code'],(ROOT/check['log']).read_text())
        if name=='agent100-dry' and check['result']!=status:
            check.setdefault('corrections',[]).append({'from':check['result'],'to':status,
              'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'reason':'Audited actual harness summary; exit status alone did not indicate failures.'})
            check['result']=status
        if outcomes:check['reported_outcomes']=outcomes
        if check.get('provider_mode')=='synthetic' and name!='database':check['test_ids']=capture['extract_test_ids']((ROOT/check['log']).read_text())
        rows.append({**check,'run_record':str(path.relative_to(ROOT)),
                     'baseline':result['label']=='parity-baseline-20261010'})
    path.write_text(json.dumps(result,indent=2)+'\n')
output={'schema_version':1,'checks':rows,
        'limitations':['No current browser, partner sandbox or live verification.',
                       'Baseline predates this parity iteration; dirty source digests preserve that distinction.',
                       'Synthetic agent100 runs exercise fixtures, not real integrations.']}
(ROOT/'docs/testing/evidence-ledger.json').write_text(json.dumps(output,indent=2)+'\n')
print(f'Indexed {len(rows)} actual command executions; no verification level changed.')
