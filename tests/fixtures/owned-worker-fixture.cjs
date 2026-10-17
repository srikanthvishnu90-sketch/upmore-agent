"use strict";
// MOCK browser, real local files/checkpoints. No browser/provider/network.
const fs = require("node:fs");
const path = require("node:path");
const { createFileTaskStore, hash } = require("../../workers/career-browser/store.cjs");
const { createWorker } = require("../../workers/career-browser/service.cjs");
const { mockAuthority, bindMockTaskClient } = require("./owned-worker-authority.cjs");
function fixture(root, options = {}) {
  fs.mkdirSync(root, { recursive: true });
  const resumePath = path.join(root, "resume.txt");
  if (!fs.existsSync(resumePath)) fs.writeFileSync(resumePath, "SYNTHETIC TEST RESUME\nEvidence: built a Python service.\n");
  const resumeSha256 = hash(fs.readFileSync(resumePath));
  const profile = { name: "Synthetic Test", email: "synthetic@example.test", resume: { filename: "resume.txt", sha256: resumeSha256 } };
  const clock = options.clock || { value: Date.parse("2026-10-15T12:00:00Z") };
  const posting = { canonicalKey: "local:test-role", company: "TEST ONLY", role: "Test role", status: "open", url: "http://localhost:8123/form" };
  const store = createFileTaskStore(path.join(root, "tasks"));
  const receiptPath = (id) => path.join(root, "receipt-" + id + ".json");
  const counterPath = path.join(root, "counter.json");
  const count = () => fs.existsSync(counterPath) ? JSON.parse(fs.readFileSync(counterPath)) : { opens: 0, clicks: 0 };
  const bump = (key) => { const c = count(); c[key]++; fs.writeFileSync(counterPath, JSON.stringify(c)); };
  const boardFactory = (opts) => {
    const values = {}; let armed = false;
    return {
      kind: "browser", browserDriver: true, sandbox: false, host: "localhost",
      open() { bump("opens"); if (options.openDelay) clock.value += options.openDelay; return { ok: true }; },
      form() { return { fields: [
        { field_id: "email", kind: "standard", profile_key: "email", required: true },
        { field_id: "resume", kind: "standard", profile_key: "resume", required: true },
      ] }; },
      fill(id, value) { values[id] = value; },
      answers() { return { ...values }; },
      atReview() { return { atFinalReview: true }; },
      armForSubmit(a) { if (!a.approvedByUser || !a.approvalRef) throw new Error("missing approval reference"); armed = true; },
      submit() {
        if (!armed) throw new Error("unarmed");
        bump("clicks");
        const proof = { source: "controlled_portal_readback", outcome: "accepted", taskId: opts.scope.taskId, userId: opts.scope.userId,
          destination: opts.scope.submitUrl, payloadSha256: opts.scope.payloadSha256, resumeSha256: opts.scope.resumeSha256, confirmationId: "TEST-RECEIPT-1",
          receivedPayloadSha256: hash({ ...values, resume_sha256: values.resume.sha256 }),
          receivedResumeSha256: hash(fs.readFileSync(opts.resumePath)), receivedFileBytes: fs.statSync(opts.resumePath).size };
        fs.writeFileSync(receiptPath(opts.scope.taskId), JSON.stringify(proof));
        if (options.crashProcess) process.exit(72); // real process death after destination write
        if (options.throwAfterClick) throw Object.assign(new Error("crashed after click"), { code: "CRASH_AFTER_CLICK" });
        return { outcome: "accepted", confirmationId: proof.confirmationId, finalUrl: opts.scope.submitUrl };
      },
      submissionState() { return { submitted: false, unverifiable: true }; }, close() {},
    };
  };
  const readReceipt = (task) => {
    if (options.noReadback || !fs.existsSync(receiptPath(task.id))) return null;
    const proof = JSON.parse(fs.readFileSync(receiptPath(task.id), "utf8"));
    if (options.wrongProof) proof.userId = "other-user";
    if (options.proofPatch) Object.assign(proof, options.proofPatch); // explicitly MOCK corrupt/negative destination records
    return proof;
  };
  const authority = options.authority || mockAuthority(root);
  const rawWorker = createWorker({ store, authority, evidenceRoot:options.evidenceRoot,evidenceRequired:options.evidenceRequired,retentionClock:options.retentionClock,retentionSchedule:options.retentionSchedule,privateRetentionMs:options.privateRetentionMs,resolveEquipment: options.resolveEquipment || (() => ({ userId: options.userId || "user-a", profile, resumePath, attestations: options.attestations || {},
    accountVersion: authority.current(options.userId||"user-a").version, privacyEpoch: authority.current(options.userId||"user-a").epoch })),
    controlledPortals: [{ url: posting.url, submitUrl: "http://localhost:8123/submit" }],
    boardFactory: options.boardFactory || boardFactory, readReceipt, now: () => clock.value,
    maxActions: options.maxActions ?? 120, timeoutMs: options.timeoutMs ?? 30000 });
  const worker = options.authority ? rawWorker : bindMockTaskClient(rawWorker,authority);
  const input = { eventId: "event-1", posting, artifactId: "owned-resume-1", resumeSha256 };
  const approval = (task, ref = "approval-1") => ({ approvedByUser: true, approvalRef: ref,
    payloadSha256: task.review.payloadSha256, resumeSha256: task.review.resumeSha256, destination: task.review.destination });
  return { worker, store, authority, input, profile, resumePath, clock, count, approval, receiptPath };
}
module.exports = { fixture };
