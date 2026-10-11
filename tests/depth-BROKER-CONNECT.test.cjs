// Brokerage connect (docs/depth/BROKER-CONNECT.md): each person connects THEIR OWN brokerage through OAuth and trades
// LIVE in it, never a shared or paper account (owner decision 2026-10-11). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Nothing here reaches Alpaca. The OAuth endpoints (https://api.alpaca.markets/oauth/token and /v2/account) are a STUBBED
// fetch shaped like Alpaca's OAuth guide; orders go to the MOCK Trading API server (tests/fixtures/alpaca-mock.cjs); the
// database is an in-memory stand-in for the RPCs in 20261011030000 (the RPCs themselves are tested in
// tests/db/brokerage_accounts.test.sql). The production code under test: 74-broker-connect.js (state, exchange, link),
// 73-broker-accounts.js (per-request resolution, providers, prompts), 71-alpaca.js (adapter, cap, 401) and the trade flow.
// The domain is loaded from UPMORE_DOMAIN_DIR when set, which is how the runner substitutes a broken copy.
// Check: node --test tests/depth-BROKER-CONNECT.test.cjs && node evals/depth/run.cjs BROKER-CONNECT
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const domainDir=process.env.UPMORE_DOMAIN_DIR||path.join(root,'packages/domain');
const Mock=require('./fixtures/alpaca-mock.cjs');
const ctx=vm.createContext({fetch,AbortController,setTimeout,clearTimeout,URL,URLSearchParams,btoa,atob,Buffer,TextEncoder,TextDecoder,crypto:globalThis.crypto});
vm.runInContext(['35-agent-intents.js','43-agent-loop.js','45-advice-guard.js','46-voice.js','47-data-guard.js','48-money-math.js','50-agent-invest.js','53-compliance.js','66-agent-trade.js','67-agent-cards.js','71-alpaca.js','76-connect-cards.js','73-broker-accounts.js','74-broker-connect.js'].map(f=>fs.readFileSync(path.join(domainDir,f),'utf8')).join('\n')+'\nthis.T=AgentTrade;this.A=AlpacaTrading;this.C=Compliance;this.B=BrokerAccounts;this.K=BrokerConnect;',ctx);
const {T,A,C,B,K}=ctx;
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
const registry=Registry.load(JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8')),rel=>fs.existsSync(path.join(root,rel)));
const T0=Date.UTC(2026,9,12,14,0,0);
const UA='00000000-0000-0000-0000-0000000000a1',UB='00000000-0000-0000-0000-0000000000b2';
const ENV={ALPACA_OAUTH_CLIENT_ID:'cid-upmore-test',ALPACA_OAUTH_CLIENT_SECRET:'csecret-upmore-test',SUPABASE_URL:'https://mrwngntwmnaqrqhupvlt.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'srk-upmore-test',UPMORE_APP_URL:'https://upmore-topaz.vercel.app'};
const CALLBACK='https://mrwngntwmnaqrqhupvlt.supabase.co/functions/v1/broker-oauth-callback';
const servers=[];after(async()=>{for(const s of servers)await s.close();});

// In-memory stand-in for broker_state_create / broker_state_consume / broker_stage_link / broker_confirm_link /
// broker_token_read, with the same rules as the SQL.
function memDb(){
  const states=new Map(),rows=[],vault=new Map(),pending=new Map(),calls=[];let n=0,k=0;
  const link=a=>{let r=rows.find(x=>x.user_id===a.user_id&&x.provider===a.provider);if(!r){r={id:'row-'+(++n),user_id:a.user_id,provider:a.provider,label:'main',paper:false,created_at:'2026-10-0'+n};rows.push(r);}Object.assign(r,{account_id:a.account_id,account_mask:a.account_mask,status:'active'});vault.set(`${a.user_id}|${r.id}`,a.token);};
  return {states,rows,vault,pending,calls,
    async createState(a){calls.push(['create',a]);states.set(a.nonce_hash,Object.assign({},a,{used:false}));},
    async consumeState(a){calls.push(['consume',a]);const s=states.get(a.nonce_hash);if(!s||s.used||s.user_id!==a.user_id||s.provider!==a.provider||Date.parse(s.expires_at)<T0)return false;s.used=true;return true;},
    async stage(a){calls.push(['stage',a]);if(rows.some(r=>r.provider===a.provider&&r.account_id===a.account_id&&r.user_id!==a.user_id))return {ok:false,conflict:true};const id=`00000000-0000-4000-8000-${String(++k).padStart(12,'0')}`;pending.set(id,Object.assign({},a));return {ok:true,link_id:id};},
    // broker_confirm_link as the signed-in person: one use; anyone but the starter is refused and the link is wiped.
    async confirm(q){calls.push(['confirm',q]);const p=pending.get(q.link_id);pending.delete(q.link_id);if(!p||p.user_id!==q.user_id)return false;link(p);return true;},
    // RLS: a person's read returns their own rows only; the Vault read is keyed by the caller and the row.
    rowsFor:u=>rows.filter(r=>r.user_id===u).map(r=>Object.assign({},r)),
    token:async q=>vault.get(`${q.user_id}|${q.account}`)||null,
  };
}
// Stubbed Alpaca OAuth: the token endpoint and the live account endpoint. Anything else goes to the real fetch (the mock).
const ACCOUNTS={'tok-A':{id:'acct-A',account_number:'611111111',status:'ACTIVE'},'tok-B':{id:'acct-B',account_number:'622222222',status:'ACTIVE'},'tok-closed':{id:'acct-C',account_number:'633333333',status:'ACCOUNT_CLOSED'}};
const CODES={'code-A':'tok-A','code-B':'tok-B','code-paper':'tok-paper-only','code-closed':'tok-closed'};
function oauthFetch(){
  const calls=[];
  const f=async(url,init={})=>{
    const u=String(url);
    if(u==='https://api.alpaca.markets/oauth/token'){calls.push({url:u,method:init.method,headers:init.headers,body:init.body});const ct=(init.headers||{})['content-type']||'';const form=ct==='application/x-www-form-urlencoded'?new URLSearchParams(init.body):null;const tok=form&&form.get('grant_type')==='authorization_code'&&form.get('client_id')===ENV.ALPACA_OAUTH_CLIENT_ID&&form.get('client_secret')===ENV.ALPACA_OAUTH_CLIENT_SECRET&&form.get('redirect_uri')===CALLBACK?CODES[form.get('code')]:null;return tok?new Response(JSON.stringify({access_token:tok,token_type:'bearer',scope:'trading data'}),{status:200}):new Response(JSON.stringify({code:40310000,message:'invalid_grant'}),{status:401});}
    if(u==='https://api.alpaca.markets/v2/account'){calls.push({url:u,method:'GET',headers:init.headers});const a=ACCOUNTS[String((init.headers||{}).authorization||'').replace(/^Bearer /,'')];return a?new Response(JSON.stringify(a),{status:200}):new Response(JSON.stringify({message:'unauthorized'}),{status:401});}
    if(/^https?:\/\/(?!127\.0\.0\.1)/.test(u)){calls.push({url:u,method:init.method||'GET',stray:true});return new Response('{}',{status:599});}
    return fetch(url,init);
  };
  return {f,calls};
}
const qOf=url=>Object.fromEntries(new URL(url).searchParams);
async function connect(db,user,code,opts){
  const o=opts||{},of=o.oauth||oauthFetch(),logs=o.logs||[];
  const s=await K.start({user_id:user,provider:'alpaca',env:o.env||ENV,db,now:T0});
  if(!s.ok)return {start:s,of,logs};
  const st=o.state?o.state(qOf(s.url).state):qOf(s.url).state;
  const cb=await K.callback({query:Object.assign({code,state:st},o.query||{}),env:o.env||ENV,db,fetch:of.f,now:o.at||T0+60000,log:l=>logs.push(l)});
  // The app's last step: the signed-in person in the browser that came back confirms the staged connection.
  const lk=cb.redirect&&/#you\?broker=confirm&link=([0-9a-f-]{36})$/.exec(cb.redirect);
  const confirmed=lk&&o.confirmAs!==null?await db.confirm({link_id:lk[1],user_id:o.confirmAs||user}):false;
  return {start:s,cb,of,logs,state:st,link:lk?lk[1]:null,confirmed};
}
async function trader(db,user,m,opts){
  const o=opts||{};
  const r=await B.resolve({user_id:user,rows:db.rowsFor(user),credential:db.token,order_cap_cents:o.cap,on_auth_failure:o.onAuth,adapter:{base:m.base,mock:true,clock:()=>T0},clock:()=>T0});
  const s=T.create({registry,connectors:r.wired?r.connectors:{read:async()=>{throw new Error('NOT_WIRED');},write:async()=>{throw new Error('NOT_WIRED');},verify:async()=>{throw new Error('NOT_WIRED');}},clock:()=>T0,instruments:[],partners:r.wired?r.partners:{},connect:r.wired?null:{code:r.code,message:r.message},compliance:C});
  return {r,s};
}
async function market(o){const m=await Mock.start(Object.assign({now:()=>T0,account:'acct-nobody',accounts:{'acct-A':{positions:{VOO:3}},'acct-B':{positions:{VOO:5}}},tokens:{'tok-A':'acct-A','tok-B':'acct-B'}},o||{}));servers.push(m);return m;}
const landed=(m,acct)=>m.state.requests.filter(q=>q.method!=='GET'&&q.account===acct);

test('[S01] the broker adapter interface: provider, getAccount, getPositions, placeOrder, cancelOrder, getOrderStatus, against the person\'s own account',async()=>{
  const m=await market();
  const ad=A.create({base:m.base,mock:true,token:'tok-A',account_id:'acct-A',order_cap_cents:100000,clock:()=>T0});
  assert.equal(ad.provider,'alpaca');for(const k of ['getAccount','getPositions','placeOrder','cancelOrder','getOrderStatus'])assert.equal(typeof ad[k],'function',k);
  const acc=await ad.getAccount();assert.equal(acc.value.id,'acct-A');assert.equal(acc.value.live,true);assert.equal(acc.value.paper,false);
  assert.equal((await ad.getPositions()).value.find(p=>p.symbol==='VOO').qty,3);
  const placed=await ad.placeOrder({symbol:'NVDA',side:'buy',type:'limit',qty:1,limit_cents:10000,time_in_force:'gtc'},'k-1');
  const st=await ad.getOrderStatus(placed.order.order_id);assert.equal(st.order_id,placed.order.order_id);assert.equal(st.state,'working');
  const cx=await ad.cancelOrder(placed.order.order_id);assert.equal(cx.accepted,true);assert.equal((await ad.getOrderStatus(placed.order.order_id)).state,'canceled');
  assert.ok(landed(m,'acct-A').every(r=>r.authorization==='Bearer tok-A'&&r.path.startsWith('/v2/')));
});

test('[S02] Connect starts with the broker\'s own approval page: exact Alpaca URL, our callback, least scope, a signed state, and no secret anywhere in it',async()=>{
  const db=memDb();const s=await K.start({user_id:UA,provider:'alpaca',env:ENV,db,now:T0});
  assert.equal(s.ok,true);const u=new URL(s.url);
  assert.equal(u.origin+u.pathname,'https://app.alpaca.markets/oauth/authorize');
  const q=qOf(s.url);assert.deepEqual(Object.keys(q).sort(),['client_id','env','redirect_uri','response_type','scope','state']);
  assert.equal(q.response_type,'code');assert.equal(q.client_id,'cid-upmore-test');assert.equal(q.redirect_uri,CALLBACK);assert.equal(q.scope,'trading data');assert.equal(q.env,'live');
  assert.doesNotMatch(s.url,/csecret|srk-/,'no client secret or service key in the URL');assert.match(s.url,/scope=trading%20data/);
  assert.equal(db.calls[0][0],'create');assert.equal(db.calls[0][1].user_id,UA);assert.match(db.calls[0][1].nonce_hash,/^[0-9a-f]{64}$/);assert.equal(Date.parse(db.calls[0][1].expires_at),T0+10*60000);
  assert.doesNotMatch(q.state,new RegExp(db.calls[0][1].nonce_hash),'the state carries the nonce, the database only its hash');
});

test('[S03] the OAuth round trip (stubbed): the code is exchanged server side, form-encoded with the secret; the live account is read; the token is staged for this person and their own app confirms it',async()=>{
  const db=memDb();const c=await connect(db,UA,'code-A');
  assert.equal(c.cb.outcome,'staged');assert.match(c.cb.redirect,/^https:\/\/upmore-topaz\.vercel\.app\/#you\?broker=confirm&link=[0-9a-f-]{36}$/);assert.equal(c.confirmed,true,'the starter\'s own app confirms it');
  const ex=c.of.calls.find(x=>x.url.endsWith('/oauth/token'));assert.equal(ex.method,'POST');assert.equal(ex.headers['content-type'],'application/x-www-form-urlencoded');
  const form=new URLSearchParams(ex.body);assert.deepEqual([...form.keys()].sort(),['client_id','client_secret','code','grant_type','redirect_uri']);assert.equal(form.get('grant_type'),'authorization_code');assert.equal(form.get('code'),'code-A');assert.equal(form.get('redirect_uri'),CALLBACK);
  const ac=c.of.calls.find(x=>x.url.endsWith('/v2/account'));assert.equal(ac.headers.authorization,'Bearer tok-A');
  const link=db.calls.find(x=>x[0]==='stage')[1];assert.equal(link.user_id,UA);assert.equal(link.account_id,'acct-A');assert.equal(link.account_mask,'****1111');assert.equal(JSON.parse(link.token).access_token,'tok-A');
  assert.equal(db.rows.length,1);assert.equal(db.rows[0].paper,false);assert.equal(db.rows[0].account_id,'acct-A');assert.equal(db.rows[0].token,undefined,'the row holds no token');
  assert.ok(c.of.calls.every(x=>!x.stray),'no other host was called');
});

test('[S04] a tampered state is rejected before anything else happens: another person\'s id under the old signature, a forged signature, a state signed with another key, garbage',async()=>{
  const db=memDb();const s=await K.start({user_id:UA,provider:'alpaca',env:ENV,db,now:T0});const st=qOf(s.url).state;const [body,sig]=st.split('.');
  const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const payload=JSON.parse(Buffer.from(body,'base64url').toString());
  const forged=[`${b64(Object.assign({},payload,{u:UB}))}.${sig}`,`${body}.${Buffer.from('x'.repeat(32)).toString('base64url')}`,await K.signState(payload,'some-other-key',{subtle:crypto.subtle}),'garbage','a.b.c',''];
  for(const f of forged){
    const of=oauthFetch();const before=db.calls.length;
    const r=await K.callback({query:{code:'code-A',state:f},env:ENV,db,fetch:of.f,now:T0+60000});
    assert.equal(r.code,'state_invalid',`state ${f.slice(0,20)}...`);assert.equal(r.redirect,'https://upmore-topaz.vercel.app/#you?broker=error&reason=state_invalid');
    assert.equal(of.calls.length,0,'no token exchange');assert.equal(db.calls.length,before,'no database call: not even the nonce is consumed');
  }
  assert.equal(db.rows.length,0);
});

test('[S05] an expired state (over 10 minutes) is rejected, and nothing is exchanged',async()=>{
  const db=memDb();const c=await connect(db,UA,'code-A',{at:T0+10*60000+1});
  assert.equal(c.cb.code,'state_invalid');assert.equal(c.of.calls.length,0);assert.equal(db.rows.length,0);
  const ok=await connect(memDb(),UA,'code-A',{at:T0+10*60000-1});assert.equal(ok.cb.outcome,'staged','just inside the window still works');
});

test('[S06] a state is used once, by the person it was issued to: a replayed callback is refused and nothing is exchanged again',async()=>{
  const db=memDb();const c=await connect(db,UA,'code-A');assert.equal(c.cb.outcome,'staged');
  const of=oauthFetch();const again=await K.callback({query:{code:'code-A',state:c.state},env:ENV,db,fetch:of.f,now:T0+90000});
  assert.equal(again.code,'state_used');assert.equal(of.calls.length,0,'no second exchange');assert.equal(db.calls.filter(x=>x[0]==='stage').length,1);
  assert.equal(again.message,'That connection link was already used or wasn\'t yours, so nothing was connected. Tap Connect again.');
});

test('[S07] LIVE ONLY: a token that does not open a live account on api.alpaca.markets connects nothing; there is no paper fallback; an inactive account connects nothing',async()=>{
  const db=memDb();const p=await connect(db,UA,'code-paper');
  assert.equal(p.cb.code,'not_live');assert.equal(p.cb.message,'That connection doesn\'t open a live Alpaca account. Upmore trades in live accounts only, so nothing was connected.');
  assert.equal(db.rows.length,0);assert.ok(p.of.calls.every(x=>!/paper-api/.test(x.url)),'paper was never tried');
  const cl=await connect(db,UA,'code-closed');assert.equal(cl.cb.code,'account_not_active');assert.equal(db.rows.length,0);
  const bad=await connect(db,UA,'code-wrong');assert.equal(bad.cb.code,'exchange_failed');assert.equal(db.rows.length,0);
});

test('[S08] one brokerage account belongs to one Upmore login: connecting an account someone else holds is refused and said plainly',async()=>{
  const db=memDb();assert.equal((await connect(db,UA,'code-A')).confirmed,true);
  const b=await connect(db,UB,'code-A');assert.equal(b.cb.code,'connected_elsewhere');assert.equal(b.cb.message,'That brokerage account is already connected to another Upmore login, so it wasn\'t connected here.');
  assert.equal(db.rows.length,1);assert.equal(db.rows[0].user_id,UA);
});

test('[S09] Connect is honest when it can\'t run: app credentials not set, the person said no, a provider not built',async()=>{
  for(const env of [Object.assign({},ENV,{ALPACA_OAUTH_CLIENT_SECRET:''}),Object.assign({},ENV,{ALPACA_OAUTH_CLIENT_ID:''})]){
    const db=memDb();const s=await K.start({user_id:UA,provider:'alpaca',env,db,now:T0});
    assert.equal(s.ok,false);assert.equal(s.code,'not_configured');assert.equal(s.message,'Connecting a brokerage isn\'t switched on yet: Upmore\'s Alpaca app credentials are not set. Nothing was connected.');assert.equal(db.calls.length,0);
  }
  const db=memDb();const d=await connect(db,UA,'code-A',{query:{error:'access_denied',code:undefined}});assert.equal(d.cb.outcome,'denied');assert.equal(d.cb.redirect,'https://upmore-topaz.vercel.app/#you?broker=error&reason=denied');assert.equal(d.of.calls.length,0);
  const sch=await K.start({user_id:UA,provider:'schwab',env:ENV,db:memDb(),now:T0});assert.equal(sch.code,'not_wired');assert.equal(sch.message,'Connecting Charles Schwab isn\'t available yet. Alpaca is the broker you can connect today.');
});

test('[S10] no secret, code or token ever reaches a log line, a redirect or a message',async()=>{
  const logs=[];const db=memDb();const c=await connect(db,UA,'code-A',{logs});
  const bad=await connect(memDb(),UA,'code-paper',{logs});
  const all=[...logs,c.cb.redirect,c.cb.message,bad.cb.redirect,bad.cb.message,c.start.url].join('\n');
  for(const secret of ['code-A','code-paper','tok-A','tok-paper-only','csecret-upmore-test','srk-upmore-test'])assert.ok(!all.includes(secret),`${secret} leaked`);
  assert.ok(logs.length>=2);
});

test('[S11] no brokerage connected: an order, a portfolio question and a cancel get the honest connect prompt, and nothing is read or staged',async()=>{
  const db=memDb();const m=await market();const t=await trader(db,UA,m);
  assert.equal(t.r.wired,false);assert.equal(t.r.code,'connect');
  const PROMPT='No brokerage is connected yet, so nothing was placed - here\'s the link.\n\nhttps://upmore-topaz.vercel.app/connect/alpaca';
  const a=await t.s.start('buy $5 of VOO');assert.equal(a.outcome,'blocked');assert.equal(a.reason,'broker_connect');assert.equal(a.text,PROMPT);
  assert.equal((await t.s.start('what do I own')).text,PROMPT);
  assert.equal(t.s.pending,null);assert.equal(m.state.requests.length,0);
});

test('[S12] a broker with no public trading API is said plainly, in Connect and in a trade, with Alpaca as the way in',async()=>{
  const s=await K.start({user_id:UA,provider:'robinhood',env:ENV,db:memDb(),now:T0});
  assert.equal(s.code,'unsupported');assert.equal(s.message,'Robinhood doesn\'t let apps place trades, so Upmore can\'t connect it and nothing was placed. Alpaca does - here\'s the link.\n\nhttps://upmore-topaz.vercel.app/connect/alpaca');
  const db=memDb();await connect(db,UA,'code-A');const m=await market();const t=await trader(db,UA,m,{cap:100000});
  const r=await t.s.start('buy $5 of VOO in my Fidelity account');assert.equal(r.outcome,'refuse');assert.equal(r.reason,'broker_no_public_api');
  assert.match(r.text,/^Fidelity doesn't let apps place trades, so Upmore can't connect it and nothing was placed\. Alpaca does - here's the link\.\n\nhttps:\/\/\S+\/connect\/alpaca$/);assert.equal(landed(m,'acct-A').length,0);
});

test('[S13] a revoked or expired token: Reconnect is said, the row is marked for Reconnect once, nothing is placed and no fill is ever claimed',async()=>{
  const db=memDb();await connect(db,UA,'code-A');const m=await market();const marks=[];
  const t=await trader(db,UA,m,{cap:100000,onAuth:q=>marks.push(q)});
  m.state.tokens={};
  const r=await t.s.start('buy $5 of VOO');assert.equal(r.outcome,'blocked');assert.equal(r.reason,'broker_reconnect');assert.equal(r.text,'Your brokerage connection was revoked or has expired, so nothing was placed - here\'s the link to reconnect.\n\nhttps://upmore-topaz.vercel.app/connect/alpaca');
  assert.deepEqual(JSON.parse(JSON.stringify(marks)),[{user_id:UA,account:db.rows[0].id}],'marked once for this person and row');
  // Revoked between the card and the yes: the write is refused, said as Reconnect, nothing filled.
  const db2=memDb();await connect(db2,UA,'code-A');const m2=await market();const t2=await trader(db2,UA,m2,{cap:100000,onAuth:()=>{}});
  assert.equal((await t2.s.start('buy $5 of VOO')).outcome,'confirm');m2.state.tokens={};
  const y=await t2.s.reply('yes');assert.equal(y.outcome,'blocked');assert.equal(y.reason,'broker_reconnect');assert.equal(y.text,'Your brokerage connection was revoked or has expired, so nothing was placed - here\'s the link to reconnect.\n\nhttps://upmore-topaz.vercel.app/connect/alpaca');assert.doesNotMatch(y.text,/Done|filled|bought/);
  // Revoked after the re-check passed, at the write itself: the broker's 401 is a definite refusal, said as Reconnect.
  const db3=memDb();await connect(db3,UA,'code-A');const m3=await market();let revoke=false;const t3=await trader(db3,UA,m3,{cap:100000,onAuth:()=>{}});
  assert.equal((await t3.s.start('buy $5 of VOO')).outcome,'confirm');
  // The mock records each request before it checks auth: the token is revoked at the moment the POST arrives.
  const orig=m3.state.tokens;m3.state.tokens=new Proxy(orig,{has:(o,k)=>!(revoke&&k==='tok-A')&&k in o,get:(o,k)=>revoke&&k==='tok-A'?undefined:o[k]});
  const push=m3.state.requests.push.bind(m3.state.requests);m3.state.requests.push=r=>{if(r.method==='POST')revoke=true;return push(r);};
  const z=await t3.s.reply('yes');assert.equal(z.outcome,'failed');assert.match(z.text,/your Alpaca connection was revoked or has expired, so nothing was sent\. Reconnect it in Settings, Brokerage/);assert.doesNotMatch(z.text,/Done|filled|bought/);
  assert.equal(m3.accounts['acct-A'].orders.length,0,'no order exists at the broker');
  assert.equal(m2.state.accounts?0:m2.accounts['acct-A'].orders.length,0);
});

test('[S14] the $5.00 per-order cap on live orders: said before any card, and refused by the adapter itself even if a caller skips the flow',async()=>{
  const db=memDb();await connect(db,UA,'code-A');const m=await market();const t=await trader(db,UA,m);
  assert.equal(t.r.account.order_cap_cents,500,'the owner\'s default');
  const ok=await t.s.start('buy $5 of VOO');assert.equal(ok.outcome,'confirm');assert.match(ok.details,/limit \$5\.00 per order while Upmore is in testing/);await t.s.reply('no');
  const over=await t.s.start('buy $6 of VOO');assert.equal(over.outcome,'stop');assert.equal(over.reason,'order_cap');assert.equal(over.text,'That\'s about $6.00; live orders are limited to $5.00 each while Upmore is in testing. Nothing was placed.');
  assert.equal((await t.s.start('buy 1 share of VOO')).reason,'order_cap');
  const ad=t.r.adapter;
  await assert.rejects(ad.placeOrder({symbol:'VOO',side:'buy',type:'market',notional_cents:600,time_in_force:'day'},'k-x'),e=>e.kind==='cap'&&/over the \$5\.00 per-order limit/.test(e.message));
  await assert.rejects(ad.placeOrder({symbol:'VOO',side:'buy',type:'market',qty:1,time_in_force:'day'},'k-y'),e=>e.kind==='cap');
  assert.equal(landed(m,'acct-A').filter(r=>r.method==='POST').length,0,'nothing over the cap was sent');
  assert.equal(B.capFrom('2500'),2500);assert.equal(B.capFrom(''),500);assert.equal(B.capFrom('-1'),500);assert.equal(B.capFrom('abc'),500);
});

test('[S15] an order without approval never submits: nothing before the yes, nothing on no, nothing on a late yes, nothing on a new request; one yes, one order',async()=>{
  const db=memDb();await connect(db,UA,'code-A');const m=await market();const t=await trader(db,UA,m);
  const posts=()=>landed(m,'acct-A').filter(r=>r.method==='POST').length;
  await t.s.start('buy $5 of VOO');assert.equal(posts(),0,'the card alone sends nothing');
  assert.equal((await t.s.reply('no')).outcome,'declined');assert.equal(posts(),0);
  await t.s.start('buy $4 of VOO');await t.s.start('buy $3 of VOO');assert.equal(posts(),0,'a new request replaces the card; neither is sent');
  const y=await t.s.reply('yes');assert.equal(y.outcome,'filled');assert.equal(posts(),1);assert.equal(landed(m,'acct-A')[0].body.notional,'3.00');
  assert.equal((await t.s.reply('yes')).outcome,'nothing_pending');assert.equal(posts(),1);
});

test('[S16] cross-person isolation end to end: two people connect, each order lands only in that person\'s own account, and a leaked read opens nothing',async()=>{
  const db=memDb();assert.equal((await connect(db,UA,'code-A')).confirmed,true);assert.equal((await connect(db,UB,'code-B')).confirmed,true);
  const m=await market();const a=await trader(db,UA,m),b=await trader(db,UB,m);
  assert.equal(a.r.account.account_id,'acct-A');assert.equal(b.r.account.account_id,'acct-B');
  await a.s.start('buy $5 of VOO');await a.s.reply('yes');await b.s.start('buy $4 of VOO');await b.s.reply('yes');
  assert.deepEqual(landed(m,'acct-A').map(r=>[r.authorization,r.body.notional]),[['Bearer tok-A','5.00']]);
  assert.deepEqual(landed(m,'acct-B').map(r=>[r.authorization,r.body.notional]),[['Bearer tok-B','4.00']]);
  const before=m.state.requests.length;
  const leak=await B.resolve({user_id:UA,rows:[...db.rowsFor(UB),...db.rowsFor(UA)],credential:db.token,adapter:{base:m.base,mock:true,clock:()=>T0}});
  assert.equal(leak.wired,false);assert.equal(leak.code,'isolation');assert.equal(m.state.requests.length,before);
  assert.equal(await db.token({user_id:UA,account:db.rows.find(r=>r.user_id===UB).id}),null,'A cannot read B\'s token');
});

test('[S17] the callback never completes a connection by itself: someone who starts Connect and sends the approval link to someone else gets nothing; only the starter\'s own signed-in app confirms',async()=>{
  // UA starts Connect and sends the Alpaca link to UB; UB approves with UB's Alpaca account (code-B). UB's browser comes back.
  const db=memDb();const c=await connect(db,UA,'code-B',{confirmAs:UB});
  assert.equal(c.cb.outcome,'staged');assert.equal(db.rows.length,0,'after the callback alone, nothing can trade');
  assert.equal(c.confirmed,false,'UB\'s app, signed in as UB, is refused');assert.equal(db.pending.size,0,'the staged connection is wiped');
  assert.equal(await db.confirm({link_id:c.link,user_id:UA}),false,'and is gone even for the starter');
  assert.equal(db.rows.length,0);assert.equal(db.vault.size,0,'UB\'s token is stored nowhere');
  // The ordinary path still works: the starter's own browser comes back and confirms.
  const own=await connect(db,UA,'code-A');assert.equal(own.confirmed,true);assert.equal(db.rows.length,1);assert.equal(db.rows[0].user_id,UA);assert.equal(db.rows[0].account_id,'acct-A');
});

test('[ADV] adversarial log in docs/depth/BROKER-CONNECT.md, every row',async()=>{
  const db=memDb();
  // A callback with a code and no state, or a state for another provider, does nothing.
  const of=oauthFetch();assert.equal((await K.callback({query:{code:'code-A'},env:ENV,db,fetch:of.f,now:T0})).code,'state_invalid');
  const s=await K.start({user_id:UA,provider:'alpaca',env:ENV,db,now:T0});const p=JSON.parse(Buffer.from(qOf(s.url).state.split('.')[0],'base64url').toString());
  const other=await K.signState(Object.assign({},p,{p:'schwab'}),'whatever',{subtle:crypto.subtle});assert.equal((await K.callback({query:{code:'code-A',state:other},env:ENV,db,fetch:of.f,now:T0})).code,'state_invalid');
  assert.equal(of.calls.length,0);
  // The person in the query string is ignored: the link goes to the state's person.
  const c=await connect(db,UA,'code-A',{query:{user_id:UB,user:UB}});assert.equal(c.confirmed,true);assert.equal(db.rows[0].user_id,UA);
  // A paper token pasted as an access token is never opened as paper.
  assert.equal((await B.resolve({user_id:UA,rows:[{id:'p',user_id:UA,provider:'alpaca',label:'main',paper:true,account_id:'x',status:'active'}],credential:async()=>'tok'})).code,'connect');
  // "sell everything" in a live account is still one card, one approval.
  const m=await market();const t=await trader(db,UA,m,{cap:1000000});const r=await t.s.start('sell all my VOO');assert.equal(r.outcome,'confirm');assert.match(r.text,/^LIVE: Sell 3 shares of VOO/);assert.equal(landed(m,'acct-A').length,0);
  // A start for nobody is refused.
  assert.equal((await K.start({provider:'alpaca',env:ENV,db:memDb(),now:T0})).code,'unauthenticated');
});
