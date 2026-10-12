// Category rules in chat (capability list item 8, megadoc L07 "recategorize Target as groceries"; docs/depth/CATEGORY-RULES.md).
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Rows are MOCK. Check: node --test tests/depth-CATEGORY-RULES.test.cjs && node evals/depth/run.cjs CATEGORY-RULES
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const MA = require(path.join(dir, "80-money-answers.js"));
const CR = require(path.join(dir, "95-category-rules.js"));
const B = require(path.join(dir, "93-budgets.js"));
const SV = require(path.join(dir, "94-spending-views.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:05:00Z"); // Mon Oct 12, 11:05 a.m. in New York
let i = 0;
const r = (d, c, m, o) => Object.assign({ account_id: "mock-chk", provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }, o);
const rule = (term, group, id) => ({ id: id || `cr-${term.replace(/\W/g, "")}`, term, group, created_at: "2026-10-01T12:00:00.000Z", text: `count ${term} as ${group}` });
const TARGET = rule("target", "groceries");
// October: Kroger $80.00, Target $120.00 + $45.50, a $20.00 Target refund, Costco Gas $40.00, Joe's Corner Store $30.00.
const OCT = [r("2026-10-02", -8000, "KROGER #123"), r("2026-10-04", -12000, "TARGET 00012345 MINNEAPOLIS MN"), r("2026-10-06", -4550, "TARGET.COM *ORDER"), r("2026-10-08", 2000, "TARGET RETURN"),
  r("2026-10-09", -4000, "COSTCO GAS #1080"), r("2026-10-10", -3000, "JOES CORNER STORE")];
const cmd = (words, rules = [], now = NOW) => CR.command(words, rules, now);
const groupOf = (raw, rules) => { const c = MA.classify(raw, rules); return c ? c.group : null; };

test("[S01] 'recategorize Target as groceries' saves one rule and restates it exactly", () => {
  const c = cmd("recategorize Target as groceries");
  assert.equal(c.rules.length, 1);
  assert.deepEqual([c.rules[0].term, c.rules[0].group], ["target", "groceries"]);
  assert.equal(c.reply, 'Done: charges that say "Target" now count as groceries instead of shopping, in your spending answers and budgets, past charges included.\nThis changes how I count, nothing at your bank or card. Say "stop counting Target as groceries" to undo it.');
});

test("[S02] the ways people say it: count, put under, change to, is, isn't X it's Y, always, please", () => {
  const p = (m) => { const x = CR.parse(m); return x && [x.kind, x.term, x.group]; };
  for (const m of ["count target as groceries", "put Target under groceries", "change target to groceries", "change target's category to groceries", "target is groceries", "target should be groceries",
    "target isn't shopping, it's groceries", "always categorize Target as groceries", "can you please recategorize my Target purchases as groceries from now on", "re-categorize target as grocery", "file target under grocery store", "can u put target in groceries", "move target to the grocery category", "target = groceries", "target → groceries", "target -> groceries"]) assert.deepEqual(p(m), ["set", "target", "groceries"], m);
  assert.deepEqual(p("count trader joe’s as groceries"), ["set", "trader joe's", "groceries"]);
  assert.deepEqual(p("starbucks is coffee"), ["set", "starbucks", "restaurants"]);
});

test("[S03] asks that are not rules go on: money moves, questions, settings, other things called 'is'", () => {
  for (const m of ["move 500 to savings", "put 200 in savings", "categorize target under my budget", "recategorize netflix into my savings account", "classify this charge as fraud", "mark staples as a business expense", "categorize uber as a work expense", "move $50 into my groceries budget", "gas is expensive", "is target groceries?", "how do i categorize target as groceries",
    "netflix is a subscription i want to cancel", "my biggest expense is groceries", "most of it is shopping", "set quiet hours to 10pm", "change my time zone to pacific", "mark this as spam", "count me in", "my rent is due", "uber is late", "remove netflix from my subscriptions", "put money to work", "move my 401k to fidelity", "x = 5", "put target to bed"]) assert.equal(CR.parse(m), null, m);
});

test("[S04] a pronoun is never guessed into a merchant", () => {
  const c = cmd("recategorize that as groceries");
  assert.equal(c.rules, null);
  assert.match(c.reply, /^Tell me the merchant's name, like "count Target as groceries"\. I set rules by merchant, not for one charge, so nothing changed\.$/);
});

test("[S05] an unknown category is refused with the list; food asks which", () => {
  const c = cmd("categorize Target as pets");
  assert.equal(c.rules, null);
  assert.equal(c.reply, 'I don\'t have a "pets" category to put it in, so nothing changed. Categories I can put a merchant in: food delivery, groceries, restaurants (eating out, dining, coffee), gas, subscriptions, transport, shopping.');
  const f = cmd("count Target as food");
  assert.equal(f.rules, null);
  assert.equal(f.reply, '"Food" covers groceries, restaurants and food delivery. Which one should "Target" count as? Nothing changed yet.');
});

test("[S06] no rule for a word on every bank line, an amount, a long number or a category", () => {
  for (const [m, re] of [["count payment as shopping", /on almost every bank line/], ["recategorize 4111 1111 1111 1111 as shopping", /long number/], ["count groceries as shopping", /not one category into another/], ["count debit as groceries", /on almost every bank line/]]) {
    const c = cmd(m);
    assert.equal(c.rules, null, m);
    assert.match(c.reply, re, m);
  }
});

test("[S07] already counted there: nothing saved, said plainly", () => {
  assert.deepEqual(cmd("count Kroger as groceries"), { rules: null, reply: 'Charges that say "Kroger" already count as groceries, so nothing changed.' });
  assert.deepEqual(cmd("count Target as groceries", [TARGET]), { rules: null, reply: 'Charges that say "Target" already count as groceries (your rule), so nothing changed.' });
});

test("[S08] a new rule for the same merchant replaces the old one and says so", () => {
  const c = cmd("count target as restaurants", [TARGET, rule("joes corner store", "groceries")]);
  assert.equal(c.rules.length, 2);
  assert.deepEqual(c.rules.map((x) => [x.term, x.group]), [["joes corner store", "groceries"], ["target", "restaurants"]]);
  assert.match(c.reply, /^Done: charges that say "Target" now count as restaurants instead of groceries \(that replaces your earlier rule\),/);
});

test("[S09] stop counting: the rule goes and the old category comes back; the wrong category changes nothing", () => {
  const c = cmd("stop counting Target as groceries", [TARGET]);
  assert.deepEqual(c.rules, []);
  assert.equal(c.reply, 'Removed your rule: charges that say "Target" count as shopping again, as they did before. Nothing else changed.');
  assert.deepEqual(cmd("stop counting Target as restaurants", [TARGET]), { rules: null, reply: 'Your rule counts "Target" as groceries, not restaurants, so nothing changed.' });
  assert.match(cmd("don't count Kroger as groceries").reply, /^"Kroger" counts as groceries by default, not by a rule of yours\./);
  for (const m of ["stop putting target in groceries", "remove target from groceries", "take target out of groceries"]) assert.deepEqual(cmd(m, [TARGET]).rules, [], m);
});

test("[S10] someone else's rule is left alone: 'delete my autosave rule' goes on", () => {
  assert.equal(cmd("delete my autosave rule", [TARGET]), null);
  assert.deepEqual(cmd("delete my target rule", [TARGET]).rules, []);
  assert.match(cmd("delete my costco category rule", [TARGET]).reply, /^You don't have a category rule for "Costco", so nothing changed\. Your rules: "Target" as groceries\.$/);
});

test("[S11] list them, and clear them all", () => {
  assert.equal(cmd("show my category rules", [TARGET]).reply, 'Your category rules: "Target" counts as groceries. They change how I count, nothing at your bank.');
  assert.equal(cmd("show category rules", [TARGET]).reply, cmd("show my category rules", [TARGET]).reply);
  assert.equal(cmd("what are my category rules", []).reply, `You don't have any category rules. Say "count Target as groceries" to add one.`);
  const c = cmd("delete all my category rules", [TARGET, rule("joes corner store", "groceries")]);
  assert.deepEqual(c.rules, []);
  assert.match(c.reply, /^Removed all 2 category rules: "Target" \(groceries\), "Joes Corner Store" \(groceries\)\./);
});

test("[S12] at most 40 rules; a replacement still works at the limit", () => {
  const many = Array.from({ length: 40 }, (_, k) => rule(`store ${String.fromCharCode(97 + (k % 26))}${String.fromCharCode(97 + Math.floor(k / 26))}`, "shopping"));
  assert.equal(cmd("count joes corner store as groceries", many).rules, null);
  assert.match(cmd("count joes corner store as groceries", many).reply, /You have 40 category rules, the most I keep/);
  assert.equal(cmd("count store aa as groceries", many).rules.length, 40);
});

test("[S13] storable: no run of 9 digits in a rule, digits in the words masked", () => {
  const c = cmd("count Target as groceries");
  assert.doesNotMatch(JSON.stringify(c.rules), /\d{9,}/);
  assert.equal(c.rules[0].id, `cr-${NOW.toString(36)}`);
  const d = cmd("count target store 12345 as groceries");
  assert.equal(d.rules, null, "a 5-digit run is no merchant name");
});

test("[S14] a rule matches the merchant's whole words, never inside another word", () => {
  assert.equal(groupOf("TARGET 00012345 MINNEAPOLIS MN", [TARGET]), "groceries");
  assert.equal(groupOf("TARGET.COM *ORDER", [TARGET]), "groceries");
  assert.equal(groupOf("TARGETED ADS LLC", [TARGET]), null);
  assert.equal(groupOf("TRADER JOE S #55", [rule("trader joe's", "restaurants")]), "restaurants");
});

test("[S15] the longest matching rule wins", () => {
  const rules = [rule("joes", "restaurants"), rule("joes corner store", "groceries")];
  assert.equal(groupOf("JOES CORNER STORE", rules), "groceries");
  assert.equal(groupOf("JOES PIZZA", rules), "restaurants");
  assert.equal(groupOf("JOES CORNER STORE", rules.slice().reverse()), "groceries");
});

test("[S16] a known merchant more specific than the rule keeps its own category, and the reply says so", () => {
  const costco = rule("costco", "shopping");
  assert.equal(groupOf("COSTCO GAS #1080", [costco]), "gas");
  assert.equal(groupOf("COSTCO WHSE #1080", [costco]), "shopping");
  assert.match(cmd("count Costco as shopping").reply, /Costco Gas stays gas/);
  assert.equal(groupOf("UBER EATS 123", [rule("uber", "shopping")]), "delivery");
});

test("[S17] 'how much did I spend on groceries' counts the moved charges and says which rule did it", () => {
  const t = MA.spend(OCT, "how much did i spend on groceries this month", NOW, { tz: TZ, rules: [TARGET] });
  // The spending answer adds up charges (a refund is not taken off there, unlike a budget): $80.00 + $120.00 + $45.50.
  assert.match(t, /^You spent \$245\.50 on groceries this month/);
  assert.match(t, /\nBy your category rule: "Target" as groceries \$165\.50\.\n/);
  const without = MA.spend(OCT, "how much did i spend on groceries this month", NOW, { tz: TZ });
  assert.match(without, /^You spent \$80\.00 on groceries this month/);
  assert.doesNotMatch(without, /category rule/);
});

test("[S18] a budget counts the moved charges the same way", () => {
  const b = { id: "budget-groceries-mock", kind: "category_budget", category: "groceries", amount_cents: 40000, period: "month", created_at: "2026-10-01T12:00:00.000Z", created_on: "2026-10-01", status: "active" };
  const a = B.answer("how am i doing on my grocery budget", { budgets: [b], transactions: OCT, now: NOW, tz: TZ, rules: [TARGET] });
  assert.match(a.text, /^Groceries budget for October: \$225\.50 spent of \$400\.00, \$174\.50 left\./);
  assert.match(a.text, /\nBy your category rule: "Target" as groceries \$145\.50\.\n/);
  const al = B.alerts([Object.assign({}, b, { amount_cents: 25000 })], OCT, NOW, { tz: TZ, rules: [TARGET] });
  assert.deepEqual(al.map((x) => x.threshold), [80]);
});

test("[S19] a stored rule naming no category the chat counts is ignored, never trusted", () => {
  assert.equal(groupOf("TARGET 00012345", [{ term: "target", group: "pets" }]), "shopping");
  assert.equal(groupOf("TARGET 00012345", [{ term: 42, group: "groceries" }, null]), "shopping");
  assert.equal(MA.spend(OCT, "how much did i spend on groceries this month", NOW, { tz: TZ, rules: [{ term: "target", group: "pets" }] }).startsWith("You spent $80.00 on groceries"), true);
});

test("[S20] the month comparison counts by the rules too", () => {
  const t = SV.compare(OCT, "did i spend more on groceries this month than last", NOW, { tz: TZ, rules: [TARGET] });
  assert.match(t, /^This month so far \(Oct 1-12\), you spent \$225\.50 on groceries\./);
  assert.match(t, /\nBy your category rule: "Target" as groceries \$145\.50\.\n/);
  // The rules are gone once the call returns: the next call without them counts by the defaults.
  assert.match(SV.compare(OCT, "did i spend more on groceries this month than last", NOW, { tz: TZ }), /^This month so far \(Oct 1-12\), you spent \$80\.00 on groceries\./);
});
