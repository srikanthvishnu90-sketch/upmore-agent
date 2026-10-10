const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function fixture(fetch){
  const nodes=new Map();
  function element(){return {value:'',hidden:false,disabled:false,textContent:'',children:[],attributes:{},replaceChildren(){this.children=[];},append(...children){this.children.push(...children);},setAttribute(k,v){this.attributes[k]=v;},focus(){this.focused=true;}};}
  const ctx=vm.createContext({console,crypto:require('node:crypto').webcrypto,AbortController,setTimeout,clearTimeout,
    session:{user:{id:'owner'},access_token:'token'},UPMORE_BACKEND_URL:'https://example.invalid',UPMORE_ANON_KEY:'public',fetch,
    document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element}});
  for(const filename of ['ledger-review-controller.js','financial-review.js']) vm.runInContext(fs.readFileSync(path.join(root,'src',filename),'utf8'),ctx);
  ctx.document.getElementById('ledgerFrom').value='2026-10-01';ctx.document.getElementById('ledgerTo').value='2026-10-31';
  return {ctx,nodes};
}
const row={user_id:'owner',account_id:'checking',provider_transaction_id:'one',fact_hash:'exact',merchant_raw:'<img src=x onerror=steal()>',currency:'USD',amount_cents:-10001,posted_on:'2026-10-10'};
function response(body){return {ok:true,json:async()=>body};}
test('renderer uses text for untrusted merchants and exact signed amounts, with unknown totals preserved',async()=>{
  const f=fixture(async(_url,options)=>response(JSON.parse(options.body).action==='ledger_page'?{ok:true,rows:[row],next_offset:null,coverage:'Retained history only'}:{ok:true,report:{income_cents:null,spending_cents:null,unclassified_records:1,invalidated_reviews:0}}));
  await f.ctx.ledgerLoad();
  const button=f.nodes.get('ledgerRows').children[0];
  assert.equal(button.children[0].textContent,row.merchant_raw);assert.match(button.children[1].textContent,/−\$100\.01/);
  assert.match(f.nodes.get('ledgerTotals').textContent,/income: Unknown/);assert.match(f.nodes.get('ledgerTotals').textContent,/spending: Unknown/);
  button.onclick();assert.equal(f.nodes.get('ledgerEditor').hidden,false);assert.equal(f.nodes.get('ledgerKind').focused,true);
  f.ctx.ledgerReset();assert.equal(f.nodes.get('ledgerRows').children.length,0);assert.equal(f.nodes.get('ledgerEditor').hidden,true);assert.equal(f.nodes.get('ledgerTotals').textContent,'');
  assert.equal(f.nodes.get('ledgerChosen').textContent,'');assert.equal(f.nodes.get('ledgerCategory').value,'');
});
test('renderer discards delayed bank data after account reset',async()=>{
  const resolvers=[];const f=fixture(()=>new Promise(resolve=>resolvers.push(resolve)));
  const pending=f.ctx.ledgerLoad();f.ctx.ledgerReset();f.ctx.session={user:{id:'other'},access_token:'other-token'};
  resolvers[0](response({ok:true,rows:[row],next_offset:null}));resolvers[1](response({ok:true,report:{}}));await pending;
  assert.equal(f.nodes.get('ledgerRows').children.length,0);assert.equal(f.nodes.get('ledgerTotals').textContent,'');
});
test('missing session shows a sign-in error without querying financial history',async()=>{
  let calls=0;const f=fixture(()=>{calls++;throw Error('should not fetch');});f.ctx.session=null;await f.ctx.ledgerLoad();
  assert.equal(calls,0);assert.match(f.nodes.get('ledgerStatus').textContent,/Sign in/);assert.equal(f.nodes.get('ledgerStatus').attributes.role,'alert');
});
test('linked form requires an explicit record choice and submits both transfer legs together',async()=>{
  const linked={...row,account_id:'savings',provider_transaction_id:'two',fact_hash:'linked-current',amount_cents:10001};
  const calls=[];const f=fixture(async(_url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    if(body.action==='ledger_page')return response({ok:true,rows:[row],next_offset:null,coverage:'Retained history only'});
    if(body.action==='ledger_report')return response({ok:true,report:{income_cents:null,spending_cents:null,unclassified_records:1,invalidated_reviews:0}});
    if(body.action==='ledger_link_candidates')return response({ok:true,rows:[linked],next_offset:null,coverage:'Possible matches only.'});
    return response({ok:true,review:{}});
  });
  f.ctx.renderFinancialReview();await f.ctx.ledgerLoad();f.nodes.get('ledgerRows').children[0].onclick();
  f.nodes.get('ledgerKind').value='internal_transfer';await f.ctx.ledgerKindChanged();
  assert.equal(f.nodes.get('ledgerLink').value,'');assert.equal(f.nodes.get('ledgerLink').required,true);
  assert.equal(f.nodes.get('ledgerCategory').disabled,true);assert.equal(f.nodes.get('ledgerSave').textContent,'Classify both records');
  assert.equal(f.nodes.get('ledgerLink').children[1].textContent.includes(row.merchant_raw),true);
  f.nodes.get('ledgerLink').value='0';await f.nodes.get('ledgerEditor').onsubmit({preventDefault(){}});
  const save=calls.find(b=>b.action==='classify_transaction_pair');
  assert.equal(save.confirmed,true);assert.equal(save.review.fact_hash,'exact');assert.equal(save.review.linked_fact_hash,'linked-current');
  assert.equal(save.review.linked_account_id,'savings');assert.equal(save.review.category,null);
});
test('linked candidates arriving after another record selection cannot appear in the new form',async()=>{
  let resolve;const f=fixture(()=>new Promise(r=>resolve=r));
  vm.runInContext('ledgerSelected = '+JSON.stringify(row),f.ctx);f.ctx.document.getElementById('ledgerKind').value='refund';
  const pending=f.ctx.ledgerKindChanged();f.ctx.ledgerClearLinks();vm.runInContext('ledgerSelected = null',f.ctx);
  resolve(response({ok:true,rows:[{...row,provider_transaction_id:'original',amount_cents:-10000}],next_offset:null}));await pending;
  assert.equal(f.nodes.get('ledgerLink').children.length,0);assert.equal(f.nodes.get('ledgerLinkLabel').hidden,true);
});
test('stale saved classifications are shown as stale rather than preselected against changed bank facts',async()=>{
  const stale={...row,latest_review:{user_id:'owner',fact_hash:'older',kind:'expense',category:'Food'}};
  const f=fixture(async(_url,options)=>response(JSON.parse(options.body).action==='ledger_page'?{ok:true,rows:[stale],next_offset:null,coverage:'Retained'}:{ok:true,report:{income_cents:null,spending_cents:null,unclassified_records:1,invalidated_reviews:1}}));
  await f.ctx.ledgerLoad();f.nodes.get('ledgerRows').children[0].onclick();
  assert.equal(f.nodes.get('ledgerKind').value,'');assert.equal(f.nodes.get('ledgerCategory').value,'');
  assert.match(f.nodes.get('ledgerChosen').textContent,/Previous classification is stale/);
});
