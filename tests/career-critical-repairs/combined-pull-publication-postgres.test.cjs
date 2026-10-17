'use strict';
// REVIEW-ONLY: actual staged research queue and PostgreSQL, A publication recovery,
// B supervisor, controlled capture. No browser launch or public network request.
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../helpers/research-review.cjs'),db=F.database();
for(const workerId of [undefined,'00000000-0000-4000-8000-000000000099'])test('combined '+(workerId?'owned':'legacy')+' pull supervisor cannot stop before an actual central research result is published',async t=>{
 F.seed(db);const app=await F.app(db,t),queued=await app.request(F.T,'Read the public CSV guidance.','combined-research',{action:'research',eventId:'combined-research',url:F.URL1,question:'Read the public CSV guidance.'});assert.equal(queued.status,200,JSON.stringify(queued.body));
 const f=F.pgWorker(db,t,{finishFailsOnce:true,workerId}),runner=require('../../workers/career-browser/pull-runner.cjs').createPullRunner({worker:f.worker,store:f.store,maxTasks:1});
 try{
  runner.start();const row=F.state(db).intents.find(x=>x.intent_id===queued.body.task.intent_id),local=f.store.get(row.task_id),state=runner.stats();
  console.log(JSON.stringify({evidence:'COMBINED_REAL_SQL_PUBLICATION_SUPERVISOR',centralState:row.state,centralResultMissing:row.result==null,localStatus:local.status,localBlocker:local.blocker,publicationPending:local.publicationPending,supervisor:state,reads:f.reads(),finishes:f.finishes(),effects:F.state(db).effects.map(x=>({state:x.state,operation:x.operation})),paidCalls:0,actualBrowserEffects:0}));
  assert.equal(row.state,'claimed');assert.equal(row.result,null);assert.equal(local.publicationPending,true);assert.equal(f.reads(),1);
  assert.equal(state.stopped,false,'supervisor stopped with central SQL still claimed and result absent');
  runner.tick();assert.equal(F.state(db).intents.find(x=>x.intent_id===row.intent_id).state,'completed');assert.equal(f.reads(),1);assert.equal(runner.stats().evidenceReady,1);
 }finally{runner.stop();}
});
