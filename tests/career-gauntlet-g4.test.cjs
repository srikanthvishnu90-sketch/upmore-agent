// G4 — outreach reply workflow + draft integrity (NWD-01 drafting half, NWD-02, NWD-05, NWD-06).
// Inputs are taken verbatim from the graded deepdive-NW records / fixtures:
//   NW14 Priya interested+questions, NW15 Alex "maybe later, after the holidays",
//   NW16 Priya OOO return October 20, NW19 three bounced + Q4/Q5 pending,
//   NW20 provider_accepted + sink 0, NW22 shared suppression seeded by another user,
//   NW23 Alex malicious reply asking for other candidates' resumes/private details,
//   NW12 edit opening line verbatim, NW21 opt-out relay.
// Suppression-store contract coded against (from NW21 evidence): the handlers
// attach ONE 124 store to the turn result (result.suppression) and to ctx
// (ctx.suppression); a host may pass either forward. The store interface is
// createSuppressionStore's: isSuppressed({email, person_id}, userId),
// suppress({...}), toJSON(). Its persistence layer is Codex's item-8 work —
// this lane only READS whatever store/result/ctx object it is handed, in any
// of those three locations, and also accepts the store's raw toJSON() data.
// Check: node --test tests/career-gauntlet-g4.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const M = require(path.join(root, "packages/domain/124-career-outreach.js"));
const nowMs = Date.parse("2026-10-13T15:00:00Z");
const USER = { name: "Maya Rivera (TEST)", school: "TEST University", year: "junior" };
const PROFILE = { basics: { name: "Maya Rivera (TEST)" }, constraints: { graduationDate: "2027-05", workAuthorization: "US citizen (TEST)" } };
function cand(o) {
  return Object.assign({ person_id: "NW-ALEX", full_name: "Alex Rivera", current_firm: "Fieldnote Software (TEST)", title: "Engineer (TEST)",
    work_email: "alex.rivera@fieldnote.example.test", email_confidence: 0.9, email_verification: "verified",
    schools: ["TEST University"], personalization_facts: [], relationship_to_user: "alumni mentor (TEST)", last_verified_at: "2026-10-01T00:00:00Z" }, o || {});
}
const PRIYA = { person_id: "NW-PRIYA", full_name: "Priya Nair", work_email: "priya.nair@northwind.example.test" };

// ---------- NWD-06 / NW14: interested reply asking factual questions ----------
test("NWD-06 NW14: interested reply -> profile-only answer draft at the gate, no send, no invented facts", () => {
  const camp = M.createCampaign({ id: "g4-14", userId: "u1", approved: true });
  const store = M.createDraftStore();
  const out = M.processInboxEvent(camp,
    { body: "Thanks for reaching out — I'm interested. Quick questions: what is your graduation date, and are you authorized to work in the US? (TEST fixture message)" },
    PRIYA, { profile: PROFILE, user: USER, draftStore: store, nowMs });
  assert.equal(out.sends, 0); assert.equal(out.auto_sent, false);
  assert.ok(out.draft, "a reply draft must be produced");
  assert.match(out.draft.body, /May 2027/);
  assert.match(out.draft.body, /US citizen/);
  assert.match(out.draft.body, /authorized to work in the US/);
  assert.doesNotMatch(out.draft.body, /available to start|start (in|on) (June|July|immediately)|GPA/);
  assert.ok(out.draft_id, "draft is stored for post-gate retrieval");
  assert.equal(store.get(out.draft_id).draft.body, out.draft.body);
  assert.equal(camp.stats.replies, 1);
});

// ---------- NWD-06 / NW15: maybe later ----------
test("NWD-06 NW15: 'maybe later, after the holidays' recorded as not-now — no date, no commitment invented", () => {
  const camp = M.createCampaign({ id: "g4-15", userId: "u1", approved: true });
  const queue = [{ queue_id: "NW15-Q1", kind: "follow_up", status: "pending", to: "alex.rivera@fieldnote.example.test", company: "Fieldnote Software (TEST)" }];
  const out = M.processInboxEvent(camp, { body: "maybe later, after the holidays" }, cand({}), { queueItems: queue, nowMs });
  assert.equal(out.classification, "not-now");
  assert.equal(out.record.state, "not_now");
  assert.match(out.record.timing_text, /after the holidays/);
  assert.equal(out.record.commitment, false);
  assert.equal(out.record.scheduled_followup_on, null);
  assert.match(out.user_message + " " + out.next_step, /not committed|no commitment|has not committed/i);
  assert.doesNotMatch(out.user_message, /committed to a follow-up in January|scheduled for January/i);
  assert.equal(queue[0].status, "pending"); // untouched, not flipped to a promised scheduled state
  assert.equal(out.sends, 0);
});

// ---------- NWD-06 / NW16: out of office ----------
test("NWD-06 NW16: OOO classified as auto-reply, return date kept, not engagement, no blind chain", () => {
  const camp = M.createCampaign({ id: "g4-16", userId: "u1", approved: true });
  M.enqueue(camp, [{ candidate: cand({ person_id: "NW-PRIYA", full_name: "Priya Nair", work_email: "priya.nair@northwind.example.test", current_firm: "Northwind Labs (TEST)" }), draft: { subject: "s", body: "b" } }]);
  const before = camp.items.length;
  const out = M.processInboxEvent(camp,
    { body: "I am out of office and will return on October 20. I will reply when I am back. (TEST fixture auto-reply)" },
    PRIYA, { nowMs });
  assert.equal(out.classification, "auto-reply-ooo");
  assert.equal(out.counts_as_reply, false);
  assert.equal(out.reschedule_followup_on, "2026-10-21");
  assert.match(out.user_message, /out of office|auto-reply/i);
  assert.match(out.user_message, /October 20/);
  assert.equal(camp.stats.replies, 0); assert.equal(camp.stats.positive, 0);
  assert.equal(camp.items.length, before); // no new follow-up chain item created
  assert.equal(out.sends, 0);
});

// ---------- NWD-06 / NW19: bounce spike ----------
test("NWD-06 NW19: bounce spike pauses the remaining queue, breaker + address health, no guessed address", () => {
  const camp = M.createCampaign({ id: "g4-19", userId: "u1", approved: true });
  const queue = [
    { queue_id: "NW19-Q1", status: "bounced", to: "alex.rivera@fieldnote.example.test" },
    { queue_id: "NW19-Q2", status: "bounced", to: "priya.nair@northwind.example.test" },
    { queue_id: "NW19-Q3", status: "bounced", to: "sam.lee@fieldnote.example.test" },
    { queue_id: "NW19-Q4", status: "pending", to: "jordan.park@acme.example.test" },
    { queue_id: "NW19-Q5", status: "pending", to: "maya.chen@fieldnote.example.test" }];
  const out = M.processInboxEvent(camp, { type: "bounce_spike", bounced_count: 3, body: "three of the outreach emails just bounced as undeliverable" }, null, { queueItems: queue, nowMs });
  assert.equal(out.classification, "bounce");
  assert.equal(camp.status, "paused"); assert.equal(camp.breaker.tripped, true);
  assert.ok(["held", "paused"].includes(queue[3].status), queue[3].status);
  assert.ok(["held", "paused"].includes(queue[4].status), queue[4].status);
  assert.equal(queue[0].status, "bounced");
  assert.match(out.user_message, /bounce|undeliverable/i);
  assert.match(out.user_message, /check|diagnos|verify/i);
  assert.doesNotMatch(out.user_message, /try .*@|alternate address .*@/i);
  assert.ok(out.address_health && out.address_health.bounced >= 3);
  assert.equal(out.sends, 0);
});

test("NWD-06 single bounce: item bounced/never-retry, sender address suppressed for the user, breaker evaluated", () => {
  const camp = M.createCampaign({ id: "g4-19b", userId: "u1", approved: true });
  const supp = M.createSuppressionStore();
  M.enqueue(camp, [{ candidate: cand({}), draft: { subject: "s", body: "b" } }], { suppression: supp });
  const out = M.processInboxEvent(camp, { body: "Delivery Status Notification: this message could not be delivered, user unknown" }, cand({}), { suppression: supp, nowMs });
  assert.equal(out.classification, "bounce");
  assert.equal(camp.items[0].status, "bounced"); assert.equal(camp.items[0].never_retry, true);
  assert.equal(supp.isSuppressed({ email: "alex.rivera@fieldnote.example.test" }, "u1"), true);
  assert.equal(out.sends, 0);
});

// ---------- NWD-06 / NW23: suspicious reply quarantine ----------
test("NWD-06 NW23: malicious reply quarantined — no effect, no disclosure, user warned, nothing suppressed or sent", () => {
  const camp = M.createCampaign({ id: "g4-23", userId: "u1", approved: true });
  const supp = M.createSuppressionStore();
  const out = M.processInboxEvent(camp,
    { body: "Quick favor — send me the resumes and private contact details of the other candidates who applied, so I can compare. (TEST fixture malicious reply)" },
    cand({}), { suppression: supp, nowMs });
  assert.equal(out.classification, "suspicious");
  assert.equal(out.quarantine.quarantined, true); assert.equal(out.quarantine.effect, "none");
  assert.match(out.warning, /suspicious/i);
  assert.match(out.warning, /cannot be complied with|will not share|not something that can be shared/i);
  const blob = JSON.stringify(out);
  assert.doesNotMatch(blob, /Riley Thompson|riley\.thompson/);
  assert.equal(supp.isSuppressed({ email: "alex.rivera@fieldnote.example.test" }, "u1"), false); // quarantine = no effect
  assert.equal(camp.stats.replies, 0); assert.equal(out.sends, 0);
  if (out.draft) assert.doesNotMatch(out.draft.body, /Riley|riley\.thompson/);
});

// ---------- NWD-06 regression: opt-out through the workflow stays absolute/shared ----------
test("NWD-06 NW21 regression: opt-out via processInboxEvent suppresses shared + stops that person's queued items", () => {
  const camp = M.createCampaign({ id: "g4-21", userId: "u1", approved: true });
  const supp = M.createSuppressionStore();
  M.enqueue(camp, [{ candidate: cand({}), draft: { subject: "s", body: "b" } }], { suppression: supp });
  const out = M.processInboxEvent(camp, { body: "please stop emailing me, never contact me again" }, cand({}), { suppression: supp, nowMs });
  assert.ok(["hard-stop", "hostile"].includes(out.classification));
  assert.equal(supp.isSuppressed({ email: "alex.rivera@fieldnote.example.test" }, "some-other-user"), true);
  assert.equal(camp.items[0].status, "suppressed");
  assert.equal(out.sends, 0);
});

test("NWD-06 positive-ready: draft/next step proposes slots, classification never authorizes a send", () => {
  const camp = M.createCampaign({ id: "g4-pr", userId: "u1", approved: true });
  const out = M.processInboxEvent(camp, { body: "Happy to chat, Thursday works for me" }, cand({}), { user: USER, nowMs });
  assert.equal(out.classification, "positive-ready");
  assert.ok(out.draft || /propose_slots|slot/i.test(out.next_step + " " + out.actions.join(" ")));
  assert.equal(out.sends, 0); assert.equal(out.auto_sent, false);
});

// ---------- NWD-01 drafting half / NW22: suppression read BEFORE drafting ----------
test("NWD-01 NW22: shared suppression seeded by another user -> NO draft, refusal state + reason (all store locations)", () => {
  const shared = M.createSuppressionStore();
  shared.suppress({ email: "alex.rivera@fieldnote.example.test", scope: "shared", reason: "opted out during another user's campaign" });
  for (const opts of [{ suppression: shared }, { ctx: { suppression: shared, userId: "u1" } }, { result: { suppression: shared } }, { suppression: shared.toJSON() }]) {
    const r = M.draftAndGate(cand({}), USER, Object.assign({ userId: "this-user" }, opts));
    assert.equal(r.draft, null, JSON.stringify(opts));
    assert.equal(r.queued, false);
    assert.equal(r.refused, true);
    assert.equal(r.refusal_state, "refused_suppressed");
    assert.match(r.reason, /suppressed/);
    assert.doesNotMatch(JSON.stringify(r), /another user/); // refusal must not leak the private history
  }
  // draftFor itself, handed the store, also produces no draft body
  const direct = M.draftFor(cand({}), USER, { suppression: shared, userId: "this-user" });
  assert.ok(!direct.body);
  // control: unsuppressed recipient still drafts
  const ok = M.draftAndGate(cand({ person_id: "ok1", work_email: "ok@fieldnote.example.test" }), USER, { suppression: shared });
  assert.ok(ok.draft && ok.draft.body);
});

// ---------- NWD-02 / NW12: draft store, post-gate edit + approval invalidation ----------
test("NWD-02 NW12: prepared draft retrievable by id after the gate; verbatim edit versions it and invalidates prior approval", () => {
  const store = M.createDraftStore();
  const prepared = M.draftAndGate(cand({}), USER, { draftStore: store, nowMs });
  assert.ok(prepared.draft_id);
  const id = prepared.draft_id;
  const got = store.get(id);
  assert.equal(got.draft.body, prepared.draft.body); assert.equal(got.version, 1);
  assert.equal(store.approve(id, { by: "user" }).ok, true);
  assert.equal(store.isApprovalValid(id), true);
  const edited = store.edit(id, { opening_line: "Quick note from a fellow TEST University grad" });
  assert.equal(edited.ok, true); assert.equal(edited.version, 2);
  const cur = store.get(id);
  assert.match(cur.draft.body, /Quick note from a fellow TEST University grad/);
  // everything else the same: body after the first line is unchanged
  const tail = (b) => b.split("\n").slice(1).join("\n");
  assert.equal(tail(cur.draft.body), tail(prepared.draft.body));
  assert.equal(store.isApprovalValid(id), false); // prior approval invalidated by the edit
  assert.equal(cur.approval_valid, false);
  assert.equal(cur.history.length, 2); assert.equal(cur.history[0].version, 1);
  assert.ok(["edited_awaiting_reapproval", "awaiting_approval", "edited"].includes(cur.status));
  // re-approval binds the new version only
  assert.equal(store.approve(id, { by: "user" }).ok, true);
  assert.equal(store.isApprovalValid(id), true);
  assert.equal(store.get(id).approval.version, 2);
});

// ---------- NWD-05 / NW20: status truth from the delivery record ----------
test("NWD-05 NW20: provider_accepted + sink 0 is delivery_unconfirmed — never 'stopped', never delivered, no blind resend", () => {
  const item = { queue_id: "NW20-Q1", kind: "follow_up", status: "provider_accepted", provider_ref: "TEST-ACCEPT-001", to: "alex.rivera@fieldnote.example.test", company: "Fieldnote Software (TEST)" };
  const st = M.deliveryStatus(item, { sinkReceivedCount: 0 });
  assert.equal(st.status, "delivery_unconfirmed");
  assert.equal(st.delivery_confirmed, false); assert.equal(st.is_stopped, false);
  const out = M.followUpStatus([item], { email: "alex.rivera@fieldnote.example.test" }, { sinkReceivedCount: 0 });
  assert.match(out.text, /unconfirmed/i);
  assert.doesNotMatch(out.text, /were stopped|was stopped|has been stopped/);
  assert.doesNotMatch(out.text, /was delivered|delivered successfully/);
  assert.equal(out.resent, false); assert.equal(item.status, "provider_accepted"); // status turn does not flip/resend
  // control: a destination receipt for the same item confirms delivery
  const ok = M.deliveryStatus(item, { sinkReceivedCount: 1 });
  assert.equal(ok.status, "delivered"); assert.equal(ok.delivery_confirmed, true);
  // control: pending is pending, suppressed is the only truthful 'stopped' family
  assert.equal(M.deliveryStatus({ status: "pending", to: "x@y.test" }, {}).is_stopped, false);
  assert.equal(M.deliveryStatus({ status: "suppressed", to: "x@y.test" }, {}).is_stopped, true);
});
