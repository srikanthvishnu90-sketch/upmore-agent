"use strict";
// MOCK SQL authority for standalone engine tests only. Production has no
// file-authority adapter; it requires createTaskAuthority's trusted RPCs.
const fs = require("node:fs");
const path = require("node:path");
const { hash, fail, clone } = require("../../workers/career-browser/store.cjs");
function mockAuthority(root) {
  const file = path.join(root, "MOCK-authority.json");
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { accounts: {}, intents: {}, effects: {} };
  const write = data => fs.writeFileSync(file, JSON.stringify(data));
  const account = (data, user) => data.accounts[user] ||= { exists: true, version: 1, epoch: 0, paused: false };
  const active = (data, g, readOnly = false) => {
    const a = account(data, g.userId);
    if (!a.exists || a.epoch !== g.privacyEpoch || a.version !== g.accountVersion || (a.paused && !readOnly)) throw fail("TASK_AUTHORITY_REVOKED");
  };
  const authority = {
    register(userId, binding, request) {
      const data = read(), a = account(data, userId);
      const intentId = hash([userId, binding]);
      data.intents[intentId] ||= { version: "career_task_intent/v1", intentId, userId, accountVersion: a.version, privacyEpoch: a.epoch,
        binding: clone(binding), request: request ? clone(request) : null, leaseToken: "mock-lease-" + intentId };
      write(data); return intentId;
    },
    current(userId) { const data=read();return clone(account(data,userId)); },
    history(g) {
      const d=read();active(d,g);
      return {records:Object.values(d.effects).filter(e=>e.userId===g.userId&&e.operation==='submit').map(e=>{
        const p=Object.values(d.intents).find(i=>i.userId===g.userId&&i.taskId===e.taskId&&i.request?.posting)?.request.posting;
        return {userId:g.userId,status:'submission_admitted',timestamp:e.admittedAt,company:p?.company,vendor:'controlled_loopback'};
      })};
    },
    claim({ userId, intentId, taskId, expected }) {
      const data=read(), g=data.intents[intentId];
      if(!g||g.userId!==userId)throw fail("TASK_INTENT_REQUIRED");
      active(data,g,g.binding.action==="reconcile");
      for(const [k,v]of Object.entries(expected))if(v!=null&&g.binding[k]!==v)throw fail("TASK_AUTHORITY_BINDING_MISMATCH");
      if(g.taskId&&g.taskId!==taskId)throw fail("TASK_AUTHORITY_BINDING_MISMATCH");
      g.taskId=taskId;write(data);return clone(g);
    },
    begin(g,operation,key) {
      const data=read();active(data,g,operation==="destination_readback");
      if(data.effects[key])throw fail("TASK_EFFECT_OUTCOME_UNCERTAIN");
      if(operation!=="destination_readback"&&Object.values(data.effects).some(e=>e.taskId===g.taskId&&["started","uncertain"].includes(e.state)))throw fail("TASK_AUTHORITY_REVOKED");
      data.effects[key]={token:key,effectKey:key,userId:g.userId,taskId:g.taskId,state:"reserved",operation,admittedAt:new Date().toISOString()};write(data);return clone(data.effects[key]);
    },
    consume(g,ticket) {const d=read();active(d,g,ticket.operation==="destination_readback");const e=d.effects[ticket.token];if(e?.state!=="reserved")throw fail("TASK_AUTHORITY_REVOKED");e.state="started";write(d);},
    settle(g,ticket,state,beforeSha256,afterSha256) {const d=read(),e=d.effects[ticket.token];if(!e)throw fail("TASK_AUTHORITY_UNAVAILABLE");Object.assign(e,{state,beforeSha256,afterSha256});write(d);return clone(e);},
    finish(g,task) {const d=read();active(d,g,g.binding.action==="reconcile");d.intents[g.intentId].result=clone(task);write(d);return {state:"completed"};},
    pending() {return [];},
    control(userId,patch) {const d=read(),a=account(d,userId);Object.assign(a,patch);a.version++;write(d);},
  };
  return authority;
}
function bindMockTaskClient(worker, authority) {
  return { ...worker,
    receive(userId,input) {const intentId=authority.register(userId,{action:"prepare",event_id:input.eventId,artifact_id:input.artifactId,resume_sha256:input.resumeSha256,destination:input.posting.url},input);return worker.receive(userId,{...input,intentId});},
    approve(userId,id,a) {const intentId=authority.register(userId,{action:"approve",event_id:a?.approvalRef,task_id:id,payload_sha256:a?.payloadSha256,resume_sha256:a?.resumeSha256,destination:a?.destination});return worker.approve(userId,id,{...a,intentId});},
    reconcile(userId,id) {const intentId=authority.register(userId,{action:"reconcile",task_id:id});return worker.reconcile(userId,id,{intentId});},
  };
}
module.exports={mockAuthority,bindMockTaskClient};
