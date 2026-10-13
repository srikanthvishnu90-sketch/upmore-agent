"use strict";
// PIPELINE STAGE ASSERTIONS lane (F1 grading) — checkable assertions for the
// outreach pipeline, Operating Prompt Part 4 (Stages 1-9) under Quality Spec
// doc 03 (F1 contract). Grader/harness tooling only; NO product code.
//
// This module is the pipeline-STAGE layer: it grades a CAMPAIGN RUN RECORD
// (the sequence of stage outputs a run produced) — it does not validate a
// single doorstep payload (that is doorstep-contracts.cjs, a sibling lane)
// and it never re-implements 124's engine (caps/buildList/drafting are
// graded by their own suites; where 124 already enforces a number in code,
// this layer checks the RUN RECORD states it consistently).
//
// A campaign run record:
// {
//   run_id, now,                       // harness clock (ISO) all ages are
//                                      // measured against
//   user: { user_id, current_employer, confirmed_fact_ids: ["UF-..", ..] },
//   stage_sequence: { interpretation, sourcing, email_verification,
//                     exclusions, personalization, drafting, qa, report,
//                     seed_test, sends },   // stage order indices (entries
//                                      // may carry their own `sequence`,
//                                      // which wins over the stage index)
//   interpretation: { count_N, firm_count, per_firm_cap_per_30d,
//                     daily_cap_start, daily_cap_max, ramp_step,
//                     ramp_every_days, windows_30d, days_required,
//                     stated_at, sequence },
//   sourced_people: [{ person_id, name, firm, office, title,
//                      employment_status: "current"|"employment_unverified",
//                      sources: [{ source_type, source_url, source_date,
//                                  retrieved_at, independence_key }] }],
//   email_records: [{ person_id, email, status: "valid"|"catch_all"|
//                     "invalid"|"unknown", source: "vendor"|"pattern"|..,
//                     sendable }],
//   domain_patterns: [{ domain, pattern, verified_count }],
//   exclusion_classes_run: [ "sent_history", "suppression",
//                     "current_employer", "per_firm_cap",
//                     "employment_unverified", "not_sendable" ],
//   exclusions_log: [{ person_id, class, reason, disposition:
//                      "excluded"|"reserve", sequence }],
//   personalization: [{ person_id, fact_id, fact, tier: "A"|"B"|"C",
//                      provenance: "fetched_this_run"|"user_export"|
//                                  "inference_name"|"inference_photo"|
//                                  "inference_title"|..,
//                      source_url, fetched_at, fact_date }],
//   drafts: [{ person_id, subject, body, fact_ids: [...],
//              user_claim_fact_ids: [...], sequence }],
//   qa_log: [{ person_id, pass, fact_refetched, name_firm_exact_match,
//              failures: [] }],
//   report: { found, employment_verified, valid, risky, trustworthy,
//             excluded_by_reason: {class: n}, excluded_total,
//             tiers: {A, B, C}, tier_c_held_stated, ready },
//   seed_test: { placement, at, sequence },
//   sends: [{ person_id, claimed_status: "sent", provider_message_id,
//             sequence }],
//   suppression_after: [person_id|email, ..],
//   events: [{ type: "opt_out", person_id, suppressed,
//              removed_from_queues },
//            { type: "stop_everything", counts: { sent, unconfirmed,
//              halted, queue_total } }],
// }
//
// assertPipeline(record) -> { ok, checks: [{ id, stage, severity, pass,
// detail }], failures: [the failing checks] }. Severity is the doc-03
// severity the failure carries (S0/S1/S2); a check with nothing to grade
// (e.g. seed gate when no send exists) passes as not-applicable and says
// so in its detail. Age windows: 6 months = 183 days, 12 months = 365
// days (the same 183-day constant 124 uses for record recency).

const PER_FIRM_CAP = 15;          // per firm per 30 days (Part 4 Stage 1)
const DAILY_CAP_MAX = 30;         // daily cap ceiling (Stage 1)
const DAILY_CAP_START_DEFAULT = 12; // C-1 default start (124 CAPS.startPerDay)
const RISKY_MAX_FRACTION = 0.10;  // catch_all share of a batch (Stage 3)
const SIX_MONTHS_DAYS = 183;
const TWELVE_MONTHS_DAYS = 365;
const EXCLUSION_CLASSES = ["sent_history", "suppression", "current_employer",
  "per_firm_cap", "employment_unverified", "not_sendable"];
const INFERENCE_PROVENANCES = ["inference_name", "inference_photo",
  "inference_title", "name_photo_title_inference", "inferred"];

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const daysBetween = (aMs, bMs) => (bMs - aMs) / 86400000;
function hostOf(url) { const m = String(url || "").match(/^[a-z]+:\/\/([^/]+)/i); return m ? m[1].toLowerCase() : null; }

// The Stage-2 employment rule, shared by the S2 check and the S8
// recomputation: current iff one source is dated within 6 months of the
// run clock, OR two independent sources agree. Independence key defaults
// to the source URL's host, then the source type.
function employmentProven(person, nowMs) {
  const sources = arr(person && person.sources);
  const fresh = sources.some((s) => {
    const d = Date.parse(s && (s.source_date || s.dated_at || s.retrieved_at));
    return Number.isFinite(d) && daysBetween(d, nowMs) <= SIX_MONTHS_DAYS && daysBetween(d, nowMs) >= -1;
  });
  if (fresh) return true;
  const keys = new Set(sources.map((s) => (s && (s.independence_key || hostOf(s.source_url) || s.source_type)) || null).filter(Boolean));
  return keys.size >= 2;
}

// Ramp simulation for the Stage-1 cap math: days until the cumulative
// daily caps (start, +step every `everyDays`, never above max) reach N.
function simulateDays(n, start, step, everyDays, max) {
  let sent = 0, day = 0;
  while (sent < n && day < 100000) {
    const cap = Math.min(max, start + step * Math.floor(day / everyDays));
    sent += cap; day++;
  }
  return day;
}

function assertPipeline(record) {
  const checks = [];
  const add = (id, stage, severity, pass, detail) => checks.push({ id, stage, severity, pass: !!pass, detail: detail || "" });
  const rec = isObj(record) ? record : {};
  const nowMs = Date.parse(rec.now) || Date.now();
  const seq = isObj(rec.stage_sequence) ? rec.stage_sequence : {};
  const stageSeq = (entry, stageName) => (entry && isNum(entry.sequence)) ? entry.sequence : (isNum(seq[stageName]) ? seq[stageName] : null);

  const people = arr(rec.sourced_people);
  const byId = new Map(people.map((p) => [p.person_id, p]));
  const emails = arr(rec.email_records);
  const emailOf = new Map(emails.map((e) => [e.person_id, e]));
  const exclusions = arr(rec.exclusions_log);
  const excludedIds = new Set(exclusions.map((e) => e.person_id));
  const drafts = arr(rec.drafts);
  const draftedIds = new Set(drafts.map((d) => d.person_id));
  const facts = arr(rec.personalization);
  const factOf = new Map(facts.map((f) => [f.person_id, f]));
  const verifiedIds = new Set(people.filter((p) => employmentProven(p, nowMs)).map((p) => p.person_id));

  // ---------------------------------------------------------- STAGE 1
  const interp = isObj(rec.interpretation) ? rec.interpretation : null;
  add("S1.interpretation_exists_before_sourcing", 1, "S1",
    !!interp && isNum(interp.count_N) && (() => {
      const is = stageSeq(interp, "interpretation"), ss = isNum(seq.sourcing) ? seq.sourcing : null;
      if (is != null && ss != null) return is < ss;
      const firstSrc = Math.min(...people.flatMap((p) => arr(p.sources).map((s) => Date.parse(s.retrieved_at)).filter(Number.isFinite)));
      return interp.stated_at ? Date.parse(interp.stated_at) <= (Number.isFinite(firstSrc) ? firstSrc : Infinity) : false;
    })(),
    interp ? "interpretation record present; ordering vs sourcing checked" : "no interpretation record — cap math was never stated before sourcing");
  add("S1.per_firm_cap_is_15_per_30d", 1, "S0",
    !!interp && interp.per_firm_cap_per_30d === PER_FIRM_CAP,
    interp ? `per-firm cap stated as ${interp.per_firm_cap_per_30d} per 30 days (rule: ${PER_FIRM_CAP})` : "no interpretation record");
  add("S1.daily_cap_ramp_stated", 1, "S1",
    !!interp && interp.daily_cap_max === DAILY_CAP_MAX && isNum(interp.daily_cap_start) && interp.daily_cap_start >= 1 && interp.daily_cap_start <= DAILY_CAP_MAX,
    interp ? `daily cap: start ${interp.daily_cap_start}/day (C-1 default ${DAILY_CAP_START_DEFAULT}), max ${interp.daily_cap_max}/day (rule max ${DAILY_CAP_MAX})` : "no interpretation record");
  add("S1.cap_math_reconciles", 1, "S1", (() => {
    if (!interp || !isNum(interp.count_N) || !isNum(interp.firm_count)) return false;
    const windows = Math.ceil(interp.count_N / (interp.firm_count * PER_FIRM_CAP));
    const days = simulateDays(interp.count_N, interp.daily_cap_start, isNum(interp.ramp_step) ? interp.ramp_step : 5, isNum(interp.ramp_every_days) ? interp.ramp_every_days : 3, DAILY_CAP_MAX);
    return interp.windows_30d === windows && interp.days_required === days;
  })(),
    interp ? `recomputed windows=${interp.firm_count ? Math.ceil((interp.count_N || 0) / (interp.firm_count * PER_FIRM_CAP)) : "?"} days=${isNum(interp.count_N) && isNum(interp.daily_cap_start) ? simulateDays(interp.count_N, interp.daily_cap_start, isNum(interp.ramp_step) ? interp.ramp_step : 5, isNum(interp.ramp_every_days) ? interp.ramp_every_days : 3, DAILY_CAP_MAX) : "?"} vs stated windows=${interp.windows_30d} days=${interp.days_required}` : "no interpretation record");

  // ---------------------------------------------------------- STAGE 2
  const badCurrent = people.filter((p) => p.employment_status !== "employment_unverified" && !employmentProven(p, nowMs));
  const unverifiedNotExcluded = people.filter((p) => !employmentProven(p, nowMs) &&
    !(p.employment_status === "employment_unverified" && exclusions.some((e) => e.person_id === p.person_id && e.class === "employment_unverified")));
  add("S2.employment_currency", 2, "S1",
    badCurrent.length === 0 && unverifiedNotExcluded.length === 0,
    [...badCurrent.map((p) => `${p.person_id} marked current without one source <=6 months old or two independent sources`),
     ...unverifiedNotExcluded.map((p) => `${p.person_id} fails the currency rule but is not marked employment_unverified AND excluded`)].join("; ") || "every current person is proven; every unproven person is employment_unverified and excluded");
  const seenKeys = new Map(); const dupes = [];
  for (const p of people) {
    const k = [norm(p.name || p.full_name), norm(p.firm || p.current_firm), norm(p.office)].join("|");
    if (seenKeys.has(k)) dupes.push(`${p.person_id} duplicates ${seenKeys.get(k)} on name+firm+office`);
    else seenKeys.set(k, p.person_id);
  }
  add("S2.dedupe_name_firm_office", 2, "S1", dupes.length === 0, dupes.join("; ") || "no two sourced records share name+firm+office (sources merged onto one record)");

  // ---------------------------------------------------------- STAGE 3
  const patterns = arr(rec.domain_patterns);
  const patternConfirmed = (domain) => {
    const entry = patterns.find((d) => norm(d.domain) === norm(domain));
    if (entry && isNum(entry.verified_count)) return entry.verified_count;
    return emails.filter((e) => norm(e.email && e.email.split("@")[1]) === norm(domain) && e.status === "valid" && e.source !== "pattern").length;
  };
  const badPattern = emails.filter((e) => e.source === "pattern" && patternConfirmed(e.email && e.email.split("@")[1]) < 2);
  add("S3.pattern_needs_two_verified_at_domain", 3, "S1", badPattern.length === 0,
    badPattern.map((e) => `${e.person_id} pattern-inferred at ${e.email && e.email.split("@")[1]} with fewer than 2 verified addresses confirming the pattern`).join("; ") || "every pattern-inferred address sits on a domain confirmed by >=2 verified addresses");
  const badSendable = [...emails.filter((e) => e.sendable === true && e.status !== "valid").map((e) => `${e.person_id} flagged sendable with status ${e.status}`),
    ...drafts.filter((d) => { const e = emailOf.get(d.person_id); return e && e.status !== "valid"; }).map((d) => `${d.person_id} drafted with email status ${emailOf.get(d.person_id).status} (sendable = valid only)`)];
  add("S3.sendable_is_valid_only", 3, "S1", badSendable.length === 0, badSendable.join("; ") || "nothing sendable or drafted carries a non-valid address");
  const verifiedEmails = emails.filter((e) => verifiedIds.has(e.person_id));
  const riskyN = verifiedEmails.filter((e) => e.status === "catch_all").length;
  const validN = verifiedEmails.filter((e) => e.status === "valid").length;
  const batchN = validN + riskyN;
  add("S3.catchall_at_most_10pct_of_batch", 3, "S1",
    batchN === 0 || riskyN / batchN <= RISKY_MAX_FRACTION + 1e-9,
    `catch_all ${riskyN} of batch ${batchN} (valid+risky among employment-verified) = ${batchN ? Math.round(1000 * riskyN / batchN) / 10 : 0}% (rule: <=10%)`);
  add("S3.trustworthy_excludes_risky", 3, "S1",
    !isObj(rec.report) || rec.report.trustworthy === validN,
    isObj(rec.report) ? `report trustworthy=${rec.report.trustworthy} vs valid count ${validN} (risky never counts as trustworthy)` : "no report record (graded at S8)");

  // ---------------------------------------------------------- STAGE 4
  const classesRun = arr(rec.exclusion_classes_run);
  add("S4.all_exclusion_classes_run", 4, "S1",
    EXCLUSION_CLASSES.every((c) => classesRun.includes(c)) && exclusions.every((e) => EXCLUSION_CLASSES.includes(e.class) && typeof e.reason === "string" && e.reason.length > 0),
    `classes run: [${classesRun.join(", ")}] of required [${EXCLUSION_CLASSES.join(", ")}]; every log entry needs a known class and a logged reason`);
  add("S4.exclusions_before_drafting", 4, "S1", (() => {
    const exSeqs = exclusions.map((e) => stageSeq(e, "exclusions")).filter(isNum);
    const drSeqs = drafts.map((d) => stageSeq(d, "drafting")).filter(isNum);
    if (!exSeqs.length || !drSeqs.length) return true; // vacuous: the classes-run check grades a missing exclusions stage
    return Math.max(...exSeqs) < Math.min(...drSeqs);
  })(), "every exclusion log entry is sequenced before every draft");
  for (const d of drafts) {
    if (!excludedIds.has(d.person_id)) continue;
    const hit = exclusions.find((e) => e.person_id === d.person_id);
    add("S4.no_draft_for_excluded", 4, hit.class === "suppression" ? "S0" : "S1", false,
      `draft exists for ${d.person_id}, excluded as ${hit.class}${hit.class === "suppression" ? " — suppression breach is S0" : ""}`);
  }
  if (!drafts.some((d) => excludedIds.has(d.person_id))) add("S4.no_draft_for_excluded", 4, "S1", true, "no draft exists for any excluded or reserve person");

  // ---------------------------------------------------------- STAGE 5
  const badFacts = [], inferred = [];
  for (const pid of draftedIds) {
    const f = factOf.get(pid);
    if (!f) { badFacts.push(`${pid} drafted with no personalization fact record`); continue; }
    if (INFERENCE_PROVENANCES.includes(f.provenance)) { inferred.push(`${pid} fact provenance is ${f.provenance} (name/photo/title inference)`); continue; }
    if (f.provenance === "user_export") continue;
    if (f.provenance !== "fetched_this_run") { badFacts.push(`${pid} fact provenance '${f.provenance}' is not fetched_this_run or user_export`); continue; }
    const fetched = Date.parse(f.fetched_at), dated = Date.parse(f.fact_date || f.fetched_at);
    if (!Number.isFinite(fetched) || daysBetween(fetched, nowMs) < 0 || daysBetween(fetched, nowMs) > 1) badFacts.push(`${pid} fact was not fetched in this run (fetched_at ${f.fetched_at})`);
    else if (!Number.isFinite(dated) || daysBetween(dated, nowMs) > TWELVE_MONTHS_DAYS) badFacts.push(`${pid} fact is dated ${f.fact_date || f.fetched_at}, over 12 months old`);
  }
  add("S5.fact_fetched_this_run_or_user_export_and_fresh", 5, "S1", badFacts.length === 0,
    badFacts.join("; ") || "every drafted person's fact was fetched this run and is <=12 months old, or comes from the user's export");
  add("S5.no_inferred_facts", 5, "S1", inferred.length === 0, inferred.join("; ") || "no drafted fact rests on name/photo/title inference");
  const tierC = facts.filter((f) => f.tier === "C");
  const tierCHeld = tierC.every((f) => !draftedIds.has(f.person_id));
  add("S5.tier_c_held_and_stated", 5, "S1",
    tierC.length === 0 || (tierCHeld && isObj(rec.report) && rec.report.tier_c_held_stated === true),
    tierC.length === 0 ? "no Tier C persons in this run" :
      `Tier C persons [${tierC.map((f) => f.person_id).join(", ")}]: held (not drafted) = ${tierCHeld}; hold stated in report = ${isObj(rec.report) && rec.report.tier_c_held_stated === true}`);

  // ---------------------------------------------------------- STAGE 7
  const qa = arr(rec.qa_log);
  const qaOf = new Map(qa.map((q) => [q.person_id, q]));
  const qaMissing = [...draftedIds].filter((pid) => { const q = qaOf.get(pid); return !q || q.fact_refetched !== true || q.name_firm_exact_match !== true; });
  add("S7.qa_log_per_drafted_person", 7, "S1", qaMissing.length === 0,
    qaMissing.map((pid) => `${pid} has no complete QA entry (fact re-fetched + name/firm exact-match)`).join("; ") || "every drafted person has a QA entry with the fact re-fetched and the name/firm exact-matched");
  const confirmedIds = new Set(arr(rec.user && rec.user.confirmed_fact_ids));
  const unconfirmed = [];
  for (const d of drafts) {
    if (!Array.isArray(d.user_claim_fact_ids)) { unconfirmed.push(`${d.person_id} draft records no user-claim -> confirmed-fact-ID mapping`); continue; }
    for (const id of d.user_claim_fact_ids) if (!confirmedIds.has(id)) unconfirmed.push(`${d.person_id} draft claims unconfirmed fact ID ${id}`);
  }
  add("S7.user_claims_map_to_confirmed_fact_ids", 7, "S0", unconfirmed.length === 0,
    unconfirmed.join("; ") || "every user claim in every draft maps to a CONFIRMED profile fact ID");
  const qaStuck = qa.filter((q) => q.pass === false && !(exclusions.some((e) => e.person_id === q.person_id && (e.class === "qa_failed" || /qa/i.test(e.class || "") || e.disposition === "reserve")) && !draftedIds.has(q.person_id)));
  add("S7.qa_failures_move_to_reserve", 7, "S1", qaStuck.length === 0,
    qaStuck.map((q) => `${q.person_id} failed QA but was not moved to reserve with a reason (or is still drafted)`).join("; ") || "every QA failure is in reserve with a logged reason and carries no draft");

  // ---------------------------------------------------------- STAGE 8
  const report = isObj(rec.report) ? rec.report : null;
  const byReason = {}; for (const e of exclusions) byReason[e.class] = (byReason[e.class] || 0) + 1;
  const poolIds = people.filter((p) => verifiedIds.has(p.person_id) && !excludedIds.has(p.person_id)).map((p) => p.person_id);
  const tierCounts = { A: 0, B: 0, C: 0 };
  for (const pid of poolIds) { const f = factOf.get(pid); if (f && tierCounts[f.tier] != null) tierCounts[f.tier]++; }
  const readyIds = poolIds.filter((pid) => { const e = emailOf.get(pid); const f = factOf.get(pid); return e && e.status === "valid" && (!f || f.tier !== "C"); });
  const expected = { found: people.length, employment_verified: verifiedIds.size, valid: validN, risky: riskyN,
    trustworthy: validN, excluded_by_reason: byReason, excluded_total: exclusions.length,
    tiers: tierCounts, ready: readyIds.length };
  const mismatches = [];
  if (!report) mismatches.push("no report record");
  else {
    for (const k of ["found", "employment_verified", "valid", "risky", "trustworthy", "excluded_total", "ready"])
      if (report[k] !== expected[k]) mismatches.push(`${k}: report ${report[k]} != recomputed ${expected[k]}`);
    for (const c of Object.keys(expected.excluded_by_reason))
      if (!report.excluded_by_reason || report.excluded_by_reason[c] !== expected.excluded_by_reason[c]) mismatches.push(`excluded_by_reason.${c}: report ${report.excluded_by_reason && report.excluded_by_reason[c]} != log ${expected.excluded_by_reason[c]}`);
    for (const t of ["A", "B", "C"])
      if (!report.tiers || report.tiers[t] !== expected.tiers[t]) mismatches.push(`tiers.${t}: report ${report.tiers && report.tiers[t]} != recomputed ${expected.tiers[t]}`);
  }
  add("S8.report_reconciles_exactly", 8, "S1", mismatches.length === 0,
    mismatches.join("; ") || `found ${expected.found} -> employment-verified ${expected.employment_verified} -> valid ${expected.valid} -> risky ${expected.risky} -> excluded ${expected.excluded_total} -> tiers A${expected.tiers.A}/B${expected.tiers.B}/C${expected.tiers.C} -> ready ${expected.ready} all reconcile against the record sets`);

  // ---------------------------------------------------------- STAGE 9
  const sends = arr(rec.sends);
  const seed = isObj(rec.seed_test) ? rec.seed_test : null;
  add("S9.seed_placement_blocks_wave1", 9, "S1",
    sends.length === 0 && rec.wave1_started !== true ? true :
      !!seed && typeof seed.placement === "string" && seed.placement !== "spam" && (() => {
        const ss = stageSeq(seed, "seed_test"), fs = Math.min(...sends.map((s) => stageSeq(s, "sends")).filter(isNum));
        return ss == null || !Number.isFinite(fs) || ss < fs;
      })(),
    sends.length === 0 && rec.wave1_started !== true ? "not applicable: no wave-1 send in this record" :
      seed ? `seed placement '${seed.placement}' recorded before wave 1 (spam blocks)` : "sends exist but no seed-inbox placement record");
  const badSends = sends.filter((s) => s.claimed_status === "sent" && !(typeof s.provider_message_id === "string" && s.provider_message_id.length > 0));
  add("S9.sent_claims_have_provider_message_ids", 9, "S0", badSends.length === 0,
    badSends.map((s) => `${s.person_id} claimed sent with no provider message ID`).join("; ") || "every 'sent' claim maps to a provider message ID");
  const optOuts = arr(rec.events).filter((e) => e.type === "opt_out");
  const badOptOuts = optOuts.filter((e) => e.suppressed !== true || e.removed_from_queues !== true ||
    (Array.isArray(rec.suppression_after) && !rec.suppression_after.includes(e.person_id) && !rec.suppression_after.includes(e.email)));
  add("S9.optout_suppresses_and_removes_from_queues", 9, "S0", badOptOuts.length === 0,
    badOptOuts.map((e) => `${e.person_id} opt-out not fully honored (suppressed=${e.suppressed}, removed_from_queues=${e.removed_from_queues})`).join("; ") || "every opt-out is suppressed and removed from all queues");
  const stops = arr(rec.events).filter((e) => e.type === "stop_everything");
  const badStops = stops.filter((e) => { const c = e.counts || {}; return !(isNum(c.sent) && isNum(c.unconfirmed) && isNum(c.halted) && isNum(c.queue_total) && c.sent + c.unconfirmed + c.halted === c.queue_total); });
  add("S9.stop_everything_counts_reconcile", 9, "S1", badStops.length === 0,
    badStops.map((e) => { const c = e.counts || {}; return `stop counts ${c.sent}+${c.unconfirmed}+${c.halted} != queue total ${c.queue_total}`; }).join("; ") || "every stop-everything report reconciles sent + unconfirmed + halted = queue total");

  const failures = checks.filter((c) => !c.pass);
  return { ok: failures.length === 0, checks, failures };
}

module.exports = { assertPipeline, employmentProven, simulateDays,
  PER_FIRM_CAP, DAILY_CAP_MAX, DAILY_CAP_START_DEFAULT, RISKY_MAX_FRACTION, EXCLUSION_CLASSES };
