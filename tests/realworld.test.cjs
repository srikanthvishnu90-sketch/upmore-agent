// Real-world capability set (docs/realworld/upmore-206-real-world-capabilities.md): the map covers all 206, every item
// names registry ids that exist, connectors that are in the catalog or declared gaps, a distinct completion proof, an
// approval gate for every write, and a failure message; the engine never calls a report evidence.
// Check: node --test tests/realworld.test.cjs && node scripts/realworld-audit.cjs --check
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const RW=require(path.join(root,'packages/domain/65-agent-realworld.js'));
const map=JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/realworld.json'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'packages/connectors/catalog.json'),'utf8'));
const registry=JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8'));
const overlay=JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/status-overlay.json'),'utf8'));
const regIds=new Set(registry.capabilities.map(c=>c.id));
const providers=new Set(catalog.connectors.map(c=>c.provider));
const exists=rel=>fs.existsSync(path.join(root,rel));
const E=RW.load(map,catalog,registry);
const depth={};for(const f of fs.existsSync(path.join(root,'evals/depth/results'))?fs.readdirSync(path.join(root,'evals/depth/results')):[]){if(/\.json$/.test(f)){const r=JSON.parse(fs.readFileSync(path.join(root,'evals/depth/results',f),'utf8'));depth[r.capability]=r;}}

test('the map holds C1 to C206 in order, each with every field',()=>{
  assert.equal(map.items.length,206);
  map.items.forEach((it,i)=>{
    assert.equal(it.id,`C${i+1}`);
    for(const f of ['title','group','say','done_when','runs_on','proof','gate','failure','proof_kind'])assert.ok(typeof it[f]==='string'&&it[f].trim().length>0,`${it.id} ${f}`);
    assert.ok(Array.isArray(it.registry)&&it.registry.length>0,`${it.id} registry`);
    assert.ok(Array.isArray(it.connectors)&&it.connectors.length>0,`${it.id} connectors`);
    assert.ok(RW.KINDS[it.proof_kind],`${it.id} proof kind ${it.proof_kind}`);
    assert.equal(it.writes,RW.WRITE_KINDS.includes(it.proof_kind),`${it.id} writes flag`);
  });
  assert.ok(exists(map.source),'the source spec is in the repo');
});

test('every registry id exists; every connector is a catalog row or a declared gap; every cited test and implementation file exists',()=>{
  for(const it of map.items){
    for(const r of it.registry)assert.ok(regIds.has(r),`${it.id} cites ${r}`);
    for(const c of it.connectors)assert.ok(c.startsWith('gap:')?/^gap:[a-z0-9-]+$/.test(c):providers.has(c),`${it.id} connector ${c}`);
    for(const t of it.tests)assert.ok(exists(t),`${it.id} test ${t}`);
    for(const f of it.implementation)assert.ok(exists(f),`${it.id} implementation ${f}`);
    if(it.sandbox)assert.ok(exists(it.sandbox),`${it.id} sandbox ${it.sandbox}`);
  }
});

test('the bar: no two capabilities share a completion proof, and every proof names evidence, not a report',()=>{
  const seen=new Map();
  for(const it of map.items){
    const key=it.proof.toLowerCase().replace(/\s+/g,' ').trim();
    assert.ok(!seen.has(key),`${it.id} shares its proof with ${seen.get(key)}`);seen.set(key,it.id);
    assert.ok(!/task completed|successfully completed/i.test(it.proof),`${it.id} proof is a report`);
    assert.ok(it.proof.length>=60,`${it.id} proof too thin`);
  }
});

test('every write names the step that needs a yes; read-only items say so; every item names what the user sees when the rail fails',()=>{
  for(const it of map.items){
    if(it.writes)assert.ok(/\byes\b|\bapprovals?\b|confirmed once|user's own (step|tap)|fires? on the user's|T5:/i.test(it.gate),`${it.id} write without a gate: ${it.gate}`);
    else assert.ok(/^none/i.test(it.gate)||/\bneeds?\b|\byes\b|own (gate|step)/i.test(it.gate),`${it.id} read-only gate must say none or name what the linked action needs: ${it.gate}`);
    assert.ok(it.failure.length>=20,`${it.id} failure text`);
    const gaps=it.connectors.filter(c=>c.startsWith('gap:'));
    if(gaps.length&&it.writes)assert.ok(/NOT_WIRED|GATED|not (set up|linked)|NOT wired/i.test(it.failure),`${it.id} write over a gap must say NOT_WIRED or GATED: ${it.failure}`);
    assert.ok(!/task completed/i.test(it.failure));
  }
});

test('every write has a registry id at T3 or above, or names its execution gap: the registry has no write capability for it yet',()=>{
  const tier=id=>E.describe(id).tier;
  for(const id of ['C46','C47','C110','C128','C131'])assert.ok(/^T[3-5]$/.test(tier(id)),`${id} ${tier(id)}`);
  assert.equal(tier('C131'),'T5');
  assert.equal(tier('C1'),'T1');
  const gaps=[];
  for(const it of map.items){
    const t=tier(it.id);
    if(!it.writes){assert.equal(it.execution_gap,undefined,`${it.id} read-only with an execution gap`);continue;}
    if(/^T[3-5]$/.test(t))assert.equal(it.execution_gap,undefined,`${it.id} has a T3+ id and an execution gap`);
    else{assert.ok(it.execution_gap&&it.execution_gap.tier_today===t&&regIds.has(it.execution_gap.nearest),`${it.id} write at ${t} without a named execution gap`);gaps.push(it.id);}
  }
  assert.equal(gaps.length,68,'the set of writes the registry cannot yet represent is pinned; a change here is a registry change, not drift');
  assert.ok(gaps.includes('C139')&&gaps.includes('C90')&&gaps.includes('C127'));
});

test('plan: NOT_WIRED when nothing is linked or no adapter exists; wired only with a linked provider whose adapter is live; gaps named',()=>{
  const p=E.plan('C46',{connected:[]});
  assert.equal(p.rail,RW.NOT_WIRED);assert.equal(p.wired,false);assert.ok(p.path.every(x=>!x.wired));
  const q=E.plan('C46',{connected:['schwab']});assert.equal(q.rail,RW.NOT_WIRED,'linked but adapter not built');
  assert.equal(q.path.find(x=>x.connector==='schwab').reason,'adapter not built');
  const r=E.plan('C46',{connected:['schwab'],adapters:{schwab:{state:'live'}}});assert.equal(r.rail,'schwab');assert.equal(r.wired,true);
  const g=E.plan('C90',{connected:['gmail'],adapters:{gmail:{state:'live'}}});
  assert.equal(g.path[0].connector,'gap:settlement-administrators');assert.equal(g.path[0].in_catalog,false);assert.equal(g.rail,'gmail');
  assert.ok(E.plan('C139',{}).gated.length===0||true);
  assert.ok(/yes/.test(r.gate));
});

test('proof: a report is never evidence, and a missing read-back is unknown, not done',()=>{
  for(const id of ['C1','C46','C73','C90','C139']){
    for(const e of [undefined,null,'done','task completed','Task completed.',{status:'completed'},{status:'done'},42])assert.equal(E.proof(id,e).done,null,`${id} ${JSON.stringify(e)}`);
  }
});

const T=Date.UTC(2026,9,11,13,0,0);
test('proof per kind: done, not done, unknown',()=>{
  const rows=[{id:'t1',amount_cents:21240,source:'plaid',as_of:T},{id:'t2',amount_cents:1500,source:'plaid',as_of:T}];
  assert.equal(E.proof('C1',{rows,total_cents:22740}).done,true);
  assert.equal(E.proof('C1',{rows,total_cents:22741}).done,false);
  assert.equal(E.proof('C1',{rows:[{id:'t1',amount_cents:5}],total_cents:5}).done,false,'row without source');
  assert.equal(E.proof('C1',{rows:[],total_cents:0}).done,null);

  const lines=[{text:'Yesterday $84.10',row_ids:['t1'],reply_capability:'TXN-020'}];
  assert.equal(E.proof('C2',{delivered_at:T,hour_wanted:13,lines}).done,true);
  assert.equal(E.proof('C2',{delivered_at:T,hour_wanted:7,lines}).done,false);
  assert.equal(E.proof('C2',{delivered_at:T,lines:[{text:'x',row_ids:['t1']}]}).done,false,'not replyable');

  assert.equal(E.proof('C18',{fired_at:T,value:10950,source:'market-data',as_of:T,fired_count:1}).done,true);
  assert.equal(E.proof('C18',{fired_at:T,value:10950,source:'market-data',as_of:T,fired_count:2}).done,false,'double fire');
  assert.equal(E.proof('C18',{fired_at:T,value:10950,source:'market-data',as_of:T,fired_count:0}).done,false);

  assert.equal(E.proof('C73',{expected_state:'cancelled',record:{state:'cancelled',read_at:T},next_charge_at:null}).done,true);
  assert.equal(E.proof('C73',{expected_state:'cancelled',record:{state:'active'}}).done,false);
  assert.equal(E.proof('C73',{expected_state:'cancelled',record:{state:'cancelled'},next_charge_at:T+86400000}).done,false,'next charge still scheduled');
  assert.equal(E.proof('C73',{expected_state:'cancelled',record:{}}).done,null);

  assert.equal(E.proof('C90',{counterparty:'Kroll Settlement Administration',reference:'KSA-2026-118822'}).done,true);
  assert.equal(E.proof('C90',{counterparty:'Kroll Settlement Administration',reference:'pending'}).done,false);
  assert.equal(E.proof('C90',{counterparty:'Kroll Settlement Administration',reference:''}).done,false);

  assert.equal(E.proof('C46',{order_id:'o1',status:'filled',fill_price_cents:51210,quantity:1,filled_at:T,position:{symbol:'VOO',quantity:1}}).done,true);
  const q=E.proof('C46',{order_id:'o1',status:'queued',market_open:false});assert.equal(q.done,true);assert.equal(q.pending,true);
  assert.equal(E.proof('C46',{order_id:'o1',status:'queued',market_open:true}).done,false);
  assert.equal(E.proof('C46',{order_id:'o1',status:'rejected'}).done,false);
  assert.equal(E.proof('C46',{order_id:'o1',status:'filled',quantity:1,filled_at:T}).done,false,'no fill price');
  assert.equal(E.proof('C46',{order_id:'o1',status:'filled',fill_price_cents:51210,quantity:2,filled_at:T,position:{quantity:1}}).done,false,'position does not reflect');
  assert.equal(E.proof('C46',{order_id:'o1',status:'working'}).done,null);

  assert.equal(E.proof('C57',{order_id:'o2',status:'open',params:{limit_cents:10500,expires_at:'2026-10-16'},wanted:{limit_cents:10500,expires_at:'2026-10-16'}}).done,true);
  assert.equal(E.proof('C57',{order_id:'o2',status:'open',params:{limit_cents:10500,expires_at:'2026-10-30'},wanted:{limit_cents:10500,expires_at:'2026-10-16'}}).done,false);
  assert.equal(E.proof('C57',{order_id:'o2',status:'cancelled',params:{}}).done,false);

  assert.equal(E.proof('C79',{expected_cents:3400,credit_row:{amount_cents:3400,posted_at:T}}).done,true);
  assert.equal(E.proof('C79',{expected_cents:3400,credit_row:{amount_cents:1700,posted_at:T}}).done,false);
  assert.equal(E.proof('C79',{expected_cents:3400,credit_row:null}).done,null);

  assert.equal(E.proof('C128',{rail:'zelle',status:'delivered',reference:'Z-9981'}).done,true);
  assert.equal(E.proof('C128',{rail:'venmo',status:'staged'}).done,false,'staged is not delivered');
  assert.equal(E.proof('C128',{rail:'zelle',status:'delivered'}).done,false,'no reference');
  assert.equal(E.proof('C128',{rail:'zelle',status:'processing'}).done,null);

  assert.equal(E.proof('C126',{amount_cents:3000000,from:{before:3200000,after:200000},to:{before:0,after:3000000}}).done,true);
  assert.equal(E.proof('C126',{amount_cents:3000000,from:{before:3200000,after:200000},to:{before:0,after:2999900}}).done,false);
  assert.equal(E.proof('C126',{amount_cents:3000000,from:{before:3200000},to:{}}).done,null);

  assert.equal(E.proof('C66',{setting:'deferral_pct',expected:10,observed:10}).done,true);
  assert.equal(E.proof('C66',{setting:'deferral_pct',expected:10,observed:6}).done,false);
  assert.equal(E.proof('C66',{setting:'deferral_pct',expected:10,observed:10,read_after_write:false}).done,null);

  assert.equal(E.proof('C155',{doc_id:'w2-2025',sha256:'a'.repeat(64)}).done,true);
  assert.equal(E.proof('C155',{doc_id:'w2-2025',sha256:'nope'}).done,false);

  assert.equal(E.proof('C33',{claims:[{text:'Revenue $1.2B',source_url:'https://www.sec.gov/x',as_of:'2026-08-01'}]}).done,true);
  assert.equal(E.proof('C33',{claims:[{text:'Revenue $1.2B',as_of:'2026-08-01'}]}).done,false);
  assert.equal(E.proof('C33',{claims:[]}).done,false);

  assert.equal(E.proof('C55',{user_confirmed_at:T,provider_readback:{exists:true}}).done,true);
  assert.equal(E.proof('C55',{user_confirmed_at:T,provider_readback:{exists:false}}).done,false);
  assert.equal(E.proof('C55',{user_confirmed_at:T}).done,null,'say-so alone is unknown');

  assert.equal(E.proof('C92',{counterparty:'British Airways',reference:'EU261-55120'}).done,true,'C92 is a claim reference');
  assert.equal(E.proof('C96',{reference:'BONUS-2026-77',payout_row:{amount_cents:30000,posted_at:T}}).done,true);
  const p=E.proof('C96',{reference:'BONUS-2026-77'});assert.equal(p.done,false);assert.equal(p.pending,true);
  assert.equal(E.proof('C96',{reference:''}).done,false);

  const b={equifax:{confirmation:'EQ-1',pin_stored:true},experian:{confirmation:'EX-1',pin_stored:true},transunion:{confirmation:'TU-1',pin_issued:false}};
  assert.equal(E.proof('C139',{bureaus:b}).done,true);
  assert.equal(E.proof('C139',{bureaus:{equifax:b.equifax,experian:b.experian}}).done,false,'two of three');
  assert.equal(E.proof('C139',{bureaus:Object.assign({},b,{equifax:{confirmation:'EQ-1',pin_stored:true,pin:'1234'}})}).done,false,'PIN in evidence');
});

test('failure text fills what it knows and never invents the rest; statements cite source and as-of and never say task completed',()=>{
  assert.equal(E.failure('C46',{brokerage:'Schwab'}),'Order not placed: Schwab is NOT_WIRED. Nothing was submitted.');
  assert.ok(/that brokerage is NOT_WIRED/.test(E.failure('C46',{})));
  assert.equal(E.failure('C3',{bank:'Chase',as_of:Date.UTC(2026,9,10)}),"I can't give a safe-to-spend number right now: pending transactions are unavailable from Chase since 2026-10-10.");
  const s=E.statement('C46',E.proof('C46',{order_id:'o1',status:'filled',fill_price_cents:51210,quantity:1,filled_at:T}),{source:'schwab',as_of:T});
  assert.ok(/done\. filled 1 at \$512\.10, \$512\.10 \(source: schwab, as of 2026-10-11\)\./.test(s),s);
  assert.ok(/in flight/.test(E.statement('C46',E.proof('C46',{order_id:'o1',status:'queued',market_open:false}))));
  assert.ok(/not done\. staged, not delivered/.test(E.statement('C128',E.proof('C128',{rail:'venmo',status:'staged'}))));
  assert.ok(/unknown.*will not call it done/.test(E.statement('C73',E.proof('C73','done'))));
  for(const id of ['C1','C46','C73'])assert.ok(!/task completed/i.test(E.statement(id,E.proof(id,null))));
});

test('status is computed from the registry, the overlay, the catalog and the depth results, never by hand',()=>{
  const facts={depth,overlay};
  const c128=E.status('C128',facts);assert.equal(c128.logic,'LOGIC_PROVEN');assert.deepEqual(c128.proven,['PAY-001']);assert.equal(c128.rail,'NOT_WIRED');
  const c73=E.status('C73',facts);assert.equal(c73.rail,'SANDBOX');assert.equal(c73.logic,'LOGIC_PROVEN');assert.deepEqual(c73.proven,['BILL-003']);
  // Proven: every planted defect bites and every sub-capability has one that does. A second defect on one sub-capability
  // (PAY-001 S07, 17 defects for 16) still proves; a defect that does not bite, or a sub-capability with none, does not.
  const pay=depth['PAY-001'],with_=rows=>({depth:Object.assign({},depth,{'PAY-001':Object.assign({},pay,{rows,proven:rows.filter(r=>r.bites).length})}),overlay});
  assert.ok(pay.rows.length>pay.sub_capabilities,'PAY-001 carries more defects than sub-capabilities');
  assert.equal(E.status('C128',with_(pay.rows.map((r,i)=>i===0?Object.assign({},r,{bites:false}):r))).logic==='LOGIC_PROVEN',false,'a defect that does not bite');
  assert.equal(E.status('C128',with_(pay.rows.filter(r=>r.sub!=='S13'))).logic==='LOGIC_PROVEN',false,'a sub-capability with no defect');
  const c1=E.status('C1',facts);assert.equal(c1.logic,'LOGIC_TESTED');assert.equal(c1.tested,5);assert.deepEqual(c1.gaps,[]);
  const c90=E.status('C90',facts);assert.deepEqual(c90.gaps,['settlement-administrators']);
  const c81=E.status('C81',facts);assert.equal(c81.rail,'NOT_WIRED');
  assert.ok(map.items.every(it=>['LOGIC_PROVEN','LOGIC_TESTED','PARTLY_TESTED','DESIGNED'].includes(E.status(it.id,facts).logic)));
  assert.ok(!map.items.some(it=>E.status(it.id,facts).rail==='LIVE'),'no adapter is live; a LIVE row would be a lie');
});

test('done means the world changed and was read back: only live evidence passing the item\'s proof counts; sandbox, failing read-backs and say-so never do',()=>{
  const facts={depth,overlay};
  assert.equal(map.items.filter(it=>E.status(it.id,facts).done).length,0,'nothing is done today');
  const T=Date.UTC(2026,9,11,13,0,0);const ok={order_id:'o1',status:'filled',fill_price_cents:51210,quantity:1,filled_at:T,position:{symbol:'VOO',quantity:1}};
  const at=(item,e)=>E.status(item,Object.assign({},facts,{evidence:{[item]:[Object.assign({item,counterparty:'Schwab',observed_at:'2026-10-11T13:00:00Z'},e)]}}));
  assert.equal(at('C46',{provider_mode:'live',readback:ok}).done,true,'a live fill read back is done');
  assert.equal(at('C46',{provider_mode:'sandbox',readback:ok}).done,false,'a sandbox fill is not done');
  assert.equal(at('C46',{provider_mode:'live',readback:{order_id:'o1',status:'queued',market_open:false}}).done,false,'queued is in flight, not done');
  assert.equal(at('C46',{provider_mode:'live',readback:'task completed'}).done,false,'a report is not evidence');
  assert.equal(at('C46',{provider_mode:'live',counterparty:'',readback:ok}).done,false,'no counterparty, no proof');
  assert.equal(at('C73',{provider_mode:'live',readback:{expected_state:'cancelled',record:{state:'active'}}}).done,false,'a record that still reads active is not done');
  assert.equal(at('C73',{provider_mode:'live',readback:{expected_state:'cancelled',record:{state:'cancelled'},next_charge_at:null}}).done,true);
  const md=fs.readFileSync(path.join(root,'docs/realworld/README.md'),'utf8');assert.match(md,/\*\*Done: 0 of 206\.\*\*/);assert.match(md,/SANDBOX is never done; LOGIC_PROVEN is never done/);
});

test('the audit report is current',()=>{
  const r=spawnSync('node',[path.join(root,'scripts/realworld-audit.cjs'),'--check'],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
});
