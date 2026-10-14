// Wave replay tests — Outreach + Referrals fixer wave (2026-10-14).
// Each test was written FAIL-FIRST against the pinned baseline (HEAD 54efb97
// line) and replays a defect found by direct-driving 124/146/147 with
// harness-equivalent inputs (see docs/career/wave-outreach-referrals-defects-2026-10-14.md):
//   D2 — 146 intake records lose email / sources / departed status at the
//        135-graph handoff (the shape 142's graphStoreOf normalizes).
//   D1 — 124 normalizeCandidate drops the `email` alias, so a 146/122-shaped
//        candidate drafts to null through 141's emitOutreachDraft.
//   D6/SC-019 — parseTarget has no designer role and no "LA" geography, so a
//        product-designer ask falls into the vague investment-banking default.
//   D7 — applyListOps school filter exact-matches, so "only DePaul people"
//        silently empties a DePaul University list.
//   D3 — 124's own refusal copy (suppressed recipient, cap raise) carries no
//        alternative marker / closing question (grader-v2 REFUSAL rule shape).
//   D5/date law — 147 echoes a user fact containing a relative date into a
//        draft with no flag; 124's gate hard-fails the same phrase.
// Check: node --test tests/career-outreach-referrals-wave.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Outreach = require(path.join(root, "packages/domain/124-career-outreach.js"));
const Intake = require(path.join(root, "packages/domain/146-career-intake.js"));
const Graph = require(path.join(root, "packages/domain/135-career-graph.js"));
const Platform = require(path.join(root, "packages/domain/147-career-platform-drafts.js"));
const Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js"));

const NOW = Date.parse("2026-10-13T12:00:00Z");
const USER = { name: "Vishnu Srikanth", school: "DePaul University", year: "sophomore" };

// ---------- D2: 146 -> graph handoff keeps email, sources, departed ----------
test("D2 replay: intake records are graph-ready — work_email, source_list, departed exclusion survive 135 normalizePerson", () => {
  const csv = "First Name,Last Name,Email Address,Company,Position,Connected On\nSam,Stripe,sam@stripe.com,Stripe,Engineer,2025-09-01\nJane,Doe,jane@evercore.com,Evercore,Analyst,2025-09-01";
  const r = Intake.intake({ linkedinConnectionsCsv: csv }, { knownDepartures: [{ full_name: "Jane Doe", current_firm: "Evercore", note: "left in June 2026" }] });
  const sam = r.records.find((x) => x.full_name === "Sam Stripe");
  const jane = r.records.find((x) => x.full_name === "Jane Doe");
  assert.equal(sam.work_email, "sam@stripe.com", "intake record must carry work_email (the field the graph + outreach engines read)");
  assert.deepEqual(sam.source_list, ["linkedin-export"], "intake record must carry source_list alongside sources");
  assert.equal(jane.at_company, false, "a departed record must carry at_company=false out of intake");
  assert.equal(jane.employment_status, "departed");
  // The exact read path 142 uses: graphStoreOf -> Graph.normalizePerson -> findPaths.
  const store = { people: r.records.map((p) => Graph.normalizePerson(p)), interactions: [], referrals: [] };
  const samG = store.people.find((p) => p.full_name === "Sam Stripe");
  assert.equal(samG.work_email, "sam@stripe.com", "email must survive graph normalization");
  assert.deepEqual(samG.source_list, ["linkedin-export"], "sources must survive graph normalization");
  const paths = Graph.findPaths(store, "Evercore", {}, {});
  assert.equal(paths.paths.length, 0, "departed person must never be a live path");
  assert.equal(paths.excluded.length, 1);
  assert.equal(paths.excluded[0].exclusion.reason, "departed");
  const stripe = Graph.findPaths(store, "Stripe", {}, {});
  assert.equal(stripe.paths.length, 1, "the current Stripe connection is a live path");
});

// ---------- D1: 124 accepts the candidate shapes 142 actually has ----------
test("D1 replay: a 146-shaped candidate (email, not work_email) drafts to that email — never to null", () => {
  const cand146 = { full_name: "Jane Doe", current_firm: "Evercore", title: "Analyst", office: "New York",
    email: "jane@evercore.com", email_status: "unverified", sources: ["pasted"], flags: [],
    relationship_to_user: "same school alumni", schools: ["DePaul University"],
    personalization_facts: [{ fact: "worked on a deal at Evercore", source_url: "https://example.com/x", strength: "strong" }] };
  const norm = Outreach.normalizeCandidate(cand146);
  assert.equal(norm.work_email, "jane@evercore.com");
  assert.deepEqual(norm.source_list, ["pasted"]);
  const gated = Outreach.draftAndGate(cand146, USER, { nowMs: NOW });
  assert.equal(gated.draft.to, "jane@evercore.com");
  const pool = Outreach.buildList([cand146], { count: 1 }, { profile: USER, nowMs: NOW });
  assert.equal(pool.yield.sendable, 1, "an emailed candidate is sendable-pool, not a no_email exclusion");
  assert.equal(pool.exclusions.no_email, 0);
});

test("D1 contract: 141 emitOutreachDraft fed a 146-shaped candidate produces the full doorstep payload addressed to the recipient", () => {
  const ctx = { profile: { basics: { name: "Maya Rivera (TEST)" }, facts: [{ kind: "education", org: "DePaul University" }] }, now: NOW, userId: "u1" };
  const cand146 = { full_name: "Jane Doe", current_firm: "Evercore", title: "Analyst", office: "New York",
    email: "jane@evercore.com", email_status: "unverified", sources: ["pasted"], flags: [],
    relationship_to_user: "same school alumni", schools: ["DePaul University"],
    personalization_facts: [{ fact: "worked on a deal at Evercore", source_url: "https://example.com/x", strength: "strong" }] };
  const r = Doorstep.emitOutreachDraft(ctx, { recipient: cand146 });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.equal(r.draft.to, "jane@evercore.com");
  assert.equal(r.queue_state.items[0].to, "jane@evercore.com");
  assert.equal(r.queue_state.status, "awaiting_approval");
  assert.ok(r.payload.list_record, "doorstep payload carries the list record");
  assert.ok(r.payload.safety_plan_card, "doorstep payload carries the safety plan card");
  assert.ok(r.payload.campaign, "doorstep payload carries the campaign state");
  assert.equal(r.payload.sends, 0);
  assert.doesNotMatch(r.reply, /null|undefined/);
});

// ---------- D6 / SC-019: parseTarget knows designers + LA ----------
test("SC-019 replay: 'Find 40 product designers at consumer startups in LA' is not the vague IB default", () => {
  const q = Outreach.parseTarget("Find 40 product designers at consumer startups in LA", { school: "DePaul University" });
  assert.equal(q.vague, false, "a role + geography ask is not vague");
  assert.notEqual(q.role_family, "investment_banking");
  assert.equal(q.geography, "Los Angeles");
  assert.ok(!(q.firms || []).includes("Goldman Sachs"), "no bulge-bracket default firms for a designer ask");
  assert.equal(q.count, 40);
});

// ---------- D7: applyListOps school short-name ----------
test("D7 replay: applyListOps 'only DePaul people' keeps DePaul University candidates instead of emptying the list", () => {
  const mk = (id, school) => ({ person_id: id, full_name: "Person " + id, current_firm: "Evercore", title: "Analyst", seniority_band: "analyst", schools: [school], work_email: id + "@evercore.com" });
  const pool = { selected: [mk("a", "DePaul University"), mk("b", "Ohio State")], reserve: [] };
  const r = Outreach.applyListOps(pool, "only DePaul people");
  assert.equal(r.after.selected, 1);
  assert.equal(r.selected[0].person_id, "a");
});

// ---------- D3: 124's own refusal copy carries the alternative shape ----------
test("D3 replay: suppressed-recipient refusal offers an instead-alternative or a closing question", () => {
  const supp = Outreach.createSuppressionStore();
  supp.suppress({ email: "gone@evercore.com", scope: "shared" });
  const gated = Outreach.draftAndGate({ full_name: "Gone Person", current_firm: "Evercore", title: "Analyst", work_email: "gone@evercore.com", email_verification: "verified" }, USER, { suppression: supp, userId: "u1" });
  assert.equal(gated.status, "refused");
  const msg = gated.message || "";
  assert.ok(/\?/.test(msg) || /\b(instead|alternative)\b/i.test(msg), `refusal message lacks the alternative shape: ${msg}`);
});

test("D3 replay: cap-raise refusal offers an instead-alternative or a closing question", () => {
  const r = Outreach.refuseRaiseCap(50);
  assert.equal(r.refused, true);
  assert.ok(/\?/.test(r.reason) || /\b(instead|alternative)\b/i.test(r.reason), `cap refusal lacks the alternative shape: ${r.reason}`);
});

// ---------- date law: 147 flags relative dates in supplied facts ----------
test("date-law replay: 147 flags a relative date in the user-supplied fact; an absolute date passes unflagged", () => {
  const rel = Platform.draftMessage({ profile: { full_name: "Amy Poe", current_firm: "KKR", title: "Associate" },
    userFact: { fact: "joined KKR since last fall", source_note: "user supplied" }, user: USER, platform: "DePaulConnect" });
  assert.ok(rel.notes.some((n) => /relative date/i.test(n)), `relative date must be flagged, notes: ${JSON.stringify(rel.notes)}`);
  const abs = Platform.draftMessage({ profile: { full_name: "Amy Poe", current_firm: "KKR", title: "Associate" },
    userFact: { fact: "spoke on the alumni panel in September 2025", source_note: "user supplied" }, user: USER, platform: "DePaulConnect" });
  assert.ok(!abs.notes.some((n) => /relative date/i.test(n)), "an absolute date must not be flagged");
});
