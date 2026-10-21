// QA fail-first gate, invented local writer events only. Pending source-owner fixes; no product edits.
import { careerTools } from '../../../supabase/functions/_shared/agent/career_tools.ts';
import { trustedManifest, planForm, contractFill } from '../../../extension/src/apply_core.ts';
const OWNER='SYN-QA-TYPED',assert=(v:unknown,m:string)=>{if(!v)throw Error(m)};
async function profile(seed:any){
 const state:any=seed?{profile:seed}:{},events:any[]=[];
 const tools=careerTools({postings:async()=>[],events:{add:async(e:any)=>{events.push(e)}}}as any);
 for(const text of ['My full name is Test Person.','My email is test.person@example.invalid.']){
  const c:any={userId:OWNER,threadId:'SYN-T',now:0,state,turn:{message:text,added:[]}};
  const r:any=await tools.find(t=>t.name==='add_profile_fact')!.run({kind:'other',text},c);
  c.turn={message:"yes that's right",added:[]};await tools.find(t=>t.name==='confirm_profile_fact')!.run({id:r.fact.id},c);
 }
 return{profile:state.profile,events};
}
function planned(profile:any,labels:string[]){
 const schema=labels.map((label,i)=>({name:'q'+i,label,type:'input_text',required:true,options:[]}));
 const manifest=trustedManifest({owner:OWNER,file:profile,rows:[],resume:null});
 const plan=planForm({userId:OWNER,jobId:'SYN-JOB',company:'Synthetic',family:'greenhouse',schema,answers:manifest.answers,saved:manifest.saved,now:0});
 return{manifest,plan,checked:contractFill({schema,plan,manifest,resume:null})};
}
Deno.test('typed writer owner gate: a fresh authenticated writer creates usable owned data with actual confirmation events',async()=>{
 const r=await profile(null);assert(r.events.filter(e=>e.kind==='fact_confirmed').length===2,'actual writer events missing');
 assert(r.profile.user_id===OWNER,'fresh authenticated profile lacks its explicit owner');
 const p=planned(r.profile,['Full name','Email']);assert(p.checked.fill.length===2&&p.plan.needs.length===0,'confirmed own identity was reasked');
});
Deno.test('typed legal-name gate: full name alone cannot answer a distinct required legal-name question',async()=>{
 const r=await profile({user_id:OWNER,facts:[]}),p=planned(r.profile,['Legal name']);
 assert(!p.checked.fill.length&&p.plan.needs.length===1,'a full-name statement was treated as a legal-name assertion');
});
Deno.test('typed identity control: explicit owned full name and email retain their actual source events',async()=>{
 const r=await profile({user_id:OWNER,facts:[]}),p=planned(r.profile,['Full name','Email']);
 assert(p.checked.fill.length===2&&p.plan.needs.length===0,'ordinary explicit identity stopped');
 for(const f of p.checked.fill)assert(r.events.some(e=>e.kind==='fact_confirmed'&&e.detail.id===f.factId&&e.detail.confirmation_event_id===p.manifest.byFactId[f.factId].event),'source event changed');
});
Deno.test('typed identity control: full name is not guessed into first or last names',async()=>{
 const r=await profile({user_id:OWNER,facts:[]}),p=planned(r.profile,['First name','Last name']);assert(!p.checked.fill.length&&p.plan.needs.length===2,'whole name was split');
});
Deno.test('typed identity control: another profile owner is never replaced by projection',async()=>{
 const r=await profile({user_id:OWNER,facts:[]});r.profile.user_id='SYN-OTHER';const p=planned(r.profile,['Full name','Email']);
 assert(!p.checked.fill.length&&p.plan.needs.length===2&&r.profile.user_id==='SYN-OTHER','foreign profile authorized answers');
});
