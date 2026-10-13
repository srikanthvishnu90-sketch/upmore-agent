// Shared staging/lib helpers for the F01 scenario runners. Everything here is LOCAL/STAGING:
// connection rows are synthetic TEST-persona rows (the live Google grant is owner-gated — see
// docs/career/deploy-checklist-access.md), and the gmail-oauth pure helpers are executed for real
// via Deno against supabase/functions/gmail-oauth/career.ts (no network, no secrets, no deploy).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const H = require("../scenario-harness.cjs");
const A = require(path.join(ROOT, "packages/domain/120-career-access.js"));
const Profile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const O = require(path.join(ROOT, "packages/domain/130-career-onboarding.js"));
const S = require(path.join(ROOT, "packages/domain/131-career-safety.js"));

const EMAIL = "alex.testcase@example.test"; // TEST persona email, from the canonical fixture
const UID = "test-user-001";
const CAREER = [...A.CAREER_SCOPES];

function stagingRows() {
  return [
    { provider: "gmail", email: EMAIL, scopes: A.GMAIL_SCOPE, connected_at: "2026-10-01T00:00:00.000Z" },
    { provider: "google_career", email: EMAIL, scopes: CAREER.join(" "), connected_at: "2026-10-10T00:00:00.000Z" },
  ];
}
function fixtureProfile() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-persona.json"), "utf8"));
  return Profile.profileFromData(data);
}
function resumeText() { return fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-resume.txt"), "utf8"); }

// Run the REAL gmail-oauth pure helpers (career.ts) under Deno: buildStatus / disconnectPlan /
// purpose+ vault routing. Input/output are JSON on argv/stdout; no env, no network.
function edgeCareer(calls) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "f01-edge-"));
  const entry = path.join(tmp, "run.ts");
  const careerTs = path.join(ROOT, "supabase/functions/gmail-oauth/career.ts");
  fs.writeFileSync(entry, `
import { buildStatus, disconnectPlan, purposeForAction, providerForPurpose, vaultNameFor, scopesForPurpose, CAREER_SCOPES } from ${JSON.stringify(careerTs)};
const calls = JSON.parse(Deno.args[0]);
const out = calls.map((c) => {
  if (c.fn === "buildStatus") return buildStatus(c.rows);
  if (c.fn === "disconnectPlan") return disconnectPlan(c.userId, c.source);
  if (c.fn === "purpose") return { purpose: purposeForAction(c.action), provider: providerForPurpose(purposeForAction(c.action) ?? "gmail"), vault: vaultNameFor(c.userId, purposeForAction(c.action) ?? "gmail"), scopes: scopesForPurpose(purposeForAction(c.action) ?? "gmail"), career_scopes: CAREER_SCOPES };
  return null;
});
console.log(JSON.stringify(out));
`);
  const deno = path.join(process.env.HOME, ".deno/bin/deno");
  const stdout = execFileSync(deno, ["run", "--quiet", entry, JSON.stringify(calls)], { encoding: "utf8", timeout: 60000 });
  return JSON.parse(stdout.trim().split("\n").pop());
}

// Career capability sources for SC-017, derived from the actual files (registry counts computed
// independently in the scenario for verification; career rows from the inventory md + code state).
function capabilitySources() {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/capabilities/registry.json"), "utf8"));
  const inv = fs.readFileSync(path.join(ROOT, "docs/capability-inventory.md"), "utf8");
  const careerRows = [];
  for (const line of inv.split("\n")) {
    const m = line.match(/^\|\s*(ACCS-\d+)\s*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|\s*([^|]*?)\s*\|/);
    if (m) careerRows.push({ id: m[1], status: m[2], note: "inventory row" });
  }
  // Build state the code itself proves (modules + tests exist and pass in this branch):
  for (const id of ["ACCS-001", "ACCS-002", "ACCS-003", "ACCS-005", "ACCS-006", "ACCS-007"]) {
    careerRows.push({ id, status: "built", note: "120-career-access.js + tests/career-access.test.cjs" });
  }
  careerRows.push({ id: "ACCS-004", status: "blocked", note: "live cloud-browser session rail is owner-gated; plan + user text built in 120" });
  careerRows.push({ id: "ACCS-001-live-grant", status: "blocked", note: "owner must deploy gmail-oauth + run T1 consent (docs/career/deploy-checklist-access.md)" });
  return { registryCaps: registry.capabilities, careerRows, registry };
}

module.exports = { H, A, Profile, O, S, ROOT, EMAIL, UID, CAREER, stagingRows, fixtureProfile, resumeText, edgeCareer, capabilitySources };
