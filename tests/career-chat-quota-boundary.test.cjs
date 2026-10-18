'use strict';
// Synthetic protocol regressions through the real staged career entry.
// Only Supabase/Auth are replaced; no business dependencies or external IO.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync,spawnSync}=require('node:child_process');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'..');
const USER='00000000-0000-4000-8000-000000000001';
const BODY={thread_id:'00000000-0000-4000-8000-000000000002',turn_key:'quota-test',message:'show my applications'};
if(!vm.SourceTextModule){
 test('quota boundary staged-entry contracts',()=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const run=spawnSync(process.execPath,['--experimental-vm-modules','--test',__filename],{env,encoding:'utf8',timeout:120000});
  assert.equal(run.status,0,run.stdout+run.stderr);
 });
}else{
 const stage=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-quota-boundary-'));
 after(()=>fs.rmSync(stage,{recursive:true,force:true}));
 execFileSync(process.execPath,[path.join(root,'scripts/career/stage-career.cjs'),stage,'--json']);
 async function request({body=BODY,token='mock-user-token',verified=true,profileError=null,quota={data:false,error:null}}={}){
  const calls={auth:0,profiles:0,rpcs:[],network:0};let handle;
  const client={
   auth:{getUser:async()=>{calls.auth++;return {data:{user:verified?{id:USER}:null}};}},
   from(table){assert.equal(table,'profiles','quota/input boundary must not reach owned thread or business state');return {async upsert(row){assert.equal(row.id,USER);calls.profiles++;return {error:profileError};}};},
   async rpc(name,args){calls.rpcs.push({name,args});assert.ok(['agent_rl_bump','agent_rl_bump_as'].includes(name),'no business RPC');return quota;},
  };
  const context=vm.createContext({Request,Response,Headers,URL,TextEncoder,TextDecoder,AbortController,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,
   console:{log(){},error(){},warn(){}},fetch(){calls.network++;throw Error('external IO forbidden');},
   Deno:{env:{get:name=>({SUPABASE_URL:'https://supabase.example.test',SUPABASE_ANON_KEY:'mock-anon',SUPABASE_SERVICE_ROLE_KEY:'mock-service'})[name]}},
  });
  const modules=new Map();
  function load(id){
   if(modules.has(id))return modules.get(id);let mod;
   if(id==='https://deno.land/std@0.208.0/http/server.ts')mod=new vm.SyntheticModule(['serve'],function(){this.setExport('serve',fn=>{handle=fn;});},{context,identifier:id});
   else if(id==='https://esm.sh/@supabase/supabase-js@2.117.1')mod=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>client);},{context,identifier:id});
   else{assert.ok(id.startsWith(stage+path.sep),'import remains in staged tree');let code=fs.readFileSync(id,'utf8');if(id.endsWith('.ts'))code=stripTypeScriptTypes(code,{mode:'transform'});mod=new vm.SourceTextModule(code,{context,identifier:id});}
   modules.set(id,mod);return mod;
  }
  const entry=load(path.join(stage,'agent-chat/index.ts'));
  await entry.link((specifier,ref)=>load(specifier.startsWith('https:')?specifier:path.resolve(path.dirname(ref.identifier),specifier)));
  await entry.evaluate();assert.equal(typeof handle,'function');
  const headers={'content-type':'application/json'};if(token)headers.Authorization='Bearer '+token;
  const response=await handle(new Request('https://upmore.example.test/chat',{method:'POST',headers,body:JSON.stringify(body)}));
  assert.equal(calls.network,0);
  return {status:response.status,body:await response.json(),retry:response.headers.get('retry-after'),calls};
 }
 test('missing bearer is 401 and spends no quota',async()=>{
  const r=await request({token:null});assert.equal(r.status,401);assert.equal(r.calls.auth,0);assert.equal(r.calls.profiles,0);assert.equal(r.calls.rpcs.length,0);
 });
 test('unverified bearer is 401 and spends no quota',async()=>{
  const r=await request({verified:false});assert.equal(r.status,401);assert.equal(r.calls.profiles,0);assert.equal(r.calls.rpcs.length,0);
 });
 test('profile storage failure is 500, never a quota denial',async()=>{
  const r=await request({profileError:{message:'synthetic unavailable'}});assert.equal(r.status,500);assert.equal(r.body.error,'internal');assert.equal(r.retry,null);assert.equal(r.calls.rpcs.length,0);
 });
 test('quota RPC error is 500, never a quota denial',async()=>{
  const r=await request({quota:{data:false,error:{message:'synthetic unavailable'}}});assert.equal(r.status,500);assert.equal(r.body.error,'internal');assert.equal(r.retry,null);assert.equal(r.calls.rpcs.length,1);
 });
 test('normal JWT quota denial is 429 scoped to verified owner, before business work',async()=>{
  const r=await request();assert.equal(r.status,429);assert.equal(r.body.error,'rate_limited');assert.equal(r.calls.rpcs.length,1);
  assert.equal(r.calls.rpcs[0].name,'agent_rl_bump');assert.equal(r.calls.rpcs[0].args.p_user,USER);assert.equal(r.calls.rpcs[0].args.p_limit,60);
  assert.match(r.retry,/^\d+$/);assert.ok(Number(r.retry)>0);
 });
 test('service bridge denial uses explicit verified owner quota',async()=>{
  const r=await request({token:'mock-service',body:{...BODY,as_user_id:USER}});assert.equal(r.status,429);assert.equal(r.calls.auth,0);assert.equal(r.calls.rpcs.length,1);
  assert.equal(r.calls.rpcs[0].name,'agent_rl_bump_as');assert.equal(r.calls.rpcs[0].args.p_user,USER);assert.equal(r.calls.rpcs[0].args.p_limit,60);
 });
 test('empty input is rejected without spending work allowance',async()=>{
  const r=await request({body:{...BODY,message:''},quota:{data:true,error:null}});assert.equal(r.status,400);assert.equal(r.body.error,'message required');assert.equal(r.calls.rpcs.length,0,'invalid work must not consume the valid-work allowance; preserve a separate abuse guard');
 });
 test('invalid turn key remains a named 400 even when work quota is exhausted',async()=>{
  const r=await request({body:{...BODY,turn_key:'invalid key!'}});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_turn_key');assert.equal(r.calls.rpcs.length,0,'cheap validation precedes valid-work allowance; preserve a separate abuse guard');
 });
}
