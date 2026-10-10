const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadApp,readBlocks}=require('./agent100/harness/extract');
test('built app extraction loads the actual Guide, calculators and isolated controller preludes',()=>{
  const app=loadApp();
  assert.equal(app.call('typeof guideAnswer'),'function');
  assert.equal(app.call('typeof netWorthCalc'),'function');
  assert.equal(app.call('portfolioSummary([{value:10000,bucket:"Cash"},{value:5000,bucket:"Funds"}]).total'),15000);
  assert.equal(app.call('typeof UpmoreLedgerReview'),'function');
  assert.equal(app.call('typeof UpmoreBillWorkflow'),'function');
  assert.ok(app.guide('What is compound interest?').text.length>0);
  const second=loadApp();app.setLS('test-isolation','private');assert.equal(second.getLS('test-isolation'),null);
});
test('semantic extraction rejects missing or ambiguous app/data blocks without executing vendor scripts',()=>{
  const data='<script>const UPMORE_DATA = {};</script>',app='<script>function guideAnswer() { return {paras:[]}; }</script>',vendor='<script>throw Error("vendor must not run");</script>';
  assert.throws(()=>readBlocks(data+vendor),/unique.*app|app.*unique/);
  assert.throws(()=>readBlocks(data+app+app),/unique.*app|app.*unique/);
  assert.throws(()=>readBlocks(data+data+app),/unique.*data|data.*unique/);
  assert.throws(()=>readBlocks(app+vendor),/unique.*data|data.*unique/);
  const selected=readBlocks(vendor+app+data);assert.match(selected.appBlock,/guideAnswer/);assert.equal(selected.preludeBlocks.length,0);
  const prelude='<script>globalThis.UpmoreLedgerReview = function () {};</script>';
  assert.throws(()=>readBlocks(data+prelude+prelude+app),/unique UpmoreLedgerReview prelude/);
});
test('runner makes actual failures nonzero while explicitly deferred work stays unverified',()=>{
  const {runExitCode}=require('./agent100/harness/runner');
  assert.equal(runExitCode({agents:[{pass:false,steps:[]}]}),1);
  assert.equal(runExitCode({agents:[{pass:true,steps:[{ok:false}]}]}),1);
  assert.equal(runExitCode({agents:[{pass:true,steps:[{ok:true},{ok:false,skipped:'live-only'},{ok:false,deferred:true}]}]}),0);
});
test('an actually failing dry Guide assertion propagates to the run exit code with no API calls',async()=>{
  const {runAgent,runExitCode}=require('./agent100/harness/runner');
  const result=await runAgent({id:'synthetic-harness-failure',title:'Required failure',lane:'harness-regression',steps:[{kind:'guide',prompt:'what is compound interest',expect:[{t:'contains',re:'THIS_ASSERTION_MUST_FAIL_83d21'}]}]},{mode:'dry',judgeSample:0},{remaining:0});
  assert.equal(result.pass,false);assert.equal(result.steps[0].ok,false);assert.equal(result.apiCalls,0);assert.equal(runExitCode({agents:[result]}),1);
});
