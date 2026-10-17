'use strict';
// Frozen independent-review race: both ordinary requests load before the first
// save; the duplicate obtains the finished native result, then waits to commit.
// Only RPC scheduling and controlled provider bytes are injected. Real local SQL
// retains owner locks, dialogue barriers, publication and exact-once accounting.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const F=require('./interview-entry-fixture.cjs')(),N=require('./native-controlled-provider.cjs');
const KEY='native-delayed-duplicate',TEXT='Help me explain my class calculator honestly.';
const latch=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release};};
function seed(){F.seed();F.sql(`insert into agent_flow_state(thread_id,user_id,state)values('${F.T}','${F.U}',${F.q({career:require('../helpers/career-model-fixture.cjs').initial(F.U)})}::jsonb)`);N.fund(F);}
for(const [label,message]of [['pause','STOP'],['correction','Actually, use Raleigh as the target city.'],['unchanged',null]])test('delayed native duplicate after '+label+' uses protected commit-time replay without any redispatch or extra charge',async t=>{
 seed();const firstReady=latch(),secondReady=latch(),firstGate=latch(),secondGate=latch(),client=F.client(),rpc=client.rpc.bind(client),p=N.provider();let commits=0;
 client.rpc=async(name,args)=>{
  if(name==='career_native_turn_commit_v1'&&args.p_base.p_key===KEY){
   commits++;assert.equal(args.p_base.p_response.meta.career_model.status,'generated');
   if(commits===1){firstReady.release();await firstGate.promise;}
   else if(commits===2){secondReady.release();await secondGate.promise;}
  }
  return await rpc(name,args);
 };
 const a=await require('../helpers/career-staged-entry.cjs')(path.resolve(__dirname,'../..'),client,{env:N.env,dependencies:{nativePair:{request:p.request,evidenceLabel:'CONTROLLED_NATIVE_RESPONSES'}}});t.after(()=>a.close());
 const body={thread_id:F.T,turn_key:KEY,message:TEXT},first=a.requestBody(body);await firstReady.promise;
 const duplicate=a.requestBody(body);await secondReady.promise;assert.equal(F.sql('select count(*)from agent_messages'),'0');assert.equal(p.calls.length,2);
 firstGate.release();const original=await first;assert.equal(original.status,200,JSON.stringify(original.body));
 let control=null;try{
  if(message){control=await a.requestBody({thread_id:F.T,turn_key:'intervening-'+label,message});assert.equal(control.status,200,JSON.stringify(control.body));assert.equal(p.calls.length,2);}
 }finally{secondGate.release();}
 const delayed=await duplicate,again=await a.requestBody(body);
 console.log(JSON.stringify({evidence:'DELAYED_DUPLICATE_COMMIT_REPLAY',label,original,control,delayed,again,paidCalls:0}));
 assert.equal(commits,2);assert.equal(p.calls.length,2);assert.equal(F.sql('select count(*)from agent_usage'),'2');assert.equal(F.sql('select current_micros from career_model_campaign_v1'),'22');assert.equal(F.sql('select sum(cost_micros)from career_model_reservations_v1'),'22');assert.equal(F.sql('select count(*)from agent_model_calls'),'2');
 if(message){assert.equal(delayed.status,409,JSON.stringify(delayed.body));assert.equal(delayed.body.error,'career_model_context_changed');assert.ok(!delayed.body.reply.includes('CONTROLLED native response'));assert.equal(again.status,409);assert.equal(F.sql('select count(*)from agent_messages'),'4');}
 else{assert.equal(delayed.status,200);assert.deepEqual(delayed.body,original.body);assert.deepEqual(again.body,original.body);assert.equal(F.sql('select count(*)from agent_messages'),'2');}
});
