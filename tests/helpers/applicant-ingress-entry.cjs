'use strict';
// Actual standalone Deno entry graph; synthetic Supabase auth identity/transport.
// No module is replaced by a fixture handler and no external fetch is allowed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
module.exports=async function entry(client){
 if(!vm.SourceTextModule)throw Error('Use --experimental-vm-modules');let handle,network=0;
 const root=path.resolve(__dirname,'../../supabase/functions'),context=vm.createContext({Request,Response,Headers,URL,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto,console:{log(){},warn(){},error(){}},fetch(){network++;throw Error('External network forbidden');},Deno:{env:{get:k=>({SUPABASE_URL:'https://synthetic.example.test',SUPABASE_ANON_KEY:'SYNTHETIC_AUTH',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_SERVICE',UPMORE_APPLICANT_ALLOWED_ORIGINS:'https://synthetic-app.test'})[k]},serve:fn=>{handle=fn;}}});
 const cache=new Map();function load(id){if(cache.has(id))return cache.get(id);let m;
  if(id==='https://esm.sh/@supabase/supabase-js@2.117.1')m=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',(_,key)=>key==='SYNTHETIC_AUTH'?{auth:{getUser:async token=>({data:{user:await client.authenticate(token)},error:null})}}:{rpc:client.rpc});},{context,identifier:id});
  else if(id==='node:buffer'||id==='node:zlib'){const names=id==='node:buffer'?['Buffer']:['inflateRawSync'],source=require(id);m=new vm.SyntheticModule(names,function(){for(const k of names)this.setExport(k,source[k]);},{context,identifier:id});}
  else{if(!id.startsWith(root+path.sep))throw Error('Applicant import escaped function source');let code=fs.readFileSync(id,'utf8');if(id.endsWith('.ts'))code=stripTypeScriptTypes(code,{mode:'transform'});m=new vm.SourceTextModule(code,{context,identifier:id});}
  cache.set(id,m);return m;
 }
 const start=load(path.join(root,'career-applicant/index.ts'));await start.link((s,r)=>load(s.startsWith('https:')||s.startsWith('node:')?s:path.resolve(path.dirname(r.identifier),s)));await start.evaluate();
 return {request:async req=>{const result=await handle(req);if(network)throw Error('Unexpected external fetch');return result;},sourceEntry:path.join(root,'career-applicant/index.ts')};
};
