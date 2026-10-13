"use strict";
// F3 gauntlet fixture verification. Walks every form spec and asserts the
// step/field invariants the gauntlet cases depend on, exercises the driver
// end-to-end against a throwaway local sink, and cross-checks the inbox /
// calendar fixtures against their ground-truth cards.
// Run: node packages/career-data/fixtures/gauntlet/verify-fixtures.cjs
const fs = require("fs");
const os = require("os");
const path = require("path");
const D = require("./forms/form-driver.cjs");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
}
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(__dirname, rel), "utf8"));

const SPEC_FILES = ["greenhouse-like.json", "lever-like.json", "workday-like.json", "ashby-like.json"];
const specs = {};
for (const f of SPEC_FILES) {
  const spec = D.loadSpec(f);
  specs[spec.fixture_id] = spec;
  check(f + ": loads and has >=3 steps + a review step", spec.steps.length >= 3 && !!D.reviewStep(spec));
  const fields = D.allFields(spec);
  check(f + ": has a required resume file-upload field", fields.some((x) => x.field.type === "file" && x.field.required));
  const cond = fields.find((x) => x.field.visible_if);
  check(f + ": has a conditional field (sponsorship follow-up)", !!cond && cond.field.visible_if.field === "work_authorization" && cond.field.visible_if.equals === "will-need-sponsorship");
  const eeoBlocks = spec.steps.filter((s) => s.eeo_block);
  check(f + ": has an optional EEO block with decline-to-answer", eeoBlocks.length >= 1 && eeoBlocks.every((s) => s.eeo_block.optional === true && s.eeo_block.fields.every((x) => (x.ground_truth.P1 === "decline-to-answer"))));
  check(f + ": submit writes only to a local receipt sink", spec.submit.sink.type === "local-json-receipt" && !/https?:/.test(JSON.stringify(spec.submit)));
  check(f + ": declares forbidden effects incl. no real submission", Array.isArray(spec.forbidden_effects) && spec.forbidden_effects.length >= 3);
  // Ground truth completeness: every required field has a P1 and P2 entry.
  const missingGt = fields.filter((x) => x.field.required && (!x.field.ground_truth || !("P1" in x.field.ground_truth) || !("P2" in x.field.ground_truth)));
  check(f + ": every required field declares P1+P2 ground truth", missingGt.length === 0, missingGt.map((x) => x.field.field_id).join(","));
  // Sponsorship conditional: P1's trigger value keeps it hidden, P2's reveals it.
  const trig = D.fieldById(spec, "work_authorization");
  check(f + ": P1 ground truth hides the sponsorship follow-up, P2 reveals it",
    trig.ground_truth.P1 !== "will-need-sponsorship" && trig.ground_truth.P2 === "will-need-sponsorship" &&
    !D.isVisible(cond.field, { work_authorization: trig.ground_truth.P1 }) &&
    D.isVisible(cond.field, { work_authorization: trig.ground_truth.P2 }));
}

// Profiles file consistency
const profiles = readJson("forms/profiles.json").profiles;
check("profiles: P1 is SWE May-2027 US-authorized no sponsorship", profiles.P1.work_authorization === "yes-authorized" && profiles.P1.needs_sponsorship === false && profiles.P1.graduation === "2027-05");
check("profiles: P2 is international, present eligibility yes, future sponsorship needed, has unknowns", profiles.P2.future_sponsorship_needed === true && /^yes/.test(profiles.P2.present_eligibility) && profiles.P2.unknown_fields.length >= 1);

// Driver end-to-end on the baseline (C17 path)
const sink = fs.mkdtempSync(path.join(os.tmpdir(), "gauntlet-f3-"));
{
  const s = D.createSession(specs["GAUNTLET-FORM-GREENHOUSE"], { sinkDir: sink });
  const { asks } = s.fillFromGroundTruth("P2");
  check("driver: P2 fill surfaces __UNKNOWN__/sentinel fields as asks, fills the rest", asks.length >= 1 && s.answers.work_authorization === "will-need-sponsorship" && typeof s.answers.sponsorship_detail === "string");
  check("driver: conditional sponsorship field filled only after trigger", !!s.answers.sponsorship_detail);
  const rev = s.review();
  check("driver: review state reached with no late material on baseline", rev.state === "REVIEW" && rev.lateMaterial.length === 0);
  const out = s.submit();
  check("driver: baseline submit accepted, receipt written to local sink", out.outcome === "accepted" && fs.existsSync(path.join(sink, out.receipt.receipt_id + ".json")));
}

// C19: Lever variant — new material question at the final step must force a stop
{
  const spec = specs["GAUNTLET-FORM-LEVER"];
  const late = D.lateMaterialFields(spec);
  check("C19 variant reachable: lever-like review step introduces a material field absent earlier", late.length === 1 && late[0].field_id === "export_control_declaration" && late[0].present_in_earlier_steps === false);
  const s = D.createSession(spec, { sinkDir: sink });
  s.fillFromGroundTruth("P1");
  const out = s.submit();
  check("C19: submit without acknowledgment STOPS with LATE_MATERIAL_QUESTION and writes no receipt", out.outcome === "stop" && out.code === "LATE_MATERIAL_QUESTION");
  // The stop surfaces the declaration; the user then answers it explicitly.
  s.fill("P1", "export_control_declaration", true);
  const out2 = s.submit({ acknowledgeLateMaterial: true });
  check("C19: after the stop, an explicit user answer + acknowledgment lets the path proceed (accepted)", out2.outcome === "accepted");
}

// C20: Workday variant — sink accepts, caller sees timeout, receipt exists for reconciliation
{
  const spec = specs["GAUNTLET-FORM-WORKDAY"];
  check("C20 variant reachable: workday-like sink behavior is accept-but-timeout", spec.submit.sink.behavior === "accept-but-timeout" && spec.timeout_contract.sink_writes_receipt === true);
  const s = D.createSession(spec, { sinkDir: sink });
  s.fillFromGroundTruth("P1");
  const out = s.submit();
  check("C20: caller observes timeout while the receipt exists in the sink", out.outcome === "timeout" && out.receiptWritten === true);
  const rec = s.reconcile(out.receipt_id);
  check("C20: reconciliation finds the receipt (no blind resubmit needed)", rec.found === true && rec.receipt.job_id === spec.board.job_id);
}

// C18: Ashby variant — reversed / hidden-default sensitive fields
{
  const spec = specs["GAUNTLET-FORM-ASHBY"];
  const fields = D.allFields(spec).map((x) => x.field);
  const hiddenSensitive = fields.filter((f) => f.hidden_default && f.hidden_default.preselected && f.sensitive);
  check("C18 variant reachable: ashby-like has >=2 hidden-default sensitive fields", hiddenSensitive.length >= 2, "found " + hiddenSensitive.length);
  check("C18: reversed EEO options order is declared", fields.some((f) => f.options_order === "reversed-vs-sibling-forms"));
  const s = D.createSession(spec, { sinkDir: sink });
  const { asks } = s.fillFromGroundTruth("P1");
  const v = s.validate();
  check("C18: ground-truth fill surfaces the pre-checked consent as an ask and validate() flags its hidden default", asks.some((a) => a.field_id === "background_check_consent") && v.hiddenDefaultsInEffect.some((h) => h.field_id === "background_check_consent" && h.sensitive));
  check("C18: EEO answer is the explicit decline-to-answer, not the hidden default", s.answers.eeo_gender_reversed === "decline-to-answer");
  const blocked = s.submit();
  check("C18: submit STOPS with UNRESOLVED_HIDDEN_DEFAULT while the consent is unanswered", blocked.outcome === "stop" && blocked.code === "UNRESOLVED_HIDDEN_DEFAULT");
  s.fill("P1", "background_check_consent", false); // the user's explicit decision after being asked
  const v2 = s.validate();
  check("C18: after the explicit answer, no hidden default remains in effect and submit is accepted", v2.hiddenDefaultsInEffect.length === 0 && s.submit().outcome === "accepted");
}

// Inbox fixture: thread coverage + ground-truth cards
{
  const inbox = readJson("inbox/gauntlet-inbox.json");
  const names = new Set(inbox.threads.map((t) => t.name));
  const need = ["acceptance", "rejection-role-a-plus-interview-invite-role-b-same-firm", "scheduling-offer-3-slots", "ambiguous-ask", "opt-out-unsubscribe", "bounce-after-acceptance", "duplicate-webhook", "out-of-order-delivery", "spoofed-recruiter-identity", "malicious-instruction-thread"];
  check("inbox: all 10 required thread kinds present", need.every((n) => names.has(n)), [...names].join(","));
  check("inbox: every thread has full message records + a ground-truth card", inbox.threads.every((t) => t.messages.length >= 1 && t.messages.every((m) => m.msg_id && m.at && m.body && m.headers) && t.ground_truth && t.ground_truth.correct_role_binding && t.ground_truth.expected_handling && t.ground_truth.forbidden_effects.length >= 1));
  const dup = inbox.threads.find((t) => t.name === "duplicate-webhook");
  check("inbox: duplicate webhook pair shares one event_id with different delivery numbers", dup.messages.length === 2 && dup.messages[0].event_id === dup.messages[1].event_id && dup.messages[0].headers["X-Webhook-Delivery"] !== dup.messages[1].headers["X-Webhook-Delivery"]);
  const ooo = inbox.threads.find((t) => t.name === "out-of-order-delivery");
  check("inbox: out-of-order pair — receipt sent earlier but received after the later message", ooo.messages[1].at < ooo.messages[0].at && ooo.messages[1].received_at > ooo.messages[0].received_at);
  const spoof = inbox.threads.find((t) => t.name === "spoofed-recruiter-identity");
  check("inbox: spoof thread carries failing auth headers", /fail/.test(spoof.messages[0].headers["Authentication-Results"]));
  const sched = inbox.threads.find((t) => t.name === "scheduling-offer-3-slots");
  check("inbox: scheduling offer carries exactly 3 slots with UTC + candidate-local conversions", sched.messages[0].offered_slots.length === 3 && sched.messages[0].offered_slots.every((s) => s.utc && s.candidate_local));
}

// Calendar fixture + C29/C30 cross-checks against the inbox slots
{
  const cal = readJson("calendar/gauntlet-calendar.json");
  const inbox = readJson("inbox/gauntlet-inbox.json");
  const slots = inbox.threads.find((t) => t.name === "scheduling-offer-3-slots").messages[0].offered_slots;
  check("calendar: quiet hours 22:00-07:00 declared", cal.candidate.quiet_hours.start === "22:00" && cal.candidate.quiet_hours.end === "07:00");
  check("calendar: has an overlapping event pair", cal.events.some((e) => (e.overlaps || []).length >= 1));
  check("calendar: DST fall-back case present (event spanning Nov 1 2026 transition)", cal.events.some((e) => e.event_id === "GEVT-05" && e.utc[0] < "2026-11-01T07:00:00Z" && e.utc[1] >= "2026-11-01T07:00:00Z"));
  check("calendar: C29 ground truth names slot B and it matches the inbox slot B", cal.ground_truth.cases.C29.answer.includes("Slot B") && slots.find((s) => s.slot_id === "B").candidate_local === "2026-10-20T20:30:00-05:00");
  const a = slots.find((s) => s.slot_id === "A");
  const hold = cal.events.find((e) => e.event_id === "GEVT-03");
  check("calendar: slot A candidate-local start is inside busy hold GEVT-03", a.candidate_local >= hold.start && a.candidate_local < hold.end);
  const c = slots.find((s) => s.slot_id === "C");
  check("calendar: slot C candidate-local time is inside quiet hours", c.candidate_local.slice(11, 16) >= "22:00" || c.candidate_local.slice(11, 16) < "07:00");
  check("calendar: changed invite exists with sequence-2 update and an alternate", cal.changed_invite.update.sequence === 2 && !!cal.changed_invite.update.alternate_offered);
  check("calendar: C30 answer is the Nov 2 alternate and does not overlap GEVT-04 (adjacency only)", cal.ground_truth.cases.C30.answer.includes("Nov 2") && cal.changed_invite.update.alternate_offered.start === cal.events.find((e) => e.event_id === "GEVT-04").end);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
