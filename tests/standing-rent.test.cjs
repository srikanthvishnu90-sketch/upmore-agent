// Monthly rent as a standing flow (packages/domain/81-standing-rent.js; real-world C110; spec 16 item S16-15 "pay my
// rent": a standing flow with a monthly restated confirmation). Owner's automation rule, 2026-10-11: a per-person toggle
// restated in exact terms, every run still asks for a one-line yes, one message turns it off. Upmore STAGES each month's
// rent for the person to send in their own app; it never moves money. Pure: a test clock, MOCK recipient rows, no rail.
// Check: node --test tests/standing-rent.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['48-money-math.js','54-agent-money.js','42-agent-recipients.js','81-standing-rent.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.SR=StandingRent;this.Rec=AgentRecipients;',ctx);
const {SR,Rec}=ctx;
// Values from the vm context have that context's prototypes; compare them as plain data.
const plain=x=>JSON.parse(JSON.stringify(x));
const T0=Date.UTC(2026,9,12,14,0,0),MIN=60000,DAY=86400000;
// MOCK saved recipients (rows of public.saved_recipients): Mike on Zelle, two Sams on Venmo.
const ROWS=[{id:'r1',handle:'mike@example.com',display_name:'Mike',source:'confirmed',rail:'zelle'},{id:'r2',handle:'@sam-k',display_name:'Sam K',source:'completed_send',rail:'venmo'},{id:'r3',handle:'@sam-t',display_name:'Sam T',source:'confirmed',rail:'venmo'}];
const RULE={id:'sp-1',kind:'rent',payee_name:'Mike',payee_handle:'mike@example.com',rail:'zelle',amount_cents:145000,day_of_month:1,funding:'checking',status:'active',created_at:'2026-09-01T12:00:00Z',updated_at:'2026-09-01T12:00:00Z',last_staged_month:null};
function make(o={}){
  const w={now:o.now||T0};const clock=()=>w.now;
  const recipients=Rec.book({rows:o.rows||ROWS,clock});
  const opts=Object.assign({clock,recipients},o.rule===undefined?{}:{rule:o.rule},o.unavailable?{unavailable:true}:{},o.state?{state:o.state}:{});
  w.s=SR.create(opts);w.make=(state,rule)=>SR.create(Object.assign({},opts,{state,rule:rule===undefined?opts.rule:rule}));
  return w;
}
const SETUP_CARD="Set up rent: $1,450.00 to Mike on Zelle, monthly on the 1st, from checking, for you to send each month. Each month I'll put up the card and wait for your yes; one message ('stop rent') turns it off. Reply YES or NO within 10 min.";

test('intent: rent words route to rent; paying a person for rent stays a send; questions are not commands',()=>{
  for(const t of ['pay my rent','pay rent','pls pay the rent','can you pay my rent','pay this month\'s rent','pay my rent to Mike $1,450 on the 1st'])assert.equal(SR.intent(t),'pay',t);
  for(const t of ['stop rent','stop paying rent','cancel my rent','turn off rent payments'])assert.equal(SR.intent(t),'stop',t);
  for(const t of ['rent is 1500 now','my rent went up to $1,600','change my rent to 1500','rent is due on the 5th now'])assert.equal(SR.intent(t),'change',t);
  assert.equal(SR.intent('set up my rent'),'setup');assert.equal(SR.intent('set rent on autopay'),'setup');
  for(const t of ['rent is due and I only have 1900','I can\'t pay rent this month','remind me to pay rent on the 28th','my landlord changed where to send rent'])assert.equal(SR.intent(t),null,`${t}: a worry, a reminder or a payee change is not a rent command`);
  for(const t of ['pay sam 900 for rent','venmo sam 40 for rent','did my rent go through?','how much is my rent','send sam $40','split rent with marcus'])assert.equal(SR.intent(t),null,t);
});

test('terms: who, how much, which day and which app are read from the words, never filled in',()=>{
  const a=SR.parseTerms("Mike $1,450 on the 1st via Zelle");
  assert.deepEqual(plain([a.payee,a.amount_cents,a.day,a.rail]),['Mike',145000,1,'zelle']);
  const b=SR.parseTerms('my landlord Mike Chen 1450 on the first by venmo from savings');
  assert.deepEqual(plain([b.payee,b.amount_cents,b.day,b.rail,b.funding]),['Mike Chen',145000,1,'venmo','savings']);
  assert.equal(SR.parseTerms('Oak Property Mgmt 1450 due the 5th').payee,'Oak Property Mgmt');
  assert.equal(SR.parseTerms('1.5k on the 2nd').amount_cents,150000,'1.5k is $1,500.00; the 2nd is the day, not an amount');
  assert.equal(SR.parseTerms('Dan 2000 on the 3rd by check').rail_not_built,'check');
  const none=SR.parseTerms('pay my rent');assert.deepEqual(plain([none.payee,none.amount_cents,none.day,none.rail]),[null,null,null,null]);
});

test('ask -> card -> YES saves the standing rule (active), in exact terms; nothing is sent',()=>{
  const w=make();
  const ask=w.s.start('pay my rent');
  assert.equal(ask.outcome,'ask');
  assert.equal(ask.text,"Who do you pay rent to, how much, and which day of the month? e.g. 'Mike $1,450 on the 1st via Zelle'");
  assert.ok(w.s.awaiting_input&&w.s.accepts('Mike $1,450 on the 1st via Zelle'),'the answer belongs to the rent flow, not the model');
  const card=w.s.reply('Mike $1,450 on the 1st via Zelle');
  assert.equal(card.outcome,'confirm');assert.equal(card.text,SETUP_CARD);
  assert.deepEqual(plain(w.s.drain()),[],'a card saves nothing');
  const yes=w.s.reply('YES');
  assert.equal(yes.outcome,'rent_set');
  assert.match(yes.text,/^Rent is set up: \$1,450\.00 to Mike on Zelle, monthly on the 1st, from checking\. Nothing was sent\. 3 days before each due date I'll put up that month's card for your yes; nothing is staged without it\. Say 'stop rent' anytime\./);
  const ops=plain(w.s.drain());
  assert.equal(ops.length,1);assert.equal(ops[0].op,'insert');
  assert.deepEqual(JSON.parse(JSON.stringify(ops[0].row)),{kind:'rent',status:'active',payee_name:'Mike',payee_handle:'mike@example.com',rail:'zelle',amount_cents:145000,day_of_month:1,funding:'checking'},'the saved recipient\'s handle on that app comes from the same book the send flow uses');
  assert.equal(w.s.pending,null);
});

test('the opening message never turns stray words into a payee; autopay is restated as a monthly yes; two accounts are asked, never split',()=>{
  const two=make().s.start('pay rent from savings and checking half each');
  assert.equal(two.outcome,'ask');assert.match(two.text,/^Rent comes from one account each month, not two, so nothing was set up\. Which one: checking or savings\?/);
  const early=make().s.start('pay rent early');assert.equal(early.text,"Who do you pay rent to, how much, and which day of the month? e.g. 'Mike $1,450 on the 1st via Zelle'",'"early" is not a payee');
  const auto=make().s.start('set rent on autopay');
  assert.match(auto.text,/^Rent never pays itself here: each month I put up the card, you say yes, and you send it in your app\. Who do you pay rent to/);
  const change=make().s.start('rent is 2,450 now');
  assert.equal(change.text,"You don't have rent set up yet. Got $2,450.00. Tell me who you pay it to and which day of the month for rent, e.g. 'Mike $1,450 on the 1st via Zelle'.");
  assert.match(make({rule:RULE}).s.start('set rent on autopay').text,/^Rent never pays itself here: each month's card waits for your yes\. Rent is already set up: \$1,450\.00 to Mike on Zelle/);
});

test('NO saves nothing; a never mind while asking saves nothing',()=>{
  const w=make();w.s.start('pay my rent');w.s.reply('Mike $1,450 on the 1st via Zelle');
  const no=w.s.reply('no');assert.equal(no.outcome,'declined');assert.equal(no.text,'Okay, nothing was set up.');
  assert.deepEqual(plain(w.s.drain()),[]);
  const v=make();v.s.start('pay my rent');assert.ok(v.s.accepts('never mind'));
  assert.equal(v.s.reply('never mind').text,'Okay, nothing was set up.');assert.deepEqual(plain(v.s.drain()),[]);assert.equal(v.s.awaiting_input,false);
});

test('only what is missing is asked; a payee not saved is named and picked in the app by the person; days past the 28th ask again',()=>{
  const w=make();
  const r1=w.s.start('pay my rent to Dana 1800');
  assert.equal(r1.outcome,'ask');assert.match(r1.text,/^Got Dana, \$1,800\.00\. Tell me which day of the month for rent/);
  const r2=w.s.reply('the 5th');assert.equal(r2.text,'Which app do you pay Dana with: Zelle, Venmo, Cash App or PayPal?');
  const r3=w.s.reply('venmo');assert.equal(r3.outcome,'confirm');
  assert.match(r3.text,/^Dana isn't saved in Upmore, so you'll pick them in Venmo yourself each month\. Set up rent: \$1,800\.00 to Dana on Venmo, monthly on the 5th/);
  const v=make();const late=v.s.start('pay my rent to Mike $1,450 on the 31st via Zelle');
  assert.equal(late.outcome,'ask');assert.match(late.text,/1st to the 28th/);
  assert.equal(v.s.reply('the 1st').text,SETUP_CARD);
  const x=make();const amb=x.s.start('pay my rent to Sam 900 on the 3rd');
  assert.equal(amb.outcome,'ask');assert.match(amb.text,/^Which Sam: Sam K \(@sam-k\) or Sam T \(@sam-t\)\?/,'two saved Sams: asked, never guessed');
  const pick=x.s.reply('Sam T');assert.equal(pick.outcome,'confirm');assert.match(pick.text,/Set up rent: \$900\.00 to Sam T on Venmo, monthly on the 3rd/);
  const y=make();const chk=y.s.start('pay my rent to Mike 1450 on the 1st by check');
  assert.equal(chk.outcome,'ask');assert.match(chk.text,/Paying rent by check from Upmore isn't built, so nothing was set up\. I can stage it each month in Zelle, Venmo, Cash App or PayPal for you to send\./);
});

test('rent on file: "pay my rent" is this month\'s card, restating amount, month and recipient; YES stages it for the person to send; no money moves',()=>{
  const w=make({rule:RULE,now:Date.UTC(2026,9,29,14)});
  const card=w.s.start('pay my rent');
  assert.equal(card.outcome,'confirm');
  assert.equal(card.text,'Rent for November: $1,450.00 to Mike on Zelle, due Nov 1, from checking, for you to send. Reply YES to stage it or NO to skip this month, within 10 min.');
  for(const re of [/[Rr]ent/,/month|monthly/,/Reply YES|Confirm below/])assert.match(card.text,re,'the spec 16 S16-15 checks');
  assert.deepEqual(plain(w.s.drain()),[],'a card stages nothing');
  const st=w.s.reply('yes');
  assert.equal(st.outcome,'staged');
  assert.match(st.text,/^Rent for November: Staged, not sent\. In your bank app: 1\. Open your bank app and go to Zelle; 2\. Choose mike@example\.com; 3\. Enter \$1,450\.00; 4\. Memo: Rent November; 5\. Review and send\./);
  assert.match(st.text,/Upmore didn't move any money; you send it\.$/);
  assert.equal(st.app,'your bank app');assert.equal(st.send.amount_cents,145000);
  assert.deepEqual(plain(w.s.drain()),[{op:'update',id:'sp-1',set:{last_staged_month:'2026-11'}}],'the only write is the month it was staged for');
  const again=w.s.start('pay my rent');
  assert.equal(again.outcome,'already_done');assert.match(again.text,/^November's rent is already staged: \$1,450\.00 to Mike in your bank app\. I didn't stage it again\./);
  // Landed only when the debit posts (the same rule as the send flow).
  assert.deepEqual(plain(w.s.landed([{id:'x1',posted_at:'2026-10-29',amount:-1450,merchant_raw:'ZELLE TO MIKE'}]).map(x=>x.text)),['Rent for November landed: $1,450.00 to Mike, posted 2026-10-29 (from your linked account\'s transactions).']);
});

test('NO on the month card skips that month; nothing is staged or written',()=>{
  const w=make({rule:RULE,now:Date.UTC(2026,9,29,14)});
  w.s.start('pay my rent');
  const no=w.s.reply('no');
  assert.equal(no.outcome,'declined');assert.equal(no.text,"Okay, skipping November's rent card. Nothing was staged or sent. Say 'pay my rent' if you change your mind.");
  assert.deepEqual(plain(w.s.drain()),[]);
});

test('a late month is still that month for a few days, never a month before the rule existed',()=>{
  const r=Object.assign({},RULE,{created_at:'2026-09-01T00:00:00Z'});
  assert.deepEqual(JSON.parse(JSON.stringify(SR.cycle(SR.normRule(r),'2026-10-04'))),{due_on:'2026-10-01',month:'2026-10',days_until:-3,late_days:3});
  assert.equal(SR.cycle(SR.normRule(Object.assign({},r,{created_at:'2026-10-02T00:00:00Z'})),'2026-10-04').month,'2026-11','set up after the 1st: next month');
  assert.equal(SR.cycle(SR.normRule(Object.assign({},r,{last_staged_month:'2026-10'})),'2026-10-04').month,'2026-11','already staged: next month');
  const w=make({rule:r,now:Date.UTC(2026,9,4,14)});
  assert.match(w.s.start('pay my rent').text,/^Rent for October: \$1,450\.00 to Mike on Zelle, was due Oct 1 \(3 days ago\)/);
});

test('stop: one message turns it off, said plainly; with nothing on file there is nothing to stop',()=>{
  const w=make({rule:RULE});
  const off=w.s.start('stop rent');
  assert.equal(off.outcome,'rent_stopped');
  assert.equal(off.text,"Rent is off: no more monthly rent cards for Mike. Nothing was sent, and nothing else changed. Say 'pay my rent' to set it up again.");
  assert.deepEqual(plain(w.s.drain()),[{op:'update',id:'sp-1',set:{status:'stopped'}}]);
  assert.equal(w.s.rule,null);
  const after=w.s.start('pay my rent');assert.equal(after.outcome,'ask','stopped means stopped: a new setup starts from the question');
  const none=make();assert.equal(none.s.start('stop rent').outcome,'nothing_to_stop');assert.deepEqual(plain(none.s.drain()),[]);
  // "stop rent" while a card is up drops the card and turns rent off.
  const c=make({rule:RULE});c.s.start('pay my rent');const off2=c.s.start('stop rent');
  assert.match(off2.text,/^I dropped the open rent card\. Rent is off/);assert.equal(c.s.pending,null);
});

test('changing the amount restates the new terms on a card; nothing changes without a yes',()=>{
  const w=make({rule:RULE});
  const card=w.s.start('rent is 1500 now');
  assert.equal(card.outcome,'confirm');
  assert.equal(card.text,"Change rent (amount $1,450.00 to $1,500.00): $1,500.00 to Mike on Zelle, monthly on the 1st, from checking, for you to send each month. Each month I'll still put up the card and wait for your yes. Reply YES or NO within 10 min.");
  assert.deepEqual(plain(w.s.drain()),[]);
  const no=w.s.reply('no');assert.equal(no.text,'Okay, rent stays as it was. Nothing changed.');assert.deepEqual(plain(w.s.drain()),[]);
  w.s.start('my rent went up to $1,600');
  const yes=w.s.reply('yes');
  assert.equal(yes.outcome,'rent_changed');assert.match(yes.text,/^Rent changed: \$1,600\.00 to Mike on Zelle, monthly on the 1st, from checking\. Nothing was sent;/);
  const ops=plain(w.s.drain());assert.equal(ops.length,1);assert.equal(ops[0].op,'update');assert.equal(ops[0].id,'sp-1');assert.equal(ops[0].set.amount_cents,160000);
  assert.equal(make({rule:RULE}).s.start('rent is 1450 now').outcome,'already_done','the same amount changes nothing');
  // A correction while the setup card is up is a fresh card, never a silent change.
  const v=make();v.s.start('pay my rent');v.s.reply('Mike $1,450 on the 1st via Zelle');
  const fix=v.s.reply('make it 1500');assert.equal(fix.outcome,'confirm');assert.match(fix.text,/^Got it\. Set up rent: \$1,500\.00 to Mike on Zelle/);
});

test('a card expires in 10 minutes: a late yes stages or saves nothing and a fresh card goes up for a fresh yes',()=>{
  const w=make({rule:RULE,now:Date.UTC(2026,9,29,14)});
  w.s.start('pay my rent');
  w.now+=11*MIN;
  const late=w.s.reply('yes');
  assert.equal(late.outcome,'confirm');assert.equal(late.expired,true);
  assert.match(late.text,/^That card expired, so nothing was staged\. Here's a fresh one: Rent for November: \$1,450\.00 to Mike/);
  assert.deepEqual(plain(w.s.drain()),[],'nothing staged on a stale yes');
  const ok=w.s.reply('yes');assert.equal(ok.outcome,'staged','the fresh card takes a fresh yes');
  const v=make();v.s.start('pay my rent');v.s.reply('Mike $1,450 on the 1st via Zelle');v.now+=10*MIN+1;
  const lateSetup=v.s.reply('yes');assert.match(lateSetup.text,/^That card expired, so nothing was set up\. Here's a fresh one: Set up rent:/);assert.deepEqual(plain(v.s.drain()),[]);
});

test('never auto-stages: the scheduler side only says when a month is due to be offered, and the offer is a question',()=>{
  const r=SR.normRule(RULE);
  assert.equal(SR.dueSoon(RULE,'2026-10-27',3),null,'5 days out: not yet');
  const d=SR.dueSoon(RULE,'2026-10-29',3);
  assert.deepEqual(plain([d.month,d.due_on,d.days_until,d.amount_cents,d.payee_name]),['2026-11','2026-11-01',3,145000,'Mike']);
  assert.equal(d.text,"Rent for November is due Nov 1: $1,450.00 to Mike on Zelle, from checking. Want this month's card to send it? Reply YES or NO. Nothing is staged without your yes.");
  assert.equal(SR.dueSoon(Object.assign({},RULE,{last_staged_month:'2026-11'}),'2026-10-30',3),null,'a staged month is not offered again');
  assert.equal(SR.dueSoon(Object.assign({},RULE,{status:'stopped'}),'2026-10-30',3),null,'stopped means no offer');
  // A session left alone for a month, with rent on file and a card never answered, writes nothing and stages nothing.
  const w=make({rule:RULE,now:Date.UTC(2026,9,29,14)});w.s.start('pay my rent');
  for(let i=0;i<40;i++){w.now+=DAY;w.s.landed([]);}
  assert.deepEqual(plain(w.s.drain()),[]);assert.equal(JSON.parse(JSON.stringify(w.s.snapshot())).staged.length,0);
  assert.equal(r.status,'active');
});

test('the session restores from its snapshot (stateless host); an unreadable rent table says so and changes nothing',()=>{
  const w=make();w.s.start('pay my rent');
  const s1=JSON.parse(JSON.stringify(w.s.snapshot()));
  const b=w.make(s1);assert.equal(b.reply('Mike $1,450 on the 1st via Zelle').text,SETUP_CARD);
  const s2=JSON.parse(JSON.stringify(b.snapshot()));
  const c=w.make(s2);assert.equal(c.pending.amount_cents,145000);assert.equal(c.reply('yes').outcome,'rent_set');
  const u=make({unavailable:true});
  assert.equal(u.s.start('pay my rent').text,"I can't read your rent setup right now, so I can't do that yet. Nothing was changed.");
  assert.equal(u.s.start('stop rent').outcome,'unavailable');assert.deepEqual(plain(u.s.drain()),[]);
});

test('a month card answered after the rule changed stops before staging and restates the new terms',()=>{
  const w=make({rule:RULE,now:Date.UTC(2026,9,29,14)});w.s.start('pay my rent');
  const snap=JSON.parse(JSON.stringify(w.s.snapshot()));
  const s2=w.make(snap,Object.assign({},RULE,{amount_cents:150000}));
  const r=s2.reply('yes');
  assert.equal(r.outcome,'confirm');assert.match(r.text,/^Stopped before staging: the amount changed from \$1,450\.00 to \$1,500\.00\. Nothing was staged\. Rent for November: \$1,500\.00/);
  assert.deepEqual(plain(s2.drain()),[]);
  const gone=w.make(snap,null);assert.equal(gone.reply('yes').outcome,'changed','rent turned off since the card went up: nothing staged');assert.deepEqual(plain(gone.drain()),[]);
});
