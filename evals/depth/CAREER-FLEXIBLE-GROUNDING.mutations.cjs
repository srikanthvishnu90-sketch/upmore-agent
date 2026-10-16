'use strict';
// Intentional local-only defects. These are never applied to a shared branch
// or a live server. Each must break a frozen user-observable contract test.
const g='supabase/functions/_shared/career_model_grounded.ts',a='supabase/functions/_shared/career_model_reply.ts',h='supabase/functions/agent-chat/handler-career.ts';
module.exports=[
 ['T01',g,"draft:'Draft for review; not sent:\\n'","draft:'Prepared material:\\n'",'^T01 flexible prose'],
 ['T02',g,"if(!verifierAvailable(verifier))return {error:'semantic_verifier_unavailable'};","if(false)return {error:'semantic_verifier_unavailable'};",'^T02 unavailable verifier'],
 ['T03',g,"c.verdict!=='entailed'","false",'^T03 known IDs'],
 ['T04',g,'receipt.unlisted_claims.length!==0','false','^T04 unlisted'],
 ['T05',g,"!keys(candidate,['version','blocks','claims'])","!record(candidate)",'^T05 reject model action'],
 ['T06',g,'const binding={user_id:ctx.userId,','const binding={user_id:ctx.threadId,','^T06 owned context'],
 ['T07',g,'recent_dialogue:dialogue','recent_dialogue:[]','^T07 recent dialogue'],
 ['T08',g,'revision:d.loaded.revision+1,barrier,user_text:','revision:d.loaded.revision+1,barrier:false,user_text:','^T08 correction and withdrawal'],
 ['T09',g,"'corrected',contextText(f.resolution.source","'active',contextText(f.resolution.source",'^T09 current sourced'],
 ['T10',g,'revision:(view.current_draft?.revision||0)+1','revision:(view.current_draft?.revision||0)+0','^T10 current draft'],
 ['T11',g,"'role_text','jd_text'","'role_text'",'^T11 jd_text'],
 ['T12',h,'  const ctx: TurnCtx = { note: null, user: null, thread: null };',`  const supplied = (await req.clone().json()).semanticVerifier;
  if(supplied) dependencies={semanticVerifier:{id:'request-claimed',revision:'unsafe',capability:'entailment_coverage_authority/v1',costPolicy:'local_no_external_calls',verify:async(r:any)=>({version:'career_semantic_receipt/v1',verifier_id:'request-claimed',verifier_revision:'unsafe',context_sha256:r.context_sha256,response_sha256:r.response_sha256,verdict:'supported',whole_response_checked:true,authority_safe:true,unlisted_claims:[],claims:r.candidate.claims.map((c:any)=>({id:c.id,verdict:'entailed',evidence_ids:c.evidence_ids}))})}};
  const ctx: TurnCtx = { note: null, user: null, thread: null };`,'^T12 request JSON'],
 ['T13',a,"consumed.ok!==true||consumed.ticket!==ticket","consumed.ticket!==ticket",'^T13 shared budget'],
 ['T14',h,'const saved = await persistence.commit','const saved = {response}; if(false) await persistence.commit','^T14 assistant/draft'],
 ['T15',g,"quality:'not_established_by_contract_checks'","quality:'proven_model_quality'",'^T15 generated metadata'],
].map(([id,file,from,to,pattern])=>({id,file,from,to,pattern}));
