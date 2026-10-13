// W06 Apply-3 (132) + SC-103/SC-104 replay tests. Check: node --test tests/career-apply3.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const A = require(path.join(__dirname, "..", "packages/domain/132-career-apply3.js"));
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const FX = path.join(__dirname, "..", "packages/career-data/fixtures");
const log = JSON.parse(fs.readFileSync(path.join(FX, "test-application-log.json"), "utf8"));
const inbox = JSON.parse(fs.readFileSync(path.join(FX, "test-inbox.json"), "utf8"));

test("SC-115 seam: Stripe status answered from log + inbox with proof ids", () => {
  const rows = A.statusAnswer(log, inbox, "Stripe");
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.inbox_proof.length >= 1 && r.app_id.startsWith("TEST-APP-")));
});
test("SC-116 autopsy: counts computed from the 34 rows; silent vs emailed split", () => {
  const r = A.rejectionAutopsy(log, inbox);
  assert.equal(r.total, 34); assert.equal(r.rejected, 18);
  assert.equal(r.emailed_rejections + r.silent_rejections, 18);
  assert.ok(r.rejection_rate_pct > 50);
});
test("SC-118 salary parser: annual range, hourly annualization, no-band honesty", () => {
  assert.deepEqual(A.parseSalaryBand("Salary range $120,000 - $150,000.").min_annual, 120000);
  const h = A.parseSalaryBand("Compensation range $40/hr for interns.");
  assert.equal(h.min_annual, 40 * 2080);
  assert.equal(A.parseSalaryBand("Great team, no numbers.").found, false);
});
test("SC-103 replay: parser-swapped month + drifted date are caught and corrected from profile truth", () => {
  const truth = { "experience.0.start": "2025-06", "education.0.end": "2028-05" };
  const anomalies = A.detectDateAnomalies([
    { field: "experience.0.start", value: "2025-13" },
    { field: "education.0.end", value: "2028-06" },
    { field: "other", value: "2024-01" },
  ], truth);
  assert.equal(anomalies.length, 2);
  assert.equal(anomalies[0].corrected_value, "2025-06");
  assert.match(anomalies[0].issues.join(" "), /swapped/);
});
test("SC-104 replay: variant tailored for company A cannot attach to company B", () => {
  const variants = [{ variant_id: "VAR-SWE-TEST", company: "Stripe", job_id: "j1" }];
  assert.equal(A.guardAttach(variants, "Stripe", "VAR-SWE-TEST").ok, true);
  const blocked = A.guardAttach(variants, "Ramp", "VAR-SWE-TEST");
  assert.equal(blocked.ok, false); assert.match(blocked.reason, /tailored for Stripe/);
  assert.equal(A.guardAttach(variants, "Stripe", "VAR-NOPE").ok, false);
});
test("SC-107 radar: dated closes parsed from real CIR facts; WARN inside 14 days (simulated now)", () => {
  const bain = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/cirs/bain.json"), "utf8"));
  const at = Date.parse("2026-07-20T00:00:00Z"); // 42 days before Aug 31 -> open; check ACI entry
  const radar = A.deadlineRadar([bain], { now: at });
  const aci = radar.find((r) => /Intern/.test(r.route) && r.close_date);
  assert.ok(aci, JSON.stringify(radar));
  assert.equal(aci.close_date, "2026-08-31");
  const radar2 = A.deadlineRadar([bain], { now: Date.parse("2026-08-20T00:00:00Z") });
  assert.equal(radar2.find((r) => r === radar2.find((x) => x.close_date === "2026-08-31")).state, "WARN — inside 2 weeks");
});
test("SC-114 triage: duplicate + clearance + unknown classified with reasons", () => {
  const posting = { job_id: "x", company: "Acme", title: "Eng", url: "https://x/1", req_id: "1", source_urls: ["https://x/1"], jd_text: "Requires TS/SCI security clearance." };
  const rows = A.triageLinks(["https://x/1", "https://x/1", "https://unknown.example/9"], { postings: [posting], profile: {} });
  assert.equal(rows[0].verdict, "skip — clearance-blocked");
  assert.equal(rows[1].verdict, "duplicate");
  assert.match(rows[2].verdict, /ask/);
});
test("SC-113 judge: hard-excluded posting is a skip before any effort", () => {
  const prof = { skills: [{ name: "Python", proven: true }], degree: "B.S.", level: "student", experience_years: 1, experience_text: "", constraints: { work_authorization: "US citizen", locations: [] }, preferences: { role_families: [], locations: [] } };
  const senior = { job_id: "s1", company: "Acme", title: "Senior Software Engineer", role_family: "SWE", seniority_band: "senior", location: "Remote", remote: "remote", jd_text: "7+ years of experience." };
  assert.equal(A.eligibilityJudge(senior, prof).verdict, "skip");
});
<<<<<<< HEAD
=======

test("BUG-006 replay (SC-114): query-string job ids are distinct links, not duplicates", () => {
  const mk = (id) => ({ job_id: "j" + id, company: "Stripe", title: "Eng " + id, url: "https://stripe.com/jobs/search?gh_jid=" + id, req_id: String(id), source_urls: ["https://stripe.com/jobs/search?gh_jid=" + id], jd_text: "Build things in Python." });
  const rows = A.triageLinks(["https://stripe.com/jobs/search?gh_jid=1", "https://stripe.com/jobs/search?gh_jid=2", "https://stripe.com/jobs/search?gh_jid=1"], { postings: [mk(1), mk(2)], profile: {} });
  assert.notEqual(rows[0].verdict, "duplicate"); assert.notEqual(rows[1].verdict, "duplicate");
  assert.equal(rows[2].verdict, "duplicate");
});
>>>>>>> origin/career/sc-f02
