// SEND-DISABLED (owner ruling 2026-10-13 ~19:45 CDT): Upmore's career build must NOT be able
// to send email. Outreach is drafts-only; the send capability itself is hard-disabled at the
// sink in packages/domain/124-career-outreach.js — not merely unused. These tests attempt a
// send through every audited transmission path and prove refusal, and prove the flows that
// must keep working (drafting, queue-for-review, approval gating, reply classification,
// tracking, kill switch) still work. Transports below are MOCK transports, labeled mock —
// no real email is ever sent by this suite.
// Check: node --test tests/career-send-disabled.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const M = require(path.join(root, "packages/domain/124-career-outreach.js"));

const USER = { name: "Vishnu Srikanth", school: "DePaul University", year: "sophomore", year_label: "'28", experience: "running a campus investing club" };
function cand(o) {
  return Object.assign({ person_id: "p1", full_name: "Daniel Kim", current_firm: "Evercore", title: "Analyst", seniority_band: "analyst",
    geography: "NYC", office: "New York", country: "US", schools: ["DePaul University"], work_email: "daniel.kim@evercore.com",
    email_confidence: 0.9, email_verification: "verified", last_verified_at: "2026-10-01T00:00:00Z",
    personalization_facts: [{ fact: "spent a year at a search fund before joining Evercore", source_url: "https://example.com/bio", date: "2026-09-01", strength: "strong", topic: "your search-fund-to-Evercore path" }], relationship_to_user: "same school" }, o || {});
}
function recordingTransport() {
  const t = { kind: "mock", calls: 0, sent: new Map(),
    hasSent: async (k) => t.sent.has(k),
    send: async (msg) => { t.calls++; const id = "mock-" + (t.sent.size + 1); t.sent.set(msg.idempotencyKey, id); return { messageId: id }; } };
  return t;
}
function mockGmailApi() {
  const api = { calls: 0, users: { messages: { send: async () => { api.calls++; return { id: "gmail-real-shaped-1" }; } } } };
  return api;
}
function approvedCampaignWith(n) {
  const c = M.createCampaign({ id: "sd-camp", userId: "u1", approved: true });
  const entries = []; for (let i = 0; i < n; i++) entries.push({ candidate: cand({ person_id: "p" + i, full_name: "Person " + i, work_email: `person${i}@firm${i % 7}.com`, current_firm: "Firm" + (i % 7) }), draft: { subject: "s" + i, body: "b" + i, tier: "B" } });
  M.enqueue(c, entries);
  return c;
}

// ---------- the disable: every transmission path refuses ----------
test("SEND-DISABLED: sendPending refuses even with a working injected transport — 0 transmitted, queue untouched", async () => {
  const c = approvedCampaignWith(3);
  assert.equal(c.items.filter((i) => i.status === "queued").length, 3);
  const t = recordingTransport();
  const r = await M.sendPending(c, { transport: t });
  assert.equal(r.sent, 0);
  assert.equal(r.refused, true);
  assert.match(String(r.error || ""), /^SEND_DISABLED/);
  assert.equal(r.refusal_state, "refused_send_disabled");
  assert.equal(t.calls, 0); // the transport was never invoked
  assert.equal(c.items.filter((i) => i.status === "queued").length, 3); // items stay queued for review
  assert.equal(c.sentKeys.length, 0);
  assert.equal(c.status, "approved"); // never flipped to "running"
});

test("SEND-DISABLED: sendPending refuses a Gmail transport built from a live-shaped Gmail API client", async () => {
  const c = approvedCampaignWith(2);
  const api = mockGmailApi();
  const t = M.createGmailTransport(api);
  const r = await M.sendPending(c, { transport: t });
  assert.equal(r.sent, 0);
  assert.equal(r.refused, true);
  assert.match(String(r.error || ""), /^SEND_DISABLED/);
  assert.equal(api.calls, 0); // gmailApi.users.messages.send never invoked
});

test("SEND-DISABLED: createGmailTransport can no longer construct a transmitting transport", async () => {
  const api = mockGmailApi();
  const t = M.createGmailTransport(api);
  const r = await t.send({ to: "a@firm.com", subject: "Hi", body: "Body text", idempotencyKey: "k1" });
  assert.equal(r.refused, true);
  assert.match(String(r.error || ""), /^SEND_DISABLED/);
  assert.equal(r.messageId, undefined);
  assert.equal(api.calls, 0);
  // Pre-existing contract kept: an absent/invalid client is NOT_WIRED, still no send.
  const tNull = M.createGmailTransport(null);
  const rNull = await tNull.send({ to: "a@firm.com", subject: "Hi", body: "Body text" });
  assert.match(String(rNull.error || ""), /^NOT_WIRED/);
  assert.equal(rNull.messageId, undefined);
});

test("SEND-DISABLED: no campaign state transmits — guards keep their typed refusals, the sink refuses the rest", async () => {
  const t = recordingTransport();
  // Unapproved (draft) campaign: the pre-existing approval guard refuses, typed as before.
  const draft = M.createCampaign({ id: "sd-draft", userId: "u1" });
  M.enqueue(draft, [{ candidate: cand({}), draft: { subject: "s", body: "b" } }]);
  const r1 = await M.sendPending(draft, { transport: t });
  assert.equal(r1.sent, 0); assert.equal(r1.error, "campaign_not_approved");
  // Globally paused campaign: the R-A4 kill-switch seam refuses, typed as before.
  const c2 = approvedCampaignWith(1);
  const r2 = await M.sendPending(c2, { transport: t, globalPause: { set: true, at: "2026-10-13T00:00:00Z", by: "user", scope: "all-queues" } });
  assert.equal(r2.sent, 0); assert.equal(r2.refused, true); assert.equal(r2.refusal_state, "refused_global_pause");
  // No transport injected: NOT_WIRED, as before.
  const c3 = approvedCampaignWith(1);
  const r3 = await M.sendPending(c3, {});
  assert.equal(r3.sent, 0); assert.match(String(r3.error || ""), /^NOT_WIRED/);
  assert.equal(t.calls, 0); // in every state above, nothing was transmitted
});

// ---------- regressions: what must keep working ----------
test("REGRESSION: drafting still works — draftFor + prepareDraft produce a reviewable draft, sends stay 0", () => {
  const d = M.draftFor(cand({}), USER);
  assert.ok(d && typeof d.subject === "string" && d.subject.length > 0);
  assert.ok(typeof d.body === "string" && d.body.length > 0);
  const p = M.prepareDraft(cand({}), USER, {});
  assert.ok(p.draft, "prepared draft exists");
  assert.equal(p.sends, 0);
  assert.equal(p.gate.pass, true);
  assert.equal(p.status, "awaiting_approval");
});

test("REGRESSION: queue-for-review still works — enqueue queues and planWave schedules without any send", () => {
  const c = approvedCampaignWith(3);
  assert.equal(c.items.filter((i) => i.status === "queued").length, 3);
  const plan = M.planWave(c, { seed: 7 });
  assert.equal(plan.wave_items, 3);
  assert.equal(plan.scheduled, 3);
});

test("REGRESSION: reply classification and tracking still work", () => {
  const pos = M.classifyReply({ body: "Happy to chat — Thursday works for me." });
  assert.equal(pos.classification, "positive-ready");
  const stop = M.classifyReply({ body: "Please stop emailing me." });
  assert.equal(stop.classification, "hard-stop");
  assert.equal(stop.stop, true);
  const c = M.createCampaign({ id: "sd-track", userId: "u1", approved: true });
  M.recordOutcome(c, { type: "reply" });
  assert.equal(c.stats.replies, 1);
  const restored = M.importState(M.exportState(c));
  assert.equal(restored.stats.replies, 1);
});

test("REGRESSION: kill-switch seam intact — enqueue still refuses under a global pause", () => {
  const c = M.createCampaign({ id: "sd-pause", userId: "u1", approved: true });
  const res = M.enqueue(c, [{ candidate: cand({}), draft: { subject: "s", body: "b" } }], { globalPause: { set: true, at: "2026-10-13T00:00:00Z", by: "user", scope: "all-queues" } });
  assert.equal(res[0].status, "rejected");
  assert.equal(res[0].reason, "global_pause_set");
  assert.equal(c.items.length, 0);
});
