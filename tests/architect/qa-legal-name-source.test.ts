// QA regression: a full name and a legal name are distinct confirmed assertions. Invented fixtures only.
import {trustedManifest,planForm,contractFill,batchPlan} from '../../extension/src/apply_core.ts';
const OWNER='SYN-LEGAL-QA',JOB='SYN-LEGAL-JOB';
const assert=(v:unknown,m:string)=>{if(!v)throw Error(m)};
const own=(factId:string,value:string)=>({factId,value,confirmed:true,user_id:OWNER,provenance:'owner stated exact synthetic answer',confirmation_event_id:'SYN-EVENT-'+factId});
function fixture(label='Legal name',answers:any={full_name:own('SYN-FULL','Test Public')},saved:any={},required=true){
 const schema=[{name:'identity',label,type:'input_text',required,options:[]}];
 const manifest=trustedManifest({owner:OWNER,file:{user_id:OWNER,answers,saved},rows:[],resume:null});
 const plan=planForm({userId:OWNER,jobId:JOB,company:'Synthetic',family:'greenhouse',schema,answers:manifest.answers,saved:manifest.saved,now:0});
 return{schema,manifest,plan,checked:contractFill({schema,plan,manifest,resume:null,jobId:JOB})};
}
for(const label of ['Legal name','Full legal name'])Deno.test('legal name: '+label+' is asked when only full name was stated',()=>{
 const r=fixture(label);assert(!r.plan.fill.length&&r.plan.needs.length===1&&!r.checked.fill.length,'full name silently supplied legal identity');
});
Deno.test('legal name: contract refuses a stale full-name plan after the question changes meaning',()=>{
 const r=fixture(),p={...r.plan,fill:[{name:'identity',label:'Legal name',value:'Test Public',factId:'SYN-FULL'}],needs:[]};
 const c=contractFill({schema:r.schema,plan:p,manifest:r.manifest,resume:null,jobId:JOB});assert(!c.fill.length&&c.asks.length===1,'contract accepted a full-name source for a legal name');
});
Deno.test('legal name: forged batch plan cannot borrow a full-name source',()=>{
 const r=fixture(),plan={...r.plan,fill:[{name:'identity',label:'Legal name',value:'Test Public',factId:'SYN-FULL'}],needs:[]};
 const b=batchPlan({jobId:JOB,company:'Synthetic',url:'https://synthetic.test/apply',family:'greenhouse',schema:r.schema,plan,challenge:false,resume:null,manifest:r.manifest});assert(!b.ok,'batch accepted an unsupported legal identity');
});
Deno.test('legal name control: an explicit legal-name source wins over a different full name',()=>{
 const r=fixture('Legal name',{full_name:own('SYN-FULL','Test Public'),legal_name:own('SYN-LEGAL','Test Legal')});assert(r.checked.fill[0]?.value==='Test Legal'&&!r.plan.needs.length,'explicit legal identity was lost or replaced');
});
Deno.test('legal name control: ordinary full name remains supported',()=>{
 const r=fixture('Full name');assert(r.checked.fill[0]?.value==='Test Public'&&!r.plan.needs.length,'ordinary full name stopped');
});
Deno.test('legal name control: the own answer to this exact legal-name question remains usable',()=>{
 const r=fixture('Legal name',{}, {'legal name':own('SYN-OWN-LEGAL-ANSWER','Test Legal')});assert(r.checked.fill[0]?.value==='Test Legal'&&!r.plan.needs.length,'own exact question answer stopped');
});
Deno.test('legal name: an unrelated saved full-name answer cannot back a forged legal-name plan',()=>{
 const r=fixture('Legal name',{}, {'full name':own('SYN-SAVED-FULL','Test Public')});
 const plan={...r.plan,fill:[{name:'identity',label:'Legal name',value:'Test Public',factId:'SYN-SAVED-FULL'}],needs:[]};
 const c=contractFill({schema:r.schema,plan,manifest:r.manifest,resume:null,jobId:JOB});assert(!c.fill.length&&c.asks.length===1,'saved answer changed its question scope');
});
Deno.test('legal name: optional legal identity remains blank without a dedicated source',()=>{
 const r=fixture('Legal name',undefined,{},false);assert(!r.plan.fill.length&&!r.plan.needs.length&&!r.checked.fill.length,'optional legal identity guessed from full name');
});
