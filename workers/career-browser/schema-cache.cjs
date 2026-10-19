"use strict";
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {hostAllowed}=require('../../packages/domain/150-career-portal-browser.js');
const {payloadHash}=require('./apply-queue.cjs');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function cleanFields(fields){
  if(!Array.isArray(fields)||!fields.length||fields.length>250)throw Error('INVALID_FORM_SCHEMA');
  const names=new Set();const text=(v,n)=>{if(typeof v!=='string'||!v.trim()||v.length>n)throw Error('INVALID_FORM_SCHEMA');return v;};
  return fields.map(f=>{
    if(!f||typeof f.required!=='boolean'||!Array.isArray(f.options)||f.options.length>500||names.has(f.name))throw Error('INVALID_FORM_SCHEMA');
    names.add(f.name);
    return {name:text(f.name,300),label:text(f.label,500),type:text(f.type,80),required:f.required,
      options:f.options.map(o=>{if(!o||typeof o.value!=='string'||o.value.length>500||typeof o.label!=='string'||o.label.length>500)throw Error('INVALID_FORM_SCHEMA');return {label:o.label,value:o.value};})};
  });
}

// Cached schemas are preparation hints only. They never supply answers,
// element references, readback, approval, or evidence for a submit click.
function createSchemaCache(root,{now=Date.now,ttl=6*60*60*1000}={}){
  if(!Number.isFinite(ttl)||ttl<=0||ttl>24*60*60*1000)throw Error('INVALID_CACHE_TTL');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const st=fs.lstatSync(root);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)||(process.getuid&&st.uid!==process.getuid()))throw Error('PRIVATE_CACHE_REQUIRED');
  function binding(owner,url){
    if(typeof owner!=='string'||!owner.trim()||owner.length>160)throw Error('CACHE_OWNER_REQUIRED');
    const u=new URL(url),gate=hostAllowed(url);u.hash='';
    if(u.protocol!=='https:'||u.username||u.password||!gate.allowed||!['lever','ashby','smartrecruiters'].includes(gate.atsFamily))throw Error('CACHE_POSTING_REFUSED');
    return {file:path.join(root,digest(owner+'\n'+u.href)+'.json'),owner:digest(owner),posting:digest(u.href),origin:u.origin};
  }
  function put(owner,url,observation){
    const b=binding(owner,url);
    if(!observation||typeof observation.version!=='string'||!observation.version||observation.origin!==b.origin)throw Error('OBSERVATION_SCOPE_MISMATCH');
    const fields=cleanFields(observation.fields),entry={version:1,owner:b.owner,posting:b.posting,origin:b.origin,observedAt:now(),fields,schemaHash:payloadHash(fields)};
    const body=JSON.stringify(entry);if(Buffer.byteLength(body)>262144)throw Error('FORM_SCHEMA_TOO_LARGE');
    const tmp=b.file+'.'+crypto.randomUUID()+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);
    try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(tmp,b.file);const dir=fs.openSync(root,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
    return entry.schemaHash;
  }
  function get(owner,url){
    const b=binding(owner,url);let fd;
    try{
      fd=fs.openSync(b.file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      const st=fs.fstatSync(fd);if(!st.isFile()||(st.mode&0o077)||st.size>262144)return null;
      const v=JSON.parse(fs.readFileSync(fd,'utf8'));
      if(v.version!==1||v.owner!==b.owner||v.posting!==b.posting||v.origin!==b.origin||!Number.isFinite(v.observedAt)||v.observedAt>now()||now()-v.observedAt>=ttl)return null;
      const fields=cleanFields(v.fields);if(payloadHash(fields)!==v.schemaHash)return null;
      return {fields,schemaHash:v.schemaHash,observedAt:v.observedAt,needsFreshObservation:true};
    }catch(e){if(['ENOENT','ELOOP'].includes(e.code)||e instanceof SyntaxError||e.message==='INVALID_FORM_SCHEMA')return null;throw e;}
    finally{if(fd!==undefined)fs.closeSync(fd);}
  }
  return {put,get,remove(owner,url){fs.rmSync(binding(owner,url).file,{force:true});}};
}
module.exports={createSchemaCache};
