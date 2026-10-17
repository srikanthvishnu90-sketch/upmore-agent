'use strict';
// Only accepts files produced by the board's screenshot method. It cannot
// manufacture a PNG, fetch a screenshot, or accept a client-supplied image.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fail}=require('./store.cjs');
const LIMITS=Object.freeze({maxFileBytes:10485760,maxTaskBytes:67108864,maxRootBytes:134217728,maxFiles:16,maxRootFiles:128,ttlMs:900000});
function privateFolder(dir){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});const stat=fs.lstatSync(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)||fs.realpathSync(dir)!==path.resolve(dir))throw fail('EVIDENCE_PRIVATE_DIRECTORY_REQUIRED');
}
function pngBudget(target,bytes,limits=LIMITS){
  if(!path.isAbsolute(target)||path.extname(target)!=='.png')throw fail('EVIDENCE_PATH_INVALID');
  const dir=path.dirname(target);privateFolder(dir);
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.png'));
  const used=files.reduce((sum,f)=>{const s=fs.lstatSync(path.join(dir,f));if(!s.isFile()||s.isSymbolicLink())throw fail('EVIDENCE_PATH_INVALID');return sum+s.size;},0);
  if(bytes>limits.maxFileBytes||used+bytes>limits.maxTaskBytes||files.length>=limits.maxFiles)throw fail('EVIDENCE_STORAGE_BUDGET');
  if(limits.root){
    privateFolder(limits.root);if(dir!==limits.root&&path.dirname(dir)!==limits.root)throw fail('EVIDENCE_PATH_INVALID');
    let total=0,count=0;const collect=d=>{for(const f of fs.readdirSync(d)){const p=path.join(d,f),s=fs.lstatSync(p);if(s.isSymbolicLink())throw fail('EVIDENCE_PATH_INVALID');if(s.isFile()&&f.endsWith('.png')){total+=s.size;count++;}}};
    collect(limits.root);for(const f of fs.readdirSync(limits.root)){const p=path.join(limits.root,f),s=fs.lstatSync(p);if(s.isDirectory())collect(p);}
    if(total+bytes>limits.maxRootBytes||count>=limits.maxRootFiles)throw fail('EVIDENCE_STORAGE_BUDGET');
  }
}
function writeBrowserPNG(target,bytes,limits=LIMITS){
  pngBudget(target,bytes.length,limits);
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw fail('EVIDENCE_PNG_INVALID');
  let fd;try{fd=fs.openSync(target,'wx',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}catch(e){if(fd!==undefined)try{fs.unlinkSync(target);}catch(_){}throw e;}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function copyBrowserPNG(source,target,options={}){
  const stat=fs.lstatSync(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>LIMITS.maxFileBytes)throw fail('EVIDENCE_PNG_INVALID');
  writeBrowserPNG(target,fs.readFileSync(source),{...LIMITS,...options});
}
function createEvidenceCapture(root,{maxFileBytes=10485760,maxTaskBytes=67108864}={}){
  if(!path.isAbsolute(root)||!Number.isSafeInteger(maxFileBytes)||!Number.isSafeInteger(maxTaskBytes)||maxFileBytes<1||maxFileBytes>10485760||maxTaskBytes<maxFileBytes||maxTaskBytes>134217728)throw fail('EVIDENCE_CONFIGURATION_INVALID');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(root);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw fail('EVIDENCE_PRIVATE_DIRECTORY_REQUIRED');
  function folder(id){if(!/^[a-f0-9]{32}$/.test(id||''))throw fail('TASK_ID_INVALID');return path.join(root,id);}
  function capture(task,board,stage,confirmationId){
    if(!['form-read','filled-review','confirmed-receipt'].includes(stage))throw fail('EVIDENCE_STAGE_INVALID');
    if(typeof board?.[stage==='confirmed-receipt'?'captureReceiptEvidence':'screenshot']!=='function')return {status:'NOT_WIRED',stage};
    const dir=folder(task.id);fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const used=fs.readdirSync(dir).reduce((sum,f)=>sum+fs.lstatSync(path.join(dir,f)).size,0);
    if(used+maxFileBytes>maxTaskBytes)return {status:'BLOCKED',stage,code:'EVIDENCE_STORAGE_BUDGET'};
    const file=stage+'-'+crypto.randomUUID()+'.png',target=path.join(dir,file);
    try{
      pngBudget(target,0,{...LIMITS,maxFileBytes,maxTaskBytes,root});
      if(stage==='confirmed-receipt'){
        const captured=board.captureReceiptEvidence(confirmationId,target);
        if(captured?.status!=='CAPTURED'||captured.confirmationId!==confirmationId||captured.path!==target){try{fs.unlinkSync(target);}catch(_){}return {status:captured?.status==='NOT_VERIFIED'?'NOT_VERIFIED':'BLOCKED',stage,code:/^[A-Z_]{1,80}$/.test(captured?.code||'')?captured.code:'EVIDENCE_CAPTURE_FAILED'};}
      }else board.screenshot(target);
      const stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxFileBytes)throw fail('EVIDENCE_PNG_INVALID');
      const bytes=fs.readFileSync(target);if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw fail('EVIDENCE_PNG_INVALID');
      const fd=fs.openSync(target,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      const at=Date.now();return {status:'CAPTURED',stage,ref:task.id+'/'+file,bytes:bytes.length,mimeType:'image/png',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),capturedAt:new Date(at).toISOString(),expiresAt:new Date(at+LIMITS.ttlMs).toISOString()};
    }catch(_){try{fs.unlinkSync(target);}catch(_){}return {status:'BLOCKED',stage,code:'EVIDENCE_CAPTURE_FAILED'};}
  }
  function expire(id,at=Date.now()){
    const dir=folder(id),removed=[];if(!fs.existsSync(dir))return removed;
    for(const file of fs.readdirSync(dir)){const target=path.join(dir,file),s=fs.lstatSync(target);if(s.isFile()&&at-s.mtimeMs>=LIMITS.ttlMs){fs.unlinkSync(target);removed.push(id+'/'+file);}}
    return removed;
  }
  function sweepUntracked(knownIds,{immediate=false,at=Date.now()}={}){
    const known=new Set(knownIds);
    for(const id of fs.readdirSync(root).filter(id=>/^[a-f0-9]{32}$/.test(id)&&!known.has(id))){
      const dir=folder(id),s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink())throw fail('EVIDENCE_PATH_INVALID');
      if(immediate){fs.rmSync(dir,{recursive:true,force:true});continue;}
      expire(id,at);if(!fs.readdirSync(dir).length)fs.rmdirSync(dir);
    }
  }
  function scheduleExpiry(onExpired=()=>{},clock=Date.now,schedule=setTimeout){
    let timer,cancelled=false;
    function sweep(){
      if(cancelled)return;let delay=LIMITS.ttlMs,remaining=false;
      for(const id of fs.readdirSync(root).filter(id=>/^[a-f0-9]{32}$/.test(id))){
        const removed=expire(id,clock());if(removed.length)try{onExpired(id,removed);}catch(_){} // TTL deletion must survive a busy metadata checkpoint
        if(!fs.readdirSync(folder(id)).length){fs.rmdirSync(folder(id));continue;}
        for(const file of fs.readdirSync(folder(id))){const s=fs.lstatSync(path.join(folder(id),file));if(s.isFile()){remaining=true;delay=Math.min(delay,Math.max(1,s.mtimeMs+LIMITS.ttlMs-clock()));}}
      }
      // Deliberately referenced: a graceful pilot stop closes RPC/browser
      // resources but keeps the local janitor alive until proof TTL expires.
      if(remaining)timer=schedule(sweep,delay);
    }
    sweep();return ()=>{cancelled=true;clearTimeout(timer);};
  }
  return {capture,expire,sweepUntracked,scheduleExpiry,erase:id=>fs.rmSync(folder(id),{recursive:true,force:true})};
}
module.exports={createEvidenceCapture,writeBrowserPNG,copyBrowserPNG,pngBudget,LIMITS};
