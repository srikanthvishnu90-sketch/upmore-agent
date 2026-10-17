// Pure structure/reference validation and rendering. This certifies no meaning;
// only a separate trusted checker can approve the entire rendered response.
const object=(x:any)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:any,k:string[])=>object(x)&&Object.keys(x).sort().join(',')===[...k].sort().join(',');
export function groundedCandidate(raw:string,view:any){
 const candidate=JSON.parse(raw),claims=new Map<string,any>(),refs=new Map<string,any>();
 if(!keys(candidate,['version','blocks','claims'])||candidate.version!=='career_grounded_reply/v2'||!Array.isArray(candidate.blocks)||candidate.blocks.length<1||candidate.blocks.length>8||!Array.isArray(candidate.claims)||candidate.claims.length>16)throw Error('invalid_grounded_response');
 for(const f of view.facts)if(['active','corrected'].includes(f.status))refs.set(f.id,{scope:'person'});
 for(const s of view.untrusted_sources)refs.set(s.id,{scope:'posting'});
 for(const h of view.recent_dialogue)refs.set(h.id,{scope:'conversation'});refs.set('U1',{scope:'conversation'});
 for(const c of candidate.claims){
  if(!keys(c,['id','text','scope','evidence_ids'])||!/^C[1-9][0-9]?$/.test(c.id)||claims.has(c.id)||typeof c.text!=='string'||!c.text.trim()||c.text.length>1500||!['person','posting','conversation'].includes(c.scope)||!Array.isArray(c.evidence_ids)||c.evidence_ids.length<1||c.evidence_ids.length>8||new Set(c.evidence_ids).size!==c.evidence_ids.length||c.evidence_ids.some((id:any)=>refs.get(id)?.scope!==c.scope))throw Error('invalid_claim_reference');claims.set(c.id,c);
 }
 let total=0;const used=new Set<string>();
 for(const b of candidate.blocks){
  if(!keys(b,['kind','text','claim_ids'])||!['prose','draft','advice','hypothesis','question'].includes(b.kind)||typeof b.text!=='string'||!b.text.trim()||b.text.length>2400||/[\x00-\x08\x0b-\x1f\x7f<>]/.test(b.text)||!Array.isArray(b.claim_ids)||new Set(b.claim_ids).size!==b.claim_ids.length)throw Error('invalid_grounded_block');total+=b.text.length;
  for(const id of b.claim_ids){const c=claims.get(id);if(!c||!b.text.includes(c.text))throw Error('unbound_claim');used.add(id);}
 }
 if(total>10000||used.size!==claims.size)throw Error('invalid_grounded_coverage');
 const labels:any={draft:'Draft for review; not sent:\n',advice:'Advice:\n',hypothesis:'Hypothesis, not established fact:\n',prose:'',question:''};
 return {candidate,claims,reply:candidate.blocks.map((b:any)=>labels[b.kind]+b.text).join('\n\n')+'\n\nNo email or job application was sent.',draftText:candidate.blocks.filter((b:any)=>b.kind==='draft').map((b:any)=>b.text).join('\n\n')};
}
