// The seam: engine findings become loop inputs with reasons and deadlines; the loop's decision order and budget decide what is said;
// every message is composed through the voice layer; the weekly digest keeps verified and estimated apart.
// Check: node --test tests/proactive.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','35-agent-intents.js','36-agent-workflows.js','41-agent-recovery.js','43-agent-loop.js','45-advice-guard.js','46-voice.js','47-data-guard.js','48-money-math.js','49-agent-save.js','44-agent-earn.js','55-agent-news.js','56-agent-proactive.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.P=AgentProactive;this.Loop=AgentLoop;this.Save=AgentSave;this.Voice=AgentVoice;this.Earn=AgentEarn;',ctx);
const P=ctx.P,Loop=ctx.Loop,Save=ctx.Save,Voice=ctx.Voice,Earn=ctx.Earn;
const TODAY='2026-10-10';const NOW=Date.UTC(2026,9,10,14,0,0);
const lives=JSON.parse(fs.readFileSync(path.join(root,'evals/data/labeled/savings-lives.json'),'utf8'));
const life=lives.lives.find(l=>l.opportunities.some(o=>o.play==='P3_fee')&&l.opportunities.some(o=>o.play==='P1_subscription'))||lives.lives[0];
function input(extra){return Object.assign({today:TODAY,transactions:life.transactions,accounts:life.accounts,bills:life.bills,debts:life.debts,extra_payment_cents:20000,reference_apy_bps:425,balance:4212.08,
  earn:{bonuses:[{id:'b1',bank:'Example Bank',account_id:'bonus',amount_cents:30000,opened_on:'2026-09-20',requirements:[{kind:'direct_deposit',amount_cents:200000,by:'2026-10-17'}]}],rewards:[{program:'Chase Ultimate Rewards',points:40000,real_cents_per_point_x100:125,expires_on:'2026-11-09'}]},
  stories:[{id:'n1',title:'Nvidia beats estimates as data center revenue doubles',summary:'Nvidia reported results. Guidance was raised.',source:'Reuters',link:'https://example.test/n1',published_at:NOW-3600000},{id:'n2',title:'Stocks mixed as traders weigh earnings',summary:'Indexes moved little.',source:'CNBC',link:'https://example.test/n2',published_at:NOW-3600000}],
  news_user:{holdings:[{symbol:'NVDA',name:'Nvidia',sector:'semiconductors'}]}},extra||{});}

test('the feed turns engine findings into loop inputs: watches for owned-name news and deadlines firing today, commitments for deadlines ahead, proactive items with reasons, every text lint-clean',()=>{
  const f=P.feed(input(),{now:NOW});
  assert.equal(f.kind,'event');
  assert.ok(f.watches.some(w=>/^news:/.test(w.key)&&/Nvidia/.test(w.text)&&w.reason==='you hold this name'),'owned-name material news is a standing watch');
  assert.ok(f.watches.some(w=>/^deadline:/.test(w.key)&&/direct deposit: in 7 days/.test(w.text)),'a deadline 7 days out fires today as a watch');
  assert.ok(f.commitments.some(c=>/points expire/.test(c.text)&&c.due_at<Date.parse('2026-11-09T00:00:00Z')),'a deadline ahead is a commitment due a week before');
  assert.ok(f.proactive.length>=4);
  for(const p of f.proactive){assert.ok(p.key&&p.text&&p.reason,p.key);assert.equal(JSON.stringify(Voice.lint(p.text,{})),'[]',p.key+': '+JSON.stringify(Voice.lint(p.text,{})));}
  const save=f.proactive.filter(p=>/^save:/.test(p.key)),earn=f.proactive.filter(p=>/^earn:/.test(p.key));
  assert.ok(save.some(p=>/fee/.test(p.key))&&earn.some(p=>/bank_bonus/.test(p.key)));
  assert.ok(f.sources.monitors&&f.sources.save&&f.sources.earn&&f.sources.news);
  assert.equal(f.sources.news.alerts,1);assert.equal(f.brief.count>=1,true);
  assert.ok(!f.proactive.some(p=>/Stocks mixed/.test(p.text)),'noise never reaches the feed');
});

test('through the loop: safety beats everything, watches beat proactive, the top proactive item goes with its reason, the second is suppressed by the budget, a real deadline bypasses it',async()=>{
  const connectors={read:async()=>({value:1,source:'x',as_of:NOW}),write:async()=>({reference:'r'}),verify:async()=>({confirmed:true,source:'x'})};
  const registry={get:()=>null,answer:()=>({text:''})};
  const f=P.feed(input({safety:[{text:'Possible fraud: $1,200.00 at a merchant you have never used, 3:12 am.'}]}),{now:NOW});
  const a=await Loop.create({registry,connectors,clock:()=>NOW}).wake(f);assert.equal(a.outcome,'alert');assert.match(a.message,/Possible fraud/);
  const g=P.feed(input(),{now:NOW});
  const w=await Loop.create({registry,connectors,clock:()=>NOW}).wake(g);assert.equal(w.outcome,'notify');assert.equal(w.why,'standing_watch');assert.match(w.message,/\(you hold this name\)|\(you asked me to track this deadline\)/);
  const h=P.feed(input({stories:[],earn:{}}),{now:NOW});assert.equal(h.watches.length,0);
  const loop=Loop.create({registry,connectors,clock:()=>NOW});
  const p1=await loop.wake(h);assert.equal(p1.outcome,'notify');assert.equal(p1.why,'proactive');assert.equal(p1.budget,'budget');assert.match(p1.message,new RegExp(h.proactive[0].reason.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  const p2=await loop.wake(P.feed(input({stories:[],earn:{}}),{now:NOW}));assert.equal(p2.outcome,'silent');assert.ok(p2.suppressed.some(s=>s.reason==='daily_budget'));
  const soon=P.feed(input({stories:[],earn:{bonuses:[{id:'b2',bank:'Other Bank',account_id:'bonus',amount_cents:20000,opened_on:'2026-09-20',requirements:[{kind:'debit_count',count:10,by:'2026-10-12'}]}]}}),{now:NOW});
  const item=soon.proactive.find(p=>/bank_bonus:b2/.test(p.key));assert.ok(item&&item.deadline);
  const p3=await loop.wake({kind:'event',proactive:[item]});assert.equal(p3.outcome,'notify');assert.equal(p3.budget,'deadline');
});

test('the weekly money minute keeps verified and estimated apart and names what is coming due',()=>{
  const f=P.feed(input({stories:[]}),{now:NOW});
  const sl=Save.ledger();const r=Save.detect({today:TODAY,transactions:life.transactions,accounts:life.accounts,bills:life.bills,debts:life.debts,extra_payment_cents:20000,reference_apy_bps:425});
  const fee=r.opportunities.find(o=>/fee_recurring/.test(o.key));sl.book(fee,{verified:true,verified_monthly_cents:1200},'2026-10-05');
  const el=Earn.ledger();el.book({key:'earn_app:x',play:'E6_side_income',expected_cents:2000,time_minutes:5},{verified:true,verified_cents:2000},'2026-10-06');
  const d=P.digest(Object.assign(input(),{savings_ledger:sl,earnings_ledger:el}),f,{since:'2026-09-30'});
  assert.match(d.lines[0],/^Verified savings: \$12\.00 a month\.$/);
  assert.ok(d.lines.some(l=>/^\$20\.00 found this period, about 5 minutes of your actions, verified\.$/.test(l)));
  assert.ok(d.lines.some(l=>/^Estimated, not yet booked: \$[\d,.]+ across \d+ open items?; the top one:/.test(l)));
  assert.ok(d.lines.some(l=>/^Coming due:/.test(l)));
  assert.ok(!/verified.*estimated|estimated.*verified/i.test(d.lines[0]),'the verified line carries no estimate');
  const empty=P.digest({today:TODAY},{proactive:[],commitments:[]},{});assert.match(empty.text,/^Nothing to report this week/);
});
