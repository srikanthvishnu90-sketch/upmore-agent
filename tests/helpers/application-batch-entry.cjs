'use strict';
// Actual standalone Edge entry graph, synthetic Auth and local SQL transport.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
module.exports=async function entry(client){
 if(!vm.SourceTextModule)throw Error('Use --experimental-vm-modules');let handle;
 const root=path.resolve(__dirname,'../../supabase/functions'),context=vm.createContext({Request,Response,Headers,URL,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto,fetch:()=>{throw Error('External network forbidden');},Deno:{env:{get:k=>({SUPABASE_URL:'https://synthetic.test',SUPABASE_ANON_KEY:'SYNTHETIC_AUTH',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_SERVICE',UPMORE_BATCH_ALLOWED_ORIGINS:'https://synthetic-app.test'})[k]},serve:fn=>handle=fn}}),cache=new Map();
 function load(id){if(cache.has(id))return cache.get(id);let m;
  if(id==='https://esm.sh/@supabase/supabase-js@2.117.1')m=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',(_,key)=>key==='SYNTHETIC_AUTH'?{auth:{getUser:async token=>({data:{user:await client.authenticate(token)},error:null})}}:{rpc:client.rpc});},{context,identifier:id});
  else{if(!id.startsWith(root+path.sep))throw Error('Batch import escaped function source');let code=fs.readFileSync(id,'utf8');if(id.endsWith('.ts'))code=stripTypeScriptTypes(code,{mode:'transform'});m=new vm.SourceTextModule(code,{context,identifier:id});}
  cache.set(id,m);return m;
 }
 const main=load(path.join(root,'career-batch/index.ts'));await main.link((s,r)=>load(s.startsWith('https:')?s:path.resolve(path.dirname(r.identifier),s)));await main.evaluate();
 return {request:req=>handle(req)};
};
