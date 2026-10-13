// Gauntlet G5 — targeting flags + profile data lifecycle.
// Defects: APD-2 (121 residency/peer restrictions), APD-5 (121 employer AI-authorship bans),
// SHD-1 data half (121 source health in result data), APD-3 module half (122 typed ingest
// failures + merge precedence), SHD-3 (122 deletion + retention declaration).
// Fixtures: the graded deep-dive AP postings + P1 profile, loaded verbatim.
// Check: node --test tests/career-gauntlet-g5.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const P = require(path.join(__dirname, "..", "packages/domain/122-career-profile.js"));

const fxDir = path.join(__dirname, "..", "packages", "career-data", "fixtures", "gauntlet");
const AP = JSON.parse(fs.readFileSync(path.join(fxDir, "deepdive/ap/ap-postings.json"), "utf8")).postings;
const P1raw = JSON.parse(fs.readFileSync(path.join(fxDir, "profiles/p1-early-career-swe/profile.json"), "utf8"));
const apById = (id) => AP.find((x) => x.id === id);
// Corpus shape -> the normalized shape 121 consumes (same fields the router's adaptPosting builds).
function normalized(cp) {
  const jd = `${cp.title} at ${cp.company}. Location: ${cp.location}. Requirements: ${(cp.requirements || []).join("; ")}.`;
  return { job_id: cp.id, company: cp.company, title: cp.title, location: cp.location, remote: /remote/i.test(cp.remote_terms || "") ? "remote" : "onsite", role_family: "SWE", seniority_band: "new_grad", jd_text: jd, source: cp.source_board, sources: [cp.source_board], source_urls: [""], req_id: cp.id, requirements: cp.requirements || [] };
}
const P1 = J.profileFromPersona(P1raw); // scoring profile; residence Chicago, IL (basics), prefs Austin/Remote, US citizen

// ---------------- APD-2: residency + peer restrictions ----------------
test("APD-2: Colorado-only remote role carries a structured state_residency flag on the posting record", () => {
  const posting = normalized(apById("AP05-P1"));
  const rs = J.detectRestrictions(posting);
  const res = rs.find((r) => r.type === "state_residency");
  assert.ok(res, JSON.stringify(rs));
  assert.deepEqual(res.states, ["CO"]);
  assert.match(res.evidence, /Colorado/);
  // normalization attaches the flags to the posting record itself
  const [gh] = J.normalizeGreenhouse({ name: "Highplain Health (TEST)", jobs: [{ id: 1, title: "Software Engineer, New Grad", location: { name: "Remote — Colorado residents only" }, absolute_url: "https://x/1", content: "Must reside in Colorado for the entire employment — remote work is authorized only from Colorado. Python SQL." }] }, "highplain");
  assert.ok((gh.restrictions || []).some((r) => r.type === "state_residency"), JSON.stringify(gh.restrictions));
});

test("APD-2: known residence outside Colorado EXCLUDES the Colorado-only role, reason carried in data", () => {
  const r = J.scoreFit(normalized(apById("AP05-P1")), P1);
  assert.equal(r.excluded, true, JSON.stringify(r));
  assert.ok(r.reasons.some((x) => /colorado/i.test(x) && /residen/i.test(x)), JSON.stringify(r.reasons));
  const flag = (r.restrictions || []).find((x) => x.type === "state_residency");
  assert.ok(flag && flag.disposition === "excluded", JSON.stringify(r.restrictions));
  // and it never reaches a shortlist
  return J.buildShortlist([r], {}).then((sl) => assert.equal(sl.length, 0));
});

test("APD-2: unknown residence is NOT silently passed — ask-the-user flag in data + demotion in shortlist", async () => {
  const unknownProf = { skills: [{ name: "Python", proven: true }, { name: "SQL", proven: true }], level: "student", experience_years: 1, constraints: { work_authorization: "US citizen", needs_sponsorship: false, clearance: null }, preferences: {} };
  const r = J.scoreFit(normalized(apById("AP05-P1")), unknownProf);
  assert.equal(r.excluded, false, JSON.stringify(r));
  assert.ok(Array.isArray(r.needs_user_input) && r.needs_user_input.some((q) => q.type === "state_residency" && /Colorado/.test(q.question)), JSON.stringify(r.needs_user_input));
  assert.ok(r.gaps.some((g) => /colorado/i.test(g)), JSON.stringify(r.gaps));
  const clean = { job_id: "clean-1", company: "Clean Co", title: "Software Engineer, New Grad", location: "Remote — United States", remote: "remote", jd_text: "Python SQL role.", source: "greenhouse" };
  const rc = J.scoreFit(clean, unknownProf);
  const sl = await J.buildShortlist([r, rc], {});
  assert.equal(sl.length, 2);
  assert.equal(sl[0].posting.job_id, "clean-1", "unresolved-restriction posting must be demoted below the clean one");
  assert.ok(sl[1].needs_user_input && sl[1].needs_user_input.length, "demoted item still carries the ask flag");
});

test("APD-2: a Colorado resident SATISFIES the restriction (not excluded, no ask flag)", () => {
  const coProf = Object.assign({}, P1, { residence: "Denver, CO", basics: { location: "Denver, CO" } });
  const r = J.scoreFit(normalized(apById("AP05-P1")), coProf);
  assert.equal(r.excluded, false, JSON.stringify(r.reasons));
  const flag = (r.restrictions || []).find((x) => x.type === "state_residency");
  assert.equal(flag.disposition, "satisfied");
  assert.ok(!(r.needs_user_input || []).some((q) => q.type === "state_residency"));
});

test("APD-2 peer classes: work-authorization and clearance restrictions are structured flags too", () => {
  const sponsorProf = { skills: [{ name: "Python", proven: true }], level: "student", experience_years: 1, constraints: { work_authorization: "F-1 OPT, needs sponsorship", needs_sponsorship: true, clearance: null }, preferences: {} };
  const cite = { job_id: "w1", company: "Fed Co", title: "Software Engineer", location: "Remote — United States", remote: "remote", jd_text: "US citizens only. Requires TS/SCI security clearance. Python.", source: "greenhouse" };
  const ev = J.evaluateRestrictions(cite, sponsorProf);
  assert.ok(ev.restrictions.some((x) => x.type === "work_authorization" && x.disposition === "excluded"), JSON.stringify(ev.restrictions));
  assert.ok(ev.restrictions.some((x) => x.type === "clearance" && x.disposition === "excluded"), JSON.stringify(ev.restrictions));
  const r = J.scoreFit(cite, sponsorProf);
  assert.equal(r.excluded, true);
  assert.ok((r.restrictions || []).length >= 2);
});

test("APD-2 peer class: location-radius — different-state residence excluded, unknown residence asked", () => {
  const radius = { job_id: "r1", company: "Radius Co", title: "Software Engineer", location: "Denver, CO", remote: "hybrid", jd_text: "Hybrid role. You must live within 25 miles of Denver, CO. Python SQL.", source: "greenhouse" };
  const rKnown = J.scoreFit(radius, P1); // P1 residence Chicago, IL
  assert.equal(rKnown.excluded, true, JSON.stringify(rKnown));
  assert.ok(rKnown.reasons.some((x) => /25 miles of Denver/i.test(x) || /radius/i.test(x)), JSON.stringify(rKnown.reasons));
  const unknownProf = { skills: [{ name: "Python", proven: true }], level: "student", experience_years: 1, constraints: { work_authorization: "US citizen", needs_sponsorship: false }, preferences: {} };
  const rUnknown = J.scoreFit(radius, unknownProf);
  assert.equal(rUnknown.excluded, false);
  assert.ok((rUnknown.needs_user_input || []).some((q) => q.type === "location_radius"), JSON.stringify(rUnknown.needs_user_input));
});

// ---------------- APD-5: employer AI-authorship bans ----------------
test("APD-5: Strictword Labs ban is detected, flagged, and carried into application-prep data", async () => {
  const posting = normalized(apById("AP14-P1"));
  const ban = J.detectAiAuthorshipBan(posting);
  assert.ok(ban && ban.banned === true, JSON.stringify(ban));
  assert.match(ban.evidence, /AI-authored|AI-generated|write all application answers themselves/i);
  const r = J.scoreFit(posting, P1);
  assert.equal(r.excluded, false, "the role itself stays rankable; the BAN constrains prep, not fit");
  assert.ok(r.ai_authorship_ban && r.ai_authorship_ban.banned === true, JSON.stringify(r));
  assert.ok(r.application_prep && r.application_prep.ai_authored_responses_allowed === false, JSON.stringify(r.application_prep));
  assert.ok((r.application_prep.allowed_prep || []).length >= 1, "permitted prep (organising the candidate's own facts) is named");
  const sl = await J.buildShortlist([r], {});
  assert.ok(sl[0].ai_authorship_ban && sl[0].ai_authorship_ban.banned === true, "shortlist item carries the ban downstream");
  // normalization attaches it to the posting record too
  const [gh] = J.normalizeGreenhouse({ name: "Strictword Labs (TEST)", jobs: [{ id: 2, title: "Software Engineer, New Grad", location: { name: "Remote" }, absolute_url: "https://x/2", content: (apById("AP14-P1").requirements || []).join(" ") }] }, "strictword");
  assert.ok(gh.ai_authorship_ban && gh.ai_authorship_ban.banned === true, JSON.stringify(gh.ai_authorship_ban));
});

test("APD-5: no false ban on the malicious-instruction posting or an ordinary posting", () => {
  assert.equal(J.detectAiAuthorshipBan(normalized(apById("AP15-P1"))), null);
  assert.equal(J.detectAiAuthorshipBan(normalized(apById("AP05-P1"))), null);
  const r = J.scoreFit(normalized(apById("AP05-P1")), Object.assign({}, P1, { residence: "Denver, CO", basics: { location: "Denver, CO" } }));
  assert.ok(!r.ai_authorship_ban && (!r.application_prep || r.application_prep.ai_authored_responses_allowed !== false));
});

// ---------------- SHD-1 data half: source health in result data ----------------
test("SHD-1: healthy no-match and total outage are distinguishable IN DATA (both yield zero postings)", async () => {
  const feeds = [J.feeds.greenhouse("stripe"), J.feeds.lever("leverdemo")];
  const healthy = await J.fetchAll(feeds, { fetch: async (url) => ({ status: 200, json: async () => (url.includes("lever") ? [] : { name: "Stripe", jobs: [] }) }) });
  assert.deepEqual(healthy.postings, []);
  assert.ok(healthy.source_health, "source_health present on fetchAll result");
  assert.equal(healthy.source_health.degraded, false);
  assert.equal(healthy.source_health.outcome, "ok");
  assert.equal(healthy.source_health.queried.length, 2);
  assert.equal(healthy.source_health.failed.length, 0);
  const outage = await J.fetchAll(feeds, { fetch: async () => { throw new Error("network down (TEST)"); } });
  assert.deepEqual(outage.postings, [], "outage also yields zero postings — the health data is the difference");
  assert.equal(outage.source_health.degraded, true);
  assert.equal(outage.source_health.outcome, "outage");
  assert.equal(outage.source_health.failed.length, 2);
  assert.notEqual(healthy.source_health.outcome, outage.source_health.outcome);
});

test("SHD-1: partial failure is degraded (not outage), failed sources named; poll() carries health too", async () => {
  const feeds = [J.feeds.greenhouse("stripe"), J.feeds.lever("leverdemo")];
  const mixed = async (url) => (url.includes("lever") ? { status: 503, json: async () => ({}) } : { status: 200, json: async () => ({ name: "Stripe", jobs: [] }) });
  const r = await J.fetchAll(feeds, { fetch: mixed });
  assert.equal(r.source_health.outcome, "degraded");
  assert.equal(r.source_health.degraded, true);
  assert.equal(r.source_health.failed.length, 1);
  assert.equal(r.source_health.failed[0].source, "lever");
  assert.equal(r.source_health.succeeded.length, 1);
  const kv = new Map(); const store = { get: (k) => kv.get(k) || null, set: (k, v) => kv.set(k, v) };
  const polled = await J.poll(feeds, { fetch: mixed, store, now: Date.parse("2026-10-13T00:00:00Z") });
  assert.ok(polled.source_health && polled.source_health.outcome === "degraded", JSON.stringify(polled.source_health));
  const h = J.sourceHealth([{ source: "greenhouse", company_token: "x", status: 200, postings: [] }]);
  assert.equal(h.outcome, "ok");
});

// ---------------- APD-3 module half: typed ingest failures + merge ----------------
const RESUME_TEXT = ["TEST Resume Person", "Experience", "Backend Intern, TEST Systems Inc", "- Built Python export scripts", "Skills", "Python, Go"].join("\n");
test("APD-3: corrupt/binary upload is a typed 'unreadable' failure — no facts added, no silent profile-only fall-through", () => {
  const p = P.createProfile({ basics: { name: "TEST Person" } });
  const before = p.facts.length;
  const r = P.ingestResume(p, { fileName: "resume.pdf", text: "%PDF-1.7\n\u0000\u0001\u0002 binarygarbage \uFFFD\uFFFD\uFFFD" });
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.failure.kind, "ingest_failure");
  assert.equal(r.failure.reason_class, "unreadable");
  assert.ok(r.failure.next_step, "caller can speak the recovery step");
  assert.deepEqual(r.drafts, []);
  assert.equal(p.facts.length, before, "a failed ingest adds NOTHING");
});

test("APD-3: empty upload is a typed 'empty' failure (blank string, empty string, missing input)", () => {
  const p = P.createProfile({});
  for (const input of ["", "   \n \n", null, undefined, { fileName: "resume.txt", text: "  " }]) {
    const r = P.ingestResume(p, input);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.equal(r.failure.reason_class, "empty", JSON.stringify(r.failure));
  }
  // text with no extractable resume content is also 'empty', never a silent zero-draft success
  const r2 = P.ingestResume(p, "just a name and nothing else");
  assert.equal(r2.ok, false); assert.equal(r2.failure.reason_class, "empty");
  assert.equal(p.facts.length, 0);
});

test("APD-3: unsupported formats are a typed 'unsupported' failure (DOCX/PDF/scanned image), even with text attached", () => {
  const p = P.createProfile({});
  const docx = P.ingestResume(p, { fileName: "resume.docx", text: RESUME_TEXT });
  assert.equal(docx.ok, false); assert.equal(docx.failure.reason_class, "unsupported");
  assert.match(docx.failure.reason, /docx/i);
  const scanned = P.ingestResume(p, { fileName: "scan.pdf", mimeType: "application/pdf", text: "" });
  assert.equal(scanned.ok, false); assert.equal(scanned.failure.reason_class, "unsupported");
  const img = P.ingestResume(p, { fileName: "resume.png", mimeType: "image/png", text: "" });
  assert.equal(img.failure.reason_class, "unsupported");
  assert.equal(p.facts.length, 0);
  assert.ok(P.classifyResumeIngest({ fileName: "resume.txt", text: RESUME_TEXT }).ok);
});

test("APD-3: a valid file merges under correction precedence — confirmed facts win, duplicates skipped with audit", () => {
  const p = P.createProfile({ basics: { name: "TEST Person" } });
  const confirmedSkill = P.addFact(p, { kind: "skill", name: "Python", title: "Python", text: "Skill: Python", evidence: ["somewhere"] });
  assert.equal(confirmedSkill.status, "confirmed");
  const r = P.ingestResume(p, { fileName: "resume.txt", text: RESUME_TEXT });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.failure, null);
  // Python was already confirmed: no duplicate draft is created for it
  assert.ok(!r.drafts.some((d) => d.kind === "skill" && d.name === "Python"), JSON.stringify(r.drafts.map((d) => d.name || d.title)));
  assert.ok((r.skipped_duplicates || []).some((x) => /python/i.test(x.title || x.name || "") && x.existing_fact_id === confirmedSkill.id), JSON.stringify(r.skipped_duplicates));
  // the genuinely new skill arrives as a DRAFT (ingest never canonises)
  const go = r.drafts.find((d) => d.kind === "skill" && d.name === "Go");
  assert.ok(go && go.needs_confirmation === true && go.status === "draft");
  // the confirmed fact is untouched by the merge
  const after = P.getFact(p, confirmedSkill.id);
  assert.equal(after.status, "confirmed"); assert.equal(after.needs_confirmation, false);
  // audit trail in the result, same shape family as a correction audit
  assert.ok((r.audit || []).some((a) => a.action === "added_draft" && a.fact_id === go.id), JSON.stringify(r.audit));
  assert.ok((r.audit || []).some((a) => /skipped/.test(a.action)), JSON.stringify(r.audit));
});

// ---------------- SHD-3: deletion + retention ----------------
test("SHD-3: retention declaration exists as data the export surface can quote", () => {
  const d = P.retentionDeclaration();
  assert.ok(d && Array.isArray(d.keeps) && d.keeps.length >= 2, JSON.stringify(d));
  for (const k of d.keeps) { assert.ok(k.data && k.where && k.retention, JSON.stringify(k)); }
  assert.ok("backups" in d && "processors" in d, "backups/processors are declared, not left blank");
  assert.match(d.deletion.function, /deleteProfileData/);
  assert.ok(typeof d.text === "string" && /delete/i.test(d.text), "quotable text form included");
  assert.deepEqual(P.RETENTION_DECLARATION.keeps, d.keeps);
});

test("SHD-3: deletion preview lists exactly what would go, and deletes nothing", () => {
  const p = P.profileFromData(P1raw);
  const before = p.facts.map((f) => f.id);
  const preview = P.previewProfileDeletion(p);
  assert.equal(preview.deleted, false);
  assert.deepEqual(preview.removed.fact_ids.slice().sort(), before.slice().sort());
  assert.equal(preview.removed.fact_count, before.length);
  assert.equal(p.facts.length, before.length, "preview mutates nothing");
});

test("SHD-3: deleteProfileData actually deletes — facts, connections, sections, derived records — with a receipt", () => {
  const p = P.profileFromData(P1raw);
  p.connections.push({ name: "TEST Contact", company: "TEST Co", source: "linkedin-export" });
  p.profile_corrections = [{ at: null, changes: [] }];
  p.dependent_state = { rebuilt: true };
  p.resume_sources = { active: "resume-new.txt" };
  const ids = p.facts.map((f) => f.id);
  const receipt = P.deleteProfileData(p, { now: "2026-10-13T00:00:00.000Z" });
  assert.equal(receipt.deleted, true);
  assert.deepEqual(receipt.removed.fact_ids.slice().sort(), ids.slice().sort());
  assert.equal(receipt.removed.connection_count, 1);
  assert.ok(receipt.removed.derived_records.includes("profile_corrections"), JSON.stringify(receipt.removed));
  assert.equal(receipt.remaining.fact_count, 0);
  assert.equal(p.facts.length, 0);
  assert.equal(p.connections.length, 0);
  assert.equal(p.basics.name, null);
  assert.equal(p.constraints.graduationDate, null);
  assert.equal(p.profile_corrections, undefined);
  assert.equal(p.dependent_state, undefined);
  // idempotent: deleting again is a clean zero receipt, not a throw
  const again = P.deleteProfileData(p);
  assert.equal(again.deleted, true); assert.equal(again.removed.fact_count, 0);
});
