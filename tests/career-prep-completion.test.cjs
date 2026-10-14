// Career Prep + Access completion — the no-company bank, the
// research record, the checklist, and the LinkedIn export plan,
// through the real chat path. REPLAYS for BUG-117/118 (residual
// lane, 2026-10-14):
//   BUG-117 — prep-set/question-bank turns composed the GENERIC
//     behavioral bank for every ask: the handler never passed the
//     ask's track (roleFamily), the company file, or the mined
//     stories into 127's questionBank, and 127 held no SWE coding
//     set and only two finance prompts; the payload was shadowed
//     by the NO_CIR brief wrapper, the interviewer-research record
//     rode an unread key while the payload was a question bank, and
//     no completion branch reads the bank/checklist/research
//     records (the F5 contract is definitionally company-grounded).
//   BUG-118 — the LinkedIn export turn (CA-05's sanctioned path)
//     already carried its typed ingest record; no completion
//     branch read it.
// Check: node --test tests/career-prep-completion.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-prep-test-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-prep-test-evidence";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const H = L.H;

function drive(id, ask) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "prep-fix");
  const turn = L.chatTurn(s, ask, { profile });
  return { r: turn.result || {}, bubbles: turn.delivered || [], text: (turn.delivered || []).join("\n") };
}

test("SC-177: the question bank is the payload, story state stated on the record (BUG-117)", () => {
  const { r } = drive("SC-177", "Question bank for this round, my best story matched to each question");
  const qs = (r.payload && r.payload.questions) || [];
  assert.ok(qs.length >= 3, "bank questions on the payload");
  assert.ok(qs.every((q) => q.source && q.source.type), "every question source-typed");
  assert.ok(typeof r.payload.cir_grounded === "boolean", "grounding state on the record");
  assert.ok(r.payload.stories_note || qs.some((q) => q.matched_story), "story mapping state is explicit (mapped, or the no-story reason rides the record)");
});

test("SC-183: a SWE coding ask gets a coding set, not the behavioral bank (BUG-117)", () => {
  const { r } = drive("SC-183", "SWE coding prep set matched to this company's known interview style");
  const qs = (r.payload && r.payload.questions) || [];
  const coding = qs.filter((q) => /coding|system_design|fundamentals/.test(q.round || "") || (q.source && q.source.type === "swe_coding_bank"));
  assert.ok(coding.length >= 2, `coding questions present (got rounds: ${qs.map((q) => q.round).join(",")})`);
});

test("SC-187: a bank technicals ask gets the technicals set — statements, DCF, comps, LBO (BUG-117)", () => {
  const { r, text } = drive("SC-187", "Bank technicals drill: three statements, DCF, comps, LBO basics — tested, gaps named");
  const qs = (r.payload && r.payload.questions) || [];
  const tech = qs.filter((q) => q.source && q.source.type === "finance_drill_bank");
  assert.ok(tech.length >= 3, `finance drill questions present (got ${tech.length})`);
  const all = qs.map((q) => q.q).join(" ");
  assert.match(all, /three financial statements/i);
  assert.match(all, /\bDCF\b/);
  assert.match(all, /\bLBO\b/);
  assert.match(all, /comps/i);
  assert.match(text, /DCF|three financial statements/i, "the delivered reply leads with the drill, not the behavioral bank");
});

test("SC-181: interviewer research is the payload AND the artifact; the reply ends on a question (BUG-117)", () => {
  const { r, bubbles } = drive("SC-181", "Interviewer research: the 3 people on my calendar invite — paths, teams, shared ground");
  assert.equal(r.payload && r.payload.kind, "interviewer_research");
  assert.ok(Array.isArray(r.payload.people), "people array on the record (empty until names are supplied — stated, not invented)");
  assert.equal(r.artifact && r.artifact.kind, "interviewer_research", "the research record is the doorstep artifact");
  const last = bubbles[bubbles.length - 1] || "";
  assert.ok(/\?/.test(last), "H-12: the reply ends on a question or concrete next action");
});

test("SC-198: the day-of checklist rides as the payload with its groups (BUG-117)", () => {
  const { r } = drive("SC-198", "Day-of checklist: logistics, links, tech check, materials");
  assert.equal(r.intent, "prep_mock_checklist");
  const groups = (r.payload && r.payload.groups) || {};
  assert.ok(Object.keys(groups).length >= 3, "checklist groups on the record");
});

test("SC-287: the LinkedIn export plan record (BUG-118)", () => {
  const { r } = drive("SC-287", "Connect LinkedIn the zero-risk way: my data export uploaded and parsed into my graph");
  assert.equal(r.intent, "profile_export");
  assert.equal(r.payload && r.payload.kind, "linkedin_export_ingest");
  assert.equal(r.payload.requires_user_upload, true);
  assert.equal(r.payload.sign_in_required, false);
});
