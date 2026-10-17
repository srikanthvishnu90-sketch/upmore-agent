'use strict';
// New critical SQL tests require positive fixture identity BEFORE any reset.
const {execFileSync}=require('node:child_process');
module.exports=()=>{
 const container=process.env.CAREER_TEST_CONTAINER,token=process.env.CAREER_TEST_FIXTURE_TOKEN;
 if(!/^[a-f0-9]{16}$/.test(token||''))throw Error('Explicit owned fixture token required');
 const db=require('../helpers/career-task-sql.cjs')(container,process.env.CAREER_TEST_DATABASE);
 const verify=()=>{
  const label=execFileSync('docker',['inspect','--format','{{index .Config.Labels "upmore.ci-fixture"}}',container],{encoding:'utf8'}).trim();
  if(label!==token||db.sql("select shobj_description(oid,'pg_database') from pg_database where datname=current_database()")!=='upmore-ci-fixture:'+token)throw Error('Unidentified/shared SQL fixture refused');
 };
 verify();console.log(JSON.stringify({fixture:'OWNED_MARKED_NETWORK_NONE',container,database:process.env.CAREER_TEST_DATABASE,marker:'upmore-ci-fixture:'+token}));return {...db,verify};
};
