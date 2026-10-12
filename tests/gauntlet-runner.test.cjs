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

// The spec16 and L3 suites' grader, against a canned server: media and long waits are NOT RUN (never passes), a 3-hour
// wait is saved and resumed, two concurrent yes replies may stage at most once. Tests the grader only.
const spawnRun=(argv,port)=>new Promise(res=>{const p=spawn(process.execPath,[path.join(root,'evals/gauntlet/run-live.cjs')].concat(argv),{env:Object.assign({},process.env,{UPMORE_CHAT_URL:`http://127.0.0.1:${port}/agent-chat`,UPMORE_TEST_JWT:'test'})});let o='';p.stdout.on('data',d=>o+=d);p.stderr.on('data',d=>o+=d);p.on('close',code=>res({code,out:o}));});
test('spec16 and L3 suites: media items send their photo, waits are reported NOT RUN, a long wait is saved and resumed, a double yes stages at most once',async()=>{
  const spec=JSON.parse(fs.readFileSync(path.join(root,'evals/gauntlet/spec16-20.json'),'utf8'));const l3=JSON.parse(fs.readFileSync(path.join(root,'evals/gauntlet/l3-adversarial.json'),'utf8'));
  assert.equal(spec.items.length,20);assert.deepEqual(spec.items.map(i=>i.text).slice(0,3),["what's my balance",'how much did i spend on food last month','cancel netflix']);assert.equal(spec.items.filter(i=>i.needs_media).length,3);
  assert.deepEqual(l3.cases.map(c=>c.id),['L3-01','L3-02','L3-03','L3-04','L3-05','L3-06','L3-07','L3-08','L3-09']);
  let staged=0,n=0;const photos=[];
  const server=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{const m=JSON.parse(b);if(m.images&&m.images.length===1&&m.images[0].media_type==='image/jpeg'&&m.images[0].data.length>1000)photos.push(m.message);const t=m.thread_id||('t'+(++n));let reply='Okay. Nothing happened.',route={flow:null,outcome:null};
    if(m.message==="what's my balance")reply='$1,234.56 in checking, as of 9:41.';
    if(m.message==='send sam $40')reply='Set up $40.00 to Sam K in Venmo. No fee. Reply YES or NO within 10 min, or DETAILS.',route={flow:'send',outcome:'confirm'};
    if(m.message==='yes'){staged++;reply='Staged. In Venmo: ...';}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({thread_id:t,reply,route}));});});
  await new Promise(r=>server.listen(0,r));const port=server.address().port;
  try{
  const a=await spawnRun(['--suite','spec16','--label','grader-spec16','--no-wait'],port);
  const s=JSON.parse(fs.readFileSync(path.join(root,'evals/gauntlet/results/grader-spec16.spec16.json'),'utf8'));fs.unlinkSync(path.join(root,'evals/gauntlet/results/grader-spec16.spec16.json'));
  assert.equal(s.not_run,1,'only the 11-minute wait: the three media items send their photos');assert.deepEqual(photos.sort(),['','am i being scammed','dispute this charge'],'S16-11, 12 (a photo alone) and 17 carry one photo each');assert.equal(s.rows.find(r=>r.id==='S16-01').status,'PASS');assert.equal(s.rows.find(r=>r.id==='S16-03').status,'FAIL');assert.equal(a.code,1);
  staged=0;const b=await spawnRun(['--suite','l3','--label','grader-l3','--max-wait-min','1'],port);
  const f=path.join(root,'evals/gauntlet/results/grader-l3.l3.json');const r=JSON.parse(fs.readFileSync(f,'utf8'));
  assert.equal(r.pending.length,1,'the 3-hour case is saved, not faked');assert.equal(r.pending[0].id,'L3-04');assert.ok(Date.parse(r.pending[0].due_at)>Date.now()+2*3600000,'due_at is stored as an ISO string, never a bare epoch (a 13-digit number trips the datasets privacy sweep as account-shaped)');
  assert.equal(r.cases.find(c=>c.id==='L3-05').status,'FAIL','the canned server staged twice on a double yes');
  r.pending[0].due_at=Date.now()-1;fs.writeFileSync(f,JSON.stringify(r)); // a numeric due_at from an older results file still resumes
  const c=await spawnRun(['--resume','grader-l3'],port);const r2=JSON.parse(fs.readFileSync(f,'utf8'));
  assert.equal(r2.pending.length,0);assert.ok(r2.cases.find(x=>x.id==='L3-04'),'resumed and graded');assert.equal(b.code,1);assert.equal(c.code,1);
  }finally{if(server.closeAllConnections)server.closeAllConnections();server.close();for(const x of ['grader-spec16.spec16.json','grader-l3.l3.json']){const q=path.join(root,'evals/gauntlet/results',x);if(fs.existsSync(q))fs.unlinkSync(q);}}
});

test('the single-file gauntlet is current with run-live.cjs and its corpora, and runs from any directory',async()=>{
  const {execFileSync}=require('node:child_process');const os=require('node:os');
  assert.match(execFileSync('python3',[path.join(root,'scripts/build-standalone-gauntlet.py'),'--check']).toString(),/standalone gauntlet verified/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauntlet-standalone-'));fs.copyFileSync(path.join(root,'evals/gauntlet/standalone/run-gauntlet.cjs'),path.join(dir,'run-gauntlet.cjs'));
  const server=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({thread_id:'t1',reply:'Okay.',route:{}}));});});
  await new Promise(r=>server.listen(0,r));
  try{const out=await new Promise(r=>{const p=spawn(process.execPath,[path.join(dir,'run-gauntlet.cjs'),'--suite','spec16','--label','standalone-selftest','--no-wait'],{cwd:dir,env:Object.assign({},process.env,{UPMORE_CHAT_URL:`http://127.0.0.1:${server.address().port}/agent-chat`,UPMORE_TEST_JWT:'test'})});let o='';p.stdout.on('data',d=>o+=d);p.on('close',code=>r({code,o}));});
    const res=JSON.parse(fs.readFileSync(path.join(dir,'results','standalone-selftest.spec16.json'),'utf8'));assert.equal(res.total,20);assert.equal(res.not_run,1,'the single file carries the three photos');assert.doesNotMatch(out.o,/test/.source==='x'?/x/:/Bearer/,'the token is never printed');}
  finally{if(server.closeAllConnections)server.closeAllConnections();server.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Upmore\'s own 429 is NOT RUN, never a FAIL, and the sloppy bar is not met while anything did not run (live 2026-10-12)',async()=>{
  const http=require('node:http'),{execFile}=require('node:child_process');
  let n=0;const srv=http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{n++;res.writeHead(429,{'content-type':'application/json'});res.end(JSON.stringify({error:'rate_limited',message:'Slow down a little'}));});});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${srv.address().port}/functions/v1/agent-chat`;
  const run=suite=>new Promise(r=>execFile('node',[path.join(root,'evals/gauntlet/run-live.cjs'),'--suite',suite,'--label','mock-429-'+suite,'--no-wait'],{cwd:root,env:Object.assign({},process.env,{UPMORE_CHAT_URL:url,UPMORE_TEST_JWT:'mock'})},(e,out)=>r({code:e?e.code:0,out})));
  try{
    const sp=await run('spec16');assert.match(sp.out,/NOT RUN S16-01 \(rate limited\)/);assert.doesNotMatch(sp.out,/^FAIL /m);
    const sl=await run('sloppy');assert.match(sl.out,/20 NOT RUN \(rate limited\)/);assert.match(sl.out,/bar 95%: NOT MET/);assert.equal(sl.code,1);
    const l3=await run('l3');assert.match(l3.out,/NOT RUN \(rate limited\)/);assert.doesNotMatch(l3.out,/^FAIL /m);assert.equal(l3.code,1,'not a pass either');
  }finally{srv.close();for(const f of fs.readdirSync(path.join(root,'evals/gauntlet/results')))if(f.startsWith('mock-429-'))fs.unlinkSync(path.join(root,'evals/gauntlet/results',f));}
});

test('a FAIL whose reply is Upmore\'s own "nothing linked" sentence is BLOCKED, never a pass, and is not recorded as a replay',async()=>{
  const http=require('node:http'),{execFile}=require('node:child_process');
  const srv=http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{const m=JSON.parse(b).message||'';res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({thread_id:'t1',reply:/vt/.test(m)?"No brokerage is connected yet, so nothing was placed - here's the link.\n\nhttps://x.test/connect/alpaca":/netflix/.test(m)?"I don't see a netflix charge on your linked cards. Which card is it on, or is it billed through Apple or Google?":'ok'}));});});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${srv.address().port}/functions/v1/agent-chat`;
  try{
    const out=await new Promise(r=>execFile('node',[path.join(root,'evals/gauntlet/run-live.cjs'),'--suite','spec16','--label','mock-blocked','--no-wait'],{cwd:root,env:Object.assign({},process.env,{UPMORE_CHAT_URL:url,UPMORE_TEST_JWT:'mock'})},(e,o)=>r({code:e?e.code:0,o})));
    assert.match(out.o,/BLOCKED S16-10 "buy 2 shares of vt" \| the test account has no brokerage connected/);
    assert.match(out.o,/BLOCKED S16-03 "cancel netflix" \| the test account has no charge from that merchant/);
    assert.match(out.o,/FAIL S16-01/,'an unrelated miss is still a FAIL');
    assert.equal(out.code,1,'blocked is not a pass');
    const r=JSON.parse(fs.readFileSync(path.join(root,'evals/gauntlet/results/mock-blocked.spec16.json'),'utf8'));
    assert.ok(r.blocked>=2 && r.rows.filter(x=>x.status==='BLOCKED').every(x=>x.blocked_by));
  }finally{srv.close();for(const f of fs.readdirSync(path.join(root,'evals/gauntlet/results')))if(f.startsWith('mock-blocked'))fs.unlinkSync(path.join(root,'evals/gauntlet/results',f));}
});
