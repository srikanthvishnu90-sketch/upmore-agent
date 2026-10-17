'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fail,hash}=require('./store.cjs');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function workerIdentity(root){
 if(!path.isAbsolute(root))throw fail('WORKER_IDENTITY_INVALID');fs.mkdirSync(root,{recursive:true,mode:0o700});
 const s=fs.lstatSync(root);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw fail('WORKER_PRIVATE_DIRECTORY_REQUIRED');
 const file=path.join(root,'worker-id');
 try{const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,crypto.randomUUID());fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const dir=fs.openSync(root,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}catch(e){if(e.code!=='EEXIST')throw e;}
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw fail('WORKER_IDENTITY_INVALID');
 const id=fs.readFileSync(file,'utf8');if(!UUID.test(id))throw fail('WORKER_IDENTITY_INVALID');return id;
}
function claimIdentity(worker,user,intent,task){const h=hash([worker,user,intent,task]);return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}
module.exports={workerIdentity,claimIdentity,UUID};
