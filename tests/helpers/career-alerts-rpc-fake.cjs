// Synthetic RPC transport fixture for the existing 14 host assertions.
// Does not prove database atomicity; real PostgreSQL has a separate suite.
module.exports=function makeRPC(rows,tableExists){
  const versions=new Map(),outbox=new Map();let nextLease=0;
  const clone=x=>x==null?x:structuredClone(x);
  function run(name,a){
    if(!tableExists)return {data:null,error:{code:'PGRST205',message:'career_watch_kv does not exist'}};
    const uid=a.p_user,key=k=>uid+'|'+k;
    const version=versions.get(uid)||0;
    const get=k=>clone(rows.get(key(k))?.value??null);
    const put=(k,v)=>rows.set(key(k),{user_id:uid,key:k,value:clone(v)});
    let data;
    if(name==='career_watch_read')data={value:get(a.p_key),version,epoch:0};
    else if(name==='career_watch_write'){
      if(a.p_version!==version)throw Error('stale fixture worker');put(a.p_key,a.p_value);versions.set(uid,version+1);data={version:version+1,epoch:0};
    }else if(name==='career_watch_cycle_commit'){
      if(a.p_version!==version)throw Error('stale fixture cycle');for(const [k,v]of Object.entries(a.p_writes))put(k,v);
      for(const r of a.p_reminders)if(!outbox.has(key(r.reminder_id)))outbox.set(key(r.reminder_id),{status:'pending',reminder:clone(r)});
      versions.set(uid,version+Object.keys(a.p_writes).length);data={version:versions.get(uid),epoch:0};
    }else if(name==='career_reminder_enqueue'){
      const r=a.p_reminder;if(!outbox.has(key(r.reminder_id)))outbox.set(key(r.reminder_id),{status:'pending',reminder:clone(r)});data={stored:true};
    }else if(name==='career_reminder_list')data={reminders:[...outbox.entries()].filter(([k,v])=>k.startsWith(uid+'|')&&['pending','claimed','uncertain'].includes(v.status)).map(([,v])=>clone(v.reminder))};
    else if(name==='career_reminder_claim'){
      const r=outbox.get(key(a.p_id));if(!r)data={status:'missing',claimed:false};else if(r.status!=='pending')data={...clone(r),claimed:false};else{r.status='claimed';r.leaseToken='fixture-'+(++nextLease);data={...clone(r),claimed:true};}
    }else if(name==='career_reminder_ack'){
      const r=outbox.get(key(a.p_id));if(!r||r.leaseToken!==a.p_lease)throw Error('bad fixture lease');r.status='delivered';r.record=clone(a.p_record);data={status:r.status,record:r.record};const ledger=get('career:delivery-ledger:'+uid)||{delivered_ids:[],records:[]};ledger.delivered_ids.push(a.p_id);ledger.records.push(r.record);put('career:delivery-ledger:'+uid,ledger);
    }else if(name==='career_reminder_status')data=clone(outbox.get(key(a.p_id)));
    else throw Error('unexpected RPC '+name);
    return {data,error:null};
  }
  return async(name,args)=>run(name,args);
};
