// "I spent less than that" (megadoc L06; docs/depth/SPEND-RECHECK.md). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Rows MOCK.
// Check: node --test tests/depth-SPEND-RECHECK.test.cjs && node evals/depth/run.cjs SPEND-RECHECK
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const SR = require(path.join(dir, "108-spend-recheck.js"));
const MA = require(path.join(dir, "80-money-answers.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z");
let i = 0;
const r = (d, c, m, o) => Object.assign({ account_id: "chk", provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }, o);
const TX = [r("2026-08-02", -500, "X"), r("2026-09-03", -9000, "TRADER JOE S #552"), r("2026-09-11", -6000, "WHOLEFDS MKT 10230"), r("2026-09-20", -3000, "KROGER #0042"), r("2026-09-25", -4000, "BLUE HERON HARDWARE"), r("2026-09-28", -2000, "KROGER #0042", { is_pending: true }), r("2026-09-29", -5000, "ONLINE TRANSFER TO SAVINGS", { is_transfer: true }), r("2026-10-03", -12000, "TRADER JOE S #552")];
const ASK = "how much did i spend on groceries in september";
const thread = (ask = ASK, rows = TX, rules = null) => [{ role: "assistant", content: MA.spend(rows, ask, NOW, { tz: TZ, rules }) }, { role: "user", content: ask }];
const ans = (words, o = {}) => SR.answer(o.rows || TX, words, NOW, { tz: TZ, rules: o.rules || null, previous: o.previous || thread(o.ask, o.said || o.rows || TX, o.rules || null) });
const L = (t, n) => t.split("\n")[n];
const SRC = "From your linked accounts, transactions through Oct 3, 2026, as of Oct 12, 8:00 AM EDT.";

test("[S01] the total rechecked by the same filters, with how many charges", () => {
  assert.equal(L(ans("i spent less than that"), 0), "Rechecked from your rows: $180.00 on groceries in September (Sep 1-30), from 3 charges.");
});

test("[S02] the charges behind it, largest first, with their dates", () => {
  assert.equal(L(ans("i spent less than that"), 1), "The charges: Trader Joe's $90.00 on Sep 3; Whole Foods $60.00 on Sep 11; Kroger $30.00 on Sep 20.");
  // Dates and amounts in different orders: still largest first.
  const rows = [r("2026-08-01", -1, "X"), r("2026-09-02", -1500, "KROGER #0042"), r("2026-09-09", -7000, "TRADER JOE S #552"), r("2026-09-15", -3200, "WHOLEFDS MKT 10230")];
  assert.equal(L(ans("break it down", { rows }), 1), "The charges: Trader Joe's $70.00 on Sep 9; Whole Foods $32.00 on Sep 15; Kroger $15.00 on Sep 2.");
});

test("[S03] more than 8: the 8 largest, the rest counted with their total", () => {
  const many = Array.from({ length: 11 }, (_, k) => r(`2026-09-${String(k + 1).padStart(2, "0")}`, -(1000 + k * 100), "KROGER #0042"));
  const t = ans("break it down", { rows: many.concat([r("2026-08-01", -1, "X")]) });
  assert.match(L(t, 1), /^The 8 largest: Kroger \$20\.00 on Sep 11; Kroger \$19\.00 on Sep 10; .*; and 3 more for \$33\.00\.$/);
});

test("[S04] pending charges are said as not counted", () => {
  assert.equal(L(ans("i spent less than that"), 2), "Not counted: 1 pending charge ($20.00), until it posts.");
});

test("[S05] transfers and card payments are said as not counted, and are not in the total", () => {
  const t = ans("i spent less than that");
  assert.equal(L(t, 3), "Not counted either: transfers between your accounts and card payments.");
  assert.doesNotMatch(t, /\$230\.00/);
});

test("[S06] a category: how a store is counted and the rule that moves it; spending that matched no category is said", () => {
  assert.equal(L(ans("i spent less than that"), 4), "Each charge counts by the store's name. If one here isn't groceries, say \"count <store> as shopping\" (or another category) and it moves in every answer after. $40.00 of your other spending in that period matched no category, so none of it is in this total.");
});

test("[S07] the person's category rules count, as in the answer", () => {
  const rules = [{ term: "blue heron hardware", group: "groceries" }];
  assert.equal(L(ans("i spent less than that", { rules }), 0), "Rechecked from your rows: $220.00 on groceries in September (Sep 1-30), from 4 charges.");
});

test("[S08] 'less': where to look if a charge isn't theirs", () => {
  assert.match(ans("i spent less than that"), /\nIf a charge here isn't yours, say "what's this charge from Trader Joe's" or "dispute this charge"\.\n/);
  assert.doesNotMatch(ans("that's too low"), /isn't yours/);
});

test("[S09] 'more': where something missing may be", () => {
  assert.match(ans("that's too low"), /\nSomething missing may still be pending, on a card that isn't linked, or counted under another category\.\n/);
});

test("[S10] new rows since the answer: the new total, and the one said before", () => {
  const said = TX.filter((x) => x.posted_on !== "2026-09-20");
  assert.match(L(ans("i spent less than that", { said }), 0), /^Rechecked from your rows: \$180\.00 on groceries .*, from 3 charges \(I said \$150\.00 before; your transactions have changed since\)\.$/);
});

test("[S11] a merchant total rechecked", () => {
  const t = ans("break it down", { ask: "what did i spend at trader joes in september" });
  assert.match(L(t, 0), /^Rechecked from your rows: \$90\.00 at Trader Joe's in September \(Sep 1-30\), from 1 charge\.$/);
  assert.doesNotMatch(t, /count <store>/);
});

test("[S12] only the answer just given: a safe-to-spend answer before it is not a spending total", () => {
  const prev = [{ role: "assistant", content: "Safe to spend until payday: $412.00." }].concat(thread());
  assert.equal(ans("that's wrong", { previous: prev }), null);
  assert.match(ans("i spent less than that", { previous: prev }), /^Which number\?/);
});

test("[S13] no spending answer in the thread: 'less' asks which number; a bare 'that's wrong' goes on", () => {
  assert.match(SR.answer(TX, "i spent less than that", NOW, { tz: TZ, previous: [] }), /^Which number\? I don't see a spending total in this chat to recheck\./);
  assert.equal(SR.answer(TX, "that's wrong", NOW, { tz: TZ, previous: [] }), null);
});

test("[S14] the ways people say it; anything else is not this", () => {
  for (const m of ["i spent less than that", "no way i spent that much", "that's too high", "that's too low", "that can't be right", "where did that number come from", "break it down", "hmm that's wrong", "no, that's wrong"]) assert.ok(SR.ask(m), m);
  for (const m of ["how much did i spend", "i spent 40 at target", "that's great", "less than $50", "break down my spending", "that's too high a price"]) assert.equal(SR.ask(m), null, m);
});

test("[S15] every recheck ends with the source line", () => {
  for (const m of ["i spent less than that", "that's too low", "break it down"]) assert.ok(ans(m).endsWith(`\n${SRC}`), m);
});
