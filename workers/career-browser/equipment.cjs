'use strict';
// Synchronous adapter contract over the EXISTING account and owned artifact
// store. No database, URL fetch, credential, transcript parsing or invented fact.
const fs=require('node:fs'),path=require('node:path');
const {hash,fail,clone}=require('./store.cjs');
const KEY=/^[A-Za-z0-9_-]{1,160}$/;
const safeKey=x=>KEY.test(x||'')&&!['__proto__','constructor','prototype'].includes(x);
const FIELDS=new Set(['name','first_name','last_name','preferred_name','email','phone','location','country','city','state','postal_code','linkedin','website','github','eeoChoice','education_school','education_degree','education_discipline','education_start_date','education_end_date','education_gpa','education_graduation_year']);
const TYPES=new Set(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']);
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
function createOwnedEquipmentResolver({authority,loadOwnedRecords,readOwnedBytes,root,maxBytes=10485760,ttlMs=900000,now=Date.now,schedule=setTimeout}){
 if(typeof authority?.current!=='function'||typeof loadOwnedRecords!=='function'||typeof readOwnedBytes!=='function'||!path.isAbsolute(root)||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>10485760||!Number.isInteger(ttlMs)||ttlMs<100||ttlMs>900000)throw fail('EQUIPMENT_CONFIGURATION_INVALID');
 fs.mkdirSync(root,{recursive:true,mode:0o700});const s=fs.lstatSync(root);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)||fs.realpathSync(root)!==path.resolve(root))throw fail('EQUIPMENT_PRIVATE_DIRECTORY_REQUIRED');
 const active=new Map();let inheritedTimer;
 function account(userId,scope){const a=authority.current(userId);if(a?.then||!a?.exists||a.paused||a.version!==scope.accountVersion||a.epoch!==scope.privacyEpoch)throw fail('STALE_EQUIPMENT_AUTHORITY');return a;}
 function confirmation(record,userId,epoch){const c=record.confirmation;return record.userId===userId&&record.privacyEpoch===epoch&&c?.confirmed===true&&c.userId===userId&&KEY.test(c.ref||'')&&Number.isFinite(Date.parse(c.at))&&Date.parse(c.at)<=now();}
 function value(v){if(typeof v==='string')return v.length<=12000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);if(typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v);return Array.isArray(v)&&v.length<=25&&v.every(x=>typeof x==='string'&&x.length<=1000&&!/[\x00-\x1f\x7f]/.test(x));}
 function purgeExpired(){
  clearTimeout(inheritedTimer);inheritedTimer=undefined;
  if(!fs.existsSync(root))return;
  let remaining=Infinity;
  for(const file of fs.readdirSync(root).filter(f=>/^resume-[a-f0-9]{16}-[A-Za-z0-9]+$/.test(f))){
   const p=path.join(root,file),s=fs.lstatSync(p);
   if(s.isSymbolicLink()||!s.isDirectory())throw fail('EQUIPMENT_PATH_INVALID');
   if(active.has(p))continue; // own active copies already have exact release timers
   const left=ttlMs-(now()-s.mtimeMs);
   if(left<=0)fs.rmSync(p,{recursive:true,force:true});else remaining=Math.min(remaining,left);
  }
  // A restart must enroll young inherited copies, not just sweep old ones.
  // Recheck their age at the deadline; never erase a still-young copy early.
  if(Number.isFinite(remaining)){inheritedTimer=schedule(purgeExpired,Math.max(1,Math.ceil(remaining)));inheritedTimer?.unref?.();}
 }
 purgeExpired();
 function resolveEquipment(userId,artifactId,scope){
  if(typeof userId!=='string'||!userId||!KEY.test(artifactId||'')||!scope||!Number.isSafeInteger(scope.accountVersion)||!Number.isSafeInteger(scope.privacyEpoch)||(typeof scope.postingKey!=='string'||!scope.postingKey||scope.postingKey.length>512||/[\x00-\x1f\x7f]/.test(scope.postingKey))||!/^[a-f0-9]{64}$/.test(scope.resumeSha256||''))throw fail('EQUIPMENT_SCOPE_REQUIRED');
  account(userId,scope);
  const records=loadOwnedRecords(userId,artifactId,clone(scope));
  if(records?.then)throw fail('SYNC_EQUIPMENT_ADAPTER_REQUIRED');
  if(records?.version!=='career_owned_equipment/v1'||records.userId!==userId||records.accountVersion!==scope.accountVersion||records.privacyEpoch!==scope.privacyEpoch||!Array.isArray(records.facts)||records.facts.length>200||records.facts.some(f=>!f||typeof f!=='object'||Array.isArray(f)))throw fail('EQUIPMENT_OWNER_MISMATCH');
  const artifact=records.artifact;
  if(!artifact||artifact.id!==artifactId||!KEY.test(artifact.versionId||'')||!confirmation(artifact,userId,scope.privacyEpoch))throw fail('RESUME_CONFIRMATION_REQUIRED');
  if(!/^[^\x00-\x1f\x7f/\\]{1,180}$/.test(artifact.filename||'')||['.','..'].includes(artifact.filename)||!TYPES.has(artifact.contentType)||!Number.isSafeInteger(artifact.bytes)||artifact.bytes<1||artifact.bytes>maxBytes||artifact.sha256!==scope.resumeSha256)throw fail('RESUME_ARTIFACT_INVALID');
  const profile={},attestations={},accepted=[],seen=new Set();
  for(const fact of records.facts.slice().sort((a,b)=>String(a.kind+':'+a.key).localeCompare(String(b.kind+':'+b.key)))){
   if(!confirmation(fact,userId,scope.privacyEpoch))continue;
   if(!['fact','answer','attestation'].includes(fact.kind)||!safeKey(fact.key)||!value(fact.value))throw fail('CONFIRMED_FACT_INVALID');
   if(fact.kind!=='fact'&&fact.postingKey!==scope.postingKey)continue;
   if(fact.kind==='attestation'&&(!/^[a-f0-9]{64}$/.test(fact.wordingSha256||'')||scope.attestationBindings?.[fact.key]!==fact.wordingSha256))continue;
   const id=fact.kind+':'+fact.key;if(seen.has(id))throw fail('CONFIRMED_FACT_CONFLICT');seen.add(id);
   if(fact.kind==='fact'){if(!FIELDS.has(fact.key))throw fail('UNSUPPORTED_CONFIRMED_FIELD');profile[fact.key]=clone(fact.value);}
   else {
    if(fact.postingKey!==scope.postingKey)continue;
    if(fact.kind==='answer'){profile.answers ||= {};profile.answers[fact.key]={confirmed:true,value:clone(fact.value),...(fact.draft===true?{draft:true}:{})};}
    else {if(!/^[a-f0-9]{64}$/.test(fact.wordingSha256||'')||scope.attestationBindings?.[fact.key]!==fact.wordingSha256)continue;attestations[fact.key]={explicit:true,value:clone(fact.value)};}
   }accepted.push(fact);
  }
  // The scoped byte reader must return ownership/version as well as bytes.
  const blob=readOwnedBytes(userId,clone(artifact),clone(scope));
  if(blob?.then)throw fail('SYNC_EQUIPMENT_ADAPTER_REQUIRED');
  if(blob?.userId!==userId||blob.artifactId!==artifactId||blob.versionId!==artifact.versionId||!Buffer.isBuffer(blob.bytes))throw fail('RESUME_BYTES_OWNER_MISMATCH');
  if(blob.bytes.length!==artifact.bytes||blob.bytes.length>maxBytes)throw fail('RESUME_SHA_MISMATCH');
  const bytes=Buffer.from(blob.bytes);if(hash(bytes)!==artifact.sha256)throw fail('RESUME_SHA_MISMATCH');
  if((artifact.contentType==='application/pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')||(artifact.contentType.includes('wordprocessingml')&&bytes.subarray(0,4).toString('hex')!=='504b0304')||(artifact.contentType==='text/plain'&&bytes.includes(0)))throw fail('RESUME_CONTENT_TYPE_MISMATCH');
  account(userId,scope); // a correction/erase during either read must block
  profile.resume={filename:artifact.filename,sha256:artifact.sha256,contentType:artifact.contentType,bytes:artifact.bytes};
  profile._provenanceSha256=hash(canonical({artifact,accepted}));
  const dir=fs.mkdtempSync(path.join(root,'resume-'+hash(userId).slice(0,16)+'-')),resumePath=path.join(dir,'resume-bytes');let timer;
  const release=()=>{clearTimeout(timer);active.delete(dir);fs.rmSync(dir,{recursive:true,force:true});};
  try{const fd=fs.openSync(resumePath,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}account(userId,scope);timer=schedule(release,ttlMs);active.set(dir,release);}
  catch(e){release();throw e;}
  return {userId,accountVersion:scope.accountVersion,privacyEpoch:scope.privacyEpoch,profile:canonical(profile),attestations,resumePath,release,artifactVersion:artifact.versionId,artifactSha256:artifact.sha256};
 }
 return {resolveEquipment,purgeExpired,close:()=>{for(const release of [...active.values()])release();purgeExpired();}};
}
module.exports={createOwnedEquipmentResolver};
