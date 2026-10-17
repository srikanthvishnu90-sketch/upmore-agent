'use strict';
// Native hosted-form mechanics, currently verified ONLY against modeled loopback
// fixtures. No Job Board API, endpoint guesses, credentials or employer activation.
const {hash,fail,clone}=require('./store.cjs');
const MIME={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
const key=/^[a-z][a-z0-9_]{0,79}$/;
function validateManifest(input){
 const m=clone(input);let u,s,r;
 try{u=new URL(m.url);s=new URL(m.submitUrl);r=new URL(m.receipt.url);}catch(_){throw fail('NATIVE_MANIFEST_INVALID');}
 // Actual employer traces were denied/not captured. A synthetic manifest cannot
 // authorize ANY external host, even by relabeling its provenance.
 if(m.verification!=='modeled_loopback'||u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname))throw fail('NATIVE_EMPLOYER_TRACE_REQUIRED');
 if([u,s,r].some(x=>x.origin!==u.origin||x.username||x.password||x.hash)||m.version!=='greenhouse_native/v1'||typeof m.canonicalKey!=='string'||!m.canonicalKey.startsWith('modeled:')||m.canonicalKey.length>200||!Array.isArray(m.fields)||m.fields.length<1||m.fields.length>80)throw fail('NATIVE_MANIFEST_INVALID');
 const selector=x=>typeof x==='string'&&/^#[A-Za-z][A-Za-z0-9_-]{0,100}$/.test(x);
 if(!selector(m.formSelector)||!selector(m.submitSelector)||!selector(m.receipt.selector)||!selector(m.receipt.idSelector)||typeof m.receipt.text!=='string'||!m.receipt.text||m.receipt.text.length>300||!Array.isArray(m.resourceUrls)||m.resourceUrls.length>40||m.resourceUrls.some(x=>{try{const v=new URL(x);return v.origin!==u.origin||v.username||v.password||v.hash;}catch(_){return true;}}))throw fail('NATIVE_MANIFEST_INVALID');
 const ids=new Set(),names=new Set(),selectors=new Set();let resumes=0;
 for(const f of m.fields){
  if(!key.test(f.field_id)||!selector(f.selector)||typeof f.name!=='string'||!f.name||f.name.length>160||/[\x00-\x20\x7f"\\]/.test(f.name)||typeof f.label!=='string'||!f.label||f.label.length>300||typeof f.required!=='boolean'||!['text','email','tel','url','file','select','textarea','checkbox'].includes(f.inputType)||!['standard','screening','free_text','attestation','eeo'].includes(f.kind)||ids.has(f.field_id)||names.has(f.name)||selectors.has(f.selector))throw fail('NATIVE_MANIFEST_INVALID');
  if(f.kind==='standard'?!key.test(f.profile_key||''):!key.test(f.question_key||''))throw fail('NATIVE_MANIFEST_INVALID');
  if(f.inputType==='file'){if(f.field_id!=='resume'||f.profile_key!=='resume'||!f.required)throw fail('NATIVE_MANIFEST_INVALID');resumes++;}
  if(f.inputType==='select'&&(!Array.isArray(f.options)||!f.options.length||f.options.some(x=>typeof x.label!=='string'||typeof x.value!=='string')||new Set(f.options.map(x=>x.label)).size!==f.options.length||new Set(f.options.map(x=>x.value)).size!==f.options.length))throw fail('NATIVE_MANIFEST_INVALID');
  ids.add(f.field_id);names.add(f.name);selectors.add(f.selector);
 }
 if(resumes!==1)throw fail('NATIVE_MANIFEST_INVALID');
 return m;
}
function exactFields(manifest,raw){
 const m=validateManifest(manifest);if(raw.length!==m.fields.length)throw fail('NATIVE_FIELD_BINDING_CHANGED');
 const bindings={},defs=[];
 for(const f of m.fields){const hits=raw.filter(x=>x.selector===f.selector);const r=hits[0];
  if(hits.length!==1||!r||r.name!==f.name||r.label!==f.label||r.inputType!==f.inputType||r.required!==f.required||r.disabled||r.readOnly||(f.inputType==='select'&&JSON.stringify(r.options)!==JSON.stringify(f.options)))throw fail('NATIVE_FIELD_BINDING_CHANGED');
  defs.push({field_id:f.field_id,label:f.label,kind:f.kind,required:f.required,...(f.profile_key?{profile_key:f.profile_key}:{}),...(f.question_key?{question_key:f.question_key}:{})});
  bindings[f.field_id]={field_id:f.field_id,selector:f.selector,inputType:f.inputType,options:r.options,elementRefs:[r.ref]};
 }return {defs,bindings};
}
function parseMultipart(contentType,body){
 const match=/^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9'()+_,.\/:=? -]{1,100})"|([A-Za-z0-9'()+_,.\/:=?-]{1,100}))$/i.exec(contentType||'');
 if(!match||!Buffer.isBuffer(body)||body.length>11*1024*1024)throw fail('NATIVE_MULTIPART_INVALID');
 const boundary=Buffer.from('--'+(match[1]||match[2])),separator=Buffer.concat([Buffer.from('\r\n'),boundary]);
 if(!body.subarray(0,boundary.length+2).equals(Buffer.concat([boundary,Buffer.from('\r\n')])))throw fail('NATIVE_MULTIPART_INVALID');
 const parts=[];let offset=boundary.length+2;
 while(offset<body.length){
  const end=body.indexOf('\r\n\r\n',offset);if(end<0||end-offset>4096||parts.length>=80)throw fail('NATIVE_MULTIPART_INVALID');
  const lines=body.subarray(offset,end).toString('utf8').split('\r\n');let name,filename,type;
  for(const line of lines){let h;
   if((h=/^Content-Disposition: form-data; name="([^"\r\n]+)"(?:; filename="([^"\r\n]*)")?$/i.exec(line))){if(name!==undefined)throw fail('NATIVE_MULTIPART_INVALID');name=h[1];filename=h[2];}
   else if((h=/^Content-Type: ([^\r\n]+)$/i.exec(line))){if(type!==undefined)throw fail('NATIVE_MULTIPART_INVALID');type=h[1];}
   else throw fail('NATIVE_MULTIPART_INVALID');
  }
  if(!name||parts.some(x=>x.name===name))throw fail('NATIVE_MULTIPART_INVALID');
  const next=body.indexOf(separator,end+4);if(next<0)throw fail('NATIVE_MULTIPART_INVALID');
  parts.push({name,filename,contentType:type,bytes:body.subarray(end+4,next)});offset=next+separator.length;
  if(body.subarray(offset,offset+2).toString()==='--'){
   offset+=2;const tail=body.subarray(offset);if(tail.length&&!tail.equals(Buffer.from('\r\n')))throw fail('NATIVE_MULTIPART_INVALID');return parts;
  }
  if(body.subarray(offset,offset+2).toString()!=='\r\n')throw fail('NATIVE_MULTIPART_INVALID');offset+=2;
 }throw fail('NATIVE_MULTIPART_INVALID');
}
function resumeType(bytes,filename){
 const ext=String(filename).split('.').pop().toLowerCase(),type=MIME[ext];
 if(!type||ext==='pdf'&&bytes.subarray(0,5).toString()!=='%PDF-'||ext==='docx'&&bytes.subarray(0,4).toString('hex')!=='504b0304')throw fail('NATIVE_RESUME_TYPE_INVALID');
 return type;
}
function admitMultipart(manifest,contentType,body,payload){
 const m=validateManifest(manifest),parts=parseMultipart(contentType,body),allowed=new Set(m.fields.map(x=>x.field_id).concat('resume_sha256'));
 if(!payload||Object.keys(payload).some(x=>!allowed.has(x)))throw fail('NATIVE_PAYLOAD_MISMATCH');
 for(const f of m.fields){const p=parts.find(x=>x.name===f.name),value=payload[f.field_id];
  if(f.inputType==='file'){
   if(!p||typeof value?.filename!=='string'||!/^[^\x00-\x1f\x7f/\\]{1,180}$/.test(value.filename)||['.','..'].includes(value.filename)||p.filename!==value.filename.replace(/"/g,'%22')||!p.bytes.length||hash(p.bytes)!==value.sha256||payload.resume_sha256!==value.sha256||resumeType(p.bytes,value.filename)!==p.contentType)throw fail('NATIVE_UPLOAD_MISMATCH');
  }else{
   if(p?.filename!==undefined)throw fail('NATIVE_PAYLOAD_MISMATCH');
   let expected=value===undefined?'':String(value);
   if(f.inputType==='select'&&value!==undefined){const option=f.options.find(x=>x.label===value);if(!option)throw fail('NATIVE_PAYLOAD_MISMATCH');expected=option.value;}
   if(f.inputType==='checkbox')expected=value===true?(f.checkedValue||'on'):'';
   if(f.required&&(value===undefined||value===''||(f.inputType==='checkbox'&&value!==true)))throw fail('NATIVE_PAYLOAD_MISMATCH');
   const observed=p?.bytes.toString('utf8')||'';
   // textarea DOM values use LF; HTML multipart serializes line breaks as CRLF.
   // Normalize line endings only, preserving paragraphs, spaces and wording.
   const text=v=>f.inputType==='textarea'?v.replace(/\r\n|\r/g,'\n'):v;
   if(text(observed)!==text(expected)||(!p&&expected!==''))throw fail('NATIVE_PAYLOAD_MISMATCH');
  }
 }
 if(parts.some(x=>!m.fields.some(f=>f.name===x.name)))throw fail('NATIVE_PAYLOAD_MISMATCH');
 const file=parts.find(x=>x.filename!==undefined);
 // These are locally observed outbound bytes, never claimed ATS-received hashes.
 return {source:'owned_chromium_outbound_multipart',requestSha256:hash(body),resumeSha256:hash(file.bytes),fileBytes:file.bytes.length,contentType:file.contentType,filename:payload.resume.filename,multipartFilename:file.filename,fieldNames:parts.map(x=>x.name)};
}
function captureReceipt(manifest,observation,request){
 const m=validateManifest(manifest);
 const valid=request?.source==='owned_chromium_outbound_multipart'&&Number.isInteger(request.httpStatus)&&request.httpStatus>=200&&request.httpStatus<300&&observation?.url===m.receipt.url&&observation.text===m.receipt.text&&typeof observation.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9-]{4,120}$/.test(observation.id)&&/\d/.test(observation.id)&&!observation.challenge&&!observation.errors?.length;
 return {source:'greenhouse_native_browser_capture',verification:'modeled_loopback',status:valid?'receipt_observed':'unknown_outcome',confirmationId:valid?observation.id:null,url:observation?.url||null,outbound:request||null,authoritative:false};
}
module.exports={validateManifest,exactFields,parseMultipart,resumeType,admitMultipart,captureReceipt};

// Route handler shared by the actual helper and isolated route regressions.
// Every hop is fetched with redirects disabled. No internal binding headers
// ever leave this adapter; outbound hashes remain explicitly client evidence.
async function routeNative(board,route){
 const m=board.nativeManifest,req=route.request();
 const refuse=async code=>{board.nativeBlocked=code;await route.abort('blockedbyclient');};
 try{
  if(req.frame()!==board.page.mainFrame())return await refuse('NATIVE_FRAME_REFUSED');
  const headers=Object.fromEntries(Object.entries(req.headers()).filter(([k])=>!/^x-upmore-|^proxy-authorization$/i.test(k)));
  if(req.method()==='POST'){
   if(!board.submitInProgress||board.mutationSent||req.url()!==m.submitUrl||!board.nativePayload)return await refuse('NATIVE_MUTATION_REFUSED');
   const outbound=admitMultipart(m,req.headers()['content-type'],req.postDataBuffer(),board.nativePayload);
   board.mutationSent=true; // consume BEFORE the network effect, including failure
   board.nativeOutbound=outbound;
  }else if(req.method()!=='GET'||![m.url,...m.resourceUrls].includes(req.url()))return await refuse('NATIVE_REQUEST_REFUSED');
  const response=await route.fetch({maxRedirects:0,headers});
  if(response.status()>=300&&response.status()<400){board.blockedNav=response.headers().location||req.url();return await route.fulfill({status:403,body:'Native redirect refused'});}
  if(req.method()==='POST')board.nativeOutbound.httpStatus=response.status();
  await route.fulfill({response});
 }catch(error){await refuse(error.code||'NATIVE_NETWORK_UNCERTAIN');}
}
module.exports.routeNative=routeNative;

// Diagnostic only. Never clears the worker/SQL submit fence or authorizes retry.
function dispatchObservation(board){
 if(board.mutationSent)return {source:'owned_chromium_route_gate',state:'admitted_outcome_unconfirmed',admittedMutations:1};
 if(board.nativeBlocked)return {source:'owned_chromium_route_gate',state:'refused_before_dispatch',admittedMutations:0,code:/^NATIVE_[A-Z_]+$/.test(board.nativeBlocked)?board.nativeBlocked:'NATIVE_REQUEST_REFUSED'};
 return {source:'owned_chromium_route_gate',state:'no_dispatch_observed',admittedMutations:0};
}
module.exports.dispatchObservation=dispatchObservation;
