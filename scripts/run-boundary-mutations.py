#!/usr/bin/env python3
"""Run synthetic guard mutations in a separate no-checkout git worktree.

This never modifies source in the development checkout, loads credentials,
calls a deployment command, or invokes a provider. Equivalent boundaries are
reported separately: they do not complete an untested financial requirement.
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
SHARED='supabase/functions/_shared/'
REQUESTED=[
 ('owner-account-binding','Remove owner/account binding'),
 ('tenant-isolation','Remove tenant isolation'),
 ('client-approval','Trust client approval'),
 ('proposal-hash','Remove proposal hash'),
 ('recipient-binding','Remove recipient binding'),
 ('currency-binding','Remove currency binding'),
 ('fee-cap','Remove fee cap'),
 ('approval-expiry','Remove approval expiry'),
 ('single-use','Remove single use'),
 ('submit-idempotency','Remove submit idempotency'),
 ('queued-revocation','Ignore queued revocation'),
 ('never-mind','Execute after never mind'),
 ('superseded-amount','Execute superseded amount'),
 ('document-authority','Accept document authority'),
 ('webhook-authentication','Accept invalid webhook signature'),
 ('replay-window','Remove replay window'),
 ('acceptance-settlement','Call acceptance settlement'),
 ('unknown-reconciliation','Skip unknown-result reconciliation'),
 ('regulated-product-gate','Remove regulated-product gate'),
 ('secret-log','Log a secret'),
]
# Exact-string patches intentionally fail closed if implementation changes.
# "equivalent" means this is useful adjacent proof, not the complete requested
# mutation (e.g. communication recipient binding is not a payment beneficiary).
CASES=[
 dict(id='owner-account-binding',file='workflow_service.ts',old='if (rows && (!Array.isArray(rows) || rows.some((row:any)=>row.user_id!==userId)))',new='if (false)',test='workflow-service.test.ts',name='bill list rejects a foreign row even if an upstream client violates its filter',scope='Owned obligation list defense, including upstream filter bypass.'),
 dict(id='tenant-isolation',file='financial_tools.ts',old='if(!row || row.user_id!==this.userId)',new='if(false)',test='financial-tools.test.ts',name="server-role ownership bypass cannot leak another owner's bill",scope='Cross-tenant private bill read with a service-role reader.'),
 dict(id='recipient-binding',file='message_delivery.ts',old='|| normalizeContact(body.contact??body.recipient)!==channel.contact',new='',test='message-delivery.test.ts',name='provider acceptance with another recipient or missing ID is not a verified receipt',scope='External message receipt recipient binding; payment beneficiary binding is still NOT-RUN.',equivalent=True),
 dict(id='currency-binding',file='workflow_service.ts',old='key!=="observed_at" && key!=="source_key"',new='key!=="observed_at" && key!=="source_key" && key!=="currency"',test='workflow-service.test.ts',name='reused bill entry ID cannot silently discard a changed payee or currency',scope='Bill-entry idempotency binds currency; payment approval currency binding is still NOT-RUN.',equivalent=True),
 dict(id='submit-idempotency',file='payment_service.ts',old='const begun=checked(await admin.rpc("agent_payment_begin_submission",{p_attempt:attempt.id,p_lease:attempt.lease_token}));',new='const begun={context,attempt};',test='payment-service.test.ts',name='submission starts durably before provider call and stores processing separately from applied',scope='Durable before-submit marker in the payment worker; provider-side idempotency remains unavailable.'),
 dict(id='queued-revocation',file='biller_service.ts',old='connection.user_id!==ownerId || connection.status!=="active"',new='connection.user_id!==ownerId',test='biller-service.test.ts',name='revoked connection does not call a provider even when adapter is registered',scope='Revoked read connector immediately before provider access; queued payment revocation is still NOT-RUN.',equivalent=True),
 dict(id='document-authority',file='message_service.ts',old='return {ignored:false,provider:"loopmessage",',new='return {approved:body.parameters?.approved,ignored:false,provider:"loopmessage",',test='message-service.test.ts',name='provider metadata cannot choose a financial owner or approve an action',scope='Untrusted provider metadata cannot create approval fields; PDF/email document authority is still NOT-RUN.',equivalent=True),
 dict(id='webhook-authentication',file='message_service.ts',old='return expected.length>=32 && diff===0;',new='return true;',test='message-service.test.ts',name='webhook secret fails closed when absent short or mismatched',scope='Shared-secret webhook authentication; cryptographic signed webhook/timestamp contract remains unverified.',equivalent=True),
 dict(id='acceptance-settlement',file='financial_tools.ts',old='r.status==="applied"?"; creditor application recorded"',new='["settled","applied"].includes(r.status)?"; creditor application recorded"',test='financial-tools.test.ts',name='bank settlement is distinct from creditor application in owned payment history',scope='Settled bank funds are not creditor-applied; accepted-to-settled database transition mutation is still NOT-RUN.',equivalent=True),
 dict(id='unknown-reconciliation',file='payment_service.ts',old='event=await adapter.lookup(attempt,context);',new='event=await adapter.submit(attempt,context);',test='payment-service.test.ts',name='timeout after accepted submit recovers by lookup without a second send',scope='Unknown payment attempts query their original receipt and never resubmit.'),
 dict(id='regulated-product-gate',file='payment_service.ts',old='adapters.find(a=>a.id===existing.adapter_id && a.verified)',new='adapters.find(a=>a.id===existing.adapter_id)',test='payment-service.test.ts',name='unverified adapter cannot reserve a worker or call a provider',scope='Unverified payment execution adapter gate; legal/commercial launch approval gate is still NOT-RUN.',equivalent=True),
 dict(id='secret-log',file='message_service.ts',old='throw new Error("Message could not be persisted.")',new='throw new Error(result.error.message)',test='message-service.test.ts',name='storage failure is retryable and never leaks provider contents',scope='Error redaction prevents untrusted private text exposure; logging a credential is still NOT-RUN.',equivalent=True),
]

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def run(command,cwd,path):
    result=subprocess.run(command,cwd=cwd,text=True,capture_output=True)
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(result.stdout+result.stderr)
    plain=re.sub(r'\x1b\[[0-9;]*m','',result.stdout+result.stderr)
    counts=re.search(r'(\d+) passed \| (\d+) failed',plain)
    return {'command':command,'cwd':str(cwd),'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit_code':result.returncode,'log':str(path.relative_to(ROOT)),
            'log_sha256':digest(path),'assertion_failure':bool(re.search(r'Assertion failed|assertion failed|expected rejection|Expected rejection',plain)),
            'compilation_failure':bool(re.search(r'Type checking failed|SyntaxError|error: TS\d+|Module not found',plain)),
            'passed':int(counts[1]) if counts else None,'failed':int(counts[2]) if counts else None}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',action='store_true');args=parser.parse_args()
    if not args.run:parser.error('Use --run to execute isolated synthetic mutations.')
    observed=datetime.datetime.now(datetime.timezone.utc).isoformat()
    commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    spec=importlib.util.spec_from_file_location('capture',ROOT/'scripts/capture-checks.py');capture=importlib.util.module_from_spec(spec);spec.loader.exec_module(capture)
    source_digest=capture.source_digest()
    token=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:6]
    branch='codex/boundary-mutations-'+token;isolated=Path('/private/tmp')/('upmore-mutations-'+token)
    output=ROOT/'docs/testing/mutation-runs'/token
    # --no-checkout means no tracked .env, data exports or unrelated app files
    # are copied into the mutation environment.
    subprocess.run(['git','worktree','add','--no-checkout','-b',branch,str(isolated),commit],cwd=ROOT,check=True)
    manifest={}
    for directory in ('packages/domain','supabase/functions/_shared','supabase/functions/agent-chat/_shared','tests/edge','src/ledger-review-controller.js'):
        origin=ROOT/directory
        for path in [origin] if origin.is_file() else sorted(origin.rglob('*')):
            if path.is_file() and path.suffix in ('.ts','.js','.json') and not any(p in ('node_modules','.env') for p in path.parts):
                relative=path.relative_to(ROOT);target=isolated/relative;target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(path,target);manifest[str(relative)]=digest(path)
    rows=[{'id':key,'requested_mutation':description,'status':'NOT-RUN','remaining_dependency':'Needs a specifically targeted isolated behavioral mutation of the authoritative boundary; adjacent checks do not complete this requirement.'} for key,description in REQUESTED]
    report={'schema_version':1,'observed_at':observed,'commit':commit,'source_digest':source_digest,'environment':{'os':platform.platform(),'deno':subprocess.check_output(['deno','--version'],text=True).splitlines()[0]},'isolated_branch':branch,'isolated_worktree':str(isolated),'provider_mode':'synthetic','copied_source_sha256':manifest,'mutations':rows,
            'limitations':['No live/sandbox provider or real financial actions.','These are runtime TypeScript boundaries; SQL approval/RLS/idempotency and parser boundaries require their own isolated tests.','Equivalent mutations are recorded separately and do not satisfy untested requested boundaries.']}
    output.mkdir(parents=True,exist_ok=True)
    report['baseline']=run(['deno','test','tests/edge'],isolated,output/'baseline.log')
    baseline_ok=report['baseline']['exit_code']==0
    for case in CASES if baseline_ok else []:
        row=next(r for r in rows if r['id']==case['id']);target=isolated/SHARED/case['file'];original=target.read_bytes();text=original.decode()
        proof={'file':SHARED+case['file'],'scope':case['scope'],'before_sha256':digest(target),'old_guard':case['old'],'weakened_guard':case['new'],'test_name':case['name']}
        if text.count(case['old'])!=1:
            proof.update({'status':'NOT-RUN','reason':'Expected exactly one matching guard; no copied source was changed.'});row['proof']=proof;continue
        command=['deno','test','--filter',case['name'],'tests/edge/'+case['test']]
        proof['before']=run(command,isolated,output/(case['id']+'-before.log'))
        try:
            target.write_text(text.replace(case['old'],case['new'],1));proof['mutated_sha256']=digest(target)
            proof['weakened']=run(command,isolated,output/(case['id']+'-weakened.log'))
        finally:
            target.write_bytes(original)
        proof['after_sha256']=digest(target);proof['after']=run(command,isolated,output/(case['id']+'-restored.log'))
        killed=proof['before']['exit_code']==0 and (proof['before']['passed'] or 0)>0 and proof['weakened']['exit_code']!=0 and (proof['weakened']['failed'] or 0)>0 and proof['weakened']['assertion_failure'] and not proof['weakened']['compilation_failure'] and proof['after']['exit_code']==0 and (proof['after']['passed'] or 0)>0 and proof['before_sha256']==proof['after_sha256']
        proof['status']='KILLED' if killed else 'SURVIVED-OR-INVALID';row['proof']=proof
        if killed and not case.get('equivalent'):
            row['status']='KILLED';row['remaining_dependency']=None
        elif killed:
            row['equivalent_boundary_status']='KILLED';row['remaining_dependency']=case['scope']
        else:row['remaining_dependency']='Mutation was not caught by a meaningful behavioral assertion or restored check failed; investigate before claiming proof.'
    report['restored_full_suite']=run(['deno','test','tests/edge'],isolated,output/'restored-full-suite.log')
    report['isolated_copy_restored']=all(digest(isolated/path)==sha for path,sha in manifest.items())
    report['original_sources_unchanged']=all((ROOT/path).is_file() and digest(ROOT/path)==sha for path,sha in manifest.items())
    report['summary']={'requested':20,'killed':sum(r['status']=='KILLED' for r in rows),'equivalent_boundaries_killed':sum(r.get('equivalent_boundary_status')=='KILLED' for r in rows),'not_run':sum(r['status']=='NOT-RUN' for r in rows)}
    report['final_clean_diff']={'isolated_source_bytes_equal_copy_manifest':report['isolated_copy_restored'],'original_source_bytes_equal_copy_manifest':report['original_sources_unchanged'],'note':'Worktree intentionally contains uncommitted copied current implementation; clean means no mutation remains, not a clean git checkout.'}
    # Keep the isolated worktree for reproducible review. Do not destroy it or
    # delete the named branch without an explicit cleanup request.
    (output/'results.json').write_text(json.dumps(report,indent=2)+'\n')
    (ROOT/'docs/testing/mutations.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'record':str((output/'results.json').relative_to(ROOT)),'summary':report['summary'],'baseline_exit':report['baseline']['exit_code'],'restored_exit':report['restored_full_suite']['exit_code'],'isolated_copy_restored':report['isolated_copy_restored'],'original_sources_unchanged':report['original_sources_unchanged']},indent=2))
    return not (baseline_ok and report['restored_full_suite']['exit_code']==0 and report['isolated_copy_restored'] and report['original_sources_unchanged'])

if __name__=='__main__':raise SystemExit(main())
