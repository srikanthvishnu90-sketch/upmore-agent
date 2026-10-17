'use strict';
// Structural and real loopback HTTP tests; NO browser or actual Greenhouse.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork,execFileSync}=require('node:child_process');
const Native=require('../workers/career-browser/greenhouse-native.cjs');
const {manifest}=require('./fixtures/greenhouse-native/manifest.cjs');
const {hash}=require('../workers/career-browser/store.cjs');
const Render=require('../packages/domain/148-career-render.js');
const Browser=require('../packages/domain/150-career-portal-browser.js');
function doc(type='pdf'){
 const result=Render[type==='pdf'?'renderPdf':'renderDocx']({header:{name:'SYNTHETIC Native Test',email:'synthetic@example.test'},sections:[{heading:'Experience',lines:[{text:'SYNTHETIC LOCAL MULTIPART TEST ONLY',type:'bullet'}]}]});assert.equal(result.ok,true);
 return {bytes:result.buffer,filename:'synthetic-resume.'+type,contentType:type==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
}
const payload=file=>({first_name:'Synthetic',last_name:'Native Test',email:'synthetic@example.test',resume:{filename:file.filename,sha256:hash(file.bytes)},resume_sha256:hash(file.bytes),sponsorship:'No'});
async function multipart(m,file,change=()=>{}){
 const form=new FormData(),p=payload(file);for(const f of m.fields){if(f.inputType==='file')form.append(f.name,new Blob([file.bytes],{type:file.contentType}),file.filename);else form.append(f.name,f.inputType==='select'?'no':p[f.field_id]);}change(form);
 const request=new Request(m.submitUrl,{method:'POST',body:form});return {body:Buffer.from(await request.arrayBuffer()),type:request.headers.get('content-type'),payload:p};
}
function raw(m){return m.fields.map((f,i)=>({...f,ref:'observed-'+i,disabled:false,readOnly:false}));}
test('only modeled loopback manifests are registrable; relabeling cannot activate employer',()=>{
 const m=manifest();assert.equal(Native.validateManifest(m).verification,'modeled_loopback');
 for(const url of ['https://boards.greenhouse.io/employer/jobs/123','https://job-boards.greenhouse.io/employer/jobs/123','http://127.0.0.1.attacker.test/form'])assert.throws(()=>Native.validateManifest({...m,url}),{code:'NATIVE_EMPLOYER_TRACE_REQUIRED'});
 assert.throws(()=>Native.validateManifest({...m,verification:'observed_employer'}),{code:'NATIVE_EMPLOYER_TRACE_REQUIRED'});
});
for(const [title,change]of [['duplicate name',m=>m.fields[1].name=m.fields[0].name],['duplicate selector',m=>m.fields[1].selector=m.fields[0].selector],['off-origin resources',m=>m.resourceUrls=['https://example.test/script']],['resume masquerading as cover letter',m=>m.fields[3].field_id='cover_letter']])test('manifest rejects '+title,()=>{const m=manifest();change(m);assert.throws(()=>Native.validateManifest(m),{code:'NATIVE_MANIFEST_INVALID'});});
test('exact bindings keep first and last names independent and preserve question identity',()=>{
 const m=manifest(),fields=Native.exactFields(m,raw(m));assert.equal(fields.defs[0].profile_key,'first_name');assert.equal(fields.defs[1].profile_key,'last_name');assert.deepEqual(fields.bindings.resume.elementRefs,['observed-3']);
});
for(const [title,change]of [['renamed DOM field',r=>r[0].name='other'],['changed question',r=>r[4].label='Do you consent?'],['changed options',r=>r[4].options=[{value:'no',label:'Yes'}]],['new required field',r=>r.push({...r[0],selector:'#extra'})],['duplicate DOM selector',r=>r[1].selector=r[0].selector],['disabled resume',r=>r[3].disabled=true]])test('binding refuses '+title,()=>{const m=manifest(),r=raw(m);change(r);assert.throws(()=>Native.exactFields(m,r),{code:'NATIVE_FIELD_BINDING_CHANGED'});});
for(const format of ['pdf','docx'])test('actual '+format.toUpperCase()+' bytes survive platform multipart encoding and native admission (LOCAL HTTP format)',async()=>{
 const m=manifest(),file=doc(format),wire=await multipart(m,file),out=Native.admitMultipart(m,wire.type,wire.body,wire.payload);assert.equal(out.resumeSha256,hash(file.bytes));assert.equal(out.fileBytes,file.bytes.length);assert.equal(out.contentType,file.contentType);assert.equal(out.source,'owned_chromium_outbound_multipart');assert.equal(out.receivedResumeSha256,undefined);
});
for(const [title,change,code]of [['wrong answer',f=>f.set('job_application[answers][sponsor]','yes'),'NATIVE_PAYLOAD_MISMATCH'],['extra hidden field',f=>f.set('unreviewed','yes'),'NATIVE_PAYLOAD_MISMATCH'],['duplicate field',f=>f.append('job_application[email]','other@example.test'),'NATIVE_MULTIPART_INVALID'],['wrong bytes',f=>f.set('job_application[resume]',new Blob(['changed'],{type:'application/pdf'}),'synthetic-resume.pdf'),'NATIVE_UPLOAD_MISMATCH']])test('outbound admission refuses '+title,async()=>{const m=manifest(),wire=await multipart(m,doc(),change);assert.throws(()=>Native.admitMultipart(m,wire.type,wire.body,wire.payload),{code});});
test('truncated multipart never reaches destination admission',async()=>{const m=manifest(),w=await multipart(m,doc());assert.throws(()=>Native.admitMultipart(m,w.type,w.body.subarray(0,w.body.length-10),w.payload),{code:'NATIVE_MULTIPART_INVALID'});});
test('native receipt requires exact scoped markup, an admitted successful request, and stays nonauthoritative',()=>{
 const m=manifest(),request={source:'owned_chromium_outbound_multipart',httpStatus:200},observation={url:m.receipt.url,text:m.receipt.text,id:'MODELED-12345',errors:[]};
 const r=Native.captureReceipt(m,observation,request);assert.equal(r.status,'receipt_observed');assert.equal(r.authoritative,false);
 for(const patch of [{url:m.url},{text:'Thank you for applying'},{id:null},{challenge:true},{errors:['Failed']}])assert.equal(Native.captureReceipt(m,{...observation,...patch},request).status,'unknown_outcome');
 assert.equal(Native.captureReceipt(m,observation,{...request,httpStatus:422}).status,'unknown_outcome');assert.equal(Native.captureReceipt(m,observation,null).status,'unknown_outcome');
});
test('native board never promotes generic thanks text into accepted and refuses second submit (MODELED command transport)',()=>{
 const m=manifest(),file=doc(),p=payload(file);let submits=0;
 const board=Browser.createBrowserBoard({url:m.url,userId:'synthetic',scope:{origin:new URL(m.url).origin,submitUrl:m.submitUrl},nativeManifest:m,commandTransport(id,cmd){switch(cmd.type){case 'open':return {ok:true,finalUrl:m.url};case 'discover':return {fields:raw(m),observation:{version:'synthetic-v1'}};case 'verify_payload':return {matches:true};case 'submit_and_capture':submits++;return {clicked:true,text:'Thank you for applying. Application ID: ABC12345',finalUrl:m.submitUrl};case 'close':return {};default:throw Error('Unexpected modeled command '+cmd.type);}}});
 try{board.open();board.form();board.armForSubmit({approvedByUser:true,approvalRef:'MOCK-approval',payload:p});assert.equal(board.submit().outcome,'unknown');assert.equal(board.submissionState().unverifiable,true);assert.throws(()=>board.submit(),{code:'SUBMIT_ALREADY_ATTEMPTED'});assert.equal(submits,1);}finally{board.close();}
});
async function localServer(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-native-http-'));const child=fork(path.join(__dirname,'fixtures/greenhouse-native/server.cjs'),[root],{stdio:['ignore','ignore','inherit','ipc']});t.after(()=>{child.kill();fs.rmSync(root,{recursive:true,force:true});});const {port}=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);});return {root,m:manifest('http://127.0.0.1:'+port)};}
function routeHarness(m,wire,override={}){
 const frame={},board={nativeManifest:m,page:{mainFrame:()=>frame},submitInProgress:true,mutationSent:false,nativePayload:wire.payload};let effects=0,aborts=0,forwarded;
 const route={request:()=>({frame:()=>frame,method:()=>'POST',url:()=>m.submitUrl,headers:()=>({'content-type':wire.type,'x-upmore-user':'INTERNAL-SYNTHETIC','x-upmore-task':'INTERNAL-TASK'}),postDataBuffer:()=>wire.body,...override}),abort:async()=>{aborts++;},fetch:async options=>{effects++;forwarded=options;const r=await fetch(m.submitUrl,{method:'POST',headers:options.headers,body:wire.body,redirect:'manual'});return {status:()=>r.status,headers:()=>Object.fromEntries(r.headers),body:async()=>Buffer.from(await r.arrayBuffer())};},fulfill:async()=>{}};
 return {board,route,count:()=>({effects,aborts,forwarded})};
}
for(const format of ['pdf','docx'])test('route sends one real '+format+' multipart to modeled loopback server, strips internal headers and prevents replay',async t=>{
 const {root,m}=await localServer(t),file=doc(format),w=await multipart(m,file),h=routeHarness(m,w);await Native.routeNative(h.board,h.route);await Native.routeNative(h.board,h.route);assert.equal(h.count().effects,1);assert.equal(h.count().aborts,1);assert.equal(h.count().forwarded.maxRedirects,0);
 const files=fs.readdirSync(root);assert.equal(files.length,1);const receipt=JSON.parse(fs.readFileSync(path.join(root,files[0])));assert.equal(receipt.receivedResumeSha256,hash(file.bytes));assert.equal(receipt.receivedFileBytes,file.bytes.length);assert.equal(receipt.contentType,file.contentType);assert.deepEqual(receipt.internalHeaders,[]);assert.equal(receipt.fields['job_application[first_name]'],'Synthetic');assert.equal(receipt.fields['job_application[last_name]'],'Native Test');assert.equal(receipt.fields['job_application[answers][sponsor]'],'no');
});
test('invalid outbound bytes, absent arming, wrong endpoint and frames cause zero network effects',async()=>{
 const m=manifest(),w=await multipart(m,doc());
 const cases=[h=>h.board.submitInProgress=false,h=>h.board.nativePayload={...w.payload,email:'different@example.test'},h=>h.route.request=()=>({frame:()=>({})}),h=>{const get=h.route.request;h.route.request=()=>({...get(),url:()=>m.submitUrl+'/unreviewed'});}];
 for(const change of cases){const h=routeHarness(m,w);change(h);await Native.routeNative(h.board,h.route);assert.equal(h.count().effects,0);assert.equal(h.count().aborts,1);}
});
test('transport uncertainty consumes mutation allowance before fetch; a later command cannot retry',async()=>{
 const m=manifest(),w=await multipart(m,doc()),h=routeHarness(m,w);let effects=0;h.route.fetch=async()=>{effects++;throw Error('MODELED connection lost after send');};await Native.routeNative(h.board,h.route);assert.equal(h.board.mutationSent,true);await Native.routeNative(h.board,h.route);assert.equal(effects,1);assert.equal(h.board.nativeBlocked,'NATIVE_MUTATION_REFUSED');
});
test('redirect is not followed and cannot become a receipt',async()=>{const m=manifest(),w=await multipart(m,doc()),h=routeHarness(m,w);h.route.fetch=async()=>({status:()=>302,headers:()=>({location:'https://example.test/unreviewed'})});let status;h.route.fulfill=async value=>{status=value.status;};await Native.routeNative(h.board,h.route);assert.equal(status,403);assert.equal(h.board.blockedNav,'https://example.test/unreviewed');assert.equal(Native.captureReceipt(m,{url:m.submitUrl,text:m.receipt.text,id:'MODELED-12345'},h.board.nativeOutbound).status,'unknown_outcome');});
test('representative HTML independently parses to the exact manifest fields (STATIC modeled fixture)',()=>{
 const parsed=JSON.parse(execFileSync('python3',[path.join(__dirname,'helpers/native-form-observation.py'),path.join(__dirname,'fixtures/greenhouse-native/form.html')],{encoding:'utf8'}));
 assert.equal(parsed.provenance,'STATIC_MODELED_FIXTURE_NOT_BROWSER');assert.equal(Native.exactFields(manifest(),parsed.fields).defs.length,5);
});
test('multiline textarea uses HTML form newline semantics without changing words or whitespace (platform multipart, no network)',async()=>{
 const m=manifest(),file=doc(),p={...payload(file),cover_note:'First paragraph.\n\nSecond paragraph.\nFinal line.'};m.fields.push({field_id:'cover_note',name:'job_application[cover_note]',selector:'#cover_note',label:'Cover note',inputType:'textarea',kind:'free_text',question_key:'cover_note',required:true});
 const form=new FormData();for(const f of m.fields)form.append(f.name,f.inputType==='file'?new Blob([file.bytes],{type:file.contentType}):f.inputType==='select'?'no':p[f.field_id],...(f.inputType==='file'?[file.filename]:[]));
 const request=new Request(m.submitUrl,{method:'POST',body:form}),body=Buffer.from(await request.arrayBuffer()),type=request.headers.get('content-type');assert.ok(body.includes(Buffer.from('paragraph.\r\n\r\nSecond')));
 assert.doesNotThrow(()=>Native.admitMultipart(m,type,body,p));
 for(const value of ['First paragraph.\nSecond paragraph.\nFinal line.','First paragraph. \n\nSecond paragraph.\nFinal line.','Different words.\n\nSecond paragraph.\nFinal line.'])assert.throws(()=>Native.admitMultipart(m,type,body,{...p,cover_note:value}),{code:'NATIVE_PAYLOAD_MISMATCH'});
});
test('pre-dispatch refusal is diagnostic; any admitted transmission stays uncertain',async()=>{
 const m=manifest(),w=await multipart(m,doc()),h=routeHarness(m,w);h.board.nativePayload={...w.payload,email:'changed@example.test'};await Native.routeNative(h.board,h.route);
 assert.equal(h.count().effects,0);assert.deepEqual(Native.dispatchObservation(h.board),{source:'owned_chromium_route_gate',state:'refused_before_dispatch',admittedMutations:0,code:'NATIVE_PAYLOAD_MISMATCH'});
 h.board.mutationSent=true;assert.equal(Native.dispatchObservation(h.board).state,'admitted_outcome_unconfirmed');
});
test('multipart quoted filenames preserve exact original identity and bytes (platform encoding, no network)',async()=>{
 const m=manifest(),file={...doc(),filename:'Synthetic "Resume".pdf'},w=await multipart(m,file);assert.ok(w.body.includes(Buffer.from('filename="Synthetic %22Resume%22.pdf"')));assert.doesNotThrow(()=>Native.admitMultipart(m,w.type,w.body,w.payload));
 assert.throws(()=>Native.admitMultipart(m,w.type,w.body,{...w.payload,resume:{...w.payload.resume,filename:'Synthetic Other.pdf'}}),{code:'NATIVE_UPLOAD_MISMATCH'});
 for(const filename of ['../Synthetic.pdf','unsafe\\Synthetic.pdf','Synthetic\nResume.pdf'])assert.throws(()=>Native.admitMultipart(m,w.type,w.body,{...w.payload,resume:{...w.payload.resume,filename}}),{code:'NATIVE_UPLOAD_MISMATCH'});
});
test('actual helper readback preserves Selecta and Select-prefixed prose; only empty select options are placeholders',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../scripts/career/portal-browser-helper.cjs'),'utf8'),start=source.indexOf('async function cmdReadback('),end=source.indexOf('\nasync function cmdReview(',start),nodes={name:{inputValue:async()=> 'Selecta'},note:{inputValue:async()=> 'Selected my project because it helped users.'},select:{evaluate:async fn=>fn({selectedIndex:0,options:[{value:'selective',textContent:'Selective research'}]})},placeholder:{evaluate:async fn=>fn({selectedIndex:0,options:[{value:'',textContent:'Select a choice'}]})}};
 const read=vm.runInNewContext('('+source.slice(start,end)+')',{assertNativeForm:async()=>{},connected:async(_,ref)=>nodes[ref]});
 const result=await read({}, {bindings:[{field_id:'first_name',inputType:'text',elementRefs:['name']},{field_id:'cover_note',inputType:'textarea',elementRefs:['note']},{field_id:'preference',inputType:'select',elementRefs:['select']},{field_id:'empty_choice',inputType:'select',elementRefs:['placeholder']}]});
 assert.equal(result.answers.first_name,'Selecta');assert.equal(result.answers.cover_note,'Selected my project because it helped users.');assert.equal(result.answers.preference,'Selective research');assert.equal(result.answers.empty_choice,undefined);
});
