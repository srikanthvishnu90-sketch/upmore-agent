/* MI-097 / BUG-236 / FR-394 — the writing-pattern system (module 154).
 *
 * FAIL-FIRST property: the guards are built on the 2026-10-13 MEASURED
 * corpora (packages/career-data/fixtures/writing-pattern-corpus.json):
 * the 12 networking drafts that failed HS-1/2/3/4/5/6 must FAIL the new
 * batch enforcer naming those classes; the doctrine-voice replies must
 * fail the tells check; an invented number must hard-fail fact-lock.
 * The owner-approved post-fix drafts must PASS the per-draft gate (they
 * were approved as individual drafts) — and the batch enforcer's verdict
 * on them is asserted FAIL with the recorded violation classes, because
 * approval of drafts is not a metric pass (10/10 carried the identical
 * bridge clause and logistics string; see MI-097).
 *
 * No detector scores anywhere (claims register): every assertion is a
 * deterministic metric from the design.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const W = require("../packages/domain/154-career-writing.js");
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages", "career-data", "fixtures", "writing-pattern-corpus.json"), "utf8"));

// Fact packs are built from each draft's STAGING record in the
// fixture (what the generator was fed, per the generation run's own
// records) — never from the draft under test.
const packFromStaging = (d) => [
  { id: "R", kind: "recipient", text: d.staging.recipientFact },
  { id: "S", kind: "sender", text: d.staging.senderFact },
  { id: "SL", kind: "sender", text: d.staging.senderLine },
  { id: "A", kind: "ask", text: "15 minutes" },
];
const waveGateOpts = (d) => ({ factPack: packFromStaging(d), recipient: { full_name: d.recipient, current_firm: d.firm, title: d.title }, senderName: d.staging.senderName });
const postfixGateOpts = (d) => ({ factPack: packFromStaging(d), recipient: { full_name: d.recipient, current_firm: d.firm, title: d.title }, senderName: d.staging.senderName });

// ---------- [G0] prohibition gate ----------
test("G0: MATS is OWNER_WRITE_ONLY (registry entry #1) and drafting is refused", () => {
  const g = W.gate0({ kind: "personal_statement", program: "MATS" });
  assert.equal(g.allowed, false);
  assert.equal(g.policy, "OWNER_WRITE_ONLY");
  assert.match(g.reason, /prohibits AI-written/);
});

test("G0: an unchecked personal statement defaults UNKNOWN -> owner-write-only", () => {
  const g = W.gate0({ kind: "personal_statement", program: "Some Unchecked Fellowship" });
  assert.equal(g.allowed, false);
  assert.equal(g.policy, "UNKNOWN");
});

test("G0: ordinary outreach is AI_OK; a disclosure-policy context ships its disclosure", () => {
  assert.equal(W.gate0({ kind: "outreach_email" }).allowed, true);
  const d = W.gate0({ kind: "cover_letter", context: { aiPolicy: "disclose" } });
  assert.equal(d.policy, "AI_ASSIST_WITH_DISCLOSURE");
  assert.equal(d.allowed, true);
  assert.equal(d.disclosureRequired, true);
});

// ---------- [2] voice profile ----------
test("voice profile: cold start is honestly null — never synthesized", () => {
  assert.equal(W.extractVoiceProfile([]), null);
  assert.equal(W.extractVoiceProfile(["Too short."]), null);
  assert.equal(W.renderPromptV2(null, { factsText: "x" }), null);
});

test("voice profile: statistics come from the samples themselves", () => {
  const samples = [
    "I keep my emails short. Really short. The point lands faster that way, and nobody has time for a wall of text about my sophomore summer in the first place.",
    "Quick one. I saw your note on the panel — the part about hiring analysts who can actually write stuck with me because my club makes us defend every pick in writing. Could we talk Thursday? Fifteen minutes is plenty.",
    "No warm-up here. I built the thing, it broke twice, and the second break taught me more than the launch did. That is the honest version and I would rather send that than a polished one.",
  ];
  const p = W.extractVoiceProfile(samples);
  assert.ok(p, "profile builds from >=3 samples");
  assert.ok(p.sentenceLength.cv > 0.3, `bursty samples give a bursty CV (got ${p.sentenceLength.cv})`);
  assert.ok(p.sentenceLength.shortShare > 0, "short-sentence share measured");
  assert.ok(p.basis.sentences >= 10);
  const text = W.voiceTargetsText(p);
  assert.match(text, /Your sentences average/);
  assert.match(text, /CV/);
  const rendered = W.renderPromptV2(p, W.sampleStructuralSeed(p, { seed: 5 }));
  assert.match(rendered, /Opening mode: /);
  assert.match(rendered, /Length band: /);
});

test("edit capture folds the user's own edits into the profile without keeping prose", () => {
  const samples = [
    "I write plainly and I keep sentences in the middle range most days because that is how I talk when I am explaining a position to someone across the table from me.",
    "My second sample also runs in the middle range with a steady rhythm and a similar length to the first one so the starting profile is fairly even overall today.",
    "And a third sample keeps that same even pace going with nothing especially short or long inside it at all for now in this particular test fixture sample set.",
  ];
  const before = W.extractVoiceProfile(samples);
  const edited = "Short. Very short. I cut it down to almost nothing at all, because the long version said the same thing three separate times in a row without adding a single new fact to any of it.";
  const after = W.captureEdits(before, "the original draft text the user replaced", edited);
  assert.ok(after.sentenceLength.shortShare > before.sentenceLength.shortShare, "the edit's short sentences move the distribution");
  assert.equal(JSON.stringify(after).includes("cut it down"), false, "no prose is retained in the profile — statistics only");
});

// ---------- prompt assets ----------
test("prompt assets: v1 + v2 docs exist; the module template cannot drift from the v2 doc", () => {
  const v1 = fs.readFileSync(path.join(__dirname, "..", "docs", "career", "writing-pattern-prompt-v1.md"), "utf8");
  assert.match(v1, /HUMAN PATTERN/);
  assert.match(v1, /Never invent/);
  const v2doc = fs.readFileSync(path.join(__dirname, "..", "docs", "career", "writing-pattern-prompt-v2.md"), "utf8");
  const m = v2doc.match(/```\n([\s\S]*?)```/);
  assert.ok(m, "v2 doc carries the template in a fenced block");
  assert.equal(m[1].trim(), W.PATTERN_PROMPT_V2_TEMPLATE.trim(), "doc template == module template (drift guard)");
});

// ---------- [4] slop gate — fail-first on the measured fixtures ----------
test("fail-first: the doctrine-voice replies fail the tells check (SC-206 canonical)", () => {
  for (const d of corpus.doctrineReplies.filter((x) => ["SC-100", "SC-206"].includes(x.id))) {
    const card = W.slopGate(d.bubbles.join("\n\n"), { factPack: [], senderName: "Alex Testcase (TEST)" });
    assert.equal(card.metrics.tells.pass, false, `${d.id} must fail tells; detail: ${card.metrics.tells.detail}`);
    assert.match(card.metrics.tells.detail, /tricolon/);
  }
});

test("fail-first: banned-phrase slop fails on the first hit", () => {
  const slop = "Hi Ana,\n\nI hope this email finds you well. I came across your profile and was impressed by your journey in the dynamic world of finance. I would love to pick your brain about synergies.\n\nThanks,\nSam";
  const card = W.slopGate(slop, { factPack: [], recipient: { full_name: "Ana Ruiz (TEST)", current_firm: "Leerink Partners", title: "Analyst" }, senderName: "Sam" });
  assert.equal(card.pass, false);
  assert.ok(card.failures.includes("banned_phrases"));
  assert.ok(card.metrics.banned_phrases.value.hard.length >= 3, `hard bans hit: ${JSON.stringify(card.metrics.banned_phrases.value.hard)}`);
});

test("fail-first: an invented number hard-fails fact-lock and is named", () => {
  const d = corpus.approvedPostfix[0]; // "you worked on a sponsor-backed carve-out at Evercore"
  const tampered = d.body.replace("sponsor-backed carve-out", "a $40 million carve-out");
  assert.notEqual(tampered, d.body, "the tamper actually changed the draft");
  const card = W.slopGate(tampered, postfixGateOpts(d));
  assert.equal(card.pass, false);
  assert.ok(card.failures.includes("fact_lock"));
  assert.ok(card.metrics.fact_lock.value.untraced.some((u) => /40/.test(u)), `the invented $40 is named as untraced: ${JSON.stringify(card.metrics.fact_lock.value.untraced)}`);
});

test("the 2026-10-13 wave drafts pass the PER-DRAFT gate (their defect was batch-shaped)", () => {
  let passed = 0;
  for (const d of corpus.wave2026_10_13) if (W.slopGate(d.body, waveGateOpts(d)).pass) passed++;
  assert.equal(passed, 12, `expected 12/12 per-draft passes, got ${passed}`);
});

test("the owner-approved post-fix drafts pass the per-draft gate + fact-lock", () => {
  corpus.approvedPostfix.forEach((d, i) => {
    const card = W.slopGate(d.body, postfixGateOpts(d));
    assert.equal(card.pass, true, `approved draft ${i + 1} (${d.recipient}) must pass; failures: ${card.failures.join(",")} untraced: ${JSON.stringify(card.metrics.fact_lock.value.untraced || [])}`);
  });
});

// ---------- [5] batch enforcer — fail-first ----------
const asBatch = (list, packs) => list.map((d, i) => ({ subject: d.subject, body: d.body, firm: d.firm, recipientName: d.recipient, title: d.title, leadFactKind: "registry", factTexts: packs ? [packs(i)] : [d.fact] }));

test("fail-first: the 2026-10-13 wave FAILS the batch enforcer on the HS classes", () => {
  const v = W.batchGate(asBatch(corpus.wave2026_10_13, (i) => corpus.wave2026_10_13[i].fact));
  assert.equal(v.pass, false);
  for (const k of ["verbatim_sentence_reuse", "subject_frames", "length_spread", "logistics_repetition", "opening_diversity", "structure_fingerprint", "lead_fact_kind_spread"]) {
    assert.ok(v.failures.includes(k), `wave must fail ${k}; failures: ${v.failures.join(",")}`);
  }
  assert.ok(Math.abs(v.metrics.length_spread.value.ratio - 1.18) < 0.02, "length ratio reproduces the HS report's 1.18");
});

test("recorded discrepancy: the APPROVED post-fix batch also fails the enforcer (bridge + logistics at 100%)", () => {
  const v = W.batchGate(asBatch(corpus.approvedPostfix, (i) => corpus.approvedPostfix[i].staging.recipientFact));
  assert.equal(v.pass, false, "owner approval of drafts is not a metric pass — the enforcer must still say so");
  assert.ok(v.failures.includes("logistics_repetition") || v.failures.includes("bridge_clause_monoculture") || v.failures.includes("verbatim_sentence_reuse"), `failures: ${v.failures.join(",")}`);
});

// ---------- [4] rewrite loop ----------
test("rewrite loop: a still-failing draft comes back FLAGGED with its metrics named, never unflagged", () => {
  const slop = "I hope this email finds you well. In today's dynamic landscape, I leverage synergies.";
  const res = W.runGateLoop(() => slop, { factPack: [], maxRewrites: 2 });
  assert.equal(res.pass, false);
  assert.equal(res.flagged, true);
  assert.ok(res.attempts >= 2);
  assert.ok(res.scorecard.failures.length >= 1);
  assert.ok(res.failingMetrics.some((f) => /banned_phrases/.test(f)), "the failing metrics are named on the returned draft");
});

test("rewrite loop: the instruction comes FROM the scorecard and a fixed draft passes", () => {
  const good = "Hi Ana,\n\nSaw the Hartwell note — the carve-out structure is the part I keep rereading. I'm Sam Ortiz, a junior at TEST University and a member of my school's finance club. Would 15 minutes on Thursday morning work to talk about your path?\n\nThanks,\nSam Ortiz";
  let calls = 0;
  const res = W.runGateLoop((instruction) => { calls++; if (calls === 1) return "I hope this email finds you well."; if (calls === 2) assert.match(instruction, /banned_phrases/); return good; }, { factPack: [{ kind: "recipient", text: "the Hartwell carve-out" }, { kind: "sender", text: "member of my school's finance club" }, { kind: "sender", text: "junior at TEST University" }, { kind: "ask", text: "15 minutes" }], recipient: { full_name: "Ana Ruiz (TEST)", current_firm: "Evercore", title: "Analyst" }, senderName: "Sam Ortiz", maxRewrites: 2 });
  assert.equal(res.pass, true);
  assert.equal(res.flagged, false);
});

// ---------- the NEW system: generated wave is batch-clean ----------
const FIRMS = ["Evercore", "Stripe", "Jane Street", "Lazard", "Google", "Blackstone", "McKinsey & Company", "KKR", "Bain & Company", "Goldman Sachs", "Notion", "Figma"];
const EXTRA = ["you spoke on the alumni panel last spring", "your team closed the Hartwell acquisition in March 2026", "you moved over from Morgan Stanley in 2025", "you run the analyst training each summer", "you wrote the fintech memo the partners circulated", "your group covers payments — the Stripe piece in particular", "you started as an intern and converted in 2024", "you mentor the DePaul analysts on your desk", "you presented at the Chicago fintech summit in May 2026", "you lead the sponsors coverage pod", "you hired the first data analyst for the team", "you cover consumer fintech out of the Chicago office"];
const SUBJ = [(f) => "Your move to " + f, (f) => "Question about " + f + " work", (f) => f + " — a quick question", (f) => "Chicago + " + f, (f) => "Asking about the analyst seat at " + f];

function waveItems() {
  return FIRMS.map((f, i) => ({
    firm: f,
    fp: [
      { id: "R" + i, kind: "recipient", text: "you joined " + f + " in Chicago as an analyst in July 2026" },
      { id: "R2" + i, kind: "recipient", text: EXTRA[i] },
      { id: "S" + i, kind: "sender", text: "currently building a reporting dashboard used by " + (180 + i * 7) + " users at a campus systems job" },
      { id: "SC", kind: "sender", text: "sophomore at TEST University" },
      { id: "A", kind: "ask", text: "15 minutes" },
    ],
  }));
}
function waveCompose(it, s) {
  const d = W.composePatternDraft({ recipientName: "Person", senderName: "Alex Testcase (TEST)", senderLine: "a sophomore at TEST University", askTopic: "your path", factPack: it.fp, seedValue: s.seedValue, leadFactKind: s.leadFactKind, lengthTier: s.lengthTier, openingMode: s.openingMode, logisticsIndex: s.logisticsIndex, tailIndex: s.tailIndex, subject: SUBJ[FIRMS.indexOf(it.firm) % SUBJ.length](it.firm) });
  return { ...d, firm: it.firm, recipientName: "Person", title: "Analyst", factTexts: it.fp.map((f) => f.text), _fp: it.fp };
}

test("the pattern system generates a 12-draft wave that is batch-clean AND per-draft clean", () => {
  const wave = W.assembleWave(waveItems(), waveCompose, { seedBase: 1000 });
  assert.equal(wave.pass, true, `batch failures: ${wave.verdict.failures.join(",")}`);
  for (const d of wave.drafts) {
    const card = W.slopGate(d.body, { factPack: d._fp, recipient: { full_name: "Person", current_firm: d.firm, title: "Analyst" }, senderName: "Alex Testcase (TEST)" });
    assert.equal(card.pass, true, `generated draft (${d.firm}) must pass per-draft; failures: ${card.failures.join(",")}`);
    assert.equal(card.metrics.fact_lock.value.untraced.length, 0, "zero untraced facts in generated drafts");
    assert.equal(card.metrics.banned_phrases.value.hard.length + card.metrics.banned_phrases.value.markers.length, 0, "zero banned-phrase hits in generated drafts");
  }
});

// ---------- integration seams (default-off) ----------
test("124 integration: scorecard attaches only when writingPattern is enabled", () => {
  const Outreach = require("../packages/domain/124-career-outreach.js");
  const candidate = { full_name: "Ana Ruiz (TEST)", current_firm: "Evercore", title: "Analyst", work_email: "ana.ruiz@evercore-test.example", facts: [{ text: "covered the Hartwell carve-out at Evercore", source_url: "https://example.test/hartwell" }] };
  const user = { name: "Alex Testcase (TEST)", school: "TEST University", facts: [{ id: "F-T1", text: "Built a DCF model of a carve-out in the finance club", category: "project" }] };
  const off = Outreach.draftAndGate(candidate, user, {});
  assert.ok(off.draft, "baseline draft composes");
  assert.equal(off.draft.writing, undefined, "default off: no scorecard, no behavior change");
  const on = Outreach.draftAndGate(candidate, user, { writingPattern: { enabled: true } });
  assert.ok(on.draft.writing, "enabled: scorecard attached");
  assert.equal(on.draft.writing.gate0.allowed, true);
  assert.ok(on.draft.writing.scorecard.metrics.fact_lock, "scorecard carries the fact-lock metric");
});

test("123 integration: cover letter scorecard attaches when enabled; MATS context degrades to outline-only", () => {
  const Profile = require("../packages/domain/122-career-profile.js");
  const Tailor = require("../packages/domain/123-career-tailor.js");
  const fixtureDir = path.join(__dirname, "..", "packages", "career-data", "fixtures");
  const p = Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(fixtureDir, "test-persona.json"), "utf8")));
  const JD = "Software Engineer, New Grad (TEST posting)\nRequired: Python, JavaScript, React, SQL, PostgreSQL, Git.\nYou will build APIs and deploy services.";
  const CIR = { company: "TEST Systems Inc", facts: [{ text: "TEST Systems Inc launched a self-serve analytics product for small retailers in March 2026 (TEST fact)." }] };
  const off = Tailor.generateCoverLetter(p, JD, CIR, { role: "new-grad software engineer" });
  assert.equal(off.ok, true);
  assert.equal(off.writing, undefined, "default off");
  const on = Tailor.generateCoverLetter(p, JD, CIR, { role: "new-grad software engineer", writingPattern: { enabled: true } });
  assert.equal(on.ok, true);
  assert.ok(on.writing && on.writing.scorecard, "enabled: scorecard attached");
  const mats = Tailor.generateCoverLetter(p, JD, CIR, { role: "new-grad software engineer", writingPattern: { enabled: true, kind: "personal_statement", program: "MATS" } });
  assert.equal(mats.ok, false);
  assert.equal(mats.mode, "outline", "G0 refusal degrades to outline-only — no drafted statement text");
  assert.equal(mats.text, null);
});
