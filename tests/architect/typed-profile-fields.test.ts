// Synthetic source-bound raw -> canonical application field checks; no model, network, bank or browser.
import { typedProfileFile } from '../../supabase/functions/_shared/typed_profile_fields.ts';
import { planForm, contractFill, trustedManifest } from '../../extension/src/apply_core.ts';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), Profile=require('../../packages/domain/122-career-profile.js');
const OWNER='SYN-TYPED-OWNER';
const assert=(v:unknown,m:string)=>{if(!v)throw Error(m);};
const eq=(a:unknown,b:unknown,m:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m+': '+JSON.stringify(a));};
const fact=(id:string,text:string,extra:Record<string,unknown>={})=>({id,kind:'other',text,user_id:OWNER,source:'user',status:'confirmed',needs_confirmation:false,provenance:'owner stated the exact clause in chat',confirmation_event_id:'SYN-EVENT-'+id,...extra});
const typedProfileFields=(o: {owner:string;profile:any})=>{
 const {file,needs}=typedProfileFile(o),manifest=trustedManifest({owner:o.owner,file,rows:[],resume:null});
 for(const x of manifest.excluded){delete file.answers[x.key as keyof typeof file.answers];needs.push({factId:x.factId,reason:x.why});}
 const profileFields=Object.fromEntries(['country','phone'].filter(k=>manifest.answers[k]).map(k=>[k,manifest.answers[k].value]));
 return {file,needs,manifest,profileFields};
};
const project=(facts:any[],extra:Record<string,unknown>={})=>typedProfileFields({owner:OWNER,profile:{user_id:OWNER,facts,...extra}});
Deno.test('typed fields: actual confirmed country, authorization and phone clauses become canonical fields',()=>{
 const r=project([fact('SYN-C','My country is United States.'),fact('SYN-W','I am authorized to work in the US.'),fact('SYN-P','My phone is +1 202 555 0147.')]);
 eq(Object.fromEntries(Object.entries(r.manifest.answers).map(([k,v])=>[k,v.value])),{country:'United States',work_authorization:'Yes',phone:'+1 202 555 0147'},'typed values');
 for(const [k,a] of Object.entries(r.file.answers)){assert(a.confirmation_event_id==='SYN-EVENT-'+a.factId,k+' event was invented');assert(a.provenance==='owner stated the exact clause in chat',k+' source was changed');}
 eq(r.profileFields,{country:'United States',phone:'+1 202 555 0147'},'portal flat profile fields');
});
Deno.test('typed fields: explicit typed eligibility/profile kinds survive domain normalization',()=>{
 const p=Profile.createProfile({user_id:OWNER,facts:[fact('SYN-W','Authorized to work in US',{kind:'eligibility',name:'Work authorization',value:'Yes',country:'United States'}),fact('SYN-C','United States',{kind:'profile',name:'Country',value:'United States'})]});
 eq(p.facts.map((f:any)=>f.kind),['eligibility','profile'],'normalizer erased semantic kinds');
 eq(p.user_id,OWNER,'normalizer lost explicit owner');
 const r=typedProfileFields({owner:OWNER,profile:p});
 eq(r.manifest.answers.work_authorization?.value,'Yes','structured source lost');
});
Deno.test('typed fields: draft, unknown, missing event, inferred, quarantined and cross-owner facts stay questions',()=>{
 for(const change of [{status:'draft',needs_confirmation:true},{status:undefined},{confirmation_event_id:undefined},{source:'agent'},{provenance:'inferred by agent'},{quarantined:true},{user_id:'SYN-OTHER'},{id:'F-033'}]){
  const r=project([fact('SYN-P','My phone is +1 202 555 0147.',change)]);
  assert(!r.manifest.answers.phone,'ineligible row became usable: '+JSON.stringify(change));assert(r.needs.length>0,'ineligible row lacks a reason');
 }
 const r=typedProfileFields({owner:OWNER,profile:{user_id:'SYN-OTHER',facts:[fact('SYN-C','My country is United States.')]}});
 assert(!r.manifest.answers.country,'owner context was replaced');
});
Deno.test('typed fields: unsupported or ambiguous source words are asked without guesses',()=>{
 for(const text of ['I may be authorized to work in the US.','I am authorized to work.','My country is United States or Canada.','My phone is unknown.','My country is not United States.']){
  const r=project([fact('SYN-X',text)]);eq(Object.keys(r.manifest.answers),[],'guessed from '+text);assert(r.needs.length>0,'missing question for '+text);
 }
 const r=project([fact('SYN-C1','My country is United States.'),fact('SYN-C2','My country is Canada.')]);
 assert(!r.manifest.answers.country&&r.needs.length>0,'conflict silently picked one country');
});
Deno.test('typed fields: authorization respects country context and actual planner still asks for a UK question',()=>{
 const r=project([fact('SYN-W','I am authorized to work in the US.')]);
 const schema=(country:string)=>[{name:'auth',label:'Are you legally authorized to work in '+country+'?',type:'multi_value_single_select',required:true,options:[{label:'Yes',value:'Y'},{label:'No',value:'N'}]}];
 const plan=(country:string,location:string)=>planForm({userId:OWNER,jobId:'SYN-JOB',company:'Synthetic Employer',family:'greenhouse',schema:schema(country),answers:r.manifest.answers,saved:{},now:0,location});
 eq(plan('United States','New York, NY').fill[0]?.value,'Y','US statement not reusable in matching question');
 eq(plan('United Kingdom','London, UK').fill,[],'US authorization migrated to the UK');
 const uk=project([fact('SYN-UK','I am authorized to work in the UK.')]);assert(!uk.manifest.answers.work_authorization&&uk.needs.length>0,'foreign authorization became global US yes');
});
Deno.test('typed fields: projected values pass actual canonical contract without changing raw fact bank',()=>{
 const facts=[fact('SYN-P','My phone is +1 202 555 0147.')],before=JSON.stringify(facts);
 const r=project(facts),schema=[{name:'phone',label:'Phone',type:'input_text',required:true,options:[]}];
 const plan=planForm({userId:OWNER,jobId:'SYN-JOB',company:'Synthetic Employer',family:'greenhouse',schema,answers:r.manifest.answers,saved:{},now:0});
 const checked=contractFill({schema,plan,manifest:r.manifest,resume:null});
 eq(checked.fill[0]?.value,'+1 202 555 0147','existing contract rejected source-bound extraction');eq(checked.asks,[],'valid field asked again');eq(JSON.stringify(facts),before,'projection mutated facts');
});
Deno.test('typed fields: basics alone never authorize a contact answer',()=>{
 const r=project([],{basics:{phone:'+1 202 555 0147',location:'New York'}});eq(r.manifest.answers,{},'unconfirmed basics promoted');
});
