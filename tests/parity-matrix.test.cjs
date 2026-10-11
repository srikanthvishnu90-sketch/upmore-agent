// Instinct spec doc 03: the parity matrix is generated from the registry, every app outcome has a registry id or a non-parity reason, and coverage never decreases.
// Check: node --test tests/parity-matrix.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const P=require(path.join(root,'evals/parity/build-matrix.cjs'));
const matrix=JSON.parse(fs.readFileSync(path.join(root,'evals/parity/matrix.json'),'utf8'));
const registry=JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8'));

test('the committed matrix and app checklists are current, every row is accounted for, and the check passes',()=>{
  const r=spawnSync('node',['evals/parity/build-matrix.cjs','--check'],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(matrix.rows.length,309);assert.equal(matrix.apps.length,10);assert.deepEqual(matrix.problems,[]);
  assert.equal(matrix.totals.accounted,309);assert.equal(matrix.totals.accounted_pct,100);
  for(const a of matrix.apps)assert.equal(matrix.per_app[a.id].accounted_pct,100,a.app);
  for(const f of fs.readdirSync(path.join(root,'evals/parity/apps')))assert.match(fs.readFileSync(path.join(root,'evals/parity/apps',f),'utf8'),/parity checklist/);
});

test('non-parity cells carry a reason, investment-platform features are excluded rather than padded, and the status column comes from the registry',()=>{
  const np=matrix.rows.filter(r=>r.upmore.kind==='non_parity');
  assert.equal(np.length,48);for(const r of np)assert.ok(r.upmore.reason.length>20,r.id);
  assert.ok(np.some(r=>r.upmore.non_parity==='investment-platform'&&/doc 09/.test(r.upmore.reason)));
  assert.ok(np.filter(r=>r.upmore.non_parity==='hardware-bound').some(r=>/NFC|secure element/.test(r.upmore.reason)),'tap to pay is honest about hardware');
  const byId=new Map(registry.capabilities.map(c=>[c.id,c]));
  for(const r of matrix.rows.filter(r=>r.upmore.kind==='mapped')){const c=byId.get(r.upmore.registry_id);assert.ok(c,r.id);assert.equal(r.upmore.status,c.status);assert.equal(r.upmore.performed,['TESTED','VERIFIED'].includes(c.status));if(c.status==='GATED')assert.ok(r.upmore.gate_reason,`${r.id}: gated without a reason`);}
  assert.ok(matrix.totals.performed_pct<matrix.totals.accounted_pct,'performed is the parity bar and is honestly below accounted');
  assert.ok(matrix.rows.some(r=>r.upmore.performed));
});

test('the generator refuses a row with neither a registry id nor a reason, and the ratchet refuses a coverage decrease',()=>{
  const m=P.build();assert.deepEqual(m.problems,[]);
  const lower={per_app:Object.fromEntries(Object.entries(m.per_app).map(([k,v])=>[k,{accounted_pct:v.accounted_pct,performed_pct:v.performed_pct+5}])),totals:{accounted_pct:m.totals.accounted_pct,performed_pct:m.totals.performed_pct+5}};
  const tmp=path.join(root,'evals/parity/coverage-ratchet.json');const saved=fs.readFileSync(tmp,'utf8');
  try{fs.writeFileSync(tmp,JSON.stringify(lower));const r=P.ratchetCheck(m);assert.equal(r.ok,false);assert.ok(r.decreased.length>=10);}finally{fs.writeFileSync(tmp,saved);}
  const mapPath=path.join(root,'evals/parity/registry-map.json');const original=fs.readFileSync(mapPath,'utf8');
  try{const j=JSON.parse(original);j.rows['CA-001']={confidence:'high'};fs.writeFileSync(mapPath,JSON.stringify(j));delete require.cache[require.resolve(path.join(root,'evals/parity/build-matrix.cjs'))];const P2=require(path.join(root,'evals/parity/build-matrix.cjs'));const bad=P2.build();assert.ok(bad.problems.some(p=>/CA-001: mapped with neither/.test(p)));}
  finally{fs.writeFileSync(mapPath,original);delete require.cache[require.resolve(path.join(root,'evals/parity/build-matrix.cjs'))];}
});
