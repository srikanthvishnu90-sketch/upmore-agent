import {world,clone} from './world.ts';
import {scenarios,type Step} from './scenarios.ts';
const trials=3;
const output=Deno.args[0]||'/workspace/upmore-audit/memory-score.json';
const commit=new TextDecoder().decode(new Deno.Command('git',{args:['rev-parse','HEAD']}).outputSync().stdout).trim();
const read=(w:any,path:string)=>path.split('.').reduce((value:any,key:string)=>key==='state'?w.state():value?.[key],w);
const runs:any[]=[];
for(const scenario of scenarios){
 const outcomes=[];
 for(let trial=1;trial<=trials;trial++){
  const w=world();const failures:any[]=[];
  for(const [index,step] of scenario.steps.entries()){
   if(step.thread)w.thread=step.thread;if(step.minutes)w.now+=step.minutes*60000;if(step.set)Object.assign(w,step.set);
   if(step.state){const actual=read(w,step.state);if(JSON.stringify(actual)!==JSON.stringify(step.equals))failures.push({step:index+1,expected:{path:step.state,value:step.equals},actual});}
   if(step.say){let result:any=null,error='';try{result=await w.turn(step.say);}catch(e){error=String(e);}
    const text=result?.reply||result?.note||'';
    if(step.error){if(!error.includes(step.error))failures.push({step:index+1,expected:{error:step.error},actual:error||result});}
    else if(error)failures.push({step:index+1,error});
    if(step.match&&!new RegExp(step.match,'is').test(text))failures.push({step:index+1,expected:{reply:step.match},actual:result});
    if(step.not&&new RegExp(step.not,'is').test(text))failures.push({step:index+1,expected:{must_not:step.not},actual:result});
    if(step.outcome&&result?.route?.outcome!==step.outcome)failures.push({step:index+1,expected:{outcome:step.outcome},actual:result});
   }
  }
  const s=w.state();
  outcomes.push({trial,pass:!failures.length,failures,transcript:w.transcript,stored_summary:{send_count:s?.send?.sends?.length||0,split_count:s?.split?.staged?.length||0,settled:s?.router?.settled||null},recipients:w.recipients,standing:w.standing});
 }
 runs.push({...scenario,pass:outcomes.every(r=>r.pass),trials:outcomes});
}
const passed=runs.filter(r=>r.pass).length;
const categories=Object.fromEntries([...new Set(runs.map(r=>r.category))].map(category=>{const rows=runs.filter(r=>r.category===category);return [category,{passed:rows.filter(r=>r.pass).length,total:rows.length}]}));
const result={schema_version:1,commit,scope:'Production deterministic flow-memory layer, local JSON persistence between every turn, synthetic recipients and transactions, no model, no actual transport or live financial rails. This is not a semantic career-memory or full live product score.',trial_count:trials,passed,total:runs.length,percent:100*passed/runs.length,categories,results:runs};
await Deno.writeTextFile(output,JSON.stringify(result,null,2)+'\n');
console.log(`workflow memory: ${passed}/${runs.length} (${result.percent.toFixed(1)}%), each case must pass all ${trials} trials`);
for(const r of runs.filter(r=>!r.pass))console.log(`${r.id}: ${r.title} — ${JSON.stringify(r.trials[0].failures[0])}`);
if(runs.length!==50)throw Error('Expected exactly 50 scenarios');
Deno.exit(passed===runs.length?0:1);
