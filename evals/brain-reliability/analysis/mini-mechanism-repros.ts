// Fresh invented diagnostic inputs; no held-out scenario text or provider calls.
import {runAgentTurn} from '../../../supabase/functions/_shared/agent/loop.ts';
import {careerTools} from '../../../supabase/functions/_shared/agent/career_tools.ts';
import {matchesWords,searchWords} from '../../../supabase/functions/_shared/career_ingest.ts';
const ctx:any={userId:'SYNTHETIC-ANALYSIS',threadId:'T',now:0,state:{},turn:{message:'My project was building a shift roster. Give me one finished interview sentence from it.',before:'',added:[]}};
let n=0;
const r=await runAgentTurn({system:'Answer the requested task. Never invent personal facts.',history:[],message:ctx.turn.message,ctx,
 tools:[{name:'add_profile_fact',description:'Test-only own draft save',effect:'write_own',input_schema:{type:'object',properties:{}},run:async()=>({fact:{id:'TEST-1',text:'My project was building a shift roster.'}})}],
 model:async()=>++n===1?{content:[{type:'tool_use',name:'add_profile_fact',id:'x',input:{}}],stop_reason:'tool_use'}:{content:[{type:'text',text:'Saved: My project was building a shift roster. Is that right?'}],stop_reason:'end_turn'}});
const pool=[{job_id:'synthetic-1',title:'Support Specialist',company:'Invented Local Fixture',location:'Remote',description:'Help customers.',url:'https://example.test/job',first_seen_at:'2026-10-21T00:00:00Z'}];
async function search(filtered:boolean){const calls:string[]=[];const tools=careerTools({postings:async(q:any)=>{calls.push(q);return filtered?pool.filter(p=>matchesWords(p,searchWords(q))):pool;}}as any);const tool=tools.find(t=>t.name==='search_jobs')!;const c:any={...ctx,state:{},turn:{message:'Find support specialist remote roles with flexible scheduling.',before:'',added:[]}};const result:any=await tool.run({query:'support specialist remote flexible scheduling'},c);return{results:result.postings.length,dependency_calls:calls.length,relaxed:!!result.relaxed_to};}
console.log(JSON.stringify({receipt_completeness:{stopped:r.stopped,scripted_local_model_invocations:n,still_receipt_only:/^Saved:.*Is that right\?$/.test(r.reply)},search_adapter:{current_fixture:await search(false),query_filtering_dependency:await search(true)}},null,2));
