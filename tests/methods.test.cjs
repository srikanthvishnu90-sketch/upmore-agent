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
