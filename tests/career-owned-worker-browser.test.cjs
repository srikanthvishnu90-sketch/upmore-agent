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
before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "owned-browser-real-"));
  let pw;
  try { pw = require(process.env.UPMORE_PLAYWRIGHT_PATH || "playwright"); }
  catch (_) { blocked = "PLAYWRIGHT_UNRESOLVABLE: configure an installed Playwright module; no download attempted"; return; }
  try {
    const browser = await pw.chromium.launch({ headless: true, chromiumSandbox: true,
      ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}), timeout: 15000 });
    await browser.close();
  } catch (e) {
    blocked = "BROWSER_SANDBOX_UNAVAILABLE: " + (/SUID sandbox helper/.test(e.message) ? "installed chrome-sandbox is not root-owned/configured; user namespaces also unavailable in this executor" : String(e.message).split("\n")[0]);
    return;
  }
  portal = fork(path.join(__dirname, "fixtures/owned-portal.cjs"), [path.join(root, "receipts")], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const port = await new Promise((resolve, reject) => { portal.once("message", (m) => resolve(m.port)); portal.once("error", reject); });
  base = "http://localhost:" + port;
});
after(() => { Browser.shutdownAll(); portal?.kill(); if (root) fs.rmSync(root, { recursive: true, force: true }); });

test("owned Chromium: conditional multi-page form, actual uploaded file hash, explicit approval and causal local receipt", (t) => {
  if (blocked) { t.skip(blocked); return; }
  const resumePath = path.join(root, "resume.txt");
  fs.writeFileSync(resumePath, "SYNTHETIC RESUME\nPython service project, evidence TEST-F1.\n");
  const resumeSha256 = hash(fs.readFileSync(resumePath));
  const profile = { name: "Synthetic Test", email: "synthetic@example.test", resume: { filename: "resume.txt", sha256: resumeSha256 },
    answers: { sponsorship: { confirmed: true, value: "Yes" }, work_authorization: { confirmed: true, value: "Yes" } } };
  const worker = createWorker({ store: createFileTaskStore(path.join(root, "tasks")),
    controlledPortals: [{ url: base + "/form", submitUrl: base + "/submit" }],
    resolveEquipment: () => ({ userId: "test-user", profile, resumePath, attestations: { certify: { explicit: true, value: true } } }),
    readReceipt: (task) => { const p = path.join(root, "receipts", task.id + ".json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : null; } });
  const queued = worker.receive("test-user", { eventId: "test-event", posting: { canonicalKey: "local-form", url: base + "/form", status: "open" }, artifactId: "test-artifact", resumeSha256 });
  const prepared = worker.prepare("test-user", queued.id);
  assert.equal(prepared.status, "review_ready", JSON.stringify(prepared));
  assert.equal(prepared.review.payload.work_authorization, "Yes");
  assert.equal(prepared.review.payload.resume.sha256, resumeSha256);
  assert.equal(prepared.review.observation.untrusted, true);
  assert.ok(prepared.review.observation.instructions.length);
  const approval = { approvedByUser: true, approvalRef: "local-user-approval", payloadSha256: prepared.review.payloadSha256, resumeSha256, destination: base + "/submit" };
  const done = worker.approve("test-user", queued.id, approval);
  assert.equal(done.status, "completed", JSON.stringify(done));
  assert.equal(done.result.receipt.receivedFileBytes, fs.statSync(resumePath).size);
  assert.equal(worker.approve("test-user", queued.id, approval).status, "completed");
  assert.equal(fs.readdirSync(path.join(root, "receipts")).length, 1);
});
