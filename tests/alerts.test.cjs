// Instinct spec doc 02 ALRT-001..012: today's rows and connector events become alerts with evidence and a reason; the user's own watches are
// parsed from their words and evaluated the same way; quiet hours hold everything but safety; a busy day is one bundle; the proactive feed carries it all.
// Check: node --test tests/alerts.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','35-agent-intents.js','36-agent-workflows.js','41-agent-recovery.js','43-agent-loop.js','45-advice-guard.js','46-voice.js','47-data-guard.js','48-money-math.js','49-agent-save.js','44-agent-earn.js','55-agent-news.js','57-agent-ledger.js','59-agent-alerts.js','56-agent-proactive.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.A=AgentAlerts;this.P=AgentProactive;this.Loop=AgentLoop;',ctx);
const A=ctx.A,P=ctx.P,Loop=ctx.Loop;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const lives=JSON.parse(fs.readFileSync(path.join(root,'evals/data/labeled/savings-lives.json'),'utf8'));
const life=lives.lives.find(l=>l.id==='LIFE-001');
const TODAY='2026-10-15';const NOW=Date.UTC(2026,9,15,14,0,0);
const accounts=[{id:'chk',kind:'checking',nickname:'checking',balance_cents:42000,available_cents:42000,source:'simplefin',as_of:'2026-10-15T06:00:00Z'},{id:'sav',kind:'savings',balance_cents:128000,source:'simplefin',as_of:'2026-10-15T06:00:00Z'}];
const todays=[
  {id:'a1',account_id:'chk',posted_at:TODAY,amount:1600,merchant_raw:'PAYROLL DIRECT DEP'},
  {id:'a2',account_id:'chk',posted_at:TODAY,amount:-64.99,merchant_raw:'COMCAST XFINITY'},
  {id:'a3',account_id:'chk',posted_at:TODAY,amount:-35,merchant_raw:'OVERDRAFT ITEM FEE'},
  {id:'a4',account_id:'chk',posted_at:TODAY,amount:-640,merchant_raw:'BEST BUY'},
  {id:'a5',account_id:'chk',posted_at:TODAY,amount:-4.5,merchant_raw:'STARBUCKS'}
];
const base=()=>({today:TODAY,transactions:life.transactions.concat(todays),accounts});

test('detectors: deposit landed, bill went up with the yearly cost, fee with the reversal offer, large first-time charge; coffee is nothing; every firing carries evidence rows, a source and an as-of',()=>{
  const f=A.detect(base());const by=k=>f.find(x=>x.kind===k);
  assert.equal(by('deposit_received').text,'Payroll landed: $1,600.00.');same(by('deposit_received').evidence.rows,['a1']);assert.equal(by('deposit_received').capability_id,'ALRT-007');
  assert.equal(by('bill_increase').text,'Comcast Xfinity charged $64.99 today; it had been $59.99 monthly. That is $60.00 a year if it stays.');assert.equal(by('bill_increase').amount_cents,500);
  assert.match(by('fee_charged').text,/^Overdraft Item Fee charged \$35\.00 today\. Banks often reverse a fee when asked; want the request drafted\?$/);
  const big=f.filter(x=>x.kind==='unusual_spending');assert.equal(big.length,1);assert.equal(big[0].text,'Best Buy is new to your accounts and charged $640.00 today.');assert.equal(big[0].capability_id,'ALRT-003');
  assert.ok(!f.some(x=>x.evidence.rows.includes('a5')),'the coffee fires nothing');
  for(const x of f){assert.ok(x.evidence&&x.evidence.source&&x.evidence.as_of,x.key);assert.ok(x.title&&x.text&&x.capability_id,x.key);}
  assert.ok(!f.some(x=>x.kind==='low_balance'),'checking plus savings covers the fortnight after payday');
});

test('low balance ahead comes from the forecast with the buffer and the day; a user line makes a large-transaction alert; payment failed and new-device sign-in come from events; a probe-then-large day is safety',()=>{
  const poor=Object.assign(base(),{accounts:[{id:'chk',kind:'checking',balance_cents:60000,available_cents:60000,source:'simplefin',as_of:TODAY}],buffer_cents:20000});
  const lb=A.detect(poor).find(x=>x.kind==='low_balance');assert.ok(lb,'rent on the 2nd takes the balance under the buffer');assert.equal(lb.capability_id,'ALRT-001');assert.match(lb.text,/^Your cash is \$600\.00 now; it goes under your \$200\.00 buffer on 2026-11-02 \(-?\$[\d,.]+\) and bottoms at -\$[\d,.]+ on 2026-11-\d\d\.$/);assert.equal(lb.severity,'urgent');assert.ok(lb.deadline>NOW);
  const lined=A.detect(Object.assign(base(),{large_threshold_cents:50000}));const lt=lined.find(x=>x.kind==='large_transaction');assert.equal(lt.text,'Best Buy charged $640.00 today, over your $500.00 line.');assert.equal(lt.capability_id,'ALRT-002');
  const ev=A.detect(Object.assign(base(),{events:[{id:'e1',kind:'payment_failed',payee:'Nelnet',amount_cents:14000,reason:'insufficient funds',retry_by:'2026-10-18',source:'Example Bank',at:TODAY},{id:'e2',kind:'sign_in',service:'Example Bank',new_device:true,location:'Lisbon',at:'2026-10-15T03:12:00Z'},{id:'e3',kind:'sign_in',service:'Example Bank',new_device:false}]}));
  const pf=ev.find(x=>x.kind==='payment_failed');assert.equal(pf.severity,'urgent');assert.equal(pf.text,'Your Nelnet payment of $140.00 failed (insufficient funds). Retry by 2026-10-18 to avoid a late fee. Want me to set up the retry? You approve it.');assert.equal(pf.deadline,Date.parse('2026-10-18T00:00:00Z'));
  const si=ev.filter(x=>x.kind==='security_sign_in');assert.equal(si.length,1,'a known device is silent');assert.equal(si[0].severity,'safety');assert.match(si[0].text,/^Someone signed in to Example Bank from a new device \(Lisbon\) at 2026-10-15T03:12:00Z\. If that was not you, change the password there now and I will help with the rest; I never ask for the password\.$/);
  const probe=A.detect(Object.assign(base(),{transactions:life.transactions.concat([{id:'p1',account_id:'chk',posted_at:TODAY,amount:-1,merchant_raw:'ZQX DIGITAL'},{id:'p2',account_id:'chk',posted_at:TODAY,amount:-489,merchant_raw:'ZQX DIGITAL'}])}));
  const fr=probe.find(x=>x.kind==='fraud_pattern');assert.equal(fr.severity,'safety');assert.equal(fr.capability_id,'SEC-001');assert.match(fr.text,/^A charge under \$2\.00 followed by a large one today: Zqx Digital \$1\.00, Zqx Digital \$489\.00\. If these are not yours, I can walk you through locking the card and disputing them\.$/);
  const returned=A.detect(Object.assign(base(),{transactions:life.transactions.concat([{id:'r1',account_id:'chk',posted_at:TODAY,amount:-25,merchant_raw:'RETURNED ITEM NSF'}])})).find(x=>x.kind==='payment_failed');assert.ok(returned&&returned.severity==='urgent');
  const ren=A.detect(Object.assign(base(),{renewals:[{name:'Adobe Creative Cloud annual',amount_cents:65988,renews_on:'2026-10-20'}]})).find(x=>x.kind==='renewal');assert.equal(ren.text,'Adobe Creative Cloud annual renews on 2026-10-20 for $659.88. Keep, cancel, or switch to monthly?');assert.equal(ren.deadline,Date.parse('2026-10-20T00:00:00Z'));
});

test('watches in the user\'s words: six shapes parse and restate, unknown phrasing is refused, and each fires only on its condition',()=>{
  const p=t=>A.parseWatch(t,NOW);
  assert.equal(p('tell me when my checking drops below $500').watch.restated,"I'll tell you when checking drops below $500.00.");
  assert.equal(p('any charge over $200').watch.kind,'amount_over');assert.equal(p('let me know when Comcast charges me').watch.restated,"I'll tell you when Comcast charges you.");
  assert.equal(p('ping me when my paycheck lands').watch.kind,'deposit');assert.equal(p('warn me if dining spending goes over $300 this month').watch.restated,"I'll tell you when dining spending passes $300.00 in a month.");
  assert.equal(p('tell me if my Comcast bill goes up').watch.kind,'bill_increase');
  const no=p('tell me when mercury is in retrograde');assert.equal(no.ok,false);assert.match(no.text,/^I can watch a balance below an amount/);
  const watches=[Object.assign({},p('tell me when my checking drops below $500').watch,{id:'w1'}),Object.assign({},p('any charge over $200').watch,{id:'w2'}),Object.assign({},p('when Comcast charges me').watch,{id:'w3'}),Object.assign({},p('when my paycheck lands').watch,{id:'w4'}),Object.assign({},p('if groceries spending goes over $100 this month').watch,{id:'w5'}),Object.assign({},p('if my Comcast bill goes up').watch,{id:'w6'}),Object.assign({},p('any charge over $1').watch,{id:'w7',status:'paused'})];
  const f=A.evaluateWatches(watches,base());const byW=id=>f.filter(x=>x.watch.id===id);
  assert.equal(byW('w1')[0].text,'checking is at $420.00, below your $500.00 line. (you asked me to watch this)');
  assert.equal(byW('w2').length,1);assert.match(byW('w2')[0].text,/^Best Buy charged \$640\.00, over your \$200\.00 line\./);
  assert.match(byW('w3')[0].text,/^Comcast Xfinity charged \$64\.99 today\./);assert.match(byW('w4')[0].text,/^Payroll landed: \$1,600\.00\./);
  assert.equal(byW('w5').length,0,'October groceries are under $100 so far');assert.match(byW('w6')[0].text,/^Comcast Xfinity charged \$64\.99 today, up from \$59\.99\./);
  assert.equal(byW('w7').length,0,'a paused watch is silent');
  for(const x of f)assert.equal(x.capability_id,'ALRT-010');
});

test('quiet hours hold everything but safety until the window ends; three or more items become one bundle with safety outside it; run() yields the feed shape and the loop says the safety item first',async()=>{
  const firings=A.detect(Object.assign(base(),{events:[{id:'e2',kind:'sign_in',service:'Example Bank',new_device:true}]}));
  const quiet={start:22,end:7,utc_offset_hours:-5};const night=Date.UTC(2026,9,15,4,30,0);// 23:30 local
  const d=A.deliver(firings,night,quiet);assert.equal(d.quiet,true);same(d.now.map(x=>x.kind),['security_sign_in']);assert.ok(d.held.length>=4);assert.equal(d.held_until,Date.UTC(2026,9,15,12,0,0),'7:00 local is 12:00Z');assert.ok(d.held.every(x=>x.held_until===d.held_until));
  const day=A.deliver(firings,NOW,quiet);assert.equal(day.quiet,false);assert.equal(day.held.length,0);
  const b=A.bundle(firings);assert.equal(b.bundled,true);assert.equal(b.items[0].kind,'security_sign_in','safety is never bundled');assert.equal(b.items[1].kind,'bundle');assert.match(b.items[1].text,/^\d things today: .*\. Say which one you want first\.$/);assert.ok(b.items[1].members.length>=4);assert.equal(b.items[1].capability_id,'ALRT-012');
  assert.equal(A.bundle(firings.slice(0,2)).bundled,false);
  const r=A.run(Object.assign(base(),{events:[{id:'e2',kind:'sign_in',service:'Example Bank',new_device:true}],watches:[Object.assign({},A.parseWatch('tell me when my checking drops below $500',NOW).watch,{id:'w1'})]}),{now:NOW});
  assert.equal(r.safety.length,1);assert.ok(r.watches.some(w=>/you asked me to watch this/.test(w.text)));assert.ok(r.proactive.length>=1);assert.ok(r.proactive.every(p=>p.reason&&p.key&&p.text));
  const feed=P.feed(Object.assign(base(),{earn:{},stories:[],events:[{id:'e2',kind:'sign_in',service:'Example Bank',new_device:true}],watches:r.watches.length?[Object.assign({},A.parseWatch('tell me when my checking drops below $500',NOW).watch,{id:'w1'})]:[]}),{now:NOW});
  assert.ok(feed.sources.alerts.firings>=5);assert.ok(feed.safety.some(s=>/signed in/.test(s.text)));
  const connectors={read:async()=>({value:1,source:'x',as_of:NOW}),write:async()=>({reference:'r'}),verify:async()=>({confirmed:true,source:'x'})};
  const out=await Loop.create({registry:{get:()=>null,answer:()=>({text:''})},connectors,clock:()=>NOW}).wake(feed);assert.equal(out.outcome,'alert');assert.match(out.message,/Someone signed in/);
});
