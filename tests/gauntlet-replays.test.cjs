// Every live gauntlet failure becomes a permanent replay fixture (evals/gauntlet/record-replays.cjs). This checks the
// recorder: what it keeps, how it classifies, that a repeat is not duplicated, and that a triage goes stale when the same
// item fails for different reasons. The replays themselves run in tests/edge/live-replays.test.ts.
// Check: node --test tests/gauntlet-replays.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const R=require(path.join(root,'evals/gauntlet/record-replays.cjs'));
const live=JSON.parse(fs.readFileSync(path.join(root,'evals/gauntlet/results/go-live-92a8364-spec16.spec16.json'),'utf8'));

test('the first live run (go-live-92a8364) is recorded: 14 failures, each with the texts before it and the corpus checks',()=>{
  const f=R.failures(live);assert.equal(f.length,14);
  const six=f.find(x=>x.id==='S16-06');assert.deepEqual(six.context.slice(-2),['yes','send sam $40'],'the thread so far, NOT RUN items left out');
  assert.equal(R.classify(six.observed),'flow');assert.match(JSON.stringify(six.checks),/Got it/);
  assert.equal(R.classify(f.find(x=>x.id==='S16-01').observed),'planner_wording');
  assert.equal(f.filter(x=>R.classify(x.observed)==='provider_outage').length,8,'the eight silent 502s');
});

test('a repeat is counted, not duplicated; new reasons make a triage stale; the committed file matches the live run',()=>{
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'replays-')),'live.json');
  assert.equal(R.record(live,{file}).added,14);
  const db=JSON.parse(fs.readFileSync(file,'utf8'));db.fixtures.find(x=>x.id==='S16-10').triage={verdict:'precondition',note:'no brokerage connected for the test user'};fs.writeFileSync(file,JSON.stringify(db));
  const again=JSON.parse(JSON.stringify(live));again.label='rerun';again.rows.find(r=>r.id==='S16-10').reasons=['outcome ask, expected confirm'];
  const r=R.record(again,{file});assert.equal(r.added,0);assert.equal(r.seen,14);
  const s10=r.db.fixtures.find(x=>x.id==='S16-10');assert.equal(s10.times,2);assert.match(s10.triage.stale,/reasons changed on rerun/);
  assert.equal(r.db.fixtures.find(x=>x.id==='S16-03').triage,null);
  const committed=JSON.parse(fs.readFileSync(R.FILE,'utf8')).fixtures;
  for(const x of R.failures(live))assert.ok(committed.some(c=>c.id===x.id&&c.suite===x.suite),`${x.id} is in the committed replay file`);
});

test('every triage in the committed replay file is complete: a verdict, a written reason, and any test it names exists',()=>{
  for(const f of JSON.parse(fs.readFileSync(R.FILE,'utf8')).fixtures){
    if(!f.triage)continue;
    assert.ok(['fixed','precondition','not_built','grader'].includes(f.triage.verdict),f.id);
    assert.ok(String(f.triage.note||'').length>=20,`${f.id}: the reason is written down`);
    if(f.triage.test_ref)assert.ok(fs.existsSync(path.join(root,f.triage.test_ref.split(' ')[0])),`${f.id}: ${f.triage.test_ref} exists`);
    if(f.triage.verdict==='fixed')assert.ok(f.triage.test_ref,`${f.id}: a fixed verdict names its test`);
  }
});
