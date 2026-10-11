#!/usr/bin/env python3
"""Capture the disposable PostgreSQL suite; never uses a remote database."""
import argparse, datetime, hashlib, json, pathlib, platform, re, runpy, subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
def inputs():
    return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
            for folder in ('tests/db','supabase/migrations') for p in sorted((ROOT/folder).rglob('*'))
            if p.is_file() and p.suffix in ('.sql','.sh','.py')}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('label');args=parser.parse_args()
    if not re.fullmatch(r'[a-zA-Z0-9_-]+',args.label):parser.error('Use a simple run label.')
    capture=runpy.run_path(str(ROOT/'scripts/capture-checks.py'))
    observed=datetime.datetime.now(datetime.timezone.utc).isoformat()
    commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    before=inputs();digest=capture['source_digest']()
    directory=ROOT/'docs/testing/runs'/args.label;directory.mkdir(parents=True,exist_ok=True)
    log=directory/'database.log'
    with log.open('w') as output:
        result=subprocess.run(['bash','tests/db/run.sh'],cwd=ROOT,text=True,stdout=output,stderr=subprocess.STDOUT)
    body=log.read_text();after=inputs();after_digest=capture['source_digest']()
    passed=result.returncode==0 and 'db tests passed' in body and before==after
    row={'id':args.label+':database','command':['bash','tests/db/run.sh'],'observed_at':observed,
         'commit':commit,'source_digest':digest,'source_digest_after':after_digest,'input_sha256':before,
         'inputs_unchanged':before==after,'all_source_unchanged':digest==after_digest,'environment':{'os':platform.platform(),'database':'disposable local PostgreSQL; synthetic Auth/Vault'},
         'result':'PASS' if passed else 'FAIL','exit_code':result.returncode,'log':str(log.relative_to(ROOT)),
         'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest(),'test_ids':re.findall(r'^\s*ok\s+(.+)$',body,re.M),
         'verification_level':'LOCAL','provider_mode':'synthetic','screenshots':[],
         'limitations':['SQL input hashes bind this proof to migrations/tests only; concurrent unrelated source changes do not establish complete app readiness.','No production schema, credentials, provider or live verification.']}
    (directory/'results.json').write_text(json.dumps({'schema_version':1,'label':args.label,'commit':commit,
          'source_digest':digest,'observed_at':observed,'checks':[row]},indent=2)+'\n')
    print(row['result'],len(row['test_ids']),'observed SQL assertions/races;',log)
    if not passed:print(body[-6000:])
    return 0 if passed else 1
if __name__=='__main__':raise SystemExit(main())
