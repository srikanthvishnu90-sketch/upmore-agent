// Career warm-path graph (135). Check: node --test tests/career-graph.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path"); const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const G = require(path.join(root, "packages/domain/135-career-graph.js"));
const Track = require(path.join(root, "packages/domain/126-career-track.js"));
const persona = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/fixtures/test-persona.json"), "utf8"));
const profile = { name: "Alex Testcase (TEST)", school: "TEST University", year: "junior", hometown: "Chicago, IL (TEST)", major: "Computer Science", clubs: ["TEST University Investing Club"], current_employer: "TEST Systems Inc" };

test("merge: same person in 3 sources -> 1 record, sources unioned", () => {
  const { people, merges } = G.mergeIdentities([
    { full_name: "Priya Nair (TEST)", current_firm: "Datadog", work_email: "priya@example.test", source_list: ["linkedin_export"] },
    { full_name: "Priya Nair (TEST)", current_firm: "Datadog", schools: ["TEST University"], source_list: ["alumni_directory"] },
    { full_name: "Priya Nair (TEST)", current_firm: "Datadog", title: "Software Engineer", source_list: ["club_roster"] }]);
  assert.equal(people.length, 1); assert.equal(merges.length, 2);
  assert.deepEqual(people[0].source_list.sort(), ["alumni_directory", "club_roster", "linkedin_export"]);
  assert.equal(people[0].title, "Software Engineer");
});
test("warmth: cross-city alumni discounted + disclosed, never inflated", () => {
  const w = G.rankWarmth({ full_name: "Sam (TEST)", current_firm: "Stripe", schools: ["TEST University"], geography: "San Francisco, CA" }, profile, { roleCity: "New York, NY" });
  assert.equal(w.cross_city, true); assert.equal(w.score, 25); // 40 alumni - 15
  assert.ok(w.adjustments.some((a) => a.delta === -15));
});
test("exclusions: current employer + departed", () => {
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [
    { full_name: "Boss Adjacent (TEST)", current_firm: "TEST Systems Inc", schools: ["TEST University"] },
    { full_name: "Gone Person (TEST)", current_firm: "Datadog", at_company: false, departed_at: "2026-08", next_firm: "Elsewhere (TEST)" },
    { full_name: "Live Person (TEST)", current_firm: "Datadog", schools: ["TEST University"] }] }]);
  const r = G.findPaths(st, "Datadog", profile);
  assert.equal(r.paths.length, 1); assert.equal(r.excluded[0].exclusion.reason, "departed");
  const nx = G.departedNextPath(st, "Gone Person (TEST)", profile);
  assert.equal(nx.next_paths[0].name, "Live Person (TEST)");
});
test("timing: tight deadline -> apply now; loose -> wait <=48h", () => {
  assert.equal(G.referralTiming({ deadlineDays: 1, referralEtaDays: 2 }).decision, "APPLY_NOW_REFER_AFTER");
  assert.equal(G.referralTiming({ deadlineDays: 14, referralEtaDays: 2 }).decision, "WAIT_FOR_REFERRAL");
  assert.equal(G.referralTiming({}).decision, "ASK");
});
test("blurb: facts only, fact_ids carried; referral ask never in email one", () => {
  const b = G.forwardableBlurb({ name: profile.name, school: profile.school, year: "junior" }, persona.facts);
  assert.equal(b.ok, true); assert.ok(b.lines.every((l) => l.fact_id));
  const no = G.draftReferralAsk({ full_name: "X (TEST)", current_firm: "Datadog" }, profile, { touchNumber: 1 });
  assert.equal(no.ok, false); assert.equal(no.reason, "referral_ask_never_in_email_one");
});
test("recruiter vs practitioner asks differ", () => {
  const rec = G.draftReferralAsk({ full_name: "Rae (TEST)", current_firm: "Stripe", title: "Recruiter", role_kind: "recruiter" }, profile, { hadGoodChat: true, role: "SWE Intern", blurb: "B" });
  const prac = G.draftReferralAsk({ full_name: "Pete (TEST)", current_firm: "Stripe", title: "Software Engineer" }, profile, { hadGoodChat: true, role: "SWE Intern", blurb: "B" });
  assert.equal(rec.kind, "recruiter"); assert.equal(prac.kind, "practitioner");
  assert.match(rec.draft.body, /right requisition/); assert.match(prac.draft.body, /referring me/);
});
test("referral submitted -> tracked onto 126 application row", () => {
  const st = G.makeGraphStore(); const ts = Track.createMemoryStore([]);
  const r = G.createReferral(st, { company: "Datadog", role: "Software Engineering Intern", contact_name: "Priya Nair (TEST)" });
  G.approveReferral(st, r.referral_id);
  const out = G.markReferralSubmitted(st, ts, Track, r.referral_id, { at: "2026-10-12T12:00:00Z" });
  assert.equal(out.application.source, "referred"); assert.equal(out.application.referred_by, "Priya Nair (TEST)");
  assert.equal(Track.findByCompany(ts, "Datadog").app_id, r.application_id);
});
test("bonus intel: no sourced amounts in CIR corpus -> none claimed", () => {
  const cirs = ["stripe", "datadog", "ramp"].map((id) => JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/cirs", id + ".json"), "utf8")));
  const intel = G.referralBonusIntel(cirs, ["Stripe", "Datadog", "Ramp"]);
  assert.equal(intel.sourced_bonus_count, 0);
  assert.ok(intel.rows.every((r) => r.bonus_amount === null && r.referral_weight));
});
test("prep vendored: 127 brief grounds in the now-merged Stripe CIR", () => {
  const P = require(path.join(root, "packages/domain/127-career-prep.js"));
  const stripe = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/cirs/stripe.json"), "utf8"));
  const dd = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/cirs/datadog.json"), "utf8"));
  assert.equal(P.composeBrief({ company: "Stripe", cir: G.adaptCirForPrep(stripe) }).status, "OK");
  assert.equal(P.composeBrief({ company: "Datadog", cir: G.adaptCirForPrep(dd) }).status, "OK");
  assert.equal(P.voiceMockAvailability().available, false);
});
