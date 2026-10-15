// BUG-217 — tracking hears free-word events (depth wave, work item 4).
//
// The defect (audit item 8): a user reporting an outcome in plain words —
// "they just emailed me a rejection, ugh" — got the generic fallback at the
// router, and inside 126 the same words were invisible: the signal lexicon
// was inbox-dialect only ("rejection" as a noun, "rejected", "turned me
// down", "coding challenge", "an offer" matched NOTHING), a named company
// with no existing row dropped the event ("no matching application"), a
// company-less report could not bind to a known application by app_id, and
// what evidence was stored was a message id, never the user's own words.
//
// THE CONTRACT pinned here (126's public ingest/status surface):
//  - A user-reported event is a message with source:"user-reported" whose
//    body is the user's verbatim words. The user's first-person report IS
//    the assertion (RCA invariant): it writes, with the verbatim clause
//    stored as the event's evidence and source "user-reported".
//  - Question / conditional / negated / quoted / third-party forms write
//    NOTHING. Marketing noise writes nothing, on either channel.
//  - Binding: by app_id (msg.app_id / opts.app_id) first, then by named
//    company; a named company with no row opens a named record; no
//    company and no app_id opens a fresh not-stated record (TN-1a). A
//    not-stated row is never fuzzy-matched to a named lookup.
//  - After an event lands, every read path in 126 (statusSummary,
//    statusByCompany, weeklyDigest, quietReport, timeline) tells the
//    truth: a rejected application never reads as a live/applied row.
//
// Check: node --test tests/career-track-events.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Track = require(path.join(__dirname, "..", "packages/domain/126-career-track.js"));

const NOW = Date.parse("2026-10-14T12:00:00Z");
const AT = "2026-10-14T12:00:00Z";
let uid = 0;
const userMsg = (text, extra) => Object.assign({ id: `chat-${++uid}`, source: "user-reported", body: text, at: AT }, extra || {});
function seedApp(store, company, stage) {
  return Track.addApplication(store, { company, role: "Software Engineering Intern", role_family: "SWE", applied_at: "2026-10-01T12:00:00Z", resume_version: "swe-v2", source: "cold", stage: stage || "Submitted" }, { now: NOW });
}
function lastEvent(app) { return (app.events || [])[app.events.length - 1]; }

// ---------------------------------------------------------- genuine reports
// Each case: setup returns { appId?, company? } for the row that must move.
const GENUINE = [
  // rejection
  { name: "rejection: named company, existing row, verb form", cls: "rejection", stage: "Rejected",
    setup: (st) => ({ appId: seedApp(st, "Stripe", "Submitted").app_id, company: "Stripe" }),
    text: "Stripe rejected me this morning, ugh", side: "pattern_note" },
  { name: "rejection: company-less, bound by app_id (the audit sentence)", cls: "rejection", stage: "Rejected",
    setup: (st) => ({ appId: seedApp(st, "Datadog", "Submitted").app_id, company: "Datadog" }),
    text: "they just emailed me a rejection, ugh", byAppId: true, side: "pattern_note" },
  { name: "rejection: turned me down idiom", cls: "rejection", stage: "Rejected",
    setup: (st) => ({ appId: seedApp(st, "Goldman Sachs", "Confirmed").app_id, company: "Goldman Sachs" }),
    text: "Goldman Sachs turned me down today", side: "pattern_note" },
  { name: "rejection: not-moving-forward idiom is an event, not a negation", cls: "rejection", stage: "Rejected",
    setup: (st) => ({ appId: seedApp(st, "Ramp", "Confirmed").app_id, company: "Ramp" }),
    text: "Ramp is not moving forward with my application", side: "pattern_note" },
  { name: "rejection: company not stated, no row — fresh not-stated record (TN-1a)", cls: "rejection", stage: "Rejected",
    setup: () => ({}),
    text: "I was rejected today, gutted", notStated: true, side: "pattern_note" },
  { name: "rejection: company named but no existing row — named record opened", cls: "rejection", stage: "Rejected",
    setup: () => ({ company: "Quill Finance" }),
    text: "Quill Finance rejected me yesterday", side: "pattern_note" },
  // interview_invite
  { name: "interview: named company, existing row", cls: "interview_invite", stage: "Interview rounds",
    setup: (st) => ({ appId: seedApp(st, "Datadog", "Confirmed").app_id, company: "Datadog" }),
    text: "Datadog invited me to interview next week", side: "calendar_event" },
  { name: "interview: call scheduled, company-less, bound by app_id", cls: "interview_invite", stage: "Interview rounds",
    setup: (st) => ({ appId: seedApp(st, "Ramp", "Confirmed").app_id, company: "Ramp" }),
    text: "they scheduled a call with me for Tuesday", byAppId: true, side: "calendar_event" },
  { name: "interview: company named but no existing row — named record opened", cls: "interview_invite", stage: "Interview rounds",
    setup: () => ({ company: "Notion" }),
    text: "I got an interview invite from Notion", side: "calendar_event" },
  { name: "interview: phone screen set up, named company", cls: "interview_invite", stage: "Interview rounds",
    setup: (st) => ({ appId: seedApp(st, "Stripe", "Confirmed").app_id, company: "Stripe" }),
    text: "Stripe set up a phone screen with me", side: "calendar_event" },
  // offer (+ acceptance)
  { name: "offer: extended me an offer, existing row at Final", cls: "offer", stage: "Offer",
    setup: (st) => ({ appId: seedApp(st, "Ramp", "Final").app_id, company: "Ramp" }),
    text: "Ramp extended me an offer today", side: "offer_intake" },
  { name: "offer: I got an offer from <company>", cls: "offer", stage: "Offer",
    setup: (st) => ({ appId: seedApp(st, "Stripe", "Interview rounds").app_id, company: "Stripe" }),
    text: "I got an offer from Stripe", side: "offer_intake" },
  { name: "offer: company-less, bound by app_id", cls: "offer", stage: "Offer",
    setup: (st) => ({ appId: seedApp(st, "Datadog", "Interview rounds").app_id, company: "Datadog" }),
    text: "they offered me the role, offer letter is in my inbox", byAppId: true, side: "offer_intake" },
  { name: "offer acceptance: I accepted the offer — terminal Accepted stage", cls: "accepted", stage: "Accepted",
    setup: (st) => ({ appId: seedApp(st, "Datadog", "Offer").app_id, company: "Datadog" }),
    text: "I accepted the offer from Datadog" },
  // oa_invite
  { name: "OA: acronym binds to the existing row (HRT = Hudson River Trading)", cls: "oa_invite", stage: "OA/assessment",
    setup: (st) => ({ appId: seedApp(st, "Hudson River Trading", "Confirmed").app_id, company: "Hudson River Trading" }),
    text: "HRT sent me a HackerRank this morning", side: "assessment" },
  { name: "OA: coding challenge, company-less, bound by app_id", cls: "oa_invite", stage: "OA/assessment",
    setup: (st) => ({ appId: seedApp(st, "Ramp", "Confirmed").app_id, company: "Ramp" }),
    text: "they sent me a coding challenge to finish by Friday", byAppId: true, side: "assessment" },
  { name: "OA: company named but no existing row — named record opened", cls: "oa_invite", stage: "OA/assessment",
    setup: () => ({ company: "Jane Street" }),
    text: "I got an OA from Jane Street", side: "assessment" },
  // confirmation
  { name: "confirmation: they received my application", cls: "confirmation", stage: "Confirmed",
    setup: (st) => ({ appId: seedApp(st, "Palantir", "Submitted").app_id, company: "Palantir" }),
    text: "Palantir confirmed they received my application" },
  { name: "confirmation: got the confirmation email", cls: "confirmation", stage: "Confirmed",
    setup: (st) => ({ appId: seedApp(st, "Notion", "Submitted").app_id, company: "Notion" }),
    text: "got the confirmation email from Notion this morning" },
];
for (const c of GENUINE) {
  test(`genuine — ${c.name}`, () => {
    const store = Track.createMemoryStore([]);
    const ctx = c.setup(store);
    const before = store.rows.length;
    const msg = userMsg(c.text, c.byAppId ? { app_id: ctx.appId } : {});
    const out = Track.ingestMessage(store, msg, { now: NOW });
    assert.equal(out.classification.class, c.cls, `classification of "${c.text}"`);
    assert.equal(out.linked, true, `"${c.text}" must be recorded, not dropped`);
    assert.equal(out.moved, true, `"${c.text}" must move the stage`);
    assert.equal(out.stage_after, c.stage);
    const row = ctx.appId ? store.rows.find((r) => r.app_id === ctx.appId) : (c.notStated ? store.rows[store.rows.length - 1] : Track.findByCompany(store, ctx.company));
    assert.ok(row, "the bound/opened row exists");
    assert.equal(row.stage, c.stage, "the row itself carries the true stage");
    if (c.notStated) {
      assert.equal(store.rows.length, before + 1, "exactly one fresh record opened");
      assert.equal(row.company, null); assert.equal(row.company_not_stated, true);
      assert.equal(out.company_not_stated, true);
    } else {
      assert.equal(row.company, ctx.company, "bound to the right company record");
      if (!ctx.appId) assert.equal(store.rows.length, before + 1, "a named company with no row opens exactly one named record");
    }
    // The signal event rides the row (an interview also appends its
    // calendar side-record event after it — SC-064 — so find by type).
    const ev = (row.events || []).filter((e) => e.type === c.cls).at(-1);
    assert.ok(ev, "the signal event rides the row");
    assert.equal(ev.source, "user-reported", "provenance is the user's report, never 'inbox'");
    assert.equal(ev.evidence, c.text, "evidence is the user's verbatim clause");
    assert.ok(out.alert && !/null/.test(out.alert.text), "the alert never renders the word \"null\"");
    if (c.notStated) assert.match(out.alert.text, /not stated/);
    else assert.ok(out.alert.text.includes(ctx.company), "the alert names the company");
    if (c.side === "calendar_event") assert.ok(out.calendar_event, "interview side record: calendar event attached");
    if (c.side === "assessment") { assert.ok(out.assessment, "OA side record present"); assert.equal(out.assessment.will_take, false, "the agent never takes the assessment"); }
    if (c.side === "offer_intake") assert.ok(out.offer_intake && out.offer_intake.started, "offer intake started");
    if (c.side === "pattern_note") assert.ok(out.pattern_note, "rejection side record: pattern note");
  });
}

// ------------------------------------------------- multi-event thread truth
test("multi-event thread: applied → confirmation → interview → rejection across turns, one row, truthful status", () => {
  const store = Track.createMemoryStore([]);
  const app = seedApp(store, "Stripe", "Submitted");
  const turns = [
    ["Stripe confirmed my application is in", "confirmation", "Confirmed"],
    ["Stripe invited me to a phone screen — call is scheduled for Thursday", "interview_invite", "Interview rounds"],
    ["ugh, Stripe just rejected me after the screen", "rejection", "Rejected"],
  ];
  for (const [text, cls, stage] of turns) {
    const out = Track.ingestMessage(store, userMsg(text, { app_id: app.app_id }), { now: NOW });
    assert.equal(out.classification.class, cls, `turn "${text}"`);
    assert.equal(out.stage_after, stage);
    assert.equal(store.rows.length, 1, "every turn binds to the same single row — no duplicates, no not-stated strays");
  }
  const row = store.rows[0];
  assert.equal(row.stage, "Rejected");
  assert.deepEqual(row.events.map((e) => e.type).filter((t) => t !== "calendar_event_attached"), ["applied", "confirmation", "interview_invite", "rejection"]);
  assert.equal(row.events.filter((e) => e.type === "calendar_event_attached").length, 1, "the interview turn attached its calendar side record");
  assert.ok(row.events.slice(1).every((e) => e.source === "user-reported"));
  assert.equal(row.events.at(-1).evidence, "ugh, Stripe just rejected me after the screen", "each event stores its verbatim clause");
  // Tracker truth on every read path:
  const sum = Track.statusSummary(store, { now: NOW });
  assert.equal(sum.open, 0, "a rejected application is not open");
  assert.equal(sum.by_stage.Rejected, 1); assert.equal(sum.by_stage.Submitted, 0);
  assert.equal(sum.applications[0].stage, "Rejected", "status never reads the dead application as applied/live");
  assert.equal(Track.statusByCompany(store, "Stripe", { now: NOW }).stage, "Rejected");
  const tl = Track.timeline(store, "Stripe");
  assert.equal(tl.events.at(-1).type, "rejection"); assert.equal(tl.events.at(-1).stage_after, "Rejected");
});

test("tracker truth after a rejection: summary, digest, quiet report and per-company status all agree", () => {
  const store = Track.createMemoryStore([]);
  seedApp(store, "Stripe", "Submitted");
  seedApp(store, "Ramp", "Submitted");
  const out = Track.ingestMessage(store, userMsg("Stripe rejected me this morning, ugh"), { now: NOW });
  assert.equal(out.stage_after, "Rejected");
  const sum = Track.statusSummary(store, { now: NOW });
  assert.equal(sum.applications.find((a) => a.company === "Stripe").stage, "Rejected");
  assert.equal(sum.open, 1, "only the live application counts as open");
  assert.equal(sum.by_stage.Submitted, 1); assert.equal(sum.by_stage.Rejected, 1);
  const byCo = Track.statusByCompany(store, "Stripe", { now: NOW });
  assert.equal(byCo.stage, "Rejected");
  assert.equal(byCo.last_signal.type, "rejection"); assert.equal(byCo.last_signal.source, "user-reported");
  assert.equal(Track.weeklyDigest(store, { now: NOW }).counts.open, 1);
  assert.ok(!Track.quietReport(store, { now: NOW }).some((q) => q.company === "Stripe"), "a rejected row is never queued for a nudge as if live");
  assert.equal(Track.rejectionAnalysis(store).rejected_count, 1);
});

// ------------------------------------------------------- adversarial forms
const ADVERSARIAL = [
  ["question form (signal word present)", "was I rejected by Stripe?"],
  ["question form (offer)", "did I get an offer from Stripe?"],
  ["conditional", "if Stripe rejects me, I'll just apply to other firms"],
  ["conditional (offer)", "if I get an offer from Stripe, I'll probably take it"],
  ["negation", "Stripe didn't reject me — I'm still in the running"],
  ["negation (offer)", "I didn't get an offer from Stripe yet, still waiting"],
  ["negation (no rejection yet)", "no rejection from Stripe yet — still hopeful"],
  ["quoted friend report", "my friend just texted me: \"I got rejected by Stripe\""],
  ["quoted speech attributed to a friend", "my friend said \"I got an offer from Stripe\""],
  ["third-party report, unquoted", "my friend got an offer from Stripe yesterday"],
  ["marketing noise in chat words", "check out this webinar: 50% off interview prep courses, sale ends Friday"],
];
for (const [name, text] of ADVERSARIAL) {
  test(`adversarial — ${name} writes NOTHING`, () => {
    const store = Track.createMemoryStore([]);
    seedApp(store, "Stripe", "Submitted");
    const before = JSON.parse(JSON.stringify(store.rows));
    const out = Track.ingestMessage(store, userMsg(text), { now: NOW });
    assert.equal(out.moved, false, `"${text}" must not move a stage`);
    assert.equal(out.linked, false, `"${text}" must not link or open a record`);
    assert.deepEqual(store.rows, before, "the store is byte-identical: no row, no event, no stage change");
  });
}
test("adversarial — inbox marketing noise still opens nothing (either channel)", () => {
  const store = Track.createMemoryStore([]);
  const noise = { id: "m-noise-x", from: "digest@jobs.example.test", subject: "Your weekly job alert digest", body: "Jobs you might like this week — unsubscribe anytime.", at: AT };
  const out = Track.ingestMessage(store, noise, { now: NOW });
  assert.equal(out.linked, false); assert.equal(store.rows.length, 0);
});

// ------------------------------------------------------ inbox channel intact
test("inbox channel unchanged: a real inbox rejection still moves the row with inbox provenance", () => {
  const store = Track.createMemoryStore([]);
  seedApp(store, "Ramp", "Confirmed");
  const msg = { id: "m-inbox-rej-1", company: "Ramp", from: "recruiting@ramp.example.test", subject: "Update on your application", body: "Unfortunately, we have decided to move forward with other candidates.", at: AT };
  const out = Track.ingestMessage(store, msg, { now: NOW });
  assert.equal(out.stage_after, "Rejected");
  const ev = lastEvent(Track.findByCompany(store, "Ramp"));
  assert.equal(ev.source, "inbox"); assert.equal(ev.evidence, "m-inbox-rej-1", "inbox evidence stays the message id");
});
