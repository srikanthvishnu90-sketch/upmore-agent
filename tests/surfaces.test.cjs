// Instinct spec docs 07, 08, 02: side-income surfaces matched to skills and rated by effective hourly rate, signup bonuses filtered by what the
// user can meet, portal earnings and routing, offer activation and the best card as arithmetic on the user's own table, dispute packets,
// complaint drafts, energy plans on real usage, move budgets, crypto export, the bill calendar. Catalogs are dated data with a source.
// Check: node --test tests/surfaces.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','48-money-math.js','57-agent-ledger.js','63-agent-surfaces.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.S=AgentSurfaces;',ctx);
const S=ctx.S;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const TODAY='2026-10-10';
const lives=JSON.parse(fs.readFileSync(path.join(root,'evals/data/labeled/savings-lives.json'),'utf8'));
const life=lives.lives.find(l=>l.id==='LIFE-001');

test('side income: matched to skills, gear and hours; rated by effective hourly rate after fees, unpaid time and vehicle cost; earn apps rated honestly under the floor; benefits screening surfaced as not-work',()=>{
  const m=S.sideIncomeMatch({skills:['programming','writing'],gear:['laptop','smartphone'],hours_per_week:6});
  assert.equal(m.fits[0].id,'freelance_dev');assert.ok(m.fits[0].effective_hourly_cents>7000&&m.fits[0].effective_hourly_cents<9000,String(m.fits[0].effective_hourly_cents));assert.ok(m.fits.some(f=>f.id==='freelance_writing'));assert.ok(!m.fits.some(f=>f.id==='rideshare'),'no car');assert.equal(m.rest.find(r=>r.id==='rideshare').why_not,'needs driving');
  assert.ok(m.fits.some(f=>f.id==='earn_apps')&&m.below_floor.some(f=>f.id==='earn_apps'),'earn apps fit anyone and sit under the floor');assert.ok(m.fits.some(f=>f.id==='benefits_screening')&&!m.below_floor.some(f=>f.id==='benefits_screening'));
  assert.match(m.text,/^With 6 hours a week and programming, writing: Freelance software or data work about \$[\d.]+ an hour after fees and unpaid time \(net 14-30\); /);assert.match(m.text,/Also worth ten minutes: a benefits screening/);assert.match(m.text,/Earn apps are on the list because you asked, rated honestly: under the floor\. Typical ranges, 2026-10\.$/);
  const d=S.sideIncomeMatch({skills:['driving'],gear:['car','smartphone'],hours_per_week:10});assert.equal(d.fits.filter(f=>!['earn_apps','benefits_screening','selling_used','user_research'].includes(f.id))[0].id,'rideshare');const rs=d.fits.find(f=>f.id==='rideshare');assert.ok(rs.effective_hourly_cents<2000,'vehicle cost comes off the typical rate: '+rs.effective_hourly_cents);
  assert.equal(S.sideIncomeMatch({skills:[],gear:[],hours_per_week:0}).fits.map(f=>f.id).join(','),'benefits_screening','nothing else fits with no gear and no hours');
  assert.equal(S.effective({typical_hourly_cents:[2000,4000],unpaid_minutes_per_hour:0,fee_bps:0},5),3000);assert.equal(S.effective({typical_hourly_cents:[2000,4000],unpaid_minutes_per_hour:60,fee_bps:5000},5),750,'half the time unpaid and half in fees');
});

test('signup bonuses: filtered by state, new-customer rule, direct deposit size and movable cash; forgone interest netted; rated per hour of chores',()=>{
  const b=S.bonusFinder({today:TODAY,state:'TX',monthly_direct_deposit_cents:320000,movable_cash_cents:500000,reference_apy_bps:400,recent_banks:[{bank:'Example Online Bank',opened_on:'2025-11-01'}]});
  same(b.fits.map(f=>f.id),['ex1','ex2']);assert.equal(b.rest.find(r=>r.id==='ex3').why_not[0],'you had an account there within 2 years');assert.match(b.rest.find(r=>r.id==='ex4').why_not[0],/^needs \$15,000\.00 parked for 90 days$/);
  assert.equal(b.fits[0].requirement,'$2,000.00 direct deposit within 90 days');assert.equal(b.fits[0].net_cents,30000);assert.equal(b.fits[0].effective_hourly_cents,Math.round(30000*60/45));assert.equal(b.fits[1].effective_hourly_cents,Math.round(20000*60/(40+30)),'ten debit purchases cost three minutes each');
  assert.match(b.text,/^2 bonuses you can meet: Example National \$300\.00 for \$2,000\.00 direct deposit within 90 days, about \$[\d.]+ an hour for the chores, keep it 180 days; Example Credit Union \$200\.00 for 10 debit purchases within 60 days, about \$[\d.]+ an hour for the chores, keep it 90 days\. Terms as of 2026-10; I track the requirements once you open one\.$/);
  const rich=S.bonusFinder({today:TODAY,state:'CA',monthly_direct_deposit_cents:900000,movable_cash_cents:2000000});assert.ok(rich.fits.some(f=>f.id==='ex4'&&f.forgone_interest_cents===Math.round(1500000*400*90/(10000*365))&&f.net_cents===15000-f.forgone_interest_cents));assert.ok(!rich.fits.some(f=>f.id==='ex2'),'TX/OK only');
});

test('portal earnings separate pending, confirmed and landed; routing stacks the best portal with a card offer; offer activation is a confirmed loop request; the best card honors caps, windows, activation and foreign fees',()=>{
  const pe=S.portalEarnings([{portal:'Portal A',pending_cents:1250,confirmed_cents:3400,as_of:TODAY,next_payout_on:'2026-11-15'}],[{id:'r1',posted_at:'2026-08-15',amount:21.5,merchant_raw:'RAKUTEN CASH BACK'}],TODAY);
  assert.equal(pe.text,'$34.00 confirmed and $12.50 pending across 1 portal; $21.50 has actually landed in your accounts; next payout Portal A 2026-11-15. Pending is the portal\'s number, not money.');
  const user={today:TODAY,card_offers:[{id:'o1',card:'Blue card',merchant:'ShoeCo',percent_bps:1000,activated:false,expires_on:'2026-10-31'},{id:'o2',card:'Blue card',merchant:'ShoeCo',amount_cents:500,activated:true,min_cents:20000}]};
  const r=S.routePurchase({merchant:'ShoeCo running shoes',amount_cents:12000},null,user);assert.equal(r.best_portal.portal,'Portal B');assert.equal(r.best_portal.back_cents,1440);assert.equal(r.best_offer.id,'o1');assert.equal(r.total_back_cents,1440+1200);
  assert.equal(r.text,'ShoeCo running shoes $120.00: start from Portal B for $14.40 back (12 percent, monthly, 30-day lock); activate the Blue card offer for $12.00. $26.40 total, as of 2026-10. Portal and card offers usually stack; coupon codes at checkout usually void the portal.');
  assert.match(S.routePurchase({merchant:'Local Hardware',amount_cents:5000},null,user).text,/^No portal rate or card offer on file for Local Hardware\.$/);
  assert.equal(S.offersForPlan([{merchant:'BigShop',amount_cents:10000},{merchant:'Nowhere',amount_cents:100}],user).length,1);
  const act=S.activateOffer(user.card_offers[0],user);assert.equal(act.request.capability_id,'EARN-010');assert.equal(act.request.idempotency_key,'offer:Blue card:o1');assert.equal(act.request.confirm.restate,'activate the Blue card offer: 10 percent back at ShoeCo, through 2026-10-31.');assert.equal(S.activateOffer(user.card_offers[1]).done,true);assert.match(S.activateOffer(null).ask,/Which offer/);
  const cards=[{name:'Blue card',base_bps:150,categories:[{category:'groceries',bps:500,from:'2026-10-01',to:'2026-12-31',cap_cents:150000,used_cents:140000,activation_required:true,activated:true},{category:'dining',bps:300}],foreign_fee_bps:300},{name:'Travel card',base_bps:200,categories:[{category:'travel',bps:500},{category:'groceries',bps:400,activation_required:true,activated:false}],foreign_fee_bps:0}];
  const g=S.bestCard({category:'groceries',amount_cents:8000},cards,TODAY);assert.equal(g.best.card,'Blue card');assert.equal(g.best.rate_bps,500);assert.equal(g.text,'Use Blue card: 5 percent on groceries through 2026-12-31 ($100.00 of the cap left), $4.00 back on $80.00 (Travel card would give $1.60). Travel card would give more with its groceries offer activated.'.replace(' Travel card would give more with its groceries offer activated.',''));
  assert.match(g.ranked[1].why,/4 percent on groceries needs activating first/);
  const capped=S.bestCard({category:'groceries',amount_cents:8000},[Object.assign({},cards[0],{categories:[{category:'groceries',bps:500,cap_cents:150000,used_cents:150000}]}),cards[1]],TODAY);assert.equal(capped.best.card,'Travel card','the cap is spent, the base rate decides');
  const abroad=S.bestCard({category:'dining',amount_cents:10000,abroad:true},cards,TODAY);assert.equal(abroad.best.card,'Travel card');assert.match(abroad.text,/\(Blue card would give \$0\.00\)/);
});

test('dispute packets, complaint drafts, energy plans on usage, move budgets, crypto export without invented basis, and the bill calendar',()=>{
  const t={id:'t9',posted_at:'2026-10-02',amount:-89.99,merchant_raw:'GADGET STORE'};
  const d=S.disputePacket(t,'not_received',{receipt:'r-1',merchant_contact:'2026-10-06'});assert.equal(d.request.capability_id,'CARD-010');assert.equal(d.request.confirm.restate,'file a dispute for $89.99 at GADGET STORE on 2026-10-02, reason: merchandise or service not received, evidence: receipt r-1, merchant contact on 2026-10-06.');assert.match(d.steps[0],/^Contact the merchant first/);
  assert.match(S.disputePacket(t,'unauthorized',{}).steps[0],/^Lock the card now/);assert.match(S.disputePacket(t,'because',{}).ask,/Which reason/);
  const c=S.complaintDraft({company:'Example Hotels',what_happened:'the room had no working air conditioning for two of the three nights',on:'2026-09-28',reference:'HX-4471',impact:'We slept badly and the front desk could not move us.',ask_cents:15000,evidence:['photos','the maintenance ticket number'],today:TODAY});
  assert.equal(c.text,'To Example Hotels customer care: On 2026-09-28 (reference HX-4471), the room had no working air conditioning for two of the three nights. We slept badly and the front desk could not move us. I was a paying customer and I am asking for a credit of $150.00. I have photos and the maintenance ticket number if you need them. Please reply within 10 business days. Thank you.');assert.equal(c.follow_up_on,'2026-10-24');assert.match(S.complaintDraft({company:'x'}).ask,/what_happened, on/);
  const e=S.energyPlans([{kwh:900},{kwh:1100},{kwh:1000}],[{id:'a',name:'Fixed 12',rate_cents_per_kwh_x100:1450,monthly_fee_cents:995,term_months:12,current:true},{id:'b',name:'Variable',rate_cents_per_kwh_x100:1320,monthly_fee_cents:0},{id:'c',name:'Green 24',rate_cents_per_kwh_x100:1390,monthly_fee_cents:495,term_months:24,renewable:true,early_exit_fee_cents:15000}]);
  assert.equal(e.annual_kwh,12000);assert.equal(e.best.id,'b');assert.equal(e.best.yearly_cents,158400);assert.equal(e.current.yearly_cents,174000+11940);assert.equal(e.saving_cents,174000+11940-158400);assert.match(e.text,/^On your 12000 kWh a year: Variable costs about \$1,584\.00, \$275\.40 less than Fixed 12\. Rates as quoted; a plan's rate can step up after the term\.$/);
  const m=S.moveBudget({new_rent_cents:210000,deposit_months:1,old_rent_cents:180000,overlap_days:10,miles:30,old_deposit_cents:150000});assert.equal(m.lines.find(l=>l.what==='Overlap on the old place').cents,60000);assert.equal(m.subtotal_cents,210000+210000+60000+60000+15000+20000+10000);assert.equal(m.contingency_cents,Math.round(m.subtotal_cents/10));assert.equal(m.net_cents,m.total_cents-150000);assert.match(m.text,/Typical figures are marked; replace them with quotes\.$/);
  const x=S.cryptoExport([{id:'c1',on:'2026-03-01',type:'buy',asset:'BTC',quantity:0.01,proceeds_cents:null,cost_basis_cents:65000,fee_cents:99,exchange:'ExampleX'},{id:'c2',on:'2026-09-01',type:'sell',asset:'BTC',quantity:0.01,proceeds_cents:70000,cost_basis_cents:null,fee_cents:99,exchange:'ExampleX',note:'moved to cash'}]);
  assert.equal(x.csv.split('\n')[0],'Date,Type,Asset,Quantity,Proceeds (USD),Cost Basis (USD),Fee (USD),Exchange,Note');assert.equal(x.csv.split('\n')[2],'2026-09-01,sell,BTC,0.01,700.00,,0.99,ExampleX,moved to cash');same(x.missing_basis,['c2']);assert.match(x.text,/1 sale has no cost basis on file; the tool will ask, and I will not guess one\./);
  const cal=S.billCalendar({today:'2026-09-30',transactions:life.transactions,days:30,autopay:['Comcast Xfinity'],bills:[{name:'Car insurance',amount_cents:14200,due_on:'2026-10-12',autopay:true}]});
  assert.ok(cal.items.some(i=>i.name==='Rent Payment Property Mgmt'&&i.on==='2026-10-02'&&!i.autopay));assert.ok(cal.items.some(i=>i.name==='Comcast Xfinity'&&i.autopay));assert.ok(cal.items.some(i=>i.name==='Car insurance'&&i.source==='you'));assert.ok(!cal.items.some(i=>/Trader|Kroger|Starbucks/.test(i.name)),'groceries and coffee are not bills');assert.match(cal.text,/need a manual payment\.$/);
});
