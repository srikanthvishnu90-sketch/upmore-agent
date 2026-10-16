'use strict';
// Read-only inspection of product sources. Only disposable synthetic queue
// files are changed. No source/test patch, provider or external action.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(process.argv[2]||'/workspace/upmore-flexible-final-verification'),out=__dirname;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-c37-inspection-'));
process.env.GAUNTLET_OUT_DIR=path.join(temp,'evidence');process.env.GAUNTLET_HARNESS_TMP=path.join(temp,'harness');
const L=require(path.join(root,'scripts/career/gauntlet/pilot-lib.cjs')),D=require(path.join(root,'packages/domain/141-career-doorstep.js'));
const fx=JSON.parse(fs.readFileSync(path.join(root,'packages/career-data/fixtures/gauntlet/deepdive/deepdive-fixtures.json'))).queue_ap17;
const setup=JSON.parse(fs.readFileSync(path.join(root,'scripts/career/gauntlet/cases/fixtures/c37-setup.json')));
const copy=x=>JSON.parse(JSON.stringify(x)),message="stop everything. don't contact anyone";
const mixed=copy(fx);mixed.outreach_queue.items[0].status='sent';mixed.outreach_queue.items[1].status='sending';mixed.outreach_queue.items[2].status='pending';
const results=[];
for(const [name,seed]of [['r2a-original-fixture',fx],['r3-original-fixture',setup],['mixed-sent-inflight-pending',mixed]]){
 const before=copy(seed);delete before.ground_truth;
 const queue=path.join(temp,name+'.json'),directQueue=path.join(temp,name+'-direct.json');fs.writeFileSync(queue,JSON.stringify(before));fs.writeFileSync(directQueue,JSON.stringify(before));
 const ctx={profile:L.gauntletProfile('p1-early-career-swe'),queueStatePath:queue,now:'2026-10-16T00:00:00.000Z'};
 const session=L.H.session('inspect-'+name,'inspect-'+name);const turn=L.chatTurn(session,message,ctx),r=turn.result;
 const direct=D.haltQueue({profile:L.gauntletProfile('p1-early-career-swe'),queueStatePath:directQueue,now:ctx.now},message);
 const after=JSON.parse(fs.readFileSync(queue)),items=before.outreach_queue.items,pending=items.filter(i=>['pending','queued'].includes(i.status)).length,sent=items.filter(i=>i.status==='sent').length,inflight=items.filter(i=>i.status==='sending').length;
 const item=after.outreach_queue.items.find(i=>i.status==='halted');
 const late=D.applyQueueEvent(after,{event_id:name+'-late',type:'delivery_confirmation',queue_id:item.queue_id,sent_at:'2026-10-12T09:00:00Z'});
 const duplicate=D.applyQueueEvent(after,{event_id:name+'-late',type:'delivery_confirmation',queue_id:item.queue_id,sent_at:'2026-10-12T09:00:00Z'});
 const old=D.applyQueueEvent(after,{event_id:name+'-older',type:'status_update',queue_id:item.queue_id,status:'pending',sent_at:'2026-10-10T09:00:00Z'});
 const fields=['intent','resultStatus','halted_count','sent_count','in_flight_count','already_stopped_count','queue_total','counts_verified'];
 const sameTypedResult=fields.every(k=>JSON.stringify(r[k])===JSON.stringify(direct[k]));
 const checks={typedQueueHalt:r.intent==='queue_halt'&&r.resultStatus==='completed',countsMatchReadback:r.halted_count===pending&&r.sent_count===sent&&r.in_flight_count===inflight,globalPausePersisted:after.global_pause?.set===true&&after.outreach_queue.global_pause?.set===true,haltPersisted:after.outreach_queue.halted===true&&after.outreach_queue.items.every((i,n)=>!['pending','queued'].includes(items[n].status)||i.status==='halted'),noLateRevival:late.applied===false&&old.applied===false&&duplicate.deduped===true,sameTypedResultAsDirect141:sameTypedResult,sameReplyAsDirect141:r.reply===direct.reply};
 results.push({case:name,handler:turn.handler,expectedPending:pending,previouslySent:sent,previouslyInFlight:inflight,result:Object.fromEntries(fields.map(k=>[k,r[k]])),reply:r.reply,delivered:(turn.delivered||[]).join('\n'),legacyAssertions:{handler141:turn.handler==='141-career-doorstep.handleChat',haltedCount3:r.halted_count===3,literalNothingWasSent:/Nothing was sent/.test((turn.delivered||[]).join('\n'))},checks});
}
const record={source:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),message,sourceFilesChanged:false,externalCalls:0,results};fs.writeFileSync(path.join(out,'minimal-reproduction.json'),JSON.stringify(record,null,2)+'\n');
for(const r of results)for(const [name,ok]of Object.entries(r.checks))assert.equal(ok,true,r.case+': '+name);
console.log(JSON.stringify({source:record.source,cases:results.map(r=>({case:r.case,handler:r.handler,checksPassed:Object.keys(r.checks).length,legacyAssertions:r.legacyAssertions}))},null,2));
fs.rmSync(temp,{recursive:true,force:true});
