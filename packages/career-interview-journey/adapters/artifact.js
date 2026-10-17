'use strict';
const InterviewJourneyArtifact = (()=>{
  const H=typeof InterviewJourneyHash!=='undefined'?InterviewJourneyHash:require('../../domain/interview-journey/hash.js');
  const C=typeof InterviewJourneyContext!=='undefined'?InterviewJourneyContext:require('./context.js');
  function payload(proposal){
    C.assert(proposal.type==='create_draft'&&proposal.args.kind==='interview_prep_pack','not a local preparation artifact');
    const {pack,markdown,manifest}=proposal.args;
    C.assert(pack.owner_id===proposal.owner_id&&pack.thread_id===proposal.thread_id,'artifact proposal scope mismatch');
    C.assert(H.sha256(pack)===manifest.structured_sha256&&H.sha256(markdown)===manifest.sha256,'artifact serialization digest mismatch');
    C.assert(manifest.mime_type==='text/markdown; charset=utf-8'&&manifest.encoding==='utf-8'&&new TextEncoder().encode(markdown).length===manifest.byte_length,'artifact encoding/size mismatch');
    return {owner_id:pack.owner_id,thread_id:pack.thread_id,journey_id:pack.journey_id,journey_revision:pack.journey_revision,target_ref:H.clone(pack.target_ref),resume_ref:H.clone(pack.resume_ref),epoch:pack.epoch,content:markdown,...H.clone(manifest)};
  }
  return {payload};
})();
if(typeof module!=='undefined')module.exports=InterviewJourneyArtifact;
