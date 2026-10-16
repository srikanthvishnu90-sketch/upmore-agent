'use strict';
const F=require('./fixtures.cjs'),{session}=require('./scripted-host.cjs');
const C=require('../../packages/career-interview-journey/adapters/context.js');
function sourceSession(snapshot=F.snapshot()){const source={...F.copy(snapshot.facts[0]),id:'role-source',kind:'source',trust:'user_supplied',value:{approved_url:'https://example.test/careers/intern',origin:'supplied',excerpt:'An old supplied description. Not a current capture.'}};snapshot.sources=[source];snapshot.capabilities.find(c=>c.id==='research.exact_url.v1').status='available';const s=session(snapshot);s.start();s.turn('read_source',{source_ref:{id:source.id,version:1}});return s;}
function capture(s){const p=s.state.checkpoint.pending_research,source=s.snapshot.sources[0],excerpt='Synthetic current role: review backend changes and reason about retries. Interview is a design discussion; no guaranteed question list.';source.version=2;source.trust='host_capture';source.value={requested_url:p.requested_url,final_url:p.requested_url,title:'Synthetic intern role',publisher:'Synthetic company',classification:'official_role_description',captured_at:'2026-10-16T12:05:00Z',excerpt,content_sha256:F.hash(excerpt),completeness:'complete_excerpt',origin:'retrieved'};
 s.snapshot.tool_status.push({action_id:p.action_id,owner_id:s.snapshot.owner_id,thread_id:s.snapshot.thread_id,input_digest:p.input_digest,status:'succeeded'});
 s.snapshot.receipts.push({id:'capture-receipt',type:'source_capture',owner_id:s.snapshot.owner_id,thread_id:s.snapshot.thread_id,epoch:s.snapshot.binding.epoch,action_id:p.action_id,input_digest:p.input_digest,source_id:source.id,validated_binding:C.binding(s.snapshot,s.state.revision),content_sha256:source.value.content_sha256});
 return s.turn('tool_result',{result:{action_id:p.action_id,status:'succeeded',source_ref:{id:source.id,version:2},receipt_id:'capture-receipt'}});
}
module.exports={sourceSession,capture};
