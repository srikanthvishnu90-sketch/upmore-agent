'use strict';
const path=require('node:path'),crypto=require('node:crypto');
const U='00000000-0000-4000-8000-0000000000a1',T='00000000-0000-4000-8000-0000000000b1',V='00000000-0000-4000-8000-0000000000a2';
const q=x=>"'"+String(typeof x==='object'?JSON.stringify(x):x).replaceAll("'","''")+"'";
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
module.exports=function fixture(){const db=require('./owned-sql.cjs')();
 function seed(){db.verify();db.sql('truncate auth.users cascade;');db.sql(`insert into auth.users values(${q(U)}),(${q(V)});insert into agent_threads values(${q(T)},${q(U)});`);}
 function client(owner=U){return {auth:{getUser:async()=>({data:{user:{id:owner}}})},from(table){const filters={};return {upsert:async row=>{if(table!=='profiles')throw Error('unexpected fixture write');db.sql(`insert into profiles values(${q(row.id)})on conflict do nothing`);return {error:null};},select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){if(table!=='agent_threads')throw Error('unexpected fixture read');const rows=JSON.parse(db.sql(`select coalesce(jsonb_agg(t),'[]'::jsonb)from agent_threads t where id=${q(filters.id)} and user_id=${q(filters.user_id)}`));return {data:rows[0]||null,error:null};}};},async rpc(name,args){if(name==='agent_rl_bump')return {data:true,error:null};const r=await db.client.rpc(name,args);if(r.error)console.log(JSON.stringify({failedRpc:name,error:r.error}));return r;}};}
 async function app(t,options={}){const a=await require('../helpers/career-staged-entry.cjs')(path.resolve(__dirname,'../..'),client(options.owner||U),{...options,env:{CAREER_JOURNEY_MODE:'interview_v1',...options.env}});t.after(()=>a.close());return a;}
 const body=(type,key,extra={},message='Interview preparation')=>({thread_id:T,turn_key:key,message,career_journey:{type,...extra}});
 const context=()=>JSON.parse(db.sql(`select value from career_watch_kv where user_id=${q(U)} and key=${q('career:journey-context:'+T)}`));
 const state=()=>JSON.parse(db.sql(`select state#>'{career,stores,interviewJourney}' from agent_flow_state where thread_id=${q(T)}`));
 return {...db,U,T,V,q,canonical,sha,seed,client,app,body,context,state};
};
