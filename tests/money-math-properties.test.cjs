// Property tests for the money math already in chat (overnight G2): the spend total equals an independent sum of the same
// rows, cent for cent, over many seeded random histories; no currency is ever added into dollars; a period with no
// linked data is never reported as $0.00 spent; month ends, a leap day and the person's own time zone pick the right
// days. Every row is MOCK data, generated from a fixed seed so a failure is reproducible.
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../packages/domain/80-money-answers.js");

// Deterministic PRNG (mulberry32) so every run sees the same histories.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SHOPS = ["MOCK HARDWARE 12", "MOCK BOOKSHOP", "MOCK FLORIST 9", "MOCK TAILOR", "MOCK PET SUPPLY"]; // no category words
const ymd = (d) => d.toISOString().slice(0, 10);
const FETCHED = "2026-10-12T08:00:00Z";

function history(seed, from, days) {
  const r = rng(seed), rows = [];
  for (let i = 0; i < days; i++) {
    const day = ymd(new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000));
    const k = Math.floor(r() * 4);
    for (let j = 0; j < k; j++) {
      const kind = r();
      rows.push({
        account_id: "mock-chk", provider_transaction_id: `mock-${seed}-${i}-${j}`, posted_on: day, fetched_at: FETCHED,
        merchant_raw: SHOPS[Math.floor(r() * SHOPS.length)],
        amount_cents: kind < 0.08 ? Math.floor(r() * 300000) + 1 : -(Math.floor(r() * 25000) + 1), // some income
        is_pending: kind > 0.95, is_transfer: kind > 0.9 && kind <= 0.95, currency: kind > 0.88 && kind <= 0.9 ? "EUR" : "USD",
      });
    }
  }
  return rows;
}
// The independent oracle: posted, not pending, not a transfer, USD, money out, posted inside [from, to].
const oracle = (rows, from, to) => rows.filter((t) => !t.is_pending && !t.is_transfer && t.currency === "USD" && t.amount_cents < 0 && t.posted_on >= from && t.posted_on <= to)
  .reduce((s, t) => s - t.amount_cents, 0);
const headline = (text) => { const m = /^You spent \$([\d,]+\.\d{2})/.exec(text); assert.ok(m, `no headline in: ${text.split("\n")[0]}`); return Math.round(Number(m[1].replace(/,/g, "")) * 100); };

test("last month's total equals an independent sum of the same rows, over 200 seeded histories", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rows = history(seed, "2026-07-01", 104); // Jul 1 to Oct 12
    const text = M.spend(rows, "how much did i spend last month", "2026-10-12T15:05:00Z", { tz: "UTC" });
    assert.equal(headline(text), oracle(rows, "2026-09-01", "2026-09-30"), `seed ${seed}`);
  }
});

test("this month so far, and the last 30 days, also equal the oracle (100 seeds each)", () => {
  for (let seed = 300; seed < 400; seed++) {
    const rows = history(seed, "2026-08-01", 73);
    assert.equal(headline(M.spend(rows, "what did i spend this month", "2026-10-12T15:05:00Z", { tz: "UTC" })), oracle(rows, "2026-10-01", "2026-10-12"), `seed ${seed} this month`);
    assert.equal(headline(M.spend(rows, "how much did i spend in the last 30 days", "2026-10-12T15:05:00Z", { tz: "UTC" })), oracle(rows, "2026-09-13", "2026-10-12"), `seed ${seed} 30 days`);
  }
});

test("a currency other than dollars is never added into the dollar total", () => {
  const rows = [
    { account_id: "mock", provider_transaction_id: "m1", posted_on: "2026-09-10", fetched_at: FETCHED, merchant_raw: "MOCK BOOKSHOP", amount_cents: -1000, is_pending: false, is_transfer: false, currency: "USD" },
    { account_id: "mock", provider_transaction_id: "m2", posted_on: "2026-09-11", fetched_at: FETCHED, merchant_raw: "MOCK BOOKSHOP", amount_cents: -99999, is_pending: false, is_transfer: false, currency: "EUR" },
  ];
  assert.equal(headline(M.spend(rows, "how much did i spend last month", "2026-10-12T15:05:00Z", { tz: "UTC" })), 1000);
});

test("a period before the linked data starts is never reported as $0.00 spent", () => {
  const rows = history(7, "2026-09-03", 40);
  const text = M.spend(rows, "how much did i spend last month", "2026-10-01T03:00:00Z", { tz: "America/Chicago" }); // still Sep 30 in Chicago: last month is August
  assert.doesNotMatch(text, /You spent \$0\.00/, "no data for August is not $0.00 spent in August");
  const first = rows.map((r) => r.posted_on).sort()[0];
  assert.ok(first > "2026-08-31", "the fixture starts after August");
  assert.match(text, /^Your linked transactions start Sep \d+, 2026, so I can't see last month \(Aug 1-31\)/);
  assert.match(text, /From your linked accounts/);
});

test("the person's time zone picks the day: 03:00 UTC on Oct 1 is still September in Chicago", () => {
  const rows = history(11, "2026-08-01", 70);
  const chi = M.spend(rows, "what did i spend this month", "2026-10-01T03:00:00Z", { tz: "America/Chicago" });
  assert.equal(headline(chi), oracle(rows, "2026-09-01", "2026-09-30"));
  const utc = M.spend(rows, "what did i spend this month", "2026-10-01T03:00:00Z", { tz: "UTC" });
  assert.equal(headline(utc), oracle(rows, "2026-10-01", "2026-10-01"));
});

test("month ends and a leap day: February 2028 has 29 days", () => {
  const rows = history(21, "2028-01-15", 60);
  assert.equal(headline(M.spend(rows, "how much did i spend last month", "2028-03-05T12:00:00Z", { tz: "UTC" })), oracle(rows, "2028-02-01", "2028-02-29"));
  const rows2 = history(22, "2027-01-15", 60);
  assert.equal(headline(M.spend(rows2, "how much did i spend last month", "2027-03-05T12:00:00Z", { tz: "UTC" })), oracle(rows2, "2027-02-01", "2027-02-28"));
});
