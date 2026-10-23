// career-quality-niwire.test.cjs — tests for the grader-v2 CLI wiring of
// the capability-absent list (the NI wire-up gap recorded in
// docs/stability/runs/2026-10-13-79bee2f.md §6/§11): the CLI `rescore`
// path used to call gradeDir with no capabilityAbsent option at all, so
// NOT IMPLEMENTED was unreachable from the CLI even after owner approval.
//
// Contract under test (00 NI rule, fail-closed):
//   - `--capability-absent <path>` is accepted by rescore / grade-fresh
//     and the parsed list is passed into gradeDir.
//   - The loader enforces the approval gate: unless the file's `status`
//     field states owner-approved, the effective list is EMPTY (NI stays
//     unreachable) and the run index records
//     capability_absent: { loaded: true, approved: false, ni_enabled: false }.
//   - An approved file enables NI only via the existing verdict logic:
//     listed scenario ID + honest R-C7 reply shape + no S0. Nothing here
//     loosens that logic — "I didn't catch that" is never NI.
// Tooling tests only; no product code is exercised.
//
// State note (2026-10-13): the COMMITTED list is no longer a draft — the
// owner approved it as "Draft v1" with conditions (the version label lives
// in the file's `version` field; the `status` field carries the approval).
// The two committed-list tests below assert that approved state. The
// fail-closed DRAFT gate itself is unchanged and is still covered by the
// tmp-fixture tests (a draft/pending status hands gradeDir an empty list).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const G = require("../scripts/career/gauntlet/grader-v2.cjs");
const Reply = require("../packages/domain/140-career-reply.js");
const GRADER = path.join(__dirname, "../scripts/career/gauntlet/grader-v2.cjs");
const REAL_DRAFT = path.join(__dirname, "../docs/quality-spec/capability-absent.json");

const HONEST_R_C7 = "Voice mock interviews are not available yet — there is no speech path in this build. The closest real alternative is a text mock with the same questions and rubric. Want me to start a text mock instead?";
const DIDNT_CATCH = "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.";

// A record that is deterministic-FAIL (one S1 scenario assertion), has no
// S0, and whose verdict therefore hinges entirely on the NI branch.
function makeRecord(reply, scenarioId = "SC-901") {
  return {
    scenario_id: scenarioId, family: "Interview Prep",
    canonical_ask: "Run a voice mock interview with me speaking my answers aloud",
    delivered_messages: [reply],
    state: { events: [] },
    assertions: [{ id: scenarioId + "-A1", pass: false, description: "capability absent at this build", observed: "no handler owns this turn" }],
  };
}

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "niwire-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function writeAbsentFile(dir, status, scenarioIds = ["SC-901"]) {
  const file = path.join(dir, "capability-absent.json");
  fs.writeFileSync(file, JSON.stringify({
    status,
    entries: [{ id: "CA-TEST", capability: "Voice / speech mock interviews (test fixture)", scenario_ids: scenarioIds }],
  }, null, 2) + "\n");
  return file;
}
function writeRecordsDir(dir, record) {
  const recDir = path.join(dir, "records");
  fs.mkdirSync(path.join(recDir, record.scenario_id), { recursive: true });
  fs.writeFileSync(path.join(recDir, record.scenario_id, "record.json"), JSON.stringify(record, null, 2) + "\n");
  return recDir;
}
function runCli(t, cmd, record, absentPath) {
  const dir = tmpDir(t);
  const records = writeRecordsDir(dir, record);
  const out = path.join(dir, "index.json");
  const args = [GRADER, cmd, "--records", records, "--out", out];
  if (absentPath) args.push("--capability-absent", absentPath);
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(r.status, 0, `CLI ${cmd} failed: ${r.stderr || r.stdout}`);
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

// ---- loader: approval gate -------------------------------------------------

test("loader: the committed list is owner-approved (Draft v1) and enables NI for exactly its listed IDs", () => {
  const info = G.loadCapabilityAbsent(REAL_DRAFT);
  assert.equal(info.loaded, true);
  assert.equal(info.approved, true, "the owner approved the list as Draft v1 on 2026-10-13");
  assert.equal(info.ni_enabled, true);
  assert.deepEqual(info.capabilityAbsent, info.scenario_ids, "an approved list's effective list is exactly its listed IDs");
  assert.ok(info.scenario_ids.length > 0 && info.scenario_ids.includes("SC-287"), "the approved list's IDs are parsed and effective");
  assert.deepEqual(G.capabilityAbsentSummary(info), { loaded: true, approved: true, ni_enabled: true });
});

test("loader: an owner-approved status enables exactly the listed IDs", (t) => {
  const dir = tmpDir(t);
  const file = writeAbsentFile(dir, "OWNER-APPROVED by the owner on 2026-10-13");
  const info = G.loadCapabilityAbsent(file);
  assert.equal(info.approved, true);
  assert.equal(info.ni_enabled, true);
  assert.deepEqual(info.capabilityAbsent, ["SC-901"]);
  assert.deepEqual(G.capabilityAbsentSummary(info), { loaded: true, approved: true, ni_enabled: true });
});

test("loader: approval wording buried in a draft/pending status stays unapproved (fail-closed)", (t) => {
  const dir = tmpDir(t);
  for (const status of [
    "DRAFT — owner approval pending; NOT IMPLEMENTED may not be graded from this list until approved",
    "owner-approved — DRAFT, pending final review",
    "not approved by the owner",
    "",
  ]) {
    const file = writeAbsentFile(dir, status);
    const info = G.loadCapabilityAbsent(file);
    assert.equal(info.approved, false, `status must not enable NI: ${JSON.stringify(status)}`);
    assert.deepEqual(info.capabilityAbsent, []);
  }
});

test("loader: a missing or malformed file throws instead of silently disabling the gate", (t) => {
  const dir = tmpDir(t);
  assert.throws(() => G.loadCapabilityAbsent(path.join(dir, "nope.json")), /cannot load capability-absent list/);
  const bad = path.join(dir, "bad.json");
  fs.writeFileSync(bad, "{ not json");
  assert.throws(() => G.loadCapabilityAbsent(bad), /cannot load capability-absent list/);
  assert.throws(() => G.loadCapabilityAbsent(null), /requires a <path>/);
});

test("summary: no file loaded records the disabled state", () => {
  assert.deepEqual(G.capabilityAbsentSummary(null), { loaded: false, approved: false, ni_enabled: false });
});

// ---- grade(): NI only through the loader's effective list ----------------

test("draft-status file: NI unreachable even for a listed ID with an honest R-C7 reply", async (t) => {
  const dir = tmpDir(t);
  const info = G.loadCapabilityAbsent(writeAbsentFile(dir, "DRAFT — owner approval pending"));
  const r = await G.grade(makeRecord(HONEST_R_C7), { capabilityAbsent: info.capabilityAbsent });
  assert.equal(r.verdict, "FAIL");
});

test("the committed APPROVED list: NI reachable for a listed ID with an honest R-C7 reply", async () => {
  const info = G.loadCapabilityAbsent(REAL_DRAFT);
  const r = await G.grade(makeRecord(HONEST_R_C7, "SC-287"), { capabilityAbsent: info.capabilityAbsent });
  assert.equal(r.verdict, "NOT IMPLEMENTED", "SC-287 is listed in the owner-approved Draft v1 list and the reply is an honest R-C7 shape, so NI fires");
});

test("approved file + listed ID + honest R-C7 reply -> NOT IMPLEMENTED", async (t) => {
  const dir = tmpDir(t);
  const info = G.loadCapabilityAbsent(writeAbsentFile(dir, "OWNER-APPROVED by the owner on 2026-10-13"));
  const r = await G.grade(makeRecord(HONEST_R_C7), { capabilityAbsent: info.capabilityAbsent });
  assert.equal(r.verdict, "NOT IMPLEMENTED");
  assert.match(r.verdictReason, /capability-absent list/);
  assert.equal(r.severityCounts.S0, 0);
});

test("approved file + listed ID + 'I didn't catch that' reply -> FAIL S1, never NI", async (t) => {
  const dir = tmpDir(t);
  const info = G.loadCapabilityAbsent(writeAbsentFile(dir, "OWNER-APPROVED by the owner on 2026-10-13"));
  const r = await G.grade(makeRecord(DIDNT_CATCH), { capabilityAbsent: info.capabilityAbsent });
  assert.equal(r.verdict, "FAIL");
  assert.ok(r.failures.some((f) => f.check === "H-1" && f.severity === "S1"), "the dead-end fallback must grade FAIL (S1) via H-1: " + JSON.stringify(r.failures));
});

test("approved file + listed ID + the 2026-10-23 fallback text -> FAIL S1, never NI", async (t) => {
  const dir = tmpDir(t);
  const info = G.loadCapabilityAbsent(writeAbsentFile(dir, "OWNER-APPROVED by the owner on 2026-10-13"));
  const r = await G.grade(makeRecord(Reply.fallback("unmatched")), { capabilityAbsent: info.capabilityAbsent });
  assert.equal(r.verdict, "FAIL");
  assert.ok(r.failures.some((f) => f.check === "H-1" && f.severity === "S1"), "the new fallback text is still the dead-end fallback: " + JSON.stringify(r.failures));
});

test("approved file + UNLISTED ID + honest R-C7 reply -> FAIL as before", async (t) => {
  const dir = tmpDir(t);
  const info = G.loadCapabilityAbsent(writeAbsentFile(dir, "OWNER-APPROVED by the owner on 2026-10-13"));
  const r = await G.grade(makeRecord(HONEST_R_C7, "SC-902"), { capabilityAbsent: info.capabilityAbsent });
  assert.equal(r.verdict, "FAIL");
});

// ---- CLI: rescore / grade-fresh wire the flag through to the index -------

test("CLI rescore with the DRAFT file: index records the disabled state and NI stays unreachable", (t) => {
  const dir = tmpDir(t);
  const draft = writeAbsentFile(dir, "DRAFT — owner approval pending; NOT IMPLEMENTED may not be graded from this list until approved");
  const index = runCli(t, "rescore", makeRecord(HONEST_R_C7), draft);
  assert.deepEqual(index.capability_absent, { loaded: true, approved: false, ni_enabled: false });
  assert.equal(index.results.length, 1);
  assert.equal(index.results[0].verdict, "FAIL");
  assert.equal(index.counts["NOT IMPLEMENTED"] || 0, 0);
});

test("CLI grade-fresh with an APPROVED file: index records ni_enabled and the listed honest record grades NI", (t) => {
  const dir = tmpDir(t);
  const approved = writeAbsentFile(dir, "OWNER-APPROVED by the owner on 2026-10-13");
  const index = runCli(t, "grade-fresh", makeRecord(HONEST_R_C7), approved);
  assert.deepEqual(index.capability_absent, { loaded: true, approved: true, ni_enabled: true });
  assert.equal(index.results[0].verdict, "NOT IMPLEMENTED");
  assert.equal(index.counts["NOT IMPLEMENTED"], 1);
});

test("CLI rescore with an APPROVED file: 'I didn't catch that' still grades FAIL (never NI)", (t) => {
  const dir = tmpDir(t);
  const approved = writeAbsentFile(dir, "OWNER-APPROVED by the owner on 2026-10-13");
  const index = runCli(t, "rescore", makeRecord(DIDNT_CATCH), approved);
  assert.deepEqual(index.capability_absent, { loaded: true, approved: true, ni_enabled: true });
  assert.equal(index.results[0].verdict, "FAIL");
  assert.ok(index.results[0].failures.some((f) => f.check === "H-1" && f.severity === "S1"));
});

test("CLI rescore without the flag: unchanged behaviour, index records loaded: false", (t) => {
  const index = runCli(t, "rescore", makeRecord(HONEST_R_C7), null);
  assert.deepEqual(index.capability_absent, { loaded: false, approved: false, ni_enabled: false });
  assert.equal(index.results[0].verdict, "FAIL");
});
