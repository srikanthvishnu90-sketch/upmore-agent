// Original synthetic saved/derived answer cases. No provider, browser, or network calls.
import { checkAnswer, questionsTurn, QUESTIONS_INTENT, type OpenQuestion } from '../../supabase/functions/_shared/career_apply_questions.ts';
import { canonicalTypedValue, fitsField, planBatch, questionFieldType, type FormField } from '../../supabase/functions/_shared/career_apply.ts';
import { questionsToStore } from '../../workers/career-browser/ask-once.ts';
import { mapQuestion } from '../../supabase/functions/_shared/question_map.ts';
import { answerKey } from '../../supabase/functions/_shared/question_map.ts';
import { planForm, trustedManifest } from '../../extension/src/apply_core.ts';
function eq(a:unknown,b:unknown,why=''){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${why}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);}
const field=(type:string,label:string,extra:Partial<FormField>={}):FormField=>({name:'synthetic-value',label,type,required:true,options:[],...extra});
const question=(f:FormField):OpenQuestion=>({id:'SYN-Q',key:'label:0123456789abcdef',kind:'unknown',label:f.label,type:f.type,options:f.options.map(o=>o.label),company:'Synthetic Employer',job_ids:['synthetic:job:1'],misfit:false,answer:null});
const plan=(f:FormField,value:string,saved=true)=>planBatch({userId:'SYN-OWNER',postings:[{job_id:'synthetic:job:1',company:'Synthetic Employer',title:'Synthetic Role',fields:[f]}],answers:saved?{}:{start_date:{value,factId:'SYN-FACT'}},saved:saved?{[answerKey(f,'synthetic:job:1',{haveFact:true})]:{value,factId:'SYN-FACT'}}:{},log:[],now:0});

Deno.test('typed answers: malformed numeric and calendar dates stay open before saving',()=>{
 for(const [f,values] of [[field('number','Years of relevant experience'),['five years','NaN','Infinity','1e999','12,000']], [field('date','Available start date'),['tomorrow','2027-02-30','2027-13-01','2027-04-31','2027-01','2027']]] as const)
  for(const value of values)eq(checkAnswer(question(f),value).ok,false,`${f.type}: ${value}`);
});

Deno.test('typed answers: malformed saved values cannot bypass preparation validation',()=>{
 for(const [type,label,value] of [['number','Years of relevant experience','five years'],['date','Available start date','tomorrow'],['date','Available start date','2027-02-30']]){
  const r=plan(field(type,label),value);eq(r.ready.length,0,value);eq(r.needs.length,1,'required invalid answer is asked');
 }
});

Deno.test('typed answers: malformed derived dates are asked and optional invalid values remain empty',()=>{
 const f=field('date','Available start date');eq(plan(f,'2027-02-30',false).ready.length,0,'derived invalid calendar date');
 const r=plan({...f,required:false},'tomorrow');eq(r.ready.length,1);eq(r.ready[0].fields.length,0,'optional invalid value is left empty');
});

Deno.test('typed answer controls: zeros decimals valid leap dates and exact free text survive',()=>{
 for(const value of ['0','-2','1.5']){const f=field('number','Years of relevant experience');eq(checkAnswer(question(f),value),{ok:true,value});eq(plan(f,value).ready[0]?.fields[0]?.value,value);}
 for(const value of ['2028-02-29','2027-01-15']){const f=field('date','Available start date');eq(checkAnswer(question(f),value),{ok:true,value});eq(plan(f,value).ready[0]?.fields[0]?.value,value);}
 const free=field('textarea','Tell us about your experience');eq(checkAnswer(question(free),'five years in 2027'),{ok:true,value:'five years in 2027'});
 const brief=field('textarea','Anything else you would like to share?');eq(checkAnswer(question(brief),'No'),{ok:true,value:'No'});eq(plan(brief,'No').ready[0]?.fields[0]?.value,'No','an exact personal free-text answer is not reinterpreted');
 const select=field('select','Years of relevant experience',{options:[{label:'Less than one year',value:'entry'},{label:'Five years',value:'five'}]});eq(checkAnswer(question(select),'Five years'),{ok:true,value:'Five years'});eq(plan(select,'Five years').ready[0]?.fields[0]?.value,'five');
});

Deno.test('typed answer controls: stated month/year and year precision are preserved rather than completed',()=>{
 for(const [label,value] of [['Graduation date (MM/YYYY)','02/2028'],['Graduation date (YYYY)','2028']]){
  const f=field('text',label);eq(checkAnswer(question(f),value),{ok:true,value});eq(plan(f,value).ready[0]?.fields[0]?.value,value);
 }
 const f=field('date','From',{section:{kind:'work',row:1,part:'start',format:'MM/YYYY'}});
 eq(fitsField(f,'02/2028'),true);eq(fitsField(f,'02/2028')&&fitsField({...f,section:{...f.section!,format:'YYYY'}},'2028'),true);
});

Deno.test('typed answers: invalid repeating-row numeric values and impossible dates are not prepared',()=>{
 const work=field('date','From',{section:{kind:'work',row:1,part:'start',format:'MM/DD/YYYY'}});
 const r=planBatch({userId:'SYN-OWNER',postings:[{job_id:'synthetic:job:1',company:'Synthetic Employer',title:'Synthetic Role',fields:[work]}],answers:{work_history:{value:JSON.stringify([{employer:'Synthetic Employer',title:'Synthetic Analyst',start:'2027-02-30',end:'present'}]),factId:'SYN-WORK'}},saved:{},log:[],now:0});
 eq(r.ready.length,0,'an impossible date cannot be reformatted into a valid answer');
 const gpa=field('number','Overall Result (GPA)',{section:{kind:'education',row:1,part:'gpa'}});
 for(const [value,expected] of [['not available',0],['0',1]] as const){
  const result=planBatch({userId:'SYN-OWNER',postings:[{job_id:'synthetic:job:1',company:'Synthetic Employer',title:'Synthetic Role',fields:[gpa]}],answers:{school:{value:'Synthetic University',factId:'SYN-SCHOOL'},gpa:{value,factId:'SYN-GPA'}},saved:{},log:[],now:0});
  eq(result.ready.length,expected,`derived GPA ${value}`);
 }
});

Deno.test('typed answers: canonical trusted-manifest route still asks for malformed saved values',()=>{
 for(const [type,label,bad,good] of [['number','Years of relevant experience','five years','0'],['date','Available start date','2027-02-30','2028-02-29']]){
  const f=field(type,label),key=answerKey(f,'synthetic:job:1',{haveFact:true});
  for(const value of [bad,good]){
   const manifest=trustedManifest({owner:'SYN-OWNER',file:{user_id:'SYN-OWNER',answers:{},saved:{[key]:{value,factId:'SYN-TYPED-FACT',confirmed:true,user_id:'SYN-OWNER',provenance:'owner stated in chat',confirmation_event_id:'SYN-EVENT'}}},rows:[],resume:null});
   eq(manifest.excluded.length,0,'source is trusted: the typed boundary must decide');
   const r=planForm({userId:'SYN-OWNER',jobId:'synthetic:job:1',company:'Synthetic Employer',family:'lever',schema:[f],answers:manifest.answers,saved:manifest.saved,now:0});
   eq(r.fill.length,value===good?1:0,value);eq(r.needs.length,value===good?0:1,'required malformed answer stays open');
  }
 }
});

Deno.test('typed answers: complete personal dates use the native input ISO representation without adding precision',()=>{
 const f=field('date','Available start date');
 for(const value of ['February 29, 2028','02/29/2028','2028-2-29']){
  eq(checkAnswer(question(f),value),{ok:true,value},'saved answer keeps the person\'s exact representation');
  eq(plan(f,value).ready[0]?.fields[0]?.value,'2028-02-29','native date input receives an equivalent fully stated date');
 }
 eq(plan(f,'02/2028').ready.length,0,'a month cannot gain a day');
});

Deno.test('typed answers: explicit year-first separators validate while native month has its required representation',()=>{
 for(const [format,value] of [['YYYY/MM/DD','2028/02/29'],['YYYY.MM.DD','2028.02.29']]){
  const f=field('text',`Available start date (${format})`);eq(checkAnswer(question(f),value),{ok:true,value});eq(plan(f,value).ready[0]?.fields[0]?.value,value);
  eq(checkAnswer(question(f),value.replace('29','30')).ok,false,'impossible day rejected');
 }
 const f=field('month','Available start month');eq(canonicalTypedValue(f,'February 2028'),'2028-02');eq(plan(f,'02/2028').ready[0]?.fields[0]?.value,'2028-02');eq(canonicalTypedValue(f,'2028'),null,'year cannot gain a month');
});

Deno.test('typed answers: known section precision survives stored question and real answer turn without label inference',async()=>{
 for(const [format,value,type] of [['MM/YYYY','02/2028','month'],['YYYY','2028','year']]){
  const f=field('date','From',{section:{kind:'work',row:1,part:'start',format}});
  const t=questionFieldType(f);eq(t,type);eq(mapQuestion({...f,type:t}).kind,mapQuestion(f).kind,'date precision keeps question kind');
  eq(answerKey({...f,type:t},'synthetic:job:1'),answerKey(f,'synthetic:job:1'),'precision keeps answer scope');
  const stored=questionsToStore({posting:'synthetic:job:1',company:'Synthetic Employer',questions:[{label:f.label,type:t,options:[]}]},{facts:{},answered:new Set()});
  eq(stored.questions[0]?.type,type,'existing question type column carries precision');
  const q={...question(f),...stored.questions[0]} as OpenQuestion;let saved:string|null=null;const now=1000;
  const store={shown:async()=>({thread:'SYN-THREAD',ids:[q.id],at:new Date(now).toISOString()}),lastAssistantIntent:async()=>QUESTIONS_INTENT,get:async()=>[q],answer:async(_u:string,_id:string,v:string)=>{saved=v;},open:async()=>[q],countOpen:async()=>1,setShown:async()=>{}};
  await questionsTurn({message:value,userId:'SYN-OWNER',threadId:'SYN-THREAD',now,store});eq(saved,value,'real answer turn saves exact stated precision');
  eq(checkAnswer(q,format==='YYYY'?'02/2028':'2028-02-29').ok,false,'different precision stays open');
 }
 const lossy=question(field('date','From'));eq(checkAnswer(lossy,'02/2028').ok,false,'missing metadata never means guess From is month/year');
 for(const f of [field('select','From',{options:[{label:'This year',value:'2028'}],section:{kind:'work',row:1,part:'start',format:'YYYY'}}),field('number','Years of relevant experience')])eq(questionFieldType(f),f.type,'choice/number type preserved');
});
