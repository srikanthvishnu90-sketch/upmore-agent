// Synthetic transport fixture only; SQL atomicity/role isolation are covered
// separately by career-persistence-postgres.test.cjs against real PostgreSQL.
module.exports=async function rpc(db,user,thread,name,args={}) {
  const copy=x=>JSON.parse(JSON.stringify(x));
  if(name==='agent_rl_bump')return {data:true,error:null};
  // Launch readiness B7: the person these fixtures chat as is an admitted account (trainee_admit, 20261026230000).
  if(name==='trainee_admit')return {data:'existing',error:null};
  // FEATURE WAVES: no sign-up record (an account that did not come in by an invite), as for nearly every account.
  if(name==='career_signup_state')return {data:null,error:null};
  if(name==='career_task_turn_commit_v1') {
    const intent=args.p_intent,base=args.p_base;
    if(intent.user_id!==user||intent.thread_id!==thread||intent.turn_key!==base.p_key||intent.request_hash!==base.p_hash)throw Error('fixture intent binding mismatch');
    const saved=await module.exports(db,user,thread,'career_host_commit',base);
    if(!saved.error&&!saved.data?.error) {db.taskIntents ||= new Map();db.taskIntents.set(intent.intent_id,copy(intent));}
    return saved;
  }
  if(name==='career_task_result_v1')return {data:{task:db.taskResults?.get(args.p_intent||args.p_task)||null},error:null};
  if(name==='career_batch_turn_commit_v1') {
    const intent=args.p_intent,base=args.p_base;
    if(intent.user_id!==user||intent.thread_id!==thread||intent.turn_key!==base.p_key||intent.request_hash!==base.p_hash)throw Error('fixture batch intent binding mismatch');
    const saved=await module.exports(db,user,thread,'career_host_commit',base);
    if(!saved.error&&!saved.data?.error) {db.batchIntents ||= new Map();db.batchIntents.set(intent.intent_id,copy(intent));}
    return saved;
  }
  if(name==='career_batch_result_v1') {const rec=db.batchRuns?.get(args.p_run);return {data:{batch:rec&&rec.userId===args.p_user?copy(rec):null},error:null};}
  if(!['career_host_load','career_host_commit'].includes(name))throw Error('unexpected RPC '+name);
  if(args.p_user!==user||args.p_thread!==thread)throw Error('fixture owner mismatch');
  db.receipts ||= new Map(); db.options ||= {};
  const old=db.receipts.get(args.p_key);
  if(old)return {data:old.hash===args.p_hash ? (name==='career_host_load'?{replay:copy(old.response)}:{response:copy(old.response)}):{error:'turn_key_conflict'},error:null};
  if(name==='career_host_load'){
    if(db.options.malformedLoad)return {data:{},error:null};
    if(db.options.failLoad)return {data:null,error:{message:'TEST LOAD FAILED'}};
    return {data:{snapshot:copy(db.state.career),revision:db.state.career.revision||0,accountVersion:db.version||0,account:copy(db.account||{}),watchState:copy(db.state.career.stores.alertWatchState||{}),reminders:[]},error:null};
  }
  if(db.options.failSave||db.options.failAssistant)return {data:null,error:{message:'TEST ATOMIC COMMIT FAILED'}};
  if(args.p_revision!==(db.state.career.revision||0)||args.p_account_version!==(db.version||0))return {data:{error:'revision_conflict'},error:null};
  db.state.career={...copy(args.p_snapshot),revision:args.p_revision+1};db.version=(db.version||0)+1;
  db.messages.push({thread_id:thread,role:'user',content:args.p_input},{thread_id:thread,role:'assistant',content:args.p_response.reply,meta:{...copy(args.p_response.meta),career_turn_key:args.p_key}});
  db.receipts.set(args.p_key,{hash:args.p_hash,response:copy(args.p_response)});
  return {data:db.options.malformedCommit?{}:{response:copy(args.p_response)},error:null};
};
