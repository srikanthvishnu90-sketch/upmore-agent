'use strict';
// Controlled wire/usage responses only. Never an actual model-quality oracle.
const crypto=require('node:crypto');
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const POLICY='e'.repeat(64),PRICE=sha(canonical({cached:0.005,input:0.05,model:'gpt-5-nano',output:0.4,provider:'openai'}));
const config=purpose=>sha(canonical({version:'career_native_pair_config/v1',purpose,provider:'openai',model:'gpt-5-nano',reasoning_effort:'minimal',prompt_version:purpose==='generation'?'career_native_generation/v1':'career_native_checker/v1'}));
const usage={prompt_tokens:50,completion_tokens:20,total_tokens:70,prompt_tokens_details:{cached_tokens:5,audio_tokens:0},completion_tokens_details:{reasoning_tokens:3,audio_tokens:0,accepted_prediction_tokens:0,rejected_prediction_tokens:0}};
function fund(F,enabled=true){F.verify();F.sql('delete from career_model_campaign_v1;delete from career_model_pair_policy_v2;');F.sql(`insert into career_model_pair_policy_v2 values('${POLICY}','openai','gpt-5-nano','${PRICE}',50,5,400,'${config('generation')}','${config('verification')}',300000,4096,4096,true)`);if(enabled)F.sql(`insert into career_model_campaign_v1 values('owner-shared-5usd','openai','gpt-5-nano','${PRICE}',5000000,0,0,true,clock_timestamp()+interval '1 hour')`);}
const candidate={version:'career_grounded_reply/v2',blocks:[{kind:'advice',text:'CONTROLLED native response: describe only your contribution, state its limits, and identify what evidence would resolve the next uncertainty.',claim_ids:[]}],claims:[]};
function provider(options={}){const calls=[];return {calls,async request(url,init){
 const wire=init.body,body=JSON.parse(wire),input=JSON.parse(body.messages.findLast(m=>m.role==='user').content),generation=input.kind==='career_native_generation_request/v1';
 if(!generation&&input.kind!=='career_native_checker_request/v1')throw Error('unexpected native wire kind');
 calls.push({url,wire,input,generation});await options.onRequest?.({wire,input,generation,calls});
 if(options.unknownFirst&&calls.length===1)return await new Promise(()=>{});
 const result=generation?(options.candidate||candidate):{version:'career_native_checker/v1',request_digest:input.request_digest,context_sha256:input.context_sha256,intent_sha256:input.intent_sha256,user_text_sha256:input.user_text_sha256,candidate_sha256:input.candidate_sha256,rendered_sha256:input.rendered_sha256,verdict:options.rejectChecker?'rejected':'supported',whole_response_checked:true,authority_safe:true,unlisted_claims:[],claims:input.candidate.claims.map(c=>({id:c.id,verdict:'entailed',evidence_ids:c.evidence_ids})),reason:'CONTROLLED_NO_QUALITY_CLAIM'};
 if(!generation&&options.wrongCheckerDigest)result.user_text_sha256='0'.repeat(64);
 return new Response(JSON.stringify({id:'chatcmpl-controlled-native-'+calls.length,model:'gpt-5-nano-2025-08-07',choices:[{message:{content:JSON.stringify(result)},finish_reason:'stop'}],usage:options.badUsage?{...usage,total_tokens:999}:usage}));
 }};}
module.exports={POLICY,PRICE,config,fund,provider,candidate,sha,canonical,env:{CAREER_MODEL_ENABLED:'true',CAREER_MODEL_CONTRACT:'native_pair_v1',CAREER_NATIVE_PAIR_POLICY_DIGEST:POLICY,OPENAI_API_KEY:'CONTROLLED_NOT_REAL',MODEL_PROVIDER:'openai',OPENAI_MODEL:'gpt-5-nano',OPENAI_REASONING_EFFORT:'minimal'}};
