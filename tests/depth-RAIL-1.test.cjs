// Rail 1, recipient memory and resolution for every person-to-person money flow (docs/depth/RAIL-1.md): one test per
// sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Pay (AgentSend)
// and split (AgentSplit) are driven through the same recipient book, built from rows shaped like public.saved_recipients.
// The domain is loaded from UPMORE_DOMAIN_DIR when set, which is how the runner substitutes a broken copy.
// Check: node --test tests/depth-RAIL-1.test.cjs && node evals/depth/run.cjs RAIL-1
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const domainDir=process.env.UPMORE_DOMAIN_DIR||path.join(root,'packages/domain');
const ctx=vm.createContext({});
vm.runInContext(['35-agent-intents.js','42-agent-recipients.js','43-agent-loop.js','46-voice.js','47-data-guard.js','48-money-math.js','53-compliance.js','54-agent-money.js','64-agent-send.js','67-agent-cards.js','69-agent-router.js','70-agent-split.js'].map(f=>fs.readFileSync(path.join(domainDir,f),'utf8')).join('\n')+'\nthis.R=AgentRecipients;this.S=AgentSend;this.P=AgentSplit;this.Router=AgentRouter;this.Comp=Compliance;this.M=AgentMoney;',ctx);
const {R,S,P,Router,Comp,M}=ctx;
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
const registry=Registry.load(JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8')),rel=>fs.existsSync(path.join(root,rel)));
const T0=Date.UTC(2026,9,12,14,0,0);
// Rows exactly as public.saved_recipients returns them to the RLS-scoped client.
const ROWS=[
  {id:'r1',handle:'@sarah_m',display_name:'Sarah M',channel:'sms',source:'completed_send',rail:'venmo',last_used_at:'2026-10-01T00:00:00Z'},
  {id:'r2',handle:'@marcus',display_name:'Marcus L',channel:'sms',source:'completed_send',rail:'venmo',last_used_at:'2026-09-20T00:00:00Z'},
  {id:'r3',handle:'$mtee',display_name:'Marcus T',channel:'imessage',source:'confirmed',rail:'cash_app',last_used_at:null},
];
const nw=async()=>{throw new Error('NOT_WIRED: no partner rail');};
function world(opts){
  const o=opts||{};const t={now:T0};
  const book=R.book({rows:o.rows||ROWS,clock:()=>t.now,channel:'sms',unavailable:!!o.unavailable});
  const common={registry,connectors:{read:nw,write:nw,verify:nw},recipients:book,clock:()=>t.now,partners:{},compliance:Comp,limits:{per_day_cents:100000,per_week_cents:300000},large_cents:50000};
  return {t,book,send:S.create(common),split:P.create(common)};
}
const confirmations=s=>s.loop.snapshot().log.filter(e=>e.to==='AWAITING_CONFIRMATION');

test('[S01] an exact handle resolves first; a handle-shaped query is only ever a handle; a bare word is a name first',async()=>{
  const {send}=world();
  const a=await send.start('send $40 to @marcus');assert.equal(a.outcome,'confirm');assert.equal(a.send.recipient.name,'Marcus L');await send.reply('no');
  const b=await send.start('send $40 to marcus');assert.equal(b.outcome,'ask','a bare "marcus" is a first name shared by two people, even though one handle is @marcus');assert.equal(b.text,'Which Marcus: Marcus L or Marcus T?');
  const r=R.resolve('@sarah_m',[{name:'Sarah M',handle:'@sarah-m',rails:['venmo'],saved:true}]);assert.notEqual(r.status,'saved','"@sarah_m" never matches the name "Sarah M" once the punctuation is gone');
  assert.equal(R.resolve('$mtee',R.fromRows(ROWS)).person.name,'Marcus T');
});

test('[S02] a full name resolves before a first name',async()=>{
  const rows=ROWS.concat([{id:'r4',handle:'@samk',display_name:'Sam K',source:'completed_send',rail:'venmo'},{id:'r5',handle:'@sam',display_name:'Sam',source:'completed_send',rail:'venmo'}]);
  const {send}=world({rows});
  const a=await send.start('send $40 to sam');assert.equal(a.outcome,'confirm');assert.equal(a.send.recipient.handle,'@sam','the saved "Sam" is an exact full name; "Sam K" only shares the first name');await send.reply('no');
  const b=await send.start('send $40 to Marcus T');assert.equal(b.outcome,'confirm');assert.equal(b.send.recipient.handle,'$mtee');
  assert.equal(R.resolve('marcus t',R.fromRows(ROWS)).matched_by,'full_name');
});

test('[S03] a unique first name resolves straight to the card',async()=>{
  const {send}=world();
  const a=await send.start('venmo sarah 40 for pizza');assert.equal(a.outcome,'confirm');assert.equal(a.send.recipient.handle,'@sarah_m');
  assert.match(a.text,/^Set up \$40\.00 to Sarah M \(@sarah_m\) in Venmo/);
  assert.equal(R.resolve('sarah',R.fromRows(ROWS)).matched_by,'first_name');
});

test('[S04] two matches ask "Which Marcus: Marcus L or Marcus T?" and stage nothing; the answer continues to the card',async()=>{
  const {send}=world();
  const a=await send.start('send $40 to Marcus');assert.equal(a.outcome,'ask');assert.equal(a.reason,'ambiguous');assert.equal(a.text,'Which Marcus: Marcus L or Marcus T?');
  assert.equal(send.pending,null,'no card');assert.equal(confirmations(send).length,0,'the loop was never asked to confirm anything');
  assert.equal(send.accepts('T'),true);const b=await send.reply('T');assert.equal(b.outcome,'confirm');assert.equal(b.send.recipient.name,'Marcus T');assert.match(b.text,/\$40\.00 to Marcus T \(\$mtee\) in Cash App/);
  const three=R.resolve('marcus',R.fromRows(ROWS.concat([{handle:'@mw',display_name:'Marcus W',source:'confirmed',rail:'venmo'}])));assert.equal(three.ask,'Which Marcus: Marcus L, Marcus T or Marcus W?');
});

test('[S05] a handle one edit from a saved one is named, never resolved; NEW starts the stranger path',async()=>{
  const {send}=world();
  const a=await send.start('venmo @sarah-m $40');assert.equal(a.outcome,'ask');assert.equal(a.reason,'lookalike');
  assert.equal(a.text,'@sarah-m is not on file, but it is one character away from Sarah M (@sarah_m). Did you mean Sarah M? If this is someone new, say NEW and I\'ll confirm them in full.');
  assert.equal(send.pending,null);assert.equal(confirmations(send).length,0);
  const b=await send.reply('new');assert.equal(b.outcome,'ask');assert.match(b.text,/^New recipient: Venmo @sarah-m\. .*type the handle back exactly/);
  const two=R.resolve('@saraxm',R.fromRows(ROWS));assert.equal(two.status,'lookalike');assert.equal(two.distance,2);
  const yes=await (async()=>{const w=world();await w.send.start('venmo @sarah-m $40');return w.send.reply('yes');})();assert.equal(yes.outcome,'confirm','YES means the saved Sarah M, shown with her real handle');assert.match(yes.text,/Sarah M \(@sarah_m\)/);
});

test('[S06] a name one letter from a saved name is asked about, not guessed and not called a stranger',async()=>{
  const {send}=world();
  const a=await send.start('send $40 to sarha');assert.equal(a.outcome,'ask');assert.equal(a.reason,'lookalike');assert.match(a.text,/^I don't have Sarha on file, but Sarah M \(@sarah_m\) is one letter away\. Did you mean Sarah M\?/);
  assert.equal(send.pending,null);
  const b=await send.reply('yes');assert.equal(b.outcome,'confirm');assert.equal(b.send.recipient.name,'Sarah M');
});

test('[S07] a saved recipient goes straight to the card under PAY-001, even with no payment history on the row',async()=>{
  const {send}=world();
  const a=await send.start('send $40 to Marcus T');assert.equal(a.outcome,'confirm');assert.equal(a.send.first_time,false);assert.doesNotMatch(a.text,/New recipient/);
  assert.equal(confirmations(send)[0].input.capability_id,'PAY-001');
  assert.equal(R.fromRows(ROWS).find(p=>p.name==='Marcus T').saved,true);
});

test('[S08] a stranger is asked for the app and handle, and nothing is staged',async()=>{
  const {send}=world();
  const a=await send.start('send $25 to dana');assert.equal(a.outcome,'ask');assert.equal(a.reason,'new_recipient');assert.equal(a.new_recipient,true);
  assert.equal(a.text,'I don\'t have Dana on file. Reply with Dana\'s Venmo, Cash App, PayPal or Zelle (like "venmo @dana"). New recipients are confirmed in full, every time.');
  assert.equal(send.pending,null);assert.equal(confirmations(send).length,0);
  const b=await send.reply('@dana-k');assert.equal(b.text,'Which app is @dana-k on: Venmo, Cash App or PayPal?','an @handle could be Venmo, Cash App or PayPal; never assumed');
  const c=await send.reply('venmo');assert.match(c.text,/^New recipient: Dana, Venmo @dana-k\./);assert.equal(confirmations(send).length,0);
  const v=world();const d=await v.send.start('venmo dana 25');assert.equal(d.text,'I don\'t have Dana on file. Reply with Dana\'s Venmo handle. New recipients are confirmed in full, every time.');
});

test('[S09] the handle must be typed back exactly; two mismatches stop; ten minutes expire it; never mind stops it',async()=>{
  const {send,t}=world();
  await send.start('venmo dana 25');await send.reply('@dana-k');
  const m1=await send.reply('@dana_k');assert.equal(m1.text,'That doesn\'t match @dana-k. Type the handle exactly as it appears in Venmo, or say never mind.');
  const ok=await send.reply('@DANA-K');assert.equal(ok.outcome,'confirm','case does not matter; punctuation does');
  const w=world();await w.send.start('venmo dana 25');await w.send.reply('@dana-k');await w.send.reply('@dana_k');
  const m2=await w.send.reply('@danak');assert.equal(m2.outcome,'declined');assert.match(m2.text,/^That doesn't match @dana-k again, so I stopped\. Nothing was set up\./);assert.equal(confirmations(w.send).length,0);
  const x=world();await x.send.start('venmo dana 25');await x.send.reply('@dana-k');x.t.now+=11*60000;
  const late=await x.send.reply('@dana-k');assert.equal(late.outcome,'expired');assert.equal(confirmations(x.send).length,0);
  const y=world();await y.send.start('venmo dana 25');const nm=await y.send.reply('never mind');assert.equal(nm.text,'Okay. Nothing was set up.');assert.equal((await y.send.reply('@dana-k')).outcome,'nothing_pending');
});

test('[S10] the stranger\'s card is the full first-send card under PAY-002, and yes stages a handoff for the person to send',async()=>{
  const {send,book}=world();
  await send.start('venmo dana 25 for tickets');await send.reply('@dana-k');
  const card=await send.reply('@dana-k');assert.equal(card.outcome,'confirm');
  assert.match(card.text,/^New recipient, first send: set up \$25\.00 to Dana \(@dana-k\) in Venmo/);assert.match(card.text,/Can't be undone once received\./);
  assert.equal(confirmations(send)[0].input.capability_id,'PAY-002');assert.equal(card.send.tier,'T5');
  const y=await send.reply('yes');assert.equal(y.outcome,'staged');assert.match(y.text,/^Staged\. In Venmo:/);assert.match(y.text,/Reply SAVE to keep Dana for next time; otherwise I'll save them once the money lands\.$/);
  assert.equal(book.outbox.length,0,'staging saves nobody');
});

test('[S11] a recipient is saved only after the send completes: the debit posting saves a stranger; a saved person is only touched',async()=>{
  const {send,book,t}=world();
  await send.start('venmo dana 25');await send.reply('@dana-k');await send.reply('@dana-k');await send.reply('yes');
  assert.equal(book.drain().length,0,'staged is not sent');
  t.now+=3600000;
  const l=send.landed([{id:'tx-77',amount:-25,posted_at:'2026-10-12',merchant_raw:'VENMO *DANA K'}]);assert.equal(l.length,1);assert.equal(l[0].saved,'insert');
  const rows=book.drain();assert.equal(rows.length,1);assert.equal(rows[0].source,'completed_send');assert.equal(rows[0].evidence_ref,'txn:tx-77');assert.equal(rows[0].handle,'@dana-k');assert.equal(rows[0].rail,'venmo');assert.equal(rows[0].channel,'sms');
  const again=await send.start('venmo dana 30');assert.equal(again.outcome,'confirm','next time Dana goes straight to the card');assert.doesNotMatch(again.text,/New recipient/);
  const w=world();await w.send.start('venmo sarah 40');await w.send.reply('yes');w.send.landed([{id:'tx-9',amount:-40,posted_at:'2026-10-12',merchant_raw:'VENMO SARAH M'}]);
  const touch=w.book.drain();assert.equal(touch.length,1);assert.equal(touch[0].op,'touch');assert.equal(touch[0].last_used_at,new Date(T0).toISOString());
});

test('[S12] an explicit SAVE after the read-back saves as confirmed; a mention, a received payment or a save without the read-back saves nobody',async()=>{
  const {send,book}=world();
  await send.start('venmo dana 25');await send.reply('@dana-k');await send.reply('@dana-k');await send.reply('yes');
  assert.equal(send.accepts('SAVE'),true);const s=await send.reply('SAVE');assert.equal(s.outcome,'saved');assert.equal(s.text,'Saved Dana (Venmo @dana-k). Next time a send to them goes straight to the card.');
  const rows=book.drain();assert.equal(rows.length,1);assert.equal(rows[0].source,'confirmed');assert.match(rows[0].evidence_ref,/^readback:idn-/);
  assert.equal(book.save({name:'Eve',handle:'@eve',rail:'venmo'},{kind:'confirmed',approved:true}).ok,false,'approved without the handle typed back is not a confirmed save');
  assert.equal(book.save({name:'Eve',handle:'@eve',rail:'venmo'},{kind:'mention'}).ok,false);
  assert.equal(book.save({name:'Eve',handle:'@eve',rail:'venmo'},{kind:'completed_send',transaction_id:'t1'}).ok,false,'a transaction id with no posting is not a completed send');
  const w=world();const m=await w.send.start('my friend dana is @dana-k btw');assert.notEqual(m.outcome,'saved');assert.equal(w.book.outbox.length,0);
  assert.equal(w.send.accepts('SAVE'),false,'SAVE with nobody confirmed is not a save');
  await w.split.start('split $60 with sarah');await w.split.reply('yes');w.split.paid([{id:'c1',amount:30,posted_at:'2026-10-12',merchant_raw:'VENMO FROM SARAH M'}]);assert.equal(w.book.outbox.length,0,'money received saves nobody');
});

test('[S13] split resolves every name through the same layer: the same question, the same look-alike, the same stranger path, exact shares',async()=>{
  const {split,send,book}=world();
  const a=await split.start('split $90 dinner with marcus and sarah');assert.equal(a.outcome,'ask');assert.equal(a.text,'Which Marcus: Marcus L or Marcus T?');assert.equal(split.pending,null);
  const b=await split.reply('Marcus L');assert.equal(b.outcome,'confirm');assert.match(b.text,/^Request \$30\.00 each from Marcus L \(@marcus\) and Sarah M \(@sarah_m\) in Venmo for dinner: \$90\.00 split 3 ways, yours \$30\.00\./);
  const la=await split.start('split $40 with @sarah-m');assert.equal(la.reason,'lookalike');assert.match(la.text,/^@sarah-m is not on file, but it is one character away from Sarah M \(@sarah_m\)/);
  const st=await split.start('split $100 with sarah and dana');assert.equal(st.reason,'new_recipient');assert.equal(st.text,(await send.start('send $25 to dana')).text,'the stranger path is word for word the same in both flows');
  await split.reply('venmo @dana-k');const c=await split.reply('@dana-k');assert.equal(c.outcome,'confirm');assert.match(c.text,/Request \$33\.33 each from Sarah M \(@sarah_m\) and Dana \(@dana-k, new\) in Venmo: \$100\.00 split 3 ways, yours \$33\.34/);
  // A person saved through pay resolves by name in split: one book.
  const w=world();await w.send.start('venmo dana 25');await w.send.reply('@dana-k');await w.send.reply('@dana-k');await w.send.reply('yes');await w.send.reply('SAVE');
  const d=await w.split.start('split $50 with dana');assert.equal(d.outcome,'confirm');assert.match(d.text,/\$25\.00 each from Dana \(@dana-k\) in Venmo/);
});

test('[S14] when saved recipients cannot be read, pay and split say so and call nobody a stranger',async()=>{
  const {send,split}=world({unavailable:true});
  const a=await send.start('send $40 to sarah');assert.equal(a.outcome,'unavailable');assert.equal(a.text,'I can\'t read your saved recipients right now, so I can\'t pay or request from anyone yet. Nothing was changed.');
  const b=await split.start('split $90 with sarah');assert.equal(b.outcome,'unavailable');assert.equal(b.text,a.text);
  assert.equal(confirmations(send).length+confirmations(split).length,0);
});

test('[S15] rows become people, one per display name with a handle per app; the card shows the handle on the app the money goes by',async()=>{
  const rows=ROWS.concat([{id:'s1',handle:'@sam-k',display_name:'Sam',source:'completed_send',rail:'venmo',last_used_at:'2026-09-01T00:00:00Z'},{id:'s2',handle:'sam@example.com',display_name:'Sam',source:'confirmed',rail:'zelle',last_used_at:'2026-10-05T00:00:00Z'}]);
  const people=R.fromRows(rows);assert.equal(people.filter(p=>p.name==='Sam').length,1,'Sam on Venmo and Sam on Zelle is one Sam');
  const {send}=world({rows});
  const z=await send.start('zelle sam $40');assert.equal(z.outcome,'confirm');assert.match(z.text,/\$40\.00 to Sam \(sam@example\.com\) in Zelle/);await send.reply('no');
  const v=await send.start('send sam $40');assert.equal(v.outcome,'confirm');assert.equal(v.send.rail.id,'venmo');assert.match(v.text,/\$40\.00 to Sam \(@sam-k\) in Venmo/,'the most recent row is Zelle, but the money goes by Venmo, so the card shows the Venmo handle');
  const {book}=world();assert.equal(book.save({name:'Card',handle:'4111111111111111',rail:'zelle'},{kind:'confirmed',approved:true,readback:true,confirmation_id:'c'}).reason,'identity_digits');
});

test('[S16] follow-up replies go to the flow that asked, through the router, with zero model calls',async()=>{
  const {send,split}=world();let calls=0;const extract=async()=>{calls++;return {intent:'other'};};
  const sessions={send,split};
  const a=await Router.handle('venmo dana 25',{extract:async()=>({intent:'send_money',amount_span:'25',amount_cents:2500,recipient_span:'dana'}),sessions});assert.equal(a.result.reason,'new_recipient');
  const b=await Router.handle('@dana-k',{extract,sessions});assert.equal(b.flow,'send');assert.equal(b.source,'deterministic');assert.match(b.result.text,/^New recipient: Dana, Venmo @dana-k/);
  const c=await Router.handle('@dana-k',{extract,sessions});assert.equal(c.result.outcome,'confirm');
  const d=await Router.handle('yes',{extract,sessions});assert.equal(d.result.outcome,'staged');
  const e=await Router.handle('save',{extract,sessions});assert.equal(e.result.outcome,'saved');
  const f=await Router.handle('split $90 with marcus and sarah',{extract:async()=>({intent:'split_expense',amount_span:'$90',amount_cents:9000,recipient_span:'marcus and sarah'}),sessions});assert.equal(f.flow,'split');assert.equal(f.result.text,'Which Marcus: Marcus L or Marcus T?');
  const g=await Router.handle('marcus t',{extract,sessions});assert.equal(g.flow,'split');assert.equal(g.result.outcome,'confirm');
  assert.equal(calls,0,'no follow-up reached the model');
});

test('[ADV] the adversarial log in docs/depth/RAIL-1.md, every row',async()=>{
  const {send,book}=world();
  assert.equal((await send.start('send $40 to marcus')).text,'Which Marcus: Marcus L or Marcus T?');
  assert.equal((await send.start('send $40 to @sarah-m')).reason,'lookalike');
  assert.notEqual(R.resolve('@sarah_m',[{name:'Sarah M',handle:'@sarah-m',rails:['venmo'],saved:true}]).status,'saved');
  await send.start('my friend dana is @dana-k btw');assert.equal(book.outbox.length,0);
  const w=world();await w.send.start('venmo dana 25');await w.send.reply('@dana-k');await w.send.reply('@dana_k');assert.equal((await w.send.reply('@dana_k')).outcome,'declined');assert.equal(confirmations(w.send).length,0);
  const y=world();await y.send.start('venmo dana 25');await y.send.reply('@dana-k');const yy=await y.send.reply('yes');assert.equal(yy.outcome,'ask');assert.equal(confirmations(y.send).length,0,'"yes" is not the handle');
  const z=world();await z.send.start('venmo dana 25');await z.send.reply('@dana-k');await z.send.reply('@dana-k');await z.send.reply('yes');assert.equal(z.book.outbox.length,0,'staged is not sent');
  assert.equal(world().send.accepts('SAVE'),false);
  assert.equal(book.save({name:'X',handle:'4111111111111111',rail:'zelle'},{kind:'completed_send',transaction_id:'t',posted:'2026-10-12'}).ok,false);
  const d=world();const dup=await d.split.start('split $60 with sarah and @sarah_m');assert.equal(dup.outcome,'ask');assert.match(dup.text,/same person twice/);
});
