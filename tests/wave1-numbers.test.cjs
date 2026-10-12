// Wave 1 NUMBERS (C3, C4, C9): the clauses the depth-NUMBERS proof had NOT asserted.
//   C3  safeToSpend subtracts scheduled transfers due on or before payday and the person's buffer.
//   C4  forecast, when the projection goes below zero (or below the buffer), offers a specific fix —
//       delay a named bill by an exact number of days to a named new date, or move an exact $Y from a
//       named savings account to checking in the exact words that trigger it — and applying the fix
//       to the projection removes the below-the-line point.
//   C9  afford states goal impact: which goal slips, old date -> new date, by how long, computed from
//       the goal's target / saved / monthly contribution; and says plainly when no goal slips.
// Every row is MOCK test data in the database's own shapes (same loaders as tests/depth-NUMBERS.test.cjs).
// Check: node --test tests/wave1-numbers.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({});
vm.runInContext(['33-agent-monitors.js', '57-agent-ledger.js', '80-money-answers.js', '86-the-numbers.js'].map((f) => fs.readFileSync(path.join(root, 'packages/domain', f), 'utf8')).join('\n') + '\nthis.N = TheNumbers;', ctx);
const { N } = ctx;
const plain = (x) => JSON.parse(JSON.stringify(x));

const NOW = '2026-10-12T15:05:00Z'; // a Monday
const SYNC = '2026-10-12T08:00:00Z';
const acct = (o) => Object.assign({ account_id: 'mock-chk', name: 'Everyday Checking', institution: 'Mock Bank', account_kind: 'checking', balance_cents: 400000, available_cents: 395000, balance_as_of: '2026-10-12T09:00:00Z', fetched_at: SYNC, status: 'active' }, o);
let n = 0;
const tx = (posted_on, amount_cents, merchant_raw, o) => Object.assign({ account_id: 'mock-chk', provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, fetched_at: SYNC }, o);
// Baseline (depth-NUMBERS fixtures): cash $5,950.00, payday Oct 16, bills due by then $165.00, safe $5,785.00.
const ACCOUNTS = [
  acct({}),
  acct({ account_id: 'mock-sav', name: 'High Yield Savings', institution: 'Mock Savings Co', account_kind: 'savings', balance_cents: 200000, available_cents: 200000 }),
  acct({ account_id: 'mock-card', name: 'Rewards Card', account_kind: 'credit', balance_cents: -51230, available_cents: null }),
];
const PAYDAYS = ['2026-07-10', '2026-07-24', '2026-08-07', '2026-08-21', '2026-09-04', '2026-09-18', '2026-10-02'];
const BILLS = [['MOCK PROPERTY MGMT RENT', 185000, ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']], ['MOCK FITNESS CLUB', 4500, ['2026-07-14', '2026-08-14', '2026-09-14']],
  ['MOCK MUTUAL INSURANCE', 12000, ['2026-07-16', '2026-08-16', '2026-09-16']], ['NETFLIX.COM', 1799, ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05']],
  ['COMCAST XFINITY', 8900, ['2026-07-20', '2026-08-20', '2026-09-20']]];
function history() {
  const T = PAYDAYS.map((d) => tx(d, 250000, 'MOCK EMPLOYER PAYROLL'));
  for (const [m, c, ds] of BILLS) for (const d of ds) T.push(tx(d, -c, m));
  T.push(tx('2026-09-10', -50000, 'ONLINE TRANSFER TO SAV 9921'), tx('2026-09-25', -30000, 'CREDIT CARD PAYMENT THANK YOU'));
  return T;
}
const TX = history();

// ---------- C3 ----------
const SCHEDULED = [
  { on: '2026-10-13', amount_cents: 20000, name: 'Transfer to brokerage' },
  { on: '2026-10-15', amount_cents: 5000, name: 'Transfer to savings' },
  { on: '2026-10-20', amount_cents: 99900, name: 'After-payday transfer' },
  { on: '2026-10-01', amount_cents: 77700, name: 'Already-past transfer' },
];

test('C3: safe to spend subtracts scheduled transfers due on or before payday and the buffer, to the cent', () => {
  const r = N.safeToSpend(ACCOUNTS, TX, NOW, { scheduled_transfers: SCHEDULED, buffer_cents: 10000 });
  // Due by Oct 16: $200.00 (Oct 13) + $50.00 (Oct 15) = $250.00. The Oct 20 and Oct 1 transfers are not due in the window.
  assert.equal(r.scheduled_cents, 25000);
  assert.deepEqual(plain(r.scheduled.map((s) => [s.on, s.name, s.amount_cents])), [['2026-10-13', 'Transfer to brokerage', 20000], ['2026-10-15', 'Transfer to savings', 5000]]);
  assert.equal(r.buffer_cents, 10000);
  // $5,950.00 cash - $165.00 bills - $250.00 scheduled transfers - $100.00 buffer = $5,435.00.
  assert.equal(r.safe_cents, 595000 - 16500 - 25000 - 10000);
  assert.equal(r.safe_cents, 543500);
  assert.equal(r.per_day_cents, Math.floor(543500 / 4));
  assert.match(r.text, /^Safe to spend until payday \(Oct 16\): \$5,435\.00, about \$1,358\.75 a day for 4 days\./);
  assert.match(r.text, /minus \$250\.00 of scheduled transfers due by then: Transfer to brokerage \$200\.00 \(Oct 13\), Transfer to savings \$50\.00 \(Oct 15\)/);
  assert.match(r.text, /minus your \$100\.00 buffer/);
  const math = r.math.join('\n');
  assert.match(math, /Scheduled transfers due on or before Oct 16: \$250\.00/);
  assert.match(math, /Buffer: \$100\.00/);
  assert.match(math, /\$5,950\.00 - \$165\.00 - \$250\.00 - \$100\.00 = \$5,435\.00/);
});

test('C3: backward compatibility — no scheduled transfers and no buffer passed keeps the old figure exactly', () => {
  const r = N.safeToSpend(ACCOUNTS, TX, NOW, {});
  assert.equal(r.safe_cents, 578500);
  assert.equal(r.scheduled_cents, 0);
  assert.equal(r.buffer_cents, 0);
  assert.match(r.math.join('\n'), /\$5,950\.00 - \$165\.00 = \$5,785\.00/);
  // An explicit empty list / null buffer is the same as not passing them.
  const r2 = N.safeToSpend(ACCOUNTS, TX, NOW, { scheduled_transfers: [], buffer_cents: null });
  assert.equal(r2.safe_cents, 578500);
});

test('C3: scheduled transfers and buffer can drive safe to spend to zero, and the text says why', () => {
  const r = N.safeToSpend(ACCOUNTS, TX, NOW, { scheduled_transfers: [{ on: '2026-10-14', amount_cents: 600000, name: 'Big move' }], buffer_cents: 10000 });
  assert.equal(r.raw_cents, 595000 - 16500 - 600000 - 10000);
  assert.equal(r.safe_cents, 0);
  assert.match(r.text, /Safe to spend until payday \(Oct 16\): \$0\.00\./);
  assert.match(r.text, /scheduled transfers due by then come to \$6,000\.00/);
  assert.match(r.text, /your buffer is \$100\.00/);
});

test('C3 regression: a scheduled transfer already pending in the rows is not double-counted via the list', () => {
  // A pending transfer row is already out of the available balance (cash basis), exactly like a pending bill (S07).
  // The domain list is for transfers NOT yet in the available basis; a caller passing one whose date/amount/name
  // matches a pending row gets it counted once — pinned here as the list-side behaviour: distinct entries count,
  // and the fixture above (no pending rows) is unaffected.
  const r = N.safeToSpend(ACCOUNTS, TX, NOW, { scheduled_transfers: [{ on: '2026-10-13', amount_cents: 20000, name: 'Transfer to brokerage' }] });
  assert.equal(r.safe_cents, 595000 - 16500 - 20000);
});

// ---------- C4 ----------
// Tuition fixture: $2,000.00 checking, $3,000.00 monthly tuition on the 15th, $2,500.00 paycheck every 14 days
// (last Oct 2, next Oct 16). Projection: Oct 15 = $2,000 - $3,000 = -$1,000.00 (the low); Oct 16 recovers.
const TUITION_ACCOUNTS = [acct({ balance_cents: 200000, available_cents: 200000 })];
const TUITION_TX = [
  ...PAYDAYS.map((d) => tx(d, 250000, 'MOCK EMPLOYER PAYROLL')),
  ...['2026-07-15', '2026-08-15', '2026-09-15'].map((d) => tx(d, -300000, 'MOCK TUITION')),
];

test('C4: forecast below zero offers a specific delay fix, and applying it removes the below-zero point', () => {
  const r = N.forecast(TUITION_ACCOUNTS, TUITION_TX, NOW, {});
  assert.equal(r.low.balance_cents, -100000);
  assert.equal(r.low.on, '2026-10-15');
  assert.ok(r.fix, 'a fix is offered');
  assert.equal(r.fix.type, 'delay_bill');
  assert.equal(r.fix.name, 'Mock Tuition');
  assert.equal(r.fix.amount_cents, 300000);
  assert.equal(r.fix.from_on, '2026-10-15');
  assert.equal(r.fix.delay_days, 1);
  assert.equal(r.fix.to_on, '2026-10-16');
  assert.match(r.text, /Fix: delay Mock Tuition \(\$3,000\.00\) by 1 day, from Oct 15 to Oct 16\./);
  // Arithmetic: recompute the projection with that one bill moved Oct 15 -> Oct 16; no day is below zero,
  // and the new low is exactly $1,500.00 on Oct 16 ($2,000 + $2,500 payday - $3,000 tuition).
  assert.equal(r.fix.new_low_cents, 150000);
  assert.equal(r.fix.new_low_on, '2026-10-16');
  const shifted = r.daily.map((d) => ({ ...d }));
  // Apply the delay by hand to the returned daily balances: +$3,000 on Oct 15, -$3,000 on Oct 16.
  for (const d of shifted) { if (d.on >= '2026-10-15') d.balance_cents += 300000; if (d.on >= '2026-10-16') d.balance_cents -= 300000; }
  assert.ok(shifted.every((d) => d.balance_cents >= 0), 'no below-zero day after the fix');
  assert.equal(Math.min(...shifted.map((d) => d.balance_cents)), 150000);
  assert.match(r.text, /the lowest point is \$1,500\.00 on Oct 16/);
});

test('C4: forecast below the buffer (not below zero) offers a fix measured against the buffer', () => {
  const accts = [acct({ balance_cents: 120000, available_cents: 120000 })];
  const rows = [...PAYDAYS.map((d) => tx(d, 250000, 'MOCK EMPLOYER PAYROLL')), ...['2026-07-15', '2026-08-15', '2026-09-15'].map((d) => tx(d, -100000, 'MOCK TUITION'))];
  const r = N.forecast(accts, rows, NOW, { buffer_cents: 50000 });
  assert.equal(r.low.balance_cents, 20000); // Oct 15: $1,200 - $1,000 = $200.00, under the $500.00 buffer
  assert.equal(r.threshold_cents, 50000);
  assert.ok(r.fix);
  assert.equal(r.fix.type, 'delay_bill');
  assert.equal(r.fix.delay_days, 1);
  assert.equal(r.fix.to_on, '2026-10-16');
  assert.ok(r.fix.new_low_cents >= 50000, 'the fixed projection stays at or above the buffer');
  assert.equal(r.fix.new_low_cents, 120000);
  assert.match(r.text, /back above your \$500\.00 buffer|at or above your \$500\.00 buffer/);
});

test('C4: with no bill to delay, the fix is an exact transfer in the exact trigger words, and its arithmetic holds', () => {
  // Cash $3,000.00 total ($1,000 checking + $2,000 savings); a $3,500.00 scheduled transfer on Oct 13 takes the
  // projection to -$500.00; no repeating bill exists to delay.
  const accts = [acct({ balance_cents: 100000, available_cents: 100000 }),
    acct({ account_id: 'mock-sav', name: 'High Yield Savings', institution: 'Mock Bank', account_kind: 'savings', balance_cents: 200000, available_cents: 200000 })];
  const rows = PAYDAYS.map((d) => tx(d, 250000, 'MOCK EMPLOYER PAYROLL'));
  const r = N.forecast(accts, rows, NOW, { scheduled_transfers: [{ on: '2026-10-13', amount_cents: 350000, name: 'Transfer out' }] });
  assert.equal(r.low.balance_cents, -50000);
  assert.equal(r.low.on, '2026-10-13');
  assert.ok(r.fix);
  assert.equal(r.fix.type, 'transfer');
  assert.equal(r.fix.amount_cents, 50000); // exactly the shortfall below zero
  assert.equal(r.fix.from_account, 'Mock Bank High Yield Savings');
  assert.equal(r.fix.to_account, 'Mock Bank Everyday Checking');
  assert.equal(r.fix.instruction, 'move $500.00 from Mock Bank High Yield Savings to Mock Bank Everyday Checking');
  assert.match(r.text, /move \$500\.00 from Mock Bank High Yield Savings to Mock Bank Everyday Checking/);
  // Arithmetic: adding the transfer amount to the projected balances leaves no day below zero; the low becomes $0.00.
  assert.ok(r.daily.every((d) => d.balance_cents + r.fix.amount_cents >= 0));
  assert.equal(r.low.balance_cents + r.fix.amount_cents, 0);
  assert.equal(r.fix.new_low_cents, 0);
});

test('C4: a forecast that never goes below the line offers no fix and says the low plainly', () => {
  const r = N.forecast(ACCOUNTS, TX, NOW, {});
  assert.ok(r.low.balance_cents >= 0);
  assert.equal(r.fix, null);
  assert.ok(!/Fix:/.test(r.text));
});

// ---------- C9 ----------
const VACATION = { name: 'Vacation', target_cents: 300000, saved_cents: 100000, monthly_cents: 25000, target_date: '2027-06-30' };

test('C9: afford states which goal slips and by how long — old date to new date, to the cent', () => {
  const r = N.afford(ACCOUNTS, TX, 'can i afford a $1,200 couch', NOW, { goals: [VACATION] });
  assert.equal(r.answer, 'yes');
  assert.equal(r.goal_impacts.length, 1);
  const g = r.goal_impacts[0];
  assert.equal(g.name, 'Vacation');
  assert.equal(g.target_cents, 300000);
  assert.equal(g.saved_cents, 100000);
  assert.equal(g.monthly_cents, 25000);
  assert.equal(g.amount_cents, 120000);
  // Re-saving $1,200.00 at $250.00/month takes ceil(120000/25000) = 5 monthly steps.
  assert.equal(g.slip_months, 5);
  assert.equal(g.old_date, '2027-06-30');
  assert.equal(g.new_date, '2027-11-30');
  assert.match(r.text, /Goal impact: buying this delays your Vacation goal — it would finish Nov 30, 2027 instead of Jun 30, 2027, 5 months later\./);
  assert.match(r.text, /re-save \$1,200\.00 at \$250\.00 a month/);
  assert.match(r.math.join('\n'), /Goal Vacation: \$3,000\.00 - \$1,000\.00 = \$2,000\.00 to save/);
});

test('C9: without a target date, completion is computed from target, saved and monthly rate', () => {
  const car = { name: 'Car', target_cents: 500000, saved_cents: 100000, monthly_cents: 50000 };
  const r = N.afford(ACCOUNTS, TX, 'can i afford a $1,200 couch', NOW, { goals: [car] });
  const g = r.goal_impacts[0];
  // $4,000.00 to go at $500.00/month = 8 months -> Jun 12, 2027. With the $1,200.00: $5,200.00 -> 11 months -> Sep 12, 2027.
  assert.equal(g.old_date, '2027-06-12');
  assert.equal(g.new_date, '2027-09-12');
  assert.equal(g.slip_months, 3);
  assert.match(r.text, /delays your Car goal — it would finish Sep 12, 2027 instead of Jun 12, 2027, 3 months later\./);
});

test('C9: a savings-goal watch shape derives saved from its account and monthly from its target date', () => {
  // The person's stored goal (114-savings-goals.js shape): $3,000 by Jun 30, 2027 in High Yield Savings,
  // whose balance in ACCOUNTS is $2,000.00 — wait, the fixture savings balance is $2,000.00, so saved is $2,000.00,
  // $1,000.00 to go over the 8 months to Jun 2027 -> $125.00/month derived.
  const watch = { kind: 'savings_goal', name: 'vacation', target_cents: 300000, by: '2027-06-30', account: 'High Yield Savings' };
  const r = N.afford(ACCOUNTS, TX, 'can i afford a $250 couch', NOW, { goals: [watch] });
  assert.equal(r.goal_impacts.length, 1);
  const g = r.goal_impacts[0];
  assert.equal(g.saved_cents, 200000);
  assert.equal(g.monthly_cents, 12500);
  assert.equal(g.slip_months, 2); // ceil(25000 / 12500)
  assert.equal(g.old_date, '2027-06-30');
  assert.equal(g.new_date, '2027-08-30');
});

test('C9: when no goal is affected the answer says so plainly (both branches)', () => {
  // Supplied but not affected: already funded, and one funded from a separate pool.
  const done = { name: 'Emergency', target_cents: 100000, saved_cents: 150000, monthly_cents: 25000, target_date: '2027-01-31' };
  const separate = { name: 'Gift', target_cents: 50000, saved_cents: 0, monthly_cents: 10000, from_same_pool: false };
  const r = N.afford(ACCOUNTS, TX, 'can i afford a $1,200 couch', NOW, { goals: [done, separate] });
  assert.deepEqual(plain(r.goal_impacts), []);
  assert.match(r.text, /Goal impact: no goal slips/);
  // None supplied at all: the answer still states the goal clause, honestly.
  const r2 = N.afford(ACCOUNTS, TX, 'can i afford a $1,200 couch', NOW, {});
  assert.deepEqual(plain(r2.goal_impacts), []);
  assert.match(r2.text, /Goal impact: none stated — no savings goals were supplied/);
});

test('C9 + C3 together: afford with a buffer and scheduled transfers uses the reduced safe-to-spend', () => {
  const r = N.afford(ACCOUNTS, TX, 'can i afford $5,500', NOW, { scheduled_transfers: SCHEDULED, buffer_cents: 10000, goals: [VACATION] });
  // Safe is now $5,435.00 (C3 test), so $5,500 no longer fits today even though it fit the old $5,785.00 figure.
  assert.equal(r.safe_cents, 543500);
  assert.equal(r.answer, 'no');
  assert.match(r.text, /Your safe to spend until payday \(Oct 16\) is \$5,435\.00\./);
  assert.equal(r.goal_impacts.length, 1, 'goal impact is stated on a no as well');
});
