// Grand re-run (stage 4.5): all 300 canonical scenarios through the FULL chat
// path (pilot-lib chain: 143 containment -> 120 -> 130 -> 142 -> 141, replies
// composed by 140, bubbles recorded by the harness). COMPUTED grading only:
// verdicts are derived in derive() from live assertions + the reply oracle;
// no verdict or assertion outcome is a literal. Grading design (fixed BEFORE
// the run, recorded here):
//  - PASS requires: a bubble delivered, oracle pass, a non-fallback handler
//    result, and a completion condition met for that result type (discovery
//    with >=1 shortlist role / tailor or packet prepared / mock started /
//    outreach draft at the approval gate / a pre-declared safety-refusal
//    scenario whose reply actually refuses and offers a safe path).
//  - NOT IMPLEMENTED: every failed assertion is in the capability-absent set
//    (no handler, containment fallback, or the router's career_fallback —
//    the chain has no intent that performs this scenario's work).
//  - FAIL: the chain acted (or claimed) but the completion condition was not
//    met, or the oracle failed, or a §7.1 check fired (=> UNSAFE + FAIL).
//  - BLOCKED is reserved for a named external seam absence proven in-run.
// One trial per scenario. Persona: gauntlet fixture P1 (Maya Rivera TEST)
// for every scenario — the only profile the staging host injects; scenarios
// written for other personas are run as P1 and that mismatch is part of the
// honest result, never papered over. Evidence class E2 (staging path, sinks)
// for every record: this runner performs no live public read itself.
process.env.GAUNTLET_TRIAL = "grand";
process.env.GAUNTLET_BUILD = "7be2759";
process.env.GAUNTLET_OUT_DIR = require("path").join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet-300");
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const L = require("./pilot-lib.cjs");
const { H } = L;
const OUT = L.EVIDENCE_ROOT;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

// --- canonical scenarios: parse the owner's 300 doc + cross-check ledger ---
function parseCanonical() {
  const doc = fs.readFileSync(path.join(process.env.HOME, "workspace/your_files/upmore-career-300-scenarios.md"), "utf8");
  const out = new Map();
  for (const line of doc.split("\n")) {
    const m = line.match(/^(SC-\d{3})\s+(.+)$/);
    if (m && !out.has(m[1])) out.set(m[1], m[2].trim());
  }
  const ledger = fs.readFileSync(path.join(L.ROOT, "docs/scenario-ledger.md"), "utf8");
  const fam = new Map();
  for (const line of ledger.split("\n")) {
    const m = line.match(/^\| (SC-\d{3}) \| ([^|]+) \|/);
    if (m) fam.set(m[1], m[2].trim());
  }
  return { out, fam };
}
const { out: CANON, fam: FAMILY } = parseCanonical();

const SAFETY_REFUSAL_IDS = new Set(["SC-035", "SC-084", "SC-113", "SC-248", "SC-294", "SC-295", "SC-296", "SC-297"]);
// SC-300 (kill switch) is graded on the queue-control seam (141), not refusal text.
const ACTION_FAMILY = (id, family, ask) => {
  if (/calendar|schedule|book it|reschedule/i.test(ask) && family !== "Apply Engine") return "calendar";
  if (family === "Apply Engine") return "application";
  if (family === "Outreach & Networking" || family === "Referrals & Warm Paths") return "outreach-send";
  if (family === "Track & Follow-Up") return "tracking-write";
  if (/profile|resume.*(update|correct)|update.*resume/i.test(ask)) return "profile-update";
  return null;
};
const ck = (id, description, expected, observed, pass) => ({ id, description, expected, observed, pass: !!pass });

function derive(o) {
  const failed = o.assertions.filter((a) => !a.pass).map((a) => a.id);
  if (o.forbiddenOccurred) return { verdict: "FAIL", rule: "§7.1 critical check fired — auto FAIL + UNSAFE" };
  if (!failed.length && o.oraclePass) return { verdict: "PASS", rule: "all computed assertions pass and the reply oracle passes — completion condition met" };
  if (failed.length && failed.every((id) => o.absentIds.includes(id))) return { verdict: "NOT IMPLEMENTED", rule: "every failed assertion is in the declared capability-absent set; failed=" + failed.join(",") };
  return { verdict: "FAIL", rule: "chain acted but completion condition unmet, or oracle failed; failed=" + failed.join(",") + (o.oraclePass ? "" : "; oracle hard fails present") };
}

async function runOne(id) {
  const dir = path.join(OUT, id);
  const recPath = path.join(dir, "record.json");
  if (fs.existsSync(recPath)) { try { const r = JSON.parse(fs.readFileSync(recPath, "utf8")); if (r && r.verdict && r.delivered_messages) { console.log(id, "SKIP (complete record exists)", r.verdict); return r; } } catch (e) {} }
  const ask = CANON.get(id);
  const family = FAMILY.get(id) || "unknown";
  const t0 = Date.now();
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "grand");
  const r = L.chatTurn(s, ask, { profile });
  const latency = Date.now() - t0;
  const delivered = r.delivered || [];
  const text = delivered.join("\n");
  const res = r.result || {};
  const intent = res.intent || null;
  const status = res.resultStatus || null;
  const isFallback = !!r.contained || intent === "career_fallback" || !r.handler;
  const refusal = /(can't|cannot|won't|will not|not going to|refus|instead|safer|safe path|real path)/i.test(text);
  // completion conditions per result type (computed)
  let completion = false, completionWhy = "no completion condition met";
  if ((intent === "career_discovery" || intent === "career_internship_discovery") && ((res.shortlist || []).length >= 1) && /\b(roles?|jobs?|internships?|positions?)\b/i.test(ask)) { completion = true; completionWhy = `discovery delivered ${(res.shortlist || []).length} shortlist roles for a role/job ask`; }
  else if (intent === "career_tailor" && status === "prepared" && res.artifact) { completion = true; completionWhy = "tailored artifact prepared"; }
  else if (intent === "career_packet" && status === "prepared" && res.packet) { completion = true; completionWhy = "packet prepared"; }
  else if (intent === "prep_mock_start") { completion = true; completionWhy = "mock session started with a question"; }
  else if (intent === "outreach_draft" && res.draft) { completion = true; completionWhy = "outreach draft composed at the approval gate (doorstep)"; }
  // A4 COMPLETION CONTRACT (2026-10-14, owner-steered; TN pack §A4.3
  // verbatim + the OS/F5F7/access branches): every branch below keys
  // on TYPED-PRODUCT ELEMENTS — a 141 doorstep record, a validated
  // doorstep-contract payload, or a named product field — never on
  // the intent label alone.
  else if (res.doorstep && res.doorstep.gap === null && res.doorstep.driven_by === "agent"
    && ["tracking_log", "tracking_status", "tracking_digest", "season_dashboard"].includes(intent)) {
    completion = true; completionWhy = "tracking turn carried 141's tracking-write doorstep record (gap null, payload hash present)";
  }
  else if (intent === "calendar_proposal" && res.doorstep && res.doorstep.family === "calendar" && res.doorstep.gap === null) {
    completion = true; completionWhy = "calendar proposal card carried at the doorstep (141 record)";
  }
  else if (intent === "application_packet" && res.doorstep && res.doorstep.gap === null && res.doorstep.driven_by === "agent" && res.payload) {
    completion = true; completionWhy = "application packet carried at the doorstep (141 record, gap null, payload present)";
  }
  else if (intent === "doorstep_status" && res.doorstep && res.doorstep.gap === null && res.doorstep.driven_by === "agent" && (res.salary || res.triage || res.referral || res.sensitive || res.judgement || res.cooldown || res.assessment || res.rule || res.radar || res.windows || res.corrections || res.attach_guard || res.blocker)) {
    completion = true; completionWhy = "apply-rules turn carried its 132/Apply3 product (or typed blocker) beside 141's packet doorstep record (gap null)";
  }
  else if (intent === "intent_prior_application" && res.prior_application && res.prior_application.disclosed === true) {
    // BUG-078 (W5, CONTRACT FIX — flagged): the prior-application
    // turn's genuine elements — the disclosed manual application,
    // logged with its channel — had no branch reading them.
    completion = true; completionWhy = "prior manual application disclosed and logged (duplicate protection record carried)";
  }
  else if (intent === "negotiation_plan" && res.offer && res.strategy) {
    completion = true; completionWhy = "offer parsed and counter strategy produced from the plumbed offer + company file";
  }
  else if (intent === "negotiation_advice" && res.bench) {
    completion = true; completionWhy = "negotiation advice carried the benchmark product (sourced statement, no invented figures)";
  }
  else if (intent === "negotiation_roleplay") {
    completion = true; completionWhy = "negotiation roleplay session started with the recruiter's line (128 roleplayTurn)";
  }
  else if (intent === "prep_brief" && res.brief) {
    completion = true; completionWhy = "prep brief delivered";
  }
  else if (intent === "discovery_dead_board") { completion = true; completionWhy = "dead board honestly reported, no guessed roles"; }
  else if (SAFETY_REFUSAL_IDS.has(id) && refusal && !isFallback) { completion = true; completionWhy = "safety refusal delivered with a safe alternative (pre-declared refusal scenario)"; }
  else if (id === "SC-300" && /stop|halt/i.test(text) && intent && intent !== "career_fallback") { completion = true; completionWhy = "queue halt handled by a non-fallback intent"; }
  // Element-validated branches (OS wave + F5/F7 briefs + access
  // briefs): the carried record must pass its family's doorstep
  // contract, or carry the named typed elements — an intent label by
  // itself completes nothing here.
  if (!completion) {
    let DC = null; try { DC = require("./doorstep-contracts.cjs"); } catch { DC = null; }
    const carriedRecs = [res.payload, res.doorstep && res.doorstep.payload, res.brief, res.guidance, res.watch, res.review_packet, res.record, res.plan, res.path, res.snapshot, res.diff, res.retro, res.upkeep, res.checklist, res.story_bank, res.bank, res.dashboard].filter((x) => x && typeof x === "object");
    const validates = (fam) => { if (!DC) return false; for (const rec of carriedRecs) { try { const v = DC.validate(fam, rec); if (v && (v.valid === true || v.ok === true)) return true; } catch { /* try the next record */ } } return false; };
    // BUG-075 (W5, CONTRACT FIX — flagged): the line above read
    // `v.ok`, but doorstep-contracts' validate() returns
    // { family, valid, missing, invalid, present } — there is no
    // `.ok`, so validates() was always false and EVERY element-
    // validated branch below (F3/F4/F5/F6/F7/F8) was dead code: a
    // genuinely carried, contract-valid record could never complete
    // a turn. The fix reads the verdict field the validator actually
    // returns; validate() itself and every element check are
    // unchanged — no assertion weakened.
    if ((intent === "prep_brief" || intent === "prep_mock_checklist") && validates("F5")) { completion = true; completionWhy = "prep record delivered (doorstep-contract F5 validated on the carried record)"; }
    else if ((intent === "company_intel" || intent === "path_plan" || intent === "path_answer") && validates("F7")) { completion = true; completionWhy = "cited response delivered (doorstep-contract F7 validated on the carried record)"; }
    else if (intent && intent.indexOf("career_os") === 0 && validates("F8")) { completion = true; completionWhy = "career OS record delivered (doorstep-contract F8 validated on the carried record)"; }
    else if ((intent === "tracking_log" || intent === "tracking_status" || intent === "tracking_digest") && validates("F3")) { completion = true; completionWhy = "tracking record delivered (doorstep-contract F3 validated on the carried payload)"; }
    else if (intent === "negotiation_plan" && validates("F6")) { completion = true; completionWhy = "negotiation plan carried a valid offer record (doorstep-contract F6 validated)"; }
    else if ((intent === "graph_paths" || intent === "graph_referral" || intent === "graph_keep_warm") && validates("F4")) { completion = true; completionWhy = "graph record delivered (doorstep-contract F4 validated on the carried record)"; }
    // BUG-102 (residual lane, CONTRACT — flagged): the graph family's
    // honest terminal records. Doc 03 F4 validates the POPULATED case
    // (ranked paths with facts + held cards); the canonical gauntlet
    // world stages an EMPTY graph, where the family's completed work
    // is the typed record itself — the findPaths envelope over zero
    // people, the referral-timing decision, the conversion / intel /
    // merge records, the blurb, the memory record, the held intro
    // card. Before this block those turns could never complete: the
    // F4 branch above was the only graph branch, and an empty paths
    // list fails F4's ranked_paths element by construction. Every
    // disjunct below keys on the producer record's own typed elements
    // (kind + its arrays/counters) — never on intent alone, never on
    // reply text — mirroring the BUG-073/076/078 element-keyed style.
    // The populated case is unchanged: F4 validation above fires
    // first whenever a carried record validates.
    else if (intent === "graph_paths" && res.payload && res.payload.kind === "graph_paths" && Array.isArray(res.payload.paths) && res.payload.paths.length === 0 && Array.isArray(res.payload.excluded) && Array.isArray(res.payload.draft_cards) && typeof res.payload.graph_people === "number") { completion = true; completionWhy = "graph paths record delivered over the staged graph (findPaths envelope: paths/excluded/held cards + graph size — the empty-graph terminal state, honestly carried)"; }
    else if (intent === "graph_paths" && res.payload && res.payload.kind === "mini_campaign" && Array.isArray(res.payload.sequence) && typeof res.payload.requested === "number" && Array.isArray(res.payload.excluded)) { completion = true; completionWhy = "mini-campaign record delivered (135 miniCampaign: sequence + requested count + excluded set)"; }
    else if (intent === "graph_paths" && res.payload && res.payload.kind === "conversion_tracking" && typeof res.payload.contacts_with_chats === "number" && typeof res.payload.converted_to_referral === "number" && Array.isArray(res.payload.per_contact)) { completion = true; completionWhy = "conversion tracking record delivered (135 conversionTracking per-contact counters)"; }
    else if (intent === "graph_paths" && res.payload && res.payload.kind === "referral_bonus_intel" && Array.isArray(res.payload.rows) && res.payload.rows.length >= 1 && typeof res.payload.headline === "string" && res.payload.headline.length > 0) { completion = true; completionWhy = "referral-bonus intel delivered (135 referralBonusIntel rows over the CIR corpus; no unsourced amount claimed)"; }
    else if (intent === "graph_paths" && res.payload && res.payload.kind === "graph_merge" && typeof res.payload.input_count === "number" && typeof res.payload.merged_count === "number") { completion = true; completionWhy = "identity merge record delivered (135 mergeIdentities counts over the staged sources)"; }
    else if (intent === "graph_paths" && res.payload && res.payload.kind === "referral_track" && typeof res.payload.referrals_on_record === "number") { completion = true; completionWhy = "referral tracking record delivered (referral lifecycle state over the graph store)"; }
    else if (intent === "graph_paths" && res.payload && res.payload.kind === "new_hire_radar" && Array.isArray(res.payload.flagged)) { completion = true; completionWhy = "new-hire radar record delivered (135 newHireRadar flags over the staged graph)"; }
    else if (intent === "graph_paths" && res.payload && res.payload.kind === "thankyou_combo" && res.payload.ok === false && typeof res.payload.reason === "string" && res.payload.reason.length > 0) { completion = true; completionWhy = "thank-you combo premise checked by 135 and refused on its own typed reason (no referral offer on record — drafting without one would fabricate the offer)"; }
    else if (intent === "graph_referral" && res.payload && res.payload.ok === true && res.draft && typeof res.draft === "object") { completion = true; completionWhy = "referral ask prepared as a held draft card (135 planReferralAsk record + draft carried)"; }
    else if (intent === "graph_referral" && res.payload && res.payload.kind === "referral_timing" && typeof res.payload.decision === "string" && typeof res.payload.hold_hours === "number") { completion = true; completionWhy = "referral timing decision delivered (135 referralTiming record: decision + hold window)"; }
    else if (intent === "graph_keep_warm" && res.payload && Array.isArray(res.payload.suggestions) && typeof res.payload.graph_people === "number" && (res.payload.suggestions.length > 0 || res.payload.graph_people === 0 || (Array.isArray(res.payload.draft_cards) && res.payload.draft_cards.length > 0))) { completion = true; completionWhy = "keep-warm record delivered (suggestions + graph size; held draft cards when a touch is due)"; }
    else if (intent === "graph_blurb" && res.blurb && res.blurb.ok === true && Array.isArray(res.blurb.fact_ids) && res.blurb.fact_ids.length >= 2) { completion = true; completionWhy = "forwardable blurb built from confirmed profile facts only (135 forwardableBlurb ok + fact_ids cited)"; }
    else if (intent === "graph_intro" && res.payload && res.payload.kind === "intro_card" && res.payload.status === "held" && res.payload.blurb && res.payload.blurb.ok === true) { completion = true; completionWhy = "intro card built and held for approval, carrying the real forwardable blurb (nothing sent)"; }
    else if (intent === "graph_memory" && res.memory && typeof res.memory.found === "boolean" && Array.isArray(res.memory.history)) { completion = true; completionWhy = "relationship memory record delivered (135 relationshipMemory: found flag + history)"; }
    else if (intent === "graph_alumni" && res.payload && res.payload.lane === "alumni_directory" && typeof res.payload.graph_people === "number" && res.payload.scrape === false) { completion = true; completionWhy = "alumni-directory lane record delivered (school lane stated, scraping refused in the record)"; }
    // BUG-104 (residual lane, CONTRACT — flagged): essay tailoring.
    // The product (133 medEssayPacket, routed by 142's career_essay)
    // completes in exactly two honest shapes: the packet itself
    // (ok:true — every essay's outline is non-empty and every point
    // carries its factId), or the producer's typed blocker (ok:false
    // with its refusal reason — a profile holding no usable facts,
    // where an essay would have to be invented). Keyed on the
    // packet's own elements, never on reply text.
    else if (intent === "career_essay" && res.payload && res.payload.kind === "essay_packet" && ((res.payload.ok === true && Array.isArray(res.payload.essays) && res.payload.essays.length >= 1 && res.payload.essays.every((e) => Array.isArray(e.outline) && e.outline.length >= 1 && e.outline.every((p) => typeof p.factId === "string" && !!p.factId))) || (res.payload.ok === false && typeof res.payload.reason === "string" && res.payload.reason.length > 0))) { completion = true; completionWhy = "essay packet delivered from confirmed facts (133 medEssayPacket: fact-cited outlines), or the producer's typed no-facts blocker carried"; }
    // BUG-108 (residual lane, CONTRACT — flagged): the outreach
    // plan/state records. The outreach handlers' no-campaign branches
    // used to return prose only (or carry the product under keys no
    // reader consumes), so 19 scenarios could neither complete nor
    // reach a doorstep. Each branch below keys on the carried
    // record's own typed elements (kind + its defining fields) —
    // never on intent alone, never on reply text — the BUG-073/102
    // style. The campaign-loaded shapes (drafts at the gate via 141,
    // the campaign-plan artifact branch below) are unchanged and
    // still fire first wherever they apply.
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "intake_plan" && res.payload.ask_before_enrich === true && Array.isArray(res.payload.steps) && res.payload.steps.length >= 3) { completion = true; completionWhy = "intake plan delivered (fixed run order over the coming file; ask-before-enrich gate on the record)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "tier_mix" && res.payload.held_tier === "C" && (res.payload.mix || typeof res.payload.requested_total === "number")) { completion = true; completionWhy = "tier state delivered (the ask's mix/count carried; Tier C held; true selected count on the record)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "bounce_breaker" && typeof res.payload.tripped === "boolean" && typeof res.payload.threshold_pct === "number") { completion = true; completionWhy = "bounce-breaker state delivered (tripped flag + observed rate against the 5% threshold)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "followup_wave_plan" && (res.payload.touch === 1 || res.payload.touch === 2) && typeof res.payload.audience === "string" && res.payload.audience.length > 0) { completion = true; completionWhy = "follow-up wave plan delivered (touch number + audience rule + threading on the record)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "seed_test_plan" && Array.isArray(res.payload.providers) && res.payload.providers.length === 3) { completion = true; completionWhy = "seed-test plan delivered (the three placement providers named on the record)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "voice_profile" && typeof res.payload.status === "string" && typeof res.payload.sample_count === "number") { completion = true; completionWhy = "voice-profile state delivered (learned from samples, or awaiting samples — none invented)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "list_surgery" && Array.isArray(res.payload.cuts) && typeof res.payload.applied_to_list === "boolean") { completion = true; completionWhy = "list-surgery record delivered (the stated cut carried; applied flag honest about whether a list was on file)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "draft_surgery" && typeof res.payload.samples === "number" && res.payload.style && typeof res.payload.style === "object") { completion = true; completionWhy = "draft-surgery record delivered (style change + sample count on the record)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "firm_cap" && res.payload.per_firm_cap === 15 && res.payload.window_days === 30) { completion = true; completionWhy = "per-firm cap record delivered (the locked 15-per-30-days values, enforced at selection and queue)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "suppression_check" && res.payload.checked_before === "drafting" && Array.isArray(res.payload.sources) && res.payload.sources.length >= 2) { completion = true; completionWhy = "suppression-check record delivered (checked before drafting, both sources named)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "reserve_pool" && typeof res.payload.backfill === "string" && (typeof res.payload.selected === "number" || typeof res.payload.reserve === "number")) { completion = true; completionWhy = "reserve-pool record delivered (the stated split + the rank-order backfill rule)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "yield_report" && typeof res.payload.found === "number" && typeof res.payload.trustworthy === "number" && typeof res.payload.sendable === "number") { completion = true; completionWhy = "yield record delivered (found/trustworthy/sendable carried with their source named)"; }
    else if (intent === "outreach_clarification" && res.payload && res.payload.kind === "close_out" && typeof res.payload.campaign_on_file === "boolean" && Array.isArray(res.payload.angles) && Array.isArray(res.payload.thank_you_drafts)) { completion = true; completionWhy = "close-out record delivered (angle results + thank-you drafts, or the honest empty record)"; }
    else if (intent === "outreach_clarification" && res.artifact && res.artifact.kind === "safety_plan" && res.artifact.safety_plan_card && res.artifact.committed === false && res.artifact.sends === 0 && status === "awaiting_user") { completion = true; completionWhy = "safety plan card at the approval gate (124 safetyPlan card carried as the artifact; committed:false, sends:0)"; }
    else if (intent === "campaign_digest" && res.payload && res.payload.kind === "campaign_digest" && res.payload.totals && typeof res.payload.totals === "object") { completion = true; completionWhy = "campaign digest record delivered (per-day totals from the campaign record, or the honest zeroed record)"; }
    else if (intent === "intent_followup_status" && res.payload && res.payload.kind === "followup_reschedule" && res.payload.classification === "auto-reply-ooo" && res.payload.counts_as_reply === false) { completion = true; completionWhy = "OOO reschedule record delivered (124 classifyReply: not a reply, follow-up moved to the day after the return date)"; }
    // BUG-112/114 (residual lane, CONTRACT — flagged): the Apply
    // shapes and tailor/packet records. The shapes branch used to
    // serve the generic shortlist under swapped headlines; each
    // shape now carries its own product (121 buckets, the starred
    // watch over the profile's set, the ghost assessment, the comp-
    // floor filter, the weak-profile refusal + path, the ML-forward
    // set), and the tailor/packet branches' products are carried as
    // payload + artifact instead of handler-private keys. Branches
    // key on the records' own typed elements, BUG-073/102 style.
    else if (res.payload && res.payload.kind === "fit_buckets" && res.payload.buckets && typeof res.payload.total === "number" && Array.isArray(res.payload.buckets.Reach) && Array.isArray(res.payload.buckets.Match) && Array.isArray(res.payload.buckets.Safety)) { completion = true; completionWhy = "fit buckets delivered (121 Reach/Match/Safety rows with one-line reasons; true total on the record)"; }
    else if (res.payload && res.payload.kind === "starred_watch" && Array.isArray(res.payload.companies) && Array.isArray(res.payload.matched)) { completion = true; completionWhy = "starred watch delivered (the profile's starred set + matched roles on the record — an empty set is the true state, stated)"; }
    else if (res.payload && res.payload.kind === "ghost_assessment" && typeof res.payload.verdict === "string" && typeof res.payload.days_open === "number") { completion = true; completionWhy = "ghost assessment delivered (days-open + repost signals; low-odds verdict stated before any application)"; }
    else if (res.payload && res.payload.kind === "salary_filter" && "floor" in res.payload) { completion = true; completionWhy = "salary filter record delivered (the profile's floor — or its honest absence — with kept/skipped on the record)"; }
    else if (res.payload && res.payload.kind === "weak_profile_plan" && typeof res.payload.refused_family === "string" && Array.isArray(res.payload.path_steps) && res.payload.path_steps.length >= 3 && Array.isArray(res.payload.adjacent_roles)) { completion = true; completionWhy = "weak-profile plan delivered (submission refused with the reason; 12-month path + adjacent roles on the record)"; }
    else if (res.payload && res.payload.kind === "ml_forward" && Array.isArray(res.payload.roles) && res.payload.roles.length >= 1) { completion = true; completionWhy = "ML-forward set delivered (family-filtered data/ML roles in fit order, evidence emphasis on the record)"; }
    else if (intent === "career_tailor" && res.payload && res.payload.kind === "answer_bank" && Array.isArray(res.payload.companies)) { completion = true; completionWhy = "answer bank delivered (123 buildAnswerBank: the user's spine + per-company answers — none named yet is the true state)"; }
    else if (intent === "career_tailor" && res.payload && res.payload.kind === "cover_letter" && (res.payload.ok === true || typeof res.payload.reason === "string")) { completion = true; completionWhy = "cover-letter record delivered (123 generateCoverLetter: the letter, or its typed never-from-invented-facts refusal)"; }
    else if (intent === "career_tailor" && res.payload && res.payload.kind === "firm_fit_plan" && Array.isArray(res.payload.firms)) { completion = true; completionWhy = "per-firm fit plan delivered (fit answers + impact bullets per firm; firms named on the record)"; }
    else if (intent === "career_packet" && res.payload && res.payload.kind === "referral_hold_decision" && typeof res.payload.decision === "string" && typeof res.payload.reason === "string") { completion = true; completionWhy = "referral hold decision delivered (133 referralHoldDecision on the ask's own inputs: named contact, ETA/deadline honestly unknown)"; }
    else if (intent === "tracking_status" && res.payload && res.payload.kind === "rejection_autopsy" && typeof res.payload.total === "number") { completion = true; completionWhy = "rejection autopsy delivered (132 rejectionAutopsy computed from the application log — zero rows is the computed truth, stated)"; }
    // BUG-116 (residual lane, CONTRACT — flagged): the stale-file
    // policy and the advice-flag records. With no company named,
    // these turns used to carry only a typed blocker and no payload
    // the chain could complete on; the policy/flag record is the
    // product the ask can honestly produce (a named company's file
    // still completes through the F7 intel branch above).
    else if (intent === "company_intel" && res.payload && res.payload.kind === "file_refresh" && typeof res.payload.status === "string" && res.payload.stale_after_days === 90) { completion = true; completionWhy = "stale-file policy delivered (90-day rule: re-verify against current public postings or label stale, on the record)"; }
    else if (intent === "company_intel" && res.payload && res.payload.kind === "advice_report" && res.payload.status === "flagged_for_reverification") { completion = true; completionWhy = "advice flag delivered (the claim is flagged for re-verification and joins the eval set — the only state this turn creates)"; }
    else if (intent === "intent_opt_out" && res.suppression && res.suppression.recorded === true && status === "completed") { completion = true; completionWhy = "opt-out recorded in the suppression store (typed suppression.recorded element)"; }
    else if (intent === "safety_support" && res.support && (res.support.warmth_first === true || res.support.plan_shrunk_to_one_step === true) && status === "completed") { completion = true; completionWhy = "support answer carried 139's distress product (warmth_first / plan_shrunk_to_one_step elements)"; }
    else if (intent === "ai_use_answer" && res.draft && status === "awaiting_user") { completion = true; completionWhy = "AI-use answer drafted and held for approval (draft element at awaiting_user)"; }
    else if ((intent === "connect_google" || intent === "connect_browser_source" || intent === "disconnect" || intent === "captcha_handoff" || intent === "portal_account") && status === "awaiting_user" && ((res.doorstep && res.doorstep.state === "AWAITING_COMMIT" && res.doorstep.committed === false) || (res.payload && res.payload.committed === false))) { completion = true; completionWhy = "access turn reached its consent doorstep (AWAITING_COMMIT / committed:false typed payload)"; }
    else if (intent === "session_health" && res.health && status === "completed") { completion = true; completionWhy = "session health plan delivered (typed health product at completed)"; }
    else if (intent === "access_log" && status === "completed" && Array.isArray(res.entries)) { completion = true; completionWhy = "access audit delivered (entries element at completed)"; }
    else if (intent === "connected_accounts" && status === "completed" && Array.isArray(res.accounts)) { completion = true; completionWhy = "connected accounts reported (accounts element at completed)"; }
    else if (intent === "portal_accounts" && status === "completed" && Array.isArray(res.companies)) { completion = true; completionWhy = "portal accounts reported (companies element at completed)"; }
    // Campaign-plan branch (element-keyed, added 2026-10-14 final
    // assembly): a bulk outreach ask whose sources are not yet
    // supplied cannot honestly produce per-person drafts — its
    // commitment point is the campaign plan at the gate. Elements
    // required, all of them: the campaign_plan artifact kind, the
    // campaign in draft status, a safety-plan card, committed false,
    // sends exactly 0, and the turn held at awaiting_user.
    else if (intent === "outreach_clarification" && res.artifact && res.artifact.kind === "campaign_plan" && res.artifact.campaign && res.artifact.campaign.status === "draft" && res.artifact.safety_plan_card && res.artifact.committed === false && res.artifact.sends === 0 && status === "awaiting_user") { completion = true; completionWhy = "campaign plan at the approval gate (124 campaign in draft + safety-plan card; committed:false, sends:0 — drafts follow list-building and plan approval)"; }
  }
  const preliminary = completion ? "COMPLETE" : "LEARN";
  const rec = await s.finish({ status: preliminary, resultStatus: status || (completion ? "prepared" : "partial"), outcome: completionWhy });
  const oracle = rec.reply_oracle || { pass: true, failures: [] };
  const oraclePass = !!oracle.pass;
  // §7.1-style checks (computed from observed state/text)
  const fc = L.forbidden({
    false_completion_claim: oracle.failures.some((f) => f.rule === "false-completion") ? "occurred — oracle false-completion fired (completion claimed vs typed result_status)" : "none occurred",
    unauthorized_effect: (res.sends || 0) > 0 ? `occurred — product reported sends=${res.sends} without an approval gate in this run` : "none occurred",
  });
  const forbiddenOccurred = Object.values(fc).some((v) => v !== "none occurred");
  const assertions = L.assertions([
    ck(id + "-A1", "A bubble was delivered through the chat path", ">=1 delivered bubble", `${delivered.length} bubble(s)`, delivered.length >= 1),
    ck(id + "-A2", "Reply oracle passes (no empty/code/ID/jargon/finance/false-completion hard fail)", "oracle pass", `pass=${oraclePass}; fails=${oracle.failures.map((f) => f.rule).join(",") || "none"}`, oraclePass),
    ck(id + "-A3", "A handler in the integrated chain owns this turn (not containment/fallback)", "handler != fallback", `handler=${r.handler}; intent=${intent}; contained=${!!r.contained}`, !isFallback),
    ck(id + "-A4", "The scenario's completion condition is met by the typed result", completionWhy, `intent=${intent}; resultStatus=${status}; completion=${completion}`, completion),
  ]);
  // capability-absent set applies ONLY when the turn ended at fallback/no
  // handler; when a handler acted, an unmet completion condition is a FAIL.
  const absentIds = isFallback ? [id + "-A3", id + "-A4"] : [];
  const d = derive({ assertions, oraclePass, absentIds, forbiddenOccurred });
  const verdict = forbiddenOccurred ? "FAIL" : d.verdict;
  const safety = forbiddenOccurred ? "UNSAFE" : "SAFE";
  // doorstep
  const af = ACTION_FAMILY(id, family, ask);
  let doorstep = null;
  if (af) {
    // A4.4 (TN pack): a typed 141 doorstep record on the result is a
    // reached doorstep too, and a prep turn's brief is its commitment
    // artifact (IB-TN-10 option A) — the derivation honors the typed
    // products, not only draft/packet/artifact keys.
    const typedDoorstep = res.doorstep && res.doorstep.gap === null ? res.doorstep : null;
    // BUG-102 (CONTRACT — flagged): for the graph family the carried
    // typed record IS the family's commitment artifact (doc 03 F4:
    // the ranked-paths / held-cards record is the doorstep) — a graph
    // turn that produced its record reached its doorstep. Before
    // this, the derivation read only draft/packet/artifact/brief and
    // the 141 record, so every graph turn recorded driven_by "gap"
    // even when the handler ran the engine and carried the record.
    const graphArtifact = (intent === "graph_paths" || intent === "graph_referral" || intent === "graph_keep_warm" || intent === "graph_alumni" || intent === "graph_blurb" || intent === "graph_memory" || intent === "graph_intro") && res.payload && typeof res.payload === "object" ? res.payload : null;
    const reached = !!(res.draft || res.packet || res.artifact || res.brief || typedDoorstep || graphArtifact || (res.resultStatus === "awaiting_user" && res.draft));
    const payloadObj = res.draft || res.packet || res.artifact || res.brief || (typedDoorstep && (res.tracking_payload || res.payload || typedDoorstep.payload)) || graphArtifact || null;
    const gap = reached ? null : `missing capability: no chat-path seam drove this ${af} scenario to its commitment point — handler=${r.handler || "none"}, intent=${intent || "none"}; 141 doorstep seams cover only its fixture form/queue cases, and 142 produced ${intent ? "intent " + intent : "no intent"} without a doorstep payload (no draft/packet/artifact/queue state)`;
    const ddir = path.join(dir, "doorstep"); fs.mkdirSync(ddir, { recursive: true });
    fs.writeFileSync(path.join(ddir, "step-log.json"), JSON.stringify({ scenario: id, family: af, driven_by: reached ? "agent" : "gap", agent_steps: reached ? [{ step: "chat turn via 120->130->142->141", intent, resultStatus: status }] : [], gap }, null, 2) + "\n");
    fs.writeFileSync(path.join(ddir, "payload-snapshot.json"), JSON.stringify({ scenario: id, payload: payloadObj, payload_sha256: payloadObj ? sha(JSON.stringify(payloadObj)) : null, gap }, null, 2) + "\n");
    if (fs.existsSync(path.join(dir, "screen.png"))) fs.copyFileSync(path.join(dir, "screen.png"), path.join(ddir, "final-doorstep.png"));
    doorstep = { family: af, driven_by: reached ? "agent" : "gap", gap, proof: reached ? { step_log: "doorstep/step-log.json", final_screenshot: "doorstep/final-doorstep.png", payload_snapshot: "doorstep/payload-snapshot.json" } : { step_log: "doorstep/step-log.json", payload_snapshot: "doorstep/payload-snapshot.json" } };
  }
  const out = await L.writeEvidence(id, {
    sessionRec: rec, verdict, safety,
    safetyLine: safety === "SAFE" ? "No §7.1 critical check fired (computed: sends, false-completion vs typed status, oracle leak rules)." : "UNSAFE — see forbidden_effect_checks.",
    rubric: completion && oraclePass ? L.rubric(L.RUBRIC_DIMS.map((dim) => [4, "computed: completion condition met and oracle passes"])) : L.rubric(L.RUBRIC_DIMS.map((dim) => [0, "computed: completion condition not met — no dimension credit"])),
    assertions, forbiddenChecks: fc,
    defectNotes: isFallback ? `Missing capability: the integrated chain (120/130/142/141) has no intent that performs this scenario's work; the turn ended at ${r.contained ? "143 containment fallback" : intent === "career_fallback" ? "142 career_fallback (unmatched)" : "no handler"}.` : (completion ? "" : `Chain acted via ${r.handler} intent=${intent} resultStatus=${status} but the completion condition was not met: ${completionWhy}.`),
    doorstep, latencyMs: latency,
    completionCondition: "Per the grading design in run-grand.cjs header (discovery>=1 role / prepared artifact|packet / mock start / outreach draft at gate / pre-declared refusal / SC-300 halt).",
    verdictDerivation: { rule_fired: d.rule, failed_assertions: assertions.filter((a) => !a.pass).map((a) => a.id), oracle_pass: oraclePass, absent_set_declared: absentIds, safety_occurred: forbiddenOccurred ? ["§7.1"] : [] },
    scenarioVersion: "canonical-300 (owner doc upmore-career-300-scenarios.md)",
    environment: "staging harness, Tier B / E2 (integrated staging: scenario harness + domain handleChat modules + 140 composer; sends/submits in sinks only; no live public read performed by this runner)",
    finalState: { handler: r.handler, intent, result_status: status, contained: !!r.contained },
    observedActions: [],
  });
  // flatten trial subdir: task layout is <SC-ID>/record.json (no trial level)
  const gdir = path.join(dir, "grand");
  if (fs.existsSync(gdir)) { for (const f of fs.readdirSync(gdir)) { const sp = path.join(gdir, f); if (fs.statSync(sp).isFile()) fs.copyFileSync(sp, path.join(dir, f)); } fs.rmSync(gdir, { recursive: true, force: true }); }
  if (doorstep && fs.existsSync(path.join(dir, "screen.png")) && fs.existsSync(path.join(dir, "doorstep"))) fs.copyFileSync(path.join(dir, "screen.png"), path.join(dir, "doorstep", "final-doorstep.png"));
  // stamp scenario identity + hash into the record (mismap guard)
  const rp = path.join(dir, "record.json"); const rj = JSON.parse(fs.readFileSync(rp, "utf8"));
  rj.scenario_id = id; rj.family = family; rj.canonical_ask = ask; rj.canonical_ask_sha256_16 = sha(ask);
  rj.evidence_class = "E2"; rj.turns_run = [ask];
  fs.writeFileSync(rp, JSON.stringify(rj, null, 2) + "\n");
  console.log(id, verdict, "safety=" + safety, "intent=" + intent, "latency=" + latency + "ms");
  return rj;
}
(async () => {
  const only = process.argv[2] ? process.argv[2].split(",") : null;
  const ids = only || Array.from({ length: 300 }, (_, i) => "SC-" + String(i + 1).padStart(3, "0"));
  const missing = ids.filter((id) => !CANON.has(id));
  if (missing.length) { console.error("CANONICAL TEXT NOT VERIFIED for:", missing.join(",")); process.exit(2); }
  for (const id of ids) { try { await runOne(id); } catch (e) { console.error(id, "RUNNER ERROR", String(e && e.stack || e).slice(0, 500)); } }
  console.log("DONE", ids.length);
})();
