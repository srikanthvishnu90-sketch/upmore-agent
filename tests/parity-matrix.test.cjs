const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

test('the parity matrix is generated, current, and every competitor row has a registry id or a non-parity reason',()=>{
  execFileSync('python3',[path.join(root,'scripts/build-parity-matrix.py'),'--check']);
  const matrix=read('evals/parity/matrix.json');
  const registry=read('packages/capabilities/registry.json');
  const caps=new Map(registry.capabilities.map(c=>[c.id,c]));
  const catalog=read('docs/competition/features.json');
  const expected=catalog.features.filter(f=>f.record_type==='seed'||f.record_type==='discovery').length;
  assert.equal(matrix.rows.length,expected);
  assert.ok(matrix.rows.length>=241,'all 241 seeds are present');
  for(const r of matrix.rows){
    if(r.upmore){
      const c=caps.get(r.upmore.registry_id);assert.ok(c,`${r.catalog_id}: ${r.upmore.registry_id} exists`);
      assert.equal(r.upmore.status,c.status);assert.equal(r.upmore.delivered,['TESTED','VERIFIED'].includes(c.status));
      if(c.status==='GATED')assert.ok(r.upmore.gate_reason,`${r.catalog_id}: gated rows carry the reason`);
    } else {
      assert.ok(r.non_parity&&r.reason,`${r.catalog_id}: non-parity rows carry a reason`);
    }
  }
  const nonParity=matrix.rows.filter(r=>!r.upmore);
  assert.ok(nonParity.some(r=>/nfc|tap/i.test(r.reason)),'NFC tap-to-pay is an intentional non-parity cell');
  assert.ok(nonParity.some(r=>/check/i.test(r.reason)),'bank check capture is an intentional non-parity cell');
});

test('coverage is derived from registry status, never hand-edited, and delivered never exceeds parity rows',()=>{
  const matrix=read('evals/parity/matrix.json');
  const apps=Object.keys(matrix.coverage);assert.equal(apps.length,10);
  for(const a of apps){
    const c=matrix.coverage[a];const rows=matrix.rows.filter(r=>a in r.apps);
    assert.equal(c.rows,rows.length);assert.equal(c.parity_rows,rows.filter(r=>r.upmore).length);
    assert.equal(c.delivered,rows.filter(r=>r.upmore&&r.upmore.delivered).length);
    assert.equal(c.non_parity+c.parity_rows,c.rows);assert.equal(c.delivered+c.gated+c.claimed,c.parity_rows);
    assert.ok(c.delivered_pct<=100);
  }
  // Delivered counts only capabilities a test backs; nothing delivered is CLAIMED.
  assert.equal(matrix.rows.filter(r=>r.upmore&&r.upmore.delivered&&r.upmore.status==='CLAIMED').length,0);
});

// The generator reports mapping errors on stdout and exits 1.
const failOutput=()=>{try{execFileSync('python3',[path.join(root,'scripts/build-parity-matrix.py'),'--check'],{stdio:'pipe'});return 'did not fail';}catch(e){return String(e.stdout)+String(e.stderr);}};
test('the generator fails when a mapping names an unknown registry id or omits a reason',()=>{
  const mapPath=path.join(root,'evals/parity/registry-map.json');
  const original=fs.readFileSync(mapPath,'utf8');
  const broken=JSON.parse(original);const first=Object.keys(broken.rows)[0];
  try{
    broken.rows[first]={registry_id:'ZZZ-999',confidence:'high'};
    fs.writeFileSync(mapPath,JSON.stringify(broken));
    assert.match(failOutput(),/unknown registry id ZZZ-999/);
    broken.rows[first]={non_parity:'hardware-bound'};
    fs.writeFileSync(mapPath,JSON.stringify(broken));
    assert.match(failOutput(),/non_parity without a reason/);
  } finally { fs.writeFileSync(mapPath,original); }
  execFileSync('python3',[path.join(root,'scripts/build-parity-matrix.py'),'--check']);
});
