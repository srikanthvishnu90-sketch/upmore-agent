// SESSION REUSE (NIGHT PLAN chunk 50%, 2026-10-22) — prepare -> approve
// in ONE drive per application. The board service holds a prepare
// drive's filled page alive under its idle TTL; what died at the
// prepare/approve seam was the HANDLE (the run record carried no
// session id and no doorstep payload), so the execution turn could
// only re-drive. The mechanism guarded here: 155 records the binding
// (app.boardSession + app.doorstep), the bridge binds a client board
// to an existing service session without a creation call, and 149's
// resumeApply verifies the live board against the stored payload
// before anything proceeds. A session gone, expired, or differing
// falls back to a fresh drive — never a fill on a wrong form, never a
// submit of an unverified payload.
//
// Graded on end states and call counts: the resumed leg performs ZERO
// opens and ZERO fills; negative controls refuse cross-user, expired,
// tampered, and drifted state. TEST persona + sandbox boards only; no
// real portal is opened by this suite, ever.
// Check: node --test tests/career-session-reuse.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Bridge = require(path.join(root, "supabase/functions/_shared/career_task_bridge.js"));
const { createBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));

const USER = "user-alex-test";
const NOW = Date.UTC(2026, 9, 22, 5, 0, 0);

const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
  },
};
const MASTER = {
  basics: { name: "Alex Testcase (TEST)", email: "alex.testcase@example.test" },
  facts: [
    { id: "F-T-001", kind: "skill", text: "JavaScript and Node.js development", confirmed: true },
    { id: "F-T-002", kind: "experience", text: "Built web applications as a student developer", confirmed: true },
    { id: "F-T-003", kind: "education", text: "Computer Science student", confirmed: true },
  ],
};
const ATTEST = { certify_true: { value: true, explicit: true } };
const POSTING = {
  id: "JOB-T-SR1", job_id: "JOB-T-SR1",
  canonicalKey: "greenhouse:testco1:software-engineering-intern",
  company: "TestCo 1", role: "Software Engineering Intern", title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testco1/jobs/1", status: "open", atsFamily: "greenhouse",
  location: "Chicago, IL", posted_at: "2026-10-10",
  jd_text: "Software engineering intern role at a test company. JavaScript, testing, code review, agile team.",
};

// ---------------- a fake board service: pages outlive their handles ----
// One registry entry = one service session holding one sandbox "page".
// Client boards are per-leg handles onto the page; each handle counts
// its own opens/fills/submits so a leg's work is measured exactly.
function makeRegistry() {
  const sessions = new Map();
  const calls = [];
  function clientBoard(rec, posting, overrides = {}) {
    const stats = { opens: 0, fills: 0, submits: 0, forms: 0 };
    const death = () => {
      if (!rec.alive) { const e = new Error("the worker board session expired"); e.code = "SESSION_EXPIRED"; throw e; }
    };
    return Object.assign({
      sandbox: true, atsFamily: posting.atsFamily, workerSessionId: rec.id, accountName: null, stats,
      open(url) { death(); stats.opens += 1; return rec.page.open(url); },
      form() { death(); stats.forms += 1; return rec.page.form(); },
      fill(fid, v) { death(); stats.fills += 1; return rec.page.fill(fid, v); },
      answers() { death(); return rec.page.answers(); },
      atReview() { death(); return rec.page.atReview(); },
      submit() { death(); stats.submits += 1; return rec.page.submit(); },
      close() {},
    }, overrides);
  }
  function boardFor(posting, opts) {
    const resume = !!(opts && opts.resumeSessionId);
    calls.push({ resume, sessionId: resume ? opts.resumeSessionId : null });
    if (resume) {
      const rec = sessions.get(opts.resumeSessionId);
      if (!rec) return clientBoard({ id: opts.resumeSessionId, alive: false, page: null }, posting);
      const b = clientBoard(rec, posting);
      rec.boards.push(b);
      return b;
    }
    const rec = { id: crypto.randomBytes(16).toString("hex"), page: Portal.createSandboxBoard({}), alive: true, boards: [] };
    sessions.set(rec.id, rec);
    const b = clientBoard(rec, posting);
    rec.boards.push(b);
    return b;
  }
  return { sessions, calls, boardFor, clientBoard };
}

function makeDeps(reg, extra = {}) {
  return Object.assign({
    postings: [POSTING], profile: PROFILE, profileMaster: MASTER,
    log: { records: [] }, now: NOW, attestations: ATTEST, boardFor: reg.boardFor,
  }, extra);
}
function preparedRun(reg, depsExtra = {}) {
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 1, now: NOW });
  Batch.prepareRun(run, makeDeps(reg, depsExtra));
  return run;
}
// Simulate the execution turn arriving in a NEW process: the run is
// pure JSON across the gap; the in-process runtime (sessions/profiles)
// does not survive.
function crossInvocation(run) {
  const restored = Batch.restoreRun(JSON.parse(JSON.stringify(Batch.serializeRun(run))));
  Batch._runtime.delete(restored.id);
  return restored;
}
const appOf = (run) => run.apps[run.selected[0]];
const eventsOf = (run, type) => run.events.filter((e) => e.type === type);

// ---------------- 149: resumeApply verification ----------------

test("149 resume: a live prepared session verifies and submits with zero opens and zero fills on the resumed leg", () => {
  const reg = makeRegistry();
  const board1 = reg.boardFor(POSTING);
  const log = { records: [] };
  const s1 = Portal.createPortalSession({ userId: USER, board: board1 });
  const prep = Portal.runApply(s1, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, attestations: ATTEST });
  assert.equal(prep.resultStatus, "prepared");
  const rec = reg.sessions.get(board1.workerSessionId);

  const board2 = reg.clientBoard(rec, POSTING);
  const s2 = Portal.createPortalSession({ userId: USER, board: board2 });
  const res = Portal.resumeApply(s2, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW + 60000, doorstep: prep.doorstep });
  assert.equal(res.resultStatus, "prepared", JSON.stringify(res));
  assert.equal(res.resumed, true);
  assert.equal(res.doorstep.payloadSha256, prep.doorstep.payloadSha256);
  assert.equal(board2.stats.opens, 0, "resume never navigates — open() would destroy the fills");
  assert.equal(board2.stats.fills, 0, "resume never fills — it verifies");

  const out = Portal.submitDoorstep(s2, { approvedByUser: true, payloadSha256: prep.doorstep.payloadSha256 }, { log, now: NOW + 60000, posting: POSTING });
  assert.equal(out.resultStatus, "completed", JSON.stringify(out));
  assert.equal(board2.stats.submits, 1);
});

test("149 resume: a stored payload that does not hash to its recorded hash is refused before the board is touched", () => {
  const reg = makeRegistry();
  const board1 = reg.boardFor(POSTING);
  const log = { records: [] };
  const s1 = Portal.createPortalSession({ userId: USER, board: board1 });
  const prep = Portal.runApply(s1, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, attestations: ATTEST });
  const rec = reg.sessions.get(board1.workerSessionId);
  const board2 = reg.clientBoard(rec, POSTING);
  const s2 = Portal.createPortalSession({ userId: USER, board: board2 });
  const tampered = { payload: Object.assign({}, prep.doorstep.payload, { email: "tampered@example.test" }), payloadSha256: prep.doorstep.payloadSha256 };
  const res = Portal.resumeApply(s2, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, doorstep: tampered });
  assert.equal(res.resultStatus, "blocked");
  assert.equal(res.code, "SESSION_BINDING_INVALID");
  assert.equal(board2.stats.forms, 0, "the board is never addressed on a broken binding's word");
  assert.equal(board2.stats.opens, 0);
  assert.equal(board2.stats.fills, 0);
});

test("149 resume: a live value that drifted from the prepared payload refuses the session", () => {
  const reg = makeRegistry();
  const board1 = reg.boardFor(POSTING);
  const log = { records: [] };
  const s1 = Portal.createPortalSession({ userId: USER, board: board1 });
  const prep = Portal.runApply(s1, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, attestations: ATTEST });
  const rec = reg.sessions.get(board1.workerSessionId);
  rec.page.fill("phone", "+1 000 555 9999"); // the page no longer holds the prepared values
  const board2 = reg.clientBoard(rec, POSTING);
  const s2 = Portal.createPortalSession({ userId: USER, board: board2 });
  const res = Portal.resumeApply(s2, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, doorstep: prep.doorstep });
  assert.equal(res.resultStatus, "blocked");
  assert.equal(res.code, "SESSION_STATE_MISMATCH");
  assert.ok((res.changedFields || []).includes("phone"), JSON.stringify(res.changedFields));
  assert.equal(board2.stats.fills, 0, "a mismatched session is discarded, never filled on");
  assert.equal(board2.stats.submits, 0);
});

test("149 resume: a dead session is SESSION_NOT_LIVE; another user's session is SESSION_USER_MISMATCH with the board untouched", () => {
  const reg = makeRegistry();
  const board1 = reg.boardFor(POSTING);
  const log = { records: [] };
  const s1 = Portal.createPortalSession({ userId: USER, board: board1 });
  const prep = Portal.runApply(s1, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, attestations: ATTEST });
  const rec = reg.sessions.get(board1.workerSessionId);

  rec.alive = false;
  const deadBoard = reg.clientBoard(rec, POSTING);
  const sDead = Portal.createPortalSession({ userId: USER, board: deadBoard });
  const resDead = Portal.resumeApply(sDead, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, doorstep: prep.doorstep });
  assert.equal(resDead.code, "SESSION_NOT_LIVE", JSON.stringify(resDead));

  rec.alive = true;
  const otherBoard = reg.clientBoard(rec, POSTING);
  const sOther = Portal.createPortalSession({ userId: "user-mallory-test", board: otherBoard });
  const resOther = Portal.resumeApply(sOther, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, doorstep: prep.doorstep });
  assert.equal(resOther.code, "SESSION_USER_MISMATCH");
  assert.equal(otherBoard.stats.forms, 0, "a foreign session's board is never read");
});

test("149 resume: captcha at the review is the application's result (CAPTCHA_HANDOFF), never a fallback trigger", () => {
  const reg = makeRegistry();
  const board1 = reg.boardFor(POSTING);
  const log = { records: [] };
  const s1 = Portal.createPortalSession({ userId: USER, board: board1 });
  const prep = Portal.runApply(s1, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, attestations: ATTEST });
  const rec = reg.sessions.get(board1.workerSessionId);
  const board2 = reg.clientBoard(rec, POSTING, { atReview() { return { captcha: true }; } });
  const s2 = Portal.createPortalSession({ userId: USER, board: board2 });
  const res = Portal.resumeApply(s2, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, doorstep: prep.doorstep });
  assert.equal(res.code, "CAPTCHA_HANDOFF");
  assert.ok(!Batch.RESUME_FALLBACK_CODES.has("CAPTCHA_HANDOFF"), "a captcha is handed to the user, not silently re-driven");
});

test("149 resume: a page no longer at the final review is SESSION_STATE_MISMATCH", () => {
  const reg = makeRegistry();
  const board1 = reg.boardFor(POSTING);
  const log = { records: [] };
  const s1 = Portal.createPortalSession({ userId: USER, board: board1 });
  const prep = Portal.runApply(s1, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, attestations: ATTEST });
  const rec = reg.sessions.get(board1.workerSessionId);
  const board2 = reg.clientBoard(rec, POSTING, { atReview() { return { atFinalReview: false }; } });
  const s2 = Portal.createPortalSession({ userId: USER, board: board2 });
  const res = Portal.resumeApply(s2, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, doorstep: prep.doorstep });
  assert.equal(res.code, "SESSION_STATE_MISMATCH");
  assert.equal(board2.stats.submits, 0);
});

// ---------------- 155: binding record + cross-invocation execution ----------------

test("155: prepare records the session binding + doorstep payload on the run record — and never in the events", () => {
  const reg = makeRegistry();
  const run = preparedRun(reg);
  const app = appOf(run);
  assert.equal(app.stage, "doorstep");
  assert.ok(app.boardSession && /^[a-f0-9]{32}$/.test(app.boardSession.sessionId), "the binding carries the service session id");
  assert.equal(app.boardSession.expiresAt - app.boardSession.preparedAt, Batch.SESSION_REUSE_TTL_MS);
  assert.ok(app.doorstep && app.doorstep.payload && app.doorstep.payloadSha256 === app.payloadSha256, "the exact carded payload is kept for verification");
  assert.ok(!JSON.stringify(run.events).includes(app.boardSession.sessionId), "session material is never logged — events carry no session id");
  assert.equal(eventsOf(run, "board_session_recorded").length, 1);
});

test("155 execute: cross-invocation approval resumes the SAME session — one drive, zero re-fills — and submits", () => {
  const reg = makeRegistry();
  const run = preparedRun(reg);
  const key = run.selected[0];
  const sessionId = appOf(run).boardSession.sessionId;
  const restored = crossInvocation(run);
  assert.equal(Batch.approveRun(restored, { approvedByUser: true }).ok, true);
  const ex = Batch.executeRun(restored, makeDeps(reg, { now: NOW + 60000 }));
  assert.equal(ex.ok, true, JSON.stringify(ex));
  const app = restored.apps[key];
  assert.equal(app.stage, "submitted", JSON.stringify(app.stop || app));
  assert.ok(app.confirmationId, "the employer-shaped confirmation landed");
  const rec = reg.sessions.get(sessionId);
  assert.equal(rec.boards.length, 2, "exactly two handles: the prepare board and the resumed board — no third drive");
  assert.equal(rec.boards[1].stats.opens, 0, "the approval leg never re-opened the form");
  assert.equal(rec.boards[1].stats.fills, 0, "the approval leg never re-filled the form");
  assert.equal(rec.boards[1].stats.submits, 1);
  assert.equal(reg.calls.filter((c) => !c.resume).length, 1, "one session creation for the whole application");
  assert.equal(reg.calls.filter((c) => c.resume).length, 1);
  assert.equal(eventsOf(restored, "session_resumed").length, 1);
  assert.equal(eventsOf(restored, "session_resume_fallback").length, 0);
});

test("155 execute: a drifted page falls back to a fresh drive, named — and still submits the approved payload", () => {
  const reg = makeRegistry();
  const run = preparedRun(reg);
  const key = run.selected[0];
  const rec = reg.sessions.get(appOf(run).boardSession.sessionId);
  rec.page.fill("phone", "+1 000 555 9999");
  const restored = crossInvocation(run);
  Batch.approveRun(restored, { approvedByUser: true });
  const ex = Batch.executeRun(restored, makeDeps(reg, { now: NOW + 60000 }));
  assert.equal(ex.ok, true);
  assert.equal(restored.apps[key].stage, "submitted");
  const fb = eventsOf(restored, "session_resume_fallback");
  assert.equal(fb.length, 1);
  assert.equal(fb[0].code, "SESSION_STATE_MISMATCH");
  assert.equal(reg.calls.filter((c) => !c.resume).length, 2, "the fallback created a fresh session");
});

test("155 execute: a dead session falls back (SESSION_NOT_LIVE); an expired binding never attempts a resume", () => {
  const reg = makeRegistry();
  const run = preparedRun(reg);
  const key = run.selected[0];
  const rec = reg.sessions.get(appOf(run).boardSession.sessionId);
  rec.alive = false;
  const restored = crossInvocation(run);
  Batch.approveRun(restored, { approvedByUser: true });
  Batch.executeRun(restored, makeDeps(reg, { now: NOW + 60000 }));
  assert.equal(restored.apps[key].stage, "submitted");
  assert.equal(eventsOf(restored, "session_resume_fallback")[0].code, "SESSION_NOT_LIVE");

  const reg2 = makeRegistry();
  const run2 = preparedRun(reg2);
  const key2 = run2.selected[0];
  const restored2 = crossInvocation(run2);
  restored2.apps[key2].boardSession.expiresAt = NOW - 1; // the window closed before the approval arrived
  Batch.approveRun(restored2, { approvedByUser: true });
  Batch.executeRun(restored2, makeDeps(reg2, { now: NOW + 60000 }));
  assert.equal(restored2.apps[key2].stage, "submitted");
  assert.equal(reg2.calls.filter((c) => c.resume).length, 0, "an expired binding is not addressed at all — the fresh drive is the path");
  assert.equal(eventsOf(restored2, "session_resumed").length, 0);
});

test("155 execute: a tampered stored payload is never submitted — the binding is refused and the fresh drive re-verifies against the approval", () => {
  const reg = makeRegistry();
  const run = preparedRun(reg);
  const key = run.selected[0];
  const approvedSha = run.apps[key].payloadSha256;
  const restored = crossInvocation(run);
  restored.apps[key].doorstep.payload = Object.assign({}, restored.apps[key].doorstep.payload, { email: "tampered@example.test" });
  Batch.approveRun(restored, { approvedByUser: true });
  Batch.executeRun(restored, makeDeps(reg, { now: NOW + 60000 }));
  const fb = eventsOf(restored, "session_resume_fallback");
  assert.equal(fb.length, 1);
  assert.equal(fb[0].code, "SESSION_BINDING_INVALID");
  assert.equal(restored.apps[key].stage, "submitted", "the fresh drive reproduced the approved payload exactly and submitted THAT");
  assert.equal(restored.approvals[key], approvedSha);
});

test("155 completeAttestations: the certification completes on the SAME live page — no new session, no re-open", () => {
  const reg = makeRegistry();
  const run = preparedRun(reg, { attestations: {} });
  const key = run.selected[0];
  assert.equal(run.apps[key].stage, "awaiting_attestation", JSON.stringify(run.apps[key].stop || run.summary));
  assert.ok(run.apps[key].boardSession, "the attestation-pending application also leaves its binding");
  const restored = crossInvocation(run);
  const out = Batch.completeAttestations(restored, makeDeps(reg, { now: NOW + 60000 }));
  assert.equal(out.completed, 1, JSON.stringify(restored.apps[key].stop || out));
  assert.equal(restored.apps[key].stage, "doorstep");
  assert.equal(reg.calls.filter((c) => !c.resume).length, 1, "no fresh session was created for the completion");
  assert.equal(reg.calls.filter((c) => c.resume).length, 1, "the completion resumed the prepare session");
  const rec = reg.sessions.get(restored.apps[key].boardSession.sessionId);
  assert.equal(rec.boards[1].stats.opens, 0, "the completion never re-opened the form");
  const resumed = eventsOf(restored, "session_resumed");
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].via, "continue");
});

// ---------------- bridge + real board service ----------------

const SECRET = "test-board-secret";
const VERDICTS = { greenhouse: true, lever: true, ashby: true };
function makeServiceBoardFactory() {
  return (opts) => {
    const url = opts.url || "";
    const fam = /lever\.co/.test(url) ? "lever" : /ashbyhq\.com/.test(url) ? "ashby" : "greenhouse";
    return Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: fam });
  };
}

test("bridge + service: boardFor with a resume id creates NO new session; a foreign user's resume is refused at the first call", () => {
  const service = createBoardService({ secret: SECRET, familyVerdicts: VERDICTS, boardFactory: makeServiceBoardFactory() });
  const transport = (req) => service.handle(req);
  const providerA = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1:0/board-service", secret: SECRET, userId: USER, transport });
  const boardFor = Bridge.createCareerBoardFor(providerA);
  const log = { records: [] };
  const board1 = boardFor(POSTING);
  const s1 = Portal.createPortalSession({ userId: USER, board: board1 });
  const prep = Portal.runApply(s1, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, attestations: ATTEST });
  assert.equal(prep.resultStatus, "prepared");
  assert.equal(service.sessionCount(), 1);
  const sessionId = board1.workerSessionId;
  assert.ok(/^[a-f0-9]{32}$/.test(sessionId));

  // the resume: same provider, resume option — no creation call
  const board2 = boardFor(POSTING, { resumeSessionId: sessionId, atsFamily: "greenhouse", host: "boards.greenhouse.io" });
  assert.equal(board2.workerSessionId, sessionId);
  assert.equal(service.sessionCount(), 1, "resumption created no new service session");
  const s2 = Portal.createPortalSession({ userId: USER, board: board2 });
  const res = Portal.resumeApply(s2, { posting: POSTING, profile: PROFILE, log, userId: USER, now: NOW, doorstep: prep.doorstep });
  assert.equal(res.resultStatus, "prepared", JSON.stringify(res));
  assert.equal(res.resumed, true);

  // cross-user: another user's provider addressing the same session id
  const providerB = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1:0/board-service", secret: SECRET, userId: "user-mallory-test", transport });
  const boardForB = Bridge.createCareerBoardFor(providerB);
  const foreign = boardForB(POSTING, { resumeSessionId: sessionId, atsFamily: "greenhouse", host: "boards.greenhouse.io" });
  assert.throws(() => foreign.form(), (e) => e && e.code === "WORKER_SESSION_FORBIDDEN");
  assert.equal(service.sessionCount(), 1, "the foreign attempt created nothing and touched nothing");

  // a malformed resume id is refused by the bridge itself
  assert.throws(() => providerA.boardFor(POSTING, { resumeSessionId: "not-a-session-id" }), (e) => e && e.code === "WORKER_SESSION_ID_INVALID");
});
