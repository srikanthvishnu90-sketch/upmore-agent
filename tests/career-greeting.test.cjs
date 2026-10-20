'use strict';
// Case 2 / BL-667: actual host + staged HTTP entry, synthetic owners only.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),D=n=>require(path.join(root,'packages/domain',n));
const {CareerHost}=require('../supabase/functions/_shared/career_host.js');
const F=require('./helpers/correction-privacy-fixture.cjs');
const host=CareerHost.createCareerHost({CareerAccess:D('120-career-access.js'),CareerOnboarding:D('130-career-onboarding.js'),CareerRouter:D('142-career-router.js'),CareerDoorstep:D('141-career-doorstep.js'),CareerReply:D('140-career-reply.js'),CareerContainment:D('143-career-containment.js')});
const options=extra=>({userId:F.OWNERS[0],threadId:F.THREADS[0],now:Date.parse('2026-10-20T21:00:00Z'),accountPersistence:true,...extra});
const greetings=['/start','hi','hello','hey','Hi!','Hello Trainee.','good morning','good afternoon','good evening','What can you do for me?'];
for(const text of greetings)test(`greeting has an explicit intent and useful orientation: ${text}`,()=>{
 const ctx=host.createTurnCtx(options()),out=host.runTurn(text,ctx);
 assert.equal(out.intent,'career_greeting');assert.equal(out.contained,false);assert.equal(out.resultStatus,'completed');
 assert.match(out.reply,/Trainee/);assert.match(out.reply,/find|openings/i);assert.match(out.reply,/resume/i);assert.match(out.reply,/interview/i);assert.match(out.reply,/\?/);
 assert.equal(out.action,null);assert.equal(ctx._hostPatch,undefined);assert.deepEqual(host.extractSnapshot(ctx).stores,{});
 assert.equal(host.isHostControlled(text,ctx),true,'both brains must use this code path');
});
test('repeated greetings preserve pending onboarding, unconfirmed facts and conflicting thread/account facts',()=>{
 const p=F.profile();p._onboarding_pending='roles';
 const snapshot=F.snapshot(F.OWNERS[0],p);snapshot.stores.statedFacts={facts:[{kind:'target_firm',value:'Synthetic Thread Firm'}]};
 snapshot.stores.batchApplyState={status:'awaiting_approval',runId:'SYNTHETIC-PENDING'};
 const account={stated_facts:{facts:[{kind:'target_firm',value:'Synthetic Account Firm'}]}};
 const before=F.copy(snapshot),accountBefore=F.copy(account);
 for(const text of ['/start','hello','What can you do for me?']){
  const ctx=host.createTurnCtx(options({snapshot,account}));ctx.interviewAnswer=true;
  const profileBefore=F.copy(ctx.profile),out=host.runTurn(text,ctx);
  assert.equal(out.intent,'career_greeting');assert.deepEqual(ctx.profile,profileBefore);
  assert.deepEqual(host.extractSnapshot(ctx),before);assert.equal(ctx._hostPatch,undefined);
 }
 assert.deepEqual(snapshot,before);assert.deepEqual(account,accountBefore);
});
test('account pause remains authoritative for greetings',()=>{
 const ctx=host.createTurnCtx(options({account:{paused:true}}));
 assert.equal(host.runTurn('/start',ctx).intent,'career_paused');assert.equal(ctx._hostPatch,undefined);
});
test('a later substantive turn on a reused context retains its normal write path',()=>{
 const ctx=host.createTurnCtx(options({snapshot:F.snapshot(F.OWNERS[0])}));
 host.runTurn('/start',ctx);
 const out=host.runTurn(F.CORRECT,ctx);assert.equal(out.intent,'profile_correction');
 assert.equal(host.extractSnapshot(ctx).stores.profile.constraints.graduationDate,'2028');
});
const substantive=['/start a-link-token','/start@AnotherBot','start applying','hi, apply to three jobs','hello, forget my career profile','What can you do for my resume?','What can you do for me? Apply to three jobs.','yes','use the new one, old resume\'s wrong','What firm did I say I am targeting?','asdf qwer zzz blorp'];
for(const text of substantive)test(`greeting gate leaves substantive or unsupported input to its existing owner: ${text}`,()=>{
 const ctx=host.createTurnCtx(options());assert.equal(host.isHostControlled(text,ctx),false);
 assert.notEqual(host.runTurn(text,ctx).intent,'career_greeting');
});
test('greeting prefix does not swallow an internship search',()=>{
 const out=host.runTurn('Hi! Find me internships I can apply to this week.',host.createTurnCtx(options()));
 assert.equal(out.intent,'career_internship_discovery');assert.deepEqual(out.result.shortlist,[]);
});
if(!vm.SourceTextModule){test('staged greeting privacy and zero-model checks',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const run=spawnSync(process.execPath,['--experimental-vm-modules','--test',__filename],{encoding:'utf8',env});
 assert.equal(run.status,0,run.stdout+run.stderr);
});}else for(const brain of ['router','agent'])test(`staged /start is read-only and makes no model/provider call with ${brain} selected`,async()=>{
 const snapshot=F.snapshot(F.OWNERS[0]);snapshot.stores.statedFacts={facts:[{kind:'target_firm',value:'Synthetic Thread Firm'}]};
 const db={state:{career:F.copy(snapshot)},account:{stated_facts:{facts:[{kind:'target_firm',value:'Synthetic Account Firm'}]}},messages:[]};
 const before=F.copy(snapshot),patches=[];
 const client={auth:{getUser:async()=>({data:{user:{id:F.OWNERS[0]}}})},rpc(name,args){
  if(name==='career_host_commit')patches.push(F.copy(args.p_patch));
  return require('./helpers/career-persistence-fake.cjs')(db,F.OWNERS[0],F.THREADS[0],name,args);
 },from(table){const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},async upsert(){assert.equal(table,'profiles');return {error:null};},async maybeSingle(){assert.equal(table,'agent_threads');return {data:{id:filters.id,user_id:F.OWNERS[0]},error:null};}};return q;}};
 const app=await require('./helpers/career-staged-entry.cjs')(root,client,{env:{CAREER_BRAIN:brain},forbidModelCalls:true});
 try{
  const first=await app.request(F.THREADS[0],'/start','hello-1');assert.equal(first.status,200);assert.equal(first.body.meta.intent,'career_greeting');
  assert.deepEqual(await app.request(F.THREADS[0],'/start','hello-1'),first,'exact replay');
  const second=await app.request(F.THREADS[0],'hello','hello-2');assert.equal(second.status,200);assert.equal(second.body.meta.intent,'career_greeting');
  assert.deepEqual(db.state.career.stores,before.stores);assert.deepEqual(patches,[{},{}]);assert.equal(db.messages.length,4);
 }finally{app.close();}
});
