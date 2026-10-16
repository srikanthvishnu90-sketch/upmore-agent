'use strict';
// Disposable, network-isolated local database fixture. Creates no remote account.
const {execFileSync}=require('node:child_process');
const name='upmore-career-integration-pg-recovery';
const image='postgres:16@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d';
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
try{run(['inspect',name]);throw Error('Fixture container already exists; inspect it before explicit cleanup.');}catch(e){if(!e.status)throw e;}
run(['pull',image]);console.log(run(['run','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]));
(async()=>{let ready=false;for(let i=0;i<40;i++){try{run(['exec',name,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}if(!ready)throw Error('PostgreSQL not ready; inspect disposable fixture logs');run(['exec','-i',name,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],'create role service_role nologin;create role anon nologin;create role authenticated nologin;');console.log('Local fixture ready; network none; no published ports.');})().catch(e=>{console.error(e);process.exitCode=1});
