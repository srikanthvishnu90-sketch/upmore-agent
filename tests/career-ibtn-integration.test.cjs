// IB-TN INTEGRATION (Track + Negotiation wave) — fail-first chat-path tests
// for the integrator briefs IB-TN-1..10 in docs/career/gauntlet-ledger.md.
// The full patch specifications these tests encode live in
// ~/workspace/your_files/integrator-packs/ib-tn-pack.md.
//
// Method: drives the staging chat path (pilot-lib chatTurn: 143 -> 120 ->
// 130 -> 142 -> 141, replies composed by 140) exactly as the graders do,
// with the grader's own ctx ({ profile } — stagingContext adds now +
// postings). Canonical asks come from routing-expectations.json, the same
// source run-grand grades. Assertions read the TYPED RESULT (intent,
// resultStatus, res.doorstep — 141's typed doorstep record with its
// recomputing payload hash — and the work-product fields), never private
// re-implementations of product logic.
//
// RED/GREEN STATE at authoring (tree: HEAD ce2529b + the integrator's
// uncommitted 142 edits): tests marked [RED] fail now and pass when the
// named brief lands; tests marked [GUARD] already pass and must stay green
// (they pin briefs the integrator has already landed in the working tree);
// the SC-129 nuance pair documents, with the rescore's OWN completionTruth,
// that a present doorstep alone never completes A4 — the completion map in
// run-grand.cjs is the missing half (see the map test at the bottom).
//
// Check: node --test tests/career-ibtn-integration.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-ibtn-test-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-ibtn-test-evidence";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const RESCORE = require(path.join(ROOT, "scripts/career/gauntlet/run-grand-rescore.cjs"));
const H = L.H;

const EXPECT = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/career/gauntlet/routing-expectations.json"), "utf8"));
const BY_ID = new Map(EXPECT.entries.map((e) => [e.id, e.ask]));

function drive(id, ctxExtra) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "ibtn");
  const turn = L.chatTurn(s, BY_ID.get(id), Object.assign({ profile }, ctxExtra || {}));
  return { res: turn.result || {}, text: (turn.delivered || []).join("\n"), turn };
}

// 141's doorstep contract (doorstepArtifact): the record is present, the
// agent drove it (gap null), and the payload hash recomputes from the
// payload itself — a stamped-on doorstep without a real payload fails here.
function doorstepOk(res, label) {
  const d = res.doorstep;
  assert.ok(d, `${label}: typed result must carry res.doorstep (141's doorstep record)`);
  assert.equal(d.gap, null, `${label}: doorstep gap must be null (agent-drove, not a gap record)`);
  assert.equal(d.driven_by, "agent", `${label}: doorstep driven_by must be "agent"`);
  assert.equal(d.state, "AWAITING_COMMIT", `${label}: doorstep state must be AWAITING_COMMIT`);
  assert.ok(d.payload && typeof d.payload === "object", `${label}: doorstep payload must be present`);
  const recomputed = crypto.createHash("sha256").update(JSON.stringify(d.payload)).digest("hex");
  assert.equal(d.payload_sha256, recomputed, `${label}: doorstep payload_sha256 must recompute from the payload`);
  return d;
}

// ---------------------------------------------------------------------------
// IB-TN-1 — the inbox stage-move seam (handleInboxEvent fallthrough).
// The spec (pack IB-TN-1a): the result rides emitTrack with the 126-shaped
// spec { company, stage: <126 stage>, event_type: <126 class>, source:
// "inbox" }, so the payload is a real tracker_log_write whose stage speaks
// 126's vocabulary (CLASS_TO_STAGE), not 142's local slugs.
// ---------------------------------------------------------------------------
const INBOX_CASES = [
  ["SC-122", "confirmation", "Confirmed"],
  ["SC-123", "rejection", "Rejected"],
  ["SC-124", "interview_invite", "Interview rounds"],
  ["SC-126", "oa_invite", "OA/assessment"],
  ["SC-127", "offer", "Offer"],
];
for (const [id, eventType, stage] of INBOX_CASES) {
  test(`[RED] IB-TN-1 ${id}: inbox event turn carries the tracking-write doorstep`, () => {
    const { res } = drive(id);
    assert.equal(res.intent, "tracking_log", `${id}: intent stays tracking_log`);
    assert.equal(res.resultStatus, "completed", `${id}: the move is spoken as completed`);
    const d = doorstepOk(res, id);
    assert.equal(d.family, "tracking-write", `${id}: doorstep family`);
    assert.equal(d.payload.kind, "tracker_log_write", `${id}: payload is the log write`);
    assert.equal(d.payload.event && d.payload.event.type, eventType, `${id}: payload event type is the 126 class`);
    assert.equal(d.payload.stage, stage, `${id}: payload stage speaks 126's stage vocabulary`);
  });
}

test(`[RED] IB-TN-1 SC-138: a manual "I got an interview" update logs the Interview rounds stage`, () => {
  const { res } = drive("SC-138");
  assert.equal(res.intent, "tracking_log", "SC-138: intent stays tracking_log");
  const d = doorstepOk(res, "SC-138");
  // The stageFor fallthrough currently defaults this ask to "confirmed";
  // the spec widens the interview pattern (pack IB-TN-1b).
  assert.equal(d.payload.stage, "Interview rounds", "SC-138: payload stage is Interview rounds, not the confirmed default");
  assert.equal(d.payload.event && d.payload.event.type, "interview_invite", "SC-138: payload event type");
});

// ---------------------------------------------------------------------------
// IB-TN-1 — draft work products at the gate (SC-125, SC-128). The spec:
// the REAL 126 draft (draftRecruiterReply / draftNudge) rides in res.draft
// and through emitTrack's { draft } work-product branch — never a stub.
// ---------------------------------------------------------------------------
test(`[RED] IB-TN-1 SC-125: ambiguous recruiter reply carries the real clarifying draft at the gate`, () => {
  const { res } = drive("SC-125");
  assert.ok(res.draft, "SC-125: result carries the drafted reply");
  assert.equal(res.draft.kind, "recruiter_reply", "SC-125: the draft is 126's recruiter_reply product");
  assert.equal(res.draft.sends, false, "SC-125: the draft itself reports sends:false");
  const d = doorstepOk(res, "SC-125");
  assert.equal(d.payload.kind, "tracker_draft_at_gate", "SC-125: payload is the draft-at-gate work product");
});

test(`[RED] IB-TN-1 SC-128: quiet-application turn carries 126's real nudge draft, not the stub`, () => {
  const { res } = drive("SC-128");
  assert.ok(res.draft, "SC-128: result carries the nudge draft itself (not only a stub under another key)");
  assert.equal(res.draft.kind, "follow_up_nudge", "SC-128: the draft is 126's follow_up_nudge product");
  assert.equal(res.draft.sends, false, "SC-128: the draft itself reports sends:false");
  const d = doorstepOk(res, "SC-128");
  assert.equal(d.payload.kind, "tracker_draft_at_gate", "SC-128: payload is the draft-at-gate work product");
});

// ---------------------------------------------------------------------------
// IB-TN-1 + IB-TN-5 — digests (SC-130/131) ride the { summary } work
// product; IB-TN-4 — funnel turns (SC-132/133) always emit their 126
// product (verdict for the version ask, analytics for the source ask),
// even on a thin log: the refusal copy keeps its alternative, and the
// doorstep proves the math ran on the log's own rows.
// ---------------------------------------------------------------------------
for (const id of ["SC-130", "SC-131"]) {
  test(`[RED] IB-TN-1 ${id}: digest turn carries the status-summary doorstep`, () => {
    const { res } = drive(id);
    assert.equal(res.intent, "tracking_digest", `${id}: intent stays tracking_digest`);
    const d = doorstepOk(res, id);
    assert.equal(d.payload.kind, "tracker_status_summary", `${id}: payload is the log-wide summary work product`);
  });
}

test(`[RED] IB-TN-4 SC-132: version funnel turn emits the resume-version verdict doorstep`, () => {
  const { res, text } = drive("SC-132");
  const d = doorstepOk(res, "SC-132");
  assert.equal(d.payload.kind, "tracker_funnel_verdict", "SC-132: payload is 126's resume-version verdict");
  assert.match(text, /What I will do instead/i, "SC-132: the thin-log reply keeps its alternative (IB-TN-4 copy half)");
});

test(`[RED] IB-TN-4 SC-133: source funnel turn emits the funnel-analytics doorstep`, () => {
  const { res } = drive("SC-133");
  const d = doorstepOk(res, "SC-133");
  assert.equal(d.payload.kind, "tracker_funnel_analytics", "SC-133: payload is 126's funnel analytics");
});

// ---------------------------------------------------------------------------
// IB-TN-3 — accepted offer (SC-137): the de-claimed copy already landed
// (Wave B); the product half is the doorstep (withdrawal drafts at the
// gate / the log-wide summary on an empty log). The reply must never
// claim a withdrawal state that did not happen.
// ---------------------------------------------------------------------------
test(`[RED] IB-TN-3 SC-137: accepted-offer turn carries a doorstep and claims no withdrawal`, () => {
  const { res, text } = drive("SC-137");
  doorstepOk(res, "SC-137");
  assert.ok(!/withdrawn-by-you|close as withdrawn/i.test(text), "SC-137: no withdrawn-state claim without a withdrawal event (H-7)");
});

// ---------------------------------------------------------------------------
// IB-TN-10 — season turns (SC-141/144/145) ride the { summary } emit like
// every other log-wide product; prep briefs (SC-135/136) are pinned at
// their product only — their doorstep carriage is a flagged decision item
// in the pack (141 has no prep emitter), deliberately not asserted here.
// ---------------------------------------------------------------------------
for (const id of ["SC-141", "SC-144", "SC-145"]) {
  test(`[RED] IB-TN-10 ${id}: season turn carries the tracking-write doorstep`, () => {
    const { res } = drive(id);
    doorstepOk(res, id);
  });
}
for (const id of ["SC-135", "SC-136"]) {
  test(`[GUARD] IB-TN-10 ${id}: prep brief product is delivered (doorstep carriage = pack decision item)`, () => {
    const { res } = drive(id);
    assert.equal(res.intent, "prep_brief", `${id}: intent stays prep_brief`);
    assert.ok(res.brief, `${id}: result carries the brief product`);
  });
}

// ---------------------------------------------------------------------------
// Already-landed halves — regression guards (must stay green).
// ---------------------------------------------------------------------------
test(`[GUARD] IB-TN-2 SC-121: status turn carries the summary doorstep with the scrubbed copy`, () => {
  const { res, text } = drive("SC-121");
  const d = doorstepOk(res, "SC-121");
  assert.equal(d.payload.kind, "tracker_status_summary", "SC-121: payload is the status summary");
  assert.ok(!/Applications you sent yourself/i.test(text), "SC-121: the H-7 'sent yourself' wording stays scrubbed");
});

for (const id of ["SC-134", "SC-139", "SC-140"]) {
  test(`[GUARD] IB-TN-1 ${id}: status-shaped turn keeps its summary doorstep`, () => {
    const { res } = drive(id);
    doorstepOk(res, id);
  });
}

test(`[GUARD] IB-TN-6 SC-142: comp-expectation ask gets the draft on its card, never the outreach plan`, () => {
  const { res, text } = drive("SC-142");
  assert.equal(res.intent, "outreach_draft", "SC-142: routed to the comp-expectation draft");
  assert.ok(res.draft && res.draft.kind === "comp_expectation_reply", "SC-142: the draft product rides in the result (A4's completing shape)");
  assert.ok(!/shortlist first, drafts second/i.test(text), "SC-142: no outreach-plan copy");
});

test(`[GUARD] IB-TN-7 SC-143: reschedule turn carries the calendar doorstep card`, () => {
  const { res, text } = drive("SC-143");
  const d = doorstepOk(res, "SC-143");
  assert.equal(d.family, "calendar", "SC-143: doorstep family is calendar");
  assert.equal(d.payload.kind, "calendar_proposal_card", "SC-143: payload is the proposal card");
  assert.ok(!/\(Eastern\)/.test(text), "SC-143: no naive '(Eastern)' slot literals in the reply (H-14)");
});

// ---------------------------------------------------------------------------
// IB-TN-8 — negotiation. The plumbing half already landed (guard below,
// ctx-staged the way a host stages it). The OPEN halves: the advice path
// must carry the benchmark product and speak its R-C5 sentence — the
// hard-coded "as of October 2026" line must disappear from every path.
// ---------------------------------------------------------------------------
const CIR = {
  company_name: "Acme (TEST)", company_id: "acme-test", as_of: "2026-10-12",
  compensation_notes: [{ fact: { claim: "Base salary range $120,000 - $150,000 for this level at Acme", source_url: "https://example.test/acme-cir", source_type: "official", as_of: "2026-10-12" } }],
};
const OFFER_TEXT = "Offer letter from Acme (TEST): base salary $135,000 per year, signing bonus $10,000, equity grant 0.05%, start date November 3, 2026. Please respond by October 24, 2026.";

test(`[GUARD] IB-TN-8 SC-207 (staged ctx): a plumbed offer produces the plan, the scripts, and the CIR's own as-of`, () => {
  const { res, text } = drive("SC-207", { offerText: OFFER_TEXT, cir: CIR });
  assert.equal(res.intent, "negotiation_plan", "SC-207 staged: intent is negotiation_plan");
  assert.equal(res.offer && res.offer.base_salary, 135000, "SC-207 staged: the offer was parsed from ctx.offerText");
  assert.ok(res.strategy && res.strategy.scripts && res.strategy.scripts.email, "SC-207 staged: counter scripts ride in the result");
  assert.equal(res.strategy.sends, false, "SC-207 staged: the strategy reports sends:false");
  assert.match(text, /as of 2026-10-12/, "SC-207 staged: the reply carries the CIR's actual as-of date (R-C5)");
  assert.ok(!/as of October 2026/i.test(text), "SC-207 staged: no hard-coded as-of line");
});

for (const id of ["SC-206", "SC-210"]) {
  test(`[RED] IB-TN-8 ${id}: advice turn carries the benchmark product and no hard-coded as-of`, () => {
    const { res, text } = drive(id);
    assert.ok(/^negotiation_/.test(res.intent || ""), `${id}: a negotiation intent owns the turn (was ${res.intent})`);
    assert.ok(res.bench && typeof res.bench.text === "string", `${id}: the benchmark product rides in the typed result`);
    assert.ok(!/as of October 2026/i.test(text), `${id}: the hard-coded benchmark line is gone (R-C5)`);
  });
}

// ---------------------------------------------------------------------------
// IB-TN-6 (SC-208 half) — counter scripts are a negotiation product:
// word-for-word email + call scripts from 128's counterStrategy, on the
// approval card — never the outreach plan, never a hard-coded as-of.
// ---------------------------------------------------------------------------
test(`[RED] IB-TN-6 SC-208: counter-script ask gets 128's scripts, not the outreach plan`, () => {
  const { res, text } = drive("SC-208");
  assert.ok(/^negotiation_/.test(res.intent || ""), `SC-208: a negotiation intent owns the turn (was ${res.intent})`);
  assert.ok(res.strategy && res.strategy.scripts, "SC-208: counterStrategy's scripts ride in the result");
  assert.ok(res.strategy.scripts.email && res.strategy.scripts.call, "SC-208: both the email and the call script are present");
  assert.equal(res.strategy.sends, false, "SC-208: sends:false — nothing sends without the user's yes");
  assert.ok(!/shortlist first, drafts second/i.test(text), "SC-208: no outreach-plan copy");
  assert.ok(!/as of October 2026/i.test(text), "SC-208: no hard-coded as-of line (R-C5)");
});

// ---------------------------------------------------------------------------
// IB-TN-9 — roleplay belongs to 128's roleplayTurn, statefully. The mock
// matcher in dispatchChat (which lists "roleplay" in its own alternation)
// must not capture the ask first; the reply speaks the recruiter's line
// and carries the R-C5 sourcing sentence, not the hard-coded one.
// ---------------------------------------------------------------------------
test(`[RED] IB-TN-9 SC-209: roleplay ask reaches 128's roleplay engine, not mock prep`, () => {
  const { res, text } = drive("SC-209");
  assert.equal(res.intent, "negotiation_roleplay", `SC-209: intent is negotiation_roleplay (was ${res.intent})`);
  assert.ok(res.roleplay && res.roleplay.turn >= 1, "SC-209: the roleplay state rides in the result");
  assert.match(text, /what would make this an easy yes/i, "SC-209: the recruiter's opening line comes from roleplayTurn");
  assert.ok(!/as of October 2026/i.test(text), "SC-209: no hard-coded as-of line (R-C5)");
});

// ---------------------------------------------------------------------------
// THE SC-129 NUANCE — the completion-condition mapping (pack §A4).
// SC-129's doorstep half is LANDED (guard, first test below): the typed
// result carries 141's record and the runner's own derivation counts the
// turn reached via res.draft. Yet its graded A4 read completion=false,
// because run-grand.cjs's completion list is a closed set of intent
// shapes with NO tracking branch. The rescore's completionTruth is NOT
// the blocker — the second test proves it with the rescore's own code:
// given a record whose A4 passed and whose doorstep is PRESENT, it
// passes; given the same record with the A4 the current map produces, it
// fails on the v1 A4 alone. What remains is purely the map (third test).
// ---------------------------------------------------------------------------
test(`[GUARD] SC-129 nuance (product half): the thank-you turn carries 141's doorstep record today`, () => {
  const { res } = drive("SC-129");
  const d = doorstepOk(res, "SC-129");
  assert.equal(d.family, "tracking-write", "SC-129: doorstep family is tracking-write");
  assert.ok(res.draft && res.draft.kind === "thank_you", "SC-129: the real thank-you draft rides in the result");
});

test(`[GUARD] SC-129 nuance (grader half): rescore completionTruth passes iff the v1 A4 passed — the map is the only missing half`, () => {
  const { res, text } = drive("SC-129");
  // The doorstep block exactly as run-grand.cjs derives it from this
  // typed result today (reached via res.draft -> PRESENT, gap null).
  const doorstepBlock = { family: "tracking-write", driven_by: "agent", gap: null, proof: { step_log: "doorstep/step-log.json", payload_snapshot: "doorstep/payload-snapshot.json" } };
  const base = { scenario_id: "SC-129", delivered_messages: [text], doorstep: doorstepBlock };
  const withCurrentA4 = Object.assign({}, base, { assertions: [{ id: "SC-129-A4", pass: false }] });
  const withMappedA4 = Object.assign({}, base, { assertions: [{ id: "SC-129-A4", pass: true }] });
  assert.equal(res.doorstep && res.doorstep.gap, null, "SC-129: precondition — the product-side doorstep is present");
  assert.equal(RESCORE.completionTruth(withCurrentA4, text).pass, false, "with the A4 the current map yields, completionTruth fails — doorstep present, completion false (the recorded SC-129 state)");
  assert.equal(RESCORE.completionTruth(withCurrentA4, text).fired, null, "the failure is the v1 A4 itself, not the doorstep half (fired stays null)");
  assert.equal(RESCORE.completionTruth(withMappedA4, text).pass, true, "with the TN completion branch landed, the same record passes completionTruth unchanged — rescore needs no edit");
});

test(`[RED] §A4 completion map: run-grand's completion list covers the TN intent shapes`, () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/career/gauntlet/run-grand.cjs"), "utf8");
  const block = src.slice(src.indexOf("completion conditions per result type"), src.indexOf("const preliminary"));
  assert.ok(block.length > 0, "the completion block is locatable in run-grand.cjs");
  for (const shape of ["tracking_log", "tracking_status", "tracking_digest", "season_dashboard", "calendar_proposal", "negotiation_plan", "negotiation_advice", "negotiation_roleplay"]) {
    assert.ok(block.includes(shape), `the completion list must gain a branch for ${shape} (pack §A4)`);
  }
});
