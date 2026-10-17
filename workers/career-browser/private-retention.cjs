'use strict';
// Local data expiry has no RPC transport or backend credential. A referenced
// timer continues after polling stops. Abrupt host death still needs the
// operator's private-volume destruction policy; no process can clean while dead.
const {hash,fail}=require('./store.cjs');
function createPrivateRetention({store,eraseEvidence=()=>{},clock=Date.now,schedule=setTimeout,ttlMs=900000}){
 if(!Number.isInteger(ttlMs)||ttlMs<100||ttlMs>900000)throw fail('PRIVATE_RETENTION_CONFIGURATION_INVALID');
 let timer,cancelled=false;
 function stamp(t){
  if(t.privateExpiredAt!==undefined)return;
  if(!Number.isFinite(t.privateExpiresAt))t.privateExpiresAt=(store.writtenAt?.(t.id)??clock())+ttlMs;
 }
 function purge(t){
  eraseEvidence(t.id);
  const terminal=['completed','evidence_ready','insufficient_evidence'].includes(t.status);
  const tombstone={id:t.id,userId:t.userId,kind:t.kind||'career_application',privacyEpoch:t.privacyEpoch,
   revision:t.revision,phase:'check',status:terminal?t.status:t.attempt?'unknown_outcome':'cancelled',blocker:'PRIVATE_RETENTION_EXPIRED',
   spec:null,review:null,result:null,asks:[],evidence:{},authority:null,approvals:[],budget:t.budget,
   privateExpiresAt:t.privateExpiresAt,privateExpiredAt:clock(),
   checkpoints:[{phase:'check',action:'private_retention_purge',at:new Date(clock()).toISOString()}]};
  if(t.attempt)tombstone.attempt={fenced:true,receiptKey:hash([t.id,'submit']),unknown:t.status!=='completed'};
  for(const key of Object.keys(t))delete t[key];Object.assign(t,tombstone);store.put(t);
 }
 function sweep(immediate=false){
  let remaining=false,delay=ttlMs;
  for(const id of store.list())store.withLock(id,()=>{
   const t=store.get(id);if(!t||t.privateExpiredAt!==undefined)return;
   const hadDeadline=Number.isFinite(t.privateExpiresAt);stamp(t);
   if(immediate||t.privateExpiresAt<=clock()){purge(t);return;}
   if(!hadDeadline)store.put(t);
   remaining=true;delay=Math.min(delay,Math.max(1,t.privateExpiresAt-clock()));
  });
  const temporary=store.expireTemporary?.(ttlMs,clock(),immediate);if(temporary?.remaining){remaining=true;delay=Math.min(delay,temporary.delay);}
  return {remaining,delay};
 }
 function arm(){
  cancel();cancelled=false;
  const tick=()=>{if(cancelled)return;const next=sweep();if(next.remaining)timer=schedule(tick,next.delay);};tick();
 }
 function cancel(){cancelled=true;clearTimeout(timer);}
 function expired(t){stamp(t);return t.privateExpiredAt!==undefined||t.privateExpiresAt<=clock();}
 return {stamp,sweep,arm,cancel,expired,expire:purge};
}
module.exports={createPrivateRetention};
