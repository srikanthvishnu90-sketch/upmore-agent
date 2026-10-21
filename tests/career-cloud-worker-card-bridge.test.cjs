"use strict";
// TESTS ONLY, review-1 gate E15. No DB, network, browser, provider, or real employer effects.
// The captured Veeva names/labels are reused below; the engine is a scripted effects probe.
// NEW REGRESSION means a behavioral failure on 01401cb4. CONTROL means already passing there.
// Proposed queue seam: authorize(job, 'before_engine'|'before_effect') -> Promise<void> checks CURRENT
// lease/card authority, throws on refusal,
// and is called again after asynchronous preparation before dispatch. It is not a test for an export.
// TRANSPORT ACCEPTANCE SPEC — NOT_RUN, pending architect design PASS and implementation:
// Use the ACTUAL cloudEngineRunner child, never a scripted engine calling its own mock hook.
// While its captured Veeva browser prepares, revoke the immutable job/card/lease authority;
// observe the child's real pre-effect request on piped stdout, resolve the SAME job+lease+original
// card Hq in the parent, return deny on stdin, and require zero local employer POSTs.
// Positive: one real request/allow, exact original approved He, one POST, no secret in child env.
// Negatives: stale/foreign lease or Hq, malformed/unknown request, missing/late response, duplicate
// request and child transport loss all refuse the next effect; terminal evidence still records.
// Check opt-out/pause/epoch/withdrawal at that request boundary, and keep destination/body checks.
// No transport score/pass is claimed by this suite's scripted engine or its before-engine race.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const repo = path.resolve(__dirname, "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-cloud-worker-gate-"));
let measured;
before(() => {
  const fixture = path.join(repo, "tests/fixtures/forms-ci/lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027.html");
  const html = fs.readFileSync(fixture, "utf8");
  for (const name of ["name", "email", "resume", "cards[651d37ec-0ef2-40dc-9bf5-6f5973ab81c0][field0]"])
    assert.ok(html.includes('name="' + name + '"'), "captured Veeva field missing: " + name);
  const driver = path.join(dir, "driver.ts");
  fs.writeFileSync(driver, `
import { prepare } from ${JSON.stringify("file://" + repo + "/workers/career-browser/approve-first.ts")};
import { runCloudJob } from ${JSON.stringify("file://" + repo + "/workers/career-cloud/worker.ts")};
import { applicationApprovalHash, planApplication, trustedFacts } from ${JSON.stringify("file://" + repo + "/scripts/apply.ts")};
import { hashApplyPayload } from ${JSON.stringify("file://" + repo + "/supabase/functions/_shared/career_apply_store.ts")};
const OWNER="TEST-card-cloud-owner", URL="https://jobs.lever.co/veeva/9ac55b31-df46-4acb-b305-2c0b7ed56027/apply", JOB="lever:veeva:9ac55b31-df46-4acb-b305-2c0b7ed56027";
const bytes=new TextEncoder().encode("%PDF-1.4 SYNTHETIC CARD TEST"), sha=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");
const artifact={filename:"synthetic.pdf",sha256:sha};
const SPONS="cards[651d37ec-0ef2-40dc-9bf5-6f5973ab81c0][field0]";
const schema=[{name:"name",label:"Full name",type:"text",required:true,options:[]},{name:"email",label:"Email",type:"email",required:true,options:[]},{name:SPONS,label:"Do you now, or in the future require sponsorship?",type:"select",required:true,options:[{label:"Yes",value:"Yes"},{label:"No",value:"No"}]},{name:"resume",label:"Resume/CV",type:"file",required:true,options:[]}];
const own=(factId,value)=>({factId,value,confirmed:true,provenance:"owner stated in synthetic TEST",confirmation_event_id:"evt-"+factId});
const file={user_id:OWNER,answers:{full_name:own("TEST-NAME","Synthetic Reviewer"),email:own("TEST-EMAIL","reviewer@example.test"),sponsorship:own("TEST-SPONS","No")},saved:{}};
async function prepared(){
 const manifest=trustedFacts(file,artifact), plan=planApplication({manifest,userId:OWNER,jobId:JOB,employer:"Veeva",schema,artifact,now:Date.now()});
 if(!plan.ready)throw Error("positive planning failed: "+JSON.stringify(plan));
 const schemaHash=await hashApplyPayload(schema), fields=plan.fields;
 const engineHash=await applicationApprovalHash({userId:OWNER,posting:JOB,destination:URL,fields,resumeSha256:sha,schemaHash,pageFieldNames:[],manifest});
 const p=await prepare({url:URL,factsPath:"synthetic.json",resumePath:"synthetic.pdf",account:{epoch:1,version:1},now:Date.now(),runEngine:async()=>({result:{state:"not_submitted",reason:"dry_run"},evidence:{approval_hash:engineHash,schema,fields,sources:manifest.byFactId,replay_sources:Object.values(manifest.byFactId),trust:{quarantine_version:manifest.version,manifest_hash:manifest.hash},payload:{user_id:OWNER,posting:JOB,company:"Veeva",destination:URL,resume:artifact,page_fields:{},schema_hash:schemaHash}}})});
 if(!p.ready)throw Error("positive prepare failed");return p;
}
async function drive(kind){
 const p=await prepared(), original=structuredClone(p.payload);
 const job={id:"TEST-JOB-"+kind,lease_token:"TEST-LEASE-"+kind,user_id:OWNER,company:"Veeva",url:URL,payload:p.payload,payload_hash:p.hash,approval_hash:p.hash,execution_mode:"cloud",card_id:"TEST-CARD",card_hash:"a".repeat(64),approval_id:"TEST-APPROVAL"};
 if(kind==="answer")job.payload.fields.find(f=>f.name==="email").value="changed@example.test";
 if(kind==="resume")job.payload.resume_sha256="b".repeat(64);
 if(kind==="destination")job.payload.destination="https://jobs.lever.co/other/post";
 if(kind==="company")job.payload.company=job.company="Other Employer";
 if(kind==="page-url")job.payload.url=job.url=URL+"?changed-page";
 if(kind==="company"||kind==="page-url")job.payload_hash=job.approval_hash=await hashApplyPayload(job.payload);
 let allowed=kind!=="denied-before-start",finishCalls=0,effects=0,resumeCalls=0;
 const authorizations=[],engineCalls=[],receipts=[];
 const queue={claim:async()=>[],gatePresent:async()=>true,
  authorize:async(j,phase)=>{authorizations.push({id:j.id,lease:j.lease_token,phase:phase??null});if(!["before_engine","before_effect"].includes(phase))throw Error("CARD_CLOUD_INVALID_PHASE");if(j.id!==job.id||j.lease_token!==job.lease_token)throw Error("CARD_CLOUD_LEASE_MISMATCH");if(!allowed)throw Error("CARD_CLOUD_PERMISSION_REVOKED");if(await hashApplyPayload(j.payload)!==p.hash)throw Error("APPROVED_APPLICATION_CHANGED");},
  resume:async(j)=>{resumeCalls++;if(j.lease_token!==job.lease_token)throw Error("LEASE_MISMATCH");if(kind==="revoked-during-resume")allowed=false;return{filename:artifact.filename,sha256:sha,b64:btoa(String.fromCharCode(...bytes))};},
  ask:async()=>{throw Error("unexpected question side effect");},
  finish:async(j,state,evidence,outcome)=>{finishCalls++;receipts.push({id:j.id,lease:j.lease_token,state,outcome,reason:evidence.reason});if(kind==="receipt-lost"&&finishCalls===1)throw Error("synthetic lost receipt response");}
 };
 await runCloudJob(job,{queue,log:()=>{},runEngine:async(args,env)=>{engineCalls.push({args,env:env??null});effects++;return{result:{state:"confirmed",reason:"synthetic effect probe only",confirmation_id:"TEST-RECEIPT-1"},evidence:{}};}});
 return{kind,effects,resumeCalls,finishCalls,authorizations,engineCalls,receipts,engineHash:original.engine_approval,originalCardPayloadHash:p.hash,queuedPayloadHash:await hashApplyPayload(job.payload),queueDeclaredPayloadHash:job.payload_hash,queueApprovalHash:job.approval_hash};
}
const results={};for(const kind of ["clean","denied-before-start","revoked-during-resume","receipt-lost","answer","resume","destination","company","page-url"])results[kind]=await drive(kind);
console.log("CARD_BRIDGE_MEASURED "+JSON.stringify(results));
`);
  const r = spawnSync(process.env.DENO_BIN || "deno", ["run", "--no-check", "--cached-only", "--no-remote", "--allow-read", "--allow-write=/tmp", "--deny-net", "--no-prompt", driver], { encoding: "utf8", timeout: 30000 });
  assert.equal(r.status, 0, "worker fixture failed, not a regression result:\n" + r.stdout + r.stderr);
  const line = r.stdout.split("\n").find(l => l.startsWith("CARD_BRIDGE_MEASURED "));
  assert.ok(line, r.stdout + r.stderr);
  measured = JSON.parse(line.slice("CARD_BRIDGE_MEASURED ".length));
  if (process.env.CARD_BRIDGE_MEASUREMENTS) fs.writeFileSync(process.env.CARD_BRIDGE_MEASUREMENTS, JSON.stringify(measured, null, 2) + "\n");
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("CONTROL: unchanged prepared Veeva answers dispatch exactly --submit --approved He once", () => {
  const r = measured.clean;
  assert.equal(r.effects, 1);
  assert.equal(r.engineCalls.length, 1);
  const args = r.engineCalls[0].args;
  assert.ok(args.includes("--submit"));
  assert.equal(args[args.indexOf("--approved") + 1], r.engineHash);
  assert.equal(r.originalCardPayloadHash, r.queuedPayloadHash);
  assert.equal(r.receipts[0].outcome, "submitted");
});
test("NEW REGRESSION: denied current lease/card authorization must stop before resume or engine", () => {
  const r = measured["denied-before-start"];
  assert.equal(r.effects, 0, JSON.stringify(r));
  assert.equal(r.resumeCalls, 0);
  assert.ok(r.authorizations.length >= 1);
});
test("NEW REGRESSION: authorization revoked during resume fetch must be checked again before engine", () => {
  const r = measured["revoked-during-resume"];
  assert.equal(r.effects, 0, JSON.stringify(r));
  assert.equal(r.resumeCalls, 1);
  assert.ok(r.authorizations.length >= 2, "initial and pre-effect current authority reads");
  assert.ok(r.authorizations.every(a => a.lease === "TEST-LEASE-revoked-during-resume"));
});
test("CONTROL: lost terminal receipt retries the receipt, never the successful engine", () => {
  const r = measured["receipt-lost"];
  assert.equal(r.effects, 1);
  assert.equal(r.engineCalls.length, 1);
  assert.equal(r.finishCalls, 2);
  assert.deepEqual(r.receipts[1], r.receipts[0]);
});
for (const [kind, reason] of [["answer", "APPROVED_APPLICATION_CHANGED"], ["resume", "APPROVED_MANIFEST_CHANGED"], ["destination", "APPROVED_APPLICATION_CHANGED"]])
  test("CONTROL: postapproval " + kind + " mutation stops with " + reason + " and no engine", () => {
    const r = measured[kind];
    assert.equal(r.effects, 0, JSON.stringify(r));
    assert.equal(r.receipts[0].reason, reason);
    assert.equal(r.receipts[0].outcome, "not_sent");
  });
for (const kind of ["company", "page-url"])
  test("NEW REGRESSION: rehashed " + kind + " mutation cannot replace frozen card Hq although He matches", () => {
    const r = measured[kind];
    assert.notEqual(r.queuedPayloadHash, r.originalCardPayloadHash, "real postapproval queue mutation");
    assert.equal(r.queueDeclaredPayloadHash, r.queuedPayloadHash, "the queue itself was consistently rehashed");
    assert.equal(r.queueApprovalHash, r.queuedPayloadHash);
    assert.equal(r.effects, 0, JSON.stringify(r));
    assert.equal(r.receipts[0].reason, "APPROVED_APPLICATION_CHANGED");
  });
