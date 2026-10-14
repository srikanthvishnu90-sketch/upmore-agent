// BUG-048 / BUG-049 GUARD — raw content hashes (and the sha256 label) must
// never render into user chat text, and a tailor reply must honor the
// lead-with emphasis the user named instead of substituting the generic
// "leads with your proven skills" line.
// Found by: reply-judge re-pass on the FINAL build (integrator-packs/
// reply-judge-repass.md) — Apply regressed 17 -> 11 wording PASS; 14
// delivered tailor/packet replies carried a raw 64-hex sha256 in the
// chat text (SC-062/065/068/070/087/088/090/091/092/093/094/095/096/108
// + SC-283 via the OS front door), and SC-087/090/092/093 dropped the
// user's exact lead-with constraint.
// Root cause: 142's handleTailor/handlePacket interpolated
// artifact.sha256 / selected.sha256 straight into spoken fact sentences,
// and module 140's composer — the single presentation path — had no rule
// against bare content digests, so the token sailed through lint,
// cleanInline and sentenceIsClean untouched. The hash still belongs in
// the typed artifact/packet/doorstep records (proof); it never belongs
// in a bubble.
// FAIL-FIRST: written against HEAD 483e52b — every test below was RED
// before the fix (composer rule in 140 + spoken-copy fix in 142).
// Per the owner's bug law these tests stay in the suite forever.
// Check: node --test tests/career-hash-leak-guard.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-hashleak-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-hashleak-evidence";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const H = L.H;
const CareerReply = require(path.join(ROOT, "packages/domain/140-career-reply.js"));

const HEX64 = /[0-9a-f]{64}/i;
const REAL_HASH = "152707c3a39d91fa1ff335f5ec2121fd2cf42626399b7125735bcc1d9974fe60";
const LEAK_SENTENCE = `Saved as a rendered artifact with real PDF and DOCX files attached, parse check PASS; the text version carries sha256 ${REAL_HASH}.`;

function drive(id, ask, ctxExtra) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "hash-leak-guard");
  const ctx = Object.assign({ profile }, ctxExtra || {});
  const turn = L.chatTurn(s, ask, ctx);
  return { turn, result: turn.result || {}, text: (turn.delivered || []).join("\n") };
}

function assertChatClean(text, label) {
  assert.ok(!HEX64.test(text), `${label}: delivered chat carries a raw 64-hex digest:\n${text}`);
  assert.ok(!/sha-?256/i.test(text), `${label}: delivered chat names sha256:\n${text}`);
}

// ---------- composer seam (module 140) ----------

test("BUG-048 composer: lint flags a raw sha256 digest and its label", () => {
  const v = CareerReply.lint(LEAK_SENTENCE);
  assert.equal(v.ok, false, "lint must reject a bubble carrying a content hash");
  assert.ok(v.violations.some((x) => /hash/i.test(x)), `expected a hash violation, got: ${v.violations.join("; ")}`);
});

test("BUG-048 composer: composeText can never deliver a content hash", () => {
  const bubbles = CareerReply.composeText(`${LEAK_SENTENCE} Review it when you are ready.`);
  assertChatClean(bubbles.join("\n"), "composeText");
});

test("BUG-048 composer: composeResult can never deliver a content hash", () => {
  const { bubbles } = CareerReply.composeResult({
    headline: "Your resume is tailored for Software Engineer, Intern at Stripe.",
    facts: [LEAK_SENTENCE],
    nextStep: "Review the artifact, and I can prepare the full application packet next.",
  });
  assertChatClean(bubbles.join("\n"), "composeResult");
});

// ---------- chat-path replay: tailor (142 handleTailor via pilot-lib) ----------

test("BUG-048+049 replay SC-087: no hash in chat; the user's lead-with is honored; the artifact record keeps its hash", () => {
  const { result, text } = drive("SC-087", "Tailor for Stripe SWE — lead with writing, craft, product-minded proof");
  assertChatClean(text, "SC-087");
  assert.ok(/writing, craft, and product-minded proof/.test(text), `reply must name the lead the user asked for; got:\n${text}`);
  assert.ok(!/It leads with your proven skills,/.test(text), "the generic lead-with substitution must not appear when the user named their lead");
  assert.ok(HEX64.test(JSON.stringify(result)), "the typed result must still carry the artifact hash — proof keeps the hash, chat drops it");
});

test("BUG-048+049 replay SC-090: no hash in chat; the 'forward' lead is honored", () => {
  const { text } = drive("SC-090", "Tailor for Jane Street — competitions, probability coursework, research forward");
  assertChatClean(text, "SC-090");
  assert.ok(/competitions, probability coursework, and research/.test(text), `reply must name the lead the user asked for; got:\n${text}`);
  assert.ok(!/It leads with your proven skills,/.test(text), "the generic lead-with substitution must not appear when the user named their lead");
});

test("BUG-048+049 replay SC-092: no hash in chat; the 'forward' lead is honored", () => {
  const { text } = drive("SC-092", "Tailor for Datadog backend — scale and systems evidence forward");
  assertChatClean(text, "SC-092");
  assert.ok(/scale and systems evidence/.test(text), `reply must name the lead the user asked for; got:\n${text}`);
  assert.ok(!/It leads with your proven skills,/.test(text), "the generic lead-with substitution must not appear when the user named their lead");
});

test("BUG-048+049 replay SC-093: no hash in chat; the 'forward' lead is honored", () => {
  const { text } = drive("SC-093", "Tailor for Ramp full-stack — shipped product and metrics forward");
  assertChatClean(text, "SC-093");
  assert.ok(/shipped product and metrics/.test(text), `reply must name the lead the user asked for; got:\n${text}`);
  assert.ok(!/It leads with your proven skills,/.test(text), "the generic lead-with substitution must not appear when the user named their lead");
});

// ---------- chat-path replay: packet (142 handlePacket artifact binding) ----------

test("BUG-048 replay packet: a bound artifact's hash stays in the typed packet, never in chat", () => {
  const { result, text } = drive("SC-102", "Prepare my application packet for the backend role", {
    artifacts: [{ name: "resume-backend.pdf", record: "backend", text: "Alex Testcase — backend resume text, systems and scale." }],
  });
  assert.ok(result.packet, `expected a typed packet; got intent=${result.intent}, reply: ${text.slice(0, 160)}`);
  assertChatClean(text, "packet");
  assert.ok(HEX64.test(JSON.stringify(result.packet)), "the typed packet must still carry the binding hash — proof keeps the hash, chat drops it");
});

// ---------- SC-104 wrong-resume guard copy (same defect class: mechanics in chat) ----------

test("BUG-048 replay SC-104 shape: the wrong-resume guard reply names no internal mechanics", () => {
  const { text } = drive("SC-104", "You nearly attached variant B to company A — the wrong-resume save");
  assert.ok(!/content hash/i.test(text), `guard reply must not lecture about content hashes; got:\n${text}`);
  assertChatClean(text, "SC-104");
});
