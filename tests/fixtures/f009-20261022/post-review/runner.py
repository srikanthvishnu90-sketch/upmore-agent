import os,sys,subprocess,json,pathlib,time
repo,suite=sys.argv[1:3]
label=sys.argv[3] if len(sys.argv)>3 else 'full'
out=pathlib.Path('/tmp/f009-'+label+'-'+suite)
env={k:v for k,v in os.environ.items() if k in {'PATH','TMPDIR','LANG','LC_ALL','USER'}}
env.update({'HOME':'/tmp/f009-clean-home','DENO_DIR':'/tmp/case2-deno-cache','NO_COLOR':'1','UPMORE_PLAYWRIGHT_PATH':'/tmp/case2-test-tools/node_modules/playwright','UPMORE_CHROMIUM_PATH':'/usr/bin/chromium'})
pathlib.Path(env['HOME']).mkdir(exist_ok=True)
cmd=['/tmp/case2-test-tools/node_modules/.bin/deno','test','--cached-only','--import-map=/tmp/f009-deps/import-map.json','--allow-read','--allow-write=/tmp','--allow-run','--allow-env','--allow-net=127.0.0.1,localhost','--no-check']
if suite=='architect':cmd+=['--ignore=tests/architect/pending']
cmd+=['tests/'+suite]
start=time.time()
with out.with_suffix('.log').open('w') as f:
 p=subprocess.run(cmd,cwd=repo,env=env,stdout=f,stderr=subprocess.STDOUT)
record={'command':cmd,'cwd':repo,'exit_code':p.returncode,'seconds':round(time.time()-start,3),'provider_credentials':'not inherited','network':'loopback only','new_spend_usd':0}
out.with_suffix('.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record));sys.exit(p.returncode)
