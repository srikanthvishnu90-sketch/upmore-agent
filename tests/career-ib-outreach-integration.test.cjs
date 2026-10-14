// IB-1 / IB-2 integration tests — Outreach + Referrals wave (2026-10-14).
// FAIL-FIRST: written against the integrator briefs IB-1 and IB-2 in
// docs/career/gauntlet-ledger.md ("WAVE: Outreach + Referrals") BEFORE the
// integrator lands them. Every test drives the real CHAT PATH
// (120 -> 130 -> 142 -> 141, the production consultation order) — module-tier
// proofs for these producers already exist (tests/career-outreach-referrals-
// wave.test.cjs); what is missing is the wiring, and only a chat-path test
// can see that.
//   IB-1 — an outreach-send ask whose recipient resolves to a record WITH an
//          email must come back as 141's emitOutreachDraft doorstep result:
//          intent outreach_draft, draft != null addressed to the recipient,
//          doorstep{family:"outreach-send", state:"AWAITING_COMMIT"},
//          queue_state awaiting_approval with sends 0, and the Gate-3
//          payload (list_record + safety_plan_card with the LOCKED caps:
//          daily_cap_start 12, ceiling 30).
//   IB-2 — people ingested by an intake turn must be visible to a later
//          graph-path turn in the same conversation (SC-146 shape).
//          First-run finding: the store write exists in-tree and findPaths
//          FINDS the person — then 142's handleGraphPaths throws a
//          TypeError reading p.person.name, because 135's findPaths rows
//          are flat ({name, firm, title, why[]}) with no .person object.
//          Any non-empty graph ask crashes the router the same way
//          (handleKeepWarm L1035 has the identical defect). This test is
//          that bug's fail-first replay (bug law: ledger + guard).
//   IB-2b — the same journey phrased as the user phrases it ("from my
//          LinkedIn export", SC-146's own framing): 120's profile_export
//          intercepts the turn, counts nothing it cannot see, writes
//          nothing — the graph turn still finds nobody.
//   IB-3/SC-038 — an out-of-office ask must be answered by the OOO handler
//          (typed followup classification), never by handleReschedule's
//          calendar-slot reply (the H-14 failure).
//   IB-3/SC-049 — the honest-yield handler must quote the user's numbers
//          verbatim: "1,140 found" must not come back as "140 found" (H-6).
// Check: node --test tests/career-ib-outreach-integration.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const GAUNTLET = path.join(root, "packages/career-data/fixtures/gauntlet");

const Access = require(path.join(root, "packages/domain/120-career-access.js"));
const Onboarding = require(path.join(root, "packages/domain/130-career-onboarding.js"));
const Profile = require(path.join(root, "packages/domain/122-career-profile.js"));
const Router = require(path.join(root, "packages/domain/142-career-router.js"));
const Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js"));

// The production consultation order (mirrors tests/career-gauntlet-r2-integration.test.cjs).
function chatPath(text, ctx) {
  let r = Access.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "120" }, r);
  r = Onboarding.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "130" }, r);
  r = Router.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "142" }, r);
  r = Doorstep.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "141" }, r);
  return null;
}
const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const NOW = Date.parse("2026-10-13T12:00:00Z");

// The 146-shaped candidate record the wave's D1 replay proved drafts cleanly
// through 124's gate and 141's emitter at module tier.
const JANE_146 = { full_name: "Jane Doe", current_firm: "Evercore", title: "Analyst", office: "New York",
  email: "jane@evercore.com", email_status: "unverified", sources: ["pasted"], flags: [],
  relationship_to_user: "same school alumni", schools: ["DePaul University"],
  personalization_facts: [{ fact: "worked on a deal at Evercore", source_url: "https://example.com/x", strength: "strong" }] };

test("IB-1: a draft ask naming a recipient whose record carries an email returns the emitOutreachDraft doorstep result", () => {
  const ctx = { profile: loadProfile("p1-early-career-swe"), now: NOW, userId: "u-ib1", candidateRecords: [JANE_146] };
  const r = chatPath("Draft the first outreach email to Jane Doe at Evercore from my list", ctx);
  assert.ok(r, "the chat path must answer the ask");
  assert.equal(r.intent, "outreach_draft", `expected the outreach_draft intent, got ${r.intent}`);
  assert.ok(r.draft, "draft must not be null — a resolved outreach-send ask ends at a real draft, not a clarification");
  assert.equal(r.draft.to, "jane@evercore.com", "the draft must be addressed to the resolved record's email");
  assert.ok(r.doorstep, "the typed result must carry the doorstep artifact (STATE_doorstep_gap otherwise)");
  assert.equal(r.doorstep.family, "outreach-send");
  assert.equal(r.doorstep.state, "AWAITING_COMMIT");
  assert.equal(r.doorstep.driven_by, "agent");
  assert.ok(r.queue_state, "the typed result must carry queue_state");
  assert.equal(r.queue_state.status, "awaiting_approval");
  assert.equal(r.queue_state.sends, 0, "nothing may be sent — the draft waits at the gate");
  assert.ok(r.payload && r.payload.list_record, "the Gate-3 payload must carry the list record");
  assert.ok(r.payload.list_record.selected_count >= 1, "the resolved recipient must appear in the list record's selected count");
  assert.ok(r.payload.safety_plan_card, "the Gate-3 payload must carry the safety-plan card");
  assert.equal(r.payload.safety_plan_card.daily_cap_start, 12, "the locked safety plan starts at 12/day");
  assert.equal(r.payload.safety_plan_card.daily_cap_ceiling, 30, "the locked ceiling is 30/day");
  assert.equal(r.payload.sends, 0);
});

test("IB-2: an intake turn's people are found by a later graph-path turn in the same conversation (SC-146 shape)", () => {
  const csv = "First Name,Last Name,Email Address,Company,Position,Connected On\nSam,Stripe,sam@stripe.com,Stripe,Engineer,2025-09-01";
  const ctx = { profile: loadProfile("p1-early-career-swe"), now: NOW, userId: "u-ib2", linkedinConnectionsCsv: csv };
  const r1 = chatPath("Import this list of names", ctx);
  assert.ok(r1 && r1.intake && Array.isArray(r1.intake.records), "the intake turn must run 146 and return its records");
  assert.equal(r1.intake.records.length, 1, "the file's one connection must be ingested");
  const r2 = chatPath("who do i know at stripe?", ctx);
  assert.ok(r2, "the graph turn must answer");
  assert.equal(r2.intent, "graph_paths", `expected graph_paths, got ${r2.intent}`);
  assert.ok(Array.isArray(r2.paths) && r2.paths.length === 1,
    `the ingested Stripe connection must be a live path (got ${JSON.stringify(r2.paths && r2.paths.length)}) — intake output must be written into the store graph asks read`);
  assert.match(r2.reply, /Sam/, "the reply must name the person the intake just ingested");
});

test("IB-2b: the LinkedIn-export journey — an export intake ask, then 'who do i know' (SC-146's own framing)", () => {
  // SC-146's ask grounds the paths in "my linkedin export". In the full chat
  // path that turn is owned by 120 (profile_export) — which must result in
  // the export's people being in the graph, not merely counted in a reply.
  const csv = "First Name,Last Name,Email Address,Company,Position,Connected On\nSam,Stripe,sam@stripe.com,Stripe,Engineer,2025-09-01";
  const ctx = { profile: loadProfile("p1-early-career-swe"), now: NOW, userId: "u-ib2b", linkedinConnectionsCsv: csv };
  chatPath("Import this list of names from my LinkedIn export", ctx);
  const r2 = chatPath("who do i know at stripe?", ctx);
  assert.ok(r2, "the graph turn must answer");
  assert.equal(r2.intent, "graph_paths", `expected graph_paths, got ${r2.intent}`);
  assert.ok(Array.isArray(r2.paths) && r2.paths.length === 1,
    `the export's Stripe connection must be a live path after the export intake ask (got ${JSON.stringify(r2.paths && r2.paths.length)})`);
  assert.match(r2.reply, /Sam/, "the reply must name the person the export just supplied");
});

test("IB-3/SC-038: an out-of-office ask is answered as OOO — never by the reschedule/calendar handler", () => {
  const ctx = { profile: loadProfile("p1-early-career-swe"), now: NOW, userId: "u-ib3" };
  const r = chatPath("Out-of-office reply with a return date — reschedule next touch, don't count it as a reply", ctx);
  assert.ok(r, "the chat path must answer the ask");
  assert.ok(r.followup && r.followup.classification === "auto-reply-ooo",
    `expected the OOO handler's typed followup result, got intent ${r.intent} with no auto-reply-ooo classification`);
  assert.equal(r.followup.counts_as_reply, false, "an OOO notice must not count as a reply");
  assert.doesNotMatch(r.reply, /New slots are proposed/, "the calendar-slot reply is handleReschedule claiming an OOO ask (the H-14 failure)");
  assert.doesNotMatch(r.reply, /\(Eastern\)/, "a bare '(Eastern)' zone label with no real slot is the H-14 marker");
});

test("IB-3/SC-049: the honest-yield reply quotes the user's numbers verbatim — 1,140 stays 1,140", () => {
  const ctx = { profile: loadProfile("p1-early-career-swe"), now: NOW, userId: "u-ib4" };
  const r = chatPath('honest yield before approval: "1,140 found, 610 trustworthy emails, 540 sendable"', ctx);
  assert.ok(r, "the chat path must answer the ask");
  assert.match(r.reply, /1,140 found/, `the found count must be quoted verbatim with its thousands separator (reply was: ${r.reply})`);
  assert.match(r.reply, /610 trustworthy/);
  assert.match(r.reply, /540 sendable/);
  assert.doesNotMatch(r.reply, /quoted 140 found/, "the yield-quote regex must not drop the thousands separator (the H-6 failure)");
});
