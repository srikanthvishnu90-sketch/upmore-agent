// Career Apply completion — the residual Apply shapes through the
// real chat path. REPLAYS for BUG-112/113/114 (residual lane,
// 2026-10-14):
//   BUG-112 — the dispatch "apply shapes" branch answered
//     bucket/starred/ghost/salary-band/weak-profile/Data-ML asks by
//     swapping a headline over the generic discovery shortlist
//     (H-2/H-4 by construction, doorstep gap), even though the real
//     products exist: 121's Reach/Match/Safety buckets, the profile's
//     starred set and comp floor, a ghost assessment, an eligibility
//     refusal + path, a family-filtered ML set with a tailored
//     packet. Each shape now has its own handler composing from its
//     record. (135's mini-campaign rule text also hardcoded an
//     "8-person sequence" while the record's requested count moved
//     to the ask's own sizing — the rule now speaks the record's
//     number.)
//   BUG-113 — the tailor closing's named-count parse (FR-280 class,
//     second site): "20 PM internships" never matched the
//     "N roles" pattern, so the reply never stated the ask's count
//     or the true staged count (SC-065 H-5).
//   BUG-114 — Apply products carried under keys the completion chain
//     does not read, or with no artifact: the answer bank (bank under
//     answer_bank only, count never stated), the cover letter (the
//     producer's typed refusal rode as cover_letter only), the
//     per-firm fit explainer (prose only), the referral-hold decision
//     (inside packet.hold; and the handler fed the producer
//     placeholder inputs — no contact, no referral-expected flag —
//     so it answered "no referral is expected" to an ask that names
//     Priya's referral), the portal-account step, the
//     prior-application record (no artifact), the rejection autopsy
//     (record under `autopsy` only; reply never stated the named
//     count and tripped H-7 on a rule sentence), and the company-
//     intel answers (payload present, no artifact). Each now carries
//     its record as payload + artifact; run-grand completes them on
//     the records' own elements (flagged CONTRACT in run-grand.cjs).
// Check: node --test tests/career-apply-completion.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-apply-test-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-apply-test-evidence";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const H = L.H;
const CANNED = ["Northwind Ledger", "Lakefront Cloud", "Eastbank Systems", "Copperline Infra", "Fieldnote Software"];

function drive(id, ask) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "apply-fix");
  const turn = L.chatTurn(s, ask, { profile });
  return { r: turn.result || {}, text: (turn.delivered || []).join("\n") };
}
function cannedCount(text) { return CANNED.filter((c) => text.includes(c)).length; }

const A = {
  "SC-063": "Apply to every new-grad SWE role posted in the last 48 hours at my starred companies",
  "SC-065": "Find 20 PM internships for summer; tailor; apply only where I have a real shot",
  "SC-069": "Bucket 38 new-grad roles into Reach / Match / Safety with a one-line reason each",
  "SC-079": "Duplicate protection: I applied manually last week — Gmail check catches it, no double-apply",
  "SC-081": "Workday portal needs an account — create alias email + vault password, disclose it to me",
  "SC-085": "\"Why this company\" answer bank across 6 applications, company parts rewritten every time",
  "SC-086": "Cover letters only where the portal asks; startup voice vs bank voice per company",
  "SC-099": "Referral hold decision: hold the app 48 hours for Priya's referral, or apply now and refer after",
  "SC-100": "No warm path at a dream company — launch a 5–10 person mini outreach campaign instead",
  "SC-106": "Speed run: starred companies' feeds polled; fitting role applied within the hour it posts",
  "SC-109": "Consulting applications: fit answers + impact bullets tailored per firm",
  "SC-110": "Data/ML roles: papers, models, evaluation metrics forward",
  "SC-112": "Career switcher: nurse to data analyst — transferable-skills narrative from real facts only",
  "SC-113": "Weak-profile honesty: quant firms, no math background — refuse to submit; 12-month path + adjacent roles now",
  "SC-115": "\"What happened with my Stripe application?\" — answered from the log and inbox, with proof",
  "SC-116": "Rejection autopsy across 34 applications: the pattern, the plan, no sugarcoating",
  "SC-117": "Starred-company watch: any fitting role at any of my companies pings me in minutes",
  "SC-118": "Salary-band filter: skip roles whose posted band sits under my floor",
  "SC-119": "Ghost-job label: role open 94 days and reposted twice — low odds stated before spending an application",
};

test("SC-063/SC-106/SC-117: the starred watch record — the profile's true (empty) starred set (BUG-112)", () => {
  for (const [id, mode] of [["SC-063", "apply_queue"], ["SC-106", "speed_run"], ["SC-117", "ping"]]) {
    const { r, text } = drive(id, A[id]);
    assert.equal(r.payload && r.payload.kind, "starred_watch", id);
    assert.equal(r.payload.mode, mode, id);
    assert.deepEqual(r.payload.companies, [], `${id}: P1 stars no companies — the record says so`);
    assert.deepEqual(r.payload.matched, [], id);
    assert.ok(r.artifact, `${id}: the watch record is the doorstep artifact`);
    assert.ok(cannedCount(text) < 3, `${id}: no canned shortlist in the reply`);
    assert.match(text, /no starred companies|starred companies on (file|record)/i, `${id}: the empty set is stated, not papered over`);
  }
  const w = drive("SC-063", A["SC-063"]);
  assert.equal(w.r.payload.window_hours, 48);
});

test("SC-069: fit buckets from 121's own Reach/Match/Safety rows (BUG-112)", () => {
  const { r, text } = drive("SC-069", A["SC-069"]);
  assert.equal(r.payload.kind, "fit_buckets");
  assert.equal(r.payload.asked, 38);
  assert.ok(r.payload.total >= 1 && r.payload.total < 38, "the true scored total, below the asked 38");
  const sum = ["Reach", "Match", "Safety"].reduce((n, b) => n + (r.payload.buckets[b] || []).length, 0);
  assert.equal(sum, r.payload.total);
  for (const b of ["Reach", "Match", "Safety"]) for (const row of r.payload.buckets[b] || []) assert.ok(row.title && row.company && typeof row.reason === "string", `bucket row carries title/company/one-line reason`);
  assert.ok(r.artifact);
  assert.ok(cannedCount(text) < 3, "the reply summarizes buckets; it is not the shortlist");
  assert.match(text, /38/);
});

test("SC-119: ghost assessment — the described signals, low odds before any application (BUG-112)", () => {
  const { r, text } = drive("SC-119", A["SC-119"]);
  assert.equal(r.payload.kind, "ghost_assessment");
  assert.equal(r.payload.days_open, 94);
  assert.equal(r.payload.reposts, 2);
  assert.match(r.payload.verdict, /low/i);
  assert.equal(r.payload.excluded_from_apply_counts, true);
  assert.ok(r.artifact);
  assert.ok(cannedCount(text) < 3);
});

test("SC-118: salary filter — the profile's floor is null and the record says so (BUG-112)", () => {
  const { r, text } = drive("SC-118", A["SC-118"]);
  assert.equal(r.payload.kind, "salary_filter");
  assert.equal(r.payload.floor, null);
  assert.equal(r.payload.status, "no_floor_on_file");
  assert.ok(r.artifact);
  assert.ok(cannedCount(text) < 3, "no shortlist served as a filter result");
  assert.match(text, /floor/i);
});

test("SC-113: weak-profile refusal + 12-month path + adjacent roles, as one record (BUG-112)", () => {
  const { r, text } = drive("SC-113", A["SC-113"]);
  assert.equal(r.payload.kind, "weak_profile_plan");
  assert.match(r.payload.refused_family, /quant/i);
  assert.equal(r.payload.path_months, 12);
  assert.ok(Array.isArray(r.payload.path_steps) && r.payload.path_steps.length >= 3);
  assert.ok(Array.isArray(r.payload.adjacent_roles));
  assert.ok(r.artifact);
  assert.ok(cannedCount(text) < 3);
  assert.ok(/\?$/.test(text.trim()) || /Next step/.test(text), "ends with a next step (H-12)");
});

test("SC-110: ML-forward record — family-filtered roles + a tailored packet artifact (BUG-112)", () => {
  const { r, text } = drive("SC-110", A["SC-110"]);
  assert.equal(r.payload.kind, "ml_forward");
  assert.ok(r.payload.roles.length >= 1);
  assert.ok(r.artifact, "the tailored packet for the top ML role is the doorstep artifact");
  assert.ok(!/\d+ roles most worth/.test(text), "no shortlist header composition");
});

test("SC-100: mini-campaign record — the ask's sizing, and the rule text speaks it too (BUG-112)", () => {
  const { r, text } = drive("SC-100", A["SC-100"]);
  assert.equal(r.payload.kind, "mini_campaign");
  assert.equal(r.payload.requested, 10);
  assert.ok(!/8-person/.test(text), "the record's rule text must not contradict the requested count");
  assert.ok(r.payload);
});

test("SC-065: the batch tailor reply states the named count and the true staged count (BUG-113)", () => {
  const { r, text } = drive("SC-065", A["SC-065"]);
  assert.ok(r.artifact, "the tailored packet still ships");
  assert.match(text, /\b20\b/, "the ask's count is stated");
  assert.match(text, /holds \d+|current list holds|staged roles/i, "the true staged/holding count is stated");
});

test("SC-079: the prior-application record is the doorstep artifact (BUG-114)", () => {
  const { r } = drive("SC-079", A["SC-079"]);
  assert.equal(r.intent, "intent_prior_application");
  assert.ok(r.artifact && r.artifact.kind === "prior_application_record" && r.artifact.disclosed === true);
});

test("SC-081: portal-account step carries committed:false as payload + artifact (BUG-114)", () => {
  const { r } = drive("SC-081", A["SC-081"]);
  assert.equal(r.intent, "portal_account");
  assert.equal(r.payload.kind, "portal_account_step");
  assert.equal(r.payload.committed, false);
  assert.ok(r.artifact);
});

test("SC-085: answer-bank record + the named count stated (BUG-114)", () => {
  const { r, text } = drive("SC-085", A["SC-085"]);
  assert.equal(r.payload.kind, "answer_bank");
  assert.deepEqual(r.payload.companies, []);
  assert.ok(r.artifact);
  assert.match(text, /\b6\b/, "H-5: the ask's 6 is addressed");
});

test("SC-086: the cover-letter producer's typed refusal is the record (BUG-114)", () => {
  const { r } = drive("SC-086", A["SC-086"]);
  assert.equal(r.payload.kind, "cover_letter");
  assert.equal(r.payload.ok, false);
  assert.match(r.payload.reason, /never written from invented company facts/);
  assert.ok(r.artifact);
});

test("SC-109: per-firm fit plan record (BUG-114)", () => {
  const { r } = drive("SC-109", A["SC-109"]);
  assert.equal(r.payload.kind, "firm_fit_plan");
  assert.deepEqual(r.payload.firms, []);
  assert.ok(r.artifact);
});

test("SC-099: referral-hold decision from the ask's own inputs — Priya named, ETA unknown (BUG-114)", () => {
  const { r, text } = drive("SC-099", A["SC-099"]);
  assert.equal(r.payload.kind, "referral_hold_decision");
  assert.equal(r.payload.decision, "HOLD_CAPPED");
  assert.equal(r.payload.contact, "Priya");
  assert.match(text, /Priya/);
  assert.ok(!/No referral is expected/.test(text), "the ask names a referral; the answer must not deny it");
});

test("SC-116: autopsy record + named count stated + no bare 'logged' claim (BUG-114)", () => {
  const { r, text } = drive("SC-116", A["SC-116"]);
  assert.equal(r.payload.kind, "rejection_autopsy");
  assert.equal(r.payload.total, 0);
  assert.ok(r.artifact);
  assert.match(text, /\b34\b/, "H-5: the named 34 is addressed");
  assert.ok(!/applications are logged/.test(text), "H-7: rule statements avoid bare claim verbs");
});

test("SC-112/SC-115: intel answers carry their record as the artifact too (BUG-114)", () => {
  // SC-112 stays an intel answer. SC-115 was rerouted by the
  // wording lane (BUG-186, on the capstone judge's S1 row: "What
  // happened with my Stripe application?" is the user's own
  // application status, not the Stripe file) — it now answers from
  // the tracker and carries the 141 doorstep record instead; the
  // BUG-114 carriage rule it must satisfy is payload + artifact on
  // the turn, under its own intent.
  const { r } = drive("SC-112", A["SC-112"]);
  assert.equal(r.intent, "company_intel", "SC-112");
  assert.ok(r.payload && r.artifact, "SC-112: payload + artifact present");
  const s115 = drive("SC-115", A["SC-115"]);
  assert.equal(s115.r.intent, "tracking_status", "SC-115: the status ask is answered from the log, not the company file");
  assert.ok(s115.r.payload || s115.r.doorstep, "SC-115: the tracking record rides the turn");
});
