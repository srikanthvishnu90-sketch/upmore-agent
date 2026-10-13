// 126-career-track (Doc 2 section 7; F04 SC-061..SC-080): log, inbox classification, stage engine,
// quiet-period rule, digest math, funnel math, deadlines, cooldown, duplicate, withdrawal.
// All fixtures are TEST-labeled synthetic data. Check: node --test tests/career-track.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const T = require(path.join(__dirname, "..", "packages/domain/126-career-track.js"));
const INBOX = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts/career/scenarios/fixtures/inbox-test.json"), "utf8")).messages;
const NOW = T.SEED_NOW;
const msg = (id) => INBOX.find((m) => m.id === id);

test("classification: confirmation / rejection / OA / interview are signals", () => {
  assert.equal(T.classifyMessage(msg("TEST-msg-confirm-ramp")).class, "confirmation");
  assert.equal(T.classifyMessage(msg("TEST-msg-reject-goldman")).class, "rejection");
  assert.equal(T.classifyMessage(msg("TEST-msg-oa-hrt")).class, "oa_invite");
  assert.equal(T.classifyMessage(msg("TEST-msg-interview-datadog")).class, "interview_invite");
  for (const id of ["TEST-msg-confirm-ramp", "TEST-msg-reject-goldman", "TEST-msg-oa-hrt", "TEST-msg-interview-datadog"]) assert.equal(T.classifyMessage(msg(id)).is_signal, true);
});
test("classification: marketing noise is NO-SIGNAL and never moves a stage", () => {
  for (const id of ["TEST-msg-noise-linkedin", "TEST-msg-noise-marketing"]) { const c = T.classifyMessage(msg(id)); assert.equal(c.class, "marketing_noise"); assert.equal(c.is_signal, false); }
  const store = T.seedTestLog(); const before = T.findByCompany(store, "Stripe").stage;
  const r = T.ingestMessage(store, msg("TEST-msg-noise-marketing"), { now: NOW });
  assert.equal(r.moved, false); assert.equal(T.findByCompany(store, "Stripe").stage, before);
});
test("stage engine: confirmation moves Submitted -> Confirmed with inbox evidence", () => {
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "Ramp", role: "SWE Intern", role_family: "SWE", applied_at: "2026-10-02T12:00:00Z", resume_version: "swe-v2", source: "cold", stage: "Submitted" }, { now: NOW });
  const r = T.ingestMessage(store, msg("TEST-msg-confirm-ramp"), { now: NOW });
  assert.equal(r.moved, true); assert.equal(r.stage_after, "Confirmed");
  const app = T.findByCompany(store, "Ramp");
  assert.equal(app.stage, "Confirmed");
  assert.equal(app.events.at(-1).source, "inbox"); assert.equal(app.events.at(-1).evidence, "TEST-msg-confirm-ramp");
  assert.ok(r.alert && /Ramp/.test(r.alert.text));
});
test("stage engine: rejection / interview / OA moves + calendar + never-take-assessment", () => {
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "Goldman Sachs", role: "Summer Analyst", role_family: "Finance", applied_at: "2026-09-15T12:00:00Z", resume_version: "fin-v1", stage: "Confirmed" }, { now: NOW });
  T.addApplication(store, { company: "Datadog", role: "SWE Intern", role_family: "SWE", applied_at: "2026-09-25T12:00:00Z", resume_version: "swe-v2", source: "referred", stage: "Confirmed" }, { now: NOW });
  T.addApplication(store, { company: "Hudson River Trading", role: "SWE Intern", role_family: "SWE", applied_at: "2026-10-05T12:00:00Z", resume_version: "swe-v1", stage: "Confirmed", assessment_deadline: "2026-10-18T12:00:00Z" }, { now: NOW });
  assert.equal(T.ingestMessage(store, msg("TEST-msg-reject-goldman"), { now: NOW }).stage_after, "Rejected");
  const iv = T.ingestMessage(store, msg("TEST-msg-interview-datadog"), { now: NOW });
  assert.equal(iv.stage_after, "Interview rounds"); assert.ok(iv.calendar_event); assert.match(iv.calendar_event.prep, /F09/);
  const oa = T.ingestMessage(store, msg("TEST-msg-oa-hrt"), { now: NOW });
  assert.equal(oa.stage_after, "OA/assessment"); assert.equal(oa.assessment.will_take, false); assert.match(oa.assessment.statement, /will not take/i);
});
test("quiet-period rule: 10d nudge threshold, 21d ghosted (seed Palantir = 21 days)", () => {
  const store = T.seedTestLog();
  const q = T.quietReport(store, { now: NOW });
  const pal = q.find((x) => x.company === "Palantir");
  assert.equal(pal.days_quiet, 21); assert.equal(pal.ghosted, true); assert.equal(pal.nudge_due, true);
  const ramp = q.find((x) => x.company === "Ramp");
  assert.equal(ramp.days_quiet, 9); assert.equal(ramp.ghosted, false);
  const marked = T.markGhosted(store, { now: NOW });
  assert.deepEqual(marked, ["Palantir"]); assert.equal(T.findByCompany(store, "Palantir").stage, "Ghosted");
});
test("digest math: every count recomputed from the seed log rows", () => {
  const store = T.seedTestLog(); const d = T.weeklyDigest(store, { now: NOW });
  assert.equal(d.counts.total_applications, 12);
  assert.equal(d.counts.open, 7);
  assert.equal(d.counts.sent_last_7d, 3); // HRT Oct 5, Example Oct 6, Notion Oct 8
  assert.equal(d.counts.active_interviews, 1); // Datadog
  assert.equal(d.counts.rejections_last_7d, 1); // Goldman Oct 5
  assert.match(d.text, /3 sent this week/);
});
test("funnel math: by version / family / source from the log's own rows only", () => {
  const f = T.funnelAnalytics(T.seedTestLog());
  assert.equal(f.total, 12);
  assert.equal(f.by_source.cold.n, 8); assert.equal(f.by_source.referred.n, 4);
  assert.equal(f.by_source.referred.interview_rate, 0.5); assert.equal(f.by_source.cold.interview_rate, 0);
  assert.equal(f.by_version["fin-v1"].rejections, 4);
  assert.equal(f.by_family.SWE.interviews, 2);
  assert.equal(f.claims[0].supported, true);
});
test("funnel honesty: tiny samples produce NO supported claim", () => {
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "A (TEST)", role: "x", source: "referred", stage: "Interview rounds", applied_at: "2026-10-01T12:00:00Z" }, { now: NOW });
  T.addApplication(store, { company: "B (TEST)", role: "x", source: "cold", stage: "Rejected", applied_at: "2026-10-01T12:00:00Z" }, { now: NOW });
  const f = T.funnelAnalytics(store);
  assert.equal(f.claims.length, 1); assert.equal(f.claims[0].supported, false); // claim exists but is NOT supported on n=1 per side
});
test("rejection analysis: counts and concentration from seed rows", () => {
  const a = T.rejectionAnalysis(T.seedTestLog());
  assert.equal(a.rejected_count, 5);
  assert.equal(a.rejected_by_source.cold.n, 5); assert.equal(a.rejected_by_bucket.Reach.n, 4);
  assert.ok(a.plan.length >= 2);
});
test("quiet hours: 23:00 digest batches to 07:00; interview invite fires immediately", () => {
  const at23 = new Date(2026, 9, 12, 23, 0, 0);
  const p = T.planDelivery({ kind: "digest" }, at23);
  assert.equal(p.batched, true); assert.equal(new Date(p.deliver_at).getHours(), 7);
  const c = T.planDelivery({ kind: "interview_invite" }, at23);
  assert.equal(c.immediate, true);
  const at10 = new Date(2026, 9, 12, 10, 0, 0);
  assert.equal(T.planDelivery({ kind: "digest" }, at10).immediate, true);
});
test("manual update is marked user-reported and shows in the next status answer", () => {
  const store = T.seedTestLog();
  const r = T.manualUpdate(store, "Ramp", "Interview rounds", { now: NOW, detail: "user: I got an interview at Ramp" });
  assert.equal(r.ok, true);
  assert.equal(T.statusByCompany(store, "Ramp", { now: NOW }).stage, "Interview rounds");
  assert.equal(T.findByCompany(store, "Ramp").events.at(-1).source, "user-reported");
});
test("deadline radar: HRT CIR Oct 16 2026 + Stripe offer expiry + HRT assessment, dated and sorted", () => {
  const hrt = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/cirs/hudson-river-trading.json"), "utf8"));
  const items = T.deadlineRadar(T.seedTestLog(), [hrt], { now: NOW, withinDays: 14 });
  const cir = items.find((i) => i.kind === "cir_deadline");
  assert.ok(cir); assert.equal(cir.date, "2026-10-16"); assert.equal(cir.days_away, 4);
  assert.ok(items.some((i) => i.kind === "offer_expiry" && i.company === "Stripe" && i.date === "2026-10-20"));
  assert.ok(items.some((i) => i.kind === "assessment_deadline" && i.days_away === 6));
});
test("offer countdown comes from the stored date", () => {
  const o = T.offerCountdown(T.seedTestLog(), "Stripe", { now: NOW });
  assert.equal(o.offer_deadline, "2026-10-20T12:00:00Z"); assert.equal(o.days_left, 8);
});
test("duplicate check cites the inbox confirmation for Notion", () => {
  const d = T.duplicateCheck(T.seedTestLog(), INBOX, "Notion");
  assert.equal(d.already_applied, true); assert.equal(d.in_log, true);
  assert.ok(d.inbox_evidence.some((e) => e.message_id === "TEST-msg-confirm-notion"));
  const none = T.duplicateCheck(T.seedTestLog(), INBOX, "Figma");
  assert.equal(none.already_applied, false);
});
test("reapply cooldown: Goldman rejected Oct 5 + 180d default -> refused with reopen date", () => {
  const r = T.reapplyCheck(T.seedTestLog(), "Goldman Sachs", { now: NOW });
  assert.equal(r.allowed, false); assert.equal(r.reopen_date, "2027-04-03"); assert.equal(r.cooldown_days, 180);
  assert.match(r.reason, /default cooldown policy/);
});
test("withdrawal: drafts for all open apps; log marks Withdrawn only after confirm", () => {
  const store = T.seedTestLog();
  const w = T.withdrawalDrafts(store, "Stripe");
  assert.equal(w.count, 6); assert.equal(w.sends, false); // 7 open minus Stripe itself
  assert.equal(T.findByCompany(store, "Ramp").stage, "Confirmed"); // unchanged pre-confirm
  const done = T.confirmWithdrawals(store, w.drafts.map((d) => d.app_id), { now: NOW, acceptedCompany: "Stripe" });
  assert.equal(done.length, 6); assert.equal(T.findByCompany(store, "Ramp").stage, "Withdrawn");
  assert.equal(T.findByCompany(store, "Stripe").stage, "Offer");
});
test("timeline returns the full event history with evidence sources (Ramp seed)", () => {
  const t = T.timeline(T.seedTestLog(), "Ramp");
  assert.equal(t.found, true); assert.equal(t.events.length, 2);
  assert.equal(t.events[0].type, "applied"); assert.equal(t.events[1].type, "confirmation");
});
test("status by company: Stripe single-application answer from the log", () => {
  const s = T.statusByCompany(T.seedTestLog(), "Stripe", { now: NOW });
  assert.equal(s.stage, "Offer"); assert.equal(s.days_since_applied, 22); assert.equal(s.last_signal.type, "offer"); assert.equal(s.source, "referred");
});
test("nudge + thank-you drafts are approval-gated and built from the record", () => {
  const store = T.seedTestLog();
  const n = T.draftNudge(T.findByCompany(store, "Ramp"), { now: NOW });
  assert.equal(n.requires_approval, true); assert.equal(n.sends, false); assert.match(n.body, /2026-10-02/);
  const ty = T.draftThankYou(T.findByCompany(store, "Datadog"), { now: NOW });
  assert.equal(ty.within_24h, true); assert.equal(ty.hours_since_interview, 24);
});
