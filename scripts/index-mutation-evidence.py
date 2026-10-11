#!/usr/bin/env python3
"""Combine historical proof scopes without treating adjacent tests as parity."""
import datetime,hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
paths=sorted((ROOT/'docs/testing/mutation-runs').glob('*/results.json'))+sorted((ROOT/'docs/testing/sql-mutation-runs').glob('*/results.json'))
def verify_logs(value):
    if isinstance(value,dict):
        if 'log' in value and 'log_sha256' in value:
            path=(ROOT/value['log']).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=value['log_sha256']:raise ValueError('Invalid mutation log reference')
        for v in value.values():verify_logs(v)
    elif isinstance(value,list):
        for v in value:verify_logs(v)
records={};runs=[]
for path in paths:
    result=json.loads(path.read_text());verify_logs(result)
    if not result.get('isolated_copy_restored') or not result.get('original_sources_unchanged'):raise ValueError('Mutation restoration not proven')
    relative=str(path.relative_to(ROOT));runs.append({'record':relative,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'commit':result['commit'],'source_digest':result['source_digest'],'final_clean_diff':result['final_clean_diff']})
    for mutation in result['mutations']:
        identifier=mutation['id'];row=records.setdefault(identifier,{'id':identifier,'requested_mutation':mutation.get('requested_mutation',identifier),'status':'NOT-RUN','proofs':[]})
        direct=mutation['status']=='KILLED';equivalent=mutation['status']=='KILLED-EQUIVALENT' or mutation.get('equivalent_boundary_status')=='KILLED'
        if direct or equivalent:
            proof=mutation.get('proof',mutation)
            weakened=proof.get('weakened',{});restored=proof.get('after',proof.get('restored',{}))
            if weakened.get('exit_code',0)==0 or restored.get('exit_code')!=0 or not proof.get('before_sha256') or proof.get('before_sha256')!=proof.get('after_sha256'):raise ValueError('Invalid weakened/restored proof')
            if weakened.get('compilation_failure') or weakened.get('infrastructure_failure'):raise ValueError('Compilation/infrastructure failure is not guard proof')
            if not weakened.get('assertion_failure',weakened.get('expected_assertion_failed',False)):raise ValueError('Not a behavioral assertion failure')
            row['proofs'].append({'level':'DIRECT' if direct else 'ADJACENT-EQUIVALENT','run':relative,'scope':proof['scope'],'proof':proof})
            if direct:row['status']='KILLED'
        if mutation.get('remaining_dependency'):row['remaining_dependency']=mutation['remaining_dependency']
if len(records)!=20:raise ValueError('All twenty requested boundaries must remain in the ledger')
summary={'requested':len(records),'killed':sum(r['status']=='KILLED' for r in records.values()),'not_run':sum(r['status']!='KILLED' for r in records.values()),'adjacent_proofs':sum(p['level']=='ADJACENT-EQUIVALENT' for r in records.values() for p in r['proofs'])}
output={'schema_version':2,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':runs,'mutations':list(records.values()),'summary':summary,
 'limitations':['Historical proof is bound to each recorded commit/copy manifest, not automatically current runtime behavior.','Adjacent equivalents do not satisfy an untested requested financial boundary.','No production guards weakened; final clean diff means exact restored copied source, not a committed clean development checkout.']}
(ROOT/'docs/testing/mutations.json').write_text(json.dumps(output,indent=2)+'\n');print(json.dumps(summary))
