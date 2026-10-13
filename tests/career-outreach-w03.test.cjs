// W03 additions to the outreach engine (SC-041..060): list surgery, safety plan, honest yield,
// suppression report, digest/close-out, reserve backfill, tier mix, new-industry parsing + firm sets.
// Check: node --test tests/career-outreach-w03.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const M = require(path.join(root, "packages/domain/124-career-outreach.js"));
const SETS = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/firm-sets.json"), "utf8"));
const NOW = Date.parse("2026-10-13T15:00:00Z");
function cand(o) { return Object.assign({ person_id: "p", full_name: "Test Person", current_firm: "Evercore", title: "Analyst", seniority_band: "analyst", geography: "NYC", office: "New York", country: "US", schools: ["University of Michigan"], work_email: "t@evercore.com", email_confidence: 0.9, email_verification: "verified", email_source: "directory", last_verified_at: "2026-10-01T00:00:00Z", personalization_facts: [], relationship_to_user: "same school" }, o || {}); }

test("firm-set extensions exist with >=8 firms each", () => {
  for (const k of ["big_law", "academic_medical", "cpg", "infrastructure_eng", "venture_midwest", "logistics", "real_estate_pe"]) assert.ok(SETS.sets[k] && SETS.sets[k].firms.length >= 8, k);
});
test("parse: new industries resolve to their sets and roles", () => {
  assert.equal(M.parseTarget("Find 35 lawyers at Big Law firms from my school", { school: "University of Michigan" }).firm_set, "big_law");
  assert.equal(M.parseTarget("Find 70 civil engineers at infrastructure firms in the Midwest").geography, "Midwest");
  assert.equal(M.parseTarget("Find 140 ops managers at logistics companies who started as analysts").seniority_band, "manager");
  assert.equal(M.parseTarget("Find 95 AI/ML engineers at Series A startups who publish on GitHub").background_filters.publishes_on_github, true);
  assert.equal(M.parseTarget("Email 60 real-estate PE associates in NY with deal-specific personalization").firm_set, "real_estate_pe");
  assert.equal(M.parseTarget("Find 50 med-school residents and alumni for pre-med advising chats").firm_set, "academic_medical");
});
test("applyListOps: drop VPs + Michigan + boutique re-cut removes exactly the non-matching", () => {
  const pool = { selected: [cand({ person_id: "1", seniority_band: "vp_plus" }), cand({ person_id: "2", schools: ["Ohio State"] }), cand({ person_id: "3", current_firm: "Goldman Sachs" }), cand({ person_id: "4" })], reserve: [cand({ person_id: "5" })] };
  const r = M.applyListOps(pool, "drop VPs, only Michigan and boutique people");
  assert.deepEqual(r.after, { selected: 2, reserve: 0 }); assert.equal(r.removed.length, 3); assert.ok(r.ops.includes("keep_school:University of Michigan"));
});
test("safetyPlan: finish date = start + days-1; caps come from CAPS", () => {
  const p = M.safetyPlan(M.createCampaign({}), { scheduled: 24, days: 3, deferred: [] }, { startDateIso: "2026-10-13T00:00:00Z" });
  assert.equal(p.finish_date, "2026-10-15"); assert.equal(p.daily_cap_start, M.CAPS.startPerDay); assert.match(M.safetyPlanText(p), /approve once/);
});
test("honestYield: patterned-out counted separately from verified", () => {
  const recs = [cand({ person_id: "a", full_name: "Alpha One", work_email: "a@evercore.com" }), cand({ person_id: "b", full_name: "Beta Two", work_email: "b@evercore.com", email_verification: null, email_source: "pattern", email_confidence: 0.6 })];
  const y = M.honestYield(recs, M.parseTarget("Find 2 bankers"), { profile: {}, nowMs: NOW });
  assert.equal(y.found, 2); assert.equal(y.verified, 1); assert.equal(y.patterned_out, 1); assert.equal(y.sendable, 2);
});
test("suppressionReport: overlap with sent history fails the report", () => {
  const bad = M.suppressionReport({ selected: [cand({ work_email: "a@evercore.com" })] }, { sentHistory: ["a@evercore.com"] });
  assert.equal(bad.verdict, "FAIL"); assert.equal(bad.overlap_count, 1);
  const clean = M.suppressionReport({ selected: [cand({ work_email: "b@evercore.com" })] }, { sentHistory: ["a@evercore.com"] });
  assert.equal(clean.verdict, "CLEAN");
});
test("tierMix + backfillFromReserve promote only the unsuppressed", () => {
  const mix = M.tierMix([cand({ personalization_facts: [{ fact: "x", source_url: "https://e.com", strength: "strong" }] }), cand({ schools: ["Elsewhere"], geography: "", office: "", relationship_to_user: "none" })], { school: "University of Michigan" });
  assert.equal(mix.A, 1); assert.equal(mix.C, 1);
  const supp = M.createSuppressionStore(); supp.suppress({ email: "s@evercore.com", scope: "shared" });
  const pool = { selected: [], reserve: [cand({ person_id: "r1", work_email: "s@evercore.com" }), cand({ person_id: "r2", work_email: "ok@evercore.com" })] };
  const bf = M.backfillFromReserve(pool, null, { count: 2, suppression: supp });
  assert.equal(bf.promoted.length, 1); assert.equal(bf.promoted[0].email, "ok@evercore.com");
});
test("dailyDigest + closeOut derive from campaign state, angles ranked by reply rate", () => {
  const c = M.createCampaign({ id: "cx", userId: "u1", approved: true });
  const items = []; for (let i = 0; i < 4; i++) items.push({ candidate: cand({ person_id: "i" + i, work_email: "i" + i + "@evercore.com", full_name: "Person " + i }), draft: { subject: "s", body: "b", structure: i < 2 ? "path_question" : "short_honest" } });
  M.enqueue(c, items); for (const it of c.items) it.status = "sent";
  c.stats.replies = 2; c.stats.positive = 1; c.stats.meetings_booked = 2; c.stats.meetings_held = 1; c.wave.sent = 4;
  const d = M.dailyDigest(c, {}); assert.equal(d.meetings_pending, 1); assert.equal(d.sent, 4);
  const co = M.closeOut(c, { replyLog: [{ person_id: "i0", positive: true }, { person_id: "i2", positive: false }], notes: { i0: "real note (TEST)" }, user: { name: "Alex" } });
  assert.equal(co.angles[0].angle, "path_question"); assert.equal(co.thank_you_drafts[0].ok, true); assert.ok(co.next_steps.length >= 2);
});
test("concise draft surgery shortens every draft and keeps the gate green", () => {
  const user = { name: "Alex Testcase (TEST)", school: "University of Michigan", year: "sophomore", experience: "running a campus investing club (TEST)" };
  const before = M.draftAndGate(cand({ personalization_facts: [{ fact: "spent a year at a search fund", source_url: "https://e.com", strength: "strong" }] }), user, {});
  const after = M.draftAndGate(cand({ personalization_facts: [{ fact: "spent a year at a search fund", source_url: "https://e.com", strength: "strong" }] }), user, { concise: true, voice: { formality: 0.1 } });
  assert.ok(after.draft.body.split(/\s+/).length < before.draft.body.split(/\s+/).length); assert.equal(after.gate.pass, true); assert.equal(after.draft.voice.formality, 0.1);
});
