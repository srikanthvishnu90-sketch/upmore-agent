// Synthetic DOM/controller verification; no browser or financial provider calls.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const hash='a'.repeat(64),owner='owner-a';
const fact={account_id:'account-a',transaction_id:'tx-a',fact_hash:'fact',amount_cents:-1234,posted_on:'2026-10-01',label:'<img onerror=steal()> ATM fee'};
const candidate={id:'candidate-a',kind:'bank_fee',amount_cents:1234,status:'open',remaining_cents:1234,recovered_cents:null,reversal:null,possible_refund:null,refund_linkage_status:'not_found',evidence:[fact],action:{type:'draft_request',sent_by:'user',requires_user_approval:true,executes:false,text:'Please review this fee.'}};
function report(overrides={}){return {ok:true,report:{owner_id:owner,currency:'USD',today:'2026-10-10',coverage_complete:false,candidates:[structuredClone(candidate)],total_candidates:1,next_offset:null,verified_recovered_cents:0,recovery_verification:'unavailable_without_trusted_refund_linkage',excluded:{unsupported_currency:0,unavailable:0},reference_hash:hash,source:{type:'retained_bank_records',reference_hash:hash,accounts:[{account_id:'account-a',name:'Checking',institution:'Synthetic Bank',status:'active'}],observations_are_not_complete_history:true},as_of:'2026-10-10T12:00:00Z',...overrides}};}
function factory(request,identity=()=>({owner,token:'token'})){const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/recovery-review-controller.js'),'utf8'),ctx);let ids=0;return ctx.UpmoreRecoveryReview({identity,request,uuid:()=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(++ids).padStart(12,'0')}`});}
function fixture(fetch){const nodes=new Map();function node(tag){return {tag,value:'',hidden:false,disabled:false,textContent:'',children:[],attributes:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(k,v){this.attributes[k]=v;},focus(){this.focused=true;}};}const document={getElementById(id){if(!nodes.has(id))nodes.set(id,node('div'));return nodes.get(id);},createElement:node};const ctx=vm.createContext({crypto:require('node:crypto').webcrypto,session:{user:{id:owner},access_token:'token'},document,fetch,AbortController,setTimeout,clearTimeout,UPMORE_BACKEND_URL:'https://example.invalid',UPMORE_ANON_KEY:'public'});for(const name of ['recovery-review-controller.js','recovery-review-ui.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src',name),'utf8'),ctx);return {ctx,nodes,call:code=>vm.runInContext(code,ctx)};}
const response=data=>({ok:true,json:async()=>data});
function contents(node){return [node.textContent,...node.children.map(contents)].join(' ');}
test('authenticated scan permits only read preparation with exact account/page scope',async()=>{const calls=[],c=factory(async body=>{calls.push(body);return report({account_id:'account-a'});});await c.scan({account_id:'account-a'});assert.equal(calls[0].action,'recovery_scan');assert.equal(calls[0].account_id,'account-a');assert.equal(calls[0].offset,0);assert.equal(Object.keys(c).sort().join(','),'cases,invalidate,openCase,scan,updateCase');await assert.rejects(c.scan({offset:-1}));await assert.rejects(factory(async()=>report(),()=>null).scan(),/Sign in/);});
test('unsupported recovery claims, unsafe money, malformed dates and execution commands fail closed',async()=>{
 for(const altered of [{verified_recovered_cents:1},{coverage_complete:true},{owner_id:'other-owner'},{today:'2026-02-30'},{next_offset:0},{candidates:[{...candidate,amount_cents:1.25}]},{candidates:[{...candidate,status:'recovered'}]},{candidates:[{...candidate,recovered_cents:0}]},{candidates:[{...candidate,action:{...candidate.action,executes:true}}]},{candidates:[{...candidate,evidence:[{...fact,posted_on:'2026-02-30'}]}]}])await assert.rejects(factory(async()=>report(altered)).scan());
});
test('credit leads require explicit unverified linkage and included accounts',async()=>{
 const credit={...fact,transaction_id:'credit',amount_cents:1000};await factory(async()=>report({candidates:[{...candidate,possible_refund:credit,refund_linkage_status:'unverified'}]})).scan();
 for(const altered of [{possible_refund:credit,refund_linkage_status:'verified'},{possible_refund:credit,refund_linkage_status:'not_found'},{possible_refund:{...credit,account_id:'foreign'},refund_linkage_status:'unverified'}])await assert.rejects(factory(async()=>report({candidates:[{...candidate,...altered}]})).scan());
});
test('delayed owner response and same-owner invalidation never restore private results',async()=>{
 for(const change of ['owner','invalidate']){let identity=owner,resolve;const c=factory(()=>new Promise(r=>resolve=r),()=>({owner:identity,token:'token'}));const pending=c.scan();if(change==='owner')identity='owner-b';else c.invalidate();resolve(report());assert.equal(await pending,null);}
});
test('renderer displays actual evidence as text, incomplete coverage and a draft without external sends',async()=>{
 const calls=[],f=fixture(async(_url,options)=>{calls.push(JSON.parse(options.body));return response(report());});await f.ctx.recoveryLoad();assert.match(contents(f.nodes.get('recoveryCoverage')),/Verified recovered: \$0\.00/);assert.match(contents(f.nodes.get('recoveryCoverage')),/Incomplete coverage/);assert.match(contents(f.nodes.get('recoveryRows')),/\$12\.34/);assert.match(contents(f.nodes.get('recoveryRows')),/<img onerror=steal\(\)>/);
 const item=f.nodes.get('recoveryRows').children[0],button=item.children.find(node=>node.textContent==='Review draft request'),panel=item.children[item.children.indexOf(button)+1];button.onclick();assert.equal(panel.hidden,false);assert.equal(button.attributes['aria-expanded'],'true');assert.equal(panel.children[1].value,candidate.action.text);assert.equal(calls.length,1);assert.equal(calls[0].action,'recovery_scan');assert.equal(item.innerHTML,undefined);
});
test('held funds and possibly related credits are never described as recovered cash',async()=>{
 const f=fixture(async()=>response(report({candidates:[{...candidate,kind:'stale_hold',possible_refund:{...fact,transaction_id:'credit',amount_cents:100},refund_linkage_status:'unverified'}]})));await f.ctx.recoveryLoad();assert.match(contents(f.nodes.get('recoveryRows')),/releasing a hold is not recovered money/);assert.match(contents(f.nodes.get('recoveryRows')),/Linkage is unverified/);
});
test('pagination rejects changed bank facts and retains existing evidence for honest retry',async()=>{
 let count=0;const f=fixture(async()=>response(++count===1?report({total_candidates:2,next_offset:1}):report({reference_hash:'b'.repeat(64),source:{...report().report.source,reference_hash:'b'.repeat(64)},candidates:[{...candidate,id:'candidate-b'}],total_candidates:2})));await f.ctx.recoveryLoad();const before=contents(f.nodes.get('recoveryRows'));assert.equal(await f.ctx.recoveryLoad(true),false);assert.equal(contents(f.nodes.get('recoveryRows')),before);assert.match(f.nodes.get('recoveryStatus').textContent,/changed between pages/);assert.equal(f.nodes.get('recoveryStatus').attributes.role,'alert');
});
test('reset clears evidence, open drafts and account selection; late UI response stays cleared',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const pending=f.ctx.recoveryLoad();f.ctx.recoveryReset();resolve(response(report()));await pending;assert.equal(f.nodes.get('recoveryRows').children.length,0);assert.equal(f.nodes.get('recoveryCoverage').children.length,0);assert.equal(f.nodes.get('recoveryMore').hidden,true);assert.equal(f.nodes.get('recoveryAccount').value,'');
});
test('verified empty scan explains limited coverage while failed scans give an error instead of an empty certification',async()=>{
 const empty=fixture(async()=>response(report({candidates:[],total_candidates:0})));await empty.ctx.recoveryLoad();assert.match(empty.nodes.get('recoveryStatus').textContent,/Incomplete coverage does not establish/);
 const failed=fixture(async()=>{throw Error('Offline. Retry when connected.');});await failed.ctx.recoveryLoad();assert.equal(failed.nodes.get('recoveryStatus').attributes.role,'alert');assert.match(failed.nodes.get('recoveryStatus').textContent,/Offline/);
});
test('later candidate pages carry the exact reviewed source hash and reject missing or malformed hashes',async()=>{
 const requests=[],c=factory(async body=>{requests.push(body);return report({candidates:[{...candidate,id:'page-two'}],total_candidates:2});});
 await c.scan({offset:1,reference_hash:hash});assert.equal(requests[0].reference_hash,hash);assert.equal(requests[0].offset,1);
 for(const input of [{offset:1},{offset:1,reference_hash:'wrong'},{reference_hash:'A'.repeat(64)},{account_id:' account-a'},{account_id:'account-a\n'}])await assert.rejects(c.scan(input));
 await assert.rejects(factory(async()=>report({reference_hash:'b'.repeat(64),source:{...report().report.source,reference_hash:'b'.repeat(64)},total_candidates:2})).scan({offset:1,reference_hash:hash}),/changed between pages/);
});
test('account filter scopes source accounts and candidate page bounds remain strict',async()=>{
 await assert.rejects(factory(async()=>report({account_id:'account-a',source:{...report().report.source,accounts:[{account_id:'foreign'}]}})).scan({account_id:'account-a'}));
 await assert.rejects(factory(async()=>report({candidates:Array.from({length:21},(_,i)=>({...candidate,id:'candidate-'+i})),total_candidates:21})).scan());
});
test('UI pagination submits reviewed hash and a failed fresh reload cannot retain a previous More cursor',async()=>{
 const requests=[];let request=0;
 const f=fixture(async(_url,options)=>{requests.push(JSON.parse(options.body));request++;if(request===3)throw Error('Reload unavailable');return response(request===1?report({total_candidates:2,next_offset:1}):report({candidates:[{...candidate,id:'candidate-b'}],total_candidates:2}));});
 await f.ctx.recoveryLoad();await f.ctx.recoveryLoad(true);assert.equal(requests[1].reference_hash,hash);assert.equal(requests[1].offset,1);
 f.call('recoveryOffset=1');await f.ctx.recoveryLoad();assert.equal(f.nodes.get('recoveryMore').hidden,true);assert.equal(f.call('recoveryOffset'),null);
});
test('coverage shows the actual excluded pending-date count',async()=>{
 const f=fixture(async()=>response(report({excluded:{unsupported_currency:0,unavailable:0,unknown_hold_date:3}})));await f.ctx.recoveryLoad();assert.match(contents(f.nodes.get('recoveryCoverage')),/Pending records without dates: 3/);
});

test('account choices use owned source labels and reset removes private account options',async()=>{
 const r=report().report;
 r.source.accounts[0].name='Private checking';r.source.accounts[0].institution='Owned bank';
 const f=fixture(async()=>({ok:true,json:async()=>({ok:true,report:r})}));
 await f.call('recoveryLoad()');
 const select=f.nodes.get('recoveryAccount');assert.equal(select.children.length,2);assert.equal(select.children[1].value,r.source.accounts[0].account_id);assert.match(select.children[1].textContent,/Private checking/);
 f.call('recoveryReset()');assert.equal(select.children.length,1);assert.equal(select.children[0].value,'');assert.equal(select.children[0].textContent,'All retained accounts');
});
const caseId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function caseRow(overrides={}){return {id:caseId,user_id:owner,kind:'bank_fee',version:1,status:'open',amount_cents:1234,currency:'USD',due_on:null,source_snapshot:[{user_id:owner,account_id:fact.account_id,provider_transaction_id:fact.transaction_id,fact_hash:fact.fact_hash,currency:'USD',amount_cents:fact.amount_cents,posted_on:fact.posted_on,is_pending:false,presence:'observed',merchant_raw:fact.label}],source_stale:false,recovered_cents:null,recovery_verification:'unavailable_user_report_only',...overrides};}
test('opening a recovery case requires explicit preparation confirmation and bound evidence with stable unchanged retry ID',async()=>{
 const calls=[],c=factory(async body=>{calls.push(body);throw Error('Lost response');});assert.throws(()=>c.openCase(candidate,false),/Confirm/);assert.throws(()=>c.openCase({...candidate,evidence:[{...fact,fact_hash:null}]},true),/fact references/);assert.throws(()=>c.openCase(candidate,true,'2026-02-30'));
 await assert.rejects(c.openCase(candidate,true));await assert.rejects(c.openCase(candidate,true));await assert.rejects(c.openCase(candidate,true,'2026-10-15'));
 assert.equal(calls[0].request_id,calls[1].request_id);assert.notEqual(calls[1].request_id,calls[2].request_id);assert.equal(calls[0].action,'recovery_case_open');assert.equal(calls[0].evidence[0].transaction_id,'tx-a');assert.equal(calls[0].confirmed,true);assert.equal(calls[0].due_on,null);assert.equal(calls[0].amount_cents,undefined);
});
test('open proof must match owner, amount, current source identities and preparation-only outcome',async()=>{
 const valid=factory(async()=>({ok:true,case:caseRow()}));assert.equal((await valid.openCase(candidate,true)).id,caseId);
 for(const wrong of [{user_id:'other'},{amount_cents:1235},{status:'user_reported_submitted'},{source_snapshot:[{...caseRow().source_snapshot[0],provider_transaction_id:'foreign'}]},{recovered_cents:1234}])await assert.rejects(factory(async()=>({ok:true,case:caseRow(wrong)})).openCase(candidate,true));
});
test('durable case list rejects foreign rows, malformed pagination and recovery certification',async()=>{
 for(const result of [{ok:true,owner_id:owner,recovery_verification:'unavailable_user_report_only',cases:[caseRow({user_id:'other'})],next_offset:null,verified_recovered_cents:null},{ok:true,owner_id:owner,recovery_verification:'unavailable_user_report_only',cases:[caseRow()],next_offset:0,verified_recovered_cents:null},{ok:true,owner_id:owner,recovery_verification:'unavailable_user_report_only',cases:[caseRow()],next_offset:null,verified_recovered_cents:1234}])await assert.rejects(factory(async()=>result).cases());
 const c=factory(async()=>({ok:true,owner_id:owner,recovery_verification:'unavailable_user_report_only',cases:[caseRow()],next_offset:null,verified_recovered_cents:null}));assert.equal((await c.cases()).cases.length,1);
});
test('case status changes bind expected version and user confirmation; stale sources permit closing only',async()=>{
 const calls=[],c=factory(async body=>{calls.push(body);return {ok:true,case:caseRow({version:2,status:body.status})};});assert.throws(()=>c.updateCase(caseRow(),'user_reported_submitted',false),/confirm/);assert.throws(()=>c.updateCase(caseRow({source_stale:true}),'user_reported_submitted',true),/facts changed/);assert.throws(()=>c.updateCase(caseRow({source_stale:true,status:'closed_user'}),'open',true),/facts changed/);
 await c.updateCase(caseRow(),'user_reported_submitted',true);assert.equal(calls[0].expected_version,1);assert.equal(calls[0].case_id,caseId);assert.equal(calls[0].action,'recovery_case_update');await c.updateCase(caseRow({source_stale:true}),'closed_user',true);
 await assert.rejects(factory(async()=>({ok:true,case:caseRow({status:'closed_user',version:1})})).updateCase(caseRow(),'closed_user',true),/changed/);
});
test('late case writes and list responses cannot expose a switched owner and reset clears pending retry identity',async()=>{
 let current=owner,resolve;const c=factory(()=>new Promise(r=>resolve=r),()=>({owner:current,token:'token'}));const opening=c.openCase(candidate,true);current='other';resolve({ok:true,case:caseRow()});assert.equal(await opening,null);
 current=owner;const listing=c.cases();c.invalidate();resolve({ok:true,owner_id:owner,recovery_verification:'unavailable_user_report_only',cases:[caseRow()],next_offset:null,verified_recovered_cents:null});assert.equal(await listing,null);
});
test('case UI renders user-reported submission and closure honestly, with reviewed local status controls only',async()=>{
 const calls=[],f=fixture(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return response({ok:true,owner_id:owner,recovery_verification:'unavailable_user_report_only',cases:[caseRow({status:'closed_user',source_stale:true})],next_offset:null,verified_recovered_cents:null});});await f.ctx.recoveryCasesLoad();const host=f.nodes.get('recoveryCases');assert.match(contents(host),/Closed does not mean paid or recovered/);assert.match(contents(host),/Recovered amount unverified/);
 const item=host.children[0],select=item.children.find(node=>node.tag==='select');assert.equal(select.children[0].disabled,true);assert.equal(select.children[1].disabled,true);assert.equal(select.children[2].disabled,false);const button=item.children.find(node=>node.textContent==='Save reported status');await button.onclick();assert.equal(calls.length,1);assert.match(f.nodes.get('recoveryCaseStatus').textContent,/confirm/);
 f.ctx.recoveryReset();assert.equal(host.children.length,0);assert.equal(f.nodes.get('recoveryCaseMore').hidden,true);
});
test('candidate Save requires checkbox and retains confirmed save proof if the case list cannot refresh',async()=>{
 const calls=[],f=fixture(async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(body.action==='recovery_scan')return response(report());if(body.action==='recovery_case_open')return response({ok:true,case:caseRow()});throw Error('Case list offline');});await f.ctx.recoveryLoad();const item=f.nodes.get('recoveryRows').children[0],button=item.children.find(node=>node.textContent==='Save recovery case');await button.onclick();assert.equal(calls.length,1);assert.match(f.nodes.get('recoveryCaseStatus').textContent,/Confirm/);
 const label=item.children.find(node=>node.tag==='label' && node.children[0]?.type==='checkbox');label.children[0].checked=true;await button.onclick();assert.equal(calls[1].action,'recovery_case_open');assert.match(f.nodes.get('recoveryCaseStatus').textContent,/Case saved/);assert.match(f.nodes.get('recoveryCaseStatus').textContent,/could not refresh/);assert.match(f.nodes.get('recoveryCaseStatus').textContent,/no request sent or refund confirmed/);
});
test('unchanged case statuses never write and superseded retry proof requires reload',async()=>{
 let calls=0;const c=factory(async()=>{calls++;return {ok:true,superseded:true,current_version:3,case:caseRow({version:2,status:'closed_user'})};});assert.throws(()=>c.updateCase(caseRow(),'open',true),/changed user-reported status/);assert.equal(calls,0);await assert.rejects(c.updateCase(caseRow(),'closed_user',true),/superseded/);
});
