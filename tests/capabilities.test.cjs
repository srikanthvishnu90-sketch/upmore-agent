const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
const registry=JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8'));
const overlay=JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/status-overlay.json'),'utf8'));
const exists=rel=>fs.existsSync(path.join(root,rel));
const entry=o=>Object.assign({id:'ZZZ-001',name:'x',domain:'x',domain_code:'ZZZ',owner_doc:'01',tier:'T0',status:'CLAIMED'},o);
const errorsOf=(...caps)=>Registry.validate({capabilities:caps},()=>false);

test('generated registry is current, valid, and holds every spec doc 02 id',()=>{
  execFileSync('python3',[path.join(root,'scripts/build-capability-registry.py'),'--check']);
  assert.deepEqual(Registry.validate(registry,exists),[]);
  const reg=Registry.load(registry,exists);
  assert.equal(reg.size,296);
  const byDomain=reg.summary();
  assert.equal(Object.values(byDomain).reduce((n,d)=>n+d.total,0),296);
  assert.equal(byDomain.ACCT.total,18);assert.equal(byDomain.CORE.total,16);
  assert.ok(registry.corrections.some(c=>/TXN-012/.test(c)),'CSV export renumbered to TXN-012');
  assert.ok(registry.corrections.some(c=>/316.*296/.test(c)),'spec total corrected');
  assert.equal(reg.get('TXN-012').name,'CSV export');assert.equal(reg.get('TXN-002').name,'search by merchant, amount, date, note');
});

test('status is honest by default: only overlay entries with existing tests rise above CLAIMED or spec GATED',()=>{
  const reg=Registry.load(registry,exists);
  const raised=reg.list(c=>!['CLAIMED','GATED'].includes(c.status));
  assert.deepEqual(raised.map(c=>c.id).sort(),Object.keys(overlay).filter(id=>overlay[id].status!=='GATED').sort());
  for(const c of raised){assert.ok(c.test_ref&&exists(c.test_ref),c.id);assert.ok(c.implementation.length,c.id);for(const f of c.implementation)assert.ok(exists(f),f);}
  assert.equal(reg.list(c=>c.status==='VERIFIED').length,0,'nothing has run against a live account yet');
  const gated=reg.list(c=>c.status==='GATED');
  assert.ok(gated.length>=15);for(const c of gated)assert.ok(c.gate_reason,c.id);
  assert.equal(reg.get('PAY-012').status,'GATED');assert.equal(reg.get('ACCT-009').status,'CLAIMED','refresh on demand needs a connector call: still claimed');
});

test('validation rejects malformed, duplicate, unproven and unexplained entries',()=>{
  assert.match(errorsOf(entry({id:'bad'})).join(),/malformed id/);
  assert.match(errorsOf(entry({}),entry({})).join(),/duplicate id/);
  assert.match(errorsOf(entry({tier:'T9'})).join(),/invalid tier/);
  assert.match(errorsOf(entry({status:'DONE'})).join(),/invalid status/);
  assert.match(errorsOf(entry({status:'TESTED'})).join(),/TESTED without a test_ref/);
  assert.match(errorsOf(entry({status:'TESTED',test_ref:'tests/missing.cjs'})).join(),/does not exist/);
  assert.match(errorsOf(entry({status:'VERIFIED',test_ref:'t'})).join(),/VERIFIED without an existing evidence_ref/);
  assert.match(errorsOf(entry({status:'GATED'})).join(),/GATED without a gate_reason/);
  assert.match(errorsOf(entry({status:'BUILT'})).join(),/BUILT without implementation/);
  assert.deepEqual(errorsOf(entry({})),[]);
  assert.throws(()=>Registry.load({capabilities:[entry({tier:'T9'})]}),/invalid/);
  assert.deepEqual(Registry.validate({},()=>true),['registry has no capabilities array']);
});

test('answers about capabilities come from recorded status, and unknown ids are never claimed',()=>{
  const reg=Registry.load(registry,exists);
  assert.match(reg.answer('BILL-003').text,/passes its acceptance test locally; it has not run against a live account/);
  assert.match(reg.answer('BILL-003').text,/verified:false/);
  assert.match(reg.answer('PAY-012').text,/blocked until a licensed partner/);
  assert.match(reg.answer('ACCT-009').text,/planned but not built yet/);assert.match(reg.answer('ACCT-001').text,/passes its acceptance test locally; it has not run against a live account/);
  assert.equal(reg.answer('XYZ-999').known,false);assert.match(reg.answer('XYZ-999').text,/does not claim it/);
  assert.equal(reg.answer('TXN-009').tier,'T1');
});

test('the CLI validates, summarizes and answers',()=>{
  const cli=(...a)=>execFileSync('node',[path.join(root,'scripts/capabilities'),...a],{encoding:'utf8'});
  assert.match(cli('--check'),/valid: 296 capabilities/);
  assert.match(cli('--status'),/^all\s+296/m);
  assert.match(cli('--ask','CORE-002'),/passes its acceptance test/);
  assert.match(cli('--domain','bill'),/BILL-003\s+TESTED/);
});
