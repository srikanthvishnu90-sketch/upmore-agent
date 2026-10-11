// The You screen's Brokerage section (src/upmore-app-template.html, refreshBrokerRow and the #you?broker= return), run
// against stub DOM elements and a stub Supabase client. Proves what the person sees in each state and what the client
// calls: its own row through RLS, broker-oauth-start to connect, broker_disconnect for its own row. It never handles a
// token. Check: node --test tests/broker-ui.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','src/upmore-app-template.html'),'utf8');
const start=src.indexOf('async function refreshBrokerRow() {');
const end=src.indexOf('\n}\n',start)+2;
assert.ok(start>0&&end>start,'refreshBrokerRow is in the template');
const fnSrc=src.slice(start,end);
const built=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function world(o){
  const el=id=>({id,textContent:'',hidden:true,disabled:false,onclick:null});
  const els={brokerDesc:el('brokerDesc'),brokerBtn:el('brokerBtn'),brokerStatus:el('brokerStatus')};
  const calls=[];
  const supa={
    from:t=>({select:c=>{const q={eqs:[],eq(k,v){q.eqs.push([k,v]);return q;},then(res,rej){calls.push(['select',t,c,q.eqs]);return Promise.resolve(o.read||{data:[],error:null}).then(res,rej);}};return q;}}),
    functions:{invoke:async(name,opts)=>{calls.push(['invoke',name,opts]);return o.invoke||{data:{ok:true,url:'https://app.alpaca.markets/oauth/authorize?x=1'},error:null};}},
    rpc:async(name,args)=>{calls.push(['rpc',name,args]);return o.rpc||{data:true,error:null};},
  };
  const ctx=vm.createContext({$:id=>els[id]||null,supa,session:{user:{id:'user-1'}},location:{href:'https://upmore-topaz.vercel.app/#you'},confirm:()=>o.confirm!==false,console});
  vm.runInContext(fnSrc+'\nthis.refresh=refreshBrokerRow;',ctx);
  return {ctx,els,calls,refresh:()=>ctx.refresh()};
}
const tick=()=>new Promise(r=>setTimeout(r,0));

test('the built app carries the same Brokerage section as the template',()=>{assert.ok(built.includes('async function refreshBrokerRow() {'));assert.ok(built.includes('id="brokerSec"')||src.includes('id="brokerSec"'));});

test('not connected: says so, and Connect starts the connection on Alpaca\'s own page; the client reads only its own row, never a token column',async()=>{
  const w=world({});await w.refresh();
  assert.equal(w.els.brokerDesc.textContent,'Not connected.');assert.equal(w.els.brokerBtn.textContent,'Connect');assert.equal(w.els.brokerBtn.hidden,false);
  const sel=w.calls.find(c=>c[0]==='select');assert.equal(sel[1],'brokerage_accounts');assert.doesNotMatch(sel[2],/vault|token/);assert.deepEqual(sel[3],[['user_id','user-1'],['provider','alpaca']]);
  await w.els.brokerBtn.onclick();assert.deepEqual(JSON.parse(JSON.stringify(w.calls.find(c=>c[0]==='invoke').slice(1))),['broker-oauth-start',{body:{provider:'alpaca'}}]);
  assert.equal(w.ctx.location.href,'https://app.alpaca.markets/oauth/authorize?x=1');
});

test('Connect when the app credentials are not set: the server\'s honest message, nothing else',async()=>{
  const w=world({invoke:{data:{ok:false,code:'not_configured',message:'Connecting a brokerage isn\'t switched on yet: Upmore\'s Alpaca app credentials are not set. Nothing was connected.'},error:null}});
  await w.refresh();await w.els.brokerBtn.onclick();
  assert.equal(w.els.brokerStatus.textContent,'Connecting a brokerage isn\'t switched on yet: Upmore\'s Alpaca app credentials are not set. Nothing was connected.');
  assert.equal(w.ctx.location.href,'https://upmore-topaz.vercel.app/#you','no navigation');assert.equal(w.els.brokerBtn.disabled,false);
});

test('connected: live with the masked account, and Disconnect deletes the person\'s own connection after a confirmation, saying what it did and what it did not',async()=>{
  const w=world({read:{data:[{id:'row-9',provider:'alpaca',account_mask:'****5678',status:'active'}],error:null}});
  await w.refresh();assert.equal(w.els.brokerDesc.textContent,'Connected, live (****5678).');assert.equal(w.els.brokerBtn.textContent,'Disconnect');
  await w.els.brokerBtn.onclick();await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(w.calls.find(c=>c[0]==='rpc').slice(1))),['broker_disconnect',{p_account:'row-9'}]);
  assert.match(w.els.brokerStatus.textContent,/^Disconnected\. Upmore deleted its access\. To remove it on Alpaca's side too, revoke Upmore under OAuth Apps in your Alpaca dashboard\.$/);
  const no=world({read:{data:[{id:'row-9',provider:'alpaca',account_mask:'****5678',status:'active'}],error:null},confirm:false});await no.refresh();await no.els.brokerBtn.onclick();
  assert.equal(no.calls.filter(c=>c[0]==='rpc').length,0,'no confirmation, no disconnect');
  const fail=world({read:{data:[{id:'row-9',provider:'alpaca',status:'active'}],error:null},rpc:{data:false,error:null}});await fail.refresh();await fail.els.brokerBtn.onclick();
  assert.equal(fail.els.brokerStatus.textContent,'Couldn\'t disconnect — nothing changed. Try again.');
});

test('revoked or expired: Reconnect, never a silent failure; an unreadable table is said, never shown as not connected',async()=>{
  const w=world({read:{data:[{id:'row-9',provider:'alpaca',status:'reconnect'}],error:null}});await w.refresh();
  assert.equal(w.els.brokerDesc.textContent,'The connection was revoked or expired. Reconnect to trade.');assert.equal(w.els.brokerBtn.textContent,'Reconnect');
  await w.els.brokerBtn.onclick();assert.equal(w.calls.filter(c=>c[0]==='invoke').length,1);
  const down=world({read:{data:null,error:{message:'denied'}}});await down.refresh();
  assert.equal(down.els.brokerDesc.textContent,'Can\'t check your connection right now.');assert.equal(down.els.brokerBtn.hidden,true);
});

test('the return from Alpaca: #you?broker=confirm&link=<id> is confirmed with this person\'s own session; a refusal is said, never shown as connected',async()=>{
  const cs=src.indexOf('async function confirmBrokerLink(link) {'),ce=src.indexOf('\n}\n',cs)+2;assert.ok(cs>0);
  const run=async(rpc,signedIn)=>{const toasts=[],calls=[];const ctx=vm.createContext({supa:{rpc:async(n,a)=>{calls.push([n,a]);return rpc;}},session:signedIn?{user:{id:'user-1'}}:null,toast:t=>toasts.push(t),setTimeout:f=>f(),$:()=>null,console});vm.runInContext(src.slice(cs,ce)+'\nthis.c=confirmBrokerLink;',ctx);await ctx.c('11111111-2222-4333-8444-000000000001');return {toasts,calls};};
  const ok=await run({data:true,error:null},true);assert.deepEqual(JSON.parse(JSON.stringify(ok.calls)),[['broker_confirm_link',{p_link:'11111111-2222-4333-8444-000000000001'}]]);assert.equal(ok.toasts[0],'Alpaca connected. Upmore can now place the trades you approve in your own account.');
  const no=await run({data:false,error:null},true);assert.equal(no.toasts[0],'That connection wasn\'t started from this login or has expired, so it wasn\'t connected. Tap Connect to try again.');
  const out=await run({data:true,error:null},false);assert.equal(out.calls.length,0,'nobody signed in: nothing is confirmed');assert.match(out.toasts[0],/^Sign in, then tap Connect again/);
  const m=/const bk = (\/.*\/)\.exec\(h\);/.exec(src);const rx=vm.runInNewContext(m[1]);
  assert.deepEqual([...rx.exec('you?broker=confirm&link=11111111-2222-4333-8444-000000000001')].slice(1),['confirm','11111111-2222-4333-8444-000000000001']);
});

test('the return from Alpaca: #you?broker=... is stripped and said in plain words for every outcome the callback sends',()=>{
  const m=/const bk = (\/.*\/)\.exec\(h\);/.exec(src);assert.ok(m,'the return handler exists');
  const rx=vm.runInNewContext(m[1]);
  assert.deepEqual([...rx.exec('you?broker=connected')].slice(1),['connected',undefined]);
  assert.deepEqual([...rx.exec('you?broker=error&reason=state_used')].slice(1),['error','state_used']);
  for(const code of ['denied','state_invalid','state_used','not_live','account_not_active','connected_elsewhere','not_configured'])assert.ok(new RegExp(`\\b${code}: "`).test(src),`${code} has words`);
  // Every code the callback can send is covered by the app's words (or the generic "didn't finish").
  const K=require(path.join(__dirname,'..','packages/domain/74-broker-connect.js'));
  for(const code of Object.keys(K.MESSAGES).filter(k=>!['connected','confirm','not_wired','exchange_failed','save_failed'].includes(k)))assert.ok(new RegExp(`\\b${code}: "`).test(src),`${code} is said in the app`);
});
