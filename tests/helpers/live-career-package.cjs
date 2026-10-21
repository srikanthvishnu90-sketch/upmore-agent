'use strict';
// Executes every exact package module. Only external server registration and
// Supabase transport are doubled; router/host/handler/persistence stay real.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const assert=require('node:assert/strict');
const REPO_ROOT=process.env.CASE2_TEST_REPO_ROOT||path.resolve(__dirname,'../..');
const F=require(path.join(REPO_ROOT,'tests/helpers/correction-privacy-fixture.cjs'));
const fakeRpc=require(path.join(REPO_ROOT,'tests/helpers/career-persistence-fake.cjs'));
const copy=F.copy;
const checkedPackages=new Map();
function checkedSources(packageRoot){
  packageRoot=path.resolve(packageRoot);
  if(!checkedPackages.has(packageRoot)){
    const release=require(path.join(REPO_ROOT,'scripts/career/check-live-release.cjs')).verifyRelease(path.dirname(packageRoot));
    const fn=release.payloads.find(fn=>fn.name==='agent-chat');
    assert.equal(packageRoot,path.join(release.root,'agent-chat'));
    checkedPackages.set(packageRoot,new Map(fn.files.map(file=>[file.name,file.content])));
  }
  return checkedPackages.get(packageRoot);
}
module.exports=async function completePackage(root,options={}){
  if(!vm.SourceTextModule)throw Error('Run with --experimental-vm-modules');
  root=path.resolve(root);
  const sourceFiles=checkedSources(root);
  const dbs=new Map(F.OWNERS.map((owner,i)=>[owner,{owner,thread:F.THREADS[i],state:{career:F.snapshot(owner)},account:{},messages:[],options:{}}]));
  if(options.configure)options.configure(dbs);
  const calls={requests:[],rpc:[],commits:[],identityProfileUpserts:[],tableReads:[],network:[],dynamicImports:[]};
  const consoleEvents=[];
  let handle;
  function clientFor(key,config){
    const token=config?.global?.headers?.Authorization?.replace(/^Bearer\s+/i,'');
    const user=F.OWNERS.find(id=>token==='synthetic-'+id)||null;
    assert.ok(key==='synthetic-anon'||key==='synthetic-service','only fixture credentials enter the graph');
    return {
      auth:{getUser:async received=>({data:{user:received==='synthetic-'+user&&user?{id:user}:null},error:null})},
      async rpc(name,args){
        calls.rpc.push({name,args:copy(args)});
        if(name==='agent_rl_bump'){
          assert.equal(args.p_user,user);assert.equal(args.p_limit,60);
          return {data:!dbs.get(user).options.rateLimited,error:null};
        }
        const db=dbs.get(args.p_user);
        assert.ok(db,'fixture RPC must bind an explicit owner');assert.equal(args.p_thread,db.thread);
        if(name==='career_host_commit'){
          calls.commits.push(copy(args));
          if(db.options.staleCommit)return {data:{error:'privacy_epoch_changed'},error:null};
        }
        const result=await fakeRpc(db,db.owner,db.thread,name,args);
        if(name==='career_host_load'&&db.options.foreignSnapshot&&result.data?.snapshot)result.data.snapshot.scope.userId=F.OWNERS.find(id=>id!==db.owner);
        if(name==='career_host_commit'&&!result.error&&!result.data?.error){
          // Minimal transport-double application of the exact host patch;
          // SQL authorization/atomicity are explicitly outside this fixture.
          const patch=args.p_patch||{};
          if(patch.erase===true)db.account={paused:patch.paused===true};
          else Object.assign(db.account,copy(patch));
        }
        return result;
      },
      from(table){
        const filters={};const q={
          select(){return q;},eq(k,v){filters[k]=v;return q;},ilike(k,v){filters[k]=v;return q;},order(){return q;},
          async upsert(value){assert.equal(table,'profiles');assert.deepEqual(Object.keys(value),['id']);assert.equal(value.id,user);calls.identityProfileUpserts.push(copy(value));return {error:null};},
          async maybeSingle(){assert.equal(table,'agent_threads');calls.tableReads.push({table,filters:copy(filters)});const db=dbs.get(filters.user_id);return {data:db&&db.thread===filters.id?{id:db.thread,user_id:db.owner}:null,error:null};},
          async limit(){assert.equal(table,'career_kb_postings');calls.tableReads.push({table,filters:copy(filters)});return {data:[],error:null};},
        };return q;
      },
    };
  }
  const context=vm.createContext({Request,Response,Headers,URL,TextEncoder,TextDecoder,AbortController,Blob,atob,btoa,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,
    console:{log(...args){consoleEvents.push(['log',...args.map(String)]);},error(...args){consoleEvents.push(['error',...args.map(String)]);},warn(...args){consoleEvents.push(['warn',...args.map(String)]);}},
    fetch(...args){calls.network.push(String(args[0]));throw Error('provider/external network forbidden');},
    Deno:{env:{get:name=>({SUPABASE_URL:'https://supabase.example.test',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'})[name]}}});
  const modules=new Map();
  function load(id){
    if(modules.has(id))return modules.get(id);
    let module;
    if(id==='https://deno.land/std@0.208.0/http/server.ts')module=new vm.SyntheticModule(['serve'],function(){this.setExport('serve',fn=>{handle=fn;});},{context,identifier:id});
    else if(id==='https://esm.sh/@supabase/supabase-js@2.117.1')module=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',(_url,key,config)=>clientFor(key,config));},{context,identifier:id});
    else{
      if(!id.startsWith(root+path.sep))throw Error('import escaped exact package');
      const relative=path.relative(root,id).split(path.sep).join('/');
      let code=sourceFiles.get(relative);if(code===undefined)throw Error('import escaped verified manifest');
      if(id.endsWith('.ts'))code=stripTypeScriptTypes(code,{mode:'transform'});
      module=new vm.SourceTextModule(code,{context,identifier:id,importModuleDynamically(specifier){calls.dynamicImports.push(specifier);throw Error('dynamic import forbidden');}});
    }
    modules.set(id,module);return module;
  }
  const entry=load(path.join(root,'src/index.ts'));
  await entry.link((specifier,referencing)=>load(specifier.startsWith('https:')?specifier:path.resolve(path.dirname(referencing.identifier),specifier)));
  await entry.evaluate();assert.equal(typeof handle,'function');
  return {
    dbs,calls,consoleEvents,
    graph:()=>[...modules.keys()].map(id=>id.startsWith(root+path.sep)?path.relative(root,id):id).sort(),
    async request(owner,thread,message,key){
      const payload={thread_id:thread,turn_key:key,message};calls.requests.push(copy(payload));
      const result=await handle(new Request('https://upmore.example.test/chat',{method:'POST',headers:{Authorization:'Bearer synthetic-'+owner,'Content-Type':'application/json'},body:JSON.stringify(payload)}));
      assert.deepEqual(calls.network,[],'even swallowed provider/model network attempts fail verification');
      assert.deepEqual(calls.dynamicImports,[],'even swallowed dynamic import attempts fail verification');
      return {status:result.status,headers:Object.fromEntries(result.headers),body:await result.json()};
    },
  };
};

module.exports.loadOnboarding=async function loadOnboarding(packageRoot){
  if(!vm.SourceTextModule)throw Error('Run with --experimental-vm-modules');
  const calls=[];const file=path.join(packageRoot,'_shared/router_core.career.js');
  const context=vm.createContext({console:{log(){},warn(){},error(){}},URL,TextEncoder,TextDecoder,setTimeout,clearTimeout,
    fetch(...args){calls.push(String(args[0]));throw Error('external network forbidden');}});
  const module=new vm.SourceTextModule(checkedSources(packageRoot).get('_shared/router_core.career.js'),{context,identifier:file,importModuleDynamically(specifier){calls.push('dynamic import:'+specifier);throw Error('dynamic import forbidden');}});
  await module.link(()=>{throw Error('unexpected bundled dependency');});await module.evaluate();
  return {onboarding:module.namespace.CareerOnboarding,networkCalls:calls};
};
