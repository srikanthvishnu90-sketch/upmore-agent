#!/usr/bin/env python3
"""Isolated disposable PostgreSQL guard mutations; never invokes Supabase.

Run only with the required local PostgreSQL permissions. Missing sandbox
permissions must be handled by normal tool escalation, not bypassed here.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import re
import shutil
import subprocess
import uuid

ROOT=Path(__file__).resolve().parents[1]
WORKFLOW='20261010030000_obligation_workflows.sql'
PAYMENT='20261010060000_payment_execution.sql'
CASES=[
 {'id':'owner-account-binding','migration':WORKFLOW,'test':'tests/db/workflows.test.sql','assertion':'cannot approve another user\'s task','assertion_type':'must_fail','scope':'Verified Auth owner binding on both obligation and task locks in financial approval.',
  'patches':[
   ['where t.id = p_task and t.user_id = uid for update of o;','where t.id = p_task for update of o;'],
   ['select * into task from public.agent_workflow_tasks where id = p_task and user_id = uid for update;','select * into task from public.agent_workflow_tasks where id = p_task for update;']]},
 {'id':'proposal-hash','migration':WORKFLOW,'test':'tests/db/workflows.test.sql','assertion':'approval requires exact snapshot hash','assertion_type':'must_fail','scope':'Authenticated approval must match the immutable reviewed proposal hash.',
  'patches':[["if p_snapshot_hash is null or task.snapshot_hash is distinct from p_snapshot_hash then raise exception 'proposal changed'; end if;","if false then raise exception 'proposal changed'; end if;"]]},
 {'id':'approval-expiry','migration':WORKFLOW,'test':'tests/db/workflows.test.sql','assertion':'late approval cannot execute','assertion_type':'must_fail','scope':'Expired proposal cannot acquire owner approval.',
  'patches':[["if (task.plan->'proposal'->>'expires_at')::timestamptz <= now() then raise exception 'proposal expired'; end if;","if false then raise exception 'proposal expired'; end if;"]]},
 {'id':'single-use','migration':PAYMENT,'test':'tests/db/payment_execution.test.sql','assertion':'same approval cannot submit twice','assertion_type':'must_fail','scope':'Same reserved approval/attempt can create the durable submission marker only once.',
  'patches':[["if a.status<>'reserved' or a.submission_started_at is not null then raise exception 'payment submission already started';end if;","if false then raise exception 'payment submission already started';end if;"]]},
 {'id':'queued-revocation','migration':WORKFLOW,'test':'tests/db/workflows.test.sql','assertion':'stop cancels pending workflow proposals','assertion_type':'ok','scope':'Stopping the agent terminally revokes pending workflow proposals; independent point-of-submit stop checks remain intact.',
  'patches':[["where user_id=new.user_id and state not in ('resolved','cancelled');","where false;"]]},
 {'id':'acceptance-settlement','migration':PAYMENT,'test':'tests/db/payment_execution.test.sql','assertion':'bank settlement alone does not mark bill paid','assertion_type':'ok','equivalent':True,'scope':'Authoritative settled-bank receipt must not become creditor-applied completion. This is a downstream completion boundary; upstream accepted-to-settled mapping remains separately unverified.',
  'patches':[["if nextstate='applied' and o.revision=t.obligation_revision and o.amount_due_cents=a.amount_cents then","if nextstate in ('settled','applied') and o.revision=t.obligation_revision and o.amount_due_cents=a.amount_cents then"]]},
 {'id':'client-approval','migration':WORKFLOW,'test':'tests/db/workflows.test.sql','assertion':'clients cannot bypass approval RPC','assertion_type':'must_fail','scope':'Remove both table privileges and owner-write RLS barrier so an Auth client can directly forge workflow authorization state instead of using the approval RPC.',
  'patches':[[
   'public.agent_payment_attempts,public.agent_workflow_events to authenticated;',
   "public.agent_payment_attempts,public.agent_workflow_events to authenticated;\ngrant update on public.agent_workflow_tasks to authenticated;\ndrop policy if exists synthetic_client_approval_bypass on public.agent_workflow_tasks;\ncreate policy synthetic_client_approval_bypass on public.agent_workflow_tasks for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);"
  ]]},
]

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def execute(command,cwd,path,environment,case=None):
    observed=datetime.datetime.now(datetime.timezone.utc).isoformat()
    result=subprocess.run(command,cwd=cwd,text=True,capture_output=True,env=environment)
    output=result.stdout+result.stderr;path.write_text(output)
    plain=re.sub(r'\x1b\[[0-9;]*m','',output)
    caught=False
    if case:
        target='FAIL '+case['assertion']
        caught=(target+': statement succeeded but had to fail') in plain if case['assertion_type']=='must_fail' else bool(re.search(re.escape(target)+r'(?:\r?\n|$)',plain))
    return {'command':command,'cwd':str(cwd),'observed_at':observed,'exit_code':result.returncode,
      'log':str(path.relative_to(ROOT)),'log_sha256':sha(path),'expected_assertion_failed':caught,
      'suite_passed':'db tests passed' in plain,'passing_assertion_notices':len(re.findall(r'^\s*ok\s',plain,re.M)),
      'infrastructure_failure':bool(re.search(r'syntax error|could not create shared memory|Operation not permitted|command not found|does not exist|permission denied.*initdb',plain,re.I))}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',action='store_true')
    parser.add_argument('--case',action='append',choices=[c['id'] for c in CASES]);parser.add_argument('--pgbin',required=True)
    args=parser.parse_args()
    if not args.run:parser.error('Use --run after granting required local PostgreSQL permissions.')
    pgdir=Path(args.pgbin).resolve()
    if not all((pgdir/name).is_file() for name in ('initdb','pg_ctl','psql')):parser.error('--pgbin must contain initdb, pg_ctl and psql.')
    import os
    environment={key:os.environ[key] for key in ('PATH','HOME','TMPDIR','TEMP','TMP','LANG','LC_ALL','USER','LOGNAME') if key in os.environ}
    environment['PGBIN']=str(pgdir)
    selected=[c for c in CASES if not args.case or c['id'] in args.case]
    commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    spec=importlib.util.spec_from_file_location('capture',ROOT/'scripts/capture-checks.py');capture=importlib.util.module_from_spec(spec);spec.loader.exec_module(capture)
    source_digest=capture.source_digest();token=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:6]
    branch='codex/sql-boundary-mutations-'+token;isolated=Path('/private/tmp')/('upmore-sql-mutations-'+token)
    subprocess.run(['git','worktree','add','--no-checkout','-b',branch,str(isolated),commit],cwd=ROOT,check=True)
    output=ROOT/'docs/testing/sql-mutation-runs'/token;output.mkdir(parents=True,exist_ok=True)
    manifest={}
    for directory in ('tests/db','supabase/migrations'):
        for path in sorted((ROOT/directory).rglob('*')):
            if path.is_file() and path.suffix in ('.sql','.py','.sh'):
                relative=path.relative_to(ROOT);destination=isolated/relative;destination.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(path,destination);manifest[str(relative)]=sha(path)
    command=['bash','tests/db/run.sh']
    report={'schema_version':1,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commit':commit,'source_digest':source_digest,'environment':{'os':platform.platform(),'pgbin':str(pgdir),'psql_version':subprocess.check_output([str(pgdir/'psql'),'--version'],text=True).strip()},'provider_mode':'synthetic-disposable-postgres','isolated_branch':branch,'isolated_worktree':str(isolated),'copied_source_sha256':manifest,'mutations':[],
      'limitations':['No production database, provider credentials or real money.','A target-label behavioral assertion failure is required; syntax, permission/setup errors and unrelated failures do not count.','Completion-boundary equivalents remain separate from upstream accepted/settled mapping.','Worktree and named branch remain available for review; only the disposable DB harness performs its standard temporary database cleanup.']}
    report['baseline']=execute(command,isolated,output/'baseline.log',environment)
    baseline_ok=report['baseline']['exit_code']==0 and report['baseline']['suite_passed']
    last_clean_evidence=report['baseline']
    for case in selected:
        record={**case,'status':'NOT-RUN'};report['mutations'].append(record)
        if not baseline_ok:record['reason']='Isolated baseline did not pass; no source mutation attempted.';continue
        target=isolated/'supabase/migrations'/case['migration'];original=target.read_bytes();mutated=original.decode()
        record['before_sha256']=sha(target);record['before_evidence']={'log':last_clean_evidence['log'],'log_sha256':last_clean_evidence['log_sha256'],'command':last_clean_evidence['command'],'observed_at':last_clean_evidence['observed_at'],'note':'Already executed full suite at the unchanged copied-source manifest; this is a reference, not a newly run check.'}
        if any(mutated.count(old)!=1 for old,_ in case['patches']):record['reason']='Expected exact unique guards absent; no source mutation attempted.';continue
        try:
            for old,new in case['patches']:mutated=mutated.replace(old,new,1)
            target.write_text(mutated);record['mutated_sha256']=sha(target)
            record['weakened']=execute(command,isolated,output/(case['id']+'-weakened.log'),environment,case)
        finally:target.write_bytes(original)
        record['after_sha256']=sha(target);record['restored']=execute(command,isolated,output/(case['id']+'-restored.log'),environment)
        clean=record['before_sha256']==record['after_sha256']
        killed=record['weakened']['exit_code']!=0 and record['weakened']['expected_assertion_failed'] and not record['weakened']['infrastructure_failure'] and record['restored']['exit_code']==0 and record['restored']['suite_passed'] and clean
        record['status']='KILLED-EQUIVALENT' if killed and case.get('equivalent') else 'KILLED' if killed else 'SURVIVED-OR-NONTARGET-FAILURE'
        # Stop if restoration is not proven; later results would inherit a bad
        # baseline and cannot meaningfully certify another guard.
        if not clean or record['restored']['exit_code']!=0 or not record['restored']['suite_passed']:break
        last_clean_evidence=record['restored']
    report['isolated_copy_restored']=all(sha(isolated/path)==digest for path,digest in manifest.items())
    report['original_sources_unchanged']=all((ROOT/path).is_file() and sha(ROOT/path)==digest for path,digest in manifest.items())
    report['summary']={'selected':len(selected),'killed':sum(c['status']=='KILLED' for c in report['mutations']),'equivalent_killed':sum(c['status']=='KILLED-EQUIVALENT' for c in report['mutations']),'not_proved':sum(c['status'] not in ('KILLED','KILLED-EQUIVALENT') for c in report['mutations'])}
    report['final_clean_diff']={'all_copied_files_match_initial_manifest':report['isolated_copy_restored'],'all_original_files_match_initial_manifest':report['original_sources_unchanged']}
    record_path=output/'results.json';record_path.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'record':str(record_path.relative_to(ROOT)),'baseline_exit':report['baseline']['exit_code'],'summary':report['summary'],'isolated_copy_restored':report['isolated_copy_restored'],'original_sources_unchanged':report['original_sources_unchanged']},indent=2))
    return not (baseline_ok and report['isolated_copy_restored'] and report['original_sources_unchanged'] and report['summary']['not_proved']==0 and len(report['mutations'])==len(selected))

if __name__=='__main__':raise SystemExit(main())
