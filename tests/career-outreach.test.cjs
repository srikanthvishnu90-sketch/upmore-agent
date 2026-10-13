// Career outreach engine (Doc 1, OUTR-001..008 / OUTE-001..013). Transports below are MOCK transports,
// labeled mock, used only inside these tests — no real email is ever sent by this suite.
// Check: node --test tests/career-outreach.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const M = require(path.join(root, "packages/domain/124-career-outreach.js"));
const FIRM_SETS = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/firm-sets.json"), "utf8"));
const USER = { name: "Vishnu Srikanth", school: "DePaul University", year: "sophomore", year_label: "'28", experience: "running a campus investing club" };
const nowMs = Date.parse("2026-10-12T15:00:00Z");
function cand(o) {
  return Object.assign({ person_id: "p1", full_name: "Daniel Kim", current_firm: "Evercore", title: "Analyst", seniority_band: "analyst",
    geography: "NYC", office: "New York", country: "US", schools: ["DePaul University"], work_email: "daniel.kim@evercore.com",
    email_confidence: 0.9, email_verification: "verified", last_verified_at: "2026-10-01T00:00:00Z",
    personalization_facts: [{ fact: "spent a year at a search fund before joining Evercore", source_url: "https://example.com/bio", date: "2026-09-01", strength: "strong", topic: "your search-fund-to-Evercore path" }], relationship_to_user: "same school" }, o || {});
}
// MOCK transport (tests only): dedupes by idempotency key like a correct provider adapter must.
function mockTransport(onSend) {
  const sent = new Map(); const t = { kind: "mock", calls: 0, sent,
    hasSent: async (k) => sent.has(k),
    send: async (msg) => { t.calls++; if (onSend) await onSend(msg, sent.size); if (sent.has(msg.idempotencyKey)) return { messageId: sent.get(msg.idempotencyKey), duplicate_prevented: true }; const id = "mock-" + (sent.size + 1); sent.set(msg.idempotencyKey, id); return { messageId: id }; } };
  return t;
}
function campaignWith(n, opts) {
  opts = opts || {}; const c = M.createCampaign({ id: "camp-1", userId: "u1", approved: true });
  const entries = []; for (let i = 0; i < n; i++) entries.push({ candidate: cand({ person_id: "p" + i, full_name: "Person " + i, work_email: `person${i}@firm${i % 7}.com`, current_firm: "Firm" + (i % 7) }), draft: { subject: "s" + i, body: "b" + i, tier: "B" } });
  M.enqueue(c, entries, opts); return c;
}

// OUTE-001 / OUTR parsing
test("OUTE-001 parse: canonical prompts P1/P2/P3", () => {
  const p1 = M.parseTarget("Create me a list of 500 bulge bracket investment bankers, come up with a good networking email, then email them");
  assert.equal(p1.count, 500); assert.equal(p1.firm_set, "bulge_bracket"); assert.equal(p1.industry, "investment_banking"); assert.ok(p1.firms.includes("Goldman Sachs"));
  const p2 = M.parseTarget("Find 100 PMs at Series B-D startups in NYC who went to my school and message them", { school: "University of Michigan" });
  assert.equal(p2.count, 100); assert.equal(p2.role_family, "product_management"); assert.equal(p2.geography, "NYC"); assert.equal(p2.school_filter, "University of Michigan"); assert.deepEqual(p2.background_filters.startup_stage, ["B", "C", "D"]);
  const p3 = M.parseTarget("I want coffee chats with associates at McKinsey, Bain, BCG. Get me 40.");
  assert.equal(p3.count, 40); assert.equal(p3.firm_set, "mbb"); assert.equal(p3.seniority_band, "associate"); assert.equal(p3.industry, "consulting");
});
test("OUTE-001 vague ask gets a proposed default, shown; EU/UK exclusion is always on", () => {
  const q = M.parseTarget("email some bankers for me");
  assert.equal(q.vague, true); assert.ok(q.proposed_default && q.proposed_default.firm_set === "bulge_bracket");
  assert.ok(q.exclusions.includes("geo:EU_UK"));
});
test("firm-sets.json: BB with Credit Suisse merged-into-UBS note, boutiques, MM, MBB, FAANG+, quant, Big 4", () => {
  const cs = FIRM_SETS.sets.bulge_bracket.firms.find((f) => f.name === "Credit Suisse");
  assert.ok(cs && /merged into UBS/i.test(cs.note) && cs.status === "historical");
  for (const k of ["elite_boutique", "middle_market", "mbb", "faang_plus", "quant", "big4"]) assert.ok(FIRM_SETS.sets[k].firms.length >= 3, k);
  assert.equal(FIRM_SETS.sets.mbb.firms.length, 3);
  assert.deepEqual(Object.keys(M.FIRM_SETS.sets).sort(), Object.keys(FIRM_SETS.sets).sort());
});
test("OUTE-007/OUTR-008 decided caps: start 10-15, ceiling 30 (not 40), agent refuses to raise", () => {
  assert.ok(M.dailyCapForDay(0) >= 10 && M.dailyCapForDay(0) <= 15);
  assert.equal(M.dailyCapForDay(30), 30); assert.equal(M.CAPS.ceilingPerDay, 30); assert.equal(M.CAPS.userCanRaise, false);
  assert.equal(M.refuseRaiseCap(40).refused, true); assert.equal(M.refuseRaiseCap(500).refused, true); assert.equal(M.refuseRaiseCap(25).refused, false);
  assert.match(M.refuseRaiseCap(100).reason, /30\/day/);
});

// OUTE-002/004 pipeline
test("OUTE-002 identity resolution: exact merge, ambiguous and school-mismatch go to review, never the send list", () => {
  const a = cand({ source_list: ["export"] });
  const b = cand({ work_email: null, email_confidence: 0.5, source_list: ["vendor"], personalization_facts: [{ fact: "spoke at a Ross finance panel", source_url: "https://example.com/p", strength: "medium" }] });
  const r = M.resolveCandidates([a, b]);
  assert.equal(r.candidates.length, 1); assert.equal(r.candidates[0].personalization_facts.length, 2); assert.deepEqual(r.candidates[0].source_list.sort(), ["export", "vendor"]);
  const amb = M.resolveCandidates([cand({}), cand({ full_name: "Daniel Kym", work_email: "x@evercore.com" })]); // fuzzy, below hard threshold, same firm
  assert.equal(amb.candidates.length, 1); assert.equal(amb.review.length, 1); assert.equal(amb.review[0].review_reason, "ambiguous_identity");
  const mis = M.resolveCandidates([cand({}), cand({ schools: ["Other University"], work_email: "y@evercore.com" })]);
  assert.equal(mis.review.length, 1);
});
test("OUTE-002/004 buildList: hygiene exclusions, yield report, per-firm cap, review card", () => {
  const records = [];
  const NAMES = ["Aaron Voss", "Bianca Reed", "Carlos Mendez", "Dana Whitfield", "Elias Ford", "Farah Iqbal", "Gavin Holt", "Hana Sato", "Ivan Petrov", "Julia Brandt", "Kwame Mensah", "Lena Fischer", "Marco Ruiz", "Nadia Rahman", "Owen Delacroix", "Priya Natarajan", "Quentin Walsh"];
  for (let i = 0; i < 17; i++) records.push(cand({ person_id: "gs" + i, full_name: NAMES[i], current_firm: "Goldman Sachs", work_email: `gs${i}@goldmansachs.com` }));
  records.push(cand({ person_id: "own", full_name: "Oscar Wynn", current_firm: "My Firm", work_email: "a@myfirm.com" }));
  records.push(cand({ person_id: "old", full_name: "Peter Aldous", work_email: "old@evercore.com", contacted_before: true }));
  records.push(cand({ person_id: "eu", full_name: "Sofia Lindqvist", geography: "London", office: "London", country: "GB", work_email: "eu@evercore.com" }));
  records.push(cand({ person_id: "opt", full_name: "Trevor Nash", work_email: "opt@evercore.com", opt_out: true }));
  records.push(cand({ person_id: "noemail", full_name: "Uma Ferreira", work_email: null }));
  const supp = M.createSuppressionStore(); supp.suppress({ email: "sup@evercore.com", scope: "shared" });
  records.push(cand({ person_id: "sup", full_name: "Victor Hale", work_email: "sup@evercore.com" }));
  const pool = M.buildList(records, M.parseTarget("500 bulge bracket investment bankers"), { profile: { school: "DePaul University", current_employer: "My Firm" }, suppression: supp, userId: "u1", nowMs });
  assert.equal(pool.yield.found, 23); assert.equal(pool.selected.filter((c) => c.current_firm === "Goldman Sachs").length, 15); // per-firm cap
  assert.ok(pool.reserve.length >= 2); assert.equal(pool.exclusions.own_employer, 1); assert.equal(pool.exclusions.already_emailed, 1);
  assert.equal(pool.exclusions.eu_uk, 1); assert.equal(pool.exclusions.opt_out, 1); assert.equal(pool.exclusions.suppressed, 1); assert.equal(pool.exclusions.no_email, 1);
  const card = M.listReviewCard(pool, null);
  assert.ok(card.sample_rows.length <= 10); assert.match(card.text, /Found 23; trusted emails/); assert.ok(card.breakdown.by_firm["Goldman Sachs"] === 15);
});
test("OUTR-001/002 warm paths rank alumni first and show the path", () => {
  const rows = M.warmPaths([cand({ full_name: "Cold One", schools: ["Elsewhere"], relationship_to_user: "none" }), cand({ full_name: "Alum One", relationship_to_user: "same school and club" })], "Evercore", { school: "DePaul University" });
  assert.equal(rows[0].person, "Alum One"); assert.match(rows[0].path, /alumni/);
  const mem = M.relationshipMemory([{ full_name: "Alum One", stage: "call_booked", next_touch_at: "2026-10-01", last_summary: "chatted" }]);
  assert.equal(mem.talkedTo()[0].stage, "call_booked"); assert.equal(mem.dueForPing("2026-10-12").length, 1);
});

// OUTE-003 verification seam
test("OUTE-003 local verifier: syntax / no-MX invalid, catch-all risky, MX ok verified; vendor plugs into same interface", async () => {
  const dns = async (d) => d === "nomx.com" ? { mx: [] } : d === "catchall.com" ? { mx: ["mx"], catchAll: true } : { mx: ["mx1"] };
  const v = M.createVerifier({ dnsLookup: dns });
  assert.equal((await v.verify("not-an-email")).status, "invalid");
  assert.equal((await v.verify("a@nomx.com")).status, "invalid");
  assert.equal((await v.verify("a@catchall.com")).status, "risky");
  assert.equal((await v.verify("a@evercore.com")).status, "verified");
  assert.equal((await M.createVerifier({}).verify("a@evercore.com")).status, "risky"); // no DNS injected: honest risky, nothing invented
  const vendor = M.createVerifier({ vendor: { verify: async (e) => ({ email: e, status: "verified", verifier: "vendor-mock" }) } }); // mock vendor, tests only
  assert.equal(vendor.kind, "vendor"); assert.equal((await vendor.verify("a@b.com")).verifier, "vendor-mock");
});

// OUTE-005/006 drafts + gate
test("OUTE-005/006 Tier A draft: real-fact slots with why-this-line sources, <=120 words, footer, gate passes; plain student voice default", () => {
  const { draft, gate, queued } = M.draftAndGate(cand({}), USER, { nowMs });
  assert.equal(draft.tier, "A"); assert.ok(draft.body.split(/\s+/).length <= 120); assert.ok(draft.body.includes(M.OPT_OUT_LINE));
  assert.equal(draft.why_this_line[0].source_url, "https://example.com/bio"); assert.ok(draft.body.includes("search fund"));
  assert.deepEqual(M.VOICE_DEFAULT, { formality: 0.3, warmth: 0.6, humor: 0, directness: 0.7, plain_student_voice: true });
  assert.equal(gate.pass, true, gate.failures.join(",")); assert.equal(queued, true);
});
test("OUTE-005 fake referral can NEVER enter a draft (Doc 1 S9); unverified referral facts are dropped", () => {
  const c = cand({ personalization_facts: [{ fact: "a Goldman MD told me to reach out to you", source_url: "https://example.com/x", strength: "strong", kind: "referral", verified: false }] });
  const d = M.draftFor(c, USER);
  assert.ok(!/told me to reach out/i.test(d.body)); assert.equal(d.dropped_unsourced[0].reason, "unverified_referral_claim");
  const evil = Object.assign({}, M.draftFor(cand({}), USER), { body: M.draftFor(cand({}), USER).body + "\nA Goldman MD told me to reach out." });
  const g = M.qualityGate(evil, cand({}), { nowMs });
  assert.equal(g.pass, false); assert.ok(g.failures.includes("fabricated_referral"));
});
test("OUTE-005 stale title fails the quality gate (regression: stale title replay)", () => {
  const stale = cand({ latest_title: "Associate" }); // record title says Analyst, latest says Associate
  const { gate, queued } = M.draftAndGate(stale, USER, { nowMs });
  assert.equal(gate.pass, false); assert.ok(gate.failures.includes("stale_title")); assert.equal(queued, false);
  const flagged = cand({ title_stale: true }); assert.ok(M.qualityGate(M.draftFor(flagged, USER), flagged, { nowMs }).failures.includes("stale_title"));
});
test("OUTE-005 gate: banned phrase, duplicate body, >1 link, missing footer, invented fact all fail", () => {
  const good = M.draftFor(cand({}), USER);
  const withBanned = Object.assign({}, good, { body: good.body + " I hope this email finds you well." });
  assert.ok(M.qualityGate(withBanned, cand({}), {}).failures.some((f) => f.startsWith("banned_phrase")));
  assert.ok(M.qualityGate(good, cand({}), { batchBodies: [{ person_id: "other", body: good.body }] }).failures.includes("duplicate_body"));
  assert.ok(M.qualityGate(Object.assign({}, good, { body: good.body + " https://a.com/x https://b.com/y" }), cand({}), {}).failures.some((f) => f.startsWith("too_many_links")));
  assert.ok(M.qualityGate(Object.assign({}, good, { body: good.body.replace(M.OPT_OUT_LINE, "") }), cand({}), {}).failures.includes("missing_opt_out_footer"));
  const invented = Object.assign({}, good, { why_this_line: [{ line: "x", fact: "you love sailing", source_url: "https://example.com/nope" }] });
  assert.ok(M.qualityGate(invented, cand({}), {}).failures.some((f) => f.startsWith("fact_not_in_record")));
});
test("OUTR-003/007 referral ask needs sourced shared context; intro request carries a forwardable blurb", () => {
  assert.equal(M.draftReferralAsk(cand({}), USER, {}).ok, false);
  const ok = M.draftReferralAsk(cand({}), USER, { shared_context: { fact: "we are both DePaul finance majors", source_url: "https://example.com/dir" } });
  assert.equal(ok.ok, true); assert.ok(ok.draft.body.includes(M.OPT_OUT_LINE));
  assert.equal(M.draftIntroRequest(cand({}), cand({ full_name: "Target Person" }), USER, "").ok, false);
  assert.ok(M.draftIntroRequest(cand({}), cand({ full_name: "Target Person" }), USER, "blurb text").draft.body.includes("blurb text"));
});

// OUTE-007/008/009 queue
test("OUTE-007/008 enqueue: suppression, EU/UK, invalid rejected; follow-up needs a continue tap; per-firm enqueue cap", () => {
  const supp = M.createSuppressionStore(); supp.suppress({ email: "person0@firm0.com", scope: "shared" });
  const c = campaignWith(3, { suppression: supp });
  assert.equal(c.items.filter((i) => i.status === "queued").length, 2);
  const c2 = M.createCampaign({ id: "c2", userId: "u1", approved: true });
  const fu = M.enqueue(c2, [{ candidate: cand({}), draft: { subject: "s", body: "b" }, touch: 1 }]);
  assert.equal(fu[0].status, "rejected"); assert.equal(fu[0].reason, "followup_needs_continue_tap");
  const ok = M.enqueue(c2, [{ candidate: cand({}), draft: { subject: "s", body: "b" }, touch: 1 }], { continueTap: true }); assert.equal(ok[0].status, "queued");
  const eu = M.enqueue(c2, [{ candidate: cand({ person_id: "eu1", geography: "London", country: "GB", work_email: "e@londonbank.co.uk" }), draft: { subject: "s", body: "b" } }]);
  assert.equal(eu[0].reason, "eu_uk_excluded_v1");
});
test("OUTE-007 wave 1: top 40 over days, daily + per-domain caps and 2-8 min gaps modeled, risky <=10% of a day", () => {
  const c = campaignWith(40);
  for (let i = 0; i < 5; i++) c.items[i].verification = "risky";
  const plan = M.planWave(c, { seed: 7 });
  assert.equal(plan.wave_items, 40); assert.ok(plan.days >= 2 && plan.days <= 4, "days=" + plan.days);
  assert.ok(plan.deferred.length >= 1 && plan.deferred[0].reason === "risky_over_10pct_of_wave"); // 5 risky in a 40-wave exceeds the 10% risky rule: excess deferred, wave not stretched
  for (const d of plan.daily_caps) assert.ok(d.planned <= d.cap);
  const byDomainDay = {}; for (const s of plan.schedule) { const item = c.items.find((i) => i.id === s.item_id); const k = s.day_index + ":" + item.domain; byDomainDay[k] = (byDomainDay[k] || 0) + 1; assert.ok(s.gap_minutes_after_previous >= 2 && s.gap_minutes_after_previous <= 8); }
  for (const k of Object.keys(byDomainDay)) assert.ok(byDomainDay[k] <= 4, k);
  const day0 = plan.schedule.filter((s) => s.day_index === 0); const risky0 = day0.filter((s) => c.items.find((i) => i.id === s.item_id).verification === "risky").length;
  assert.ok(risky0 <= Math.floor(M.dailyCapForDay(0) * 0.10), `risky day0 ${risky0}`);
});
test("OUTE-007 send requires approval; mock transport sends once — retry NEVER double-sends", async () => {
  const draftCamp = M.createCampaign({ id: "cx", userId: "u1" }); M.enqueue(draftCamp, [{ candidate: cand({}), draft: { subject: "s", body: "b" } }]);
  assert.equal((await M.sendPending(draftCamp, { transport: mockTransport() })).error, "campaign_not_approved");
  const c = campaignWith(5); const t = mockTransport();
  const r1 = await M.sendPending(c, { transport: t }); assert.equal(r1.sent, 5); assert.equal(t.sent.size, 5);
  for (const i of c.items) i.status = "queued"; // simulated retry after a crash replays the whole queue
  const r2 = await M.sendPending(c, { transport: t });
  assert.equal(t.calls, 5); assert.equal(t.sent.size, 5); assert.ok(r2.outcomes.every((o) => o.result === "already_sent_idempotent"));
});
test("OUTE-008 T5-style forced opt-out MID-QUEUE: 0 further sends to that person (severity-1)", async () => {
  const supp = M.createSuppressionStore(); const c = campaignWith(10, { suppression: supp });
  const target = c.items[5];
  const t = mockTransport(async (msg, already) => { if (already === 2) supp.suppress({ email: target.email, person_id: target.person_id, scope: "both", reason: "stop" }); });
  const r = await M.sendPending(c, { transport: t, suppression: supp });
  assert.equal(target.status, "suppressed"); assert.ok(![...t.sent.keys()].some((k) => k.includes(target.person_id)));
  assert.equal(r.sent, 9); // everyone else still sent; only the opted-out person got 0 further sends
});
test("OUTE-008 shared cross-user suppression: a stop anywhere suppresses for every user; only the opt-out fact is shared", () => {
  const supp = M.createSuppressionStore();
  const campA = M.createCampaign({ id: "a", userId: "userA", approved: true });
  M.handleReply(campA, { body: "Please stop emailing me." }, cand({}), { suppression: supp });
  assert.equal(supp.isSuppressed({ email: "daniel.kim@evercore.com" }, "userB"), true); // different user, same recipient: suppressed
  assert.deepEqual(Object.keys(supp.toJSON()).sort(), ["perUserEmails", "perUserIds", "sharedEmails", "sharedIds"]); // no campaign data in the shared store
});
test("OUTE-009 circuit breaker: bounce spike, 2 hostile signals, provider warning all pause with a cause for the user", () => {
  const c = M.createCampaign({ id: "cb", userId: "u1", approved: true });
  for (let i = 0; i < 100; i++) M.recordOutcome(c, { type: "sent" });
  for (let i = 0; i < 6; i++) M.recordOutcome(c, { type: "bounce" }); // 6% > 3%
  assert.equal(c.breaker.tripped, true); assert.equal(c.status, "paused"); assert.match(c.breaker.user_message, /bounce/);
  const c2 = M.createCampaign({ id: "cb2", userId: "u1", approved: true }); M.recordOutcome(c2, { type: "hostile" }); M.recordOutcome(c2, { type: "hostile" }); assert.equal(c2.breaker.tripped, true);
  const c3 = M.createCampaign({ id: "cb3", userId: "u1", approved: true }); M.recordOutcome(c3, { type: "provider_warning" }); assert.equal(c3.breaker.tripped, true);
});
test("OUTE-008 hard bounce suppresses and never retries; crash-safe export/import keeps sent state", async () => {
  const supp = M.createSuppressionStore(); const c = campaignWith(3, { suppression: supp });
  const item = c.items[0]; M.recordOutcome(c, { type: "hard_bounce", item, suppression: supp });
  assert.equal(item.status, "bounced"); assert.equal(item.never_retry, true); assert.equal(supp.isSuppressed({ email: item.email }, "u1"), true);
  const t = mockTransport(); await M.sendPending(c, { transport: t, suppression: supp });
  const restored = M.importState(M.exportState(c));
  assert.deepEqual(restored.sentKeys, c.sentKeys); assert.equal(restored.items.filter((i) => i.status === "sent").length, 2);
  // crash mid-send recovery: an item left in 'sending' whose key the transport already has is recovered, not resent
  const c2 = campaignWith(1); c2.items[0].status = "sending"; const t2 = mockTransport(); t2.sent.set(c2.items[0].idempotencyKey, "mock-pre");
  const rr = await M.sendPending(c2, { transport: t2 }); assert.equal(rr.outcomes[0].result, "recovered_after_crash"); assert.equal(t2.calls, 0);
});
test("OUTE-007 follow-ups: continue tap gates the wave; plan caps at 2 and stops on reply/bounce/opt-out", () => {
  const c = campaignWith(2); return M.sendPending(c, { transport: mockTransport() }).then(() => {
    assert.equal(M.scheduleFollowUps(c, {}).needs_continue_tap, true);
    const ok = M.scheduleFollowUps(c, { continueTap: true }); assert.equal(ok.ok, true);
    assert.equal(ok.plan[0].max_followups, 2); assert.ok(ok.plan[0].stop_on.includes("opt_out"));
  });
});

// OUTE-010 classifier replay (T6-style)
const REPLIES = [
  ["Happy to chat, Thursday works for me", "positive-ready"], ["Sure, let's schedule a call next week", "positive-ready"], ["I'm free Tuesday at 5, that works", "positive-ready"],
  ["Would be happy to talk, Monday works", "positive-ready"], ["Yes, glad to chat — Wednesday works", "positive-ready"], ["Let's talk, I'm available Friday", "positive-ready"],
  ["Interested — send me more info on what you'd like to discuss", "positive-needs-info"], ["Tell me more about what you are hoping to cover", "positive-needs-info"],
  ["Send more details and I can see", "positive-needs-info"], ["I'm curious but need more context first", "positive-needs-info"], ["Can you send me more info about the chat?", "positive-needs-info"],
  ["You should talk to Priya Shah about that group", "referral-to-other"], ["Reach out to Daniel Kim, he runs that team", "referral-to-other"],
  ["Speak with Maya Patel instead, she knows it better", "referral-to-other"], ["Looping in Jordan Lee here", "referral-to-other"], ["I can connect you with Alex Chen", "referral-to-other"],
  ["Thanks but not a good time for me", "polite-decline"], ["I'm too busy right now, no thanks", "polite-decline"], ["Unfortunately I can't right now", "polite-decline"],
  ["Not able to help, sorry", "polite-decline"], ["Maybe another time, I have to pass on this", "polite-decline"],
  ["Please stop emailing me", "hard-stop"], ["Remove me from your list", "hard-stop"], ["Unsubscribe me", "hard-stop"],
  ["Do not contact me again", "hard-stop"], ["Stop contacting me", "hard-stop"], ["No more emails, please", "hard-stop"],
  ["This is spam, go away", "hostile"], ["Leave me alone", "hostile"], ["Never contact me again, this is harassment", "hostile"],
  ["I'm reporting you for spam", "hostile"], ["This is a scam, fuck off", "hostile"],
  ["I'm out of office until October 20", "auto-reply-ooo"], ["On vacation, back on November 3", "auto-reply-ooo"],
  ["I am on PTO and return January 12", "auto-reply-ooo"], ["Currently traveling with limited access to email until December 1", "auto-reply-ooo"],
  ["Delivery Status Notification: this message could not be delivered, user unknown", "bounce"], ["Undeliverable: mailbox full, delivery has failed", "bounce"],
  ["What school do you go to?", "question-about-user"], ["Can you tell me about your experience so far?", "question-about-user"],
];
test("OUTE-010 T6-style: 40 synthetic replies, 100% on stop/hostile, >=90% overall", () => {
  assert.equal(REPLIES.length, 40);
  let correct = 0; const stopHostile = REPLIES.filter(([, e]) => e === "hard-stop" || e === "hostile");
  let shCorrect = 0; const misses = [];
  for (const [body, expected] of REPLIES) { const got = M.classifyReply({ body }, { nowMs }).classification; if (got === expected) correct++; else misses.push(body + " -> " + got + " want " + expected); if ((expected === "hard-stop" || expected === "hostile") && got === expected) shCorrect++; }
  assert.equal(shCorrect, stopHostile.length, misses.join(" | "));
  assert.ok(correct / REPLIES.length >= 0.9, `only ${correct}/40: ` + misses.join(" | "));
});
test("OUTE-010 OOO parses a return date, reschedules the follow-up, and never counts as a reply", () => {
  const r = M.classifyReply({ body: "I'm out of office until October 20" }, { nowMs });
  assert.equal(r.classification, "auto-reply-ooo"); assert.equal(r.return_date, "2026-10-20"); assert.equal(r.reschedule_followup_on, "2026-10-21"); assert.equal(r.counts_as_reply, false);
  const camp = M.createCampaign({ id: "oo", userId: "u1", approved: true });
  const out = M.handleReply(camp, { body: "On vacation, back on November 3" }, cand({}), {});
  assert.equal(out.reschedule_followup_on, "2026-11-04"); assert.equal(camp.stats.replies, 0);
});

// OUTE-011/012 booking + follow-through
test("OUTE-011 slot proposal is DST-correct in the recipient timezone (spring/fall offsets differ)", () => {
  assert.equal(M.zonedTimeToUtc(2026, 10, 30, 9, 0, "America/New_York"), "2026-10-30T13:00:00.000Z"); // EDT
  assert.equal(M.zonedTimeToUtc(2026, 11, 2, 9, 0, "America/New_York"), "2026-11-02T14:00:00.000Z"); // EST after Nov 1 fallback
  assert.equal(M.zonedTimeToUtc(2026, 3, 9, 9, 0, "America/Chicago"), "2026-03-09T14:00:00.000Z"); // CDT after Mar 8 spring forward
});
test("OUTE-011 slots respect free/busy + 15-min buffer and blackout dates", () => {
  const slots = M.proposeSlots({ nowMs: Date.parse("2026-10-29T12:00:00Z"), recipientTz: "America/New_York", userTz: "America/Chicago",
    freeBusy: [{ start: "2026-10-30T13:00:00Z", end: "2026-10-30T14:30:00Z" }], blackoutDates: ["2026-11-02"], count: 3 });
  assert.equal(slots.length, 3);
  assert.ok(!slots.some((s) => s.start.startsWith("2026-11-02"))); // blacked out (recipient date)
  assert.ok(!slots.some((s) => s.start === "2026-10-30T13:00:00.000Z" || s.start === "2026-10-30T14:00:00.000Z")); // busy + buffer spill to 10:00 slot start (14:00Z is within buffered window)
  assert.ok(slots.every((s) => s.buffer_minutes === 15));
});
test("OUTE-012 prep brief from a CIR-shaped input; thank-you needs a real note; follow-up touch lands 4-8 weeks out", () => {
  const brief = M.prepBrief({ contact: cand({}), cir: { path: "Search fund -> Evercore", talking_points: ["a", "b", "c", "d"], questions: ["q1", "q2", "q3", "q4", "q5", "q6"], what_not_to_ask: ["x"] }, user_goal: "learn M&A" });
  assert.equal(brief.talking_points.length, 3); assert.equal(brief.questions.length, 5); assert.deepEqual(brief.what_not_to_ask, ["x"]); assert.match(brief.who, /Daniel Kim/);
  assert.equal(M.thankYouDraft({ contact: cand({}) }).ok, false);
  const ty = M.thankYouDraft({ contact: cand({}), note: "Your point about staffing in TMT stuck with me.", user: USER }); assert.ok(ty.draft.body.includes("staffing in TMT"));
  const touch = M.scheduleFollowUpTouch({ chatDate: "2026-10-12T00:00:00Z" }); assert.equal(touch.weeks, 6); assert.equal(touch.next_touch_at.slice(0, 10), "2026-11-23");
  assert.equal(M.scheduleFollowUpTouch({ chatDate: "2026-10-12T00:00:00Z", weeks: 99 }).weeks, 8);
});

// OUTE-013 + Gmail shape + OUTR-004 send rail shape
test("OUTE-013 metrics: yield, verified, bounce, reply, positive, meetings, referrals, per-tier rates", () => {
  const c = campaignWith(10); c.stats.replies = 2; c.stats.positive = 1; c.stats.meetings_booked = 1; c.stats.referrals = 1;
  for (const i of c.items) i.status = "sent"; c.items[0].status = "bounced";
  const m = M.campaignMetrics({ pool: { found: 100, sendable: 50, trusted_emails: 60 }, campaign: c, replies: [{ tier: "B" }, { tier: "A" }] });
  assert.equal(m.yield_pct, 50); assert.equal(m.verified_rate_pct, 60); assert.equal(m.reply_pct, 20); assert.equal(m.positive_pct, 10);
  assert.equal(m.meetings_booked, 1); assert.equal(m.referrals, 1); assert.ok(m.per_tier_reply_rates.B.rate_pct > 0);
});
test("OUTR-004 Gmail transport shape rides an injected Gmail API client; absent client is NOT_WIRED (mock API, tests only)", async () => {
  assert.equal((await M.createGmailTransport(null).send({ to: "a@b.com", subject: "s", body: "b" })).error.startsWith("NOT_WIRED"), true);
  let seen = null; const mockGmail = { users: { messages: { send: async (req) => { seen = req; return { id: "gmail-mock-1" }; } } } }; // mock Gmail API, tests only
  const t = M.createGmailTransport(mockGmail); const r = await t.send({ to: "a@firm.com", subject: "Hi", body: "Body text" });
  assert.equal(r.messageId, "gmail-mock-1"); assert.equal(seen.userId, "me");
  const raw = Buffer.from(seen.requestBody.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  assert.match(raw, /To: a@firm\.com/); assert.match(raw, /Body text/); assert.equal(M.CAPS.channel, "gmail_oauth_only");
});
