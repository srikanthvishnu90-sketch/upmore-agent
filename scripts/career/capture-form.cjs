"use strict";
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const {execFile}=require('node:child_process');const {promisify}=require('node:util');const exec=promisify(execFile);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function publicURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!['greenhouse.io','lever.co','ashbyhq.com','smartrecruiters.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('PUBLIC_ATS_URL_REQUIRED');return u.href;}
const decode=s=>s.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi,x=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[x.toLowerCase()]||String.fromCodePoint(parseInt(x.slice(x[2].toLowerCase()==='x'?3:2,-1),x[2].toLowerCase()==='x'?16:10))));
function attrs(s){const out={};for(const m of s.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]??'');return out;}
function analyzeHTML(html){
 const s=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');const labels=new Map();
 for(const m of s.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)){const a=attrs(m[1]);if(a.for)labels.set(a.for,decode(m[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()));}
 const fields=[];for(const m of s.matchAll(/<(input|select|textarea)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)){
  const a=attrs(m[2]),type=(a.type||m[1]).toLowerCase();if(['hidden','submit','button','image','reset'].includes(type)||Object.hasOwn(a,'disabled'))continue;
  const label=labels.get(a.id)||a['aria-label']||a.placeholder||'';
  fields.push({name:a.name||a.id||'',label,type,required:Object.hasOwn(a,'required')||a['aria-required']==='true'||/[*✱]\s*$/.test(label)});
 }
 return {forms:(s.match(/<form\b/gi)||[]).length,resume_inputs:fields.filter(f=>f.type==='file').length,fields};
}
// Every public URL is fetched once across resumptions; the manifest is also the
// rate-limit journal. A failed/uncertain request is retained, never auto-retried.
function createCapture(root){
 fs.mkdirSync(root,{recursive:true});const lock=path.join(root,'.capture.lock');const lockFd=fs.openSync(lock,'wx',0o600);
 const file=path.join(root,'manifest.json');const manifest=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,requests:[],forms:[]};
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-public-capture-'));let chain=Promise.resolve();
 const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(manifest,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
 async function get(url){url=publicURL(url);if(manifest.requests.some(r=>r.url===url))throw Error('PUBLIC_URL_ALREADY_REQUESTED');
  const wait=Math.max(0,(manifest.requests.at(-1)?.started_ms||0)+2000-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));
  const started_ms=Date.now(),r={url,method:'GET',started_ms,status:'pending'};manifest.requests.push(r);save();
  const body=path.join(tmp,sha(url)),headers=body+'.headers';
  try{const out=await exec('curl',['--silent','--show-error','--proto','=https','--max-time','45','--request','GET','--dump-header',headers,'--output',body,'--write-out','%{http_code}',url],{maxBuffer:1024*1024});
   const bytes=fs.readFileSync(body);r.status=Number(out.stdout);r.sha256=sha(bytes);r.completed_at=new Date().toISOString();save();return {status:r.status,bytes};
  }catch(e){const msg=String(e.stderr||'');r.status='blocked';r.error='PUBLIC_GET_FAILED';r.exit_code=e.code??null;
   r.reason=/CONNECT.*403|tunnel.*403/i.test(msg)?'EGRESS_CONNECT_403':/Could not resolve proxy/i.test(msg)?'INFRASTRUCTURE_PROXY_DNS':/Could not resolve host/i.test(msg)?'PUBLIC_HOST_DNS':/SSL|certificate|TLS/i.test(msg)?'TLS_FAILURE':/timed out/i.test(msg)?'PUBLIC_GET_TIMEOUT':/unknown|option|protocol/i.test(msg)?'CURL_ARGUMENT_REFUSED':'PUBLIC_TRANSPORT_FAILURE';
   r.completed_at=new Date().toISOString();save();throw Error(r.reason);}
 }
 const request=url=>{const p=chain.then(()=>get(url));chain=p.catch(()=>{});return p;};
 async function capture(source){
  if(!/^[a-z0-9_-]{1,160}$/.test(source.id)||!['greenhouse','lever','ashby','smartrecruiters'].includes(source.family))throw Error('INVALID_CAPTURE_SOURCE');
  if(manifest.forms.some(f=>f.id===source.id))throw Error('FORM_ALREADY_CAPTURED');
  const url=publicURL(source.url),captured_at=new Date().toISOString();let r;
  try{r=await request(url);}catch(e){manifest.forms.push({id:source.id,family:source.family,source_url:url,attempted_at:captured_at,status:'blocked',reason:e.message});save();return;}
  const html=r.bytes.toString('utf8'),a=analyzeHTML(html);const meta={source_url:url,captured_at,http_status:r.status,sha256:sha(html),...a};
  if(source.questions_url){const q=await request(source.questions_url).catch(()=>null);meta.questions_source=source.questions_url;meta.questions_status=q?.status??'blocked';if(q?.status===200)try{meta.questions=JSON.parse(q.bytes.toString('utf8'));}catch{meta.questions_error='INVALID_PUBLIC_JSON';}}
  fs.writeFileSync(path.join(root,source.id+'.html'),html);fs.writeFileSync(path.join(root,source.id+'.json'),JSON.stringify(meta,null,2)+'\n');
  const ok=r.status===200&&a.forms>0&&a.resume_inputs>0&&a.fields.some(f=>f.required);
  const entry={id:source.id,family:source.family,source_url:url,captured_at,status:ok?'captured':'blocked',reason:ok?null:r.status!==200?'HTTP_'+r.status:'FORM_NOT_PRESENT_IN_PUBLIC_HTML'};
  manifest.forms.push(entry);save();console.log(JSON.stringify({...entry,forms:a.forms,resume_inputs:a.resume_inputs,required:a.fields.filter(f=>f.required).length}));
 }
 return {capture,request,manifest,close(){fs.rmSync(tmp,{recursive:true,force:true});fs.closeSync(lockFd);fs.unlinkSync(lock);}};
}
if(require.main===module){(async()=>{const sourceFile=process.argv[2],out=process.argv[3];if(!sourceFile||!out)throw Error('usage: node capture-form.cjs sources.json output-directory');const sources=JSON.parse(fs.readFileSync(sourceFile,'utf8')),c=createCapture(out);try{for(const source of sources)await c.capture(source);}finally{c.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={publicURL,analyzeHTML,createCapture};
