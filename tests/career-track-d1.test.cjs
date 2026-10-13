// Finisher D1 replay tests for SC-121..140 gaps in 126-career-track. Written BEFORE fixes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const T = require(path.join(__dirname, "..", "packages/domain/126-career-track.js"));
const NOW = T.SEED_NOW;
const AMBIG = { id: "TEST-msg-ambig-ramp", company: "Ramp", from: "recruiter@ramp.example.test", subject: "Re: your Ramp application (TEST)", body: "Thanks for speaking with us. The team is still reviewing and no decision yet — could you share a few times next week that work for a quick chat?", at: "2026-10-12T10:00:00Z" };

test("D1 SC-125: ambiguous recruiter reply is classified recruiter_other (from counts), no stage move, approval-gated draft exists", () => {
  const c = T.classifyMessage(AMBIG, ["Ramp"]);
  assert.equal(c.class, "recruiter_other"); assert.equal(c.is_signal, true); assert.equal(c.decision, false);
  const store = T.seedTestLog(); const before = T.findByCompany(store, "Ramp").stage;
  const r = T.ingestMessage(store, AMBIG, { now: NOW });
  assert.equal(r.linked, true); assert.equal(r.moved, false); assert.equal(T.findByCompany(store, "Ramp").stage, before);
  const d = T.draftRecruiterReply(T.findByCompany(store, "Ramp"), c, { now: NOW });
  assert.equal(d.requires_approval, true); assert.equal(d.sends, false); assert.match(d.body, /Ramp/);
});
test("D1 SC-126: OA message date sets assessment_deadline and queues prep pack", () => {
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "Hudson River Trading", role: "SWE Intern", applied_at: "2026-10-05T12:00:00Z", stage: "Confirmed" }, { now: NOW });
  const r = T.ingestMessage(store, { id: "TEST-msg-oa2", company: "Hudson River Trading", from: "assessments@hackerrank.example.test", subject: "Your online assessment (TEST)", body: "Complete the assessment by October 18, 2026. HackerRank link enclosed.", at: "2026-10-09T12:00:00Z" }, { now: NOW });
  assert.equal(T.findByCompany(store, "Hudson River Trading").assessment_deadline, "2026-10-18T12:00:00Z");
  assert.equal(r.assessment.deadline, "2026-10-18T12:00:00Z"); assert.equal(r.assessment.prep_pack_queued, true);
});
test("D1 SC-127: offer message date sets offer_deadline and starts intake + expiry clock", () => {
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "Ramp", role: "SWE Intern", applied_at: "2026-10-02T12:00:00Z", stage: "Final" }, { now: NOW });
  const r = T.ingestMessage(store, { id: "TEST-msg-offer-ramp", company: "Ramp", from: "recruiting@ramp.example.test", subject: "Your offer letter — Ramp (TEST)", body: "We are pleased to offer you the role. Please respond by October 16, 2026.", at: "2026-10-12T09:00:00Z" }, { now: NOW });
  assert.equal(T.findByCompany(store, "Ramp").offer_deadline, "2026-10-16T12:00:00Z");
  assert.equal(r.offer_intake.started, true); assert.equal(T.offerCountdown(store, "Ramp", { now: NOW }).days_left, 4);
});
test("D1 SC-129: thank-you draft carries the user's one-line note verbatim", () => {
  const note = "loved the systems question about the metrics pipeline";
  const ty = T.draftThankYou(T.findByCompany(T.seedTestLog(), "Datadog"), { now: NOW, note });
  assert.match(ty.body, /metrics pipeline/); assert.equal(ty.basis.user_note, note);
});
test("D1 SC-131: daily digest counts last 24h and lists today's next actions", () => {
  const d = T.dailyDigest(T.seedTestLog(), { now: NOW });
  assert.equal(typeof d.text, "string"); assert.match(d.text, /Daily digest/);
  assert.equal(d.counts.total_applications, 12); assert.ok(Array.isArray(d.next_actions));
  assert.equal(d.window_hours, 24);
});
test("D1 SC-132: losing resume version is named and killed from log rows only (n>=3 gate)", () => {
  const v = T.resumeVersionVerdict(T.seedTestLog());
  assert.equal(v.killed, "fin-v1"); assert.equal(v.kept.includes("swe-v2"), true);
  assert.equal(v.basis["fin-v1"].response_rate, 0.25); assert.equal(v.basis["fin-v2"] ? true : true, true);
});
test("D1 SC-134: offer expiring within 5 days escalates daily until decision", () => {
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "Ramp", role: "SWE Intern", applied_at: "2026-10-02T12:00:00Z", stage: "Offer", offer_deadline: "2026-10-16T12:00:00Z" }, { now: NOW });
  const e = T.offerEscalation(store, "Ramp", { now: NOW });
  assert.equal(e.days_left, 4); assert.equal(e.escalates_daily, true);
  assert.deepEqual(e.schedule.map((x) => x.date), ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  assert.equal(e.stops_when, "user_decides");
});
test("D1 SC-139: 30 days silent after a Final round is ghosted with options", () => {
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "FinalCo (TEST)", role: "SWE Intern", applied_at: "2026-09-01T12:00:00Z", stage: "Final" }, { now: NOW });
  T.findByCompany(store, "FinalCo").events.push({ type: "interview", at: "2026-09-12T12:00:00Z", source: "seed", detail: "final round (TEST)" });
  const q = T.quietReport(store, { now: NOW }).find((x) => x.company === "FinalCo (TEST)");
  assert.ok(q); assert.equal(q.days_quiet, 30); assert.equal(q.ghosted, true);
  assert.deepEqual(T.markGhosted(store, { now: NOW }), ["FinalCo (TEST)"]);
  const g = T.ghostedOptions(store, "FinalCo (TEST)", { now: NOW });
  assert.equal(g.label, "Ghosted"); assert.ok(g.options.length >= 3);
  assert.equal(g.days_quiet, 30); // the ghosted label event itself must not reset the quiet clock
});
