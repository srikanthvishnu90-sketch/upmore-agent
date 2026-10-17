// MI-111 — PER-USER PAID-DATA CREDIT LEDGER (master list MI-111, harness
// memo G6; Crew B data layer). Before this build there was NO accounting
// for paid data at all: Hunter lookups, aggregator credits and any future
// paid source would draw on ONE shared pool with no per-user ledger, no
// daily ceiling and no fail-closed behavior — one user (or one runaway
// loop) could silently drain the pool for everyone.
// Guards (fail-first; each names the defect class it keeps out):
//   LED-1 a paid lookup runs WITHOUT debiting a per-user ledger entry
//         carrying source + unit cost (the done-test's first clause)
//   LED-2 a user at their daily ceiling still gets paid lookups served —
//         a silent pool drain — instead of an honest "data budget reached"
//         refusal with the lookup NEVER executed
//   LED-3 an unknown source/kind (no catalogued cost) is served anyway:
//         unpriced spend is unaccountable spend, so it must fail closed
//   LED-4 credits are not reserved before the paid request (Spec 1 §327:
//         "reserve credits transactionally before a paid request.
//         Reconcile actual usage after results") — two in-flight lookups
//         can both pass a check-then-charge gate and overspend together;
//         and a failed lookup leaves its reservation charged forever
//   LED-5 pool-level spend is not reportable per day (the done-test's
//         third clause): per-user ledgers alone cannot answer "what did
//         the pool spend today, by source, by user"
//   LED-6 one user's ceiling blocks ANOTHER user, or yesterday's spend
//         counts against today (ledger scoping / day-boundary defects)
//   LED-7 fractional credits drift (Hunter verification is 0.5 credits —
//         float arithmetic would leak or invent fractions of a credit),
//         and a variable-priced lookup (Apollo enrichment, 1–9 credits)
//         is served without a quoted cost inside its catalogued range
//   LED-8 a zero-cost lookup (Apollo People Search, 0 credits) is either
//         blocked at ceiling or never recorded — free calls still belong
//         in the audit ledger, and a 0-cost call must never be refused
//         for budget reasons
// Check: node --test tests/career-mi111-credit-ledger.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const P = require(path.join(__dirname, "..", "packages/domain/156-career-paid-data.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));

const DAY1 = Date.parse("2026-10-16T15:00:00.000Z");
const DAY2 = Date.parse("2026-10-17T15:00:00.000Z");
const store = () => W.createMemoryStore();
const spy = (impl) => { const f = async (...a) => { f.calls++; return impl(...a); }; f.calls = 0; return f; };

test("catalog + defaults: Hunter observed unit costs, 50-credit default ceiling, integer millicredits", () => {
  assert.equal(P.DEFAULT_DAILY_CEILING_MILLI, 50000);
  assert.deepEqual(P.quoteCost({ source: "hunter", kind: "email_finder", units: 1 }),
    { ok: true, source: "hunter", kind: "email_finder", units: 1, unit_cost_milli: 1000, cost_milli: 1000 });
  assert.equal(P.quoteCost({ source: "hunter", kind: "email_verifier", units: 1 }).unit_cost_milli, 500);
  assert.equal(P.quoteCost({ source: "hunter", kind: "domain_search", units: 1 }).unit_cost_milli, 1000);
  assert.equal(P.quoteCost({ source: "pdl", kind: "person_search", units: 1 }).unit_cost_milli, 1000);
  assert.equal(P.quoteCost({ source: "apollo", kind: "people_search", units: 1 }).cost_milli, 0);
});

test("LED-1: a paid lookup debits the per-user ledger with source + unit cost", async () => {
  const st = store();
  const fn = spy(async () => ({ emails: ["a@x.co", "b@x.co", "c@x.co"] }));
  const r = await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 3, purpose: "contact discovery", now: DAY1 }, fn);
  assert.equal(r.ok, true);
  assert.equal(fn.calls, 1);
  assert.equal(r.debit.source, "hunter");
  assert.equal(r.debit.kind, "email_finder");
  assert.equal(r.debit.unit_cost_milli, 1000);
  assert.equal(r.debit.cost_milli, 3000);
  assert.equal(r.debit.status, "settled");
  const spend = await P.dailySpend({ store: st, userId: "user-1", now: DAY1 });
  assert.equal(spend.day, "2026-10-16");
  assert.equal(spend.total_milli, 3000);
  assert.equal(spend.lookups, 1);
  assert.deepEqual(spend.by_source, { hunter: 3000 });
  const entries = await P.ledgerEntries({ store: st, userId: "user-1" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].user_id, "user-1");
  assert.equal(entries[0].day, "2026-10-16");
});

test("LED-2: a user at their ceiling gets an honest data-budget refusal; the lookup never runs", async () => {
  const st = store();
  await P.setDailyCeiling({ store: st, userId: "user-1", ceiling_milli: 2000 });
  const ok = spy(async () => ({}));
  await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 2, now: DAY1 }, ok);
  assert.equal(ok.calls, 1);
  const blocked = spy(async () => ({}));
  const r = await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 1, now: DAY1 }, blocked);
  assert.equal(r.ok, false);
  assert.equal(r.code, "BUDGET_REACHED");
  assert.equal(blocked.calls, 0, "fail-closed: the paid call is never executed at ceiling");
  assert.match(r.speak_line, /data budget reached/i);
  assert.equal(r.spent_milli, 2000);
  assert.equal(r.ceiling_milli, 2000);
  const spend = await P.dailySpend({ store: st, userId: "user-1", now: DAY1 });
  assert.equal(spend.total_milli, 2000, "a refused lookup debits nothing");
  // A lookup that would cross the ceiling is refused whole, never part-served.
  const cross = spy(async () => ({}));
  const r2 = await P.runPaidLookup({ store: st, userId: "user-2", source: "hunter", kind: "email_finder", units: 51, now: DAY1 }, cross);
  assert.equal(r2.ok, false);
  assert.equal(r2.code, "BUDGET_REACHED");
  assert.equal(cross.calls, 0);
});

test("LED-3: unknown source or kind fails closed — never served, never debited", async () => {
  const st = store();
  for (const req of [
    { source: "some-new-vendor", kind: "email_finder" },
    { source: "hunter", kind: "phone_reveal" },
    { source: "hunter", kind: "email_finder", units: 0 },
    { source: "hunter", kind: "email_finder", units: -2 },
  ]) {
    const fn = spy(async () => ({}));
    const r = await P.runPaidLookup({ store: st, userId: "user-1", now: DAY1, ...req }, fn);
    assert.equal(r.ok, false, JSON.stringify(req));
    assert.equal(fn.calls, 0, JSON.stringify(req));
  }
  const spend = await P.dailySpend({ store: st, userId: "user-1", now: DAY1 });
  assert.equal(spend.total_milli, 0);
  assert.equal(spend.lookups, 0);
});

test("LED-4: credits reserve before the paid call and reconcile after; a failed call releases", async () => {
  const st = store();
  await P.setDailyCeiling({ store: st, userId: "user-1", ceiling_milli: 5000 });
  let release;
  const gate = new Promise((res) => { release = res; });
  const slow = spy(async () => { await gate; return { billable_units: 2 }; });
  const pending = P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 5, now: DAY1 }, slow);
  // While the first lookup is in flight its reservation already counts:
  // 5000 reserved of a 5000 ceiling leaves nothing for a second lookup.
  await new Promise((res) => setImmediate(res));
  const status = await P.budgetStatus({ store: st, userId: "user-1", now: DAY1 });
  assert.equal(status.reserved_milli, 5000);
  assert.equal(status.remaining_milli, 0);
  const second = spy(async () => ({}));
  const r2 = await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_verifier", units: 1, now: DAY1 }, second);
  assert.equal(r2.ok, false);
  assert.equal(r2.code, "BUDGET_REACHED");
  assert.equal(second.calls, 0);
  release();
  const r1 = await pending;
  assert.equal(r1.ok, true);
  assert.equal(r1.debit.cost_milli, 2000, "reconciled to the 2 billable units the vendor actually charged");
  assert.equal(r1.debit.units, 2);
  const after = await P.budgetStatus({ store: st, userId: "user-1", now: DAY1 });
  assert.equal(after.spent_milli, 2000);
  assert.equal(after.reserved_milli, 0);
  // A lookup that throws releases its reservation and charges nothing.
  const boom = spy(async () => { throw new Error("vendor 502"); });
  const r3 = await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 3, now: DAY1 }, boom);
  assert.equal(r3.ok, false);
  assert.equal(r3.code, "LOOKUP_FAILED");
  const final = await P.budgetStatus({ store: st, userId: "user-1", now: DAY1 });
  assert.equal(final.spent_milli, 2000);
  assert.equal(final.reserved_milli, 0);
  const entries = await P.ledgerEntries({ store: st, userId: "user-1" });
  assert.ok(entries.some((e) => e.status === "released" && e.cost_milli === 0), "the failed call's reservation is on the ledger as released, charged 0");
});

test("LED-5: pool-level spend is reportable per day, by source and by user", async () => {
  const st = store();
  const fn = spy(async () => ({}));
  await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 2, now: DAY1 }, fn);
  await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_verifier", units: 2, now: DAY1 }, fn);
  await P.runPaidLookup({ store: st, userId: "user-2", source: "pdl", kind: "person_search", units: 4, now: DAY1 }, fn);
  await P.runPaidLookup({ store: st, userId: "user-2", source: "hunter", kind: "email_finder", units: 1, now: DAY2 }, fn);
  const pool = await P.poolReport({ store: st, day: "2026-10-16" });
  assert.equal(pool.total_milli, 7000);
  assert.equal(pool.lookups, 3);
  assert.deepEqual(pool.by_source, { hunter: 3000, pdl: 4000 });
  assert.deepEqual(pool.by_user, { "user-1": 3000, "user-2": 4000 });
  const empty = await P.poolReport({ store: st, day: "2026-10-20" });
  assert.equal(empty.total_milli, 0);
  assert.equal(empty.lookups, 0);
  assert.deepEqual(empty.by_source, {});
});

test("LED-6: ceilings are per user and per day — no cross-user or cross-day bleed", async () => {
  const st = store();
  await P.setDailyCeiling({ store: st, userId: "user-1", ceiling_milli: 1000 });
  const fn = spy(async () => ({}));
  await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 1, now: DAY1 }, fn);
  const blocked = await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 1, now: DAY1 }, fn);
  assert.equal(blocked.code, "BUDGET_REACHED");
  const other = await P.runPaidLookup({ store: st, userId: "user-2", source: "hunter", kind: "email_finder", units: 1, now: DAY1 }, fn);
  assert.equal(other.ok, true, "user-1's ceiling never blocks user-2");
  const tomorrow = await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 1, now: DAY2 }, fn);
  assert.equal(tomorrow.ok, true, "a new day refills the ceiling");
});

test("LED-7: fractional credits never drift; variable-priced lookups need an in-range quote", async () => {
  const st = store();
  const fn = spy(async () => ({}));
  for (let i = 0; i < 10; i++) {
    const r = await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_verifier", units: 1, now: DAY1 }, fn);
    assert.equal(r.debit.cost_milli, 500);
  }
  const spend = await P.dailySpend({ store: st, userId: "user-1", now: DAY1 });
  assert.equal(spend.total_milli, 5000, "10 x 0.5 credits is exactly 5 credits, no float drift");
  const noQuote = spy(async () => ({}));
  const r = await P.runPaidLookup({ store: st, userId: "user-1", source: "apollo", kind: "enrichment", units: 1, now: DAY1 }, noQuote);
  assert.equal(r.ok, false);
  assert.equal(r.code, "QUOTE_REQUIRED");
  assert.equal(noQuote.calls, 0);
  const badQuote = await P.runPaidLookup({ store: st, userId: "user-1", source: "apollo", kind: "enrichment", units: 1, quoted_cost_milli: 99000, now: DAY1 }, noQuote);
  assert.equal(badQuote.ok, false);
  assert.equal(noQuote.calls, 0);
  const quoted = await P.runPaidLookup({ store: st, userId: "user-1", source: "apollo", kind: "enrichment", units: 1, quoted_cost_milli: 4000, now: DAY1 }, fn);
  assert.equal(quoted.ok, true);
  assert.equal(quoted.debit.cost_milli, 4000);
});

test("LED-8: a zero-cost lookup is recorded in the ledger and never budget-blocked", async () => {
  const st = store();
  await P.setDailyCeiling({ store: st, userId: "user-1", ceiling_milli: 1000 });
  const fn = spy(async () => ({}));
  await P.runPaidLookup({ store: st, userId: "user-1", source: "hunter", kind: "email_finder", units: 1, now: DAY1 }, fn);
  const status = await P.budgetStatus({ store: st, userId: "user-1", now: DAY1 });
  assert.equal(status.at_ceiling, true);
  const free = await P.runPaidLookup({ store: st, userId: "user-1", source: "apollo", kind: "people_search", units: 5, now: DAY1 }, fn);
  assert.equal(free.ok, true, "a 0-credit search runs even at ceiling — it cannot drain the pool");
  assert.equal(free.debit.cost_milli, 0);
  const entries = await P.ledgerEntries({ store: st, userId: "user-1" });
  assert.ok(entries.some((e) => e.source === "apollo" && e.cost_milli === 0), "the free call is still on the audit ledger");
});
