// Independently invented source-identity controls. No bank mutation or provider/network calls.
import { careerTools } from '../../../supabase/functions/_shared/agent/career_tools.ts';
import { factSources,untracedFacts } from '../../../supabase/functions/_shared/agent/reply_guards.ts';
import { personBlock } from '../../../supabase/functions/_shared/agent/memory.ts';
import { personalSourceGuard } from '../../../supabase/functions/_shared/personal_fact_source.ts';
const OWNER='SYN-QA-LONG-PROFILE',assert=(v:unknown,m:string)=>{if(!v)throw Error(m)};
const own=(id:string,text:string,extra:any={})=>({id,kind:'skill',text,status:'confirmed',needs_confirmation:false,source:'user',...extra});
const sources=(facts:any[])=>factSources({state:{profile:{facts}},message:'Which skills fit?',history:[],results:[]});
const supported=(word:string,facts:any[])=>!untracedFacts(`Your ${word} skills fit.`,sources(facts)).length;
const tools=careerTools({postings:async()=>[{job_id:'SYN-QA-DESIGN',title:'UX designer',company:'Synthetic Studio',location:'Denver',description:'UX designer',url:'https://example.invalid/job',first_seen_at:'2026-10-21'}],events:{add:async()=>{}}as any});
let prepared:Promise<any>;
function longProfile(){return prepared??=(async()=>{
 const state:any={profile:{user_id:OWNER,facts:[],preferences:{}}};
 for(let n=1;n<=80;n++){
  const text=n===33?'My goal is a UX designer role in Denver.':`I coordinate volunteer activity number ${n}.`;
  const ctx:any={userId:OWNER,threadId:'SYN-LONG',now:0,state,turn:{message:text,added:[]}};
  const r:any=await tools.find(t=>t.name==='add_profile_fact')!.run({kind:n===33?'goal':'other',text},ctx);
  ctx.turn={message:"yes that's right",added:[]};await tools.find(t=>t.name==='confirm_profile_fact')!.run({id:r.fact.id},ctx);
 }
 return state.profile;
})();}
Deno.test('chat identity: 80 actual confirmed chat facts retain the goal at sequence F-033 in memory',async()=>{
 const profile=structuredClone(await longProfile()),goal=profile.facts[32];
 assert(profile.facts.length===80&&goal.id==='F-033'&&!goal.factId,'fixture did not use actual chat sequence identity');
 const block=personBlock({profile,standing:[],alerts:null,pipeline:null});assert(block.includes('UX designer role in Denver'),'own goal disappeared from memory');
});
Deno.test('chat identity: the actual next search retains the own-chat F-033 goal after 80 confirmed facts',async()=>{
 const profile=structuredClone(await longProfile());
 const r:any=await tools.find(t=>t.name==='search_jobs')!.run({},{userId:OWNER,threadId:'SYN-FRESH',now:Date.UTC(2026,9,21),state:{profile},turn:{message:'Find jobs for my goal.',added:[]}}as any);
 assert(r.goal?.roles.includes('designer')&&r.goal?.places.includes('denver')&&r.postings.some((p:any)=>p.job_id==='SYN-QA-DESIGN'),'actual next search lost own F-033 goal: '+JSON.stringify(r));
});
Deno.test('chat identity: a resolved own-chat F-033 parent supports own direct and transitive descendants',()=>{
 const facts=[own('F-033','SQL'),own('SYN-CHILD','Python',{derived_from:['F-033']}),own('SYN-GRANDCHILD','Java',{derivedFrom:['SYN-CHILD']})];
 assert(supported('SQL',facts)&&supported('Python',facts)&&supported('Java',facts),'dependency literal guessed a bank identity despite its resolved own-chat parent');
});
Deno.test('bank identity: bank factId F-033 and both levels of actual bank lineage stay excluded',()=>{
 const facts=[own('SYN-BANK-ROW','SQL',{factId:'F-033'}),own('SYN-CHILD','Python',{derived_from:['F-033']}),own('SYN-GRANDCHILD','Java',{derivedFrom:['SYN-CHILD']})];
 assert(!supported('SQL',facts)&&!supported('Python',facts)&&!supported('Java',facts),'bank identity or its lineage escaped');
});
Deno.test('identity controls: missing malformed negative-origin and explicitly quarantined dependencies still refuse',()=>{
 for(const extra of [{derived_from:['SYN-MISSING']},{derived_from:null},{source:'agent'},{status:'rejected'},{quarantined:true}]){
  const facts=[own('SYN-PARENT','SQL',extra),own('SYN-CHILD','Python',{derivedFrom:['SYN-PARENT']})],denied=personalSourceGuard([{facts}]);
  assert(denied(facts[0])&&denied(facts[1]),'missing/malformed/explicitly denied parent became usable: '+JSON.stringify(extra));
 }
});
