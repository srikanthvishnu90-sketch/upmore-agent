// Instinct spec doc 02: the vault holds metadata never bytes or identity numbers; policies, renewals, beneficiaries and enrollment windows;
// receipt emails parsed and matched to charges, photos attached by what the user says; the unrecognized-charge ladder; phishing signals;
// the agent's own session audit; tax calendars, the donation log and refund tracking.
// Check: node --test tests/documents.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','48-money-math.js','57-agent-ledger.js','62-agent-documents.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.D=AgentDocuments;',ctx);
const D=ctx.D;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const TODAY='2026-10-10';const NOW=Date.UTC(2026,9,10,14,0,0);const DAY=86400000;
const lives=JSON.parse(fs.readFileSync(path.join(root,'evals/data/labeled/savings-lives.json'),'utf8'));
const life=lives.lives.find(l=>l.id==='LIFE-001');

test('the vault indexes metadata, refuses identity numbers, finds by any field; policies inventory with gaps, renewals with lead time, beneficiary audit, enrollment windows',()=>{
  const v=D.vault();
  assert.throws(()=>v.add({kind:'policy',title:'x'},NOW),/needs location/);assert.throws(()=>v.add({kind:'id_document',title:'ssn card',location:'s3://x',text:'123-45-6789'},NOW),/never text with an identity or account number/);
  v.add({kind:'policy',subkind:'auto',title:'Auto policy 2026',issuer:'Example Mutual',location:'vault://p1',premium_cents:142000,deductible_cents:50000,renews_on:'2026-11-15',effective_on:'2025-11-15'},NOW);
  v.add({kind:'policy',subkind:'renters',title:'Renters policy',issuer:'Example Mutual',location:'vault://p2',premium_cents:18000,renews_on:'2027-03-01'},NOW);
  v.add({kind:'policy',subkind:'life',title:'Term life 20y',issuer:'LifeCo',location:'vault://p3',premium_cents:42000,beneficiaries:['Ana'],beneficiaries_reviewed_on:'2024-06-01'},NOW);
  v.add({kind:'tax_form',subkind:'W-2',title:'W-2 2025 Example Corp',issuer:'Example Corp',year:2025,location:'vault://t1'},NOW);
  assert.equal(v.find('example').length,3);assert.equal(v.find('2025').length,1);assert.equal(v.list({kind:'policy'}).length,3);
  const p=D.policies(v,TODAY);assert.equal(p.annual_premiums_cents,202000);same(p.lines_without_a_policy_on_file,['health']);assert.match(p.text,/^3 policies on file: auto \(Example Mutual, \$1,420\.00 a year, renews 2026-11-15\); renters \(Example Mutual, \$180\.00 a year, renews 2027-03-01\); life \(LifeCo, \$420\.00 a year\)\. Nothing on file for health; that is a gap in my records, not necessarily in your cover\.$/);
  const r=D.renewals(v,TODAY,45);assert.equal(r.length,1);assert.equal(r[0].days,36);assert.match(r[0].text,/^auto with Example Mutual renews 2026-11-15 \(36 days\) at \$1,420\.00\. Two or three quotes now/);assert.equal(r[0].capability_id,'INS-003');
  const b=D.beneficiaryAudit(v,TODAY,[{kind:'marriage',on:'2025-09-01'}]);assert.equal(b.due.length,1);assert.equal(b.due[0].reason,'marriage on 2025-09-01 since the last review');assert.match(b.text,/A beneficiary form beats a will/);
  assert.equal(D.beneficiaryAudit(v,TODAY,[]).due[0].reason,'last reviewed 2 year(s) ago');
  const w=D.enrollmentWindows({windows:[{name:'Employer benefits',opens:'2026-11-03',closes:'2026-11-17'}]},TODAY);assert.equal(w.windows.length,3);assert.equal(w.windows[0].state,'opens in 22 days');assert.equal(w.windows[0].closes,'2027-01-15','the marketplace window crosses the year');assert.match(w.text,/Medicare open enrollment: opens in 5 days \(2026-10-15 to 2026-12-07; annual\)/);assert.match(w.caveat,/official page for the year decides/);
});

test('receipt emails parse and match a charge on amount, date and merchant; ambiguity is reported, not guessed; photos attach by what the user states',()=>{
  const email={id:'m1',from:'orders@bigshop.example',from_name:'BigShop',subject:'Your BigShop order #BS-77821 has shipped',body:'Thanks for your order. Order total: $212.40. Placed Oct 9, 2026.',received_at:'2026-10-09T18:00:00Z'};
  const rc=D.parseReceipt(email);same({merchant:rc.merchant,total_cents:rc.total_cents,order:rc.order,on:rc.on,parsed:rc.parsed},{merchant:'BigShop',total_cents:21240,order:'BS-77821',on:'2026-10-09',parsed:true});
  const txns=life.transactions.concat([{id:'t-x2',account_id:'cc1',posted_at:'2026-10-09',amount:-212.4,merchant_raw:'BIGSHOP MKTP US*2K4'},{id:'t-x3',account_id:'cc1',posted_at:'2026-10-10',amount:-212.4,merchant_raw:'OTHERSTORE'}]);
  const m=D.matchReceipt(rc,txns);assert.equal(m.matched,'t-x2');assert.equal(m.reason,'amount, date and merchant');same(m.candidates,['t-x2','t-x3']);assert.equal(m.attach.title,'BigShop $212.40 #BS-77821');
  const amb=D.matchReceipt(Object.assign({},rc,{merchant:null}),txns);assert.equal(amb.matched,null);assert.match(amb.reason,/^2 charges for \$212\.40 in the window; say which$/);
  assert.equal(D.matchReceipt({total_cents:999999,merchant:'x',on:TODAY},txns).reason,'no charge for that amount in the window');assert.equal(D.matchReceipt(D.parseReceipt({subject:'hi',body:'no numbers here'}),txns).reason,'no total found in the email');
  assert.match(D.attachPhoto({location:'photo://1'},null,txns).ask,/I attach by what you tell me; I do not read the photo/);
  const ph=D.attachPhoto({location:'photo://1',sha256:'abc'},{amount_cents:21240,merchant:'BigShop',on:'2026-10-09'},txns);assert.equal(ph.matched,'t-x2');assert.equal(ph.photo.location,'photo://1');
});

test('the unrecognized-charge ladder explains descriptors, recurrence, history, pending, household and trials before suggesting a dispute',()=>{
  const ctx0={today:TODAY,transactions:life.transactions};
  const nf=D.triageCharge(life.transactions.find(t=>t.merchant_raw==='NETFLIX.COM'&&t.posted_at==='2026-09-09'),ctx0);assert.equal(nf.verdict,'likely yours');assert.ok(nf.steps.some(s=>s.step==='recurring'&&/repeats monthly at about \$15\.49/.test(s.text)));assert.ok(nf.steps.some(s=>s.step==='history'));
  const amz=D.triageCharge({id:'z1',account_id:'cc1',posted_at:TODAY,amount:-212.4,merchant_raw:'AMZN MKTP US*2K4',is_pending:true},ctx0);assert.equal(amz.steps[0].text,'"AMZN MKTP US*2K4" is how Amazon shows up on statements.');assert.ok(amz.steps.some(s=>s.step==='pending'));assert.equal(amz.verdict,'probably yours; check the merchant name');
  const unk=D.triageCharge({id:'z2',account_id:'cc1',posted_at:TODAY,amount:-489,merchant_raw:'ZQX DIGITAL'},ctx0);assert.equal(unk.verdict,'unexplained');assert.match(unk.next,/^Nothing in your history explains Zqx Digital \$489\.00\. If you did not make it: lock the card, then dispute; I draft the dispute and you file it\.$/);
  const hh=D.triageCharge({id:'z3',account_id:'cc1',posted_at:TODAY,amount:-60,merchant_raw:'GAMESTOP'},Object.assign({},ctx0,{household:[{name:'Sam',cards:['cc1']}],trials:[{merchant:'GameStop'}]}));assert.ok(hh.steps.some(s=>s.step==='household'&&/Sam also uses this card/.test(s.text)));assert.ok(hh.steps.some(s=>s.step==='trial'));assert.equal(hh.verdict,'likely yours');
});

test('phishing signals are named and scored; a clean email gets "no signals found", never "safe"; the session audit calls out new devices and revokes them',()=>{
  const bad={from:'alerts@chase-secure.top',claims:'Chase',reply_to:'help@mail-recovery.xyz',subject:'URGENT: your account will be suspended within 24 hours',body:'Dear Customer, please verify your password and one-time code at <a href="http://chase-secure.top/login">chase.com</a> immediately.'};
  const p=D.phishing(bad);assert.equal(p.verdict,'phishing');assert.ok(p.score>=9,String(p.score));same(p.signals.map(s=>s.id).sort(),['credential_ask','generic_greeting','link_mismatch','lookalike_domain','reply_to_mismatch','urgency']);
  assert.ok(D.phishing({from:'noreply@mail-blast.xyz',claims:'Chase',subject:'Statement',body:'Dear Customer, see attachment.'}).signals.some(s=>s.id==='sender_domain_mismatch'),'claims one company, sent from another domain');assert.match(p.text,/^Phishing: it asks for a password, code or identity number; no bank or rail does that by email; manufactures urgency/);assert.match(p.text,/I never ask for a code or password, and neither do they\.$/);
  const ok=D.phishing({from:'statements@examplebank.com',claims:'Example Bank',subject:'Your October statement is ready',body:'Hi Vishnu, your statement is available in the app. Sign in the way you usually do.'});assert.equal(ok.verdict,'no signals found');assert.match(ok.text,/That is not a guarantee: go to the site by typing its address/);
  const meh=D.phishing({from:'promo@shop.example',subject:'Final notice: sale ends tonight',body:'Dear customer, act now.'});assert.equal(meh.verdict,'suspicious');
  const sessions=[{id:'s1',device:'iPhone',location:'Austin, TX',started_at:NOW-40*DAY,last_seen_at:NOW-3600000,current:true},{id:'s2',device:'Chrome on Windows',location:'Lisbon, PT',started_at:NOW-2*DAY,last_seen_at:NOW-DAY},{id:'s3',device:'iPad',location:'Austin, TX',started_at:NOW-60*DAY,last_seen_at:NOW-45*DAY}];
  const a=D.sessionAudit(sessions,NOW);assert.equal(a.active.length,2);assert.equal(a.new_this_week.length,1);assert.equal(a.text,'2 active sessions: iPhone in Austin, TX (this one); Chrome on Windows in Lisbon, PT. New this week and not you here: Chrome on Windows in Lisbon, PT. Say revoke and I end it.');
  assert.equal(D.revokeSession(sessions,'s1',NOW).revoked,false);const rv=D.revokeSession(sessions,'s2',NOW);assert.equal(rv.revoked,true);assert.equal(D.sessionAudit(sessions,NOW).active.length,1);
});

test('tax calendar and estimated payments, the donation log with missing acknowledgments, refund tracking in typical windows with the IRS as the source',()=>{
  const cal=D.taxCalendar(TODAY);assert.equal(cal.next.what,'Extended return');assert.equal(cal.next.on,'2026-10-15');assert.ok(!cal.items.some(i=>i.id==='q3'),'estimated dates only for estimated payers');assert.equal(cal.capability_id,'TAX-010');assert.match(cal.caveat,/weekend or holiday moves a date/);
  const est=D.estimatedTax({today:TODAY,expected_tax_cents:1200000,payments:[{on:'2026-04-15',amount_cents:300000},{on:'2026-06-15',amount_cents:300000},{on:'2026-09-15',amount_cents:300000}]});assert.equal(est.quarterly_cents,300000);assert.equal(est.next.what,'Extended return');assert.ok(est.items.some(i=>i.id==='q4'&&i.on==='2027-01-15'&&i.amount_cents===300000));assert.equal(est.remaining_cents,300000);assert.match(est.text,/Paid \$9,000\.00 of about \$12,000\.00 so far\.$/);assert.equal(est.capability_id,'TAX-003');
  const v=D.vault();v.add({kind:'receipt',title:'Red Cross acknowledgment',location:'vault://r1',transaction_id:'d1'},NOW);
  const txns=[{id:'d1',account_id:'chk',posted_at:'2026-03-02',amount:-300,merchant_raw:'AMERICAN RED CROSS'},{id:'d2',account_id:'chk',posted_at:'2026-07-09',amount:-500,merchant_raw:'DOCTORS WITHOUT BORDERS'},{id:'d3',account_id:'chk',posted_at:'2026-08-01',amount:-40,merchant_raw:'LOCAL FOOD BANK'},{id:'d4',account_id:'chk',posted_at:'2025-12-20',amount:-100,merchant_raw:'AMERICAN RED CROSS'}];
  const dl=D.donationLog(txns,['red cross','doctors without borders','food bank'],v,2026);assert.equal(dl.total_cents,84000);assert.equal(dl.rows.length,3);assert.equal(dl.receipts_missing.length,1);assert.equal(dl.receipts_missing[0].transaction_id,'d2');assert.match(dl.text,/^2026: \$840\.00 to 3 organizations across 3 gifts\. 1 gift of \$250 or more has no written acknowledgment in the vault; the IRS wants one for each\.$/);
  const rt=D.refundTracker({filed_on:'2026-09-25',efile:true,refund_cents:142000},TODAY);assert.equal(rt.state,'in_window');assert.equal(rt.expected_by,'2026-10-16');
  assert.equal(D.refundTracker({filed_on:'2026-09-01',efile:true},TODAY).state,'overdue');assert.match(D.refundTracker({filed_on:'2026-09-01',efile:true},TODAY).text,/Check Where's My Refund with your filing status and exact refund amount; a delay usually means a review or a mismatch, not a loss\./);
  assert.match(D.refundTracker({filed_on:'2026-09-25',refund_cents:142000},TODAY,{stage:'sent',on:'2026-10-08'}).text,/^Refund \$1,420\.00 sent on 2026-10-08; allow a few days to post\.$/);assert.equal(D.refundTracker(null,TODAY).state,'not_filed');
});
