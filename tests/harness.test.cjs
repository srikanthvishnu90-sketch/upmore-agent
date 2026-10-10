// Instinct spec doc 13: the harness itself. It runs green on the as-built system, a seeded regression fails and names its layer,
// and every planted mutation is caught by the layer it belongs to. A harness that cannot catch a planted bug is decoration.
// Check: node --test tests/harness.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const R=require(path.join(root,'evals/runner.cjs'));

test('the in-process layers run green on the as-built system and the naive baseline fails most scenarios',async()=>{
  const m=R.loadModules();
  const s=await R.scenarios(m);assert.deepEqual(s.scenarios.failures,[]);assert.equal(s.scenarios.passed,25);assert.equal(s.gold.passed,12);
  assert.ok(s.baseline_naive.passed<=5,`naive baseline passes ${s.baseline_naive.passed}/25; the suite must discriminate`);
  const b=R.benchmark(m,null);assert.ok(b.ok);assert.equal(b.upmore.plays.recall,1);assert.equal(b.upmore.plays.precision,1);assert.ok(b.upmore.subscription_inventory.precision>b.baseline.subscription_inventory.precision);
  const j=R.judged(m);assert.ok(j.ok,JSON.stringify(j.flagged_failures));
  const sf=await R.safety(m);assert.ok(sf.ok,JSON.stringify(sf.failures));
});

test('a seeded regression fails the run and names the failing layer',async()=>{
  const m=R.loadModules([{file:'43-agent-loop.js',find:'if (t === "T3") return { allowed: true, confirm: true };',replace:'if (t === "T3") return { allowed: true, confirm: false };'}]);
  const s=await R.scenarios(m);
  assert.equal(s.ok,false);assert.ok(s.scenarios.failures.some(f=>f.id==='S02'),'S02 names the T3 confirmation');
  const r=await R.run({patches:[{file:'47-data-guard.js',find:'return { instruction_like: findings.length > 0, findings };',replace:'return { instruction_like: false, findings: [] };'}],only:['safety','scenarios'],noWrite:true});
  assert.equal(r.layers.safety.ok,false);assert.ok(r.layers.safety.failures.injection.length>=90);
  assert.ok(r.layers.scenarios.scenarios.failures.some(f=>f.id==='S25'));
  assert.match(r.verdict,/diagnostic only/);
});

test('all eleven planted mutations are caught and attributed to the right layer',async()=>{
  const r=await R.mutations();
  const missed=r.mutations.filter(x=>!x.pass).map(x=>`${x.id} expected ${x.expected_layer}, caught by [${x.caught_by.join(',')}]`);
  assert.deepEqual(missed,[]);
  assert.equal(r.caught,11);
});

test('patches must match exactly once, so a stale mutation cannot silently test nothing',()=>{
  assert.throws(()=>R.loadModules([{file:'43-agent-loop.js',find:'this text is not in the file',replace:''}]),/matches 0 times/);
});
