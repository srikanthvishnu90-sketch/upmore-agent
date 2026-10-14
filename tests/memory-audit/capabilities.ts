// Strict scoring: LIMITED, DIVERGES and NEEDS_MODEL never count as a pass.
import {offline} from '../../evals/corpus/run.ts';
import {replay,HANDLES} from '../../evals/corpus/replay.ts';
import variantModule from '../../evals/corpus/variants.cjs';
import graderModule from '../../evals/corpus/graders.cjs';
import corpus from '../../corpus/corpus.json' with {type:'json'};
const output=Deno.args[0]||'/workspace/upmore-audit/capability-score.json';
const commit=new TextDecoder().decode(new Deno.Command('git',{args:['rev-parse','HEAD']}).outputSync().stdout).trim();
const router_bundle_sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await Deno.readFile(new URL('../../supabase/functions/_shared/router_core.js',import.meta.url))))).map(x=>x.toString(16).padStart(2,'0')).join('');
const trials=[];
for(let trial=1;trial<=3;trial++){
 const results=await offline();const variants=[];
 for(const seed of (corpus as any).examples){
  if(results.find(r=>r.id===seed.id)?.status==='NEEDS_MODEL')continue;
  for(const variant of (variantModule as any).of(seed)){
   const reply=await replay(variant.example);
   const grade=reply.needsModel?{status:'NEEDS_MODEL',failed:[]}:(graderModule as any).grade(variant.example,reply.actual,{handles:HANDLES});
   variants.push({seed:seed.id,kind:variant.kind,status:grade.status,failed:grade.failed});
  }
 }
 trials.push({trial,results,variants});
}
const seeds=trials[0].results.map(r=>({...r,pass:trials.every(t=>t.results.find(x=>x.id===r.id)?.status==='PASS')}));
const count=(status:string)=>seeds.filter(r=>r.status===status).length;
const evaluated=seeds.filter(r=>r.status!=='NEEDS_MODEL');
const passed=seeds.filter(r=>r.pass).length;
const variantResults=trials[0].variants.map((v,i)=>({...v,pass:trials.every(t=>t.variants[i]?.status==='PASS')}));
const summary={passed,total:seeds.length,evaluated:evaluated.length,offline_percent:passed*100/evaluated.length,evaluation_coverage_percent:evaluated.length*100/seeds.length,statuses:Object.fromEntries([...new Set(seeds.map(r=>r.status))].map(s=>[s,count(s)])),variants:{passed:variantResults.filter(r=>r.pass).length,total:variantResults.length,statuses:Object.fromEntries([...new Set(variantResults.map(r=>r.status))].map(s=>[s,variantResults.filter(r=>r.status===s).length]))}};
await Deno.writeTextFile(output,JSON.stringify({schema_version:1,commit,router_bundle_sha256,scope:'Existing 79-example conversation corpus through production local flows and deterministic extraction fixtures. Synthetic broker only in tests. No live model, deployed handler or actual transport tested. Strict PASS-only score; limitations and divergences count as unmet completion, model-only cases remain unrun.',trial_count:3,summary,seeds,trials},null,2)+'\n');
console.log(JSON.stringify(summary));
