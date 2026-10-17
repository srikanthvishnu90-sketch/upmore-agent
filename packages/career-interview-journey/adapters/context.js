'use strict';
const InterviewJourneyContext = (() => {
  const H = typeof InterviewJourneyHash !== 'undefined' ? InterviewJourneyHash : require('../../domain/interview-journey/hash.js');
  function assert(condition,message){if(!condition)throw Error(message);}
  function binding(snapshot,revision){return {owner_id:snapshot.owner_id,thread_id:snapshot.thread_id,...H.clone(snapshot.binding),journey_revision:revision};}
  function scope(item,snapshot){return item.owner_id===snapshot.owner_id&&(item.scope==='owner'||item.thread_id===snapshot.thread_id);}
  function eligible(item,snapshot){return scope(item,snapshot)&&item.validity?.status==='active'&&item.validity.epoch===snapshot.binding.epoch;}
  function validate(snapshot){
    assert(snapshot?.contract_version==='career_journey_context/v1','unsupported context contract');
    assert(typeof snapshot.owner_id==='string'&&typeof snapshot.thread_id==='string','missing owner/thread');
    assert(['epoch','account_version','thread_revision'].every(k=>Number.isSafeInteger(snapshot.binding?.[k])&&snapshot.binding[k]>=0)&&/^[a-f0-9]{64}$/.test(snapshot.binding.context_sha256),'invalid context binding');
    for(const key of ['facts','sources','dialogue','goals','pending_asks','invalidations','tool_status','receipts','artifacts','capabilities','assessments'])assert(Array.isArray(snapshot[key]),'missing context '+key);
    const ids=new Set();
    for(const item of [...snapshot.facts,...snapshot.sources]){
      assert(typeof item.id==='string'&&!ids.has(item.id),'duplicate/missing canonical evidence id');ids.add(item.id);
      assert(scope(item,snapshot),'foreign evidence owner/scope');
      assert(Number.isSafeInteger(item.version)&&item.version>0&&item.provenance&&item.trust&&item.validity,'missing evidence lineage');
      assert(item.validity.status==='active','inactive payload must be omitted, use value-free invalidations');
      assert(item.validity.epoch===snapshot.binding.epoch,'old epoch evidence');
    }
    for(const tombstone of snapshot.invalidations)assert(!('value' in tombstone)&&!('text' in tombstone)&&!('old_value' in tombstone),'invalidation must be value-free');
    const allowed=new Set(['contract_version','owner_id','thread_id','captured_at','binding','facts','sources','dialogue','current_draft','goals','pending_asks','invalidations','tool_status','receipts','artifacts','capabilities','assessments']);
    assert(Object.keys(snapshot).every(k=>allowed.has(k)),'unexpected context field; credentials/mutable host objects forbidden');
    H.canonical(snapshot); return snapshot;
  }
  const ref = item => ({id:item.id,version:item.version});
  function resolve(snapshot,r){const row=[...snapshot.facts,...snapshot.sources].find(x=>x.id===r?.id&&x.version===r.version&&eligible(x,snapshot));assert(row,'missing/stale evidence reference '+r?.id);return row;}
  function capability(snapshot,id){return snapshot.capabilities.find(c=>c.id===id)||{id,status:'not_wired',reason:'capability absent from host allowlist'};}
  function receipt(snapshot,id,type){const r=snapshot.receipts.find(x=>x.id===id&&x.type===type);assert(r&&r.owner_id===snapshot.owner_id&&r.thread_id===snapshot.thread_id&&r.epoch===snapshot.binding.epoch,'missing/foreign/old host receipt');return r;}
  function sameBinding(a,b){return H.canonical(a)===H.canonical(b);}
  return {assert,validate,binding,scope,eligible,ref,resolve,capability,receipt,sameBinding};
})();
if(typeof module!=='undefined')module.exports=InterviewJourneyContext;
