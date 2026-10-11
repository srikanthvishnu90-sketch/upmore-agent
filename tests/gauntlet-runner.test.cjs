// The live gauntlet's grader, checked against a canned local server: it passes a correct card, fails a wrong route, a
// missing amount, a clarifying question, a third SMS segment and a reply with no route metadata, and it answers every
// card "no". This tests the grader only; the score itself comes only from the live handler.
// Check: node --test tests/gauntlet-runner.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const corpus=JSON.parse(fs.readFileSync(path.join(root,'evals/gauntlet/sloppy-20.json'),'utf8'));

test('the corpus holds 20 sloppy texts, each with a flow and the card facts that prove it was understood',()=>{
  assert.equal(corpus.items.length,20);assert.equal(new Set(corpus.items.map(i=>i.text)).size,20);
  for(const i of corpus.items){assert.ok(['trade','cancel','send'].includes(i.flow),i.id);assert.ok(i.card_contains.length>=2,i.id);}
  assert.match(corpus.runs_against,/LIVE agent-chat handler only/);
});

test('the grader passes only a right-flow, first-message card with the right facts in two segments, and says no to every card',async()=>{
  const nos=[];
  const server=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{const m=JSON.parse(b);if(m.message==='no'){nos.push(m.thread_id);res.end(JSON.stringify({thread_id:m.thread_id,reply:'Okay.'}));return;}
    const i=corpus.items.find(x=>x.text===m.message),n=Number(i.id.slice(1));let reply=`${i.card_contains.join(' ')}. No fee. Reply YES or NO within 10 min, or DETAILS.`,route={flow:i.flow,understood:true,understood_first:true,outcome:'confirm'};
    if(n===2)route={flow:'send',understood:true,understood_first:true,outcome:'confirm'};
    if(n===3)reply='Did you mean VOO, Vanguard S&P 500 ETF?',route={flow:'trade',understood:true,understood_first:false,ask_reason:'symbol_suggest',outcome:'ask'};
    if(n===7)reply="I can't place orders yet: that needs a broker-dealer partner.",route={flow:'trade',understood:true,understood_first:true,outcome:'blocked'};
    if(n===4)reply='Buy VOO. No fee. Reply YES or NO within 10 min, or DETAILS.';
    if(n===5)reply=i.card_contains.join(' ')+' '+'x'.repeat(320);
    if(n===6)route=undefined;
    res.setHeader('content-type','application/json');res.end(JSON.stringify({thread_id:'t'+n,reply,route}));});});
  await new Promise(r=>server.listen(0,r));const port=server.address().port;
  const label='grader-selftest';const out=await new Promise(res=>{const p=spawn(process.execPath,[path.join(root,'evals/gauntlet/run-live.cjs'),'--label',label],{env:Object.assign({},process.env,{UPMORE_CHAT_URL:`http://127.0.0.1:${port}/agent-chat`,UPMORE_TEST_JWT:'test'})});let s='';p.stdout.on('data',d=>s+=d);p.on('close',code=>res({code,s}));});
  server.close();const file=path.join(root,'evals/gauntlet/results',label+'.json');const r=JSON.parse(fs.readFileSync(file,'utf8'));fs.unlinkSync(file);
  assert.equal(r.carded,14);assert.equal(r.understood,17,'understood counts a blocked but understood buy, not a wrong route, a question about the words, or a missing route');assert.equal(r.meets_bar,false);assert.equal(out.code,1);
  assert.equal(r.rows.find(x=>x.id==='G07').understood,true);assert.equal(r.rows.find(x=>x.id==='G07').pass,false,'understood is not carded');
  assert.match(r.rows.find(x=>x.id==='G03').understood_reasons.join(),/asked about the person's words \(symbol_suggest\)/);
  const f=id=>r.rows.find(x=>x.id===id);
  assert.match(f('G02').reasons.join(),/routed to send, expected trade/);assert.match(f('G03').reasons.join(),/not understood on the first message/);
  assert.match(f('G04').reasons.join(),/card lacks "\$500\.00"/);assert.match(f('G05').reasons.join(),/SMS segments/);assert.match(f('G06').reasons.join(),/no route metadata/);
  assert.equal(nos.length,20,'every card is answered no, so nothing executes');
});
