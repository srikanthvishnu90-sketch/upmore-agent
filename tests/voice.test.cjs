const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['35-agent-intents.js','46-voice.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.V=AgentVoice;',ctx);
const V=ctx.V;
const goldDir=path.join(root,'evals/voice/gold');
const gold=fs.readdirSync(goldDir).filter(f=>f.endsWith('.md')).sort().map(f=>{
  const md=fs.readFileSync(path.join(goldDir,f),'utf8');const m=/```json\n([\s\S]+?)\n```/.exec(md);assert.ok(m,f+' has a json fixture');return JSON.parse(m[1]);
});
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
// Values built inside the vm sandbox have foreign prototypes, so compare by JSON.
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const registry=Registry.load(JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8')),rel=>fs.existsSync(path.join(root,rel)));

test('every gold conversation agent turn is reproduced exactly by the composer from the same inputs',()=>{
  assert.equal(gold.length,12);
  let turns=0;
  for(const g of gold)for(const t of g.turns){
    if(!t.agent)continue;turns++;
    const out=V.compose(t.agent.kind,t.agent.fields,t.agent.ctx);
    same(out.bubbles,t.expected,`${g.id}: ${t.agent.kind}`);
    for(const b of out.bubbles)assert.ok(b.length<=220,`${g.id}: bubble too long`);
    same(V.lint(out.bubbles.join(' '),{severity:t.agent.ctx&&t.agent.ctx.severity}),[],`${g.id} lint clean`);
  }
  assert.equal(turns,15);
});

test('the 15 anti-patterns are caught by lint and never produced by compose',()=>{
  const bad=[
    ['filler','Great question! Your balance is $4,212.08 as of 2:14 pm, per Chase.'],
    ['filler',"I'd be happy to help with that transfer."],
    ['filler','Let me know if you need anything else.'],
    ['filler','I have processed your request to send money.'],
    ['hedging_stack','It might be possible that the fee could be refunded.'],
    ['hedging_stack','I think maybe the rent is due the 1st.'],
    ['moralizing',"You really shouldn't spend that much on dining."],
    ['moralizing','That is irresponsible with your savings.'],
    ['unsolicited_advice','You should consider investing the extra cash in index funds.'],
    ['unsolicited_advice',"I'd recommend you buy more of that stock."],
    ['approximate_money','You have about four thousand in checking.'],
    ['approximate_money','Ballpark, the fee is thirty-five.'],
    ['emoji_spam','Sent! 🎉💸🚀'],
    ['wrong_gravity','lol your card got hit for $900.00 at 3 am, no biggie'],
    ['filler','Certainly! Absolutely! Here is your balance.'],
  ];
  assert.equal(bad.length,15);
  for(const [rule,text] of bad){
    const f=V.lint(text,{severity:'high'});
    assert.ok(f.some(x=>x.rule===rule),`${rule}: ${text} -> ${JSON.stringify(f)}`);
    assert.throws(()=>V.compose('answer',{text},{severity:'high'}),/Voice refused/,`compose must refuse: ${text}`);
  }
  same(V.lint('Checking is $4,212.08 as of 2:14 pm, per Chase.',{severity:'high'}),[]);
});

test('lint catches overlong answers, repeating the question, ungrounded money and capability overclaims',()=>{
  const q='how much do i have';
  assert.equal(V.lint('How much do I have?',{question:q})[0].rule,'repeats_question');
  const long='Your balance is fine. '.repeat(30)+'Really. It is. Yes.';
  assert.ok(V.lint(long,{question:q}).some(f=>f.rule==='overlong_answer'));
  assert.equal(V.lint('You have $4,212.08.',{requires_source:true})[0].rule,'ungrounded_money');
  assert.throws(()=>V.compose('answer',{text:'You have $4,212.08.'}),/ungrounded_money/);
  assert.equal(V.lint('I can send that by Zelle now.',{registry,claims:['PAY-012']})[0].rule,'capability_overclaim');
  assert.equal(V.lint('I can find duplicate charges.',{registry,claims:['TXN-009']}).length,0);
  assert.equal(V.lint('I can file your taxes.',{registry,claims:['TAX-999']})[0].rule,'capability_overclaim');
  assert.throws(()=>V.compose('answer',{text:'I can send that by Zelle now.',claims:['PAY-012']},{registry}),/capability_overclaim/);
});

test('money is exact, answers need source and as-of, limits only describe unbacked capabilities',()=>{
  assert.equal(V.money(421208),'$4,212.08');assert.equal(V.money(5),'$0.05');assert.equal(V.money(-150000),'-$1,500.00');assert.equal(V.money(100000000),'$1,000,000.00');
  assert.throws(()=>V.money(12.5),/exact integer/);
  assert.throws(()=>V.compose('answer',{subject:'Checking',amount_cents:1}),/compose needs as_of/);
  assert.throws(()=>V.compose('confirm',{action:'Send',amount_cents:100,recipient:'x'}),/compose needs timing/);
  assert.throws(()=>V.compose('proactive',{finding:'x.',offer:'y?'}),/compose needs reason/);
  assert.throws(()=>V.compose('limit',{capability:{name:'read balance',status:'TESTED'}}),/only for capabilities the registry does not back/);
  assert.match(V.compose('limit',{capability:{name:'Zelle',status:'NOT_WIRED'}}).bubbles[0],/the rail is not connected yet/);
  assert.match(V.compose('limit',{capability:{name:'card lock',status:'CLAIMED'}}).bubbles[0],/not built yet/);
  assert.throws(()=>V.compose('smalltalk',{text:'x'.repeat(81)}),/stays short/);
  assert.throws(()=>V.compose('party',{}),/Unknown message kind/);
});

test('register mirrors formality, and long content splits into bubbles with the takeaway first',()=>{
  assert.equal(V.register('send sarah the 85'),'casual');assert.equal(V.register('Please send Sarah $85.'),'precise');
  assert.equal(V.compose('confirm',{context:'Rent is $1,850.00 due the 1st.',restate:'Paying early means today.'},{register:'casual'}).bubbles[0],'Rent is $1,850.00 due the 1st. Paying early means today. ok?');
  const long=Array.from({length:6},(_,i)=>`Point ${i+1} is a complete sentence about your spending that runs on a bit.`).join(' ');
  const out=V.compose('answer',{text:long,document:'full analysis'});
  assert.ok(out.bubbles.length>=2);for(const b of out.bubbles)assert.ok(b.length<=220);
  assert.equal(out.bubbles.join(' '),long);assert.equal(out.meta.document,'full analysis');
});

test('classification maps every inbound message to one response type',()=>{
  const c=(t,x)=>V.classify(t,x).type;
  assert.equal(c('how much do i have in checking'),'question');
  assert.equal(c("what's my 401k balance"),'question');
  assert.equal(c('cancel my netflix subscription for me'),'action');
  assert.equal(c('pay my rent'),'action');
  assert.equal(c('send 40 to marcus'),'action');
  assert.equal(c('send money'),'ambiguous_money');
  assert.equal(c('no, marcus lee not marcus chen'),'correction');
  assert.equal(c('why the hell did chase charge me 35 again'),'venting');
  assert.equal(c('thanks!'),'smalltalk');assert.equal(c(''),'smalltalk');
  same(V.classify('yes',{pending_confirmation:true}),{type:'confirmation',approved:true});
  same(V.classify('actually no',{pending_confirmation:true}),{type:'confirmation',approved:false});
  assert.equal(c('yes'),'question','a bare yes with nothing pending is not a confirmation');
  assert.equal(V.classify('cancel my netflix subscription for me').intent.target,'netflix');
});

test('trust ladder: three clean confirmations of one shape earn an offer; corrections and surprises drop it; trust is per capability',()=>{
  const L=V.ladder({});
  L.record('PAY-006','electric','clean_confirmation');L.record('PAY-006','electric','clean_confirmation');
  assert.equal(L.offerText('PAY-006','electric',10000),null);
  const third=L.record('PAY-006','electric','clean_confirmation');
  assert.equal(third.offer,true);assert.match(L.offerText('PAY-006','electric',10000),/under \$100\.00 from now on, with a receipt each time/);
  assert.equal(L.offerText('INV-011','aapl',10000),null,'trust does not transfer to another capability');
  assert.equal(L.autonomous('PAY-006','electric'),false);
  assert.throws(()=>L.record('PAY-006','water','envelope_granted'),/only after it was offered/);
  L.record('PAY-006','electric','envelope_granted');assert.equal(L.autonomous('PAY-006','electric'),true);
  const after=L.record('PAY-006','electric','surprise');
  assert.equal(after.granted,false);assert.equal(after.clean,0);assert.equal(after.demotions,1);assert.equal(L.autonomous('PAY-006','electric'),false);
  const L2=V.ladder(JSON.parse(JSON.stringify(L.state)));
  assert.equal(L2.record('PAY-006','electric','clean_confirmation').clean,1,'state round-trips through JSON');
  assert.throws(()=>L.record('PAY-006','electric','party'),/Unknown ladder event/);
});
