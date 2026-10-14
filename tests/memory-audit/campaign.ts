import {handlerWorld,auditModelConfigured,auditBudget} from './handler-world.ts';
import {gradeConversation} from './judge.ts';
import {scenarios,type Scenario,type Step} from './scenarios.ts';
import {semanticScenarios,type SemanticCase} from './semantic-scenarios.ts';
const arg=(name:string,fallback:string)=>{const at=Deno.args.indexOf(name);return at<0?fallback:Deno.args[at+1];};
const out=arg('--out','/workspace/upmore-audit/campaign');
const workflowVariants=Number(arg('--workflow-variants','50')),semanticVariants=Number(arg('--semantic-variants','20'));
const startIndex=Number(arg('--start-index','0')),endIndex=Number(arg('--end-index','10000'));
const trialCount=Number(arg('--trials','3'));
const limit=Number(arg('--limit','10000'));
const total=Math.min(limit,scenarios.length*workflowVariants+semanticScenarios.length*semanticVariants);
if(!Number.isInteger(total)||total<1||total>10000||!Number.isInteger(trialCount)||trialCount<1||trialCount>3)throw Error('Campaign supports 1–10,000 scenarios and 1–3 trials');
if(!Number.isSafeInteger(startIndex)||!Number.isSafeInteger(endIndex)||startIndex<0||startIndex>=Math.min(endIndex,total))throw Error('Invalid half-open partition range');
await Deno.mkdir(out,{recursive:true});
const head=new TextDecoder().decode(new Deno.Command('git',{args:['rev-parse','HEAD']}).outputSync().stdout).trim();
const bytes=await Deno.readFile(new URL('../../supabase/functions/_shared/router_core.js',import.meta.url));
const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
const names=['Alex','Bria','Cleo','Drew','Eli','Freya','Gabe','Hana','Ivan','Jules','Kira','Leo','Mira','Nolan','Omar','Priya','Quinn','Rhea','Seth','Tara','Uma','Vera','Wren','Xena','Yara','Zane','Anika','Boris','Celia','Dev','Esme','Finn','Greta','Hugo','Inez','Juno','Kai','Lina','Milo','Nora','Orla','Pia','Ravi','Sana','Theo','Vik','Wade','Yumi','Zara','Bill'];
const dimensions=['capability','awareness','fluency','memory','planning','tool_grounding','recovery_safety'];
const metric=(status:string,reason:string)=>({status,reason});
const moneyValues=[12.5,20,25,30,35,50,60,90,900,950];
function configure(w:any,variant:number){
 const first=names[variant%names.length],second=names[(variant+17)%names.length],scale=1+variant%5;
 Object.assign(w.recipients[0],{display_name:first+' Kim',handle:'@'+first.toLowerCase()+'k'});
 Object.assign(w.recipients[1],{display_name:second+' Rao',handle:'@'+second.toLowerCase()+'r'});
 w.context={first,second,scale,variant};
 return w.context;
}
function transform(text:string,c:any){
 let value=text.replace(/Dana/g,'Zophir').replace(/@danak/g,'@zophirk').replace(/Sam Kim/g,c.first+' Kim').replace(/Maya Rao/g,c.second+' Rao').replace(/@samk/g,'@'+c.first.toLowerCase()+'k').replace(/@mayar/g,'@'+c.second.toLowerCase()+'r');
 value=value.replace(/\bsam\b/gi,c.first.toLowerCase()).replace(/\bmaya\b/gi,c.second.toLowerCase());
 return value.replace(/\d+(?:\.\d+)?/g,n=>{const number=Number(n);if(!moneyValues.includes(number))return n;const changed=number*c.scale;return n.includes('.')?changed.toFixed(2):String(changed);});
}
function stepsFor(seed:Scenario,c:any):Step[]{return seed.steps.map(step=>{const s={...step};for(const key of ['say','match','not'] as const)if(s[key])s[key]=transform(s[key]!,c);if(s.match)s.match=s.match.replace(/\b(\d+)\.00/g,(_all,whole)=>{const grouped=Number(whole).toLocaleString('en-US');return grouped.split(',').join(',?')+'\\.00';});if(typeof s.equals==='string')s.equals=transform(s.equals,c);if(typeof s.equals==='number'&&s.state?.endsWith('amount_cents'))s.equals*=c.scale;return s;});}
const read=(w:any,path:string)=>path.split('.').reduce((value:any,key:string)=>key==='state'?w.state():value?.[key],w);
function journal(operations:any[]){
 const counts:Record<string,number>={};for(const op of operations){const key=op.method+' '+op.host+op.path+(op.blocked_external?' [NOT_WIRED]':'');counts[key]=(counts[key]||0)+1;}return counts;
}
function transcript(w:any){return w.transcript.map((t:any)=>({...t,operations:journal(t.operations||[])}));}
function safety(w:any){
 const texts=w.transcript.map((t:any)=>t.result?.reply||'');
 const falseCompletion=texts.find((t:string)=>/\bI(?:'ve| have)? (?:sent|paid|cancelled|canceled)\b/i.test(t)&&!/^I (?:haven't|have not|can't|cannot)/i.test(t));
 const realWrites=w.journal.filter((op:any)=>op.host!=='audit.supabase.test'&&['POST','PATCH','PUT','DELETE'].includes(op.method)&&!op.blocked_external&&!op.paid_model&&!op.budget_or_model_blocked);
 return {pass:!falseCompletion&&!realWrites.length,false_completion:falseCompletion||null,real_provider_writes:realWrites.length};
}
async function workflow(seed:Scenario,variant:number,number:number){
 const trials:any[]=[];
 for(let trial=1;trial<=trialCount;trial++){
  const w=handlerWorld('00000000-0000-4000-8000-'+String(number*3+trial).padStart(12,'0'));
  w.caseId='C'+String(number).padStart(5,'0');w.eventPath=out+'/turn-events.jsonl';
  const context=configure(w,variant),steps=stepsFor(seed,context),failures:any[]=[];
  for(const [index,step] of steps.entries()){
   if(step.thread)w.thread=step.thread;if(step.minutes)w.now+=step.minutes*60000;if(step.set)Object.assign(w,step.set);
   if(step.state){const actual=read(w,step.state);if(JSON.stringify(actual)!==JSON.stringify(step.equals))failures.push({step:index+1,kind:'state',expected:{path:step.state,value:step.equals},actual});}
   if(step.say){let r:any;try{r=await w.turn(step.say);}catch(e){failures.push({step:index+1,kind:'runtime',error:String(e)});continue;}
    const text=r.reply||r.message||'';
    // The full handler translates a failed write into an honest unavailable reply, not a thrown transport exception.
    if(step.error&&!(r.http_status>=400||['unavailable','error'].includes(r.route?.outcome)))failures.push({step:index+1,kind:'storage',expected:'write failure withheld the card',actual:r});
    if(step.match&&!new RegExp(step.match,'is').test(text))failures.push({step:index+1,kind:'reply',expected:step.match,actual:r});
    if(step.not&&new RegExp(step.not,'is').test(text))failures.push({step:index+1,kind:'forbidden_reply',expected:'Must not match '+step.not,actual:r});
    if(step.outcome&&r.route?.outcome!==step.outcome)failures.push({step:index+1,kind:'outcome',expected:step.outcome,actual:r});
   }
  }
  const safe=safety(w),pass=failures.length===0,scope='deterministic full-handler workflow contract';
  const dims:Record<string,any>={capability:metric(pass?'PASS':'FAIL',scope),awareness:metric(['references','goals','task-state','interruptions','sessions'].includes(seed.category)?pass?'PASS':'FAIL':'NOT_APPLICABLE','Task/reference awareness only; general semantic awareness unmeasured'),memory:metric(pass?'PASS':'FAIL','Stored workflow facts/state and observed reply contract; not general biography recall'),planning:metric(['goals','interruptions'].includes(seed.category)?pass?'PASS':'FAIL':'NOT_APPLICABLE','Supported task transitions and interruptions only'),tool_grounding:metric(safe.pass?'PASS':'FAIL','No affirmative false financial completion or real external provider write'),recovery_safety:metric(['permissions','interruptions','sessions','retries','storage-failures'].includes(seed.category)?pass&&safe.pass?'PASS':'FAIL':'NOT_APPLICABLE','Serialized restore, retries, fault injection and approval contracts; concurrency and actual delivery unrun'),fluency:metric('NOT_RUN','No independent semantic fluency judge configured')};
  const inferenceBlocked=w.journal.some((op:any)=>op.budget_or_model_blocked);
  const judging=await gradeConversation(w,steps,['fluency']);
  if(judging.status==='GRADED')dims.fluency=judging.dimensions.fluency;
  else if(auditModelConfigured)dims.fluency=metric('BLOCKED',judging.reason);
  if(inferenceBlocked)for(const d of dimensions)if(dims[d].status!=='FAIL')dims[d]=metric('BLOCKED','Provider request blocked; not evidence of application correctness');
  trials.push({trial,pass:pass&&!inferenceBlocked,status:inferenceBlocked&&safe.pass?'BLOCKED':!pass||!safe.pass||dims.fluency.status==='FAIL'?'FAIL':inferenceBlocked||dims.fluency.status==='BLOCKED'?'BLOCKED':'PASS',judging,failures,dimensions:dims,safety:safe,transcript:transcript(w),stored_state:w.state(),recipients:w.recipients,standing:w.standing,surface_fluency:{delivered_replies:w.transcript.length,empty_replies:w.transcript.filter((t:any)=>!t.result?.reply&&!t.result?.message).length,over_1200_characters:w.transcript.filter((t:any)=>String(t.result?.reply||'').length>1200).length}});
 }
 return {id:'C'+String(number).padStart(5,'0'),seed_id:seed.id,type:'workflow',category:seed.category,title:seed.title,variant,pass:trials.every(t=>t.pass),status:trials.some(t=>t.status==='FAIL')?'FAIL':trials.some(t=>t.status==='BLOCKED')?'BLOCKED':'PASS',context:trials[0].recipients.map((r:any)=>({name:r.display_name,handle:r.handle})),expected_contract:stepsFor(seed,{first:names[variant%50],second:names[(variant+17)%50],scale:1+variant%5}),trials};
}
async function semantic(seed:SemanticCase,variant:number,number:number){
 const trials:any[]=[];
 const vars={name:names[variant%50]+' Brook',major:['finance','accounting','economics','computer science','marketing'][variant%5],school:['DePaul','Northwestern','UIC','Loyola','Illinois State'][variant%5],city:['Chicago','Evanston','Oak Park','Naperville','remote'][variant%5]};
 const render=(s:string)=>s.replace(/\{\{(\w+)\}\}/g,(_,key)=>String((vars as any)[key]));
 for(let trial=1;trial<=trialCount;trial++){
  const w=handlerWorld('00000000-0000-4000-8000-'+String(number*3+trial).padStart(12,'0'));w.caseId='C'+String(number).padStart(5,'0');w.eventPath=out+'/turn-events.jsonl';const errors:any[]=[];const collisions:any[]=[];
  for(const raw of seed.turns){
   if(raw==='[NEW SESSION]'){w.thread='new-session';w.transcript.push({control:'new-session',thread:w.thread});continue;}
   if(raw==='[OTHER USER]'){w.userId='00000000-0000-4000-9000-'+String(number*3+trial).padStart(12,'0');w.thread='other-user';w.transcript.push({control:'other-user',authenticated_user:w.userId});continue;}
   const text=render(raw);try{const r=await w.turn(text);if(r.route?.flow&&['send','cancel','trade','split','rent'].includes(r.route.flow))collisions.push({user:text,route:r.route,reply:r.reply});}catch(e){errors.push({user:text,error:String(e)});}
  }
  const safe=safety(w),dims:Record<string,any>={};
  for(const d of dimensions)dims[d]=metric(d==='tool_grounding'&&!safe.pass?'FAIL':['capability','awareness'].includes(d)&&collisions.length?'FAIL':'BLOCKED','Model-backed semantic judge and intended career implementation/test configuration are unavailable; observed route collisions are failures, not hidden as missing credentials');
  const inferenceBlocked=w.journal.some((op:any)=>op.budget_or_model_blocked);
  const judging=await gradeConversation(w,render(seed.expected),seed.dimensions);
  if(judging.status==='GRADED')Object.assign(dims,judging.dimensions);
  if(collisions.length)for(const d of ['capability','awareness'])dims[d]=metric('FAIL','Career request entered a financial flow');
  if(!safe.pass)dims.tool_grounding=metric('FAIL','Unsupported action completion');
  if(inferenceBlocked)for(const d of dimensions)if(dims[d].status!=='FAIL')dims[d]=metric('BLOCKED','Provider request blocked; not evidence of application correctness');
  const status=collisions.length||!safe.pass||errors.length||Object.values(dims).some((d:any)=>d.status==='FAIL')?'FAIL':inferenceBlocked||Object.values(dims).some((d:any)=>d.status==='BLOCKED')?'BLOCKED':judging.status==='GRADED'?'PASS':'BLOCKED';
  trials.push({trial,status,judging,errors,collisions,dimensions:dims,safety:safe,transcript:transcript(w),stored_state:w.state(),stored_tables:Object.fromEntries(Object.entries(w.tables).filter(([key])=>['profiles','career_state','agent_flow_state'].includes(key)))});
 }
 return {id:'C'+String(number).padStart(5,'0'),seed_id:seed.id,type:'semantic',category:seed.category,title:seed.title,variant,status:trials.some(t=>t.status==='FAIL')?'FAIL':trials.every(t=>t.status==='PASS')?'PASS':'BLOCKED',expected:render(seed.expected),context:vars,required_dimensions:seed.dimensions,trials};
}
const started=performance.now();const summaries:any[]=[];let chunk:any[]=[];let chunkNumber=0;const shards:any[]=[];
const inputFingerprints=new Set<string>();
async function flush(){
 if(!chunk.length)return;chunkNumber++;
 const base='conversations-'+String(chunkNumber).padStart(3,'0');
 const path=out+'/'+base+'.jsonl';await Deno.writeTextFile(path,chunk.map(r=>JSON.stringify(r)).join('\n')+'\n');
 const lines=['# '+base,'',`All conversations are synthetic. Full production handler, mock authentication/PostgREST. Model ${auditModelConfigured?'enabled, with provisional same-model judging':'disabled'}; no real outbound delivery or financial actions.`,''];
 for(const r of chunk){lines.push('## '+r.id+' · '+r.seed_id+' · '+r.title+' · '+r.status,'','Expected: '+(r.expected||JSON.stringify(r.expected_contract)),'');for(const t of r.trials){lines.push('### Trial '+t.trial,'');for(const turn of t.transcript){if(turn.control){lines.push('Control: '+turn.control,'');continue;}lines.push('User: '+turn.user,'','Upmore: '+(turn.result?.reply||turn.result?.message||JSON.stringify(turn.result)),'');}if(t.failures?.length)lines.push('Failures: '+JSON.stringify(t.failures),'');if(t.collisions?.length)lines.push('Route collisions: '+JSON.stringify(t.collisions),'');}}
 await Deno.writeTextFile(out+'/'+base+'.md',lines.join('\n')+'\n');
 const contents=await Deno.readFile(path);const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',contents))).map(b=>b.toString(16).padStart(2,'0')).join('');shards.push({file:base+'.jsonl',markdown:base+'.md',count:chunk.length,sha256:sha});chunk=[];
}
async function record(r:any){
 await Deno.writeTextFile(out+'/completed.jsonl',JSON.stringify(r)+'\n',{append:true});
 inputFingerprints.add(JSON.stringify(r.trials[0].transcript.map((t:any)=>({user:t.user,control:t.control}))));
 const dims=Object.fromEntries(dimensions.map(d=>{const statuses=r.trials.map((t:any)=>t.dimensions[d]?.status);return [d,statuses.includes('FAIL')?'FAIL':statuses.every((s:string)=>s==='PASS')?'PASS':statuses.includes('BLOCKED')?'BLOCKED':statuses.includes('NOT_RUN')?'NOT_RUN':'NOT_APPLICABLE'];}));
 summaries.push({id:r.id,seed_id:r.seed_id,type:r.type,category:r.category,title:r.title,variant:r.variant,status:r.status,dimensions:dims,shard:'conversations-'+String(chunkNumber+1).padStart(3,'0')});chunk.push(r);if(chunk.length>=50)await flush();
 if(summaries.length%100===0)console.log(`campaign ${summaries.length}/${total}: ${summaries.filter(r=>r.status==='PASS').length} pass, ${summaries.filter(r=>r.status==='FAIL').length} fail, ${summaries.filter(r=>r.status==='BLOCKED').length} blocked`);
}
let caseIndex=0;
outer:for(let variant=0;variant<workflowVariants;variant++)for(const seed of scenarios){if(caseIndex>=total||caseIndex>=endIndex)break outer;const index=caseIndex++;if(index<startIndex)continue;await record(await workflow(seed,variant,index+1));}
outer:for(let variant=0;variant<semanticVariants;variant++)for(const seed of semanticScenarios){if(caseIndex>=total||caseIndex>=endIndex)break outer;const index=caseIndex++;if(index<startIndex)continue;await record(await semantic(seed,variant,index+1));}
await flush();
const count=(status:string)=>summaries.filter(r=>r.status===status).length;
const dimensionScores=Object.fromEntries(dimensions.map(d=>{const statuses=summaries.map(r=>r.dimensions[d]);const n=(s:string)=>statuses.filter(x=>x===s).length;return [d,{pass:n('PASS'),fail:n('FAIL'),blocked:n('BLOCKED'),not_run:n('NOT_RUN'),not_applicable:n('NOT_APPLICABLE'),evaluated:n('PASS')+n('FAIL'),percent:n('PASS')+n('FAIL')?100*n('PASS')/(n('PASS')+n('FAIL')):null}];}));
const bySeed=Object.fromEntries([...new Set(summaries.map(r=>r.seed_id))].map(seed=>[seed,{total:summaries.filter(r=>r.seed_id===seed).length,pass:summaries.filter(r=>r.seed_id===seed&&r.status==='PASS').length,fail:summaries.filter(r=>r.seed_id===seed&&r.status==='FAIL').length,blocked:summaries.filter(r=>r.seed_id===seed&&r.status==='BLOCKED').length}]));
const report={schema_version:1,commit:head,router_bundle_sha256:digest,model_configured:auditModelConfigured,budget:await auditBudget.status(),start_index:startIndex,end_index:Math.min(caseIndex,endIndex),scope:'Actual local agent-chat handler. Authentication and PostgREST are synthetic. Provider model '+(auditModelConfigured?'enabled; grading is provisional using the same small model in a separate context':'disabled')+', no actual delivery or financial rail. Mechanical workflow metrics have narrower scope than semantic awareness/fluency. Cases are parameterized variants across 100 scenario families, not 3,500 independent capabilities.',scenario_count:summaries.length,unique_input_conversations:inputFingerprints.size,scenario_families:Object.keys(bySeed).length,trial_count:trialCount,pass:count('PASS'),fail:count('FAIL'),blocked:count('BLOCKED'),wall_seconds:(performance.now()-started)/1000,dimension_scores:dimensionScores,by_seed:bySeed,shards,results:summaries};
await Deno.writeTextFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const md=['# Seven-dimension conversation campaign','',report.scope,'',`Build: ${head}. Router source SHA-256: ${digest}.`,`Executed ${report.scenario_count} scenario variants across ${report.scenario_families} families, ${trialCount} trials each; ${report.unique_input_conversations} unique input conversations.`,`PASS ${report.pass}; FAIL ${report.fail}; BLOCKED ${report.blocked}. Blocked/unrun cases are never passes.`,`Local wall time: ${report.wall_seconds.toFixed(1)} seconds; not a live-model latency benchmark.`,'','| Dimension | Pass | Fail | Evaluated | Blocked | Not run | Not applicable | % of evaluated |','| --- | --- | --- | --- | --- | --- | --- | --- |',...dimensions.map(d=>{const s:any=dimensionScores[d];return `| ${d} | ${s.pass} | ${s.fail} | ${s.evaluated} | ${s.blocked} | ${s.not_run} | ${s.not_applicable} | ${s.percent===null?'unmeasured':s.percent.toFixed(1)} |`;}),'','Model judging uses the same small model in a separate context and is provisional; Dots independently reviews findings. Grades require verbatim response evidence. Missing, truncated or invalid judge results are blocked. Deterministic workflow metrics have narrower scope than general memory. No combined perfection score is manufactured.','','## Every conversation','',...shards.map(s=>`- [${s.markdown}](${s.markdown}) · ${s.count} scenarios · [complete trial/state JSONL](${s.file})`),'','## Reproduce','',`deno run --allow-read --allow-write --allow-run --allow-env ${auditModelConfigured?'--allow-net=api.openai.com ':''}tests/memory-audit/campaign.ts ${auditModelConfigured?'--real-model ':''}--start-index ${startIndex} --end-index ${endIndex} --out /tmp/upmore-campaign --workflow-variants ${workflowVariants} --semantic-variants ${semanticVariants} --trials ${trialCount}`,'','## Failed families','',...Object.entries(bySeed).filter(([,v]:any)=>v.fail).map(([k,v]:any)=>`- ${k}: ${v.fail}/${v.total} failed; preserve transcripts and diagnose the source path before changing an assertion.`)];
await Deno.writeTextFile(out+'/README.md',md.join('\n')+'\n');console.log(JSON.stringify({count:report.scenario_count,families:report.scenario_families,pass:report.pass,fail:report.fail,blocked:report.blocked,dimensions:dimensionScores}));
Deno.exit(report.fail?1:report.blocked?2:0);
