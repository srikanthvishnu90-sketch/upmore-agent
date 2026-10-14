// Career Referrals completion — the graph family (135) through the real
// chat path (pilot-lib chatTurn: 143 -> 120 -> 130 -> 142 -> 141).
// REPLAYS for BUG-098..BUG-103 (residual lane, 2026-10-14): in the
// true-score run (build a92c882) Referrals scored 0/30 deterministic —
// every record failed SCEN-A4 + STATE_doorstep_gap ('outreach-send').
// Root shapes pinned here:
//   BUG-098 — 142's graph catch handler answered ~16 distinct referral
//     asks with ONE prose template and never called the per-ask 135
//     producers (rankPaths, secondDegreeMap, publicSourceLookup,
//     conversionTracking, topWarmPathSweep, newHireRadar, miniCampaign,
//     pickStrongerPath, referralBonusIntel, mergeIdentities).
//   BUG-099 — handleGraphReferral read planReferralAsk's card as
//     r.draft_card; 135 returns it as r.draft — the named-referral card
//     branch was dead and result.draft was undefined on a prepared card.
//   BUG-100 — forwardableBlurb was called as (ctx.profile) only, which
//     matches NEITHER of 135's two documented shapes, so the blurb
//     refused "no_real_profile_facts" even with confirmed facts on file.
//   BUG-101 — graph handlers returned no typed payload (alumni, memory,
//     intro, departed-empty, keep-warm-empty) or a shape no reader
//     consumes (keep-warm suggestions without held draft cards;
//     referral timing under `timing` only), so no graph turn could
//     present its family's doorstep record.
//   BUG-103 — findPaths rows can carry no shared fact (a bare export
//     connection); doc 03 F4 requires every ranked person to show the
//     ground their path stands on, while IB-2 requires that same
//     connection to BE a live path. 142's record assembly keeps every
//     live row in paths and states each row's basis (shared_fact vs
//     connection, the latter also listed under `cold`) — the populated
//     record then validates F4 without touching 135's engine
//     semantics (pinned by tests/career-graph.test.cjs).
// The completion CONTRACT half (run-grand branches for the family's
// honest terminal records) is BUG-102, flagged in run-grand.cjs; this
// suite pins the PRODUCT elements those branches key on, and validates
// the populated record against doorstep-contracts F4 directly.
// Check: node --test tests/career-referrals-completion.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-referrals-test-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-referrals-test-evidence";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const DC = require(path.join(ROOT, "scripts/career/gauntlet/doorstep-contracts.cjs"));
const H = L.H;

function drive(id, ask, ctxExtra) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "referrals-fix");
  const turn = L.chatTurn(s, ask, Object.assign({ profile }, ctxExtra || {}));
  return { turn, r: turn.result || {}, text: (turn.delivered || []).join("\n") };
}

// Canonical asks, verbatim from the owner's 300 doc (as graded).
const ASKS = {
  "SC-146": "\"Who do I know at Stripe?\" — warm paths from my LinkedIn export",
  "SC-147": "Paths ranked: alumni, then club, major, hometown, then cold — shared fact shown per person",
  "SC-148": "Alumni-directory path when my LinkedIn is thin (40 connections)",
  "SC-149": "Club roster path: my fraternity brothers at target firms",
  "SC-150": "Intro request: a mutual gets a forwardable blurb and the ask, card-approved",
  "SC-151": "Referral ask sent after a good coffee chat — never in email one",
  "SC-152": "My contact submits the referral — tracked onto the right application",
  "SC-153": "Employee lookup from public sources only: GitHub, speakers, team pages",
  "SC-154": "Second-degree map: friends of my first-degree people at the target",
  "SC-155": "Coffee-chat to referral conversion tracked per contact",
  "SC-156": "Relationship memory: \"When did I last talk to Daniel, and what about?\" — full history",
  "SC-157": "Keep-warm: six weeks since a good chat — an update touch suggested with a real reason",
  "SC-158": "Update touch drafted around my new offer or project",
  "SC-159": "Warm-path sweep across my top 10 target companies in one pass",
  "SC-160": "New-hire radar: someone from my school just joined a target — flagged as the warmest path",
  "SC-161": "Referral-bonus intel: which targets pay them (engineers answer those asks more)",
  "SC-162": "Forwardable blurb: three lines about me, built only from my real profile",
  "SC-163": "Thank-you plus referral combo after a chat where they offered to refer",
  "SC-164": "Revive a dormant contact from last season — honestly, with a real update",
  "SC-165": "My only contact left the firm — find the next path, don't write to the departed blindly",
  "SC-166": "Professor path: my professor worked at the target — draft the ask",
  "SC-167": "Family-friend path from my pasted contacts — extra care in tone, my yes",
  "SC-168": "Referral timing: apply now or wait 48 hours — decided from the real deadline",
  "SC-169": "Two paths into one company — pick the stronger; don't burn both",
  "SC-170": "Mini-campaign at one company: 8 people sequenced warm to cold",
  "SC-171": "Contact sits at my current employer — excluded by default, and I hear why",
  "SC-172": "Recruiter vs practitioner at the same firm — different asks, drafted accordingly",
  "SC-173": "Alumni in a different city than the role — warmth ranked honestly, not inflated",
  "SC-174": "Same person found in three sources — merged to one record, never double-sent",
  "SC-175": "\"Get me referred at Datadog\" — end to end: path, ask, referral submitted, tracked",
};

// Every graph turn must carry its typed record (BUG-101): no payload-less
// graph result may ever ship again.
for (const [id, ask] of Object.entries(ASKS)) {
  test(`${id}: graph turn carries a typed payload record`, () => {
    const { r } = drive(id, ask);
    assert.ok(/^graph_/.test(r.intent || ""), `${id}: intent is a graph intent (got ${r.intent})`);
    assert.ok(r.payload && typeof r.payload === "object", `${id}: result.payload is the typed graph record`);
    assert.equal(r.sends || 0, 0, `${id}: nothing sends`);
  });
}

test("SC-146: empty-graph findPaths record is the carried product (BUG-101/102 elements)", () => {
  const { r, text } = drive("SC-146", ASKS["SC-146"]);
  assert.equal(r.intent, "graph_paths");
  assert.equal(r.payload.kind, "graph_paths");
  assert.equal(r.payload.company, "Stripe");
  assert.deepEqual(r.payload.paths, []);
  assert.ok(Array.isArray(r.payload.excluded) && Array.isArray(r.payload.draft_cards));
  assert.equal(r.payload.graph_people, 0);
  assert.ok(!/^No[ —,]/m.test(text), "the reply must not open as a bare refusal (REFUSAL_NO_ALTERNATIVE shape)");
});

test("SC-147: rankPaths producer record with the pinned tier order (BUG-098)", () => {
  const { r } = drive("SC-147", ASKS["SC-147"]);
  assert.equal(r.payload.kind, "graph_paths");
  assert.deepEqual(r.payload.ranking_order, ["alumni", "club", "major", "hometown", "cold"]);
  assert.deepEqual(r.payload.paths, []);
});

test("SC-148: alumni lane record — school named, scraping refused in the record (BUG-101)", () => {
  const { r } = drive("SC-148", ASKS["SC-148"]);
  assert.equal(r.intent, "graph_alumni");
  assert.equal(r.payload.lane, "alumni_directory");
  assert.equal(r.payload.scrape, false);
  assert.equal(typeof r.payload.graph_people, "number");
});

test("SC-149: club-roster record is club-filtered (BUG-098)", () => {
  const { r } = drive("SC-149", ASKS["SC-149"]);
  assert.equal(r.payload.kind, "graph_paths");
  assert.equal(r.payload.filter, "club");
  assert.deepEqual(r.payload.paths, []);
});

test("SC-150: intro card held, carrying the REAL blurb built from confirmed facts (BUG-100/101)", () => {
  const { r } = drive("SC-150", ASKS["SC-150"]);
  assert.equal(r.intent, "graph_intro");
  assert.equal(r.payload.kind, "intro_card");
  assert.equal(r.payload.status, "held");
  assert.equal(r.payload.blurb && r.payload.blurb.ok, true);
  assert.ok((r.payload.blurb.fact_ids || []).length >= 2, "the blurb cites the facts it was built from");
});

test("SC-151/SC-168: referral timing record is the payload (BUG-101)", () => {
  for (const id of ["SC-151", "SC-168"]) {
    const { r } = drive(id, ASKS[id]);
    assert.equal(r.intent, "graph_referral");
    assert.equal(r.payload.kind, "referral_timing");
    assert.equal(r.payload.decision, "ASK");
    assert.equal(typeof r.payload.hold_hours, "number");
  }
});

test("SC-152: referral-tracking record states the empty lifecycle honestly (BUG-098)", () => {
  const { r } = drive("SC-152", ASKS["SC-152"]);
  assert.equal(r.payload.kind, "referral_track");
  assert.equal(r.payload.referrals_on_record, 0);
});

test("SC-153/SC-154: lookup + second-degree producers run and carry records (BUG-098)", () => {
  const a = drive("SC-153", ASKS["SC-153"]);
  assert.equal(a.r.payload.producer, "publicSourceLookup");
  assert.deepEqual(a.r.payload.paths, []);
  const b = drive("SC-154", ASKS["SC-154"]);
  assert.equal(b.r.payload.producer, "secondDegreeMap");
  assert.deepEqual(b.r.payload.paths, []);
});

test("SC-155: conversion tracking record (BUG-098)", () => {
  const { r } = drive("SC-155", ASKS["SC-155"]);
  assert.equal(r.payload.kind, "conversion_tracking");
  assert.equal(r.payload.contacts_with_chats, 0);
  assert.deepEqual(r.payload.per_contact, []);
});

test("SC-156: relationship-memory record carried; reply does not open as a bare refusal (BUG-101)", () => {
  const { r, text } = drive("SC-156", ASKS["SC-156"]);
  assert.equal(r.intent, "graph_memory");
  assert.ok(r.memory && typeof r.memory.found === "boolean" && Array.isArray(r.memory.history));
  assert.equal(r.memory.found, false);
  assert.ok(!/^No[ —,]/m.test(text));
});

test("SC-157/SC-158/SC-164: keep-warm record carries suggestions + graph size (BUG-101)", () => {
  for (const id of ["SC-157", "SC-158", "SC-164"]) {
    const { r } = drive(id, ASKS[id]);
    assert.equal(r.intent, "graph_keep_warm", `${id} routes to keep-warm`);
    assert.ok(Array.isArray(r.payload.suggestions), `${id}: suggestions ride the payload`);
    assert.deepEqual(r.payload.suggestions, []);
    assert.equal(r.payload.graph_people, 0);
  }
});

test("SC-159: sweep record names the companies checked (BUG-098)", () => {
  const { r } = drive("SC-159", ASKS["SC-159"]);
  assert.equal(r.payload.kind, "graph_paths");
  assert.ok(Array.isArray(r.payload.companies_checked) && r.payload.companies_checked.length >= 1);
  assert.deepEqual(r.payload.paths, []);
});

test("SC-160: new-hire radar record (BUG-098)", () => {
  const { r } = drive("SC-160", ASKS["SC-160"]);
  assert.equal(r.payload.kind, "new_hire_radar");
  assert.deepEqual(r.payload.flagged, []);
});

test("SC-161: referral-bonus intel record — sourced rows, no invented amounts (BUG-098)", () => {
  const { r } = drive("SC-161", ASKS["SC-161"]);
  assert.equal(r.payload.kind, "referral_bonus_intel");
  assert.ok(Array.isArray(r.payload.rows) && r.payload.rows.length >= 1, "rows ride for the companies on file");
  assert.equal(r.payload.sourced_bonus_count, 0);
  assert.ok(r.payload.rows.every((x) => x.bonus_amount === null), "no CIR carries an amount, so none may be reported");
});

test("SC-162: the blurb builds from the profile's confirmed facts (BUG-100)", () => {
  const { r } = drive("SC-162", ASKS["SC-162"]);
  assert.equal(r.intent, "graph_blurb");
  assert.equal(r.blurb && r.blurb.ok, true);
  assert.ok((r.blurb.fact_ids || []).length >= 2);
  assert.match(r.blurb.blurb, /TEST University/);
});

test("SC-163: thank-you combo premise record — 135's own refusal, typed (BUG-098)", () => {
  const { r } = drive("SC-163", ASKS["SC-163"]);
  assert.equal(r.payload.kind, "thankyou_combo");
  assert.equal(r.payload.ok, false);
  assert.equal(r.payload.reason, "no_referral_offer_on_record");
});

test("SC-165: departed-path record carried on the empty graph too (BUG-101)", () => {
  const { r } = drive("SC-165", ASKS["SC-165"]);
  assert.equal(r.intent, "graph_paths");
  assert.equal(r.payload.kind, "graph_paths");
  assert.ok("departed" in r.payload);
});

test("SC-166/SC-167: professor + family-friend filtered records (BUG-098)", () => {
  assert.equal(drive("SC-166", ASKS["SC-166"]).r.payload.filter, "professor");
  assert.equal(drive("SC-167", ASKS["SC-167"]).r.payload.filter, "family_friend");
});

test("SC-169: stronger-path pick record rides beside the paths envelope (BUG-098)", () => {
  const { r } = drive("SC-169", ASKS["SC-169"]);
  assert.equal(r.payload.kind, "graph_paths");
  assert.ok(r.payload.stronger_pick && r.payload.stronger_pick.chosen === null);
});

test("SC-170: mini-campaign record + the reply states the true count (BUG-098, H-5)", () => {
  const { r, text } = drive("SC-170", ASKS["SC-170"]);
  assert.equal(r.payload.kind, "mini_campaign");
  assert.equal(r.payload.requested, 8);
  assert.deepEqual(r.payload.sequence, []);
  assert.ok(/\b8\b/.test(text) && /\b0\b/.test(text), "the reply states the asked count and the true count found");
});

test("SC-171: current-employer exclusion rule is on the record (BUG-098)", () => {
  const { r } = drive("SC-171", ASKS["SC-171"]);
  assert.equal(r.payload.kind, "graph_paths");
  assert.ok(r.payload.exclusion_rule && r.payload.exclusion_rule.current_employer_excluded_by_default === true);
});

test("SC-172: recruiter-vs-practitioner kinds computed per person (BUG-098)", () => {
  const { r } = drive("SC-172", ASKS["SC-172"]);
  assert.equal(r.payload.kind, "graph_paths");
  assert.ok(Array.isArray(r.payload.ask_kinds));
});

test("SC-173: cross-city discount is on the record, disclosed (BUG-098)", () => {
  const { r } = drive("SC-173", ASKS["SC-173"]);
  assert.equal(r.payload.kind, "graph_paths");
  assert.equal(r.payload.cross_city_rule && r.payload.cross_city_rule.delta, -15);
});

test("SC-174: merge record — the dedupe engine's own counts (BUG-098)", () => {
  const { r } = drive("SC-174", ASKS["SC-174"]);
  assert.equal(r.payload.kind, "graph_merge");
  assert.equal(r.payload.input_count, 0);
  assert.equal(r.payload.merged_count, 0);
});

test("SC-175: end-to-end ask lands on the findPaths record for the named firm (BUG-101)", () => {
  const { r, text } = drive("SC-175", ASKS["SC-175"]);
  assert.equal(r.intent, "graph_paths");
  assert.equal(r.payload.company, "Datadog");
  assert.ok(!/^No[ —,]/m.test(text));
});

// ---- populated-world drives: the same records, with a real graph --------
test("populated SC-146: the carried record VALIDATES the F4 doorstep contract (BUG-103)", () => {
  const contacts = [
    { full_name: "Alum Person (TEST)", current_firm: "Stripe", title: "Software Engineer", schools: ["TEST University"], relationship_to_user: "alumni" },
    { full_name: "Gone Person (TEST)", current_firm: "Stripe", title: "Software Engineer", schools: ["TEST University"], at_company: false, departed_at: "2026-08" },
    { full_name: "Cold Person (TEST)", current_firm: "Stripe", title: "Designer" },
  ];
  const { r } = drive("SC-146", ASKS["SC-146"], { contacts });
  const v = DC.validate("F4", r.payload);
  assert.equal(v.valid, true, `F4 must validate on the populated record — missing: ${v.missing.join(",")} invalid: ${JSON.stringify(v.invalid)}`);
  assert.equal(r.payload.paths.length, 2, "both live connections are paths (IB-2); the departed one is not");
  assert.equal(r.payload.paths[0].name, "Alum Person (TEST)");
  assert.equal(r.payload.paths[0].basis, "shared_fact");
  assert.equal(r.payload.cold.length, 1, "the zero-fact connection is ALSO listed as cold, basis stated");
  assert.equal(r.payload.cold[0].name, "Cold Person (TEST)");
  assert.equal(r.payload.cold[0].basis, "connection");
  assert.match(r.payload.cold[0].why[0], /connection itself is the path/);
  assert.equal(r.payload.excluded.length, 1, "the departed contact is excluded by the check");
  assert.equal(r.payload.graph_people, 3);
});

test("populated referral: a named ask after a held chat surfaces the DRAFT (BUG-099)", () => {
  const contacts = [{ full_name: "Daniel Reyes (TEST)", current_firm: "Datadog", title: "Software Engineer", stage: "chatted", chats: 1 }];
  const { r } = drive("SC-151X", "Prepare the referral ask from Daniel", { contacts });
  assert.equal(r.intent, "graph_referral");
  assert.equal(r.payload && r.payload.ok, true);
  assert.ok(r.draft && typeof r.draft.body === "string" && r.draft.body.length > 20, "the prepared draft card rides result.draft");
});

test("populated keep-warm: a due contact yields a suggestion AND its held draft card (BUG-101)", () => {
  const contacts = [{ full_name: "Warm Person (TEST)", current_firm: "Datadog", title: "Engineer", stage: "chatted", chats: 1, last_contact_at: "2026-08-20T00:00:00Z" }];
  const { r } = drive("SC-157", ASKS["SC-157"], { contacts });
  assert.equal(r.payload.suggestions.length, 1);
  assert.equal(r.payload.draft_cards.length, 1);
  assert.equal(r.payload.draft_cards[0].held_as_card, true);
  assert.equal(r.payload.draft_cards[0].status, "held");
});
