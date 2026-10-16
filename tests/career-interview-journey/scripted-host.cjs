'use strict';
// Test transport only. No real semantic checker, model, database or product host.
const F=require('./fixtures.cjs');
const J=require('../../packages/domain/interview-journey/index.js');
const C=require('../../packages/career-interview-journey/adapters/context.js');
const R=require('../../packages/career-interview-journey/rubrics/index.js');
function session(snapshot=F.snapshot(),state=null){
  // Explicit synthetic role classification from this test's known target; never
  // a runtime title matcher or a default for real users.
  if(snapshot.facts.find(f=>f.id==='target')?.value.role==='Software engineer intern')snapshot.facts.find(f=>f.id==='target').value.role_family='software_engineering';
  let counter=0;
  return {snapshot,state,last:null,turns:[],turn(type,args={},id){const event=F.event(id||type+'-'+(++counter),type,args);const t=J.planInterviewTurn({snapshot:this.snapshot,state:this.state,event});this.turns.push({event,reply_plan:t.reply_plan,proposed_actions:t.proposed_actions,expected_binding:t.expected_binding,journey_revision:t.next_state.revision,receipts:this.snapshot.receipts.filter(r=>r.id===event.receipt_id||r.id===event.result?.receipt_id)});this.state=t.next_state;this.last=t;return t;},start(args={}){const e={...F.start(),...args};return this.turn('start',e,e.id);},
    candidate(patch={}){const p=this.state.checkpoint.pending_reasoning,a=this.state.attempts.find(a=>a.id===p.attempt_id),q=R.questions[a.question_id],technical=q.family==='technical',dimension=technical?'correctness_invariant':'personal_contribution';
      return {attempt_id:a.id,answer_sha256:a.answer_sha256,question_id:q.id,rubric_id:q.rubric.id,evidence_refs:F.copy(p.source_refs),answer_meaning:'Scripted contract fixture: the answer describes a proposal and a limited test observation.',dimensions:q.rubric.dimensions.map(id=>({id,score:2,rationale:'Synthetic boundary response; no real quality judgment.',uncertainty:'Not independently assessed',spans:[{start:0,end:a.text.length,quote:a.text}]})),strength:{dimension:technical?'requirements_assumptions':'situation',text:'Scripted strength linked to an elicited dimension.'},priority_fix:{dimension,text:'Scripted gap: inspect the relevant boundary.'},exercise_id:technical?'invariant':'ownership',next_question_id:technical?(q.id==='webhook-transfer'?'retry-design':'webhook-transfer'):(q.id==='handoff-transfer'?'project-narrative':'handoff-transfer'),rationale:'Scripted selection ties the exercise to the stated gap; human quality NOT_RUN.',uncertainty:'Scripted development only.',feedback:'Separate the action you proposed from work performed by your teammate; describe only the small test observation.',draft:{text:a.text,fact_refs:[{id:'project',version:1}]},...patch};},
    deliver(candidate=this.candidate(),id){const p=this.state.checkpoint.pending_reasoning,rid='receipt-'+(++counter);
      this.snapshot.receipts.push({id:rid,type:'semantic_candidate',owner_id:this.snapshot.owner_id,thread_id:this.snapshot.thread_id,epoch:this.snapshot.binding.epoch,action_id:p.action_id,input_digest:p.input_digest,request_digest:p.request_digest,candidate_sha256:F.hash(candidate),verdict:'accepted',request_binding:F.copy(p.expected_binding),validated_binding:C.binding(this.snapshot,this.state.revision),generator:'SCRIPTED_CONTRACT_FIXTURE'});
      return this.turn('model_candidate',{action_id:p.action_id,receipt_id:rid,candidate},id);},
    answer(text='I proposed the change; my teammate implemented it. We observed one test batch, without production measurements.',kind='initial'){return this.turn('submit_answer',{text,kind,scripted:true});}
  };
}
function savedArtifact(s,proposal,content=proposal.args.markdown){
  const {pack,manifest}=proposal.args,p=s.state.checkpoint.pending_artifact;
  const artifact={id:'synthetic-pack',version:1,owner_id:pack.owner_id,thread_id:pack.thread_id,journey_id:pack.journey_id,epoch:pack.epoch,content,mime_type:manifest.mime_type,encoding:manifest.encoding,byte_length:new TextEncoder().encode(content).length,sha256:manifest.sha256};
  s.snapshot.artifacts.push(artifact);
  const receipt={id:'artifact-readback',type:'artifact_readback',owner_id:pack.owner_id,thread_id:pack.thread_id,epoch:pack.epoch,artifact_id:artifact.id,artifact_version:artifact.version,action_id:proposal.action_id,input_digest:proposal.input_digest,authorized_open:true,fresh_session:true,journey_revision:p.journey_revision,target_ref:pack.target_ref,resume_ref:pack.resume_ref,validated_binding:C.binding(s.snapshot,s.state.revision),sha256:manifest.sha256};
  s.snapshot.receipts.push(receipt);return receipt;
}
module.exports={session,savedArtifact};
