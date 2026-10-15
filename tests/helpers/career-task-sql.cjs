'use strict';
// Explicit isolated Docker/Postgres test transport, never a production adapter.
const {execFileSync,spawn}=require('node:child_process');
module.exports=function localSQL(container,database){
  if(!/^upmore-career-integration-pg-[a-z0-9-]+$/.test(container||'')||!/^career_test_[a-z0-9_]+$/.test(database||''))throw Error('explicit isolated local test target required');
  const network=execFileSync('docker',['inspect','--format','{{.HostConfig.NetworkMode}}',container],{encoding:'utf8'}).trim();
  if(network!=='none')throw Error('test container must have no network');
  const quote=v=>v==null?'NULL':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
  function sql(text,role='postgres'){
    return execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:(role==='postgres'?'':'SET ROLE '+role+';\n')+text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  }
  function statement(name,args={}){
    if(!/^career_[a-z0-9_]+$/.test(name)||Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('invalid test RPC');
    return 'select public.'+name+'('+Object.entries(args).map(([k,v])=>k+'=>'+quote(v)).join(',')+');';
  }
  const call=(name,args)=>JSON.parse(sql(statement(name,args),'service_role'));
  function callAsync(name,args){return new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1']);let out='',err='';
    child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('close',code=>code?reject(Error(err)):resolve(JSON.parse(out.trim())));child.stdin.end('SET ROLE service_role;\n'+statement(name,args));
  });}
  return {sql,call,callAsync,client:{rpc:async(name,args)=>{try{return {data:call(name,args),error:null};}catch(e){return {data:null,error:{message:e.stderr?.toString()||e.message}};}}}};
};
