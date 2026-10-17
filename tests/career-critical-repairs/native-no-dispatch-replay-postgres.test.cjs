'use strict';
// No-dispatch native responses have no execution. Their ordinary free replay
// must not be routed into execution-accounting reconciliation.
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./interview-entry-fixture.cjs')(),N=require('./native-controlled-provider.cjs');
for(const [label,env]of [['missing server key',{OPENAI_API_KEY:undefined}],['missing approved policy',{CAREER_NATIVE_PAIR_POLICY_DIGEST:undefined}]])test(label+' preserves free exact raw replay without a native execution',async t=>{
 F.seed();F.sql(`insert into agent_flow_state(thread_id,user_id,state)values('${F.T}','${F.U}',${F.q({career:require('../helpers/career-model-fixture.cjs').initial(F.U)})}::jsonb)`);
 const p=N.provider(),a=await F.app(t,{env:{...N.env,...env},dependencies:{nativePair:{request:p.request,evidenceLabel:'CONTROLLED_NATIVE_RESPONSES'}}}),body={thread_id:F.T,turn_key:'native-no-dispatch',message:'Help me describe my class calculator honestly.'};
 const first=await a.requestBody(body),retry=await a.requestBody(body);
 console.log(JSON.stringify({evidence:'NO_DISPATCH_NATIVE_REPLAY',label,first,retry,paidCalls:0}));
 assert.equal(first.status,200);assert.equal(first.body.meta.career_model.status,'not_configured');assert.equal(first.body.meta.career_model.operation_id,undefined);assert.equal(p.calls.length,0);
 assert.equal(F.sql("select count(*)from career_watch_kv where key like 'career:native-execution:%'"),'0');assert.equal(F.sql('select count(*)from career_model_pairs_v2'),'0');assert.equal(F.sql('select count(*)from agent_usage'),'0');assert.equal(F.sql('select count(*)from agent_messages'),'2');
 assert.equal(retry.status,200,JSON.stringify(retry.body));assert.deepEqual(retry.body,first.body);
});
