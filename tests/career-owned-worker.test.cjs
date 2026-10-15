"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { fixture } = require("./fixtures/owned-worker-fixture.cjs");
const { createHttpHandler } = require("../workers/career-browser/http.cjs");
const { createWorker } = require("../workers/career-browser/service.cjs");
const Portal = require("../packages/domain/149-career-portal-apply.js");
const { validateAction, assertObservation } = require("../workers/career-browser/protocol.cjs");
const { start: startPortal } = require("./fixtures/owned-portal.cjs");
const { hash } = require("../workers/career-browser/store.cjs");

function setup(t, opts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "owned-worker-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, ...fixture(root, opts) };
}
function review(f) { const task = f.worker.receive("user-a", f.input); return f.worker.prepare("user-a", task.id); }

test("Receive deduplicates duplicate webhooks and the same seat across different event IDs", (t) => {
  const f = setup(t);
  const first = f.worker.receive("user-a", f.input);
  const again = f.worker.receive("user-a", { ...f.input, eventId: "event-2" });
  assert.deepEqual(again, first);
  assert.equal(f.store.list().length, 1);
  assert.equal(f.count().opens, 0, "receive never invents browser execution");
  assert.throws(() => f.worker.receive("user-a", { ...f.input, resumeSha256: "b".repeat(64) }), { code: "TASK_SPEC_CONFLICT" });
  assert.throws(() => f.worker.receive("user-a", { ...f.input, posting: { ...f.input.posting, canonicalKey: "a-different-client-key" } }), { code: "TASK_SPEC_CONFLICT" });
});

test("Equip checks actual file bytes and artifact owner before a browser opens", (t) => {
  const f = setup(t);
  const task = f.worker.receive("user-a", f.input);
  fs.appendFileSync(f.resumePath, "altered");
  assert.equal(f.worker.prepare("user-a", task.id).blocker, "RESUME_SHA_MISMATCH");
  assert.equal(f.count().opens, 0);
  const other = f.worker.receive("user-b", f.input);
  assert.equal(f.worker.prepare("user-b", other.id).blocker, "EQUIPMENT_OWNER_MISMATCH");
});

test("Execute/Check checkpoints persist and each action reserves then settles its budget", (t) => {
  const f = setup(t);
  const task = review(f);
  assert.equal(task.status, "review_ready");
  assert.equal(task.review.resumeSha256, f.input.resumeSha256);
  assert.equal(task.review.destination, "http://localhost:8123/submit");
  assert.ok(task.review.bindings.some((b) => b.fieldId === "email" && b.profileKey === "email" && b.profileHash === task.review.profileHash));
  assert.equal(task.budget.reservedActions, 0);
  assert.ok(task.budget.spentActions > 0);
  assert.equal(task.budget.spendCents, 0);
  const saved = f.store.get(task.id);
  assert.ok(saved.checkpoints.some((c) => c.actionState === "reserved"));
  assert.ok(saved.checkpoints.some((c) => c.actionState === "settled"));
  assert.ok(saved.checkpoints.some((c) => c.observationSha256));
  assert.equal(fixture(f.root).worker.get("user-a", task.id).review.payloadSha256, task.review.payloadSha256);
});

test("action schema and observation references reject unknown tools, stale nodes, disabled fields and wrong origin/frame", () => {
  const observation = { version: "v1", frame: "main", origin: "http://localhost:8123", fields: [{ ref: "f1", disabled: false }] };
  const command = { type: "fill", boardId: "board-1", observationVersion: "v1", binding: { field_id: "email", elementRefs: ["f1"] }, value: "synthetic@example.test" };
  assert.equal(validateAction(command), command);
  assert.throws(() => validateAction({ ...command, type: "evaluate_arbitrary_code" }), { code: "ACTION_SCHEMA_INVALID" });
  assert.throws(() => validateAction({ ...command, observationVersion: undefined }), { code: "OBSERVATION_REQUIRED" });
  assert.throws(() => assertObservation({ ...command, observationVersion: "old" }, observation, null, observation.origin), { code: "STALE_OBSERVATION" });
  assert.throws(() => assertObservation(command, { ...observation, frame: "child" }, null, observation.origin), { code: "OBSERVATION_SCOPE_MISMATCH" });
  assert.throws(() => assertObservation(command, observation, null, "https://other.example.test"), { code: "OBSERVATION_SCOPE_MISMATCH" });
  assert.throws(() => assertObservation(command, { ...observation, fields: [{ ref: "f1", disabled: true }] }, null, observation.origin), { code: "ELEMENT_NOT_ACTIONABLE" });
  assert.throws(() => assertObservation({ ...command, binding: { elementRefs: ["invented"] } }, observation, null, observation.origin), { code: "ELEMENT_REFERENCE_INVALID" });
});

test("wrong-user read, prepare, approval and reconciliation are refused without browser actions", (t) => {
  const f = setup(t), task = review(f), before = f.count();
  for (const act of [() => f.worker.get("other", task.id), () => f.worker.prepare("other", task.id),
    () => f.worker.approve("other", task.id, f.approval(task)), () => f.worker.reconcile("other", task.id)]) {
    assert.throws(act, { code: "TASK_NOT_FOUND" });
  }
  assert.deepEqual(f.count(), before);
});

test("explicit approval binds exact review, resume bytes, destination and expiration", (t) => {
  const f = setup(t), task = review(f);
  assert.throws(() => f.worker.approve("user-a", task.id, {}), { code: "APPROVAL_REQUIRED" });
  for (const key of ["payloadSha256", "resumeSha256", "destination"]) {
    assert.throws(() => f.worker.approve("user-a", task.id, { ...f.approval(task), [key]: "wrong" }), { code: "APPROVAL_BINDING_MISMATCH" });
  }
  f.clock.value += 600001;
  assert.throws(() => f.worker.approve("user-a", task.id, f.approval(task)), { code: "APPROVAL_EXPIRED" });
  assert.equal(f.count().clicks, 0);
});

test("duplicate approval after restart returns the checked receipt with exactly one click", (t) => {
  const f = setup(t), task = review(f), a = f.approval(task);
  const done = f.worker.approve("user-a", task.id, a);
  assert.equal(done.status, "completed");
  assert.equal(done.result.approvalRef, a.approvalRef);
  assert.equal(done.result.receipt.source, "controlled_portal_readback");
  assert.deepEqual(fixture(f.root).worker.approve("user-a", task.id, a), done);
  assert.equal(f.count().clicks, 1);
});

test("changed confirmed profile after review creates a new review and spends no approval", (t) => {
  const f = setup(t), task = review(f);
  f.profile.email = "changed@example.test";
  const changed = f.worker.approve("user-a", task.id, f.approval(task));
  assert.equal(changed.blocker, "REVIEW_CHANGED_REAPPROVAL_REQUIRED");
  assert.notEqual(changed.review.payloadSha256, task.review.payloadSha256);
  assert.equal(f.count().clicks, 0);
  assert.deepEqual(f.store.get(task.id).approvals, []);
});

test("timeouts and exhausted budgets stop before submission and settle attempted actions", (t) => {
  for (const opts of [{ openDelay: 60, timeoutMs: 50 }, { maxActions: 1 }]) {
    const f = setup(t, opts), task = review(f);
    assert.equal(task.status, "blocked");
    assert.ok(["TASK_TIMEOUT", "ACTION_BUDGET_EXHAUSTED"].includes(task.blocker));
    assert.equal(task.budget.reservedActions, 0);
    assert.equal(f.count().clicks, 0);
  }
});

test("a captured success without destination proof remains unknown and never retries", (t) => {
  const f = setup(t, { noReadback: true }), task = review(f);
  const uncertain = f.worker.approve("user-a", task.id, f.approval(task));
  assert.equal(uncertain.status, "unknown_outcome");
  assert.equal(uncertain.result.receipt, null);
  assert.throws(() => f.worker.approve("user-a", task.id, f.approval(task, "approval-2")), { code: "RECONCILE_REQUIRED" });
  assert.equal(f.worker.reconcile("user-a", task.id).status, "unknown_outcome");
  assert.equal(f.count().clicks, 1);
});

test("real worker-process death after the click recovers the lease and reconciles without a second click", (t) => {
  const f = setup(t), task = review(f);
  const child = spawnSync(process.execPath, ["-e", `
    const {fixture}=require(process.argv[1]);
    const f=fixture(process.argv[2],{crashProcess:true});
    const task=f.worker.get('user-a',process.argv[3]);
    f.worker.approve('user-a',task.id,f.approval(task));
  `, path.join(__dirname, "fixtures/owned-worker-fixture.cjs"), f.root, task.id], { encoding: "utf8" });
  assert.equal(child.status, 72, child.stderr);
  const restarted = fixture(f.root);
  assert.equal(restarted.worker.get("user-a", task.id).status, "unknown_outcome");
  const reconciled = restarted.worker.reconcile("user-a", task.id);
  assert.equal(reconciled.status, "completed");
  assert.equal(reconciled.budget.reservedActions, 0, "crashed action reservations are charged and settled on recovery");
  assert.equal(f.count().clicks, 1);
  assert.equal(restarted.worker.approve("user-a", task.id, f.approval(task)).status, "completed");
});

test("wrong-user destination proof cannot turn an uncertain write into a receipt", (t) => {
  const f = setup(t, { wrongProof: true }), task = review(f);
  assert.equal(f.worker.approve("user-a", task.id, f.approval(task)).status, "unknown_outcome");
  assert.equal(f.worker.reconcile("user-a", task.id).status, "unknown_outcome");
});

test("HTTP task endpoint authenticates existing identity, rejects service role and body impersonation", async (t) => {
  const f = setup(t);
  assert.throws(() => createHttpHandler({ worker: f.worker }), { code: "AUTH_VERIFIER_REQUIRED" });
  const handle = createHttpHandler({ worker: f.worker, authenticate: async (token) => token === "Bearer user-a" ? { id: "user-a" } : token === "Bearer service" ? { id: "user-a", serviceRole: true } : null });
  const request = (token, body) => new Request("http://localhost/tasks", { method: "POST", headers: { Authorization: token }, body: JSON.stringify(body) });
  assert.equal((await handle(request("Bearer missing", f.input))).status, 401);
  assert.equal((await handle(request("Bearer service", f.input))).status, 401);
  assert.equal((await handle(request("Bearer user-a", { ...f.input, userId: "other" }))).status, 403);
  assert.equal((await handle(request("Bearer user-a", f.input))).status, 202);
});

test("worker refuses employer destinations even if the older driver recognizes their ATS", (t) => {
  const f = setup(t);
  assert.throws(() => f.worker.receive("user-a", { ...f.input, posting: { ...f.input.posting, url: "https://boards.greenhouse.io/employer/jobs/1" } }), { code: "DESTINATION_NOT_REGISTERED" });
  assert.throws(() => createWorker({ store: f.store, resolveEquipment() {}, controlledPortals: [{ url: "https://boards.greenhouse.io/employer/jobs/1", submitUrl: "https://boards.greenhouse.io/employer/submit" }] }), { code: "CONTROLLED_LOCAL_PORTAL_REQUIRED" });
});

test("149 repeatedly observes conditional fields and page transitions before final review", () => {
  let page = 1, seenConditional = false;
  const values = {};
  const board = {
    kind: "browser", browserDriver: true, sandbox: false,
    open() { return {}; },
    form() {
      const fields = page === 1 ? [{ field_id: "sponsorship", kind: "screening", question_key: "sponsorship", required: true }] : [{ field_id: "email", kind: "standard", profile_key: "email", required: true }];
      if (page === 1 && values.sponsorship === "Yes") {
        fields.push({ field_id: "work_authorization", kind: "screening", question_key: "work_authorization", required: true });
        seenConditional = true;
      }
      return { fields };
    },
    fill(id, value) { values[id] = value; }, answers() { return { ...values }; },
    atReview() {
      if (!seenConditional) return { needsFields: true };
      if (page === 1) { page = 2; return { advanced: true }; }
      return { atFinalReview: true };
    },
  };
  const session = Portal.createPortalSession({ userId: "test", board });
  const out = Portal.runApply(session, { posting: { url: "http://localhost/form", canonicalKey: "test" },
    profile: { email: "synthetic@example.test", answers: { sponsorship: { confirmed: true, value: "Yes" }, work_authorization: { confirmed: true, value: "Yes" } } } });
  assert.equal(out.resultStatus, "prepared");
  assert.deepEqual(out.doorstep.payload, { sponsorship: "Yes", work_authorization: "Yes", email: "synthetic@example.test" });
  assert.equal(out.stepLog.filter((s) => s.action === "open").length, 1, "only the first round navigates");
  assert.equal(out.stepLog.filter((s) => s.action === "resume_form").length, 2);
});

test("149 stops at newly revealed unknown required fields and refuses unobserved or altered answers", () => {
  for (const mode of ["conditional", "altered", "no_final_review"]) {
    let revealed = false; const values = {};
    const board = {
      kind: "browser", browserDriver: true, sandbox: false,
      open() { return {}; },
      form() { return { fields: [{ field_id: "email", kind: "standard", profile_key: "email", required: true }, ...(revealed ? [{ field_id: "custom", kind: "unknown", required: true }] : [])] }; },
      fill(id, value) { values[id] = mode === "altered" ? "wrong@example.test" : value; }, answers() { return values; },
      atReview() { if (mode === "conditional") { revealed = true; return { needsFields: true }; } return { atFinalReview: false }; },
    };
    const out = Portal.runApply(Portal.createPortalSession({ userId: "test", board }), { posting: { url: "http://localhost/form" }, profile: { email: "synthetic@example.test" } });
    assert.notEqual(out.resultStatus, "prepared");
    assert.equal(out.code || out.asks[0].reason, { conditional: "unknown_field_category", altered: "ANSWER_OBSERVATION_MISMATCH", no_final_review: "FINAL_REVIEW_NOT_OBSERVED" }[mode]);
  }
});

test("controlled local portal reads real multipart file bytes, checks the approved hash and refuses duplicate receipts", async (t) => {
  const f = setup(t), receipts = path.join(f.root, "http-receipts");
  const server = startPortal(receipts);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const taskId = "a".repeat(32), bytes = Buffer.concat([fs.readFileSync(f.resumePath), Buffer.from([0, 255, 128])]);
  const resumeSha256 = hash(bytes);
  const payload = { full_name: "Synthetic Test", email: "synthetic@example.test", resume: { filename: "resume.txt", sha256: resumeSha256 }, sponsorship: "Yes", work_authorization: "Yes", certify: true, resume_sha256: resumeSha256 };
  const body = new FormData();
  for (const [key, value] of Object.entries({ full_name: payload.full_name, email: payload.email, sponsorship: "Yes", work_authorization: "Yes", certify: "on" })) body.append(key, value);
  body.append("resume", new Blob([bytes]), "resume.txt");
  const url = "http://127.0.0.1:" + server.address().port + "/submit";
  const headers = { "x-upmore-task": taskId, "x-upmore-user": "user-a", "x-upmore-review": hash(payload), "x-upmore-resume": resumeSha256 };
  assert.equal((await fetch(url, { method: "POST", headers, body })).status, 200);
  const receipt = JSON.parse(fs.readFileSync(path.join(receipts, taskId + ".json")));
  assert.equal(receipt.receivedFileBytes, bytes.length);
  assert.equal(receipt.resumeSha256, resumeSha256);
  assert.equal((await fetch(url, { method: "POST", headers, body })).status, 409);
  assert.equal(fs.readdirSync(receipts).length, 1);
});
