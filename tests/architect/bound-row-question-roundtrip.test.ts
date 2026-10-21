// Synthetic end-to-end regression: actual producer -> persisted question -> text answer -> planner -> contract.
import { planForm, questionsForTrainee, trustedManifest, contractFill } from '../../extension/src/apply_core.ts';
import { questionsTurn, QUESTIONS_INTENT } from '../../supabase/functions/_shared/career_apply_questions.ts';
import { questionsToStore } from '../../workers/career-browser/ask-once.ts';
const OWNER='SYN-ROW-QUESTION-OWNER',JOB='workday:synthetic:R-88',NOW=1000;
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function assert(ok:unknown,why='assertion failed'):asserts ok{if(!ok)throw Error(why)}
const field=(format='MM/YYYY',row=1)=>({name:`work-${row}--start`,label:'From',type:'date',required:true,options:[],section:{kind:'work',row,part:'start',anchor:'',format}});
const manifest=(rows:any[]=[])=>trustedManifest({owner:OWNER,file:null,rows,resume:null});
const plan=(schema:any[],m:any,job=JOB)=>planForm({userId:OWNER,jobId:job,company:'Synthetic Employer',family:'workday',workdayFlow:true,schema,answers:m.answers,saved:m.saved,now:NOW});
async function answer(schema:any[],values:string[]){
 const before=plan(schema,manifest());assert(before.fill.length===0,'initial missing answer control');
 const questions=JSON.parse(JSON.stringify(questionsForTrainee({jobId:JOB,company:'Synthetic Employer',needs:before.needs,answers:{},answered:new Set()}).questions));
 assert(questions.length===values.length,'row questions collapsed');
 const qs=questions.map((q:any,i:number)=>({...q,id:`SYN-Q-${i}`,job_ids:[JOB],answer:null}));const saved=new Map<string,string>();
 for(const q of qs){assert(/^job:[a-f0-9]{16}$/.test(q.key)&&q.kind==='unknown','row question promoted into a global/wording fact');assert(/^row:(month|year):[a-f0-9]{16}$/.test(q.type)&&q.type.length<=40,'row identity or precision lost');assert(/work|Work/.test(q.label)&&/1|2/.test(q.label),'missing row context');}
 const store:any={shown:async()=>({thread:'SYN-THREAD',ids:qs.map((q:any)=>q.id),at:new Date(NOW).toISOString()}),lastAssistantIntent:async()=>QUESTIONS_INTENT,get:async()=>qs,answer:async(_u:string,id:string,value:string)=>{saved.set(id,value)},open:async()=>qs.filter((q:any)=>!saved.has(q.id)),countOpen:async()=>qs.filter((q:any)=>!saved.has(q.id)).length,setShown:async()=>{}};
 const message=values.length===1?values[0]:values.map((v,i)=>`${i+1} ${v}`).join('\n');await questionsTurn({message,userId:OWNER,threadId:'SYN-THREAD',now:NOW,store});
 assert(saved.size===values.length,'real answer turn did not persist values');
 const rows=qs.map((q:any)=>({...q,answer:saved.get(q.id)})),m=manifest(rows),after=plan(schema,m),contract=contractFill({schema,plan:after,manifest:m,resume:null});
 return{questions,rows,m,after,contract};
}
for(const[format,value]of[['MM/YYYY','02/2028'],['YYYY','2028']])Deno.test('bound row question: '+format+' survives persistence, answer turn, replan and source contract',async()=>{
 const f=field(format),r=await answer([f],[value]);assert(r.after.fill[0]?.value===value&&r.after.needs.length===0,'saved exact row answer was asked again');assert(r.contract.fill[0]?.value===value&&r.contract.asks.length===0,'saved exact row answer failed contract');assert(r.contract.fill[0].factId==='text-answer:SYN-Q-0','confirmation source changed');
});
Deno.test('bound row question: same-label two rows stay distinct and carry their own answer events',async()=>{
 const schema=[field('YYYY',1),field('YYYY',2)],r=await answer(schema,['2020','2021']);assert(r.questions[0].key!==r.questions[1].key,'row identity collapsed');assert(r.contract.fill.length===2,'two rows did not complete');assert(r.contract.fill[0].value==='2020'&&r.contract.fill[1].value==='2021','answers crossed rows');
});
Deno.test('bound row question: job, row, field, anchor, format, type, options and part mutations cannot reuse the answer',async()=>{
 const f=field(),r=await answer([f],['02/2028']);
 const mutations=[(f:any)=>f.name='work-2--start',(f:any)=>f.section.row=2,(f:any)=>f.section.anchor='Different employer',(f:any)=>f.section.format='YYYY',(f:any)=>f.type='text',(f:any)=>f.options=[{label:'February 2028',value:'2028-02'}],(f:any)=>f.section.part='end'];
 for(const mutate of mutations){const changed=clone(f);mutate(changed);const p=plan([changed],r.m);assert(p.fill.length===0,'changed row/schema reused saved answer');const c=contractFill({schema:[changed],plan:{...r.after,fill:r.after.fill},manifest:r.m,resume:null});assert(c.fill.length===0&&c.asks.length===1,'stale row value bypassed contract');}
 const other=plan([f],r.m,'workday:synthetic:R-89');assert(other.fill.length===0,'answer crossed job');const c=contractFill({schema:[f],plan:{...r.after,jobId:'workday:synthetic:R-89'},manifest:r.m,resume:null});assert(c.fill.length===0,'contract ignored current job');
});
Deno.test('bound row question: ordinary label answers and malformed encoded types never gain a row binding',async()=>{
 const f=field();const legacy=trustedManifest({owner:OWNER,file:{user_id:OWNER,answers:{},saved:{from:{value:'02/2028',factId:'SYN-label-only',confirmed:true,provenance:'owner stated this answer',confirmation_event_id:'SYN-event'}}},rows:[],resume:null});assert(plan([f],legacy).fill.length===0,'label-only From reused in row');
 for(const type of ['row:month:xyz','row:month:'+'a'.repeat(16)+'extra','row::'+'a'.repeat(16)]){const q=questionsToStore({posting:JOB,questions:[{label:'Work 1 start',type,options:[]}]},{facts:{},answered:new Set()});assert(q.questions.length===0,'malformed row type fell back to generic storage');}
});
