"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const { createFileTaskStore, hash } = require("../workers/career-browser/store.cjs");
const { createWorker } = require("../workers/career-browser/service.cjs");
const Browser = require("../packages/domain/150-career-portal-browser.js");
let blocked, portal, base, root;
const report={status:"NOT_RUN",verification_level:"CONTROLLED_LOCAL_BROWSER_NOT_EMPLOYER",authority:"MOCK fixture only",codeSha:process.env.UPMORE_CODE_SHA||null,screenshots:[],receipt:null};
before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "owned-browser-real-"));
  let pw;
  try { pw = require(process.env.UPMORE_PLAYWRIGHT_PATH || "playwright"); }
  catch (_) { blocked = "PLAYWRIGHT_UNRESOLVABLE: configure an installed Playwright module; no download attempted"; return; }
  try {
    const browser = await pw.chromium.launch({ headless: true, chromiumSandbox: true,
      ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}), timeout: 15000 });
    report.runtimeVersion=browser.version();
    await browser.close();
  } catch (e) {
    blocked = "BROWSER_SANDBOX_UNAVAILABLE: " + (/SUID sandbox helper/.test(e.message) ? "installed chrome-sandbox is not root-owned/configured; user namespaces also unavailable in this executor" : String(e.message).split("\n")[0]);
    return;
  }
  portal = fork(path.join(__dirname, "fixtures/owned-portal.cjs"), [path.join(root, "receipts")], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const port = await new Promise((resolve, reject) => { portal.once("message", (m) => resolve(m.port)); portal.once("error", reject); });
  base = "http://localhost:" + port;
});
after(() => { Browser.shutdownAll(); portal?.kill();
  if(process.env.UPMORE_CONTROLLED_REPORT) { report.blocker=blocked||null;fs.writeFileSync(process.env.UPMORE_CONTROLLED_REPORT,JSON.stringify(report,null,2)+"\n",{mode:0o600}); }
  if (root) fs.rmSync(root, { recursive: true, force: true }); });

test("owned Chromium: conditional multi-page form, actual uploaded file hash, explicit approval and causal local receipt", (t) => {
  if (blocked) { t.skip(blocked); return; }
  const resumePath = path.join(root, "resume.txt");
  fs.writeFileSync(resumePath, "SYNTHETIC RESUME\nPython service project, evidence TEST-F1.\n");
  const resumeSha256 = hash(fs.readFileSync(resumePath));
  const profile = { name: "Synthetic Test", email: "synthetic@example.test", resume: { filename: "resume.txt", sha256: resumeSha256 },
    answers: { sponsorship: { confirmed: true, value: "Yes" }, work_authorization: { confirmed: true, value: "Yes" } } };
  const { mockAuthority, bindMockTaskClient } = require("./fixtures/owned-worker-authority.cjs");
  const authority = mockAuthority(root);
  const worker = bindMockTaskClient(createWorker({ authority, evidenceRoot:process.env.UPMORE_CONTROLLED_EVIDENCE_DIR, evidenceRequired:!!process.env.UPMORE_CONTROLLED_EVIDENCE_DIR, store: createFileTaskStore(path.join(root, "tasks")),
    controlledPortals: [{ url: base + "/form", submitUrl: base + "/submit" }],
    resolveEquipment: () => ({ userId: "test-user", profile, resumePath, accountVersion: authority.current("test-user").version, privacyEpoch: authority.current("test-user").epoch, attestations: { certify: { explicit: true, value: true } } }),
    readReceipt: (task) => { const p = path.join(root, "receipts", task.id + ".json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : null; } }), authority);
  const input={eventId:"test-event",posting:{canonicalKey:"local-form",url:base+"/form",status:"open"},artifactId:"test-artifact",resumeSha256};
  const queued = worker.receive("test-user",input);
  const prepared = worker.prepare("test-user", queued.id);
  Object.assign(report,{status:"CONTROLLED_FORM_BLOCKED",inputs:{userId:"test-user",task:input,resumeArtifact:{sha256:resumeSha256,bytes:fs.statSync(resumePath).size,fixtureContent:fs.readFileSync(resumePath,"utf8")},profile},outputs:{queued,prepared}});
  assert.equal(prepared.status, "review_ready", JSON.stringify(prepared));
  assert.equal(prepared.review.payload.work_authorization, "Yes");
  assert.equal(prepared.review.payload.resume.sha256, resumeSha256);
  assert.equal(prepared.review.observation.untrusted, true);
  assert.ok(prepared.review.observation.instructions.length);
  const approval = { approvedByUser: true, approvalRef: "local-user-approval", payloadSha256: prepared.review.payloadSha256, resumeSha256, destination: base + "/submit" };
  const done = worker.approve("test-user", queued.id, approval);
  Object.assign(report,{inputs:{...report.inputs,approval},outputs:{queued,prepared,done},receipt:done.result?.receipt||null,screenshots:Object.values(done.evidence||{}).filter(e=>e.status==="CAPTURED")});
  assert.equal(done.status, "completed", JSON.stringify(done));
  assert.equal(done.result.receipt.receivedFileBytes, fs.statSync(resumePath).size);
  assert.equal(worker.approve("test-user", queued.id, approval).status, "completed");
  assert.equal(fs.readdirSync(path.join(root, "receipts")).length, 1);
  if(process.env.UPMORE_CONTROLLED_EVIDENCE_DIR)for(const stage of ["form-read","filled-review","confirmed-receipt"])assert.equal(done.evidence[stage].status,"CAPTURED",JSON.stringify(done.evidence));
  Object.assign(report,{status:"CONTROLLED_FORM_COMPLETED",traceKind:"synthetic controlled inputs through actual worker/browser, not a genuine applicant conversation"});
});
