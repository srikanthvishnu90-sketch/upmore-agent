// Instinct spec doc 15: the missing 100+ enter the registry as CLAIMED backlog items with owner docs, one-way generated from the doc.
// Check: node --test tests/backlog.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8'));
const backlog=JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/backlog.json'),'utf8'));
const ids=new Set(registry.capabilities.map(c=>c.id));

test('the backlog is current with doc 15 and the registry carries it',()=>{
  const r=spawnSync('python3',['scripts/build-backlog.py','--check'],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
  const b=spawnSync('python3',['scripts/build-capability-registry.py','--check'],{cwd:root,encoding:'utf8'});
  assert.equal(b.status,0,b.stdout+b.stderr);
  assert.equal(registry.backlog.count,112);assert.equal(registry.backlog.items.length,112);
});

test('all 112 items are CLAIMED with an owner doc and a group, ids are unique, and every cited capability exists',()=>{
  const items=backlog.items;assert.equal(items.length,112);
  const seen=new Set();
  for(const b of items){
    assert.match(b.id,/^B15-\d{3}$/);assert.ok(!seen.has(b.id));seen.add(b.id);
    assert.equal(b.status,'CLAIMED');assert.match(b.owner_doc,/^(0[1-9]|1[0-5])$/,b.id);assert.ok(b.group&&b.name.length>8,b.id);
    if(b.attached_to)assert.ok(ids.has(b.attached_to),`${b.id} cites ${b.attached_to}`);
    for(const x of b.related)assert.ok(ids.has(x),`${b.id} cites ${x}`);
    assert.ok(!/\(doc|\(T[0-5]/.test(b.name),`${b.id} name keeps no reference text: ${b.name}`);
  }
  assert.equal(items.filter(b=>b.attached_to).length,81);
  assert.equal(new Set(items.map(b=>b.group)).size,15);
  assert.equal(items.find(b=>b.id==='B15-076').name,'Kill switch: one word pauses all agent actions','the doc\'s garbled item marker is read correctly');
  assert.equal(items.find(b=>b.id==='B15-030').name,'529 plan state tax benefit comparison','an item number running into a name is split correctly');
  assert.equal(items.find(b=>b.id==='B15-023').refs,'TAX-007','an item with parentheses in its text keeps the last parenthetical as its reference');
});

test('the CLI lists the backlog and reports it in --status without counting it as capabilities',()=>{
  const s=spawnSync('node',['scripts/capabilities','--status'],{cwd:root,encoding:'utf8'});
  assert.equal(s.status,0);assert.match(s.stdout,/^all\s+296\b/m);assert.match(s.stdout,/backlog \(doc 15\): 112 items, all CLAIMED; 81 deepen an existing capability, 31 are new surface/);
  const l=spawnSync('node',['scripts/capabilities','--backlog','Vehicle'],{cwd:root,encoding:'utf8'});
  assert.equal(l.stdout.trim().split('\n').length,5);assert.match(l.stdout,/Lease vs buy math/);
});
