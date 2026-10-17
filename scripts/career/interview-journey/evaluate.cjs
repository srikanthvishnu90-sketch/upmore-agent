'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function evaluate(args){
  const index=args.indexOf('--mode'),mode=index<0?'scripted-contract':args[index+1];
  if(mode==='real-provider'){
    // No provider transport in B. Flags cannot grant authority or reconcile spend.
    console.error(JSON.stringify({status:'BLOCKED',executed_episodes:0,required_episodes:24,not_run_episodes:24,provider_calls:0,reasons:['Real-provider work is not authorized by this assignment.','A-approved actual product route, evaluated checker, original shared-budget reconciliation and protected evaluator manifest are required.','No provider transport is installed in this B-owned offline runner.']}));return 2;
  }
  if(mode!=='scripted-contract')throw Error('unsupported evaluation mode');
  const mi=args.indexOf('--manifest');if(mi<0)throw Error('--manifest <development manifest> required');
  const manifest=JSON.parse(fs.readFileSync(path.resolve(args[mi+1]),'utf8'));
  if(manifest.kind!=='visible_scripted_development'||manifest.provider_calls!==0)throw Error('only visible offline development manifest accepted');
  const run=spawnSync(process.execPath,[path.join(__dirname,'check-contracts.cjs')],{encoding:'utf8'});process.stdout.write(run.stdout);process.stderr.write(run.stderr);
  if(run.status!==0)return run.status||1;
  console.log(JSON.stringify({label:'SCRIPTED_CONTRACT_DEVELOPMENT',contract_assertions:'PASS',real_provider_episodes:0,real_provider_not_run_episodes:24,quality:'NOT_RUN',provider_calls:0}));return 0;
}
if(require.main===module){try{process.exitCode=evaluate(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={evaluate};
