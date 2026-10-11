const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function fixture(fetch){
  const nodes=new Map();
  function element(){return {value:'',hidden:false,disabled:false,checked:false,textContent:'',children:[],attributes:{},replaceChildren(){this.children=[];},append(...children){this.children.push(...children);},setAttribute(k,v){this.attributes[k]=v;},focus(){this.focused=true;}};}
  const ctx=vm.createContext({crypto:require('node:crypto').webcrypto,AbortController,setTimeout,clearTimeout,session:{user:{id:'owner'},access_token:'token'},UPMORE_BACKEND_URL:'https://example.invalid',UPMORE_ANON_KEY:'public',fetch,
    document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element}});
  for(const file of ['bill-workflow-controller.js','bill-workflow-ui.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8'),ctx);
  return {ctx,nodes};
}
const row={id:'bill-123456',user_id:'owner',creditor:'<img src=x onerror=steal()>',amount_due_cents:10001,currency:'USD',due_on:'2026-10-11',status:'verified',source_type:'user',observed_at:'2026-10-10T00:00:00Z',autopay:'unknown',direction:'payable',kind:'rent'};
const input={creditor:'Nema',amount:'100.01',due_on:'2026-10-11',kind:'rent',autopay:'off',confirmed:true};
const response=body=>({ok:true,json:async()=>body});
function controller(request,identity=()=>({owner:'owner',token:'token'})){
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/bill-workflow-controller.js'),'utf8'),context);
  let ids=0;return context.UpmoreBillWorkflow({request,identity,uuid:()=>`entry-${++ids}`});
}
test('exact amounts and invalid current-bill assertions are checked before writes',async()=>{
  let calls=0;const c=controller(async()=>{calls++;return {}});
  assert.equal(c.facts(input).amount_due_cents,10001);
  for(const invalid of [{amount:'1e2'},{amount:'1,00'},{amount:'0.001'},{amount:'90071992547409.92'},{due_on:'2026-02-30'},{confirmed:false},{kind:'made-up'}])await assert.rejects(c.save({...input,...invalid}));
  assert.equal(calls,0);
});
test('lost save responses retain the request ID only for identical details',async()=>{
  const bodies=[];const c=controller(async body=>{bodies.push(body);throw Error('lost response');});
  await assert.rejects(c.save(input));await assert.rejects(c.save(input));await assert.rejects(c.save({...input,amount:'30'}));
  assert.equal(bodies[0].entry_id,bodies[1].entry_id);assert.notEqual(bodies[1].entry_id,bodies[2].entry_id);assert.equal(bodies[2].obligation.amount_due_cents,3000);
});
test('delayed owner data is discarded and a forged bill owner is rejected',async()=>{
  let owner='owner',resolve;const c=controller(()=>new Promise(r=>resolve=r),()=>({owner,token:'token'}));
  const pending=c.read({action:'list'});owner='other';resolve({obligations:[row]});assert.equal(await pending,null);
  const forged=controller(async()=>({ok:true,obligations:[{...row,user_id:'other'}]}));await assert.rejects(forged.read({action:'list'}),/ownership/);
  await assert.rejects(forged.save(input,{...row,status:'asserted',source_type:'bank',user_id:'other'}),/own bill/);
});
test('assessment cannot be attached to a different bill owned by the same person',async()=>{
  const c=controller(async()=>({ok:true,obligation:{...row,id:'other-bill'},assessment:{state:'resolved',message:'Nothing due'}}));
  await assert.rejects(c.read({action:'plan',obligation_id:row.id}),/does not match/);
});
test('renderer keeps user assertion, unknown autopay and untrusted biller text visible',async()=>{
  const f=fixture(async()=>response({ok:true,obligations:[row],next_offset:null}));await f.ctx.billLoad();
  const item=f.nodes.get('billRows').children[0];assert.equal(item.children[0].textContent,row.creditor);assert.match(item.children[1].textContent,/\$100\.01/);
  assert.match(item.children[2].textContent,/your assertion, not provider confirmation/);assert.match(item.children[2].textContent,/Autopay unknown/);
  assert.equal(item.children.length,4);f.ctx.billReset();assert.equal(f.nodes.get('billRows').children.length,0);assert.equal(f.nodes.get('billCreditor').value,'');assert.equal(f.nodes.get('billConfirmed').checked,false);
});
test('assessment of unsupported execution has no approval or payment operation',async()=>{
  const calls=[];const f=fixture(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return response({ok:true,obligation:row,assessment:{state:'needs_connection',message:'No verified payment connection covers this bill yet.'}});});
  await f.ctx.billAssess(row);const panel=f.nodes.get('billAssessment');assert.match(panel.children[0].textContent,/needs connection/);assert.match(panel.children[1].textContent,/No verified payment connection/);
  assert.equal(panel.children.some(node=>node.onclick),false);assert.deepEqual(calls.map(body=>body.action),['plan']);
});
test('even a ready proposal exposes an incomplete-terms gate rather than an executable approval',async()=>{
  const f=fixture(async()=>response({ok:true,obligation:row,assessment:{state:'awaiting_approval',message:'Review this payment.',proposal:{amount_cents:10001}}}));
  await f.ctx.billAssess(row);assert.match(f.nodes.get('billAssessment').children[2].textContent,/complete delivery terms/);assert.equal(f.nodes.get('billAssessment').children.length,3);
});
test('pending list and assessment cannot repopulate financial data after sign-in changes',async()=>{
  const resolvers=[];const f=fixture(()=>new Promise(resolve=>resolvers.push(resolve)));
  const pending=f.ctx.billLoad();f.ctx.billReset();f.ctx.session={user:{id:'other'},access_token:'other-token'};
  resolvers[0](response({ok:true,obligations:[row],next_offset:null}));await pending;assert.equal(f.nodes.get('billRows').children.length,0);
  f.ctx.session={user:{id:'owner'},access_token:'token'};const assessment=f.ctx.billAssess(row);f.ctx.billReset();
  resolvers[1](response({ok:true,obligation:row,assessment:{state:'monitoring',message:'Pending payment'}}));await assessment;assert.equal(f.nodes.get('billAssessment').children.length,0);
});
test('candidate review requires explicit confirmation and marks dismissal as distinct from cancelling debt',async()=>{
  const candidate={...row,status:'asserted',source_type:'bank'},calls=[];
  const f=fixture(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return response(body.action==='list'?{ok:true,obligations:[],next_offset:null}:body.action==='dismiss_candidate'?{ok:true,obligation:{...candidate,status:'invalid',evidence:{dismissed_by_user:true}}}:{ok:true,obligation:{...candidate,source_type:'user',status:'verified'}});});
  await f.ctx.renderBillWorkflows();f.ctx.billSelectCandidate(candidate);
  assert.equal(f.nodes.get('billConfirmed').checked,false);assert.equal(f.nodes.get('billDismiss').hidden,false);
  await f.nodes.get('billEditor').onsubmit({preventDefault(){}});assert.equal(calls.filter(body=>body.action==='confirm_candidate').length,0);
  f.nodes.get('billConfirmed').checked=true;await f.nodes.get('billEditor').onsubmit({preventDefault(){}});
  const confirm=calls.find(body=>body.action==='confirm_candidate');assert.equal(confirm.confirmed,true);assert.equal(confirm.obligation.amount_due_cents,10001);
  f.ctx.billSelectCandidate(candidate);await f.nodes.get('billDismiss').onclick();assert.match(f.nodes.get('billStatus').textContent,/No debt or contract was cancelled/);
});
test('malformed lists are rejected with a typed recovery error, not an exception from some',async()=>{
  for(const result of [null,{},[],{ok:true,obligations:{}},{ok:true,obligations:[null],next_offset:null},{ok:true,obligations:[],next_offset:0},{ok:true,obligations:[]}]){
    const c=controller(async()=>result);await assert.rejects(c.read({action:'list'}),/bill|Bill/);
  }
});
test('unconfirmed or mismatched save receipts cannot clear retries or claim success',async()=>{
  for(const change of [()=>({}),()=>({ok:true}),()=>({ok:true,obligation:row}),body=>({ok:true,obligation:{...row,...body.obligation,source_key:'user:'+body.entry_id,amount_due_cents:1}}),body=>({ok:true,obligation:{...row,...body.obligation,source_key:'user:another'}})]){
    const bodies=[];const c=controller(async body=>{bodies.push(body);return change(body);});
    await assert.rejects(c.save(input));await assert.rejects(c.save(input));assert.equal(bodies[0].entry_id,bodies[1].entry_id);
  }
});
test('candidate confirmation and dismissal require exact record and outcome evidence',async()=>{
  const candidate={...row,status:'asserted',source_type:'bank'};
  const wrong=controller(async()=>({ok:true,obligation:{...row,id:'other-bill',...input}}));
  await assert.rejects(wrong.save(input,candidate),/matching saved bill/);
  const notDismissed=controller(async()=>({ok:true,obligation:{...candidate,status:'invalid',evidence:{dismissed_by_user:false}}}));
  await assert.rejects(notDismissed.dismiss(candidate),/did not confirm dismissal/);
  const malformedPlan=controller(async()=>({ok:true,obligation:row,assessment:{state:'paid'}}));
  await assert.rejects(malformedPlan.read({action:'plan',obligation_id:row.id}),/assessment is incomplete/);
});
test('after a proved save and failed list refresh, the saved proof stays visible without resubmission',async()=>{
  const calls=[];const f=fixture(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(body.action==='list')throw Error('list offline');return response({ok:true,obligation:{...row,...body.obligation,source_key:'user:'+body.entry_id}});});
  f.ctx.renderBillWorkflows();
  for(const [id,value] of [['billCreditor','Nema'],['billAmount','100.01'],['billDue','2026-10-11'],['billKind','rent'],['billAutopay','off']])f.ctx.document.getElementById(id).value=value;
  f.ctx.document.getElementById('billConfirmed').checked=true;await f.nodes.get('billEditor').onsubmit({preventDefault(){}});
  assert.match(f.nodes.get('billStatus').textContent,/Bill saved.*ID …123456/);assert.match(f.nodes.get('billStatus').textContent,/list could not refresh/);assert.equal(calls.filter(body=>body.action==='save').length,1);assert.equal(f.nodes.get('billCreditor').value,'');
});
test('a malformed save leaves the form details intact and does not announce a saved bill',async()=>{
  const f=fixture(async(_url,options)=>response(JSON.parse(options.body).action==='list'?{ok:true,obligations:[],next_offset:null}:{ok:true}));await f.ctx.renderBillWorkflows();
  for(const [id,value] of [['billCreditor','Nema'],['billAmount','100.01'],['billDue','2026-10-11'],['billKind','rent']])f.ctx.document.getElementById(id).value=value;
  f.ctx.document.getElementById('billConfirmed').checked=true;await f.nodes.get('billEditor').onsubmit({preventDefault(){}});
  assert.equal(f.nodes.get('billCreditor').value,'Nema');assert.equal(f.nodes.get('billConfirmed').checked,true);assert.doesNotMatch(f.nodes.get('billStatus').textContent,/Bill saved/);assert.equal(f.nodes.get('billStatus').attributes.role,'alert');
});
test('owner changes during after-save refresh cannot expose the previous owner receipt',async()=>{
  let resolve;const f=fixture(async(_url,options)=>{const body=JSON.parse(options.body);if(body.action==='list')return new Promise(r=>resolve=r);return response({ok:true,obligation:{...row,...body.obligation,source_key:'user:'+body.entry_id}});});
  // Bind form events with an initial list, then release it before creating a bill.
  const initial=f.ctx.renderBillWorkflows();resolve(response({ok:true,obligations:[],next_offset:null}));await initial;
  for(const [id,value] of [['billCreditor','Nema'],['billAmount','100.01'],['billDue','2026-10-11'],['billKind','rent']])f.ctx.document.getElementById(id).value=value;
  f.ctx.document.getElementById('billConfirmed').checked=true;const saved=f.nodes.get('billEditor').onsubmit({preventDefault(){}});
  await new Promise(r=>setImmediate(r));f.ctx.billReset();f.ctx.session={user:{id:'other'},access_token:'other-token'};resolve(response({ok:true,obligations:[row],next_offset:null}));await saved;
  assert.equal(f.nodes.get('billStatus').textContent,'');assert.equal(f.nodes.get('billRows').children.length,0);
});
test('template/build integration exposes all required controls and injects UI inside session scope',()=>{
  const template=fs.readFileSync(path.resolve(__dirname,'../src/upmore-app-template.html'),'utf8'),builder=fs.readFileSync(path.resolve(__dirname,'../src/build-app.py'),'utf8');
  const ui=fs.readFileSync(path.resolve(__dirname,'../src/bill-workflow-ui.js'),'utf8');
  for(const id of new Set([...ui.matchAll(/getElementById\('([^']+)'\)/g)].map(match=>match[1])))assert.match(template,new RegExp('id="'+id+'"'));
  assert.ok(template.indexOf('<!--__BILL_CONTROLLER__-->')<template.indexOf('/*__BILL_WORKFLOW_UI__*/'));assert.match(template,/if \(id === "bills"\) renderBillWorkflows\(\)/);
  assert.match(builder,/BILL_CONTROLLER.*bill-workflow-controller\.js/);assert.match(builder,/BILL_WORKFLOW_UI.*bill-workflow-ui\.js/);assert.match(template,/ledgerReset\(\); billReset\(\);/);
});
test('versioned editing binds request ID to exact bill, revision and reviewed facts',async()=>{
 const calls=[],editable={...row,revision:2};const c=controller(async body=>{calls.push(body);if(calls.length<3)throw Error('lost response');return {ok:true,obligation:{...editable,...body.obligation,revision:3},current_revision:3,superseded:false,replay:true};});
 await assert.rejects(c.edit(input,editable));await assert.rejects(c.edit(input,editable));const result=await c.edit(input,editable);
 assert.equal(result.obligation.revision,3);assert.equal(calls[0].request_id,calls[1].request_id);assert.equal(calls[1].request_id,calls[2].request_id);assert.equal(calls[0].expected_revision,2);assert.equal(calls[0].obligation_id,row.id);assert.equal(calls[0].action,'edit');
 const changed=controller(async body=>{calls.push(body);throw Error('lost');});await assert.rejects(changed.edit(input,editable));await assert.rejects(changed.edit({...input,amount:'30'},editable));assert.notEqual(calls[3].request_id,calls[4].request_id);
});
test('editing cannot target a foreign, provider-owned, settled or unversioned bill',async()=>{
 let calls=0;const c=controller(async()=>{calls++;return {}});
 for(const patch of [{user_id:'other'},{source_type:'biller'},{status:'settled'},{revision:undefined},{revision:0},{currency:'EUR'},{direction:'receivable'}])await assert.rejects(c.edit(input,{...row,revision:1,...patch}),/current editable/);
 assert.equal(calls,0);
});
test('historical retry receipt never announces outdated edits as the current bill',async()=>{
 const c=controller(async body=>({ok:true,obligation:{...row,...body.obligation,revision:2},current_revision:3,replay:true,superseded:true}));
 await assert.rejects(c.edit(input,{...row,revision:1}),/earlier edit was saved.*since changed/);
 const malformed=controller(async body=>({ok:true,obligation:{...row,...body.obligation,revision:2},current_revision:3,replay:false,superseded:false}));await assert.rejects(malformed.edit(input,{...row,revision:1}),/receipt/);
});
test('bill edit form requires a new confirmation and preserves details after a stale conflict',async()=>{
 const calls=[],editable={...row,revision:1};const f=fixture(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(body.action==='edit')throw Error('bill changed; reload the current version');return response({ok:true,obligations:[editable],next_offset:null});});
 await f.ctx.renderBillWorkflows();const edit=f.nodes.get('billRows').children[0].children.find(n=>n.textContent==='Edit current bill');assert.ok(edit);edit.onclick();
 assert.equal(f.nodes.get('billConfirmed').checked,false);assert.equal(f.nodes.get('billDismiss').hidden,true);assert.match(f.nodes.get('billEditorTitle').textContent,/version 1/);
 await f.nodes.get('billEditor').onsubmit({preventDefault(){}});assert.equal(calls.filter(c=>c.action==='edit').length,0);
 f.nodes.get('billConfirmed').checked=true;f.nodes.get('billAmount').value='30';await f.nodes.get('billEditor').onsubmit({preventDefault(){}});
 assert.equal(calls.at(-1).expected_revision,1);assert.equal(calls.at(-1).obligation.amount_due_cents,3000);assert.equal(f.nodes.get('billAmount').value,'30');assert.match(f.nodes.get('billStatus').textContent,/bill changed/);assert.doesNotMatch(f.nodes.get('billStatus').textContent,/changes saved/);
});
test('a successful edit states proposal invalidation and cannot submit a payment',async()=>{
 const calls=[],editable={...row,revision:1};const f=fixture(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return response(body.action==='edit'?{ok:true,obligation:{...editable,...body.obligation,revision:2},current_revision:2,superseded:false,replay:false}:{ok:true,obligations:[editable],next_offset:null});});
 await f.ctx.renderBillWorkflows();f.ctx.billSelectEdit(editable);f.nodes.get('billConfirmed').checked=true;await f.nodes.get('billEditor').onsubmit({preventDefault(){}});
 assert.match(f.nodes.get('billStatus').textContent,/changes saved; earlier proposals invalidated/);assert.match(f.nodes.get('billStatus').textContent,/No payment was made/);assert.deepEqual(calls.map(c=>c.action),['list','edit','list']);
});
