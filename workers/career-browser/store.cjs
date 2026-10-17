"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const hash = (v) => crypto.createHash("sha256").update(typeof v === "string" || Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest("hex");
const fail = (code, message = code) => Object.assign(new Error(message), { code });
const clone = (v) => JSON.parse(JSON.stringify(v));

// Local durable implementation. A distributed deployment needs a transactional
// adapter with equivalent compare-and-set/lease semantics, not an NFS mount.
function createFileTaskStore(root) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const safe = (id) => { if (!/^[a-f0-9]{32}$/.test(id)) throw fail("TASK_ID_INVALID"); return path.join(root, id + ".json"); };
  function get(id) {
    try { return JSON.parse(fs.readFileSync(safe(id), "utf8")); }
    catch (e) { if (e.code === "ENOENT") return null; throw e; }
  }
  function put(task) {
    const target = safe(task.id);
    task.revision = (task.revision || 0) + 1;
    const temp = target + "." + crypto.randomUUID() + ".tmp";
    let fd;
    try {
      fd=fs.openSync(temp,"wx",0o600);fs.writeFileSync(fd,JSON.stringify(task));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
      fs.renameSync(temp,target);
      const dir=fs.openSync(root,"r");try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
    }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp);}catch(_){} }
  }
  function withLock(id, fn) {
    const lock = safe(id) + ".lock";
    let fd;
    try { fd = fs.openSync(lock, "wx", 0o600); }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      // Never steal an aged lease. Only a demonstrably dead local owner may
      // be recovered; a reused PID conservatively keeps the lease locked.
      const owner = JSON.parse(fs.readFileSync(lock, "utf8"));
      try { process.kill(owner.pid, 0); throw fail("TASK_BUSY"); }
      catch (alive) { if (alive.code !== "ESRCH") throw alive; }
      fs.unlinkSync(lock);
      fd = fs.openSync(lock, "wx", 0o600);
    }
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); fs.fsyncSync(fd);
    try {
      const out = fn();
      if (out && typeof out.then === "function") throw fail("STORE_REQUIRES_SYNC_TRANSACTION");
      return out;
    } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
  const writtenAt=id=>{try{return fs.lstatSync(safe(id)).mtimeMs;}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  function expireTemporary(ttlMs,at,immediate=false){
    let remaining=false,delay=ttlMs;
    for(const file of fs.readdirSync(root).filter(f=>/^[a-f0-9]{32}\.json\.[a-f0-9-]+\.tmp$/.test(f))){
      const target=path.join(root,file),s=fs.lstatSync(target);if(!s.isFile()||s.isSymbolicLink())throw fail('PRIVATE_TEMPORARY_FILE_INVALID');
      if(immediate||at-s.mtimeMs>=ttlMs)fs.unlinkSync(target);else{remaining=true;delay=Math.min(delay,Math.max(1,s.mtimeMs+ttlMs-at));}
    }return {remaining,delay};
  }
  return { get, put, withLock, writtenAt, expireTemporary, list: () => fs.readdirSync(root).filter((x) => /^[a-f0-9]{32}\.json$/.test(x)).map((x) => x.slice(0, -5)) };
}
module.exports = { createFileTaskStore, hash, fail, clone };
