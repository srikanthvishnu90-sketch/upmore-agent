#!/usr/bin/env python3
"""Run four isolated sequential workers; share one durable model spending ledger."""
import argparse, hashlib, json, os, pathlib, subprocess, time
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--workers',type=int,default=4);p.add_argument('--spend-budget',action='store_true');args=p.parse_args()
if not os.environ.get('UPMORE_AUDIT_MODEL_KEY') and not os.environ.get('OPENAI_API_KEY'):raise SystemExit('Audit credential missing')
if not 1<=args.workers<=6:raise SystemExit('Workers must be between 1 and 6')
root=pathlib.Path(args.out);root.mkdir(parents=True,exist_ok=True)
if (root/'launch.json').exists():raise SystemExit('Existing campaign: use a new output directory; no implicit paid reruns')
repo=pathlib.Path(__file__).resolve().parents[2]
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
digest=hashlib.sha256((repo/'supabase/functions/_shared/router_core.js').read_bytes()).hexdigest()
jobs=[];manifest={'commit':head,'router_bundle_sha256':digest,'scenario_count':3500,'trials':1,'workers':[],'started_at':time.time(),'status':'RUNNING'}
for i in range(args.workers):
 start=3500*i//args.workers;end=3500*(i+1)//args.workers;out=root/f'worker-{i+1}';out.mkdir()
 command=['deno','run','--allow-read','--allow-write','--allow-run','--allow-env','--allow-net=api.openai.com','tests/memory-audit/campaign.ts','--real-model','--trials','1','--start-index',str(start),'--end-index',str(end),'--out',str(out)]
 log=open(out/'run.log','w');process=subprocess.Popen(command,cwd=repo,stdout=log,stderr=subprocess.STDOUT)
 item={'worker':i+1,'start_index':start,'end_index':end,'pid':process.pid,'command':command,'out':str(out),'status':'RUNNING'};manifest['workers'].append(item);jobs.append((process,log,item))
def save():
 tmp=root/'launch.tmp';tmp.write_text(json.dumps(manifest,indent=2)+'\n');tmp.replace(root/'launch.json')
save()
while any(process.poll() is None for process,_,_ in jobs):
 for process,_,item in jobs:
  item['exit_code']=process.poll()
  if item['exit_code'] is not None:item['status']='FINISHED' if (pathlib.Path(item['out'])/'report.json').exists() else 'CRASHED'
  checkpoint=pathlib.Path(item['out'])/'completed.jsonl'
  item['completed']=sum(1 for _ in checkpoint.open()) if checkpoint.exists() else 0
 save();time.sleep(15)
for process,log,item in jobs:
 log.close();item['exit_code']=process.returncode;item['status']='FINISHED' if (pathlib.Path(item['out'])/'report.json').exists() else 'CRASHED'
manifest['status']='FINISHED' if all(x['status']=='FINISHED' for x in manifest['workers']) else 'INCOMPLETE';manifest['finished_at']=time.time();save()
aggregate=subprocess.run(['python3',str(repo/'tests/memory-audit/aggregate.py'),'--out',str(root)],cwd=repo)
if aggregate.returncode:raise SystemExit(aggregate.returncode)
if args.spend_budget:
 extra=root/'additional-semantic';extra.mkdir();extra_jobs=[];manifest['additional_workers']=[];manifest['status']='ADDITIONAL_SCENARIOS_RUNNING';save()
 for i in range(args.workers):
  start=1000+6500*i//args.workers;end=1000+6500*(i+1)//args.workers;out=extra/f'worker-{i+1}';out.mkdir()
  command=['deno','run','--allow-read','--allow-write','--allow-run','--allow-env','--allow-net=api.openai.com','tests/memory-audit/campaign.ts','--real-model','--trials','1','--workflow-variants','0','--semantic-variants','150','--id-prefix','E','--start-index',str(start),'--end-index',str(end),'--out',str(out)]
  log=open(out/'run.log','w');process=subprocess.Popen(command,cwd=repo,stdout=log,stderr=subprocess.STDOUT)
  item={'worker':i+1,'start_index':start,'end_index':end,'pid':process.pid,'out':str(out),'status':'RUNNING'};manifest['additional_workers'].append(item);extra_jobs.append((process,log,item))
 save()
 while any(process.poll() is None for process,_,_ in extra_jobs):
  for process,_,item in extra_jobs:
   item['exit_code']=process.poll();checkpoint=pathlib.Path(item['out'])/'completed.jsonl';item['completed']=sum(1 for _ in checkpoint.open()) if checkpoint.exists() else 0
   if item['exit_code'] is not None:item['status']='FINISHED' if (pathlib.Path(item['out'])/'report.json').exists() else 'CRASHED'
  save();time.sleep(15)
 for process,log,item in extra_jobs:
  log.close();item['exit_code']=process.returncode;item['status']='FINISHED' if (pathlib.Path(item['out'])/'report.json').exists() else 'CRASHED'
 manifest['status']='FINISHED' if all(item['status']=='FINISHED' for item in manifest['additional_workers']) else 'INCOMPLETE';manifest['finished_at']=time.time();save()
 ledger=pathlib.Path('/workspace/.upmore-tools/audit-budget/budget.json');data=json.loads(ledger.read_text());summary={'first_campaign':3500,'additional_target':6500,'status':manifest['status'],'charged_or_reserved_usd':data['charged_micros']/1e6,'remaining_usd':(data['limit_micros']-data['charged_micros'])/1e6,'unknown_calls':data['unknown_calls'],'note':'Token billing and conservative reservations may leave a remainder. Blocked cases do not count as paid conversations or passes.'}
 (root/'budget-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
raise SystemExit(0 if manifest['status']=='FINISHED' else 1)
