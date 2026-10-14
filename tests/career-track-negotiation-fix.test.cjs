// Track + Negotiation fixer wave (SC-121..145, SC-206..220) — FAIL-FIRST replay tests.
// Written BEFORE the fixes in 126-career-track.js, 128-career-negotiation.js and
// 141-career-doorstep.js (emitTrackingLog generalization). Each test below failed
// on the pre-fix build for the stated reason; the verification-only tests at the
// end (typed negotiation products) passed before and must keep passing.
// Check: node --test tests/career-track-negotiation-fix.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const T = require(path.join(root, "packages/domain/126-career-track.js"));
const N = require(path.join(root, "packages/domain/128-career-negotiation.js"));
const D = require(path.join(root, "packages/domain/141-career-doorstep.js"));
const Rescore = require(path.join(root, "scripts/career/gauntlet/run-grand-rescore.cjs"));
const NOW = T.SEED_NOW;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const cir = (id) => JSON.parse(fs.readFileSync(path.join(root, `packages/career-data/cirs/${id}.json`), "utf8"));

function assertDoorstepPresent(r, family) {
  assert.ok(r, "emitter returned a result");
  assert.equal(r.resultStatus, "awaiting_user", "typed awaiting_user, got " + r.resultStatus + (r.guard_refusal ? " (" + r.guard_refusal.code + ")" : ""));
  assert.ok(r.doorstep, "doorstep record present");
  assert.equal(r.doorstep.family, family);
  assert.equal(r.doorstep.gap, null);
  assert.equal(r.doorstep.driven_by, "agent");
  assert.equal(r.doorstep.state, "AWAITING_COMMIT");
  assert.equal(r.doorstep.committed, false);
  assert.ok(Array.isArray(r.doorstep.step_log) && r.doorstep.step_log.length >= 1, "step log recorded");
  assert.ok(r.doorstep.payload, "payload snapshot on the doorstep record");
  assert.equal(r.payload_sha256, sha256(JSON.stringify(r.payload)), "payload hash matches payload bytes");
  assert.equal(r.doorstep.payload_sha256, r.payload_sha256);
  const grade = Rescore.doorstepGrade({ doorstep: r.doorstep });
  assert.equal(grade.status, "PRESENT", "run-grand-rescore reads this doorstep as PRESENT, not GAP");
}

// ---------------------------------------------------------- Job 1: emitTrackingLog work products
test("FIX-T1 SC-129: emitTrackingLog arms a 126 thank-you draft at the gate (no spurious log write demanded)", () => {
  const store = T.seedTestLog();
  const before = JSON.parse(JSON.stringify(store.rows));
  const sink = { writes: 0, write() { this.writes++; } };
  const draft = T.draftThankYou(T.findByCompany(store, "Datadog"), { now: NOW, note: "loved the systems question about the metrics pipeline" });
  const r = D.emitTrackingLog({ trackerStore: store, trackerSink: sink, now: "2026-10-12T12:00:00Z" }, { company: "Datadog", draft });
  assertDoorstepPresent(r, "tracking-write");
  assert.equal(r.payload.draft.kind, "thank_you");
  assert.equal(r.payload.draft.body, draft.body, "the exact 126 draft rides in the payload");
  assert.equal(r.payload.draft.sends, false);
  assert.equal(r.payload.draft.requires_approval, true);
  assert.equal(r.payload.company, "Datadog");
  assert.equal(sink.writes, 0, "nothing fired");
  assert.deepEqual(store.rows, before, "tracker store unchanged — armed, not fired");
});

test("FIX-T2 SC-128: emitTrackingLog arms a 126 nudge draft at the gate", () => {
  const store = T.seedTestLog();
  const draft = T.draftNudge(T.findByCompany(store, "Palantir"), { now: NOW });
  const r = D.emitTrackingLog({ trackerStore: store, now: "2026-10-12T12:00:00Z" }, { company: "Palantir", draft });
  assertDoorstepPresent(r, "tracking-write");
  assert.equal(r.payload.draft.kind, "follow_up_nudge");
  assert.equal(r.payload.draft.sends, false);
});

test("FIX-T3 SC-132: emitTrackingLog carries a log-wide resume-version verdict — no company required", () => {
  const store = T.seedTestLog();
  const verdict = T.resumeVersionVerdict(store);
  const r = D.emitTrackingLog({ trackerStore: store, now: "2026-10-12T12:00:00Z" }, { verdict });
  assertDoorstepPresent(r, "tracking-write");
  assert.equal(r.payload.verdict.killed, "fin-v1");
  assert.ok(r.payload.verdict.basis["fin-v1"], "verdict basis (the log rows' own stats) rides in the payload");
});

test("FIX-T4 SC-133: emitTrackingLog carries log-wide funnel analytics — no company required", () => {
  const store = T.seedTestLog();
  const analytics = T.funnelAnalytics(store);
  const r = D.emitTrackingLog({ trackerStore: store, now: "2026-10-12T12:00:00Z" }, { analytics });
  assertDoorstepPresent(r, "tracking-write");
  assert.equal(r.payload.analytics.by_source.referred.interview_rate, 0.5);
  assert.equal(r.payload.analytics.claims[0].supported, true);
});

test("FIX-T5 SC-121: emitTrackingLog carries a status summary as the tracking work product", () => {
  const store = T.seedTestLog();
  const summary = T.statusSummary(store, { now: NOW });
  const r = D.emitTrackingLog({ trackerStore: store, now: "2026-10-12T12:00:00Z" }, { summary });
  assertDoorstepPresent(r, "tracking-write");
  assert.equal(r.payload.summary.total, 12);
  assert.equal(r.payload.summary.open, 7);
});

test("FIX-T6 SC-138: emitTrackingLog accepts a 126-shaped { application, event } spec (manualUpdate output)", () => {
  const store = T.seedTestLog();
  const mu = T.manualUpdate(store, "Ramp", "Interview rounds", { now: NOW, detail: "user reported: Interview rounds" });
  assert.equal(mu.ok, true);
  const lastEvent = mu.application.events[mu.application.events.length - 1];
  const r = D.emitTrackingLog({ trackerStore: T.seedTestLog(), now: "2026-10-12T12:00:00Z" }, { application: mu.application, event: lastEvent });
  assertDoorstepPresent(r, "tracking-write");
  assert.equal(r.payload.company, "Ramp");
  assert.equal(r.payload.app_id, mu.application.app_id);
  assert.equal(r.payload.status, "Interview rounds");
  assert.equal(r.payload.operation, "move_stage");
  assert.equal(r.payload.event.type, "manual_update");
  assert.equal(r.payload.event.source, "user_reported", "Gate-3 enum mapping holds for 126-shaped specs too");
});

test("FIX-T7: emitTrackingLog accepts stage_after (the ingestMessage/manualUpdate result shape)", () => {
  const store = T.seedTestLog();
  const r = D.emitTrackingLog({ trackerStore: store, now: "2026-10-12T12:00:00Z" }, { company: "Ramp", stage_after: "Interview rounds", event_type: "manual_update", note: "I got an interview at Ramp" });
  assertDoorstepPresent(r, "tracking-write");
  assert.equal(r.payload.status, "Interview rounds");
  assert.equal(r.payload.operation, "move_stage");
});

// ---------------------------------------------------------- Job 2: 126 engine audit
test("FIX-T8 SC-122..127: a signal email with an unsubscribe footer is NOT marketing noise (signals beat footers)", () => {
  const rej = T.classifyMessage({ id: "x1", company: "Ramp", from: "recruiting@ramp.example.test", subject: "Update on your application", body: "Unfortunately, we have decided to move forward with other candidates. To stop these emails, unsubscribe here." }, ["Ramp"]);
  assert.equal(rej.class, "rejection"); assert.equal(rej.is_signal, true);
  const iv = T.classifyMessage({ id: "x2", company: "Datadog", from: "scheduling@datadog.example.test", subject: "Schedule your interview", body: "Please schedule a call with our recruiter — book a time that works. Unsubscribe from these reminders anytime." }, ["Datadog"]);
  assert.equal(iv.class, "interview_invite"); assert.equal(iv.is_signal, true);
  const off = T.classifyMessage({ id: "x3", company: "Ramp", from: "hr@ramp.example.test", subject: "Your offer", body: "We are pleased to offer you the role — your offer letter is attached. Equity is 0.05% of the shares outstanding." }, ["Ramp"]);
  assert.equal(off.class, "offer"); assert.equal(off.is_signal, true);
  // and the stage actually moves end-to-end
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "Ramp", role: "SWE Intern", applied_at: "2026-10-02T12:00:00Z", stage: "Confirmed" }, { now: NOW });
  const r = T.ingestMessage(store, { id: "x1", company: "Ramp", from: "recruiting@ramp.example.test", subject: "Update on your application", body: "Unfortunately, we have decided to move forward with other candidates. Unsubscribe here." }, { now: NOW });
  assert.equal(r.moved, true); assert.equal(T.findByCompany(store, "Ramp").stage, "Rejected");
});

test("FIX-T9: pure marketing stays noise under signal-first precedence (fixture shapes + marketing subject)", () => {
  const INBOX = JSON.parse(fs.readFileSync(path.join(root, "scripts/career/scenarios/fixtures/inbox-test.json"), "utf8")).messages;
  for (const id of ["TEST-msg-noise-linkedin", "TEST-msg-noise-marketing"]) {
    const c = T.classifyMessage(INBOX.find((m) => m.id === id));
    assert.equal(c.class, "marketing_noise"); assert.equal(c.is_signal, false);
  }
  const nl = T.classifyMessage({ id: "x4", company: "Stripe", from: "news@stripe.example.test", subject: "Stripe newsletter: our CEO interview", body: "Watch our interview with the CEO. Plus: how to schedule a call with sales. Unsubscribe here." }, ["Stripe"]);
  assert.equal(nl.class, "marketing_noise", "a marketing subject is noise even when the body borrows signal words");
});

test("FIX-T10 SC-131: daily digest has no raw kind codes and no duplicated follow-up (weekly FIN-E-013 parity)", () => {
  const d = T.dailyDigest(T.seedTestLog(), { now: NOW });
  assert.doesNotMatch(d.text, /follow_up_due|assessment_deadline|offer_expiry/);
  for (const line of d.next_actions) assert.doesNotMatch(line, /follow_up_due|assessment_deadline|offer_expiry/);
  const pal = d.next_actions.filter((x) => /Palantir/.test(x));
  assert.equal(pal.length, 1, "Palantir's follow-up appears exactly once, got: " + JSON.stringify(d.next_actions));
  assert.match(d.text, /Palantir follow-up due \(21 days quiet\)/);
  assert.match(d.text, /Hudson River Trading assessment deadline: 2026-10-18 \(6 days\)/);
});

test("FIX-T11 SC-125: an ingested recruiter_other signal is recorded on the log row (stage unmoved)", () => {
  const store = T.seedTestLog();
  const before = T.findByCompany(store, "Ramp").stage;
  const r = T.ingestMessage(store, { id: "TEST-msg-ambig-ramp2", company: "Ramp", from: "recruiter@ramp.example.test", subject: "Re: your Ramp application (TEST)", body: "Thanks for speaking with us. The team is still reviewing and no decision yet — could you share a few times next week that work for a quick chat?", at: "2026-10-12T10:00:00Z" }, { now: NOW });
  assert.equal(r.classification.class, "recruiter_other");
  assert.equal(r.moved, false); assert.equal(T.findByCompany(store, "Ramp").stage, before);
  const app = T.findByCompany(store, "Ramp");
  assert.equal(app.events[app.events.length - 1].type, "recruiter_other", "the signal is on the record, not silently dropped");
  assert.equal(app.events[app.events.length - 1].source, "inbox");
  assert.equal(T.statusByCompany(store, "Ramp", { now: NOW }).last_signal.type, "recruiter_other");
});

// ---------------------------------------------------------- Job 3: 128 negotiation engine
const SC206_LETTER = [
  "TEST OFFER LETTER — FICTIONAL, AUTHORED FOR SCENARIO TESTING ONLY",
  "",
  "Acme Robotics, Inc. (TEST offer)",
  "Role: Software Engineer, New Grad",
  "Location: Chicago, IL",
  "Start date: June 1, 2027",
  "",
  "Compensation:",
  "- Base salary: $128k per year",
  "- Signing bonus: $10k",
  "- Target annual bonus: 10% of base salary",
  "- Equity: RSU grant with a total grant value of $64k, vesting over 4 years with a 1-year cliff",
  "- Benefits: health, dental and vision insurance; 20 days of PTO per year; 401(k) plan",
  "",
  "Deadline to respond: November 3, 2026.",
].join("\n");

test("FIX-N1 SC-206: parseOffer extracts every field from a $k-shorthand letter with a 'deadline to respond' expiry", () => {
  const o = N.parseOffer(SC206_LETTER, { now: "2026-10-12T12:00:00Z" });
  assert.equal(o.base_salary, 128000, "$128k is 128000, not 128");
  assert.equal(o.signing_bonus, 10000, "$10k signing bonus");
  assert.deepEqual(o.annual_bonus, { kind: "target_pct", pct: 10 });
  assert.equal(o.equity.grant_value, 64000, "$64k grant value");
  assert.equal(o.equity.vest_years, 4); assert.equal(o.equity.cliff, "1-year"); assert.equal(o.equity.type, "RSU");
  assert.ok(o.benefits.some((b) => /health/.test(b)) && o.benefits.some((b) => /401\(k\)/.test(b)), "benefits extracted");
  assert.equal(o.pto_days, 20);
  assert.equal(o.start_date, "2027-06-01");
  assert.equal(o.expiry_date, "2026-11-03", "'Deadline to respond' sets the expiry");
  assert.deepEqual(o.missing, []);
});

test("FIX-N2 SC-206: parseOffer handles 'respond no later than' and a bare 'Salary:' line", () => {
  const o = N.parseOffer("Acme (TEST)\nSalary: $110,000 per year\nStart date: June 3, 2027\nPlease respond no later than November 5, 2026.", {});
  assert.equal(o.base_salary, 110000);
  assert.equal(o.start_date, "2027-06-03");
  assert.equal(o.expiry_date, "2026-11-05");
});

test("FIX-N3 SC-208/209 R-C5: benchmark().text exists and its FIRST sentence names the source class + as-of date", () => {
  const b = N.benchmark(cir("airbnb"), { role: "Software Engineer, New Grad" });
  assert.equal(typeof b.text, "string", "benchmark carries the text field 142 speaks (bench.text was undefined)");
  const first = b.text.split(/(?<=[.!?])\s/)[0];
  assert.match(first, /company file/i, "first sentence names the source class (company file)");
  assert.match(first, /as of 2026-10-12/, "first sentence carries the CIR as-of date");
  assert.match(b.statement, /as of 2026-10-12/, "statement carries the as-of date too");
  const bain = N.benchmark(cir("bain"));
  assert.equal(typeof bain.text, "string");
  const bainFirst = bain.text.split(/(?<=[.!?])\s/)[0];
  assert.match(bainFirst, /company file/i); assert.match(bainFirst, /as of 2026-10-12/);
  assert.match(bain.statement, /No sourced compensation figure/, "no-figure honesty sentence preserved");
  const none = N.benchmark(null);
  assert.equal(typeof none.text, "string", "a null CIR still yields honest text, never an invented date");
  assert.match(none.text.split(/(?<=[.!?])\s/)[0], /company file/i);
  assert.doesNotMatch(none.text, /20\d{2}-\d{2}-\d{2}/, "no date is invented when no CIR is on record");
});

test("FIX-N4 R-C5: a figure the CIR text itself calls 'reported' is labeled reported/anecdotal, whatever source_type says", () => {
  const fake = { company_id: "fakeco", company_name: "FakeCo (TEST)", as_of: "2026-10-12", compensation_notes: [{ claim: "Base salary range $100,000-$120,000, reported by a secondary aggregator from candidate posts.", source_url: "https://example.test/fake", source_type: "official", as_of: "2026-10-12" }] };
  const b = N.benchmark(fake);
  assert.equal(b.figures.length, 1);
  assert.equal(b.figures[0].anecdotal, true, "community-reported items are labeled reported, not measured (R-C5)");
});

test("FIX-N5 SC-208: counterStrategy returns a complete typed product — text, card, disclaimer, sends:false", () => {
  const o = N.parseOffer(SC206_LETTER, { now: "2026-10-12T12:00:00Z" });
  const cs = N.counterStrategy(o, N.benchmark(cir("airbnb")));
  assert.equal(typeof cs.text, "string", "counterStrategy carries the text field 142 speaks (strat.text was undefined)");
  assert.ok(cs.text.split(/(?<=[.!?])\s/)[0].length > 20, "first sentence is a real summary sentence");
  assert.equal(cs.sends, false, "top-level sends:false on the typed product");
  assert.equal(cs.card.sent, false); assert.equal(cs.card.requires_approval, true);
  assert.ok(cs.disclaimer && cs.scripts.email && cs.scripts.call && Array.isArray(cs.asks));
  assert.doesNotMatch(cs.text.split(/(?<=[.!?])\s/)[0], /\b(sent|submitted|applied|booked|logged|withdrawn|confirmed|tracked|suppressed|halted)\b/i, "no H-7 claim verb in the spoken first sentence");
});

// ---------------------------------------------------------- verification-only (passed pre-fix; must stay green)
test("VERIFY-N6: extensionDraft / declineDraft / roleplayTurn return complete typed products", () => {
  const o = N.parseOffer(fs.readFileSync(path.join(root, "packages/career-data/fixtures/test-offer-a.txt"), "utf8"), { now: "2026-10-12T12:00:00Z" });
  const ext = N.extensionDraft(o, { days: 7 });
  assert.equal(ext.requested_deadline, "2026-11-06"); assert.equal(ext.card.sent, false); assert.ok(ext.disclaimer && ext.draft);
  const dec = N.declineDraft(o);
  assert.ok(Object.values(dec.relationship_kept_checks).every(Boolean)); assert.equal(dec.card.sent, false); assert.ok(dec.disclaimer);
  let st = { turn: 0, pushes: 0 };
  st = N.roleplayTurn(st, "Thanks, I'm excited about the team.");
  st = N.roleplayTurn(st, "I was hoping base could be $142,000.");
  const end = N.roleplayTurn(st, "If we land there, I'm ready to sign today.");
  assert.equal(end.done, true); assert.match(end.feedback, /concrete ask/);
  const plan = N.deadlinePlan([o], { now: "2026-10-12" });
  assert.equal(plan.deadlines.length, 1); assert.equal(plan.collision, false); assert.ok(plan.as_of);
});
