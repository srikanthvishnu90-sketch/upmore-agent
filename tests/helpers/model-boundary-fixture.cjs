'use strict';
// Independent transport around the actual staged entry, with synthetic records
// only. No provider/network forwarding, applicant fixtures or credential reads.
const path=require('node:path'),crypto=require('node:crypto');
const U='00000000-0000-4000-8000-0000000000a1',V='00000000-0000-4000-8000-0000000000a2';
const T='00000000-0000-4000-8000-0000000000b1',TV='00000000-0000-4000-8000-0000000000b2';
const copy=x=>JSON.parse(JSON.stringify(x));
const snapshot=(u=U)=>({v:1,scope:{userId:u},stores:{profile:{id:'profile-1',_careerTrackStore:{rows:[]},basics:{},facts:[{id:'SYN-BOUNDARY-PROJECT',kind:'project',text:u===U?'Organized spreadsheet rows for a class assignment.':'Built a synthetic calculator.',unproven:false}],constraints:{graduationDate:u===U?'2032':'2035'},preferences:{locations:[]}},conversationState:{v:1,facts:{},sources:[],hypotheticals:[],mode:null}}});
const valid=()=>({version:'career_model_reply/v1',opener:'step',fact_refs:[],advice:['Describe the problem and the observable result.'],follow_up:'evidence'});
async function fixture(t,opts={}){
  let owner=U;
  const dbs=new Map([U,V].map(u=>[u,{state:{career:snapshot(u)},messages:[],options:{}}])),calls=[],requests=[],tickets=new Map();
  const client={auth:{getUser:async()=>({data:{user:opts.noAuth?null:{id:owner}}})},async rpc(name,args){
    calls.push({name,args:copy(args)});
    if(opts.rpc){const custom=await opts.rpc(name,args);if(custom!==undefined)return custom;}
    if(name==='agent_rl_bump')return {data:true,error:null};
    if(name==='career_model_budget_reserve_v1'){
      const key=args.p_user+':'+args.p_key,old=tickets.get(key);if(old)return {data:{ok:false,reason:old.hash!==args.p_hash?'turn_key_conflict':'already_reserved'},error:null};
      const ticket=crypto.randomUUID();tickets.set(key,{ticket,hash:args.p_hash});return {data:{ok:true,ticket,boundMicros:args.p_bound},error:null};
    }
    if(name==='career_model_budget_consume_v1')return {data:{ok:true,ticket:args.p_ticket},error:null};
    if(name==='career_model_budget_settle_v1')return {data:{ok:true,state:args.p_outcome,contextCurrent:true},error:null};
    if(name==='agent_model_call_reserve')return {data:{ok:true,call_id:crypto.randomUUID()},error:null};
    if(name==='agent_model_call_record')return {data:null,error:null}; // actual legacy RPC returns void
    return require('./career-persistence-fake.cjs')(dbs.get(owner),owner,owner===U?T:TV,name,args);
  },from(table){const filters={},q={select(){return q;},eq(k,v){filters[k]=v;return q;},async upsert(row){if(table!=='profiles'||row.id!==owner)throw Error('unexpected profile authority');return {error:null};},async maybeSingle(){if(table!=='agent_threads')throw Error('unexpected read');return {data:filters.user_id===owner&&filters.id===(owner===U?T:TV)?{id:filters.id,user_id:owner}:null,error:null};}};return q;}};
  const entry=await require('./career-staged-entry.cjs')(path.resolve(__dirname,'../..'),client,{env:{CAREER_MODEL_ENABLED:'true',OPENAI_API_KEY:'SYNTHETIC_INDEPENDENT_NOT_A_CREDENTIAL',...(opts.env||{})},async request(url,init){
    if(url!=='https://api.openai.com/v1/chat/completions')throw Error('unexpected external service');
    const body=JSON.parse(init.body),view=JSON.parse(body.messages.at(-1).content);requests.push({body,view,signal:init.signal});
    if(opts.fetch)return opts.fetch(body,view,init.signal);
    return new Response(JSON.stringify({id:'synthetic-review',choices:[{message:{content:JSON.stringify(opts.output?opts.output(view):valid())},finish_reason:'stop'}],usage:opts.usage===undefined?{prompt_tokens:300,completion_tokens:80,prompt_tokens_details:{cached_tokens:20}}:opts.usage}),{headers:{'content-type':'application/json'}});
  }});
  t.after(()=>entry.close());
  return {entry,dbs,calls,requests,tickets,as(u){owner=u;return this;},request(message='Help me practice an interview answer.',key='independent-turn',thread=owner===U?T:TV,task){return entry.request(thread,message,key,task);},module:entry.exportsFor('_shared/career_model_reply.ts')};
}
module.exports={U,V,T,TV,copy,snapshot,valid,fixture};
