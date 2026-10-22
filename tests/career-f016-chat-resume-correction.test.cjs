'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const P = require('../packages/domain/122-career-profile.js');
const O = require('../packages/domain/130-career-onboarding.js');
const copy = x => JSON.parse(JSON.stringify(x));
const ROOT = path.resolve(__dirname, '..');
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', T='33333333-3333-4333-8333-333333333333';
const instruction="use the new one, old resume's wrong";
const resume = year => `Test Resume - Synthetic Student\nEducation\nSynthetic College - BS Computer Science, graduating in ${year}\nExperience\nSoftware Intern at Synthetic Company\n- Built a synthetic dashboard with SQL and Python for a fictional class project, documented the query design and tested every example with invented data.\nProjects\nSynthetic class planner\n- Implemented an invented course planning example for a test demonstration.\nSkills\nPython, SQL, JavaScript`;
function prepared(next = resume(2028)) {
  const p=P.createProfile({});
  P.ingestResume(p,resume(2027),{now:1});
  for (const f of p.facts) P.confirmFact(p,f.id);
  P.ingestResume(p,next,{now:2});
  return p;
}
function correction(p,text=instruction) { return O.handleChat(text,{profile:p,now:3}); }
function grad(p,year) { return p.facts.find(f=>f.kind==='education' && f.text.includes(String(year))); }

test('F016 real ingest drafts can resolve graduation without a manufactured labeled-conflict fact',()=>{
 const p=prepared();const r=correction(p);
 assert.equal(r.resultStatus,'completed');assert.equal(p.constraints.graduationDate,'2028');
 assert.match(r.reply,/2028/);assert.doesNotMatch(r.reply,/resume-new\.txt|rebuilt your/i);
 assert.equal(grad(p,2028).needs_confirmation,false);
 assert.ok(!P.confirmedFacts(p).some(f=>f.id===grad(p,2027).id),'superseded education must leave active facts');
 assert.equal(p.profile_corrections[0].instruction,instruction);
 assert.ok(p.profile_corrections[0].source_fact_ids.includes(grad(p,2028).id));
});
test('F016 correction changes no unrelated draft, skill, or experience',()=>{
 const p=prepared();const ids=p.facts.filter(f=>f.kind!=='education').map(f=>f.id);const before=p.facts.filter(f=>ids.includes(f.id)).map(copy);
 const r=correction(p);assert.equal(r.resultStatus,'completed');assert.deepEqual(p.facts.filter(f=>ids.includes(f.id)),before);
});
test('F016 correcting graduation invalidates dependent material instead of pretending it rebuilt',()=>{
 const p=prepared();p.fact_version=4;p.dependent_state={rebuilt:true};
 correction(p);assert.equal(p.fact_version,5);assert.equal(p.dependent_state.rebuilt,false);assert.equal(p.dependent_state.materials,'invalidated');
});
test('F016 ambiguous education years in the latest paste do not choose a winner',()=>{
 const p=prepared(resume(2028).replace('Experience\n','Another College - MS Statistics, graduating in 2030\nExperience\n'));const before=copy(p);
 const r=correction(p);assert.ok(['blocked','awaiting_user'].includes(r.resultStatus));assert.deepEqual(p,before);
});
test('F016 a later paste without a graduation year cannot revive an older resume candidate',()=>{
 const p=prepared();P.ingestResume(p,resume(2029).replace('graduating in 2029','degree in computer science'),{now:4});const before=copy(p);
 const r=correction(p);assert.ok(['blocked','awaiting_user'].includes(r.resultStatus));assert.deepEqual(p,before);
});
test('F016 a hypothetical correction instruction must not confirm pasted drafts',()=>{
 const p=prepared();const before=copy(p);correction(p,'Should I use the new one?');assert.deepEqual(p,before);
});
test('F016 correction retries are no-ops with no extra audit entry or version bump',()=>{
 const p=prepared();assert.equal(correction(p).resultStatus,'completed');const before=copy(p);
 assert.equal(correction(p).resultStatus,'completed');assert.deepEqual(p,before);
});
test('F016 a year in work history cannot become a graduation year',()=>{
 const p=prepared(resume(2028).replace('graduating in 2028','Computer Science degree'));const before=copy(p);
 correction(p);assert.deepEqual(p,before);
});
test('F016 a different confirmed education record is not superseded',()=>{
 const p=prepared();const other=P.addFact(p,{kind:'education',title:'Other College - Certificate, graduated in 2025',text:'Other College - Certificate, graduated in 2025'});const before=copy(other);
 assert.equal(correction(p).resultStatus,'completed');assert.deepEqual(other,before);
});
test('F016 correction cannot promote a quarantined latest resume fact',()=>{
 const p=prepared();grad(p,2028).quarantined=true;const before=copy(p);
 correction(p);assert.deepEqual(p,before);
});
test('F016 an uncertain graduation clause asks instead of selecting the first year',()=>{
 for(const clause of ['graduating in 2028 or 2030','not graduating in 2028','possibly graduating in 2028']){
  const p=prepared(resume(2028).replace('graduating in 2028',clause)),before=copy(p);
  correction(p);assert.deepEqual(p,before,clause);
 }
});
test('F016 source and confirmation evidence name actual ingested facts, never invented files or events',()=>{
 const p=prepared(), latest=p.profile_ingest_audit.length-1, fact=grad(p,2028);
 assert.equal(correction(p).resultStatus,'completed');
 assert.equal(p.profile_corrections[0].ingest_index,latest);
 assert.deepEqual(p.profile_corrections[0].source_fact_ids,[fact.id]);
 assert.equal(fact.resolution.source,'resume-ingest');assert.equal(fact.resolution.instruction,instruction);
 assert.equal(fact.confirmation_event_id,undefined);assert.equal(p.resume_sources.active,undefined);
});

if(!vm.SourceTextModule) {
 test('F016 actual staged endpoint journeys',()=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-name-pattern=^F016 staged',__filename],{encoding:'utf8',env});
  assert.equal(r.status,0,r.stdout+r.stderr);
 });
} else {
 async function world(saved) {
  let active=0;const owners=[A,B];
  const dbs=owners.map((owner,i)=>({options:{},account:{},messages:[],state:{career:{v:1,scope:{userId:owner},stores:{profile:P.createProfile({constraints:i?{graduationDate:'2031'}:{}})}}}}));
  if(saved)dbs[0].state=copy(saved);
  const client={auth:{getUser:async()=>({data:{user:{id:owners[active]}}})},
   rpc(name,args){if(['career_host_load','career_host_commit','agent_rl_bump'].includes(name)) return require('./helpers/career-persistence-fake.cjs')(dbs[active],owners[active],T,name,args);return Promise.resolve({data:null,error:null});},
   from(table){const filters={};const get=single=>Promise.resolve({data:table==='agent_threads'?{id:T,user_id:owners[active]}:single?null:[],error:null});
    const q={select(){return q;},eq(k,v){filters[k]=v;return q;},order(){return q;},limit(){return q;},range(){return q;},in(){return q;},is(){return q;},gte(){return q;},
     upsert(row){assert.equal(table,'profiles');assert.equal(row.id,owners[active]);return Promise.resolve({data:null,error:null});},insert(){return Promise.resolve({data:null,error:null});},
     maybeSingle(){return get(true);},single(){return get(true);},then(a,b){return get(false).then(a,b);}};return q;}
  };
  const app=await require('./helpers/career-staged-entry.cjs')(ROOT,client);let n=0;
  return {dbs,close:app.close,async ask(text,key,owner=0){active=owner;return app.request(T,text,key||'f016_'+(++n));}};
 }
 const profile=w=>w.dbs[0].state.career.stores.profile;
 async function pastes(w) {
  assert.equal((await w.ask(resume(2027))).body.meta.intent,'career_resume_ingest');
  assert.equal((await w.ask("yes, that's my resume")).body.meta.result_status,'completed');
  assert.equal((await w.ask(resume(2028))).body.meta.intent,'career_resume_ingest');
 }
 test('F016 staged pure-chat paste, correction, recall writes 2028 and leaves the other owner byte-identical',async()=>{
  const w=await world();try{const other=copy(w.dbs[1].state);await pastes(w);
   const r=await w.ask(instruction);assert.equal(r.status,200);assert.equal(r.body.meta.result_status,'completed');assert.equal(profile(w).constraints.graduationDate,'2028');
   assert.match((await w.ask("what's my graduation year?")).body.reply,/2028/);
   assert.match((await w.ask("what's my graduation year?",null,1)).body.reply,/2031/);assert.deepEqual(w.dbs[1].state.career.stores.profile,other.career.stores.profile);
  }finally{w.close();}
 });
 test('F016 staged failed commit cannot publish a correction or leak it to the next read',async()=>{
  const w=await world();try{await pastes(w);const before=copy(profile(w));w.dbs[0].options.failSave=true;
   assert.equal((await w.ask(instruction)).status,503);assert.deepEqual(profile(w),before);
   w.dbs[0].options.failSave=false;assert.doesNotMatch((await w.ask("what's my graduation year?")).body.reply,/2028/);
  }finally{w.close();}
 });
 test('F016 staged committed correction survives fresh process and receipt retry',async()=>{
  const w=await world();let next;try{await pastes(w);const r=await w.ask(instruction,'f016_fixed');assert.equal(r.body.meta.result_status,'completed');const before=copy(profile(w));
   assert.deepEqual(await w.ask(instruction,'f016_fixed'),r);assert.deepEqual(profile(w),before);
   next=await world(w.dbs[0].state);assert.match((await next.ask("what's my graduation year?")).body.reply,/2028/);assert.deepEqual(profile(next),before);
  }finally{next?.close();w.close();}
 });
 test('F016 staged later resume confirmation cannot reactivate superseded graduation',async()=>{
  const w=await world();try{await pastes(w);await w.ask(instruction);
   const old=grad(profile(w),2027);assert.equal(old.status,'superseded');
   await w.ask("yes, that's my resume");
   assert.equal(grad(profile(w),2027).status,'superseded');assert.equal(grad(profile(w),2027).needs_confirmation,true);
   assert.ok(!P.confirmedFacts(profile(w)).some(f=>f.id===old.id));
   assert.match((await w.ask("what's my graduation year?")).body.reply,/2028/);
  }finally{w.close();}
 });
}
