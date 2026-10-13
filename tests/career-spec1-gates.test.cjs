/* career-spec1-gates.test.cjs — Spec 1 §12's 32 adversarial scenarios in the
 * grader corpus (owner order 2026-10-13: Spec 1 folds in like Specs 2/3 did).
 * Live where the system-under-test exists in modules 124/146; REGISTERED as
 * skipped-with-reason where it doesn't — a registered case is NEVER a pass.
 *
 * The §5/§6 audit behind the live cases (2026-10-13):
 *  - §6 verification states: 124's normalizeCandidate passed ANY incoming
 *    verification string through verbatim, and buildList/enqueue/planWave
 *    only recognized this module's own vocabulary (verified/risky/invalid).
 *    Vendor/Spec-1 vocabulary — unknown, unverified, accept_all, catch_all,
 *    stale, generic, valid, disposable — was silently treated as ordinary
 *    sendable and escaped the 10% risky cap. Fixed by normalizing at the
 *    normalizeCandidate choke point; unknown is HELD, never upgraded.
 *  - 146's normEmailStatus had the same defect class on the intake side:
 *    "UNVERIFIED" and "not verified" normalized to "verified" (substring
 *    match on "verif"). Fixed with a negation guard before the verif branch.
 *  - §5 identity labels: neither module assigns identity labels, so nothing
 *    could be upgraded into a confirmation — but 146 silently DROPPED the
 *    relationship bridge (the §5 alumni_bridge / prior_relationship
 *    evidence) from pasted lists. Fixed: the Relationship column is carried
 *    verbatim as relationship_to_user, never mapped to a stronger claim,
 *    and intake never invents an identity label.
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const Outreach = require("../packages/domain/124-career-outreach.js");
const Intake = require("../packages/domain/146-career-intake.js");
const { CASES } = require("./fixtures/spec1-adversarial-corpus.cjs");

const cand = (o) => Object.assign({ person_id: "p1", full_name: "Person One (TEST)", work_email: "person@firm0.com",
  current_firm: "Firm0 (TEST)", title: "Analyst", office: "New York", schools: [], personalization_facts: [] }, o || {});
const countingTransport = () => { const t = { calls: 0, send: async () => { t.calls++; return { messageId: "m" + t.calls }; } }; return t; };

test("S1 corpus integrity: all 32 §12 cases present exactly once; live + registered = 32", () => {
  assert.equal(CASES.length, 32);
  assert.deepEqual(CASES.map((c) => c.n).sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i + 1));
  const live = CASES.filter((c) => c.mode === "live"), reg = CASES.filter((c) => c.mode === "registered");
  assert.equal(live.length + reg.length, 32);
  for (const c of reg) assert.ok(c.reason && c.reason.length > 20, `case ${c.n} needs a named reason`);
});

// ---------- §6 audit unit checks (the normalization choke point) ----------
test("S1 §6: normalizeCandidate maps every incoming verification vocabulary to the module's states — unknown never upgrades", () => {
  const m = (v) => Outreach.normalizeCandidate(cand({ email_verification: v })).email_verification;
  assert.equal(m("verified"), "verified");
  assert.equal(m("valid"), "verified");
  assert.equal(m("deliverable"), "verified");
  assert.equal(m("invalid"), "invalid");
  assert.equal(m("disposable"), "invalid");
  assert.equal(m("risky"), "risky");
  assert.equal(m("accept_all"), "risky");   // catch-all certainty is uncertainty (also §12 #7)
  assert.equal(m("catch_all"), "risky");
  assert.equal(m("unknown"), "unknown");
  assert.equal(m("UNVERIFIED"), "unknown");
  assert.equal(m("not_verified"), "unknown");
  assert.equal(m("stale"), "unknown");       // refresh before relying = held
  assert.equal(m("generic"), "unknown");     // a role inbox is not a verified person (§12 #6)
  assert.equal(m("some_vendor_word_we_never_saw"), "unknown"); // unrecognized claims fail closed
  assert.equal(m(null), null);
  assert.equal(m(undefined), null);
});

// ---------- §12 live cases: intake (146) ----------
test("S1 §12 #1: identical names at different offices stay separate people at intake", () => {
  const csv = ["Name,Firm,Title,Office,Email,Email Status,Currency",
    "Jamie Rivera,Blair & Co,Analyst,Chicago,jamie.rivera@blairco.example,VERIFIED,current",
    "Jamie Rivera,Blair & Co,Analyst,New York,jamie.rivera@blairco.example,VERIFIED,current"].join("\n");
  const r = Intake.intake({ pastedText: csv });
  assert.equal(r.counts.received, 2);
  assert.equal(r.counts.deduped, 2);
  assert.equal(r.counts.current, 2);
});

test("S1 §12 #2: a record whose registration ended is held out of current/ready even though the address still parses", () => {
  const csv = ["Name,Firm,Title,Office,Email,Email Status,Currency,Currency Note",
    "Annie Nyqvist,William Blair,Analyst,Chicago,annie.nyqvist@williamblair.example,INFERRED-HELD,Stale,FINRA registration ended 03/2024",
    "Jamie Rivera,Blair & Co,Analyst,Chicago,jamie.rivera@blairco.example,VERIFIED,current,"].join("\n");
  const r = Intake.intake({ pastedText: csv });
  assert.equal(r.counts.received, 2);
  assert.equal(r.counts.current, 1);
  assert.equal(r.counts.ready, 1);
  const flagged = r.flagged.find((f) => f.full_name === "Annie Nyqvist");
  assert.ok(flagged && flagged.reason === "currency_stale");
  assert.equal(flagged.note, "FINRA registration ended 03/2024");
});

test("S1 §6 (146): a pasted status of UNVERIFIED / 'not verified' / 'not published' never normalizes to a confirmation", () => {
  const csv = ["Name,Firm,Title,Office,Email,Email Status,Currency",
    "A One,Firm A,Analyst,Chicago,a@firma.example,UNVERIFIED,current",
    "B Two,Firm B,Analyst,Chicago,b@firmb.example,not verified,current",
    "C Three,Firm C,Analyst,Chicago,c@firmc.example,not published,current",
    "D Four,Firm D,Analyst,Chicago,d@firmd.example,VERIFIED,current",
    "E Five,Firm E,Analyst,Chicago,e@firme.example,published,current"].join("\n");
  const r = Intake.intake({ pastedText: csv });
  const by = {}; for (const rec of r.records) by[rec.full_name] = rec.email_status;
  assert.equal(by["A One"], "unverified");
  assert.equal(by["B Two"], "unverified");
  assert.equal(by["C Three"], "unverified");
  assert.equal(by["D Four"], "verified");   // control: a real confirmation still reads as one
  assert.equal(by["E Five"], "published");  // control
});

test("S1 §5 (146): the relationship bridge is carried verbatim from a pasted list — and never becomes an identity label", () => {
  const csv = ["Name,Firm,Title,Office,Email,Email Status,Currency,Relationship",
    "Jamie Rivera,Blair & Co,Analyst,Chicago,jamie@blairco.example,VERIFIED,current,DePaul alumni"].join("\n");
  const r = Intake.intake({ pastedText: csv });
  const rec = r.records[0];
  assert.equal(rec.relationship_to_user, "DePaul alumni");
  assert.ok(!("identity_label" in rec), "intake must never invent a §5 identity label");
  assert.ok(!("confirmed_job_contact" in rec));
});

// ---------- §12 live cases: outreach (124) ----------
test("S1 §12 #6/#8: unknown and generic-inbox candidates are held out of the sendable list and refused at the queue", () => {
  const pool = Outreach.buildList([
    cand({ person_id: "u1", work_email: "u1@firm1.com", current_firm: "Firm1", email_verification: "unknown", email_confidence: 0.95 }),
    cand({ person_id: "g1", work_email: "careers@firm2.com", current_firm: "Firm2", email_verification: "generic", email_confidence: 0.95 }),
    cand({ person_id: "v1", work_email: "v1@firm3.com", current_firm: "Firm3", email_verification: "verified", email_confidence: 0.9 }),
  ], {}, {});
  assert.equal(pool.yield.sendable, 1);
  assert.equal(pool.exclusions.unknown_verification, 2);
  assert.deepEqual(pool.selected.map((c) => c.person_id), ["v1"]);
  const campaign = Outreach.createCampaign({ approved: true });
  const res = Outreach.enqueue(campaign, [{ candidate: cand({ email_verification: "unknown" }), draft: { subject: "s", body: "b" } }]);
  assert.equal(res[0].status, "rejected");
  assert.equal(res[0].reason, "verification_unknown_held");
});

test("S1 §12 #7: catch-all is risky at the verifier, rides the 10% wave cap, and a vendor 'accept_all' label lands in the same bucket", async () => {
  const verifier = Outreach.createLocalVerifier({ dnsLookup: async () => ({ mx: ["mx.firm.example"], catchAll: true }) });
  const v = await verifier.verify("someone@firm.example");
  assert.equal(v.status, "risky");
  assert.ok(v.confidence <= 0.5, "a catch-all score must never read as delivery certainty");
  const campaign = Outreach.createCampaign({ approved: true });
  const entries = [];
  for (let i = 0; i < 20; i++) entries.push({ candidate: cand({ person_id: "p" + i, full_name: "Person " + i, work_email: `p${i}@firm${i}.com`, current_firm: "Firm" + i, email_verification: "verified" }), draft: { subject: "s", body: "b" } });
  Outreach.enqueue(campaign, entries);
  for (let i = 0; i < 5; i++) campaign.items[i].verification = "risky";
  const plan = Outreach.planWave(campaign, { waveNumber: 1, seed: 42 });
  const deferredRisky = plan.deferred.filter((d) => d.reason === "risky_over_10pct_of_wave");
  assert.equal(deferredRisky.length, 3); // floor(20 * 0.10) = 2 risky ride; the other 3 defer
  // the same address arriving with a vendor accept_all label normalizes to risky at enqueue:
  const c2 = Outreach.createCampaign({ approved: true });
  const r2 = Outreach.enqueue(c2, [{ candidate: cand({ email_verification: "accept_all" }), draft: { subject: "s", body: "b" } }]);
  assert.equal(r2[0].status, "queued");
  assert.equal(r2[0].verification, "risky");
});

test("S1 §12 #9: a 500-person ask over a 10-person qualifying pool returns 10 with honest counts — never padded", () => {
  const records = [];
  for (let i = 0; i < 10; i++) records.push(cand({ person_id: "q" + i, full_name: "Qualifier " + i, work_email: `q${i}@firm${i}.com`, current_firm: "Firm" + i, email_verification: "verified", email_confidence: 0.9 }));
  const pool = Outreach.buildList(records, { count: 500 }, {});
  assert.equal(pool.yield.found, 10);
  assert.equal(pool.yield.sendable, 10);
  assert.equal(pool.selected.length, 10);
});

test("S1 §12 #10: a suppressed person re-arriving from a different source stays suppressed at list-build and at the queue", () => {
  const store = Outreach.createSuppressionStore();
  store.suppress({ email: "gone@firm9.com", scope: "shared", reason: "legal_removal" });
  const pool = Outreach.buildList([cand({ person_id: "x1", work_email: "gone@firm9.com", current_firm: "Firm9", email_verification: "verified", source_list: ["a_completely_different_source"] })], {}, { suppression: store, userId: "user-1" });
  assert.equal(pool.exclusions.suppressed, 1);
  assert.equal(pool.selected.length, 0);
  const campaign = Outreach.createCampaign({ approved: true });
  const res = Outreach.enqueue(campaign, [{ candidate: cand({ work_email: "gone@firm9.com", email_verification: "verified" }), draft: { subject: "s", body: "b" } }], { suppression: store });
  assert.equal(res[0].status, "rejected");
  assert.equal(res[0].reason, "suppressed");
});

test("S1 §12 #14: the same person queued twice sends exactly once (idempotency key)", async () => {
  const campaign = Outreach.createCampaign({ approved: true });
  const entry = { candidate: cand({ email_verification: "verified" }), draft: { subject: "s", body: "b" } };
  Outreach.enqueue(campaign, [entry, entry]);
  assert.equal(campaign.items.length, 2);
  assert.equal(campaign.items[0].idempotencyKey, campaign.items[1].idempotencyKey);
  const transport = countingTransport();
  const out = await Outreach.sendPending(campaign, { transport });
  assert.equal(transport.calls, 1);
  assert.equal(out.sent, 1);
  assert.ok(out.outcomes.some((o) => o.result === "already_sent_idempotent"));
});

test("S1 §12 #17/#18: editing a reviewed draft — recipient included — kills its approval until re-approved", () => {
  const store = Outreach.createDraftStore();
  const rec = store.put({ body: "Hi Jamie — DePaul sophomore here.", subject: "Coffee chat?", to: "jamie@blairco.example", tier: "B" }, {});
  assert.ok(rec && rec.id);
  assert.equal(store.approve(rec.id, { by: "user" }).ok, true);
  assert.equal(store.isApprovalValid(rec.id), true);
  const edited = store.edit(rec.id, { to: "someone-else@blairco.example" });
  assert.equal(edited.ok, true);
  assert.equal(edited.invalidated_approvals, 1);
  assert.equal(edited.approval_valid, false);
  assert.equal(store.isApprovalValid(rec.id), false);
  assert.equal(store.approve(rec.id, { by: "user" }).ok, true);
  assert.equal(store.isApprovalValid(rec.id), true);
});

test("S1 §12 #21: an opt-out landing after queueing kills the pending send at send time", async () => {
  const store = Outreach.createSuppressionStore();
  const campaign = Outreach.createCampaign({ approved: true });
  Outreach.enqueue(campaign, [{ candidate: cand({ email_verification: "verified" }), draft: { subject: "s", body: "b" } }], { suppression: store });
  store.suppress({ email: "person@firm0.com", scope: "shared", reason: "opt_out" });
  const transport = countingTransport();
  const out = await Outreach.sendPending(campaign, { transport, suppression: store });
  assert.equal(out.sent, 0);
  assert.equal(transport.calls, 0);
  assert.equal(campaign.items[0].status, "suppressed");
  assert.equal(out.outcomes[0].result, "suppressed_at_send_time");
});

test("S1 §12 #22: a redirect reply creates at most a referred candidate — no send, no attachment action", () => {
  const campaign = Outreach.createCampaign({ approved: true });
  const store = Outreach.createSuppressionStore();
  const cls = Outreach.classifyReply({ body: "You should talk to Priya Shah about that group", subject: "Re: coffee chat" });
  assert.equal(cls.classification, "referral-to-other");
  const out = Outreach.handleReply(campaign, { body: "You should talk to Priya Shah about that group", subject: "Re: coffee chat" }, { email: "person@firm0.com", person_id: "p1" }, { suppression: store });
  assert.ok(out.new_candidate && out.new_candidate.full_name === "Priya Shah");
  assert.equal(out.new_candidate.relationship_to_user, "referral");
  assert.equal(campaign.items.length, 0); // nothing queued, nothing sent
});

test("S1 §12 #27: EU/UK recipients are excluded at list-build and refused at the queue (locked v1 rule)", () => {
  const pool = Outreach.buildList([cand({ person_id: "uk1", work_email: "uk@firmuk.com", current_firm: "FirmUK", country: "GB", email_verification: "verified" })], {}, {});
  assert.equal(pool.exclusions.eu_uk, 1);
  assert.equal(pool.selected.length, 0);
  const campaign = Outreach.createCampaign({ approved: true });
  const res = Outreach.enqueue(campaign, [{ candidate: cand({ country: "GB", email_verification: "verified" }), draft: { subject: "s", body: "b" } }]);
  assert.equal(res[0].status, "rejected");
  assert.equal(res[0].reason, "eu_uk_excluded_v1");
});

test("S1 §12 #30: a user-scoped suppression never leaks to another user; only shared opt-outs cross", () => {
  const store = Outreach.createSuppressionStore();
  store.suppress({ email: "priv@firm.com", userId: "user-a", scope: "user", reason: "decline" });
  assert.equal(store.isSuppressed({ email: "priv@firm.com" }, "user-a"), true);
  assert.equal(store.isSuppressed({ email: "priv@firm.com" }, "user-b"), false);
  store.suppress({ email: "optout@firm.com", scope: "shared", reason: "opt_out" });
  assert.equal(store.isSuppressed({ email: "optout@firm.com" }, "user-b"), true);
});

test("S1 §12 #31: an unapproved (research-only) campaign sends nothing even with a queue and a transport", async () => {
  const campaign = Outreach.createCampaign({}); // status: draft — never approved
  Outreach.enqueue(campaign, [{ candidate: cand({ email_verification: "verified" }), draft: { subject: "s", body: "b" } }]);
  assert.equal(campaign.items.length, 1);
  const transport = countingTransport();
  const out = await Outreach.sendPending(campaign, { transport });
  assert.equal(out.sent, 0);
  assert.equal(out.error, "campaign_not_approved");
  assert.equal(transport.calls, 0);
});

// ---------- §12 registered cases: SKIPPED with the reason named ----------
// A registered case is not a pass and never counts toward one; each names
// the missing SUT or the open owner decision that keeps it unbuilt.
for (const c of CASES.filter((x) => x.mode === "registered")) {
  test(`S1 §12 #${c.n} (registered): ${c.title}`, { skip: c.reason }, () => {});
}
