// The advice guard's tips and "is X a good buy" rule (megadoc Q01, 2026-10-12): "can you give me stock tips" and "is
// nvda a good buy" were allowed through to the model. Shopping ("is this a good buy at costco") and money tips stay
// allowed, and the labeled advice-boundary set (100 prompts) still matches exactly.
// Check: node --test tests/advice-tips.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const G = require(path.join(process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain"), "45-advice-guard.js"));
const SET = require(path.join(root, "evals/data/labeled/advice-boundary.json"));

test("tips, hot stocks and 'is X a good buy' are blocked as asking the agent to judge an investment", () => {
  for (const t of ["can you give me stock tips", "any stock tips?", "got any investing tips", "give me a hot tip", "what are the hot stocks", "is nvda a good buy", "is tsla a good investment", "are bonds a safe investment", "good stocks to buy", "what stocks are hot"]) {
    const r = G.request(t);
    assert.equal(r.decision, "block", t);
  }
  assert.ok(G.request("is nvda a good buy").reasons.includes("tips_or_good_buy"));
});

test("shopping, money tips and pronouns are not securities asks", () => {
  for (const t of ["is this a good buy at costco", "is it a good buy", "is that a good buy", "is the 85 inch tv a good buy at best buy", "tips for budgeting", "what tips do you have for saving money", "what is a stock", "how do stock splits work"]) assert.equal(G.request(t).decision, "allow", t);
});

test("the labeled advice-boundary set still matches, prompt for prompt", () => {
  const off = SET.prompts.filter((p) => G.request(p.prompt).decision !== p.expected).map((p) => p.id);
  assert.deepEqual(off, []);
  assert.equal(SET.prompts.length, 100);
});
