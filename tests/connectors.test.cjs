// Instinct spec doc 04: one connector model, five verbs, consent as a record, normalization at ingest, source ranking, health that treats
// breakage as normal, revoke that really revokes, and act() behind the autonomy and compliance gates. All against fixtures; no provider.
// Check: node --test tests/connectors.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','43-agent-loop.js','53-compliance.js','51-connectors.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.C=Connectors;this.Loop=AgentLoop;this.Comp=Compliance;',ctx);
const C=ctx.C,Comp=ctx.Comp;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const fixture={accounts:[{id:'chk-1',name:'Everyday Checking',type:'checking',balance:4212.08,available:4100.00,mask:'4471'}],transactions:[{id:'t1',account_id:'chk-1',date:'2026-10-09',amount:-15.49,name:'NETFLIX.COM'},{id:'t2',account_id:'chk-1',date:'2026-10-08',amount:-6.24,name:'SQ *TRADER JOE S AUSTIN TX'},{id:'t3',account_id:'chk-1',date:'2026-10-01',amount:3250,name:'PAYROLL DIRECT DEP'},{id:'t4',account_id:'chk-1',date:'2026-10-05',amount:-130,name:'ONLINE TRANSFER TO SAV'}]};
const clock=()=>{let t=1700000000000;return {now:()=>t,tick:ms=>{t+=ms;}};};

test('lifecycle for the fake aggregator: connect vaults the token, sync normalizes and stamps freshness, health, revoke destroys the token and writes the retention note',async()=>{
  const k=clock();const destroyed=[];const store=C.create({clock:k.now,vault:{put:(id,secret)=>({handle:'vh_'+id}),destroy:id=>{destroyed.push(id);return true;}}});
  const agg=C.fakeAggregator(fixture);store.register(agg);
  const rec=await store.connect('fake-aggregator','u1',{public_token:'x'});
  assert.equal(rec.status,'HEALTHY');assert.equal(rec.token_handle,'vh_conn_001');assert.ok(!JSON.stringify(rec).includes('agg-access-token'),'the secret never lands in the record');
  same(rec.scopes,['READ_BALANCES','READ_TRANSACTIONS'],'read-only by default; write scopes need their own grant');
  assert.match(rec.consent.text,/^Upmore can see your balances, see your transactions\. Data is kept while the connection is active and for 90 days after/);assert.equal(rec.consent.read_only,true);
  const s=await store.sync(rec.id);assert.equal(s.ok,true);assert.equal(s.accounts[0].balance_cents,421208);assert.equal(s.accounts[0].mask,'4471');
  same(s.transactions.map(t=>[t.merchant_key,t.amount_cents,t.is_transfer]),[['netflix com',-1549,false],['trader joe s austin tx',-624,false],['payroll direct dep',325000,false],['online transfer to sav',-13000,true]],'merchant keys via the monitors: processor prefix stripped, location kept (TXN-004 normalization is still CLAIMED)');
  for(const t of s.transactions){assert.equal(t.as_of,k.now());assert.equal(t.source,'fake-aggregator');assert.equal(t.auth,'AGGREGATOR');}
  k.tick(1000);const s2=await store.sync(rec.id,'2026-10-06');assert.equal(s2.transactions.length,2,'since filter');
  const h=await store.health(rec.id);assert.equal(h.status,'HEALTHY');assert.equal(h.degraded,false);
  const r=await store.revoke(rec.id,'user asked');assert.equal(r.status,'REVOKED');same(destroyed,['conn_001']);assert.equal(store.records.get(rec.id).token_handle,null);assert.match(r.retention_note,/Token destroyed and syncs stopped.*Retained: transactions and balances already synced, for 90 days/);
  await assert.rejects(store.sync(rec.id),/revoked; syncs are stopped/);
  const d=store.describe();assert.equal(d[0].status,'REVOKED');assert.ok(d[0].consent&&d[0].retention_note);
  assert.ok(store.audit.every(e=>!JSON.stringify(e).includes('agg-access-token')),'audit log never carries a secret');
  assert.ok(store.audit.some(e=>e.kind==='revoke'));
});

test('reauth flips status and emits exactly one calm message, escalates once, then stays quiet; failures keep last-good data with an age label',async()=>{
  const k=clock();const store=C.create({clock:k.now});const agg=C.fakeAggregator(fixture);store.register(agg);
  const rec=await store.connect('fake-aggregator','u1',{});await store.sync(rec.id);
  agg.failNext('reauth');const bad=await store.sync(rec.id);assert.equal(bad.ok,false);assert.equal(bad.status,'NEEDS_REAUTH');
  assert.equal(store.events.length,1);assert.equal(store.events[0].message,'fake-aggregator needs you to sign in again. One tap here relinks it; nothing else changes.');assert.equal(store.events[0].one_tap,'relink:conn_001');
  agg.failNext('reauth');await store.sync(rec.id);assert.equal(store.events.length,2);assert.equal(store.events[1].escalated,true);
  agg.failNext('reauth');await store.sync(rec.id);assert.equal(store.events.length,2,'third breakage is suppressed, never spam');assert.ok(store.audit.some(e=>e.kind==='reauth_suppressed'));
  k.tick(3600000);agg.failNext('expired');const h=await store.health(rec.id);assert.equal(h.status,'NEEDS_REAUTH');assert.equal(h.degraded,true);assert.equal(h.changed,false);assert.equal(h.last_good_age_ms,3600000,'age of the last good sync is known');assert.equal(store.events.length,2,'an unchanged status emits nothing');
  agg.failNext('timeout');const t=await store.sync(rec.id);assert.equal(t.status,'STALE');
  agg.failNext('corrupt');const c=await store.sync(rec.id);assert.equal(c.status,'BROKEN');assert.ok(store.audit.some(e=>e.kind==='sync_corrupt'));
  await store.sync(rec.id);assert.equal(store.records.get(rec.id).status,'HEALTHY','a good sync heals');
  agg.failNext('expired');const h2=await store.health(rec.id);assert.equal(h2.status,'NEEDS_REAUTH');assert.equal(h2.changed,true);
});

test('act() passes the autonomy gate and the compliance gate before any adapter call: a T5 action and an unconfirmed T3 never reach the adapter, a gated rail fails closed, a confirmed live action does',async()=>{
  const k=clock();const store=C.create({clock:k.now});const agg=C.fakeAggregator(fixture);store.register(agg);
  const rec=await store.connect('fake-aggregator','u1',{},['READ_BALANCES','INITIATE_TRANSFER'],{write_consent:true});await store.sync(rec.id);
  const t5={id:'PAY-002',name:'send to new recipient',tier:'T5',status:'TESTED'},t3={id:'PAY-009',name:'transfer between own accounts',tier:'T3',status:'TESTED'};
  const action={scope:'INITIATE_TRANSFER',amount_cents:5000,recipient:'sav'};
  const a=await store.act(rec.id,t5,Object.assign({},action,{confirmed:true}),{partners:{money_movement:{live:true,name:'P'}},kyc:{state:'verified'}});assert.equal(a.reached_adapter,false);assert.equal(a.reason,'t5_never_autonomous');
  const b=await store.act(rec.id,t3,action,{partners:{money_movement:{live:true,name:'P'}},kyc:{state:'verified'}});assert.equal(b.reached_adapter,false);assert.equal(b.reason,'needs_confirmation');
  const c=await store.act(rec.id,t3,Object.assign({},action,{confirmed:true}),{partners:{}});assert.equal(c.reached_adapter,false);assert.match(c.reason,/^compliance:no_live_partner/);assert.match(c.message,/licensed money-movement partner/);
  const d=await store.act(rec.id,t3,Object.assign({},action,{confirmed:true}),{partners:{money_movement:{live:true,name:'P'}},kyc:{state:'verified'}});assert.equal(d.reached_adapter,true);assert.equal(d.result.reference,'agg-ref-5000');assert.equal(d.result.token_handle_seen,'vh_conn_001','the adapter gets a handle, not the secret');
  const e=await store.act(rec.id,t3,{scope:'READ_BALANCES'},{});assert.equal(e.reason,'not_a_write_scope');
  const read=await store.connect('fake-aggregator','u2',{});const f=await store.act(read.id,t3,Object.assign({},action,{confirmed:true}),{partners:{money_movement:{live:true}},kyc:{state:'verified'}});assert.equal(f.reason,'scope_not_granted');
  assert.throws(()=>C.consentRecord(['INITIATE_TRANSFER'],{}),/write scopes need their own consent grant/);
});

test('sync conflicts follow the source ranking and are reported, never merged; scheduling is webhook first',()=>{
  const r=C.resolve('balance',[{source:'manual',auth:'MANUAL',value:400000,as_of:5},{source:'plaid',auth:'AGGREGATOR',value:421208,as_of:3},{source:'scrape',auth:'VAULTED_CREDENTIALS',value:418000,as_of:4}]);
  assert.equal(r.value,421208);assert.equal(r.winner.auth,'AGGREGATOR');assert.equal(r.conflict,true);assert.match(r.statement,/^Sources disagree: plaid says 421208, scrape says 418000, manual says 400000\. Using plaid \(AGGREGATOR\), the source of truth for balances\./);
  const h=C.resolve('holding',[{source:'plaid',auth:'AGGREGATOR',value:10,as_of:1},{source:'schwab',auth:'OAUTH',value:10,as_of:1}]);assert.equal(h.winner.auth,'OAUTH');assert.equal(h.conflict,false);assert.equal(h.statement,null);
  assert.throws(()=>C.resolve('person',[]),/no ranking/);
  const rec={lastSyncAt:null};same(C.due(rec,'banking',1000,false),{due:true,why:'never synced'});
  same(C.due({lastSyncAt:1000},'banking',1000+3600000,false),{due:false,next_at:1000+86400000});same(C.due({lastSyncAt:1000},'banking',2000,true),{due:true,why:'webhook'});
});

test('manual CSV is a first-class connector and the OAuth stub hands off, then connects with the code; adapters must implement all five verbs',async()=>{
  const store=C.create({clock:()=>1});store.register(C.manualCsv());store.register(C.stubOAuth());
  const csv=await store.connect('manual-csv','u1','date,amount,description\n2026-10-01,-4.75,Starbucks\n2026-10-02,-1549,Netflix');store.records.get(csv.id)._csv='date,amount,description\n2026-10-01,-4.75,Starbucks\n2026-10-02,-15.49,Netflix';
  const s=await store.sync(csv.id);assert.equal(s.ok,true);same(s.transactions.map(t=>[t.merchant_key,t.amount_cents,t.source]),[['starbucks',-475,'manual-csv'],['netflix',-1549,'manual-csv']]);
  const h=await store.connect('sandbox-oauth','u1',{});assert.equal(h.status,'NEEDS_REAUTH');assert.match(h.handoff.url,/authorize/);assert.equal(h.token_handle,null);
  const o=await store.connect('sandbox-oauth','u1',{code:'abc'});assert.equal(o.status,'HEALTHY');assert.equal(o.token_handle,'vh_conn_003');
  const hs=await store.sync(o.id);assert.equal(hs.holdings[0].symbol,'VTI');assert.equal(hs.holdings[0].cost_cents,250000);
  assert.throws(()=>C.validateAdapter({provider:'half',authMethod:'OAUTH',connect(){},sync(){}}),/lacks act, health, revoke/);
  assert.throws(()=>C.validateAdapter({provider:'odd',authMethod:'MAGIC',connect(){},sync(){},act(){},health(){},revoke(){}}),/invalid authMethod/);
  assert.throws(()=>C.validateAdapter({provider:'odd',authMethod:'OAUTH',scopes:['READ_EVERYTHING'],connect(){},sync(){},act(){},health(){},revoke(){}}),/unknown scope/);
  await assert.rejects(store.connect('manual-csv','u1','',['INITIATE_TRANSFER']),/does not offer scope/);
});
