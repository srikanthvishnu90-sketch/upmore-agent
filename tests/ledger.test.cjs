// Instinct spec doc 02 ACCT/TXN/ANL/CARD/CRDT: every number comes from a function over real rows, in integer cents, with its source and as-of.
// Fixture: synthetic life LIFE-001 (doc 12) extended with cards, a hidden account, a euro account, a duplicate connector row, snapshots, debts, budgets, goals.
// Check: node --test tests/ledger.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','48-money-math.js','57-agent-ledger.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.L=AgentLedger;',ctx);
const L=ctx.L;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const lives=JSON.parse(fs.readFileSync(path.join(root,'evals/data/labeled/savings-lives.json'),'utf8'));
const life=lives.lives.find(l=>l.id==='LIFE-001');
const TODAY='2026-10-10';
const accounts=[
  {id:'chk',kind:'checking',institution:'Example Bank',mask:'4471',balance_cents:288000,available_cents:276000,source:'simplefin',as_of:'2026-10-10T06:00:00Z'},
  {id:'sav',kind:'savings',institution:'Example Bank',mask:'9902',balance_cents:128000,source:'simplefin',as_of:'2026-10-10T06:00:00Z'},
  {id:'cc1',kind:'credit_card',institution:'Example Bank',mask:'7710',nickname:'Blue card',network:'visa',balance_cents:142000,limit_cents:400000,statement_balance_cents:131000,statement_day:14,due_day:9,min_payment_cents:3500,apr_bps:2499,annual_fee_cents:9500,source:'simplefin',as_of:'2026-10-10T06:00:00Z'},
  {id:'cc1-dup',kind:'credit_card',institution:'Example Bank',mask:'7710',balance_cents:142000,limit_cents:400000,source:'plaid',as_of:'2026-10-09T06:00:00Z'},
  {id:'loan',kind:'student_loan',institution:'Nelnet',balance_cents:1200000,apr_bps:650,min_payment_cents:14000,source:'manual',as_of:'2026-10-01'},
  {id:'ira',kind:'retirement',institution:'Vanguard',balance_cents:950000,source:'plaid',as_of:'2026-10-09T22:00:00Z'},
  {id:'eur',kind:'savings',institution:'N26',currency:'EUR',balance_cents:100000,source:'manual',as_of:'2026-10-01'},
  {id:'old',kind:'checking',institution:'Old Bank',mask:'0001',balance_cents:0,hidden:true,source:'manual',as_of:'2026-06-01'},
  {id:'joint',kind:'checking',institution:'Credit Union',mask:'5555',balance_cents:50000,owners:['me','partner'],source:'manual',as_of:'2026-10-08'}
];
const txns=life.transactions.concat([{id:'t-x1',account_id:'sav',posted_at:'2026-09-05',amount:64.0,merchant_raw:'ONLINE TRANSFER FROM CHK',is_pending:false,is_transfer:false},{id:'t-x2',account_id:'cc1',posted_at:'2026-10-09',amount:-212.4,merchant_raw:'AMZN MKTP US*2K4',is_pending:true,is_transfer:false,note:'standing desk'}]);
const sept=life.transactions.filter(t=>t.posted_at.startsWith('2026-09'));
const sumAbs=rows=>rows.reduce((s,t)=>s+Math.round(Math.abs(t.amount)*100),0);

test('ACCT: balances cite source and as-of, available vs current is explained, hidden accounts leave totals, duplicates across connectors count once, joint vs individual',()=>{
  const b=L.balance(accounts[0]);assert.equal(b.balance_cents,288000);assert.equal(b.available_cents,276000);assert.equal(b.source,'simplefin');assert.equal(b.as_of,'2026-10-10T06:00:00Z');assert.match(b.explanation,/\$2,760\.00 available of \$2,880\.00: \$120\.00 is pending or on hold/);
  const l=L.listAccounts(accounts);assert.equal(l.count,8);same(l.hidden_excluded,['old']);assert.ok(l.by_institution['Example Bank'].length===4);
  assert.equal(L.listAccounts(accounts,{include_hidden:true}).count,9);
  assert.equal(L.listAccounts(accounts,{owner:'partner'}).count,1,'the partner sees only the joint account');
  const d=L.dedupe(accounts);same(d.dropped,['cc1-dup']);assert.equal(d.duplicates[0].reason,'same institution, kind and last digits across connectors');
  const nw=L.netWorth(d.accounts,{fx:{rates:{EUR:1.08},as_of:'2026-10-10'}});
  assert.equal(nw.assets_cents,288000+128000+950000+108000+50000);assert.equal(nw.liabilities_cents,142000+1200000);assert.equal(nw.net_worth_cents,nw.assets_cents-nw.liabilities_cents);same(nw.unconverted,[]);
  const noFx=L.netWorth(d.accounts);assert.equal(noFx.unconverted.length,1);assert.equal(noFx.unconverted[0].currency,'EUR');assert.equal(noFx.assets_cents,288000+128000+950000+50000,'no rate means not counted, never guessed');
  const cash=L.cashPosition(d.accounts);assert.equal(cash.cash_cents,288000+128000+50000);assert.equal(cash.available_cents,276000+128000+50000);
  assert.equal(L.cashPosition(d.accounts,{owner:'me'}).cash_cents,288000+128000+50000);assert.equal(L.cashPosition(d.accounts,{owner:'partner'}).cash_cents,50000);
});

test('ACCT: balance and net worth history with a 30-day trend, closed-account candidates, cards inventory',()=>{
  const snaps=[{on:'2026-08-10',account_id:'chk',balance_cents:250000},{on:'2026-09-10',account_id:'chk',balance_cents:270000},{on:'2026-10-10',account_id:'chk',balance_cents:288000},{on:'2026-08-10',account_id:'cc1',balance_cents:160000},{on:'2026-09-10',account_id:'cc1',balance_cents:150000},{on:'2026-10-10',account_id:'cc1',balance_cents:142000},{on:'2026-10-10',account_id:'old',balance_cents:0}];
  const h=L.balanceHistory(snaps,{account_id:'chk'});assert.equal(h.series.length,3);same(h.trend,{from:'2026-09-10',to:'2026-10-10',delta_cents:18000,direction:'up'});assert.equal(h.as_of,'2026-10-10');
  const nwh=L.netWorthHistory(snaps,accounts);assert.equal(nwh.series[0].balance_cents,250000-160000);assert.equal(nwh.series[2].balance_cents,288000-142000);assert.equal(nwh.trend.delta_cents,(288000-142000)-(270000-150000));
  const closed=L.closedCandidates(accounts,txns,TODAY);same(closed.map(c=>c.account_id),['old']);assert.match(closed[0].reason,/zero balance and no activity in 90 days/);
  const c=L.cards(L.dedupe(accounts).accounts,TODAY);assert.equal(c.cards.length,1);const card=c.cards[0];assert.equal(card.utilization_bps,3550);assert.equal(card.due_on,'2026-11-09');assert.equal(card.statement_on,'2026-10-14');assert.equal(card.network,'visa');assert.equal(c.total_utilization_bps,3550);
});

test('TXN: merchant normalization, categories with user rules winning, filters, search by merchant, amount, date and note, pending explained, CSV quoting',()=>{
  assert.equal(L.normalizeMerchant('AMZN MKTP US*2K4').display,'Amazon');assert.equal(L.normalizeMerchant('TRADER JOE S').display,"Trader Joe's");assert.equal(L.normalizeMerchant('PAYROLL DIRECT DEP').display,'Payroll');
  const rows=L.enrich(txns);const cat=id=>rows.find(t=>t.id===id).category;
  assert.equal(cat('t-001'),'income');assert.equal(cat('t-003'),'housing');assert.equal(cat('t-008'),'dining');assert.equal(rows.find(t=>t.merchant_raw==='NETFLIX.COM').category,'subscriptions');assert.equal(rows.find(t=>t.merchant_raw==='MONTHLY MAINTENANCE FEE').category,'fees');assert.equal(rows.find(t=>t.merchant_raw==='ONLINE TRANSFER TO SAV').category,'transfers');assert.equal(cat('t-x2'),'shopping');
  const ruled=L.enrich(txns,[{match:'STARBUCKS',category:'coffee'}]);assert.equal(ruled.find(t=>t.id==='t-008').category,'coffee');assert.equal(ruled.find(t=>t.id==='t-008').categorized_by,'your rule: STARBUCKS');
  assert.equal(L.categorize({merchant_raw:'STARBUCKS',amount:-5,category_override:'treats'}).category,'treats');
  const sep=L.list(txns,{from:'2026-09-01',to:'2026-09-30',category:'groceries'});assert.equal(sep.length,4,'Kroger, Whole Foods and two Trader Joe\'s runs');assert.ok(sep.every(t=>t.posted_at.startsWith('2026-09')));
  assert.equal(L.list(txns,{min_cents:200000}).length,3,'three rent payments at or above $2,000');assert.equal(L.list(txns,{pending:true}).length,1);
  assert.equal(L.search(txns,'netflix').length,3);assert.equal(L.search(txns,'$35').length,1,'exact amount');assert.equal(L.search(txns,'2026-09 kroger').length,1);assert.equal(L.search(txns,'standing desk').length,1,'notes are searchable');
  const p=L.pendingVsPosted(txns.find(t=>t.id==='t-x2'));assert.equal(p.state,'pending');assert.match(p.text,/Amazon \$212\.40 is pending.*already reduces your available balance/);
  const csv=L.csv([{id:'a',account_id:'chk',posted_at:'2026-09-01',amount:-12.5,merchant_raw:'CAFE LUNA INC',note:'lunch, "team"'}]);assert.equal(csv.split('\n')[0],'id,account_id,posted_at,amount,merchant,category,pending,note');assert.equal(csv.split('\n')[1],'a,chk,2026-09-01,-12.50,Cafe Luna Inc,dining,posted,"lunch, ""team"""');
});

test('TXN: transfers between own accounts pair once, recurring detection finds semimonthly pay and monthly bills but not coffee, merchant history, large charge explained',()=>{
  const tr=L.transfers(txns,accounts);assert.equal(tr.pairs.length,1);same(tr.pairs[0],{out_id:life.transactions.find(t=>t.merchant_raw==='ONLINE TRANSFER TO SAV'&&t.posted_at==='2026-09-05').id,in_id:'t-x1',from:'chk',to:'sav',amount_cents:6400,on:'2026-09-05'});
  const rec=L.recurring(txns,TODAY);const by=Object.fromEntries(rec.map(r=>[r.key,r]));
  assert.equal(by['payroll direct dep'].cadence,'semimonthly');assert.equal(by['payroll direct dep'].direction,'credit');assert.equal(by['payroll direct dep'].amount_cents,160000);assert.equal(by['payroll direct dep'].next_expected,'2026-10-01');assert.equal(by['payroll direct dep'].overdue,true,'October pay has not shown up yet');
  assert.equal(by['rent payment property mgmt'].cadence,'monthly');assert.equal(by['rent payment property mgmt'].next_expected,'2026-10-02');assert.equal(by['netflix com'].amount_cents,1549);assert.equal(by['comcast xfinity'].category,'utilities');
  assert.ok(!by['starbucks'],'daily coffee is not a recurring charge');assert.ok(!by['trader joe s'],'groceries are not a recurring charge');
  const cal=L.recurringCalendar(txns,TODAY,30);assert.ok(cal.items.some(i=>i.merchant==='Payroll'&&i.on==='2026-10-15'));assert.ok(cal.items.some(i=>i.merchant==='Netflix'&&i.on==='2026-11-09'));assert.ok(cal.items.every(i=>i.on>=TODAY&&i.on<='2026-11-09'));
  const mh=L.merchantHistory(txns,'kroger');assert.equal(mh.count,3);assert.equal(mh.total_cents,5215+6240+6240);assert.equal(mh.first_on,'2026-07-24');assert.equal(mh.as_of,'2026-09-24');
  const big=L.explainLarge(txns,'t-x2');assert.equal(big.unusual,true);assert.match(big.text,/Amazon \$212\.40 on 2026-10-09, shopping\. First charge from this merchant\..*Still pending/);
  const rentX=L.explainLarge(txns,'t-003');assert.equal(rentX.unusual,false);assert.match(rentX.text,/Your 2 other charges there average \$2,400\.00\./);
});

test('ANL: spending by category over a window, income vs spend, savings rate, month over month, merchant leaderboard, annual report, all from the rows',()=>{
  const s=L.spendingByCategory(txns,'2026-09-01','2026-09-30');
  const want={housing:sumAbs(sept.filter(t=>/RENT/.test(t.merchant_raw))),subscriptions:sumAbs(sept.filter(t=>/NETFLIX|NYTIMES|APPLE/.test(t.merchant_raw))),utilities:sumAbs(sept.filter(t=>/COMCAST/.test(t.merchant_raw))),groceries:sumAbs(sept.filter(t=>/KROGER|WHOLEFDS|TRADER/.test(t.merchant_raw))),fees:sumAbs(sept.filter(t=>/FEE/.test(t.merchant_raw))),dining:sumAbs(sept.filter(t=>/STARBUCKS/.test(t.merchant_raw)))};
  for(const [c,v] of Object.entries(want))assert.equal((s.categories.find(x=>x.category===c)||{}).spend_cents,v,c);
  assert.equal(s.total_cents,Object.values(want).reduce((a,b)=>a+b,0),'transfers to savings are not spending');assert.equal(s.categories[0].category,'housing');assert.ok(s.categories[0].share_bps>7000);assert.equal(s.source,'your transactions');
  const ivs=L.incomeVsSpend(txns,'2026-09');assert.equal(ivs.income_cents,320000);assert.equal(ivs.spend_cents,s.total_cents);assert.equal(ivs.savings_rate_bps,Math.round((320000-s.total_cents)*10000/320000));
  const sr=L.savingsRate(txns);assert.equal(sr.series.length,4);assert.ok(sr.series.slice(0,3).every(m=>m.savings_rate_bps>0&&m.savings_rate_bps<3000));
  const mom=L.monthOverMonth(txns,'2026-09');assert.equal(mom.prior,'2026-08');assert.equal(mom.delta_cents,mom.total_cents-mom.prior_total_cents);assert.equal(mom.categories.find(c=>c.category==='fees').delta_cents,4700-1550);
  const lb=L.merchantLeaderboard(txns,'2026-07-01','2026-09-30');assert.equal(lb.merchants[0].merchant,'Rent Payment Property Mgmt');assert.equal(lb.merchants[0].spend_cents,720000);
  const ar=L.annualReport(txns,2026);assert.equal(ar.income_cents,960000);assert.equal(ar.months_covered,4);assert.equal(ar.saved_cents,ar.income_cents-ar.spend_cents);assert.equal(ar.top_merchants.length,5);
});

test('ANL: budgets pace against the month, trends flag a 30 percent move, anomalies name their drivers, paychecks are allocated',()=>{
  const today='2026-09-15';
  const b=L.budgets(txns,{groceries:15000,dining:3000,housing:250000},today);
  const g=b.budgets.find(x=>x.category==='groceries');assert.equal(g.day,15);assert.equal(g.days_in_month,30);assert.equal(g.projected_cents,Math.round(g.spent_cents*30/15));
  const dining=b.budgets.find(x=>x.category==='dining');assert.ok(dining.alert===null||/dining: .* at this pace/.test(dining.alert));
  assert.equal(b.budgets.find(x=>x.category==='housing').alert,null,'rent paid on the 2nd is not over pace: projected 2400 under 2500');
  const over=L.budgets([{id:'q1',account_id:'chk',posted_at:'2026-09-03',amount:-90,merchant_raw:'CHIPOTLE'},{id:'q2',account_id:'chk',posted_at:'2026-09-10',amount:-80,merchant_raw:'CHIPOTLE'}],{dining:20000},today);assert.match(over.alerts[0],/^dining: \$170\.00 by day 15; at this pace \$340\.00 by month end, \$140\.00 over the \$200\.00 budget\.$/);
  const tr=L.categoryTrends(txns.concat([{id:'d1',account_id:'cc1',posted_at:'2026-09-20',amount:-60,merchant_raw:'CHIPOTLE'},{id:'d2',account_id:'cc1',posted_at:'2026-09-22',amount:-45,merchant_raw:'CHIPOTLE'}]),'2026-09');
  const dn=tr.trends.find(t=>t.category==='dining');assert.ok(dn&&dn.flag==='up'&&dn.change_bps>=3000,JSON.stringify(tr.all.find(t=>t.category==='dining')));assert.match(dn.text,/^dining up \d+ percent vs your 2-month average/);
  const an=L.anomalyExplain(txns.concat([{id:'f1',account_id:'cc1',posted_at:'2026-09-12',amount:-400,merchant_raw:'DELTA AIR LINES'}]),'2026-09');assert.ok(an.over_cents>0);assert.equal(an.drivers[0].category,'travel');assert.equal(an.drivers[0].over_cents,40000);assert.ok(an.drivers.some(d=>d.category==='fees'&&d.over_cents===4700-Math.round((1200+1550)/2)),'the overdraft month is a fees driver');assert.match(an.text,/^September was \$[\d.,]+ above your 2-month average\. travel explains \$400\.00; fees explains \$[\d.]+\.$/);assert.equal(an.largest[0].merchant,'Rent Payment Property Mgmt');assert.equal(an.largest[1].merchant,'Delta Air Lines');
  const calm=L.anomalyExplain(txns,'2026-08');assert.match(calm.text,/^August was not above your 1-month average\.$/);
  const pa=L.paycheckAllocation(txns,null,accounts);assert.equal(pa.paychecks.length,6);const p=pa.paychecks[4];assert.equal(p.on,'2026-09-01');assert.equal(p.amount_cents,160000);assert.equal(p.bills_cents,240000+1549+1700+299,'rent and the subscriptions in the first half of September');assert.equal(p.transfers_cents,6400);assert.equal(p.left_cents,p.amount_cents-p.bills_cents-p.transfers_cents-p.discretionary_cents);
});

test('ANL: safe to spend shows every component, the cash flow forecast finds the low point, goals report pace and ETA, what-if is arithmetic not advice',()=>{
  const acc=L.dedupe(accounts).accounts.map(a=>a.id==='cc1'?Object.assign({},a,{due_on:'2026-10-14'}):a);
  const s=L.safeToSpend({today:TODAY,accounts:acc,transactions:txns});
  assert.equal(s.next_income_on,'2026-10-15');assert.equal(s.available_cents,276000+128000+50000);
  assert.ok(s.upcoming.every(i=>i.on>=TODAY&&i.on<='2026-10-15'));assert.equal(s.card_statements_cents,131000);assert.equal(s.safe_to_spend_cents,s.available_cents-s.upcoming_debits_cents-131000-s.buffer_cents);
  assert.match(s.text,/^Safe to spend today: \$[\d,.-]+\. That is \$4,540\.00 available, minus \$[\d,.]+ of bills due before your next income on 2026-10-15, minus \$1,310\.00 of card statements due, minus a \$[\d,.]+ buffer\.$/);
  const f=L.cashflowForecast({today:TODAY,accounts:acc,transactions:txns});
  same(f.points.map(p=>p.days),[30,60,90]);assert.ok(f.discretionary_per_day_cents>0);assert.ok(f.low_point.balance_cents<=f.start_cents);assert.ok(f.points[2].balance_cents>f.points[0].balance_cents-600000,'rent and pay both recur');assert.match(f.assumptions,/recurring income and debits repeat/);
  const broke=L.cashflowForecast({today:TODAY,accounts:[{id:'c',kind:'checking',balance_cents:2000,available_cents:2000}],transactions:txns});assert.ok(broke.warning&&/Projected to go negative on 2026-1\d-\d\d/.test(broke.warning),broke.warning);
  const g=L.goals([{id:'ef',name:'emergency fund',target_cents:600000,account_id:'sav',by:'2027-10-10'}],acc,txns,TODAY)[0];
  assert.equal(g.saved_cents,128000);assert.equal(g.remaining_cents,472000);assert.equal(g.progress_bps,2133);assert.equal(g.needed_per_month_cents,Math.round(472000/12));assert.equal(g.current_pace_per_month_cents,Math.round(6400/3),'only the one in-bound transfer in the last 90 days');assert.equal(g.on_track,false);assert.equal(g.source,'simplefin');
  const w=L.whatIf(txns,{category:'dining',cut_cents:2000},[{id:'ef',name:'emergency fund',target_cents:600000,account_id:'sav'}],acc,TODAY);assert.equal(w.saved_per_year_cents,24000);assert.match(w.text,/^Cut dining by \$20\.00 a month and you keep \$240\.00 a year; emergency fund arrives \d+ months from now instead of \d+ months\.$/);
});

test('CARD and CRDT: utilization alert names the statement date and the pay-down, due dates, minimum vs full in exact interest, fee audit, debt inventory, avalanche vs snowball amortized, extra payment impact',()=>{
  const acc=L.dedupe(accounts).accounts;
  const u=L.utilizationAlerts(acc,TODAY);assert.equal(u.alerts.length,2);assert.equal(u.alerts[0].pay_down_cents,142000-120000);assert.match(u.alerts[0].text,/^Blue card is at 36 percent of its limit; the statement closes 2026-10-14 and that is the number the bureaus see\. Paying \$220\.00 before then brings it under 30 percent\.$/);
  assert.equal(L.utilizationAlerts(acc,TODAY,5000).alerts.length,0);
  const d=L.dueDates(acc,TODAY,45);assert.equal(d.due.length,1);assert.equal(d.due[0].due_on,'2026-11-09');assert.equal(d.due[0].days_to_due,30);assert.equal(d.due[0].autopay,false);
  const m=L.minVsFull(acc.find(a=>a.id==='cc1'));assert.equal(m.interest_if_minimum_this_month_cents,Math.round(131000*2499/120000));assert.ok(m.months_to_clear_at_minimum>40&&m.months_to_clear_at_minimum<80,String(m.months_to_clear_at_minimum));assert.ok(m.total_interest_at_minimum_cents>50000);assert.match(m.text,/Paying the \$35\.00 minimum costs \$27\.28 in interest this month and takes \d+ months to clear, \$[\d,.]+ in interest total\. Paying the \$1,310\.00 statement balance in full costs \$0\.00\./);
  const trap=L.minVsFull({balance_cents:100000,apr_bps:2999,min_payment_cents:2000});assert.equal(trap.months_to_clear_at_minimum,Infinity);assert.match(trap.text,/does not cover the \$24\.99 monthly interest/);
  const fee=L.annualFeeAudit(acc.find(a=>a.id==='cc1'),6000,2000);assert.equal(fee.net_cents,-1500);assert.equal(fee.verdict,'costing more than it returns');assert.match(fee.text,/\$95\.00 fee against \$80\.00 of rewards and benefits used in the last 12 months, net -\$15\.00\. Ask the issuer for a retention offer/);
  const inv=L.debtInventory(acc);same(inv.debts.map(x=>x.id),['cc1','loan']);assert.equal(inv.total_cents,1342000);assert.equal(inv.monthly_minimums_cents,17500);assert.equal(inv.monthly_interest_cents,Math.round(142000*2499/120000)+Math.round(1200000*650/120000));
  const plans=L.payoffPlans(acc,20000);same(plans.avalanche.order,['cc1','loan']);same(plans.snowball.order,['cc1','loan'],'here the smallest balance is also the highest APR');assert.ok(plans.avalanche.total_interest_cents<=plans.snowball.total_interest_cents);assert.ok(plans.avalanche.months<=plans.snowball.months);assert.ok(plans.avalanche.months>24&&plans.avalanche.months<60,String(plans.avalanche.months));
  const two=[{id:'a',kind:'credit_card',balance_cents:500000,apr_bps:2400,min_payment_cents:10000},{id:'b',kind:'loan',balance_cents:100000,apr_bps:600,min_payment_cents:5000}];
  const p2=L.payoffPlans(two,10000);same(p2.avalanche.order,['a','b']);same(p2.snowball.order,['b','a']);assert.ok(p2.interest_difference_cents>0,'snowball pays more interest');assert.ok(p2.snowball.payoff_month.b<p2.avalanche.payoff_month.b,'snowball clears the small debt first');assert.match(p2.text,/Avalanche saves \$[\d,.]+; snowball clears the first debt sooner\./);
  const x=L.extraPaymentImpact(acc,20000);assert.ok(x.months_saved>12&&x.interest_saved_cents>50000,JSON.stringify({m:x.months_saved,i:x.interest_saved_cents}));assert.match(x.text,/^\$200\.00 extra a month clears your debt \d+ months sooner and saves \$[\d,.]+ in interest\.$/);
  const proj=L.debtPayoffProjection(acc,0);assert.equal(proj.months,proj.payoff_month.loan);
});
