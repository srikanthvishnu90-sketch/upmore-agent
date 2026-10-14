// Career essay tailoring (SC-096) — 133's medEssayPacket through the
// real chat path. REPLAY for BUG-104 (residual lane, 2026-10-14):
// the ask "Tailor med-school application essays from my real clinical
// and research experiences" had NO route to the essay producer —
// 133's medEssayPacket existed for exactly this scenario but 142
// never called it. The turn fell through the tailor block into
// discovery (an honest non-answer about medicine ROLES), failing
// SCEN-A4 + STATE_doorstep_gap; in the earlier build the same ask
// was "answered" by a canned SWE resume tailor — a wrong-product
// PASS the corrected grader revoked. The fix routes essay asks to
// medEssayPacket and carries its packet as the turn's artifact +
// payload; the reply names which asked-for themes the profile
// actually holds and which are missing — never dressing unrelated
// experience as clinical/research material.
// Check: node --test tests/career-essay-tailor.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-essay-test-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-essay-test-evidence";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const H = L.H;
const ASK = "Tailor med-school application essays from my real clinical and research experiences";

function drive(id, ask, profile) {
  const s = H.session(id, "essay-fix");
  const turn = L.chatTurn(s, ask, { profile });
  return { r: turn.result || {}, text: (turn.delivered || []).join("\n") };
}

test("SC-096: the essay ask routes to the essay packet, built from confirmed facts (BUG-104)", () => {
  const { r } = drive("SC-096", ASK, L.gauntletProfile("p1-early-career-swe"));
  assert.equal(r.intent, "career_essay");
  assert.equal(r.sends || 0, 0);
  assert.ok(r.payload && r.payload.kind === "essay_packet", "the 133 packet is the carried record");
  assert.equal(r.payload.ok, true);
  assert.ok(Array.isArray(r.payload.essays) && r.payload.essays.length >= 1);
  const outline = r.payload.essays[0].outline;
  assert.equal(outline.length, 3, "P1 holds exactly 3 usable facts (education, project, experience)");
  assert.ok(outline.every((p) => typeof p.factId === "string" && p.factId), "every outline point cites its fact");
  assert.ok(r.artifact && r.artifact.kind === "essay_packet", "the packet is the application-family artifact (doorstep)");
});

test("SC-096: the reply names the themes the profile does NOT hold — no dressing up (BUG-104)", () => {
  const { r, text } = drive("SC-096", ASK, L.gauntletProfile("p1-early-career-swe"));
  assert.deepEqual(r.payload.themes_requested, ["clinical", "research"]);
  assert.deepEqual(r.payload.missing_themes, ["clinical", "research"], "a SWE profile holds neither theme");
  assert.match(text, /no clinical or research experience/i, "the gap is stated in the reply, not hidden");
});

test("SC-096: a clinical profile's themes register as on file (BUG-104)", () => {
  const maya = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/persona-medicine-nursing.json"), "utf8"));
  const { r } = drive("SC-096M", ASK, maya);
  assert.equal(r.intent, "career_essay");
  assert.equal(r.payload.ok, true);
  assert.ok(r.payload.themes_on_file.includes("clinical"), "CNA / nurse-extern / clinic facts are clinical material");
  assert.ok(!r.payload.missing_themes.includes("clinical"));
  assert.ok(r.payload.essays[0].outline.length >= 3);
});

test("SC-096: a profile with no usable facts gets the typed blocker, never an invented essay (BUG-104)", () => {
  const empty = { basics: { name: "Empty Profile (TEST)" }, facts: [], preferences: {}, constraints: {}, defaults: {} };
  const { r, text } = drive("SC-096E", ASK, empty);
  assert.equal(r.intent, "career_essay");
  assert.equal(r.payload.ok, false);
  assert.match(r.payload.reason, /never invented/i, "133's own refusal reason rides the record");
  assert.match(text, /no confirmed experience/i);
});

test("SC-096: a plain resume-tailor ask does NOT route to the essay branch (BUG-104)", () => {
  const { r } = drive("SC-096R", "Tailor my resume for a software engineering role", L.gauntletProfile("p1-early-career-swe"));
  assert.notEqual(r.intent, "career_essay");
});
