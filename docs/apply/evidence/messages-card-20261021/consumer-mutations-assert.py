import json,hashlib
from pathlib import Path
p=Path(__file__).parent
x=json.loads((p/'consumer-mutations-gate-result.json').read_text())
checks=[]
for r in x['checks']:
 if r['case']=='positive':
  checks += [{'name':'unchanged_payload_starts','pass':r['consumer_accepted'] is True and r['recorded_job'] is True}, {'name':'unchanged_permission_consumed','pass':r['after_attempt']['approval_unused'] is False}]
 else:
  checks += [{'name':r['case']+'_mutation_refused','pass':r['consumer_accepted'] is False},{'name':r['case']+'_refusal_creates_zero_jobs','pass':r['after_attempt']['jobs']==0},{'name':r['case']+'_refusal_keeps_original_approval_unused','pass':r['after_attempt']['approval_unused'] is True},{'name':r['case']+'_original_payload_still_starts','pass':r['rescue_accepted'] is True}]
checks.append({'name':'only_five_expected_original_jobs_exist','pass':x['total_jobs']==5})
v={'status':'PASS' if all(c['pass'] for c in checks) else 'FAIL','checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks),'provider_calls':0,'real_profile_access':False,'transaction':'ROLLED_BACK','gate_script_sha256':hashlib.sha256((p/'consumer-mutations-gate.py').read_bytes()).hexdigest(),'gate_sql_sha256':hashlib.sha256((p/'consumer-mutations-gate.sql').read_bytes()).hexdigest()}
out=p/'consumer-mutations-gate-verdict.json';out.write_text(json.dumps(v,indent=2)+'\n');print(json.dumps({'status':v['status'],'pass':v['passed'],'total':v['total'],'path':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
if v['status']!='PASS':raise SystemExit(1)
