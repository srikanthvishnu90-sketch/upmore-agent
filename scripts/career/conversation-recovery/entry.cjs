'use strict';
// Actual deploy staging graph. Only remote serve and Supabase transport are
// injected; domain modules and handler bytes are not patched or mocked.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {stripTypeScriptTypes}=require('node:module');
module.exports=async function entry(root,client){
 if(!vm.SourceTextModule)throw Error('Use --experimental-vm-modules');
 const stage=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-entry-'));
 const report=JSON.parse(execFileSync(process.execPath,[path.join(root,'scripts/career/stage-career.cjs'),stage,'--json'],{encoding:'utf8'}));
 let handle,networkCalls=0;const logs=[];
 const context=vm.createContext({Request,Response,Headers,URL,TextEncoder,TextDecoder,AbortController,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,
 console:{log:(...a)=>logs.push(a.map(String).join(' ')),error:(...a)=>logs.push(a.map(String).join(' ')),warn:(...a)=>logs.push(a.map(String).join(' '))},
 fetch(){networkCalls++;throw Error('NETWORK_FORBIDDEN: no external APIs or paid calls');},
 Deno:{env:{get:name=>({SUPABASE_URL:'https://supabase.example.test',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'})[name]}}});
 const modules=new Map();function load(id){if(modules.has(id))return modules.get(id);let mod;
 if(id==='https://deno.land/std@0.208.0/http/server.ts')mod=new vm.SyntheticModule(['serve'],function(){this.setExport('serve',fn=>{handle=fn});},{context,identifier:id});
 else if(id==='https://esm.sh/@supabase/supabase-js@2.117.1')mod=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>client);},{context,identifier:id});
 else {if(!id.startsWith(stage+path.sep))throw Error('Import escaped deploy stage');let code=fs.readFileSync(id,'utf8');if(id.endsWith('.ts'))code=stripTypeScriptTypes(code,{mode:'transform'});mod=new vm.SourceTextModule(code,{context,identifier:id});}modules.set(id,mod);return mod;}
 try{const m=load(path.join(stage,'agent-chat/index.ts'));await m.link((s,r)=>load(s.startsWith('https:')?s:path.resolve(path.dirname(r.identifier),s)));await m.evaluate();}
 catch(e){fs.rmSync(stage,{recursive:true,force:true});throw e;}
 return {report,async request(thread,message,key){const start=logs.length;const res=await handle(new Request('https://upmore.example.test/chat',{method:'POST',headers:{Authorization:'Bearer synthetic-local-user','Content-Type':'application/json'},body:JSON.stringify({thread_id:thread,message,turn_key:key})}));return {status:res.status,body:await res.json(),networkAttempts:networkCalls,logs:logs.slice(start)};},close(){fs.rmSync(stage,{recursive:true,force:true});}};
};
