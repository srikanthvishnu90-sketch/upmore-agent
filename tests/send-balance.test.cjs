// Balance-aware sends (response-style corpus 1.05; packages/domain/64-agent-send.js fundsCheck and the session's balance
// question). Every bank row below is a MOCK agent_financial_accounts row (mock: true), built here; nothing reads a real
// account. What is proven: a send above the cash the person has is said before any card, with the number, the account,
// its source and as-of time, and nothing is staged until the person answers; a money move between accounts is refused;
// an unknown, stale or unreadable balance says nothing at all.
// Check: node --test tests/send-balance.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['35-agent-intents.js','42-agent-recipients.js','43-agent-loop.js','46-voice.js','47-data-guard.js','48-money-math.js','54-agent-money.js','64-agent-send.js','67-agent-cards.js','69-agent-router.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.S=AgentSend;this.R=AgentRouter;',ctx);
const S=ctx.S,R=ctx.R;
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
const registry=Registry.load(JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8')),rel=>fs.existsSync(path.join(root,rel)));
const T0=Date.UTC(2026,9,14,19,14,0);
const people=[{id:'p1',name:'Jordan Lee',handle:'@jlee',rails:['venmo'],history:[{amount_cents:4000,on:'2026-09-01'}]},{id:'p2',name:'Dana Kim',handle:'@danak',rails:['zelle'],history:[{amount_cents:2000,on:'2026-09-03'}]}];
// A MOCK bank row, read 4 minutes before T0 unless the test says otherwise.
const row=(o)=>Object.assign({mock:true,account_id:'chk-4417',name:'Checking ••4417',institution:null,currency:'USD',account_kind:'checking',balance_cents:61218,available_cents:61218,balance_as_of:new Date(T0-4*60000).toISOString(),fetched_at:new Date(T0-4*60000).toISOString(),sync_error:false,status:'active'},o||{});
const savings=row({account_id:'sav-9921',name:'Savings ••9921',account_kind:'savings',balance_cents:340000,available_cents:340000});
function session(rows,extra){
  const writes=[];const t={now:T0};
  const conn={read:async()=>({value:1,source:'x',as_of:T0}),write:async(id,p,key)=>{writes.push({key,params:p});return {reference:'w'};},verify:async()=>({status:'confirmed'})};
  const s=S.create(Object.assign({people,registry,connectors:conn,partners:{},clock:()=>t.now,limits:{per_day_cents:1000000,per_week_cents:3000000},large_cents:50000,balances:typeof rows==='function'?rows:()=>rows},extra||{}));
  return {s,writes,t};
}

test('a send above checking says so before any card: the number, the account, its source and as-of time; nothing is staged',async()=>{
  const {s,writes}=session([row(),savings]);
  const a=await s.start('send 900 to jordan');
  assert.equal(a.outcome,'ask');assert.equal(a.reason,'funds_short');
  assert.equal(a.text,"Checking ••4417 has $612.18 available (from your linked account, as of Oct 14, 7:10 PM UTC), less than $900.00. If Venmo pays from it, $900.00 to Jordan Lee won't go through; Venmo can also pay from your Venmo balance or a card I can't see. Set up $900.00 anyway, $612.18, or a different amount?");
  assert.equal(s.pending,null,'no card is live');assert.equal(writes.length,0);assert.equal(s.awaiting_input,true);
  assert.equal(s.loop.log.filter(e=>e.to==='AWAITING_CONFIRMATION').length,0,'the loop never opened a confirmation');
  // Upmore can't move money between accounts, so the question never offers it (corpus 1.05 does; the rule wins).
  assert.doesNotMatch(a.text,/\bmove\b|\btransfer\b|savings ••9921/i);
  assert.equal(a.funds.short_cents,28782);assert.equal(a.funds.as_of,T0-4*60000);
});

test('the answers: anyway stages the full amount on a card, a typed amount or "what\'s there" stages that, no drops it, less asks how much',async()=>{
  for(const yes of ['yes','send it anyway','go ahead','$900']){const {s}=session([row()]);await s.start('send 900 to jordan');assert.ok(s.accepts(yes),yes);const c=await s.reply(yes);assert.equal(c.outcome,'confirm',yes);assert.equal(c.send.amount_cents,90000,yes);assert.match(c.text,/\$900\.00 to Jordan Lee \(@jlee\)/);}
  {const {s}=session([row()]);await s.start('send 900 to jordan');const c=await s.reply('send 612.18');assert.equal(c.outcome,'confirm');assert.equal(c.send.amount_cents,61218);}
  {const {s}=session([row()]);await s.start('send 900 to jordan');const c=await s.reply("send what's there");assert.equal(c.outcome,'confirm');assert.equal(c.send.amount_cents,61218);}
  {const {s,writes}=session([row()]);await s.start('send 900 to jordan');const n=await s.reply('no');assert.equal(n.outcome,'declined');assert.equal(n.text,'Okay, nothing was sent.');assert.equal(s.awaiting_input,false);assert.equal(s.pending,null);assert.equal(writes.length,0);}
  {const {s}=session([row()]);await s.start('send 900 to jordan');const q=await s.reply('send less');assert.equal(q.text,'How much?');const c=await s.reply('500');assert.equal(c.outcome,'confirm');assert.equal(c.send.amount_cents,50000);}
  // A new amount still above the balance is checked again, never waved through.
  {const {s}=session([row()]);await s.start('send 900 to jordan');const again=await s.reply('800');assert.equal(again.outcome,'ask');assert.equal(again.reason,'funds_short');assert.match(again.text,/less than \$800\.00/);}
});

test('"move it from savings" is refused in plain words, nothing moves, and the question stays open',async()=>{
  const {s,writes}=session([row(),savings]);
  await s.start('send 900 to jordan');
  for(const m of ['move it from savings','transfer 287.82 from savings first','use my savings']){
    const r=await s.reply(m);assert.equal(r.outcome,'not_built',m);assert.equal(r.reason,'money_move');
    assert.equal(r.text,'I can\'t move money between your accounts, so nothing was moved or sent. If you move it yourself in your bank\'s app, say "send it" and I\'ll set up $900.00 to Jordan Lee, or tell me a smaller amount.');
    assert.equal(s.pending,null);assert.equal(s.awaiting_input,true);
  }
  const c=await s.reply('send it');assert.equal(c.outcome,'confirm');assert.equal(c.send.amount_cents,90000);assert.equal(writes.length,0,'a handoff writes nothing');
  const st=await s.reply('yes');assert.equal(st.outcome,'staged');assert.match(st.text,/^Staged, not sent\./);
});

test('unknown is never a guess: no checking, no number, stale, undated, failed sync, foreign, disconnected or an unreadable read all go straight to the card',async()=>{
  const H=3600000;
  const cases={
    'no rows':[],
    'savings only':[savings],
    'no number':[row({balance_cents:null,available_cents:null})],
    'more than a day old':[row({balance_as_of:new Date(T0-25*H).toISOString(),fetched_at:new Date(T0-25*H).toISOString()})],
    'no time on it':[row({balance_as_of:null,fetched_at:null})],
    'dated in the future':[row({balance_as_of:new Date(T0+H).toISOString()})],
    'failed sync':[row({sync_error:true})],
    'not dollars':[row({currency:'EUR'})],
    'disconnected':[row({status:'disconnected'})],
    // One of two checking accounts unknown: it could be the one with the money.
    'one checking stale':[row(),row({account_id:'chk-2',name:'Checking ••0002',balance_as_of:new Date(T0-30*H).toISOString()})],
  };
  for(const [k,rows] of Object.entries(cases)){const {s}=session(rows);const a=await s.start('send 900 to jordan');assert.equal(a.outcome,'confirm',k);}
  {const {s}=session(()=>{throw new Error('accounts unavailable');});assert.equal((await s.start('send 900 to jordan')).outcome,'confirm','a failed read');}
  {const {s}=session(async()=>null);assert.equal((await s.start('send 900 to jordan')).outcome,'confirm','an unreadable table');}
  {const {s}=session(undefined,{balances:undefined});assert.equal((await s.start('send 900 to jordan')).outcome,'confirm','no reader at all');}
  // At or under the balance, no word about it.
  for(const amt of ['612.18','40']){const {s}=session([row()]);assert.equal((await s.start(`send ${amt} to jordan`)).outcome,'confirm',amt);}
});

test('fundsCheck: available beats balance, the fullest checking decides, the person\'s own type counts, the named account is checked',()=>{
  const now=T0;
  assert.equal(S.fundsCheck([row({available_cents:50000,balance_cents:70000})],60000,now).available_cents,50000,'available, not the ledger balance');
  const bal=S.fundsCheck([row({available_cents:null,balance_cents:50000})],60000,now);assert.equal(bal.available,false);assert.equal(bal.available_cents,50000);
  assert.equal(S.fundsCheck([row(),row({account_id:'chk-2',name:'Checking ••0002',available_cents:100000,balance_cents:100000})],90000,now),null,'the second checking account covers it');
  const two=S.fundsCheck([row(),row({account_id:'chk-2',name:'Checking ••0002',available_cents:70000,balance_cents:70000})],90000,now);assert.equal(two.account,'Checking ••0002');assert.equal(two.accounts,2);
  assert.equal(S.fundsCheck([row({account_kind:'unknown',name:'Everyday Checking'})],90000,now).account,'Everyday Checking','an untyped row named checking');
  assert.equal(S.fundsCheck([row({account_kind:'other'})],90000,now),null,'a row the person typed as other is not cash');
  assert.equal(S.fundsCheck([row({institution:'Chase',name:'Total Checking'})],90000,now).source,'from your linked Chase account');
  assert.equal(S.fundsCheck([row(),savings],90000,now,{funding:'savings'}),null,'from savings: the savings balance covers it');
  assert.equal(S.fundsCheck([row(),savings],400000,now,{funding:'savings'}).account,'Savings ••9921');
  assert.equal(S.fundsCheck([row({available_cents:-1500,balance_cents:-1500})],1000,now).available_cents,-1500,'an overdrawn account');
});

test('Zelle is said as Zelle; a zero or negative balance offers no $0.00 send',async()=>{
  const {s}=session([row({available_cents:0,balance_cents:0})]);
  const a=await s.start('send 50 to dana');
  assert.equal(a.outcome,'ask');
  assert.equal(a.text,"Checking ••4417 has $0.00 available (from your linked account, as of Oct 14, 7:10 PM UTC), less than $50.00. Zelle pays from the bank account you enrolled, so if that's this one, $50.00 to Dana Kim won't go through. Set up $50.00 anyway, or a different amount?");
  const z=await s.reply("what's there");assert.equal(z.outcome,'ask');assert.match(z.text,/nothing available/);
});

test('the question survives a restart (snapshot), and a new request replaces it',async()=>{
  const {s}=session([row()]);await s.start('send 900 to jordan');
  const snap=s.snapshot();assert.equal(snap.funds_check.amount_cents,90000);
  const {s:s2}=session([row()],{state:snap});assert.equal(s2.awaiting_input,true);
  const c=await s2.reply('yes');assert.equal(c.outcome,'confirm');assert.equal(c.send.amount_cents,90000);
  const {s:s3}=session([row()]);await s3.start('send 900 to jordan');const n=await s3.start('send 20 to jordan');assert.equal(n.outcome,'confirm');assert.equal(s3.snapshot().funds_check,null);
});

test('through the router: the answer goes to the send flow, never the model, and "never mind" drops it',async()=>{
  const mk=()=>{const {s}=session([row(),savings]);return {sessions:{send:s},parsers:{send:t=>S.parse(t)},memo:{},now:()=>T0,extract:async()=>{throw new Error('model must not be called');}};};
  const c=mk();
  const a=await R.handle('send 900 to jordan',c);assert.equal(a.result.reason,'funds_short');assert.equal(a.understood_first,true,'a balance question is not a misunderstanding');
  const m=await R.handle('move it from savings',c);assert.equal(m.flow,'send');assert.equal(m.route,'card_reply');assert.equal(m.result.outcome,'not_built');
  const y=await R.handle('yes',c);assert.equal(y.result.outcome,'confirm');
  const d=mk();await R.handle('send 900 to jordan',d);const n=await R.handle('no',d);assert.equal(n.result.outcome,'declined');assert.equal(d.sessions.send.awaiting_input,false);
});
