// "Rent is due and I only have 1900" (megadoc D13; docs/depth/RENT-SHORT.md). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Rows MOCK.
// Check: node --test tests/depth-RENT-SHORT.test.cjs && node evals/depth/run.cjs RENT-SHORT
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const RS = require(path.join(dir, "106-rent-short.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z");
const acc = (c) => [{ account_id: "chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: c, available_cents: c, balance_as_of: "2026-10-12T12:00:00Z", fetched_at: "2026-10-12T12:00:00Z", status: "active", currency: "USD" }];
let i = 0;
const r = (d, c, m) => ({ account_id: "chk", provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" });
const TX = [];
for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) { TX.push(r(`${m}-01`, -240000, "OAK PROPERTY MGMT RENT")); TX.push(r(`${m}-05`, -1599, "NETFLIX.COM")); }
for (const d of ["2026-07-17", "2026-07-31", "2026-08-14", "2026-08-28", "2026-09-11", "2026-09-25", "2026-10-09"]) TX.push(r(d, 90000, "ACME CORP PAYROLL"));
// A phone bill on the 20th, repeating, falls between today and the rent.
for (const m of ["2026-07", "2026-08", "2026-09"]) TX.push(r(`${m}-20`, -8500, "VERIZON WIRELESS"));
const ans = (words, cash = 190000, rows = TX) => RS.answer(acc(cash), rows, words, NOW, { tz: TZ });
const L = (t, n) => t.split("\n")[n];
const SRC = "From your linked accounts (Mock Bank): balances as of Oct 12, 8:00 AM EDT; transactions through Oct 9, 2026, synced Oct 12, 8:00 AM EDT.";

test("[S01] rent read from the person's repeating rent payment: amount, due date, payee", () => {
  assert.equal(L(ans("rent is due and I only have 1900"), 0), "Rent: $2,400.00 due Nov 1 (your repeating payment to Oak Property Mgmt Rent).");
});

test("[S02] the cash the person says is used and said as theirs, next to what the linked accounts read", () => {
  assert.equal(L(ans("rent is due and I only have 1900", 205000), 1), "Cash: $1,900.00 (what you said; your linked cash reads $2,050.00).");
  assert.equal(L(ans("rent is due and I only have 1900", 190000), 1), "Cash: $1,900.00 (what you said).");
});

test("[S03] with nothing said, the linked checking and savings", () => {
  assert.equal(L(ans("i can't pay rent this month", 50000), 1), "Cash: $500.00 (your linked checking and savings).");
});

test("[S04] the gap today to the cent, or what is left", () => {
  assert.equal(L(ans("rent is due and I only have 1900"), 2), "Short by $500.00 today.");
  assert.equal(L(ans("will i have enough for rent", 500000), 2), "Covered today, with $2,600.00 left after rent.");
  assert.equal(L(ans("rent is due and i only have 1937.42"), 2), "Short by $462.58 today.");
});

test("[S05] paychecks and bills before the due date, and what is left after rent on it", () => {
  assert.equal(L(ans("rent is due and I only have 1900"), 3), "Before Nov 1: paychecks $900.00 on Oct 23; bills Verizon Wireless $85.00 on Oct 20. With those, you'd have $315.00 left after rent on Nov 1. That counts your repeating paychecks and bills only.");
});

test("[S06] still short on the due date: a draft to the landlord, part on time, the rest by the next payday", () => {
  const t = ans("i can't pay rent this month", 50000);
  assert.match(t, /\nBefore Nov 1: .*you'd still be \$1,085\.00 short on Nov 1\./);
  assert.match(t, /\nLandlords often take part on time and the rest a few days later if you ask before Nov 1\. A message you can send:\n"Hi, rent of \$2,400\.00 is due Nov 1\. I can pay \$1,315\.00 on time and the remaining \$1,085\.00 by Nov 6, when my next paycheck lands\. Would that work\?"\nNothing was paid, moved or sent\.\n/);
});

test("[S07] covered by the due date: no draft, nothing to send", () => {
  const t = ans("rent is due and I only have 1900");
  assert.doesNotMatch(t, /Landlords|message you can send/);
});

test("[S08] the rent amount the person gives wins, with the last one said", () => {
  assert.equal(L(ans("rent is 2600 due nov 1 and i only have 1900"), 0), "Rent: $2,600.00 due Nov 1 (the amount you gave; your last one was $2,400.00).");
});

test("[S09] the due date the person gives wins", () => {
  assert.match(L(ans("rent is 2400 due the 25th and i only have 1900"), 0), /^Rent: \$2,400\.00 due Oct 25 /);
  assert.match(ans("rent is 2400 due the 25th and i only have 1900"), /\nBefore Oct 25: paychecks \$900\.00 on Oct 23; bills Verizon Wireless \$85\.00 on Oct 20\./);
});

test("[S10] no rent in the rows and none said: asked, never guessed", () => {
  const t = ans("rent is due and i only have 1900", 190000, TX.filter((x) => !/RENT/.test(x.merchant_raw)));
  assert.equal(t, `I don't see a rent payment that repeats in your linked accounts; it may go out under another name, like a Zelle to your landlord or a portal. How much is rent and when is it due? Say it like "rent is 2400 due Nov 1 and I only have 1900".\n${SRC}`);
});

test("[S11] no paycheck before the due date is said", () => {
  const t = ans("rent is due and i only have 1900", 190000, TX.filter((x) => !/PAYROLL/.test(x.merchant_raw)));
  assert.match(t, /\nBefore Nov 1: no paycheck shows up; bills Verizon Wireless \$85\.00 on Oct 20\. With those, you'd still be \$585\.00 short on Nov 1\./);
  const none = ans("rent is due and i only have 1900", 190000, TX.filter((x) => !/PAYROLL|VERIZON/.test(x.merchant_raw)));
  assert.match(none, /\nNo paycheck shows up before Nov 1 in your linked accounts\.\n/);
});

test("[S12] amounts read as people write them: 1.5k, $1,900, 1900.50", () => {
  assert.equal(RS.ask("i only have 1.5k and rent is coming up").have_cents, 150000);
  assert.equal(RS.ask("rent is due and i only have $1,900").have_cents, 190000);
  assert.equal(RS.ask("rent is due tomorrow and i only have 1900.50").have_cents, 190050);
});

test("[S13] the ways people ask; paying rent, did rent go through and splitting rent are not this", () => {
  for (const m of ["rent is due and I only have 1900", "i can't pay rent this month", "will i have enough for rent", "am i short on rent", "i don't have enough for rent", "can i afford rent"]) assert.ok(RS.ask(m), m);
  for (const m of ["pay my rent", "did my rent go through", "split rent with my roommate", "rent is now 2500", "what is rent", "how much did i spend on rent", "i only have 1200 so i need to split rent with my roommate", "i only have 1900 left, did my rent go through", "i only have 1900, set up rent for 1500"]) assert.equal(RS.ask(m), null, m);
});

test("[S14] no cash account linked and none said: said, nothing worked out", () => {
  const card = [{ account_id: "cc", name: "Card", institution: "Mock Bank", account_kind: "credit", balance_cents: -1000, balance_as_of: "2026-10-12T12:00:00Z", fetched_at: "2026-10-12T12:00:00Z", status: "active", currency: "USD" }];
  const t = RS.answer(card, TX, "will i have enough for rent", NOW, { tz: TZ });
  assert.match(t, /\nI can't see a checking or savings balance in your linked accounts, so I can't say whether it's covered\./);
  assert.doesNotMatch(t, /Short by|Covered/);
});

test("[S15] every answer ends with the source line", () => {
  for (const [m, c] of [["rent is due and I only have 1900", 190000], ["i can't pay rent this month", 50000], ["will i have enough for rent", 500000]]) assert.ok(ans(m, c).endsWith(`\n${SRC}`), m);
});
