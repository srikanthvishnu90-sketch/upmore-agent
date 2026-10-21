// Independent original synthetic correction/next-search counterexamples. No provider, DB or network.
import { CareerProfile } from '../../../supabase/functions/_shared/router_core.career.js';
import { careerTools } from '../../../supabase/functions/_shared/agent/career_tools.ts';
const U='SYNTHETIC-SECOND-JUDGE',NOW=Date.UTC(2026,9,21,19);
function ok(v:unknown,why:string):asserts v{if(!v)throw Error(why)}
function eq(a:unknown,b:unknown,why:string){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(why+': '+JSON.stringify(a))}
const pool=[{job_id:'SYN-OLD',company:'Synthetic Old',title:'Data analyst',location:'Austin',url:'https://example.test/old',description:'Data analyst',first_seen_at:'2026-10-21T12:00:00Z'}, {job_id:'SYN-NEW',company:'Synthetic New',title:'UX designer',location:'Denver',url:'https://example.test/new',description:'UX designer',first_seen_at:'2026-10-20T12:00:00Z'}];
async function fixture(extra:Record<string,unknown>){
 const profile=CareerProfile.createProfile({preferences:{roles:['Data analyst','Product manager'],locations:['Austin','Boston'],remote:'hybrid',compFloor:'$80,000'},facts:[{id:'SYN-CORRECT',kind:'goal',text:'Data analyst role in Austin',status:'confirmed',needs_confirmation:false},{id:'SYN-OTHER-OLD',kind:'goal',text:'Also open to Data analyst roles in Austin',status:'confirmed',needs_confirmation:false},{id:'SYN-CURRENT',kind:'preference',text:'Also open to Product manager roles in Boston',status:'confirmed',needs_confirmation:false,source:'user'}]});
 Object.assign(profile.facts.find((f:any)=>f.id==='SYN-OTHER-OLD'),extra);
 const tools=careerTools({postings:async()=>pool}),ctx={userId:U,threadId:'SYN-CORRECTION',now:NOW,state:{profile},turn:{message:'Actually, my goal is UX designer role in Denver.',added:[] as string[]}};
 const result:any=await tools.find(t=>t.name==='correct_profile_fact')!.run({id:'SYN-CORRECT',text:'UX designer role in Denver'},ctx);
 eq([result.fact.text,result.fact.status],['UX designer role in Denver','draft'],'real correction must land');
 const persisted=JSON.parse(JSON.stringify(profile));
 const search:any=await tools.find(t=>t.name==='search_jobs')!.run({},{userId:U,threadId:'SYN-NEXT',now:NOW+1000,state:{profile:persisted},turn:{message:'Find jobs for my current goal.',added:[]}});
 console.log(JSON.stringify({extra,preferences:persisted.preferences,goal:search.goal,ranked:search.postings.map((p:any)=>({id:p.job_id,role_match:p.role_match}))}));
 return{profile:persisted,search};
}
for(const [label,extra] of [['rejected',{status:'rejected'}],['quarantined',{quarantined:true}],['explicitly agent-authored',{source:'agent'}]] as const){
 Deno.test(`second judge 0cb: ${label} old-role fact must not preserve superseded preference cache or next-search goal`,async()=>{
  const {profile,search}=await fixture(extra);
  ok(!profile.preferences.roles.includes('Data analyst'),'ineligible other fact preserved corrected-away role in cache');
  ok(!profile.preferences.locations.includes('Austin'),'ineligible other fact preserved corrected-away place in cache');
  ok(!search.goal.roles.includes('data')&&!search.goal.roles.includes('analyst')&&!search.goal.places.includes('austin'),'next search still uses corrected-away goal');
  eq([profile.preferences.roles,profile.preferences.locations],[['Product manager'],['Boston']],'independent current preferences must survive');
 });
}
Deno.test('second judge 0cb control: independently current owner-stated old-role preference survives another fact correction',async()=>{
 const {profile,search}=await fixture({source:'user'});
 ok(profile.preferences.roles.includes('Data analyst')&&profile.preferences.locations.includes('Austin'),'independent current old-role preference lost');
 ok(profile.preferences.roles.includes('Product manager')&&profile.preferences.locations.includes('Boston'),'other independent preference lost');
 ok(search.goal.roles.includes('data')&&search.goal.places.includes('austin'),'search lost independently current preference');
});
