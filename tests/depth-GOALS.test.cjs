// Savings goals, tracking only (megadoc M08; teardown 2 step 4; docs/depth/GOALS.md). One test per sub-capability, tagged
// so evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Accounts MOCK. The chat side is
// tests/edge/goal-answer.test.ts.
// Check: node --test tests/depth-GOALS.test.cjs && node evals/depth/run.cjs GOALS
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const G = require(path.join(dir, "114-savings-goals.js"));

const NOW = Date.parse("2026-10-12T15:00:00Z"), TZ = "America/New_York";
const set = (t, w) => G.command(t, w || [], NOW, TZ);
const A = [{ name: "High Yield Savings", institution: "Ally", balance_cents: 125000, balance_as_of: "2026-10-12T09:30:00Z" }, { name: "Ally Savings", balance_cents: 300000, balance_as_of: "2026-10-12" }, { name: "Everyday Checking", balance_cents: 50000, balance_as_of: "2026-10-12" }];
const one = (t, w) => G.status(t, w, A, NOW, TZ).split("\n")[0];
const V = set("set a $3000 vacation goal by june in high yield savings").watches;

test("[S01] set: name, target, date and account restated; tracking only said", () => {
  assert.equal(set("set a $3000 vacation goal by june in high yield savings").reply, "Goal set: vacation, $3,000.00 by Jun 30, 2027. I'll track it against the balance of \"High Yield Savings\". It's tracking only: nothing is moved, set aside or scheduled.");
});
test("[S02] the ways people set one", () => {
  for (const [t, name, c] of [["set a goal to save 5k for a house", "house", 500000], ["my goal is $1,200 for a new laptop", "new laptop", 120000], ["start a 2000 emergency fund", "emergency", 200000], ["track a $3,000.50 wedding fund", "wedding", 300050]]) { const g = set(t).watches[0]; assert.equal(g.name, name, t); assert.equal(g.target_cents, c, t); }
});
test("[S03] no account given: asked for, never guessed", () => {
  const r = set("set a goal to save 5k for a house"); assert.equal(r.watches[0].account, null); assert.match(r.reply, /Which account holds it\? Say "my house fund is in" and the account's name/);
});
test("[S04] dates: by June is next June's last day, in 6 months, none is fine, a bad one is refused", () => {
  assert.equal(V[0].by, "2027-06-30");
  assert.equal(set("set a goal to save 5k for a house in 6 months").watches[0].by, "2027-04-12");
  assert.equal(set("start a 2000 emergency fund").watches[0].by, null);
  const bad = set("set a $3000 vacation goal by feb 30"); assert.equal(bad.watches, null); assert.match(bad.reply, /^I couldn't read that date/);
});
test("[S05] 'in 6 months' and 'in June' are dates, never an account", () => {
  assert.equal(set("set a goal to save 5k for a house in 6 months").watches[0].account, null);
  assert.equal(set("set a goal to save 5k for a car in june").watches[0].account, null);
});
test("[S06] tie a goal to an account; a goal that doesn't exist is not this", () => {
  const w = set("set a goal to save 5k for a house").watches, t = set("my house fund is in ally savings", w);
  assert.equal(t.watches[0].account, "ally savings"); assert.equal(t.reply, "Your house goal now tracks the balance of \"Ally Savings\". Nothing was moved.");
  assert.equal(set("my boat fund is in ally savings", w), null);
});
test("[S07] setting it again replaces it, keeps its date and account, and says the old target", () => {
  const r = set("set a 4000 vacation goal", V); assert.equal(r.watches.length, 1); assert.equal(r.watches[0].by, "2027-06-30"); assert.equal(r.watches[0].account, "high yield savings");
  assert.match(r.reply, /^Goal set: vacation, \$4,000\.00 by Jun 30, 2027 \(it was \$3,000\.00 by Jun 30, 2027\)\./);
});
test("[S08] stop one, or all; one that doesn't exist says so", () => {
  const w = set("start a 2000 emergency fund", V).watches;
  assert.equal(set("stop my vacation goal", w).watches.length, 1);
  assert.equal(set("delete all my goals", w).watches.length, 0);
  assert.equal(set("stop my boat goal", w).reply, "You don't have a boat goal, so nothing changed.");
});
test("[S09] progress: the account's balance against the target, the percent, what's left, the as-of", () => {
  assert.equal(one("how's my vacation fund", V), "Vacation: $1,250.00 of $3,000.00 (41.6%) in High Yield Savings at Ally, as of 2026-10-12. $1,750.00 to go: $218.75 a month for 8 months to reach it by Jun 30, 2027.");
});
test("[S10] with a date: the amount a month over the calendar months to it, rounded up so it reaches it", () => {
  const w = set("my house fund is in ally savings", set("set a goal to save 5k for a house in 6 months").watches).watches;
  assert.match(one("how close am i to my house goal", w), /\$2,000\.00 to go: \$333\.34 a month for 6 months to reach it by Apr 12, 2027\.$/);
});
test("[S11] reached or over is said", () => {
  const w = set("my house fund is in ally savings", set("set a goal to save 2500 for a house").watches).watches;
  assert.match(one("how's my house fund", w), /\(120%\) in Ally Savings, as of 2026-10-12\. That's the goal reached, \$500\.00 over\.$/);
});
test("[S12] an account that matches none, or several, is asked about, never guessed", () => {
  const none = set("my house fund is in chase", set("set a goal to save 5k for a house").watches).watches;
  assert.match(one("how's my house fund", none), /I don't see an account called "chase" among your linked accounts, so I won't guess its balance\./);
  const many = set("my house fund is in savings", set("set a goal to save 5k for a house").watches).watches;
  assert.match(one("how's my house fund", many), /I found 2 accounts that match "savings" \(High Yield Savings, Ally Savings\)/);
});
test("[S13] not tied yet: said, with the person's account names to pick from", () => {
  assert.match(one("how are my goals", set("start a 2000 emergency fund").watches), /^Emergency: \$2,000\.00 goal, not tied to an account yet\. Say "my emergency fund is in" and the account's name \(High Yield Savings, Ally Savings, Everyday Checking\)\.$/);
});
test("[S14] status asks: the ways people ask; an index or retirement fund is not this; another goal's name says which exist", () => {
  for (const t of ["how's my vacation fund", "hows my vacation fund", "how are my goals", "show my goals", "where am i on my vacation goal", "how close am i to my house goal"]) assert.ok(G.isStatus(t), t);
  for (const t of ["how's my index fund", "how is my retirement fund", "what's my balance"]) assert.ok(!G.isStatus(t), t);
  assert.equal(G.status("hows my wedding fund", V, A, NOW, TZ), "You don't have a wedding goal. Your goals: vacation.");
});
test("[S15] limits: at most 5 goals, a target up to $10,000,000.00, never an investment fund", () => {
  let w = []; for (const n of ["a", "b", "c", "d", "e"]) w = set(`set a 100 ${n}trip goal`, w).watches;
  assert.match(set("set a 100 ftrip goal", w).reply, /^You have 5 goals already/);
  assert.match(set("set a 20000000 house goal").reply, /^A goal needs a target from \$0\.01 to \$10,000,000\.00/);
  assert.ok(!(set("set a goal to save 500 for my 401k") || {}).watches, "a 401k is never a savings goal");
  assert.ok(!(set("set a $5000 retirement fund goal") || {}).watches, "a retirement fund is never a savings goal");
});
