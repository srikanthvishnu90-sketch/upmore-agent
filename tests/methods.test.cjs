// The owner's method docs (docs/methods): every card parsed with every field its format promises, ids stable, and the
// standing rules gating what they must (scripts/build-methods.cjs).
const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { build } = require("../scripts/build-methods.cjs");

const ROOT = path.join(__dirname, "..");
const { cards, problems } = build();
const byId = id => cards.find(c => c.id === id);
const bySection = s => cards.filter(c => c.section === s);

test("every card is parsed: 88 + 74 + 32, one per ### heading, no format problem", () => {
  assert.deepStrictEqual(problems, []);
  assert.deepStrictEqual([1, 2, 3].map(n => cards.filter(c => c.doc === n).length), [88, 74, 32]);
  for (const d of ["methods-1-bonuses-bets-creative.md", "methods-2-owed-idle-cash-investing-side-income.md", "methods-3-saving-money.md"]) {
    const headings = (fs.readFileSync(path.join(ROOT, "docs/methods", d), "utf8").match(/^### /gm) || []).length;
    assert.strictEqual(cards.filter(c => c.doc === Number(d[8])).length, headings, d);
  }
});

test("every card carries its terms, three steps, a tag and a source link; ids are unique and stable", () => {
  assert.strictEqual(new Set(cards.map(c => c.id)).size, cards.length);
  for (const c of cards) {
    for (const k of ["what", "example", "value", "effort", "odds", "how_often", "needs"]) assert.ok(c[k], `${c.id} ${k}`);
    assert.strictEqual(c.steps.length, 3, c.id);
    assert.ok(c.tags.length, c.id);
    assert.match(c.source.url, /^https?:\/\//, c.id);
  }
  assert.strictEqual(byId("M1-BANK-01").title, "IRA and 401(k) transfer match");
  assert.strictEqual(byId("M3-SUBS-01").title, "Cancel subscriptions you no longer use");
  assert.strictEqual(byId("M3-SUBS-01").value_kind, "saving");
});

test("decision 2 and the gambling guard: every prediction-market and sportsbook or casino card is hard-gated", () => {
  assert.strictEqual(bySection("Prediction markets").length, 14);
  assert.strictEqual(bySection("Sportsbook and casino promos").length, 15);
  for (const c of bySection("Prediction markets")) assert.ok(c.hard_gated && c.gates.includes("decision_2"), c.id);
  for (const c of bySection("Sportsbook and casino promos")) assert.ok(c.hard_gated && c.gates.includes("gambling"), c.id);
  for (const c of cards.filter(c => !c.hard_gated)) assert.doesNotMatch(`${c.title} ${c.what}`, /kalshi|polymarket|sportsbook|casino|crypto|usdc/i, c.id);
});

test("every [Flag] card is hard-gated; crypto, options and copying funds are gated", () => {
  for (const c of cards.filter(c => c.tags.includes("Flag"))) assert.ok(c.hard_gated, c.id);
  const usdc = cards.find(c => /USDC|stablecoin/i.test(c.title));
  assert.ok(usdc.gates.includes("decision_3"));
  for (const c of cards.filter(c => /covered calls|cash-secured puts|13F|congressional/i.test(c.title))) assert.ok(c.gates.includes("securities_advice"), c.id);
});

test("the ungated cards Upmore can build tonight stay ungated", () => {
  for (const id of ["M2-OWED-03", "M2-OWED-09", "M2-OWED-11", "M2-UNCLAIMED-03", "M3-SUBS-05", "M3-SUBS-10", "M3-SHOP-01", "M3-SHOP-07"]) {
    assert.ok(!byId(id).hard_gated, `${id} ${byId(id).title}`);
  }
});

test("a [Rule] that moves money carries the per-run yes; store names are not money moves", () => {
  assert.ok(cards.find(c => /Sweep extra checking/.test(c.title)).gates.includes("per_run_yes"));
  assert.ok(!cards.find(c => /Best Buy return-window/.test(c.title)).gates.includes("per_run_yes"));
});

test("methods.json and README.md are current", () => {
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build-methods.cjs"), "--check"], { stdio: "pipe" });
});

// ---------------------------------------------------------------- what Upmore has today (docs/methods/map.cjs)
const { validateMap, TODAY } = require("../scripts/build-methods.cjs");
const { MAP } = require("../docs/methods/map.cjs");
const { mapProblems } = build();
const clone = () => JSON.parse(JSON.stringify(MAP));
const today = id => byId(id).upmore.today;
const countBy = list => Object.fromEntries(TODAY.map(s => [s, list.filter(c => c.upmore.today === s).length]));

test("the map places every card and has no problem", () => {
  assert.deepStrictEqual(mapProblems, []);
  assert.deepStrictEqual(Object.keys(MAP).sort(), cards.map(c => c.id).sort());
  for (const c of cards) assert.ok(TODAY.includes(c.upmore.today), c.id);
});

test("counts per status, overall and per method doc (pinned: a placement change is a reviewed change)", () => {
  assert.deepStrictEqual(countBy(cards), { IN_CHAT: 27, MODULE_ONLY: 2, GATED: 130, NOT_BUILT: 35 });
  assert.deepStrictEqual([1, 2, 3].map(n => countBy(cards.filter(c => c.doc === n))), [
    { IN_CHAT: 5, MODULE_ONLY: 0, GATED: 62, NOT_BUILT: 21 },
    { IN_CHAT: 9, MODULE_ONLY: 0, GATED: 57, NOT_BUILT: 8 },
    { IN_CHAT: 13, MODULE_ONLY: 2, GATED: 11, NOT_BUILT: 6 },
  ]);
  // Nothing is covered in full: every built card names its missing half.
  for (const c of cards.filter(c => ["IN_CHAT", "MODULE_ONLY"].includes(c.upmore.today))) {
    assert.strictEqual(c.upmore.coverage, "part", c.id);
    assert.match(c.upmore.note, /not built|Missing:|never found|nothing reads/, c.id);
  }
});

test("a hard-gated card is GATED whatever is built, never IN_CHAT; GATED is only ever a hard gate", () => {
  for (const c of cards) assert.strictEqual(c.upmore.today === "GATED", c.hard_gated, `${c.id} ${c.upmore.today}`);
  for (const id of ["M1-CARD-01", "M1-CARD-04", "M1-PRED-01", "M1-BET-01", "M2-CASH-12", "M2-INVEST-13"]) assert.strictEqual(today(id), "GATED", id);
  for (const s of ["Prediction markets", "Sportsbook and casino promos", "Investing plays", "Health costs"]) for (const c of bySection(s)) assert.strictEqual(c.upmore.today, "GATED", c.id);
});

test("every IN_CHAT entry's evidence resolves: the answer file exists, each test name is in its file, a test imports the answer", () => {
  const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
  const inChat = cards.filter(c => c.upmore.today === "IN_CHAT");
  assert.ok(inChat.length > 0);
  for (const c of inChat) {
    assert.ok(c.upmore.answer.length, c.id);
    for (const a of c.upmore.answer) assert.ok(a.startsWith("supabase/functions/") && fs.existsSync(path.join(ROOT, a)), `${c.id} ${a}`);
    assert.ok(c.upmore.evidence.length, c.id);
    for (const e of c.upmore.evidence) assert.ok(read(e.file).includes(e.test), `${c.id}: "${e.test}" not in ${e.file}`);
    for (const a of c.upmore.answer) assert.ok(c.upmore.evidence.some(e => read(e.file).includes(path.basename(a))), `${c.id}: no evidence test imports ${a}`);
  }
  for (const c of cards.filter(c => c.upmore.today === "MODULE_ONLY")) {
    assert.ok(!c.upmore.answer && /^packages\/domain\/\d\d-/.test(c.upmore.module[0]), c.id);
    assert.ok(c.upmore.evidence.some(e => read(e.file).includes(path.basename(c.upmore.module[0]))), c.id);
  }
});

test("a fake IN_CHAT entry fails the build: a test name that does not exist, an answer file that does not exist, a test that never imports it", () => {
  const fake = { items: [2], caps: [], today: "IN_CHAT", coverage: "part", note: "fake",
    answer: "supabase/functions/agent-chat/_shared/price_drop_answer.ts",
    evidence: [{ file: "tests/edge/price-drop-answer.test.ts", test: "textbook buyback offers are answered in chat" }] };
  let m = clone(); m["M2-SIDE-04"] = fake;
  assert.deepStrictEqual(validateMap(cards, m), ['M2-SIDE-04 (Sell textbooks back): no test named "textbook buyback offers are answered in chat" in tests/edge/price-drop-answer.test.ts']);
  m = clone(); m["M2-SIDE-04"] = Object.assign({}, fake, { answer: "supabase/functions/agent-chat/_shared/textbook_answer.ts" });
  assert.ok(validateMap(cards, m).some(p => /textbook_answer\.ts is not a file/.test(p)));
  m = clone(); m["M2-SIDE-04"] = Object.assign({}, fake, { evidence: [{ file: "tests/price-drop.test.cjs", test: "Best Buy's window is its return period: never turned into a number" }] });
  assert.ok(validateMap(cards, m).some(p => /no evidence test imports price_drop_answer\.ts/.test(p)));
  m = clone(); m["M2-SIDE-04"] = Object.assign({}, fake, { evidence: [] });
  assert.ok(validateMap(cards, m).some(p => /needs evidence/.test(p)));
  // A test name only counts as a test's name, not as words in a comment or an assertion.
  m = clone(); m["M2-SIDE-04"] = Object.assign({}, fake, { evidence: [{ file: "tests/edge/price-drop-answer.test.ts", test: "inside Target's 14-day window" }] });
  assert.ok(validateMap(cards, m).some(p => /no test named/.test(p)));
});

test("the other rules fail the build too: a gated card claimed, a soft gate dropped, a MODULE_ONLY with no module, a stray card", () => {
  let m = clone(); m["M1-BET-01"] = Object.assign({}, MAP["M3-SHOP-01"]);
  assert.ok(validateMap(cards, m).some(p => /M1-BET-01 .*GATED whatever is built, never IN_CHAT/.test(p)));
  m = clone(); m["M3-SHOP-01"] = { items: [], caps: [], today: "GATED", coverage: "none", note: "x" };
  assert.ok(validateMap(cards, m).some(p => /GATED, but the card has no hard gate/.test(p)));
  m = clone(); m["M3-SUBS-08"].note = m["M3-SUBS-08"].note.replace(/one_approval/g, "a yes");
  assert.ok(validateMap(cards, m).some(p => /soft gate one_approval/.test(p)));
  m = clone(); delete m["M3-SUBS-02"].module;
  assert.ok(validateMap(cards, m).some(p => /MODULE_ONLY needs its module/.test(p)));
  m = clone(); m["M9-NOPE-01"] = m["M3-SHOP-10"];
  assert.ok(validateMap(cards, m).some(p => /M9-NOPE-01, which is not a card/.test(p)));
  m = clone(); m["M3-SHOP-10"].items = [0, 150]; m["M3-SHOP-10"].caps = ["NOPE-001"];
  assert.ok(validateMap(cards, m).some(p => /items must be capability-list numbers 1\.\.149/.test(p)));
  assert.ok(validateMap(cards, m).some(p => /unknown registry capability NOPE-001/.test(p)));
});

test("tripwires: the placements that depend on how the handler is wired today", () => {
  const handler = fs.readFileSync(path.join(ROOT, "supabase/functions/agent-chat/handler.ts"), "utf8");
  // The T-Mobile plan and the cards held are asked in chat but never read back: the handler passes no facts. When it
  // does, M3-SUBS-02 and M3-SUBS-03 can move, and this test says so.
  assert.match(handler, /direct = await subscriptionReply\(message, today, oldestFirst\);/);
  assert.strictEqual(today("M3-SUBS-02"), "MODULE_ONLY");
  assert.strictEqual(today("M3-SUBS-03"), "MODULE_ONLY");
  // The direct answers the IN_CHAT cards rely on are all still called by the handler.
  for (const f of ["airlineReply", "moneyOwedReply", "priceDropReply", "rewardsReply", "subscriptionReply", "findMoneyReply", "unclaimedReply", "cardOffersReply", "winBackReply", "substitutesReply"]) assert.match(handler, new RegExp(`direct = await ${f}\\(`), f);
  // Placeholder catalogs are never counted: the portal and bonus cards stay NOT_BUILT. (M1-CARD-08 moved to IN_CHAT part
  // with the card-offer answer, overnight F4, which reads the person's own pasted offers, not a placeholder catalog.)
  for (const id of ["M1-CREATIVE-20", "M3-SHOP-11", "M1-REFER-08", "M1-BANK-12"]) assert.strictEqual(today(id), "NOT_BUILT", id);
});
