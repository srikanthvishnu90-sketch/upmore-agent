"use strict";
// QA only. Real engineInput/trustedManifest, planner, prepare and approval hashing; RPC is a local probe.
// This proves parent-side source validation/call routing, not SQL digest locking or child POST fencing.
// Runtime: cached-only, no remote imports, denied network; no DB/provider/browser/resume upload.
// The snapshot response requires user_id. The foreign-envelope case hardens that exact response
// contract; its inner sources remain requested-owner data and do not demonstrate a cross-user leak.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const repo = path.resolve(process.env.CURRENT_SOURCES_QA_ROOT || path.join(__dirname, ".."));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-current-sources-qa-"));
const uri = file => JSON.stringify(pathToFileURL(path.join(repo, file)).href);
let measured;
before(() => {
  const driver = path.join(dir, "probe.ts");
  fs.writeFileSync(driver, `
import { engineInput } from ${uri("workers/career-cloud/engine_input.ts")};
import { trustedManifest } from ${uri("extension/src/apply_core.ts")};
import { applicationApprovalHash, planApplication } from ${uri("scripts/apply.ts")};
import { prepare } from ${uri("workers/career-browser/approve-first.ts")};
import { hashApplyPayload } from ${uri("supabase/functions/_shared/career_apply_store.ts")};
import { authorizeCurrentCloudJob, assertCurrentApprovedSources } from ${uri("workers/career-cloud/current_sources.ts")};
const OWNER="00000000-0000-4000-8000-00000000aa01", OTHER="00000000-0000-4000-8000-00000000aa02";
const URL="https://jobs.lever.co/synthetic/current-sources/apply", JOB="lever:synthetic:current-sources";
const SHA="a".repeat(64), NOW=1792627200000;
const fact=(id,text,extra={})=>({id,text,kind:"other",source:"user",status:"confirmed",needs_confirmation:false,
 provenance:"owner confirmed in synthetic chat",confirmation_event_id:"event-"+id,...extra});
const profile={user_id:OWNER,facts:[fact("F-001","My phone number is (555) 010-0199",{derived_from:["F-002"]}),
 fact("F-002","My country is United States")]};
const rows=[{id:"00000000-0000-4000-8000-00000000bb01",user_id:OWNER,key:"fact:email",kind:"fact",answer:"qa@example.test",state:"answered"}];
const schema=[{name:"phone",label:"Phone",type:"tel",required:true,options:[]},
 {name:"email",label:"Email",type:"email",required:true,options:[]},
 {name:"resume",label:"Resume/CV",type:"file",required:true,options:[]}];
const artifact={filename:"synthetic.pdf",sha256:SHA};
const originalInput=engineInput({owner:OWNER,profile,rows,resumeSha256:SHA});
const manifest=trustedManifest({owner:OWNER,file:originalInput.facts,rows:originalInput.facts.text_answers,resume:{sha256:SHA}});
if(!manifest.byFactId["F-001"]||!manifest.byFactId["F-002"])throw Error("fixture lacks real projected dependency");
const plan=planApplication({manifest,userId:OWNER,jobId:JOB,employer:"Synthetic",schema,artifact,now:NOW});
if(!plan.ready)throw Error("fixture planner failed: "+JSON.stringify(plan));
const schemaHash=await hashApplyPayload(schema), engineHash=await applicationApprovalHash({userId:OWNER,posting:JOB,
 destination:URL,fields:plan.fields,resumeSha256:SHA,schemaHash,pageFieldNames:[],manifest});
const prepared=await prepare({url:URL,factsPath:"unused-local-facts.json",resumePath:"unused-local-resume.pdf",
 account:{epoch:7,version:11},now:NOW,runEngine:async()=>({result:{state:"not_submitted",reason:"dry_run"},
 evidence:{approval_hash:engineHash,schema,fields:plan.fields,sources:manifest.byFactId,replay_sources:Object.values(manifest.byFactId),
 trust:{quarantine_version:manifest.version,manifest_hash:manifest.hash},payload:{user_id:OWNER,posting:JOB,company:"Synthetic",
 destination:URL,resume:artifact,page_fields:{},schema_hash:schemaHash}}})});
if(!prepared.ready)throw Error("fixture prepare failed");
const job={id:"00000000-0000-4000-8000-00000000cc01",lease_token:"00000000-0000-4000-8000-00000000cc02",
 user_id:OWNER,company:"Synthetic",url:URL,payload:prepared.payload,payload_hash:prepared.hash,approval_hash:prepared.hash};
async function probe(kind){
 const j=structuredClone(job), p=structuredClone(profile), r=structuredClone(rows), calls=[];
 let snapshotOwner=OWNER,digestOverride,phase="before_effect",resultOverride,readFailure=false,drift=false;
 if(kind==="withdraw_profile")p.facts=[];
 if(kind==="withdraw_dependency")p.facts=p.facts.filter(f=>f.id!=="F-002");
 if(kind==="withdraw_row")r.length=0;
 if(kind==="unconfirm")p.facts[0].status="unconfirmed";
 if(kind==="event_changed")p.facts[0].confirmation_event_id="event-new";
 if(kind==="provenance_changed")p.facts[0].provenance="owner stated in a different confirmation";
 if(kind==="dependency_conflict")p.facts.push(fact("F-003","My country is Canada"));
 if(kind==="row_conflict")r.push({...r[0],id:"00000000-0000-4000-8000-00000000bb02",key:"fact:phone",answer:"(555) 010-0999"});
 if(kind==="foreign_profile")p.user_id=OTHER;
 if(kind==="foreign_row")r[0].user_id=OTHER;
 if(kind==="foreign_envelope")snapshotOwner=OTHER;
 if(kind==="missing_digest")digestOverride=null;
 if(kind==="bad_digest")digestOverride="not-a-digest";
 if(kind==="digest_tamper")digestOverride="c".repeat(64);
 if(kind==="digest_drift")drift=true;
 if(kind==="read_failed")readFailure=true;
 if(kind==="invalid_phase")phase="after_effect";
 if(kind==="before_engine")phase="before_engine";
 if(kind==="unrelated_addition"||kind==="unrelated_cannot_authorize_change"){
  p.facts.push(fact("F-004","I am authorized to work in the United States"));
  r.push({...r[0],id:"00000000-0000-4000-8000-00000000bb03",key:"fact:full_name",answer:"Synthetic Reviewer"});
 }
 if(kind==="unrelated_cannot_authorize_change"){
  j.payload.fields.find(f=>f.name==="email").value="unsupported@example.test";
  j.payload_hash=j.approval_hash=await hashApplyPayload(j.payload);
 }
 if(kind==="queue_owner_changed")j.user_id=OTHER;
 if(kind==="auth_false")resultOverride={authorized:false};
 if(kind==="auth_empty")resultOverride={};
 if(kind==="auth_wrong_job")resultOverride={authorized:true,job_id:"other",lease_token:j.lease_token,payload_hash:j.payload_hash};
 if(kind==="auth_wrong_lease")resultOverride={authorized:true,job_id:j.id,lease_token:"old",payload_hash:j.payload_hash};
 if(kind==="auth_wrong_hash")resultOverride={authorized:true,job_id:j.id,lease_token:j.lease_token,payload_hash:"b".repeat(64)};
 const body={user_id:snapshotOwner,profile:p,rows:r},digest=await hashApplyPayload(body);
 const snapshot={...body,digest:digestOverride===undefined?digest:digestOverride};
 if(kind==="missing_digest")delete snapshot.digest;
 const current=engineInput({owner:OWNER,profile:p,rows:r,resumeSha256:SHA});
 let code=null;
 try {await authorizeCurrentCloudJob(j,phase,{rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});
  if(name==="career_apply_message_cloud_sources"){
   if(readFailure)throw Error("synthetic read failed");return structuredClone(snapshot);
  }
  if(name!=="career_apply_message_cloud_authorize")throw Error("unexpected RPC");
  // SQL is NOT being tested: the probe records the exact digest handed to the atomic SQL fence.
  // A simulated current-row write makes that fence refuse; no second source lookup is supplied.
  const expected=drift?await hashApplyPayload({...body,rows:[...r,{changed:true}]}):digest;
  if(args.p_source_digest!==expected)throw Error("SNAPSHOT_DIGEST_DRIFT");
  return resultOverride??{authorized:true,job_id:j.id,lease_token:j.lease_token,payload_hash:j.payload_hash};
 }});}catch(e){code=e.code??e.message;}
 return {code,calls,digest,originalPayloadHash:prepared.hash,account_version:j.payload.account_version,privacy_epoch:j.payload.privacy_epoch,
  currentHash:current.manifest.hash,originalHash:originalInput.manifest.hash,excluded:current.manifest.excluded,
  conflictCount:current.manifest.conflicts.length};
}
const result={};
for(const kind of ${JSON.stringify([
  "clean", "before_engine", "withdraw_profile", "withdraw_dependency", "withdraw_row", "unconfirm",
  "event_changed", "provenance_changed", "dependency_conflict", "row_conflict", "foreign_profile", "foreign_row",
  "foreign_envelope", "missing_digest", "bad_digest", "digest_tamper", "digest_drift", "read_failed", "invalid_phase",
  "unrelated_addition", "unrelated_cannot_authorize_change", "queue_owner_changed", "auth_false", "auth_empty",
  "auth_wrong_job", "auth_wrong_lease", "auth_wrong_hash",
])})result[kind]=await probe(kind);
// Direct pure boundary: a wrong EngineInput owner must fail even with an otherwise intact projection.
const wrong=structuredClone(originalInput);wrong.facts.user_id=OTHER;
try{assertCurrentApprovedSources(job.payload,wrong);result.direct_wrong_owner=null;}catch(e){result.direct_wrong_owner=e.code??e.message;}
console.log("CURRENT_SOURCES_QA "+JSON.stringify(result));
`);
  const run = spawnSync(process.env.DENO_BIN || "deno", ["run", "--no-check", "--cached-only", "--no-remote",
    "--allow-read", "--allow-write=/tmp", "--deny-net", "--no-prompt", driver],
  { encoding: "utf8", timeout: 30000 });
  assert.equal(run.status, 0, "fixture/runtime error; not a behavioral regression:\n" + run.stdout + run.stderr);
  const line = run.stdout.split("\n").find(l => l.startsWith("CURRENT_SOURCES_QA "));
  assert.ok(line, "fixture produced no measurement:\n" + run.stdout + run.stderr);
  measured = JSON.parse(line.slice("CURRENT_SOURCES_QA ".length));
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const sourceCalls = r => r.calls.filter(c => c.name === "career_apply_message_cloud_sources");
const authCalls = r => r.calls.filter(c => c.name === "career_apply_message_cloud_authorize");
for (const kind of ["clean", "before_engine", "unrelated_addition"]) {
  test(kind + ": original confirmed sources authorize with exactly one atomic snapshot read", () => {
    const r = measured[kind];
    assert.equal(r.code, null, JSON.stringify(r));
    assert.equal(sourceCalls(r).length, 1);
    assert.equal(authCalls(r).length, 1);
    assert.deepEqual(r.calls.map(c => c.name), ["career_apply_message_cloud_sources", "career_apply_message_cloud_authorize"]);
    assert.deepEqual(sourceCalls(r)[0].args, { p_user: "00000000-0000-4000-8000-00000000aa01" });
    assert.deepEqual(authCalls(r)[0].args, { p_id: "00000000-0000-4000-8000-00000000cc01",
      p_lease: "00000000-0000-4000-8000-00000000cc02", p_hash: r.originalPayloadHash, p_source_digest: r.digest });
    assert.match(authCalls(r)[0].args.p_hash, /^[a-f0-9]{64}$/);
    if (kind === "unrelated_addition") assert.notEqual(r.currentHash, r.originalHash, "new facts changed the full live manifest");
  });
}
for (const kind of ["withdraw_profile", "withdraw_dependency", "withdraw_row", "unconfirm", "event_changed",
  "provenance_changed", "dependency_conflict", "row_conflict", "foreign_profile", "foreign_row"]) {
  test(kind + ": current source change denies before SQL authorization with unchanged account version/epoch", () => {
    const r = measured[kind];
    assert.equal(r.code, "APPROVED_SOURCE_WITHDRAWN", JSON.stringify(r));
    assert.equal(r.account_version, 11);
    assert.equal(r.privacy_epoch, 7);
    assert.equal(sourceCalls(r).length, 1);
    assert.equal(authCalls(r).length, 0);
    if (kind === "withdraw_dependency" || kind === "dependency_conflict")
      assert.ok(r.excluded.some(e => e.factId === "F-001"), "actual contract excluded derived phone source");
    if (kind === "row_conflict") assert.ok(r.conflictCount > 0, "actual manifest reported conflict");
  });
}
test("required response owner: contradictory snapshot envelope denies before authorization", () => {
  const r = measured.foreign_envelope;
  assert.equal(r.code, "FACT_OWNER_MISMATCH", JSON.stringify(r));
  assert.equal(authCalls(r).length, 0);
});
for (const kind of ["missing_digest", "bad_digest", "digest_tamper", "read_failed"]) {
  test(kind + ": no digest/read evidence means zero authorization calls", () => {
    assert.equal(measured[kind].code, "CARD_CLOUD_SOURCE_READ_FAILED");
    assert.equal(authCalls(measured[kind]).length, 0);
  });
}
test("digest drift is passed to and refused by the atomic authorization boundary without duplicate parent reads", () => {
  const r = measured.digest_drift;
  assert.equal(r.code, "SNAPSHOT_DIGEST_DRIFT");
  assert.equal(sourceCalls(r).length, 1);
  assert.equal(authCalls(r).length, 1);
  assert.equal(authCalls(r)[0].args.p_source_digest, r.digest);
});
for (const kind of ["invalid_phase", "queue_owner_changed", "unrelated_cannot_authorize_change"]) {
  test(kind + ": invalid phase/identity/changed answer cannot read or authorize current sources", () => {
    assert.equal(measured[kind].code, kind === "invalid_phase" ? "INVALID_CLOUD_AUTHORIZATION_PHASE" : "APPROVED_APPLICATION_CHANGED");
    assert.equal(measured[kind].calls.length, 0);
  });
}
for (const kind of ["auth_false", "auth_empty", "auth_wrong_job", "auth_wrong_lease", "auth_wrong_hash"]) {
  test(kind + ": only an explicit matching job/lease/Hq authorization is accepted", () => {
    assert.equal(measured[kind].code, "CARD_CLOUD_AUTHORIZATION_REFUSED");
    assert.equal(authCalls(measured[kind]).length, 1);
  });
}
test("direct source validator rejects a different EngineInput owner", () => {
  assert.equal(measured.direct_wrong_owner, "FACT_OWNER_MISMATCH");
});
