// WO-094 — loop input: the apply worker's application is built from the
// person's CONFIRMED facts, the approval card is the attestation act, and
// the stored resume file resolves by its sha256 (or stops, named).
//
// The defect (A3, verified on trunk 5f7efe45): production-sources built the
// worker profile from the stored master's basics + `master.answers` verbatim;
// module 149's deriveAnswers had no caller on the executor path and no
// product code writes answers or attestations, so every prepare stopped at
// UNCOVERED_QUESTION on full_name/email/phone/resume/work_authorization/
// sponsorship/cover_note/certify_true — zero doorsteps, no card. The board
// service's resolveResumePath defaulted to () => null, so every resume
// upload stopped too.
//
// Synthetic TEST persona only (Alex Testcase); no network, no live store.
// Check: node --test tests/career-loop-input.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const { createBatchExecutor } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));
const { createProductionSources } = require(path.join(root, "workers/career-browser/production-sources.cjs"));
const { createBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));

const NOW = "2026-10-20T15:00:00Z";
const USER = "user-alex-testcase";
const clone = (v) => JSON.parse(JSON.stringify(v));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const RESUME_BYTES = Buffer.from("%PDF-1.4\n% SYNTHETIC TEST RESUME — Alex Testcase (TEST)\n");
const RESUME_SHA = sha(RESUME_BYTES);
const CERTIFY = "I certify the above is true";

// The person's stored 122 master: confirmed basics + confirmed facts for
// every ask the Greenhouse-shaped form makes. Nothing in `answers`, nothing
// in `attestations` except a STANDING attestation the worker must ignore.
function confirmedMaster(over) {
  const m = {
    basics: { name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 000 555 0100", location: "Chicago, IL" },
    resume: { filename: "alex-testcase-resume.pdf", sha256: RESUME_SHA },
    facts: [
      { id: "F-T-020", kind: "eligibility", status: "confirmed", name: "Work authorization (US)", value: "Yes" },
      { id: "F-T-021", kind: "eligibility", status: "confirmed", name: "Sponsorship requirement", value: "No" },
      { id: "F-T-022", kind: "profile", status: "confirmed", name: "Country", value: "United States" },
      { id: "F-T-030", kind: "skill", status: "confirmed", name: "JavaScript", value: "JavaScript" },
    ],
    attestations: { certify_true: { value: true, explicit: true } }, // standing — must never ride
  };
  return Object.assign(m, over || {});
}

function postingN(n) {
  return {
    job_id: `gh-test-${n}`, canonicalKey: `greenhouse:testco${n}:100${n}`,
    company: `Testco ${n} (TEST)`, title: "Software Engineer (TEST)",
    url: `https://boards.greenhouse.io/testco${n}/jobs/100${n}`, status: "open",
    jd_text: "Software engineer. JavaScript, testing, code review.",
  };
}

// The Greenhouse fixture form: 149's Greenhouse-shaped sandbox board with the
// fixture's required flags (phone + cover note required, as the stopping
// form had them), and an optional override of the certification label.
function greenhouseBoard(opts) {
  const o = opts || {};
  const b = Portal.createSandboxBoard({ captchaAt: o.captchaAt || null });
  const baseForm = b.form.bind(b);
  b.form = () => {
    const f = baseForm();
    for (const x of f.fields) {
      if (x.field_id === "phone" || (x.field_id === "cover_note" && o.coverRequired)) x.required = true;
      if (x.field_id === "certify_true" && o.certifyLabel) x.label = o.certifyLabel;
    }
    return f;
  };
  return b;
}

function memStore() {
  const runs = new Map(), ledgers = new Map(), finished = [], queue = [];
  return {
    runs, finished, queue,
    async pending() { return queue.splice(0); },
    async claim() { return { claimed: true }; },
    async finish(x) { finished.push(clone(x)); },
    async saveRun(rec) { runs.set(rec.runId, clone(rec)); },
    async readRun({ runId }) { return runs.has(runId) ? clone(runs.get(runId)) : null; },
    async ledgerFor(u) { return { records: clone(ledgers.get(u) || []) }; },
    async saveLedger(u, r) { ledgers.set(u, clone(r || [])); },
  };
}

function rig(master, boardOpts, extra) {
  const store = memStore();
  const transport = {
    async readRows(spec) {
      if (spec.table === "agent_flow_state") return [{ state: { career: { stores: { profile: clone(master) } } }, updated_at: NOW }];
      return [];
    },
  };
  const sources = createProductionSources({ transport, now: () => Date.parse(NOW) });
  const boards = {};
  const boardForCalls = [];
  const postings = (extra && extra.postings) || [postingN(1)];
  const executor = createBatchExecutor({
    store,
    postingsFor: async () => clone(postings),
    profileFor: sources.profileFor,
    boardForFor: (userId, opts) => {
      boardForCalls.push({ userId, opts: clone(opts || {}) });
      return (posting) => {
        const per = (boardOpts && boardOpts[posting.canonicalKey]) || boardOpts || {};
        boards[posting.canonicalKey] = greenhouseBoard(per);
        return boards[posting.canonicalKey];
      };
    },
    now: () => Date.parse(NOW),
  });
  const run = Batch.createRun({ userId: USER, familyText: "software engineering", count: postings.length, now: Date.parse(NOW) });
  return { store, sources, executor, boards, boardForCalls, run, postings };
}

async function prepare(r) {
  r.store.queue.push({ userId: USER, intentId: `prep-${r.run.id}`, binding: { action: "prepare", run_id: r.run.id, family_text: r.run.familyText }, request: { run: clone(r.run) } });
  const out = await r.executor.runBatchPending();
  return { out, record: r.store.runs.get(r.run.id) };
}
async function approve(r, cardSha256) {
  r.store.queue.push({ userId: USER, intentId: `appr-${r.run.id}`, binding: { action: "approve", run_id: r.run.id, card_sha256: cardSha256 } });
  const out = await r.executor.runBatchPending();
  return { out, record: r.store.runs.get(r.run.id) };
}

// ---------------------------------------------------------------- derivation

test("sources: the worker profile is DERIVED from confirmed facts — identity from basics, screening answers traced to fact ids, no standing attestation", async () => {
  const r = rig(confirmedMaster({ answers: { cover_note: { value: "Stored standing note", confirmed: true, draft: true } } }));
  const pack = await r.sources.profileFor(USER);
  assert.equal(pack.profile.name, "Alex Testcase");
  assert.equal(pack.profile.email, "alex.testcase@example.test");
  assert.equal(pack.profile.phone, "+1 000 555 0100");
  assert.deepEqual(pack.profile.resume, { filename: "alex-testcase-resume.pdf", sha256: RESUME_SHA });
  assert.equal(pack.profile.answers.work_authorization.value, "Yes");
  assert.equal(pack.profile.answers.work_authorization.factId, "F-T-020", "the answer traces to its confirmed fact");
  assert.equal(pack.profile.answers.sponsorship.value, "No");
  assert.equal(pack.profile.answers.sponsorship.factId, "F-T-021");
  assert.equal(pack.profile.answers.cover_note, undefined, "a stored note is not a drafted note on this application's payload");
  assert.deepEqual(pack.attestations, {}, "a stored standing attestation never rides — the card is the attestation act");
});

test("prepare: a confirmed master reaches a DOORSTEP on the Greenhouse form — no UNCOVERED_QUESTION", async () => {
  const r = rig(confirmedMaster());
  const { record } = await prepare(r);
  assert.ok(record, "the prepared run is stored");
  const app = record.run.apps[postingN(1).canonicalKey];
  assert.notEqual(app.stop && app.stop.code, "UNCOVERED_QUESTION", `no uncovered question (asks: ${JSON.stringify(app.stop && app.stop.asks)})`);
  assert.equal(app.stage, "doorstep");
  assert.equal(record.run.status, "awaiting_approval");
  assert.ok(record.run.cardSha256, "a card exists to approve");
  const board = r.boards[postingN(1).canonicalKey];
  const a = board.answers();
  assert.equal(a.full_name, "Alex Testcase");
  assert.equal(a.email, "alex.testcase@example.test");
  assert.equal(a.phone, "+1 000 555 0100");
  assert.equal(a.resume.sha256, RESUME_SHA);
  assert.equal(a.work_authorization, "Yes");
  assert.equal(a.sponsorship, "No");
  assert.equal(a.cover_note, undefined, "no drafted note on the payload -> the optional note is left empty, never written");
});

test("prepare: with the work-authorization fact missing, EXACTLY that one required question is uncovered (asked once, never defaulted)", async () => {
  const m = confirmedMaster();
  m.facts = m.facts.filter((f) => f.id !== "F-T-020");
  const r = rig(m);
  const { record } = await prepare(r);
  const app = record.run.apps[postingN(1).canonicalKey];
  assert.equal(app.stage, "stopped");
  assert.equal(app.stop.code, "UNCOVERED_QUESTION");
  const required = new Set(greenhouseBoard().form().fields.filter((f) => f.required).map((f) => f.field_id));
  const uncoveredRequired = app.stop.asks.filter((x) => required.has(x.field_id)).map((x) => x.field_id);
  assert.deepEqual(uncoveredRequired, ["work_authorization"]);
  assert.equal(r.boards[postingN(1).canonicalKey].answers().work_authorization, undefined, "nothing was filled in its place");
});

test("prepare: an UNCONFIRMED (draft) work-authorization fact is not a fact — the question stays uncovered", async () => {
  const m = confirmedMaster();
  const wa = m.facts.find((f) => f.id === "F-T-020");
  wa.status = "draft"; wa.needs_confirmation = true;
  const r = rig(m);
  const { record } = await prepare(r);
  const app = record.run.apps[postingN(1).canonicalKey];
  assert.equal(app.stop && app.stop.code, "UNCOVERED_QUESTION");
  assert.ok(app.stop.asks.some((x) => x.field_id === "work_authorization"));
  assert.ok(!app.stop.asks.some((x) => x.field_id === "sponsorship"), "the confirmed sponsorship fact still answers");
});

test("cover note: filled only from a drafted note on this application's payload — shown on the card, inside the hash", () => {
  const prof = { name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 000 555 0100", resume: { filename: "r.pdf", sha256: RESUME_SHA },
    answers: { work_authorization: { value: "Yes", confirmed: true }, sponsorship: { value: "No", confirmed: true } } };
  const run = Batch.createRun({ userId: USER, familyText: "swe", count: 1, now: Date.parse(NOW) });
  const boards = {};
  Batch.prepareRun(run, { postings: [postingN(7)], profile: prof, log: { records: [] }, now: Date.parse(NOW),
    boardFor: (p) => (boards[p.canonicalKey] = greenhouseBoard({ coverRequired: true })),
    coverNoteFor: (p) => `Drafted note for ${p.company}.` });
  const app = run.apps[postingN(7).canonicalKey];
  assert.equal(app.stage, "doorstep");
  assert.equal(boards[postingN(7).canonicalKey].answers().cover_note, "Drafted note for Testco 7 (TEST).");
  const run2 = Batch.createRun({ userId: USER, familyText: "swe", count: 1, now: Date.parse(NOW) });
  Batch.prepareRun(run2, { postings: [postingN(8)], profile: prof, log: { records: [] }, now: Date.parse(NOW),
    boardFor: () => greenhouseBoard({ coverRequired: true }) });
  const app2 = run2.apps[postingN(8).canonicalKey];
  assert.equal(app2.stop && app2.stop.code, "UNCOVERED_QUESTION", "no drafted note -> a required note is uncovered, never invented");
  const required = new Set(greenhouseBoard({ coverRequired: true }).form().fields.filter((f) => f.required).map((f) => f.field_id));
  assert.deepEqual(app2.stop.asks.filter((x) => required.has(x.field_id)).map((x) => x.field_id), ["cover_note"]);
});

// ---------------------------------------------------------------- attestation

test("attestation: absent until the card is approved; the card shows the certification text; approving records it for that one application, bound to its payload hash", async () => {
  const p1 = postingN(1), p2 = postingN(2);
  const r = rig(confirmedMaster(), { [p1.canonicalKey]: {}, [p2.canonicalKey]: { captchaAt: "open" } }, { postings: [p1, p2] });
  const { record } = await prepare(r);
  const app1 = record.run.apps[p1.canonicalKey];
  assert.equal(app1.stage, "doorstep");
  assert.equal(record.run.apps[p2.canonicalKey].stage, "captcha_handoff");
  assert.equal(r.boards[p1.canonicalKey].answers().certify_true, undefined, "the certification is NOT ticked at prepare");
  assert.ok(!record.run.attestations || Object.keys(record.run.attestations).length === 0, "no attestation exists before the card's yes");
  const certs = record.run.card && record.run.card.certifications;
  assert.ok(Array.isArray(certs) && certs.length === 1, "the card carries the certification");
  assert.equal(certs[0].text, CERTIFY);
  assert.equal(certs[0].postingKey, p1.canonicalKey);
  assert.ok(Batch.speakSummary(record.run).join("\n").includes(CERTIFY), "the card's words show the certification text the yes signs");

  const { out, record: after } = await approve(r, record.run.cardSha256);
  assert.equal(out[0].status, "completed", JSON.stringify(out[0]));
  const att = after.run.attestations;
  assert.deepEqual(Object.keys(att), [p1.canonicalKey], "the attestation is recorded for that one application only");
  assert.equal(att[p1.canonicalKey].certify_true.explicit, true);
  assert.equal(att[p1.canonicalKey].certify_true.text, CERTIFY);
  assert.equal(att[p1.canonicalKey].certify_true.payloadSha256, app1.payloadSha256, "bound to the approved payload hash");
  assert.equal(after.run.apps[p1.canonicalKey].stage, "submitted");
  assert.equal(r.boards[p1.canonicalKey].answers().certify_true, true, "ticked only after the approval, on the approved application");
});

test("attestation: the payload hash covers the certification text — a changed text is a different payload", () => {
  const prof = { name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 000 555 0100", resume: { filename: "r.pdf", sha256: RESUME_SHA },
    answers: { work_authorization: { value: "Yes", confirmed: true }, sponsorship: { value: "No", confirmed: true } } };
  const hashFor = (label) => {
    const s = Portal.createPortalSession({ userId: USER, board: greenhouseBoard({ certifyLabel: label }) });
    const res = Portal.runApply(s, { posting: postingN(3), profile: prof, log: { records: [] }, userId: USER, now: NOW, cardApproval: true });
    assert.equal(res.resultStatus, "prepared", JSON.stringify(res.asks || res.code));
    return res.doorstep;
  };
  const a = hashFor(CERTIFY), b = hashFor("I certify the above is true and I accept the arbitration agreement");
  assert.notEqual(a.payloadSha256, b.payloadSha256);
  assert.equal(a.payload.certify_true, true, "the card's payload shows the value the yes will send");
  assert.deepEqual(a.attestations, [{ field_id: "certify_true", text: CERTIFY, value: true }]);
});

test("attestation: a doorstep with a pending certification never submits without the card's per-application attestation", () => {
  const prof = { name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 000 555 0100", resume: { filename: "r.pdf", sha256: RESUME_SHA },
    answers: { work_authorization: { value: "Yes", confirmed: true }, sponsorship: { value: "No", confirmed: true } } };
  const board = greenhouseBoard();
  const s = Portal.createPortalSession({ userId: USER, board });
  const res = Portal.runApply(s, { posting: postingN(4), profile: prof, log: { records: [] }, userId: USER, now: NOW, cardApproval: true });
  const h = res.doorstep.payloadSha256;
  const noAtt = Portal.submitDoorstep(s, { approvedByUser: true, payloadSha256: h, approvalRef: "batch:test" }, { log: { records: [] }, now: NOW });
  assert.equal(noAtt.code, "ATTESTATION_REQUIRED");
  const otherHash = Portal.submitDoorstep(s, { approvedByUser: true, payloadSha256: h, approvalRef: "batch:test",
    attestations: { certify_true: { explicit: true, value: true, text: CERTIFY, payloadSha256: "f".repeat(64) } } }, { log: { records: [] }, now: NOW });
  assert.equal(otherHash.code, "ATTESTATION_REQUIRED", "an attestation bound to another payload is not this one's");
  assert.equal(board.calls.submit, 0);
  assert.equal(board.answers().certify_true, undefined);
  const ok = Portal.submitDoorstep(s, { approvedByUser: true, payloadSha256: h, approvalRef: "batch:test",
    attestations: { certify_true: { explicit: true, value: true, text: CERTIFY, payloadSha256: h } } }, { log: { records: [] }, now: NOW });
  assert.equal(ok.resultStatus, "completed", JSON.stringify(ok));
  assert.deepEqual(ok.submission.attestations.map((x) => [x.field_id, x.text, x.payloadSha256]), [["certify_true", CERTIFY, h]]);
});

test("attestation: a certification text that changes between the card and the click stops the application — nothing submits", async () => {
  const p = postingN(5);
  const r = rig(confirmedMaster(), { [p.canonicalKey]: {} }, { postings: [p] });
  const { record } = await prepare(r);
  assert.equal(record.run.apps[p.canonicalKey].stage, "doorstep");
  // A fresh worker process: the session is rebuilt and re-prepared, and
  // the employer's form now carries a different certification text.
  Batch._runtime.delete(r.run.id);
  const changed = rig(confirmedMaster(), { [p.canonicalKey]: { certifyLabel: "I certify the above and waive all claims" } }, { postings: [p] });
  changed.store.runs.set(r.run.id, clone(record));
  changed.run = r.run;
  const { record: after } = await approve(changed, record.run.cardSha256);
  const app = after.run.apps[p.canonicalKey];
  assert.notEqual(app.stage, "submitted");
  assert.equal(app.stop && app.stop.code, "APPROVAL_PAYLOAD_MISMATCH");
  assert.equal(changed.boards[p.canonicalKey].calls.submit, 0);
});

// ---------------------------------------------------------------- resume file

test("resume: the executor hands the board provider the stored resume record's sha256", async () => {
  const r = rig(confirmedMaster());
  await prepare(r);
  assert.equal(r.boardForCalls[0].opts.resumeSha256, RESUME_SHA);
});

test("resume: the stored file resolves by its sha256; a missing or altered file is a NAMED stop, never null", () => {
  const { createStoredResumeResolver } = require(path.join(root, "workers/career-browser/resume-store.cjs"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wo094-resume-"));
  try {
    const resolve = createStoredResumeResolver({ resumeDir: dir });
    const named = (fn, code) => assert.throws(fn, (e) => e.code === code);
    named(() => resolve(USER, { resumeSha256: RESUME_SHA }), "RESUME_FILE_MISSING");
    named(() => resolve(USER, {}), "RESUME_RECORD_MISSING");
    fs.mkdirSync(path.join(dir, USER), { recursive: true });
    fs.writeFileSync(path.join(dir, USER, `${RESUME_SHA}.pdf`), RESUME_BYTES);
    assert.equal(resolve(USER, { resumeSha256: RESUME_SHA }), path.join(dir, USER, `${RESUME_SHA}.pdf`));
    fs.appendFileSync(path.join(dir, USER, `${RESUME_SHA}.pdf`), "altered");
    named(() => resolve(USER, { resumeSha256: RESUME_SHA }), "RESUME_SHA_MISMATCH");
    named(() => resolve("../other", { resumeSha256: RESUME_SHA }), "RESUME_RECORD_MISSING");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("resume: the board service refuses a session NAMED when the stored file is missing — no board, no null resume path", () => {
  const SECRET = "test-secret-wo094";
  const made = [];
  const base = { secret: SECRET, familyVerdicts: { greenhouse: "driveable" },
    hostAllowed: () => ({ allowed: true, atsFamily: "greenhouse", host: "boards.greenhouse.io" }),
    boardFactory: (o) => { made.push(o); return { kind: "browser", browserDriver: true, atsFamily: "greenhouse" }; } };
  const req = (svc, body) => svc.handle({ method: "POST", path: "/board-sessions", headers: { "x-upmore-board-secret": SECRET }, body });
  const missing = createBoardService(Object.assign({}, base, { resolveResumePath: () => { throw Object.assign(new Error("gone"), { code: "RESUME_FILE_MISSING" }); } }));
  const r1 = req(missing, { userId: USER, url: postingN(1).url, resumeSha256: RESUME_SHA });
  assert.equal(r1.status, 409);
  assert.equal(r1.body.error, "RESUME_FILE_MISSING");
  const nul = createBoardService(Object.assign({}, base, { resolveResumePath: () => null }));
  assert.equal(req(nul, { userId: USER, url: postingN(1).url, resumeSha256: RESUME_SHA }).body.error, "RESUME_FILE_MISSING");
  assert.equal(made.length, 0, "no board is built over a missing resume");
  const seen = [];
  const ok = createBoardService(Object.assign({}, base, { resolveResumePath: (u, o) => { seen.push([u, o.resumeSha256]); return "/srv/resumes/x.pdf"; } }));
  assert.equal(req(ok, { userId: USER, url: postingN(1).url, resumeSha256: RESUME_SHA }).status, 201);
  assert.deepEqual(seen, [[USER, RESUME_SHA]]);
  assert.equal(made[0].resumePath, "/srv/resumes/x.pdf");
});
