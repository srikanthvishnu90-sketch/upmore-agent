'use strict';
// Only accepts files produced by the board's screenshot method. It cannot
// manufacture a PNG, fetch a screenshot, or accept a client-supplied image.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fail}=require('./store.cjs');
function createEvidenceCapture(root,{maxFileBytes=10485760,maxTaskBytes=67108864}={}){
  if(!path.isAbsolute(root)||!Number.isSafeInteger(maxFileBytes)||!Number.isSafeInteger(maxTaskBytes)||maxFileBytes<1||maxFileBytes>10485760||maxTaskBytes<maxFileBytes||maxTaskBytes>134217728)throw fail('EVIDENCE_CONFIGURATION_INVALID');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(root);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw fail('EVIDENCE_PRIVATE_DIRECTORY_REQUIRED');
  function folder(id){if(!/^[a-f0-9]{32}$/.test(id||''))throw fail('TASK_ID_INVALID');return path.join(root,id);}
  function capture(task,board,stage){
    if(!['form-read','filled-review','confirmed-receipt'].includes(stage))throw fail('EVIDENCE_STAGE_INVALID');
    if(typeof board?.screenshot!=='function')return {status:'NOT_WIRED',stage};
    const dir=folder(task.id);fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const used=fs.readdirSync(dir).reduce((sum,f)=>sum+fs.lstatSync(path.join(dir,f)).size,0);
    if(used+maxFileBytes>maxTaskBytes)return {status:'BLOCKED',stage,code:'EVIDENCE_STORAGE_BUDGET'};
    const file=stage+'-'+crypto.randomUUID()+'.png',target=path.join(dir,file);
    try{
      board.screenshot(target);
      const stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxFileBytes)throw fail('EVIDENCE_PNG_INVALID');
      const bytes=fs.readFileSync(target);if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw fail('EVIDENCE_PNG_INVALID');
      const fd=fs.openSync(target,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      return {status:'CAPTURED',stage,ref:task.id+'/'+file,bytes:bytes.length,mimeType:'image/png',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),capturedAt:new Date().toISOString()};
    }catch(_){try{fs.unlinkSync(target);}catch(_){}return {status:'BLOCKED',stage,code:'EVIDENCE_CAPTURE_FAILED'};}
  }
  return {capture,erase:id=>fs.rmSync(folder(id),{recursive:true,force:true})};
}
module.exports={createEvidenceCapture};
