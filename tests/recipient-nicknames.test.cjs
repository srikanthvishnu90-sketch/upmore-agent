// Saved nicknames for recipients (response-style corpus 1.06, "sned mom 100 rn"): resolution, setting one, and the card.
// Pure domain logic over MOCK rows shaped like public.saved_recipients (migration 20261012020000 adds the nickname column);
// no database, no rail, no network. The edge wiring is tested in tests/edge/flow-router.test.ts.
// Check: node --test tests/recipient-nicknames.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({setTimeout,clearTimeout});
vm.runInContext(['35-agent-intents.js','42-agent-recipients.js','43-agent-loop.js','46-voice.js','47-data-guard.js','48-money-math.js','53-compliance.js','54-agent-money.js','64-agent-send.js','67-agent-cards.js','69-agent-router.js','70-agent-split.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.R=AgentRecipients;this.S=AgentSend;this.P=AgentSplit;this.Router=AgentRouter;this.Comp=Compliance;',ctx);
const {R,S,P,Router,Comp}=ctx;
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
const registry=Registry.load(JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8')),rel=>fs.existsSync(path.join(root,rel)));
const T0=Date.UTC(2026,9,12,14,0,0),MIN=60000;
// MOCK rows (test fixtures, not anyone's data): Anita is saved with the nickname "mom".
const MOCK_ROWS=[
  {id:'mock-r1',handle:'@anitas',display_name:'Anita Srikanth',channel:'sms',source:'completed_send',rail:'venmo',last_used_at:'2026-10-01T00:00:00Z',nickname:'mom'},
  {id:'mock-r2',handle:'@mikereyes',display_name:'Mike Reyes',channel:'sms',source:'completed_send',rail:'venmo',last_used_at:'2026-09-30T00:00:00Z',nickname:null},
  {id:'mock-r3',handle:'@tomhale',display_name:'Tom Hale',channel:'sms',source:'completed_send',rail:'venmo',last_used_at:'2026-09-29T00:00:00Z'},
  {id:'mock-r4',handle:'@samokafor',display_name:'Sam Okafor',channel:'sms',source:'completed_send',rail:'venmo',last_used_at:'2026-09-28T00:00:00Z'},
];
const nw=async()=>{throw new Error('NOT_WIRED: no partner rail');};
function world(rows){
  const t={now:T0};
  const book=R.book({rows:rows||MOCK_ROWS,clock:()=>t.now,channel:'sms'});
  const common={registry,connectors:{read:nw,write:nw,verify:nw},recipients:book,clock:()=>t.now,partners:{},compliance:Comp,limits:{per_day_cents:100000,per_week_cents:300000},large_cents:50000};
  const nick=R.nicknames({book,clock:()=>t.now});
  return {t,book,nick,send:S.create(common),split:P.create(common)};
}
const route=(w,text)=>Router.handle(text,{extract:null,sessions:{send:w.send,split:w.split,nickname:w.nick},parsers:{send:x=>S.parse(x),split:x=>P.parse(x)},now:()=>w.t.now});

test('a saved nickname resolves exactly, and the card shows the real name with it',async()=>{
  const w=world();
  const r=w.book.resolve('mom');assert.equal(r.status,'saved');assert.equal(r.matched_by,'nickname');assert.equal(r.person.name,'Anita Srikanth');
  assert.equal(w.book.resolve('Mom').person.name,'Anita Srikanth','case does not matter');
  assert.equal(w.book.resolve('my mom').person.name,'Anita Srikanth','"my mom" is the same word');
  const out=await route(w,'sned mom 100 rn');
  assert.equal(out.result.outcome,'confirm');
  assert.match(out.result.text,/\$100\.00 to Anita Srikanth \(mom, @anitas\)/);
  assert.equal(R.display(r.person),'Anita Srikanth (mom, @anitas)');
  assert.equal(R.display({name:'Anita Srikanth',nickname:'mom'}),'Anita Srikanth (mom)');
  const y=await route(w,'ya');assert.equal(y.result.outcome,'staged','"ya" is a clear yes (corpus 1.06)');
});

test('never fuzzy: a near-miss of a nickname is not that person, and a family word is never offered as a look-alike name',async()=>{
  const w=world();
  for(const q of ['mum','moom','mo','mommy','momm']){const r=w.book.resolve(q);assert.notEqual(r.status,'saved',`"${q}" is not "mom"`);assert.ok(!(r.suspect&&r.suspect.name==='Anita Srikanth'),`"${q}" is never offered as Anita`);}
  // Without a saved nickname, "mom" is a relationship, not a misspelled "Tom" (the existing rule stands).
  const bare=world(MOCK_ROWS.map(r=>Object.assign({},r,{nickname:null})));
  const r=bare.book.resolve('mom');assert.equal(r.status,'stranger');
  const out=await bare.send.start('send mom 40');assert.equal(out.outcome,'ask');assert.doesNotMatch(out.text,/Tom|Anita/);
  assert.equal(bare.book.drain().length,0,'nothing is saved by asking');
});

test('a nickname that is also someone else\'s name asks which, never picks',()=>{
  const rows=MOCK_ROWS.concat([{id:'mock-r5',handle:'@jesstran',display_name:'Jess Tran',channel:'sms',source:'completed_send',rail:'venmo',last_used_at:null,nickname:'sam'}]);
  const r=world(rows).book.resolve('sam');
  assert.equal(r.status,'ambiguous');assert.match(r.ask,/Jess Tran/);assert.match(r.ask,/Sam Okafor/);
});

test('split resolves the nickname too, and its card names the real person',async()=>{
  const w=world();
  const out=await w.split.start('split 60 with mom and mike');
  assert.equal(out.outcome,'confirm');assert.match(out.text,/Anita Srikanth \(mom, @anitas\) and Mike Reyes \(@mikereyes\)/);
});

test('setting one: the message is restated, nothing is written before the yes, and the yes writes exactly one row',async()=>{
  const w=world();
  const a=await route(w,'mom is Mike Reyes');
  assert.equal(a.flow,'nickname');assert.equal(a.result.outcome,'confirm_nickname');
  assert.equal(a.result.text,'Save "mom" as your name for Mike Reyes (@mikereyes)? Then "send mom 20" goes to Mike Reyes. "mom" means Anita Srikanth now; this moves it. Reply YES to save it or NO.');
  assert.equal(w.book.drain().length,0,'nothing is saved before the yes');
  assert.equal(w.book.resolve('mom').person.name,'Anita Srikanth','the old meaning holds until the yes');
  const y=await route(w,'yes');
  assert.equal(y.result.outcome,'nickname_saved');assert.equal(y.result.text,'Saved: "mom" is Mike Reyes (mom, @mikereyes).');
  const rows=w.book.drain();assert.equal(rows.length,1);assert.deepEqual(JSON.parse(JSON.stringify(rows[0])),{op:'nickname',row_id:'mock-r2',nickname:'mom',clear_row_ids:['mock-r1'],display_name:'Mike Reyes'});
  assert.equal(w.book.resolve('mom').person.name,'Mike Reyes');
  const card=await route(w,'send mom 20');assert.match(card.result.text,/Mike Reyes \(mom, @mikereyes\)/);
});

test('the explicit shapes: "save X as Y", "X is my Y", "my Y is X"; a second nickname replaces the first',async()=>{
  for(const [msg,nick] of [['save mike as dad','dad'],['remember Mike Reyes as my bro','bro'],['mike is my dad','dad'],['my dad is mike reyes','dad'],['Dad is Mike Reyes','dad']]){
    const w=world();const a=await route(w,msg);
    assert.equal(a.result.outcome,'confirm_nickname',msg);assert.equal(a.result.nickname,nick,msg);assert.equal(a.result.person,'Mike Reyes',msg);
  }
  const w=world();const a=await route(w,'save anita as ma');assert.match(a.result.text,/It replaces "mom"\./);
  await route(w,'yes');const row=w.book.drain()[0];assert.equal(row.nickname,'ma');assert.equal(row.row_id,'mock-r1');
  assert.equal(w.book.resolve('mom').status,'stranger','the replaced nickname no longer resolves');
  const same=await route(world(),'anita is my mom');assert.equal(same.result.outcome,'already_done');
});

test('a nickname is a word: digits, card numbers, handles, emails, phones and reply words are refused, nothing saved',async()=>{
  for(const bad of ['4111','4111111111111111','dad2','@dad','$dad','big_bro','dad.k','dad@example.com','312-555-0147','d','abcdefghijklmnopqrstuvwxy','yes','new','save','me']){
    assert.ok(R.nicknameError(bad),`"${bad}" is refused`);
    const w=world();const a=await route(w,`save mike as ${bad}`);
    if(a.flow==='nickname'){assert.notEqual(a.result.outcome,'confirm_nickname',bad);assert.match(a.result.text,/Nothing was saved\./,bad);}
    assert.equal(w.book.drain().length,0,bad);
  }
  for(const ok of ['mom','big sis','nana','ma\'am']) assert.equal(R.nicknameError(ok),null,ok);
  const clash=await route(world(),'save mike as tom');assert.equal(clash.result.reason,'name_clash','another person\'s name is not a nickname');
});

test('only for someone already saved: a stranger or a look-alike name is not given a nickname, and the flow does not guess',async()=>{
  const w=world();
  const s=await route(w,'save zed as bro');assert.equal(s.result.outcome,'refuse');assert.match(s.result.text,/I don't have Zed saved, so I didn't save "bro"/);
  const l=await route(w,'save mikee as bro');assert.equal(l.result.outcome,'ask');assert.match(l.result.text,/Did you mean Mike Reyes\?/);assert.equal(w.nick.pending,null,'a look-alike never stages a nickname');
  const amb=await route(world(MOCK_ROWS.concat([{id:'mock-r6',handle:'@samokoro',display_name:'Sam Okoro',source:'completed_send',rail:'venmo'}])),'save sam as bro');assert.match(amb.result.text,/^Which Sam/);
  assert.equal(w.book.drain().length,0);
  const book=R.book({people:[{id:null,name:'Dir Person',handle:'@dir',rails:['venmo']}]});
  assert.equal(book.setNickname(book.people[0],'pal',{approved:true}).reason,'not_saved','a directory entry that was never saved gets no nickname');
  assert.equal(w.book.setNickname(w.book.people[1],'pal',null).reason,'not_approved','no yes, no nickname');
});

test('never inferred: ordinary talk falls through, a no or an expiry saves nothing, and a send never adds a nickname by itself',async()=>{
  const w=world();
  for(const msg of ['mom is sick','my wife is at work','who is mom?','mom is in town']){
    const out=await Router.handle(msg,{extract:async()=>({intent:'other'}),sessions:{send:w.send,split:w.split,nickname:w.nick},parsers:{send:x=>S.parse(x),split:x=>P.parse(x)},now:()=>w.t.now});
    assert.equal(out.route,'fallthrough',msg);
  }
  assert.equal(Router.maybeFlow('mom is Anita Srikanth'),true);assert.equal(Router.maybeFlow('save anita as mom'),true);assert.equal(Router.maybeFlow('the weather is nice'),false);
  await route(w,'save mike as dad');const n=await route(w,'no');assert.equal(n.result.outcome,'declined');assert.match(n.result.text,/didn't save "dad"/);
  await route(w,'save mike as dad');w.t.now+=11*MIN;const e=await route(w,'yes');assert.equal(e.result.outcome,'expired');
  assert.equal(w.book.drain().length,0);
  // A send to a saved person that lands saves (touches) the row, never a nickname.
  assert.equal(w.book.save({name:'Mike Reyes',handle:'@mikereyes',rail:'venmo',nickname:'dad'},{kind:'completed_send',reference:'ref-1',outcome:'sent'}).reason,'nickname_needs_confirmation');
});

test('confirmed in the same flow: a family word for a new recipient is offered with SAVE, restated, and kept only on SAVE',async()=>{
  const w=world(MOCK_ROWS.map(r=>Object.assign({},r,{nickname:null})));
  const a=await w.send.start('send my mom 40');assert.equal(a.outcome,'ask');
  const b=await w.send.reply('venmo @lena-park');assert.equal(b.outcome,'ask');
  const c=await w.send.reply('@lena-park');assert.equal(c.outcome,'confirm');
  const y=await w.send.reply('yes');assert.equal(y.outcome,'staged');assert.match(y.text,/Reply SAVE to keep @lena-park as "mom" for next time;/);
  assert.equal(w.book.drain().length,0,'staged is not saved');
  const s=await w.send.reply('SAVE');assert.equal(s.outcome,'saved');assert.match(s.text,/as "mom"\. Next time a send to "mom" goes straight to the card\./);
  const rows=w.book.drain();assert.equal(rows.length,1);assert.equal(rows[0].op,'insert');assert.equal(rows[0].nickname,'mom');assert.equal(rows[0].source,'confirmed');
  assert.equal(w.book.resolve('mom').person.handle,'@lena-park');
  // The same send without SAVE: the money landing saves the person, not the word.
  const w2=world(MOCK_ROWS.map(r=>Object.assign({},r,{nickname:null})));
  await w2.send.start('send my mom 40');await w2.send.reply('venmo @lena-park');await w2.send.reply('@lena-park');await w2.send.reply('yes');
  w2.t.now+=60*MIN;w2.send.landed([{id:'tx-1',amount:-40,posted_at:'2026-10-12',merchant_raw:'VENMO @lena-park'}]);
  assert.ok(w2.book.drain().every(r=>!r.nickname),'a landed send never carries a nickname');
});

test('rows: a nickname the rules refuse (a hand-edited row) is ignored, never matched',()=>{
  const people=R.fromRows([{id:'mock-x',handle:'@x1',display_name:'X One',source:'completed_send',rail:'venmo',nickname:'Mom1'}]);
  assert.equal(people[0].nickname,null);assert.equal(R.resolve('mom1',people).status,'stranger');
});
