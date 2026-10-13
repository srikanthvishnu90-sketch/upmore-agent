"use strict";
// Gate-3 FAMILY-CONTRACTS lane — executable doorstep validators for the
// Quality Spec Pack v1.0, doc 03 (Family Contracts), under doc 01
// (Non-Negotiables). Grader tooling only; NO product code.
//
// validate(family, doorstepRecord) -> {
//   family, valid,
//   missing: [elementName, ...],          // required elements absent
//   invalid: [{element, expected, observed}, ...], // present but wrong
//   present: [elementName, ...],
// }
//
// `family` accepts "F1".."F9" plus the hardened re-scorer's doorstep
// family names: "outreach-send"->F1, "application"->F2,
// "tracking-write"->F3, "calendar"->F3 (calendar variant).
//
// A record may be (a) a 141 emitter result { doorstep, payload, ... }
// (the payload is validated and, when a doorstep envelope is present,
// the envelope itself is checked: gap null, driven_by "agent",
// state "AWAITING_COMMIT", committed false), (b) a bare payload, or
// (c) a domain-module record (135/127/128/129/144/120 shapes).
// The validator never invents elements: a differently-named field does
// not satisfy an element unless it is a documented shape of the owning
// module (each accepted alias is noted at the check).

const ALIASES = {
  "outreach-send": "F1", outreach: "F1",
  application: "F2", apply: "F2",
  "tracking-write": "F3", tracking: "F3", calendar: "F3",
  referrals: "F4", "warm-path": "F4",
  prep: "F5", negotiation: "F6", offer: "F6",
  guidance: "F7", intelligence: "F7",
  os: "F8", "career-os": "F8",
  access: "F9", connection: "F9", halt: "F9",
};

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const arr = (v) => (Array.isArray(v) ? v : null);

function makeResult(family) {
  return {
    family, valid: false, missing: [], invalid: [], present: [],
    _ok(name) { this.present.push(name); },
    _miss(name) { this.missing.push(name); },
    _bad(element, expected, observed) { this.invalid.push({ element, expected, observed }); },
    _done() { this.valid = this.missing.length === 0 && this.invalid.length === 0; return this; },
  };
}

// Unwrap a 141 emitter result to its payload and check the envelope.
function unwrap(r, rec) {
  if (isObj(rec) && isObj(rec.doorstep)) {
    const d = rec.doorstep;
    if (d.gap === null && d.driven_by === "agent" && d.state === "AWAITING_COMMIT" && d.committed === false) r._ok("doorstep_envelope");
    else r._bad("doorstep_envelope", "{gap:null, driven_by:'agent', state:'AWAITING_COMMIT', committed:false}",
      JSON.stringify({ gap: d.gap, driven_by: d.driven_by, state: d.state, committed: d.committed }));
    if (isObj(rec.payload)) return rec.payload;
  }
  return rec;
}

function checkNotCommitted(r, p) {
  // Doc 03: nothing in a sending/submitted state without approval.
  const sends = isNum(p.sends) ? p.sends : null;
  if (p.submitted === true || p.committed === true || (sends != null && sends > 0)) {
    r._bad("nothing_committed_without_approval", "submitted/committed false and sends 0",
      JSON.stringify({ submitted: p.submitted, committed: p.committed, sends }));
  } else if (p.submitted === false || p.committed === false || sends === 0) r._ok("nothing_committed_without_approval");
}

// ---------------------------------------------------------------- F1
function validateF1(r, p) {
  // Doorstep (03 F1): a list record with selected/reserve/excluded
  // counts, plus drafts (if asked) and a campaign in `draft` state
  // awaiting the safety-plan card.
  const list = isObj(p.list_record) ? p.list_record : isObj(p.list) ? p.list : null;
  const y = isObj(p.yield) ? p.yield : null; // 124 buildList yield report shape
  const pool = isObj(p.pool) ? p.pool : null; // 124 buildList pool shape
  const counts = { selected_count: null, reserve_count: null, excluded_count: null };
  if (list) {
    counts.selected_count = list.selected_count ?? list.selected;
    counts.reserve_count = list.reserve_count ?? list.reserve;
    counts.excluded_count = list.excluded_count ?? list.excluded;
  } else if (y) {
    counts.selected_count = y.selected; counts.reserve_count = y.reserve;
    counts.excluded_count = isNum(y.excluded) ? y.excluded
      : isObj(y.exclusions) ? Object.values(y.exclusions).reduce((a, b) => a + (isNum(b) ? b : 0), 0) : null;
  } else if (pool && arr(pool.selected) && arr(pool.reserve)) {
    counts.selected_count = pool.selected.length; counts.reserve_count = pool.reserve.length;
    counts.excluded_count = isObj(pool.exclusions) ? Object.values(pool.exclusions).reduce((a, b) => a + (isNum(b) ? b : 0), 0) : null;
  } else if (arr(p.selected) && arr(p.reserve)) {
    counts.selected_count = p.selected.length; counts.reserve_count = p.reserve.length;
  }
  for (const k of ["selected_count", "reserve_count", "excluded_count"]) {
    if (isNum(counts[k])) r._ok("list_record." + k); else r._miss("list_record." + k);
  }
  if (y) { // honest yield reconciles: found -> trustworthy -> sendable
    if (isNum(y.found) && isNum(y.trusted_emails) && isNum(y.sendable)) r._ok("honest_yield");
    else r._miss("honest_yield");
  }
  // Drafts: array of drafts, or the 141 emitter's single draft object.
  const drafts = arr(p.drafts) || (isObj(p.draft) ? [p.draft] : null);
  if (drafts && drafts.length && isObj(drafts[0]) && nonEmpty(drafts[0].body)) {
    r._ok("drafts");
    const d = drafts[0];
    if (nonEmpty(d.subject)) {
      if (d.subject.length < 60) r._ok("draft.subject_under_60_chars");
      else r._bad("draft.subject_under_60_chars", "subject < 60 characters", `subject is ${d.subject.length} characters`);
    } else r._miss("draft.subject");
    const words = d.body.trim().split(/\s+/).length;
    if (words >= 50 && words <= 120) r._ok("draft.body_50_to_120_words");
    else r._bad("draft.body_50_to_120_words", "body 50-120 words", `body is ${words} words`);
    if (/^i'?m passionate about/i.test(d.body.trim()) || /^(hi|hello|dear)[^.\n]*\b(esteemed|impressed by your (amazing|incredible))/i.test(d.body.trim())) {
      r._bad("draft.no_generic_flattery_opening", "first line references a sourced fact or shared tie", "generic flattery opening");
    }
    // Personalization fact with a source (124 facts_used / why_this_line shape).
    const facts = arr(d.facts_used) || arr(d.why_this_line) || (isObj(d.personalization_fact) ? [d.personalization_fact] : null);
    if (facts && facts.length && facts[0] && (nonEmpty(facts[0].source_url) || nonEmpty(facts[0].source))) r._ok("draft.personalization_fact_with_source");
    else r._miss("draft.personalization_fact_with_source");
    // One concrete ask: 15 minutes, with 2 proposed windows OR "whatever works".
    if (/15 minutes/.test(d.body) && (/whatever works/i.test(d.body) || (d.body.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[^.\n]{0,40}?\d\s*(?:am|pm)/gi) || []).length >= 2)) r._ok("draft.ask_15min_with_two_windows_or_whatever_works");
    else r._miss("draft.ask_15min_with_two_windows_or_whatever_works");
  } else r._miss("drafts");
  // Safety-plan card (124 safetyPlan shape: daily cap, finish date, stop rules).
  const sp = isObj(p.safety_plan) ? p.safety_plan : isObj(p.safetyPlan) ? p.safetyPlan : isObj(p.safety_plan_card) ? p.safety_plan_card : null;
  if (sp && (isNum(sp.daily_cap_start) || isNum(sp.daily_cap)) && nonEmpty(sp.finish_date) && arr(sp.stop_rules) && sp.stop_rules.length) r._ok("safety_plan_card");
  else r._miss("safety_plan_card");
  // Campaign in draft state, nothing sending.
  const camp = isObj(p.campaign) ? p.campaign : null;
  if (camp && (camp.status === "draft" || camp.state === "draft")) r._ok("campaign_in_draft_state");
  else r._miss("campaign_in_draft_state");
  if (isObj(p.queue_state) && arr(p.queue_state.items) && p.queue_state.items.some((i) => i.status === "sending")) {
    r._bad("nothing_in_sending_state", "no queue item in 'sending' state without approval", "a queue item is 'sending'");
  }
  checkNotCommitted(r, p);
  return r._done();
}

// ---------------------------------------------------------------- F2
function validateF2(r, p) {
  // Doorstep (03 F2): an application packet per role — posting snapshot,
  // variant ID, audit result, filled fields with T3 flags, attach-guard
  // result; status ready_for_review or queued_on_rule, never submitted.
  const snap = isObj(p.posting_snapshot) ? p.posting_snapshot : isObj(p.posting) ? p.posting : null;
  if (snap && (nonEmpty(snap.jd_text) || nonEmpty(snap.jdText) || nonEmpty(snap.description))) r._ok("posting_snapshot");
  else if (nonEmpty(p.jd_text) || nonEmpty(p.jdText)) r._ok("posting_snapshot");
  else r._miss("posting_snapshot");
  const variant = (isObj(p.binding) && p.binding.version) || p.variant_id || p.variantId || p.resume_version || null;
  if (nonEmpty(variant) || isNum(variant)) r._ok("variant_id"); else r._miss("variant_id");
  const audit = isObj(p.audit_result) ? p.audit_result : isObj(p.audit) ? p.audit : isObj(p.packet) && isObj(p.packet.audit) ? p.packet.audit : null;
  if (audit && (audit.ok === true || audit.passed === true || nonEmpty(audit.result)) && (arr(audit.dropped_lines) || arr(audit.dropped) || audit.every_line_cites_fact === true)) r._ok("audit_result");
  else r._miss("audit_result");
  const fields = arr(p.filled_fields) || arr(p.fields) || (isObj(p.packet) ? arr(p.packet.filled_fields) : null);
  if (fields && fields.length) {
    r._ok("filled_fields");
    if (fields.every((f) => isObj(f) && ("t3" in f || "t3_flag" in f || "is_t3" in f))) r._ok("t3_flags");
    else r._miss("t3_flags");
  } else { r._miss("filled_fields"); r._miss("t3_flags"); }
  const guard = isObj(p.attach_guard) ? p.attach_guard : isObj(p.attach_guard_result) ? p.attach_guard_result : null;
  if (guard && (guard.ok === true || guard.passed === true || guard.blocked === true)) r._ok("attach_guard_result");
  else if (isObj(p.binding) && nonEmpty(p.binding.version) && nonEmpty(p.binding.sha256)) r._ok("attach_guard_result"); // 141/133 binding: version + content hash pin
  else r._miss("attach_guard_result");
  const status = p.status || (isObj(p.doorstep) ? null : null);
  if (status === "ready_for_review" || status === "queued_on_rule") r._ok("status_ready_for_review_or_queued_on_rule");
  else if (p.submitted === false && (p.committed === false || isObj(p.doorstep))) r._ok("status_ready_for_review_or_queued_on_rule"); // emitter form: armed at AWAITING_COMMIT, submitted false
  else r._miss("status_ready_for_review_or_queued_on_rule");
  checkNotCommitted(r, p);
  return r._done();
}

// ---------------------------------------------------------------- F3
function validateF3(r, p) {
  const isCalendar = p.kind === "calendar_proposal" || p.family === "calendar" || isObj(p.card) && arr(p.slot_evaluations);
  if (isCalendar) {
    if (isObj(p.card) && nonEmpty(p.card.title)) r._ok("proposal_card"); else r._miss("proposal_card");
    if (isObj(p.proposed) && (nonEmpty(p.proposed.slot_id) || nonEmpty(p.proposed.start) || nonEmpty(p.proposed.utc))) r._ok("proposed_slot");
    else r._miss("proposed_slot");
    if (arr(p.slot_evaluations) || arr(p.conflicts)) r._ok("conflicts_reported"); else r._miss("conflicts_reported");
    if (p.invite_sent === false && p.committed === false) r._ok("nothing_committed_without_approval");
    else if (p.invite_sent === true || p.committed === true) r._bad("nothing_committed_without_approval", "invite_sent false, committed false", JSON.stringify({ invite_sent: p.invite_sent, committed: p.committed }));
    return r._done();
  }
  // Doorstep (03 F3): a log write with source = inbox | user_reported |
  // portal, a timeline event, and any triggered follow-ups.
  const hasWrite = p.kind === "tracker_log_write" || isObj(p.would_write) || nonEmpty(p.operation);
  if (hasWrite) r._ok("log_write"); else r._miss("log_write");
  const ev = isObj(p.event) ? p.event : isObj(p.timeline_event) ? p.timeline_event : null;
  const src = (ev && ev.source) || p.source || null;
  if (src == null) r._miss("log_write.source");
  else if (["inbox", "user_reported", "portal"].includes(src)) r._ok("log_write.source");
  else r._bad("log_write.source", "one of inbox | user_reported | portal", JSON.stringify(src));
  if (ev && nonEmpty(ev.type) && nonEmpty(ev.at)) r._ok("timeline_event"); else r._miss("timeline_event");
  const before = (isObj(p.application) && p.application.stage_before) || p.stage_before || null;
  const after = p.status || p.stage || (ev && ev.stage_after) || null;
  if (nonEmpty(before) && nonEmpty(after)) r._ok("stage_change_before_after"); else r._miss("stage_change_before_after");
  if (arr(p.triggered_followups) || arr(p.followups) || arr(p.triggered)) r._ok("triggered_followups");
  else r._miss("triggered_followups");
  checkNotCommitted(r, p);
  return r._done();
}

// ---------------------------------------------------------------- F4
function validateF4(r, p) {
  // Doorstep (03 F4): ranked paths with a shared fact per person, and
  // drafts held as cards. A departed-contact check before any draft.
  const paths = arr(p.paths) || arr(p.ranked_paths) || (Array.isArray(p) ? p : null);
  if (paths && paths.length) {
    r._ok("ranked_paths");
    const scores = paths.map((x) => (isNum(x.score) ? x.score : isNum(x.warmth_score) ? x.warmth_score : null));
    if (scores.every((s) => s != null)) {
      const sorted = scores.every((s, i) => i === 0 || scores[i - 1] >= s);
      if (sorted) r._ok("warmth_rank_order");
      else r._bad("warmth_rank_order", "paths sorted by descending warmth score", JSON.stringify(scores));
    }
    const noFact = paths.filter((x) => {
      if (nonEmpty(x.shared_fact) && !/^no shared fact/i.test(x.shared_fact)) return false;
      if (arr(x.why) && x.why.length) return false; // 135 findPaths: shared facts ride in `why`
      return true;
    });
    if (!noFact.length) r._ok("shared_fact_per_person");
    else r._bad("shared_fact_per_person", "a shared fact for every ranked person",
      "no shared fact for: " + noFact.map((x) => x.name || x.person_id || "?").join(", "));
  } else r._miss("ranked_paths");
  if (arr(p.excluded) || p.departed_check != null || (paths || []).every((x) => x && ("at_company" in x || "departed" in x || isObj(x.exclusion) || x.exclusion === null))) r._ok("departed_contact_check");
  else r._miss("departed_contact_check");
  const drafts = arr(p.drafts) || (isObj(p.draft) ? [p.draft] : null);
  const heldCards = arr(p.cards) || arr(p.draft_cards);
  if ((drafts && drafts.length && drafts.every((d) => isObj(d) && (d.held_as_card === true || d.card != null || d.status === "held"))) || (heldCards && heldCards.length)) r._ok("drafts_held_as_cards");
  else r._miss("drafts_held_as_cards");
  return r._done();
}

// ---------------------------------------------------------------- F5
function validateF5(r, p) {
  // Doorstep (03 F5): a prep record with its sources. Reply rules folded
  // in as record elements: company-specific content grounded in the
  // company file with its as-of date; the user's own stories mapped to
  // questions (or an explicit no-fit statement).
  if (nonEmpty(p.company) && (p.status === "OK" || isObj(p.brief) || arr(p.sections))) r._ok("prep_record");
  else if (isObj(p.pack) || arr(p.sections)) r._ok("prep_record");
  else r._miss("prep_record");
  const sources = arr(p.sources) || (isObj(p.brief) ? arr(p.brief.sources) : null);
  if (sources && sources.length) {
    r._ok("sources");
    if (sources.every((s) => isObj(s) && nonEmpty(s.as_of))) r._ok("sources_as_of");
    else r._bad("sources_as_of", "every source carries an as-of date", JSON.stringify(sources.map((s) => s && s.as_of)));
  } else { r._miss("sources"); r._miss("sources_as_of"); }
  const stages = arr(p.stages) || (isObj(p.brief) ? arr(p.brief.stages) : null);
  if (nonEmpty(p.bar) || (stages && stages.length) || (isObj(p.brief) && (nonEmpty(p.brief.bar) || arr(p.brief.stages).length))) r._ok("company_specific_content");
  else r._miss("company_specific_content");
  const stories = arr(p.stories) || arr(p.story_map) || arr(p.mapped_stories);
  if (stories && stories.length) r._ok("stories_mapped");
  else if (p.no_fit_statement === true || nonEmpty(p.stories_note)) r._ok("stories_mapped");
  else r._miss("stories_mapped_or_no_fit_statement");
  return r._done();
}

// ---------------------------------------------------------------- F6
function validateF6(r, p) {
  // Doorstep (03 F6): a parsed offer record — base, bonus, equity with
  // vesting, sign-on, benefits notes, start date, expiry.
  const need = [
    ["base", p.base_salary ?? p.base],
    ["bonus", p.annual_bonus ?? p.bonus],
    ["sign_on", p.signing_bonus ?? p.sign_on],
    ["start_date", p.start_date],
    ["expiry", p.expiry_date ?? p.expiry],
  ];
  for (const [name, v] of need) { if (v != null && v !== "") r._ok(name); else r._miss(name); }
  const eq = isObj(p.equity) ? p.equity : null;
  if (eq && (eq.vest_years != null || nonEmpty(eq.vesting))) r._ok("equity_with_vesting");
  else r._miss("equity_with_vesting");
  if ("benefits" in p || "benefits_notes" in p) r._ok("benefits_notes"); else r._miss("benefits_notes");
  if (arr(p.missing)) { // 128's own missing list must be empty for a complete parse
    if (p.missing.length) r._bad("parse_complete", "parsed record lists no missing fields", "missing: " + p.missing.join(", "));
    else r._ok("parse_complete");
  }
  return r._done();
}

// ---------------------------------------------------------------- F7
function validateF7(r, p) {
  // Doorstep (03 F7): for builds, a company file validated against its
  // schema; for answers, a cited response. Reply: bottom line first
  // (<30-word first sentence), basis (source class, sample size, as-of
  // date), a plan of 3-5 concrete actions with time frames.
  const isCompanyFile = isObj(p) && (nonEmpty(p.company_id) || nonEmpty(p.company_name)) && (p.process_stages != null || p.status_facts != null);
  if (isCompanyFile) {
    // Schema validation is 125's validateCIR; accept its verdict shape
    // or the file's own verification stamp.
    if (p.validated === true || nonEmpty(p.last_verified_at)) r._ok("validated_company_file");
    else r._miss("validated_company_file");
    if (nonEmpty(p.last_verified_at) || nonEmpty(p.as_of)) r._ok("last_verified_at"); else r._miss("last_verified_at");
    if (arr(p.sources) || isObj(p.sources) || p.status_facts != null) r._ok("sources"); else r._miss("sources");
    return r._done();
  }
  const text = nonEmpty(p.text) ? p.text : nonEmpty(p.reply) ? p.reply : "";
  if (text) {
    const first = text.split(/(?<=[.!?])\s/)[0] || "";
    const words = first.trim().split(/\s+/).filter(Boolean).length;
    if (words > 0 && words < 30) r._ok("bottom_line_first_sentence_under_30_words");
    else r._bad("bottom_line_first_sentence_under_30_words", "first sentence under 30 words", `first sentence is ${words} words`);
  } else r._miss("bottom_line_first");
  const sources = arr(p.sources);
  if (sources && sources.length) {
    r._ok("sources");
    const dated = sources.every((s) => isObj(s) ? nonEmpty(s.as_of) || nonEmpty(s.date) : false);
    if (dated || nonEmpty(p.as_of)) r._ok("basis_as_of_date"); else r._miss("basis_as_of_date");
  } else { r._miss("sources"); r._miss("basis_as_of_date"); }
  const plan = arr(p.plan) || arr(p.actions) || arr(p.steps) || arr(p.paths);
  if (plan && plan.length >= 3 && plan.length <= 5) r._ok("action_plan_3_to_5");
  else r._miss("action_plan_3_to_5");
  return r._done();
}

// ---------------------------------------------------------------- F8
function validateF8(r, p) {
  // Doorstep (03 F8): a stored record (win, watch, plan) with dates.
  const id = p.win_id || p.watch_id || p.plan_id || p.record_id || p.id || null;
  if (nonEmpty(id) || isNum(id)) r._ok("stored_record_id"); else r._miss("stored_record_id");
  const date = p.date || p.created_at || p.at || p.as_of || null;
  if (nonEmpty(date)) r._ok("record_date"); else r._miss("record_date");
  if (isObj(p.criteria) || nonEmpty(p.text) || nonEmpty(p.title) || arr(p.steps) || arr(p.actions)) r._ok("record_content");
  else r._miss("record_content");
  // Never: a playbook/plan ask answered with a job list (SC-277 shape).
  if (arr(p.shortlist) || arr(p.jobs) || arr(p.roles)) r._bad("no_job_list_for_plan_ask", "a stored OS record, not a job list", "record carries a job/role list");
  return r._done();
}

// ---------------------------------------------------------------- F9
function validateF9(r, p) {
  // Doorstep (03 F9): a connection record with its self-test result
  // (test email received, test event created), a disconnection record,
  // an audit list, or a halt record.
  const isHalt = p.intent === "queue_halt" || p.halted != null || arr(p.halted_items) || isObj(p.halt);
  if (isHalt) {
    const h = isObj(p.halt) ? p.halt : p;
    const sent = h.sent_count ?? h.sent, inflight = h.in_flight_count ?? h.in_flight, halted = h.halted_count ?? (arr(h.halted_items) ? h.halted_items.length : h.halted);
    const total = h.queue_total ?? h.total;
    if (isNum(sent) && isNum(inflight) && isNum(halted)) {
      r._ok("halt_counts");
      if (isNum(total) && sent + inflight + halted !== total) r._bad("halt_counts_reconcile", "sent + in-flight + halted = queue total", `${sent}+${inflight}+${halted} != ${total}`);
      else if (isNum(total)) r._ok("halt_counts_reconcile");
    } else r._miss("halt_counts");
    if (h.pause_flag_set === true || h.global_pause === true) r._ok("global_pause_flag_set"); else r._miss("global_pause_flag_set");
    return r._done();
  }
  const accounts = arr(p.accounts);
  if (accounts && accounts.length && accounts.every((a) => isObj(a) && nonEmpty(a.provider || a.source))) {
    r._ok("connection_record");
    if (accounts.every((a) => nonEmpty(a.connected_at))) r._ok("connection_record.connected_at");
    else r._miss("connection_record.connected_at");
  } else if (nonEmpty(p.provider || p.source) && nonEmpty(p.connected_at)) r._ok("connection_record");
  else r._miss("connection_record");
  const st = isObj(p.self_test) ? p.self_test : isObj(p.self_test_result) ? p.self_test_result : null;
  if (st && st.test_email_received === true) r._ok("self_test_result.test_email_received");
  else r._miss("self_test_result.test_email_received");
  if (st && st.test_event_created === true) r._ok("self_test_result.test_event_created");
  else r._miss("self_test_result.test_event_created");
  return r._done();
}

const VALIDATORS = { F1: validateF1, F2: validateF2, F3: validateF3, F4: validateF4, F5: validateF5, F6: validateF6, F7: validateF7, F8: validateF8, F9: validateF9 };

function validate(family, doorstepRecord) {
  const fam = VALIDATORS[family] ? family : ALIASES[String(family || "").toLowerCase()];
  if (!fam || !VALIDATORS[fam]) throw new Error("unknown family: " + family);
  if (!isObj(doorstepRecord) && !Array.isArray(doorstepRecord)) {
    const r = makeResult(fam); r._miss("record"); return r._done();
  }
  const r = makeResult(fam);
  const payload = unwrap(r, doorstepRecord);
  return VALIDATORS[fam](r, payload == null ? {} : payload);
}

// Census helper: validate a {label: record} map, return per-family rows.
function census(entries) {
  return entries.map(({ family, label, record }) => {
    const v = validate(family, record);
    return { family: v.family, label, valid: v.valid, status: v.valid ? "VALID" : "GAP", missing: v.missing, invalid: v.invalid, present: v.present };
  });
}

module.exports = { validate, census, VALIDATORS, ALIASES };
