// Career writing pattern (module 154-career-writing.js; MI-097 / BUG-236 /
// FR-394). One test per sub-capability, tagged so evals/depth/run.cjs can
// prove its planted defect makes exactly this test fail. Graded on END
// STATES — the gate0 verdict object, the voice profile store, the slop
// scorecard metrics, the batch verdict — never on reply prose alone.
// The pre-existing suite is tests/career-writing-pattern.test.cjs.
// Check: node --test tests/depth-CAREER-WRITING.test.cjs && node evals/depth/run.cjs CAREER-WRITING
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const W = require(path.join(dir, "154-career-writing.js"));

const SAMPLES = [
  "I keep my emails short. Really short. The point lands faster that way, and nobody has time for a wall of text about my sophomore summer in the first place.",
  "Quick one. I saw your note on the panel — the part about hiring analysts who can actually write stuck with me because my club makes us defend every pick in writing. Could we talk Thursday? Fifteen minutes is plenty.",
  "No warm-up here. I built the thing, it broke twice, and the second break taught me more than the launch did. That is the honest version and I would rather send that than a polished one.",
];
const FACTS = [{ text: "Ana Ruiz covered the Hartwell carve-out at Evercore in March 2026 and a 15 minute call works" }];

test("[S01] G0: the MATS registry entry is owner-write-only and drafting is refused with assistance offered", () => {
  const g = W.gate0({ kind: "personal_statement", program: "MATS" });
  assert.equal(g.allowed, false);
  assert.equal(g.policy, "OWNER_WRITE_ONLY");
  assert.equal(g.entry, "MATS");
  assert.equal(g.assistance.length, 3);
});

test("[S02] G0: an explicit ban recorded on the context itself wins over an ordinarily-allowed kind", () => {
  const g = W.gate0({ kind: "outreach_email", aiPolicy: "ban" });
  assert.equal(g.allowed, false);
  assert.equal(g.policy, "OWNER_WRITE_ONLY");
  assert.equal(g.entry, "context");
});

test("[S03] G0: an unchecked statement kind defaults UNKNOWN, and UNKNOWN is owner-write-only", () => {
  const g = W.gate0({ kind: "personal_statement", program: "Some Unchecked Fellowship" });
  assert.equal(g.allowed, false);
  assert.equal(g.policy, "UNKNOWN");
});

test("[S04] G0: a disclose-policy context is allowed and carries disclosureRequired on the verdict", () => {
  const g = W.gate0({ kind: "cover_letter", context: { aiPolicy: "disclose" } });
  assert.equal(g.allowed, true);
  assert.equal(g.policy, "AI_ASSIST_WITH_DISCLOSURE");
  assert.equal(g.disclosureRequired, true);
  const ok = W.gate0({ kind: "outreach_email" });
  assert.equal(ok.allowed, true);
  assert.equal(ok.disclosureRequired, false);
});

test("[S05] voice: cold start is honestly no profile — null profile, null prompt, the no-profile text", () => {
  assert.equal(W.extractVoiceProfile([]), null);
  assert.equal(W.extractVoiceProfile(["Too short."]), null);
  assert.equal(W.renderPromptV2(null, null), null);
  assert.match(W.voiceTargetsText(null), /No voice profile exists/);
});

test("[S06] voice: fewer than 3 sentences is too thin to be a profile, however long the sample", () => {
  assert.equal(W.extractVoiceProfile(["I wrote this sample last spring for a class project I cared about. It stays fairly short."]), null);
});

test("[S07] voice: the profile's sentence-length statistics are measured from the samples (short share present)", () => {
  const p = W.extractVoiceProfile(SAMPLES);
  assert.ok(p, "profile builds");
  assert.ok(p.sentenceLength.shortShare > 0, `short sentences measured (got ${p.sentenceLength.shortShare})`);
  assert.ok(p.sentenceLength.cv > 0.3, `bursty CV measured (got ${p.sentenceLength.cv})`);
  assert.ok(p.basis.sentences >= 10);
  assert.ok(p.basis.words >= 100);
});

test("[S08] voice: samples spanning two audiences produce per-audience sub-profiles", () => {
  const p = W.extractVoiceProfile([
    { text: "I write to bankers plainly and I keep the numbers first in every note I send them. The model comes second. The ask comes last, always.", audience: "bankers" },
    { text: "With students I joke more and I ask questions first before I explain anything at all. Short notes work better. Nobody reads a wall of text from a peer.", audience: "students" },
  ]);
  assert.ok(p, "profile builds");
  assert.ok(p.byAudience, "sub-profiles exist");
  assert.deepEqual(Object.keys(p.byAudience).sort(), ["bankers", "students"]);
});

test("[S09] seed: an assigned opening mode is honored, and an assigned lead fact kind is carried", () => {
  const stub = { openers: { first_person: 1 }, sentenceLength: { mean: 14, sd: 5, p10: 6, p90: 26 }, paragraphs: { sentencesPerParagraph: 2 } };
  const s = W.sampleStructuralSeed(stub, { seed: 7, openingMode: "question", leadFactKinds: ["registry"] });
  assert.equal(s.openingMode, "question");
  assert.equal(s.leadFactKind, "registry");
  assert.ok(s.lengthBand.max > s.lengthBand.min);
});

test("[S10] prompt v2: the rendered prompt carries the profile's own voice targets and the seed's structure", () => {
  const p = W.extractVoiceProfile(SAMPLES);
  const rendered = W.renderPromptV2(p, W.sampleStructuralSeed(p, { seed: 5 }));
  assert.match(rendered, /Your sentences average/);
  assert.match(rendered, /Opening mode: /);
  assert.match(rendered, /Length band: /);
  assert.ok(!rendered.includes("{{voice_numbers}}"), "no unfilled block remains");
});

test("[S11] fact-lock tracing: every number, date and entity in a faithful draft traces to the fact pack", () => {
  const t = W.traceFacts("Ana Ruiz covered the Hartwell carve-out at Evercore in March 2026. Would 15 minutes work?", FACTS, { senderName: "Sam Ortiz" });
  assert.equal(t.pass, true, `untraced: ${JSON.stringify(t.untraced)}`);
  assert.equal(t.traced, t.total);
  assert.ok(t.total >= 3, `checkables found (got ${t.total})`);
});

test("[S12] fact-lock: an invented dollar figure hard-fails the slop gate and is named as untraced", () => {
  const text = "Ana Ruiz covered the Hartwell carve-out at Evercore in March 2026. The deal was a $40 million carve-out that closed fast and drew attention from the whole coverage team last spring. Would 15 minutes work to talk about your path?";
  const card = W.slopGate(text, { factPack: FACTS, recipient: { full_name: "Ana Ruiz", current_firm: "Evercore", title: "Analyst" }, senderName: "Sam Ortiz" });
  assert.equal(card.pass, false);
  assert.ok(card.failures.includes("fact_lock"), `failures: ${card.failures.join(",")}`);
  assert.ok(card.metrics.fact_lock.value.untraced.some((u) => /40/.test(u)), `untraced names the invented figure: ${JSON.stringify(card.metrics.fact_lock.value.untraced)}`);
});

test("[S13] slop gate: the substance floor records a near-empty text as below the draft minimum", () => {
  const card = W.slopGate("Short note only.", {});
  assert.equal(card.metrics.substance.value.words, 3);
  assert.equal(card.metrics.substance.pass, false);
});

test("[S14] slop gate: a hard-banned opener phrase fails the banned-phrases metric by name", () => {
  const text = "Hi Ana,\n\nI hope this email finds you well. I am writing about the analyst role on your team and the work your group did on the Hartwell carve-out last spring, because it is the kind of deal I want to learn from directly.\n\nThanks,\nSam";
  const card = W.slopGate(text, { factPack: FACTS, recipient: { full_name: "Ana Ruiz", current_firm: "Evercore", title: "Analyst" }, senderName: "Sam" });
  assert.ok(card.metrics.banned_phrases.value.hard.includes("i hope this email finds you well"), `hard hits: ${JSON.stringify(card.metrics.banned_phrases.value.hard)}`);
  assert.equal(card.metrics.banned_phrases.pass, false);
  assert.ok(card.failures.includes("banned_phrases"));
});

test("[S15] slop gate: two marker words together fail the banned-phrases metric (one alone only warns)", () => {
  const text = "We delve into the work itself and the tapestry of the team comes through in how the analysts share credit on every single deal they close together each season.";
  const card = W.slopGate(text, {});
  assert.deepEqual(card.metrics.banned_phrases.value.markers, ["delve", "tapestry"]);
  assert.equal(card.metrics.banned_phrases.pass, false);
});

test("[S16] slop gate: five-plus sentences of near-identical length fail the sentence-variance metric", () => {
  const text = [
    "The team reviewed the model and discussed the next steps carefully today.",
    "Our group checked the figures and updated the shared file before noon.",
    "She walked through the results and answered every question from the room.",
    "They compared two versions and noted where the totals had changed slightly.",
    "He summarized the meeting and sent the notes to everyone by email.",
    "We revisited the timeline and confirmed the dates with the whole team.",
  ].join(" ");
  const card = W.slopGate(text, {});
  assert.ok(card.metrics.sentence_variance.value.maxUniformRun >= 5, `run: ${card.metrics.sentence_variance.value.maxUniformRun}`);
  assert.equal(card.metrics.sentence_variance.pass, false);
});

test("[S17] slop gate: the CV bar is profile-relative — a flat draft fails against a bursty profile even with no uniform run", () => {
  const text = [
    "The team reviewed the model and discussed next steps today.",
    "Our group checked the figures and updated the shared file before noon sharp today.",
    "She walked through the results and answered questions from everyone.",
    "They compared the two versions and noted where the totals had changed slightly today.",
    "He summarized the meeting and sent the notes to everyone.",
  ].join(" ");
  const card = W.slopGate(text, { profile: { sentenceLength: { cv: 1.0 } } });
  assert.equal(card.metrics.sentence_variance.value.profileCv, 1.0);
  assert.ok(card.metrics.sentence_variance.value.cv < 0.6, `draft CV: ${card.metrics.sentence_variance.value.cv}`);
  assert.equal(card.metrics.sentence_variance.value.maxUniformRun, 1);
  assert.equal(card.metrics.sentence_variance.pass, false);
});

test("[S18] slop gate: two tricolon sentences fail the tells metric, named as tricolons", () => {
  const text = "The desk covers banks, funds, and insurers across the region this year. The work involves models, memos, and meetings with the coverage team weekly. I follow both from campus.";
  const card = W.slopGate(text, {});
  assert.equal(card.metrics.tells.pass, false);
  assert.match(card.metrics.tells.detail, /tricolons/);
});

test("[S19] slop gate: a long paragraph with no fact anchor fails the fact-anchor-density metric", () => {
  const text = "The quick brown fox jumps over the lazy dog near the river bank while the wind moves through the tall grass beyond the fence line today.";
  const card = W.slopGate(text, { factPack: [] });
  assert.equal(card.metrics.fact_anchor_density.pass, false);
  assert.deepEqual(card.metrics.fact_anchor_density.value.unanchored, [1]);
});

test("[S20] gate loop: a draft still failing after the rewrite budget returns flagged, with its metrics named", () => {
  const slop = "I hope this email finds you well. In today's fast-paced world, we leverage synergies and delve deep.";
  const res = W.runGateLoop(() => slop, { factPack: [], maxRewrites: 2 });
  assert.equal(res.pass, false);
  assert.equal(res.flagged, true);
  assert.equal(res.attempts, 3);
  assert.ok(res.failingMetrics.some((f) => /banned_phrases/.test(f)), `failing metrics named: ${JSON.stringify(res.failingMetrics)}`);
});

test("[S21] gate loop: the rewrite instruction is built from the scorecard, and a fixed draft then passes", () => {
  const good = "Hi Ana,\n\nSaw the Hartwell note — the carve-out structure is the part I keep rereading. I'm Sam Ortiz, a junior at TEST University and a member of my school's finance club. Would fifteen minutes on Thursday morning work to talk about your path?\n\nThanks,\nSam Ortiz";
  let calls = 0, seen = null;
  const res = W.runGateLoop((instruction) => {
    calls++;
    if (calls === 1) return "I hope this email finds you well.";
    seen = instruction;
    return good;
  }, { factPack: [{ kind: "recipient", text: "the Hartwell carve-out" }, { kind: "sender", text: "member of my school's finance club" }, { kind: "sender", text: "junior at TEST University" }, { kind: "ask", text: "fifteen minutes" }], recipient: { full_name: "Ana Ruiz", current_firm: "Evercore", title: "Analyst" }, senderName: "Sam Ortiz", maxRewrites: 2 });
  assert.equal(res.pass, true);
  assert.equal(res.attempts, 2);
  assert.match(seen || "", /Rewrite the draft/);
  assert.match(seen || "", /banned_phrases/);
});

test("[S22] batch gate HS-1: one sentence reused in every draft fails verbatim sentence reuse, counted", () => {
  const shared = "I am writing from TEST University about the analyst program this spring.";
  const uniques = ["Your Hartwell work stood out to me.", "The sponsors piece caught my eye yesterday.", "I follow your consumer coverage closely.", "Chicago recruiting is my main focus now."];
  const firms = ["Evercore", "Lazard", "Stripe", "Notion"];
  const drafts = firms.map((f, i) => ({ subject: `Question about ${f} work ${i}`, body: `Hi Sam,\n\n${shared} ${uniques[i]}\n\nThanks,\nSam`, firm: f, recipientName: "Sam", title: "Analyst", leadFactKind: "registry" }));
  const v = W.batchGate(drafts, {});
  assert.equal(v.metrics.verbatim_sentence_reuse.pass, false);
  assert.equal(v.metrics.verbatim_sentence_reuse.value[0].drafts, 4);
  assert.ok(v.failures.includes("verbatim_sentence_reuse"));
});

test("[S23] batch gate HS-3: an identical subject to two people at the same firm is flagged as a duplicate", () => {
  const drafts = [
    { subject: "Question about Evercore work", body: "Hi Ana,\n\nYour Hartwell work stood out to me for its structure.\n\nThanks,\nSam", firm: "Evercore", recipientName: "Ana Ruiz", title: "Analyst" },
    { subject: "Question about Evercore work", body: "Hi Ben,\n\nThe sponsors piece caught my eye yesterday in class.\n\nThanks,\nSam", firm: "Evercore", recipientName: "Ben Cole", title: "Analyst" },
  ];
  const v = W.batchGate(drafts, {});
  assert.equal(v.metrics.subject_frames.value.duplicateSubjectSameFirm, true);
  assert.equal(v.metrics.subject_frames.pass, false);
});

test("[S24] batch gate HS-4: eight drafts of identical length fail the length-spread metric at ratio 1", () => {
  const drafts = Array.from({ length: 8 }, (_, i) => {
    const words = Array.from({ length: 16 }, (_, k) => `w${i}x${k}`).join(" ");
    return { subject: `Subject ${i}`, body: `Hi Sam,\n\n${words}.\n\nThanks,\nSam`, firm: `Firm${i}`, recipientName: "Sam", title: "Analyst" };
  });
  const v = W.batchGate(drafts, {});
  assert.equal(v.metrics.length_spread.value.ratio, 1);
  assert.equal(v.metrics.length_spread.pass, false);
  assert.ok(v.failures.includes("length_spread"));
});

test("[S25] batch gate HS-6: the same weekday logistics string in every draft fails logistics repetition at share 1", () => {
  const uniques = ["Your Hartwell work stood out to me.", "The sponsors piece caught my eye yesterday.", "I follow your consumer coverage closely.", "Chicago recruiting is my main focus now."];
  const firms = ["Evercore", "Lazard", "Stripe", "Notion"];
  const drafts = firms.map((f, i) => ({ subject: `Question about ${f} work ${i}`, body: `Hi Sam,\n\n${uniques[i]} Would 15 minutes on Tuesday morning work?\n\nThanks,\nSam`, firm: f, recipientName: "Sam", title: "Analyst", leadFactKind: "registry" }));
  const v = W.batchGate(drafts, {});
  assert.equal(v.metrics.logistics_repetition.value.share, 1);
  assert.equal(v.metrics.logistics_repetition.pass, false);
});

test("[S26] edit capture: a user edit folds into the profile store — edits counted, version bumped, no prose retained", () => {
  const samples = [
    "I write plainly and I keep sentences in the middle range most days because that is how I talk when I am explaining a position to someone across the table from me.",
    "My second sample also runs in the middle range with a steady rhythm and a similar length to the first one so the starting profile is fairly even overall today.",
    "And a third sample keeps that same even pace going with nothing especially short or long inside it at all for now in this particular test fixture sample set.",
  ];
  const before = W.extractVoiceProfile(samples);
  const edited = "Short. Very short. I cut it down to almost nothing at all, because the long version said the same thing three separate times in a row without adding a single new fact to any of it.";
  const after = W.captureEdits(before, samples[0], edited);
  assert.equal(after.basis.edits, 1);
  assert.equal(after.version, before.version + 1);
  assert.equal(after.acc.sentenceCount, before.acc.sentenceCount + 3);
  assert.equal(JSON.stringify(after).includes("cut it down"), false, "statistics only — the edit's prose is not retained");
});

test("[S27] reference generator: a composed draft carries the recipient fact and the logistics ask, under its assigned seed", () => {
  const d = W.composePatternDraft({
    recipientName: "Ana Ruiz", senderName: "Sam Ortiz", senderLine: "a junior at TEST University", askTopic: "your path", subject: "Hello",
    factPack: [
      { kind: "recipient", text: "you covered the Hartwell carve-out at Evercore" },
      { kind: "sender", text: "sophomore at TEST University studying finance and building models" },
      { kind: "ask", text: "15 minutes" },
    ],
    seedValue: 42, leadFactKind: "registry",
  });
  assert.match(d.body, /Hartwell/);
  assert.match(d.body, /minutes/);
  assert.equal(d.subject, "Hello");
  assert.equal(d.leadFactKind, "registry");
  assert.equal(d.seed.leadFactKind, "registry");
});

test("[S28] opener classification: question, greeting, time, first-person and conditional openers classify distinctly", () => {
  assert.equal(W.openerClass("Can I ask about your path?"), "question");
  assert.equal(W.openerClass("Hi Ana"), "greeting");
  assert.equal(W.openerClass("Last spring I built a model of the deal."), "time");
  assert.equal(W.openerClass("I built the model last spring."), "first_person");
  assert.equal(W.openerClass("If the timing works, I would love to talk."), "conditional");
});
