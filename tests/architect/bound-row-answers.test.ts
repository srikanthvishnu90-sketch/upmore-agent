// Synthetic row-answer consumer checks. No provider, browser, or network.
import { planBatch, questionFieldType, type FormField } from '../../supabase/functions/_shared/career_apply.ts';
import { checkAnswer, questionsTurn, QUESTIONS_INTENT, type OpenQuestion } from '../../supabase/functions/_shared/career_apply_questions.ts';
import { rowAnswerKey, rowQuestionLabel, rowQuestionType } from '../../supabase/functions/_shared/row_answer.ts';
const eq=(a:unknown,b:unknown,why='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${why}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);};
const OWNER='SYN-ROW-OWNER',JOB='workday:synthetic:bound';
const field=(extra:Partial<FormField>={}):FormField=>({name:'workExperience-1--start',label:'From',type:'date',required:true,options:[],section:{kind:'work',row:1,part:'start',anchor:'Synthetic Employer',format:'MM/YYYY'},...extra});
const run=(fields:FormField[],saved:Record<string,{value:string;factId:string}>,answers:Record<string,{value:string;factId:string}>={},job=JOB)=>planBatch({userId:OWNER,postings:[{job_id:job,company:'Synthetic Hiring',title:'Synthetic Role',fields}],answers,saved,log:[],now:0});
const own=(f:FormField,value:string)=>({[rowAnswerKey(f,JOB)!]:{value,factId:'SYN-ROW-ANSWER'}});
const question=(f:FormField):OpenQuestion=>({id:'SYN-QUESTION',key:rowAnswerKey(f,JOB)!,kind:'unknown',label:rowQuestionLabel(f),type:rowQuestionType(f,JOB,questionFieldType(f)),options:f.options.map(o=>o.label),company:'Synthetic Hiring',job_ids:[JOB],misfit:false,answer:null});

Deno.test('bound row answers: known month and year answers save and fill the exact row',async()=>{
 for(const [format,value]of[['MM/YYYY','02/2028'],['YYYY','2028']]){
  const f=field({section:{kind:'work',row:1,part:'start',anchor:'Synthetic Employer',format}}),q=question(f);let saved:string|null=null;const now=1000;
  const store={shown:async()=>({thread:'SYN-THREAD',ids:[q.id],at:new Date(now).toISOString()}),lastAssistantIntent:async()=>QUESTIONS_INTENT,get:async()=>[q],answer:async(_u:string,_id:string,v:string)=>{saved=v;},open:async()=>[q],countOpen:async()=>1,setShown:async()=>{}};
  eq(checkAnswer(q,value),{ok:true,value});await questionsTurn({message:value,userId:OWNER,threadId:'SYN-THREAD',now,store});eq(saved,value,'real turn keeps exact answer');
  const planned=run([f],own(f,saved!));eq(planned.ready[0]?.fields,[{name:f.name,label:f.label,value,factId:'SYN-ROW-ANSWER'}]);
 }
});

Deno.test('bound row answers: any job field schema or row identity change reopens the question',()=>{
 const f=field(),saved=own(f,'02/2028');
 for(const changed of [field({name:'workExperience-2--start'}),field({label:'Start date'}),field({type:'text'}),field({options:[{label:'February 2028',value:'feb'}]}),field({section:{...f.section!,row:2}}),field({section:{...f.section!,kind:'education'}}),field({section:{...f.section!,part:'end'}}),field({section:{...f.section!,anchor:'Different Synthetic Employer'}}),field({section:{...f.section!,format:'YYYY'}})])eq(run([changed],saved).ready.length,0,'changed binding');
 eq(run([f],saved,{},'workday:synthetic:different').ready.length,0,'another job cannot borrow a row answer');
});

Deno.test('bound row answers: broad wording and general date facts cannot answer repeating rows',()=>{
 const f=field();for(const saved of [{from:{value:'02/2028',factId:'SYN-WORDING'}},{'label:0123456789abcdef':{value:'02/2028',factId:'SYN-LABEL'}}] as Record<string,{value:string;factId:string}>[])eq(run([f],saved,{start_date:{value:'02/2028',factId:'SYN-START'}}).ready.length,0);
 for(const section of [undefined,{kind:'work',row:0,part:'start',anchor:'Synthetic Employer',format:'MM/YYYY'}]){
  const bad=field({section});eq(rowAnswerKey(bad,JOB),null);eq(run([bad],own(f,'02/2028')).ready.length,0,'missing/zero row cannot borrow bound answer');
 }
});

Deno.test('bound row answers: invalid exact row answers stay open and do not resurrect old history',()=>{
 const f=field(),history={work_history:{value:JSON.stringify([{employer:'Synthetic Employer',title:'Synthetic Analyst',start:'2020-01',end:'present'}]),factId:'SYN-HISTORY'}};
 for(const value of ['tomorrow','2028','2028-02-30','02/2028/guess']){eq(checkAnswer(question(f),value).ok,false,value);eq(run([f],own(f,value),history).ready.length,0,'invalid newer personal answer does not restore an older date');}
 eq(run([f],{},history).ready[0]?.fields[0]?.value,'01/2020','structured work history remains supported');
 eq(run([f],own(f,'02/2028'),history).ready[0]?.fields[0]?.value,'02/2028','exact personal answer takes precedence');
});

Deno.test('bound row answers: malformed or mismatched persisted binding is never treated as free text',()=>{
 const q=question(field());for(const changed of [{...q,type:'row:month:not-a-hash'},{...q,key:'job:0000000000000000'},{...q,type:'row:year:'+q.key.slice(4)+':junk'},{...q,type:'row:unbound'}])eq(checkAnswer(changed,'02/2028').ok,false);
});

Deno.test('bound row answers: exact choices and identical labels stay tied to their own fields',()=>{
 const a=field(),b=field({name:'workExperience-2--start',section:{...a.section!,row:2,anchor:'Second Synthetic Employer'}});
 const saved={...own(a,'02/2028'),...own(b,'03/2028')};const planned=run([a,b],saved);eq(planned.ready[0]?.fields.map(f=>f.value),['02/2028','03/2028']);
 const choice=field({name:'education-1--degree',type:'select',label:'Degree',options:[{label:'Bachelors',value:'bachelor'},{label:'Masters',value:'master'}],section:{kind:'education',row:1,part:'degree',anchor:'Synthetic School'}});
 eq(run([choice],own(choice,'Masters')).ready[0]?.fields[0]?.value,'master');eq(run([choice],own(choice,'Doctorate')).ready.length,0,'unmatched choice stays open');
});

Deno.test('bound row answers: repeated missing labels retain exact field identity for question production',()=>{
 const a=field(),b=field({name:'workExperience-2--start',section:{...a.section!,row:2,anchor:'Second Synthetic Employer'}});
 const missing=run([a,b],{});eq(missing.needs.map(n=>(n as any).field_name),[a.name,b.name],'each row is independently asked');
 const partial=run([a,b],own(a,'02/2028'));eq(partial.needs.map(n=>(n as any).field_name),[b.name],'ask the unresolved row rather than first equal label');
 const plain=run([{name:'plain-field',label:'Ordinary unknown question',type:'text',required:true,options:[]}],{});eq(Object.hasOwn(plain.needs[0],'field_name'),false,'ordinary needs shape unchanged');
});

Deno.test('bound row answers: binding refusal precedes choice and yes-no acceptance',()=>{
 const choice=field({name:'education-1--degree',type:'select',label:'Degree',options:[{label:'Bachelors',value:'bachelor'},{label:'Masters',value:'master'}],section:{kind:'education',row:1,part:'degree',anchor:'Synthetic School'}});
 const yesno=field({name:'workExperience-1--current',type:'checkbox',label:'Currently work here',section:{kind:'work',row:1,part:'current',anchor:'Synthetic Employer'}});
 for(const [f,answer]of[[choice,'Masters'],[yesno,'Yes']] as const){const q=question(f);eq(checkAnswer(q,answer).ok,true,'supported choice');for(const bad of [{...q,key:'job:0000000000000000'},{...q,type:'row:unbound'},{...q,type:q.type+':junk'}])eq(checkAnswer(bad,answer).ok,false,'no early choice/yes-no bypass');}
 const year=question(field({section:{kind:'work',row:1,part:'start',anchor:'Synthetic Employer',format:'YYYY'}}));eq(checkAnswer({...year,label:'From'},'2028').ok,true,'encoded year precision does not depend on a displayed hint');
});
