'use strict';
const InterviewJourneyResearch = (() => {
  const H=typeof InterviewJourneyHash!=='undefined'?InterviewJourneyHash:require('../../domain/interview-journey/hash.js');
  const C=typeof InterviewJourneyContext!=='undefined'?InterviewJourneyContext:require('./context.js');
  function read(snapshot,result,pending){
    C.assert(pending?.kind==='research'&&result.action_id===pending.action_id,'uncorrelated research result');
    const status=snapshot.tool_status.find(x=>x.action_id===result.action_id&&x.owner_id===snapshot.owner_id&&x.thread_id===snapshot.thread_id&&x.input_digest===pending.input_digest);
    C.assert(status&&status.status===result.status,'tool state must be host-authoritative');
    if(result.status!=='succeeded'){
      C.assert(['queued','running','failed','blocked','unavailable','unsupported','unknown','stale_context'].includes(result.status),'unsupported tool result');
      return {status:result.status,reason:status.reason||'No usable source capture',action_id:result.action_id};
    }
    const receipt=C.receipt(snapshot,result.receipt_id,'source_capture');
    C.assert(receipt.action_id===pending.action_id&&receipt.input_digest===pending.input_digest&&receipt.source_id===pending.source_ref.id&&C.sameBinding(receipt.validated_binding,C.binding(snapshot,pending.validation_revision)),'source receipt binding mismatch');
    const source=C.resolve(snapshot,result.source_ref);
    C.assert(source.id===pending.source_ref.id&&source.kind==='source'&&source.trust==='host_capture','source capture classification mismatch');
    const v=source.value;
    C.assert(v&&v.content_sha256===H.sha256(v.excerpt)&&v.content_sha256===receipt.content_sha256&&v.excerpt.length>0,'capture requires actual hash-bound readable bytes');
    C.assert(v.requested_url===pending.requested_url&&typeof v.final_url==='string'&&/^https:\/\//.test(v.final_url)&&v.title&&v.publisher&&v.captured_at&&v.classification&&['complete_excerpt','partial_excerpt'].includes(v.completeness)&&v.origin==='retrieved','incomplete source provenance');
    return {status:'succeeded',action_id:pending.action_id,source_ref:C.ref(source),requested_url:v.requested_url,final_url:v.final_url,title:v.title,publisher:v.publisher,captured_at:v.captured_at,excerpt:v.excerpt,content_sha256:v.content_sha256,classification:v.classification,completeness:v.completeness,receipt_id:receipt.id,trust:'untrusted source content; not personal qualifications'};
  }
  return {read};
})();
if(typeof module!=='undefined')module.exports=InterviewJourneyResearch;
