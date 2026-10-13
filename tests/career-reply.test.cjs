/* Career reply composer tests. Fixtures are synthetic except SC222_EXCERPT,
   a representative excerpt of the real SC-222 agent bubble (the 79-sentence
   worst offender from the overnight career build transcripts). */
const test = require("node:test");
const assert = require("node:assert/strict");
const Reply = require("../packages/domain/140-career-reply.js");

const UUID = "3f9a2c1e-7b4d-4e5f-9a8b-1c2d3e4f5a6b";

// Excerpted from SC-222-ib-recruiting-ladder.messages.json (agent seq 4 + 7):
// bottom-line wall of text, sourced bullet lines, and a CIR mention.
const SC222_EXCERPT = `Bottom line: for Goldman Sachs — Investment Banking (Global Banking & Markets) (Investment banking (Global Banking & Markets) — Summer Analyst route, entry-level: penultimate / final-year students via the Summer Analyst programme), your odds through the cold application alone are low, but not zero. This read rests on a curated-qualitative record as of 2026-10-12 with no population sample — treat every pattern below as reported, not measured. The published screen is structural: you must be pursuing a Bachelor's or Master's degree and be in your penultimate or final year, with applications reviewed on a rolling basis. The firm publishes no GPA cutoff on the programme pages checked for this record — the GPA screens students talk about are community-reported norms, not firm policy, and this record states them only that way.

Who gets in (sample N=not available — curated-qualitative record, as of 2026-10-12):
- Target schools (a concentrated set of universities) — reported pattern, not a measured share: Press and community reporting consistently describes banking recruiting as concentrated at a set of target schools; the firm publishes no school distribution, so no share is stated here. (source: https://www.linkedin.com/news/story/wall-street-entry-level-job-race-starts-earlier-than-ever-7609228/, as of 2026-10-12)
- Non-target schools — reported pattern, not a measured share: Non-target students do get in every cycle, reported to arrive via the internship ladder plus heavy networking rather than the cold application alone; reported pattern, not a measured share. (source: https://www.wallstreetoasis.com/forum/investment-banking/how-to-obtain-a-sophomore-summer-boutique-ib-internship, as of 2026-10-12)
- Goldman Sachs publishes no GPA cutoff on the programme pages checked for its CIR — GPA screens students quote are community-reported norms, not firm policy. (source: https://www.goldmansachs.com/careers/students/programs-and-internships/emea/summer-analyst-programme, as of 2026-10-12)
- Technicals are tested directly: accounting, the three statements, DCF, comps and LBO basics. (source: https://www.finbound.org/blog/goldman-sachs-application-process-guide, as of 2026-10-12)`;

function assertAllClean(bubbles) {
  assert.ok(Array.isArray(bubbles) && bubbles.length >= 1, "never returns []");
  for (const b of bubbles) {
    const l = Reply.lint(b);
    assert.ok(l.ok, `bubble must pass lint: ${JSON.stringify(b)} -> ${l.violations.join("; ")}`);
  }
}

test("API surface: exact names exported", () => {
  assert.equal(Reply.MAX_SENTENCES_PER_BUBBLE, 3);
  for (const fn of ["composeText", "composeResult", "fallback", "lint", "splitBubbles"]) {
    assert.equal(typeof Reply[fn], "function", fn);
  }
});

test("splitBubbles: abbreviations and decimals do not split sentences", () => {
  const bubbles = Reply.splitBubbles("U.S. roles pay $120.5k. Apply now.");
  assert.equal(bubbles.length, 1);
  assert.match(bubbles[0], /U\.S\. roles pay \$120\.5k\./);
  assert.match(bubbles[0], /Apply now\./);
  // Same text plus more sentences proves the count was exactly 2:
  // 2 + 2 more sentences pack as 3 + 1. (If "U.S." split, packing differs.)
  const packed = Reply.splitBubbles("U.S. roles pay $120.5k. Apply now. Bring your resume. Good luck.");
  assert.equal(packed.length, 2);
  assert.ok(packed[0].endsWith("Bring your resume."), packed[0]);
  assert.equal(packed[1], "Good luck.");
});

test("splitBubbles: groups at most 3 sentences per bubble", () => {
  assert.deepEqual(
    Reply.splitBubbles("One. Two. Three. Four. Five. Six. Seven."),
    ["One. Two. Three.", "Four. Five. Six.", "Seven."]
  );
  assert.deepEqual(Reply.splitBubbles(""), []);
  assert.deepEqual(Reply.splitBubbles("No terminator here"), ["No terminator here"]);
});

test("lint: flags every machine-leak class", () => {
  const bad = [
    "",
    "   ",
    "One. Two. Three. Four.",
    "Here is ```code``` for you.",
    'Data {"a":1} here.',
    `Your id is ${UUID} today.`,
    "Fact F-012 supports this claim.",
    "See the fact_ids for proof.",
    "Ran 123.diffResume (your file) just now.",
    "[tool call] happened silently.",
    "The router_core decided this.",
    "The edge function ran it.",
    "Rail state is saved now.",
    "Check the CIR for details.",
    "| Role | Pay |",
  ];
  for (const b of bad) assert.equal(Reply.lint(b).ok, false, JSON.stringify(b));
  assert.ok(Reply.lint("A plain sentence about jobs.").ok);
  assert.ok(Reply.lint("My take: apply to the New York role first. It closes Friday.").ok);
});

test("composeText: pure JSON dump becomes the empty fallback", () => {
  const dump = JSON.stringify({ ok: true, module: "123.diffResume", factIds: ["F-012"], id: UUID, nested: { a: [1, 2, 3] } });
  assert.deepEqual(Reply.composeText(dump), [Reply.fallback("empty")]);
});

test("composeText: JSON embedded in prose is stripped, prose survives", () => {
  const bubbles = Reply.composeText('Here is the result {"status":"done","factIds":["F-012"]} for the role. The deadline is Friday.');
  assertAllClean(bubbles);
  const joined = bubbles.join(" ");
  assert.match(joined, /deadline is Friday/);
  assert.ok(!joined.includes("F-012") && !joined.includes("{"));
});

test("composeText: code fences and markdown tables never reach a bubble", () => {
  const raw = [
    "Your tailored resume is ready.",
    "```json",
    '{"bullets": ["F-012"]}',
    "```",
    "| Role | Pay |",
    "| --- | --- |",
    "| Analyst | $100k |",
    "Open the doc to review it.",
  ].join("\n");
  const bubbles = Reply.composeText(raw);
  assertAllClean(bubbles);
  const joined = bubbles.join(" ");
  assert.match(joined, /tailored resume is ready/);
  assert.ok(!joined.includes("|") && !joined.includes("Analyst"));
});

test("composeText: IDs, UUIDs and tool markers are stripped", () => {
  const bubbles = Reply.composeText(`I ran 123.diffResume (your file) and saved it as ${UUID} under fact F-012. Your resume is updated.`);
  assertAllClean(bubbles);
  const joined = bubbles.join(" ");
  assert.ok(!joined.includes(UUID) && !joined.includes("F-012") && !/123\./.test(joined));
  assert.match(joined, /resume is updated/);
});

test("composeText: SC-222 worst bubble replays clean and short", () => {
  const bubbles = Reply.composeText(SC222_EXCERPT);
  assert.ok(bubbles.length > 1, "wall of text becomes several bubbles");
  assertAllClean(bubbles); // lint enforces <=3 sentences and no leaks
  const joined = bubbles.join(" ");
  assert.ok(!joined.includes("http"), "no source links in bubbles");
  assert.ok(!/\bCIR\b/.test(joined), "no internal record name in bubbles");
  assert.ok(!joined.includes("(source:"), "no citations in bubbles");
  assert.match(joined, /odds through the cold application alone are low/);
});

test("composeText: empty, null and garbage inputs fall back, never []", () => {
  for (const bad of [null, undefined, "", "   ", "{{{", "42", "```\n{}\n```"]) {
    const bubbles = Reply.composeText(bad);
    assert.deepEqual(bubbles, [Reply.fallback("empty")], JSON.stringify(bad));
    assertAllClean(bubbles);
  }
});

test("composeText: long clean prose is chunked to <=3 sentences per bubble", () => {
  const bubbles = Reply.composeText("One fact here. Two facts here. Three facts here. Four facts here. Five facts here. Six facts here. Seven facts here.");
  assert.equal(bubbles.length, 3);
  assertAllClean(bubbles);
});

test("composeResult: recommendation leads, facts compressed, long body goes to doc, next step closes", () => {
  const longBody = "The programme recruits penultimate year students. Applications are reviewed on a rolling basis. The screen weighs school signal and technical readiness. Interviews test accounting and valuation directly. (source: https://example.com/guide, as of 2026-10-12)";
  const { bubbles, doc } = Reply.composeResult({
    headline: "Found 3 roles that fit your profile.",
    recommendation: "Apply to the Goldman Sachs summer analyst role first because the deadline is closest.",
    facts: [
      "The role is based in New York.",
      "It asks for Excel and financial modeling.",
      "Applications are reviewed on a rolling basis.",
      "The programme is for penultimate year students.",
    ],
    longBody,
    docTitle: "Goldman Sachs role details",
    nextStep: "Say 'tailor my resume' and I will draft it.",
  });
  assertAllClean(bubbles);
  assert.match(bubbles[0], /My take:/, "recommendation leads bubble 1");
  assert.ok(doc, "long body becomes a doc");
  assert.equal(doc.title, "Goldman Sachs role details");
  assert.equal(doc.body, longBody, "sources live in the doc body");
  assert.ok(bubbles.some((b) => b.includes("Full details in the doc: Goldman Sachs role details.")), "pointer bubble present");
  for (const b of bubbles) assert.ok(!b.includes("source:") && !b.includes("http"), "no citations in bubbles");
  assert.match(bubbles[bubbles.length - 1], /tailor my resume/, "next step closes the reply");
  // headline + recommendation = bubble 1; 4 facts compress to at most 2 bubbles.
  assert.ok(bubbles.length <= 1 + 2 + 1 + 1, `facts compressed (got ${bubbles.length} bubbles)`);
});

test("composeResult: minimal and empty results stay clean", () => {
  const minimal = Reply.composeResult({ headline: "Two new roles match your profile." });
  assert.equal(minimal.doc, null);
  assertAllClean(minimal.bubbles);
  assert.match(minimal.bubbles[0], /Two new roles/);

  const empty = Reply.composeResult({});
  assert.equal(empty.doc, null);
  assert.deepEqual(empty.bubbles, [Reply.fallback("empty")]);

  const shortBody = Reply.composeResult({ headline: "Done.", longBody: "One extra detail. And one more." });
  assert.equal(shortBody.doc, null, "short body stays in bubbles, no doc");
  assertAllClean(shortBody.bubbles);
});

test("fallback: every kind is plain, short and lint-clean", () => {
  for (const kind of ["error", "empty", "unmatched", "timeout"]) {
    const f = Reply.fallback(kind);
    assert.ok(Reply.lint(f).ok, `${kind}: ${f} -> ${Reply.lint(f).violations.join("; ")}`);
    assert.equal(Reply.splitBubbles(f).length, 1, `${kind} is a single bubble`);
  }
  assert.equal(
    Reply.fallback("unmatched"),
    "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there."
  );
  assert.ok(Reply.lint(Reply.fallback("nonsense-kind")).ok, "unknown kind degrades to a clean fallback");
});
