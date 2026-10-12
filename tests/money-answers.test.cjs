// See-everything numbers in chat (packages/domain/80-money-answers.js): balance, spend, checkup, did it go through.
// Every account and transaction row here is MOCK test data in the database's own shapes; nothing is a real account.
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../packages/domain/80-money-answers.js');
const { check } = require('../evals/gauntlet/checks.cjs');
const spec16 = require('../evals/gauntlet/spec16-20.json');
const item = (id) => spec16.items.find((i) => i.id === id);

const NOW = '2026-10-12T15:05:00Z'; // a Monday
const SYNC = '2026-10-12T08:00:00Z';
const acct = (o) => Object.assign({ account_id: 'mock-chk', name: 'Everyday Checking', institution: 'Mock Bank', account_kind: 'checking', balance_cents: 123456, available_cents: 123456, balance_as_of: '2026-10-12T09:00:00Z', fetched_at: SYNC, status: 'active' }, o);
let n = 0;
const tx = (posted_on, amount_cents, merchant_raw, o) => Object.assign({ account_id: 'mock-chk', provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, fetched_at: SYNC }, o);
const SOURCE = /From your linked accounts.*(as of|through)/;

const ACCOUNTS = [
  acct({}),
  acct({ account_id: 'mock-sav', name: 'High Yield Savings', institution: 'Mock Savings Co', account_kind: 'savings', balance_cents: 500000, available_cents: 500000, balance_as_of: '2026-10-12T07:30:00Z' }),
  acct({ account_id: 'mock-card', name: 'Rewards Card', institution: 'Mock Bank', account_kind: 'credit', balance_cents: -51230, available_cents: null }),
];
// Aug, Sep and Oct 2026: food at known merchants, one unknown merchant, rent, pay, a transfer, a card payment, a pending.
const TX = [
  tx('2026-08-01', -185000, 'MOCK PROPERTY MANAGEMENT RENT'), tx('2026-08-04', -8000, 'TRADER JOE S #552'), tx('2026-08-12', -2500, 'DOORDASH*THAI PLACE'),
  tx('2026-08-15', 250000, 'MOCK EMPLOYER PAYROLL'), tx('2026-08-20', -3000, 'KROGER #0042'),
  tx('2026-09-01', -185000, 'MOCK PROPERTY MANAGEMENT RENT'), tx('2026-09-03', -9000, 'TRADER JOE S #552'), tx('2026-09-05', -1250, 'STARBUCKS STORE 01234'),
  tx('2026-09-07', -3000, 'UBER *EATS PENDING.UBER.COM'), tx('2026-09-09', -4000, 'BLUE HERON HARDWARE'), tx('2026-09-10', -50000, 'ONLINE TRANSFER TO SAV 9921', { is_transfer: true }),
  tx('2026-09-11', -6000, 'WHOLEFDS MKT 10230'), tx('2026-09-15', 250000, 'MOCK EMPLOYER PAYROLL'), tx('2026-09-20', -20000, 'CREDIT CARD PAYMENT THANK YOU'),
  tx('2026-09-22', -4500, 'SHELL OIL 57444'), tx('2026-09-28', -1799, 'NETFLIX.COM'),
  tx('2026-10-01', 250000, 'MOCK EMPLOYER PAYROLL'), tx('2026-10-02', -4500, 'SHELL OIL 57444'), tx('2026-10-03', -12000, 'TRADER JOE S #552'),
  tx('2026-10-05', -1799, 'NETFLIX.COM'), tx('2026-10-06', -2200, 'CHIPOTLE 1234'),
];

test('money is $1,234.56 from integer cents', () => {
  assert.equal(M.money(123456), '$1,234.56');
  assert.equal(M.money(5), '$0.05');
  assert.equal(M.money(-185000), '-$1,850.00');
  assert.equal(M.money(100000000), '$1,000,000.00');
});

test('balance: cash total across checking and savings, each account listed, cards owed apart, oldest as-of named (S16-01)', () => {
  const r = M.balance(ACCOUNTS, NOW);
  assert.match(r, /^You have \$6,234\.56 in cash across 2 accounts, as of Oct 12, 7:30 AM UTC\./);
  assert.match(r, /- Mock Bank Everyday Checking: \$1,234\.56\n- Mock Savings Co High Yield Savings: \$5,000\.00\n/);
  assert.match(r, /Credit cards, not counted in cash: \$512\.30 owed in total\.\n- Mock Bank Rewards Card: \$512\.30 owed/);
  assert.match(r, /From your linked accounts \(Mock Bank, Mock Savings Co\), balances as of Oct 12, 7:30 AM UTC\.$/);
  assert.doesNotMatch(r, /Heads up/, 'fresh balances get no staleness note');
  assert.deepEqual(check(item('S16-01').checks, { reply: r }), []);
});

test('balance: available shown when it differs; a disconnected account is left out', () => {
  const r = M.balance([acct({ available_cents: 100000 }), acct({ account_id: 'gone', name: 'Old Checking', balance_cents: 999999, status: 'disconnected' })], NOW);
  assert.match(r, /^You have \$1,234\.56 in cash across 1 account, as of/);
  assert.match(r, /\$1,234\.56 \(\$1,000\.00 available\)/);
  assert.doesNotMatch(r, /Old Checking|9,999/);
});

test('balance: a balance more than a day old is said plainly, with its age', () => {
  const r = M.balance([acct({}), acct({ account_id: 'mock-sav', name: 'Savings', account_kind: 'savings', balance_cents: 1000, balance_as_of: '2026-10-09T15:00:00Z' })], NOW);
  assert.match(r, /as of Oct 9, 3:00 PM UTC\./);
  assert.match(r, /Heads up: Mock Bank Savings was last updated Oct 9, 3:00 PM UTC, 3 days ago, so its real balance may have changed\./);
  const fresh = M.balance([acct({ balance_as_of: '2026-10-11T16:00:00Z' })], NOW);
  assert.doesNotMatch(fresh, /Heads up/, '23 hours is not stale');
});

test('balance: unknown type is never counted as cash unless its name says checking or savings; a failed sync is said', () => {
  const r = M.balance([acct({ account_kind: 'unknown', name: 'TOTAL CHECKING' }), acct({ account_id: 'm2', account_kind: 'unknown', name: 'Joint Account', balance_cents: 70000 }), acct({ account_id: 'm3', account_kind: 'savings', name: 'Rainy Day', sync_error: true, balance_cents: 100 })], NOW);
  assert.match(r, /^You have \$1,235\.56 in cash across 2 accounts/);
  assert.match(r, /- Mock Bank Joint Account \(type not set\): \$700\.00/);
  assert.match(r, /An account with no type set isn't counted as cash/);
  assert.match(r, /The last sync of Mock Bank Rainy Day failed/);
});

test('balance: no checking or savings says there is no cash total instead of inventing one; no as-of uses the sync time', () => {
  const r = M.balance([acct({ account_kind: 'credit', name: 'Card', balance_cents: -2500 })], NOW);
  assert.match(r, /^No checking or savings balance is linked, so there's no cash total \(balances as of Oct 12, 9:00 AM UTC\)\./);
  assert.match(r, /\$25\.00 owed/);
  const r2 = M.balance([acct({ balance_as_of: null })], NOW);
  assert.match(r2, /as of Oct 12, 8:00 AM UTC/, 'fetched_at stands in when the bank gave no balance time');
});

test('periods: last month, this month so far, this week, last week, a named month, last N days; each with its prior equal period', () => {
  let p = M.period('how much did i spend on food last month', NOW);
  assert.deepEqual([p.from, p.to, p.prior.from, p.prior.to], ['2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31']);
  p = M.period('this month', NOW);
  assert.deepEqual([p.from, p.to, p.prior.from, p.prior.to], ['2026-10-01', '2026-10-12', '2026-09-01', '2026-09-12']);
  p = M.period('what did i spend', NOW);
  assert.equal(p.from, '2026-10-01', 'no period named: this month so far');
  p = M.period('this week', NOW);
  assert.deepEqual([p.from, p.to, p.prior.from, p.prior.to], ['2026-10-12', '2026-10-12', '2026-10-05', '2026-10-05']);
  p = M.period('last week', NOW);
  assert.deepEqual([p.from, p.to, p.prior.from, p.prior.to], ['2026-10-05', '2026-10-11', '2026-09-28', '2026-10-04']);
  p = M.period('in august', NOW);
  assert.deepEqual([p.from, p.to, p.prior.from, p.prior.to], ['2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31']);
  p = M.period('in november', NOW);
  assert.deepEqual([p.from, p.to], ['2025-11-01', '2025-11-30'], 'a month after this one is last year\'s');
  p = M.period('last 30 days', NOW);
  assert.deepEqual([p.from, p.to, p.prior.from, p.prior.to], ['2026-09-13', '2026-10-12', '2026-08-14', '2026-09-12']);
  p = M.period('last month', '2026-03-31T12:00:00Z');
  assert.deepEqual([p.from, p.to, p.prior.from, p.prior.to], ['2026-02-01', '2026-02-28', '2026-01-01', '2026-01-31']);
  p = M.period('this month', '2026-03-31T12:00:00Z');
  assert.equal(p.prior.to, '2026-02-28', 'the same day last month is clamped to the month\'s end');
  p = M.period('last month', '2026-01-15T12:00:00Z');
  assert.deepEqual([p.from, p.prior.from], ['2025-12-01', '2025-11-01']);
});

test('periods follow the person\'s zone: 11 PM in Los Angeles on Sep 30 is still September', () => {
  const p = M.period('this month', '2026-10-01T06:00:00Z', 'America/Los_Angeles');
  assert.equal(p.from, '2026-09-01');
  assert.equal(p.to, '2026-09-30');
});

test('spend: food last month = groceries + restaurants + delivery, compared with the month before, top 3, source (S16-02)', () => {
  const r = M.spend(TX, 'how much did i spend on food last month', NOW);
  assert.match(r, /^You spent \$192\.50 on food last month \(Sep 1-30\): \$150\.00 groceries, \$12\.50 restaurants, \$30\.00 delivery\./);
  assert.match(r, /That's \$57\.50 more than in August, when it was \$135\.00\./);
  assert.match(r, /Top: Trader Joe's \$90\.00, Whole Foods \$60\.00, Uber Eats \$30\.00\./);
  assert.match(r, /From your linked accounts, transactions through Oct 6, 2026, as of Oct 12, 8:00 AM UTC\. Transfers, card payments and pending charges are left out\.$/);
  assert.deepEqual(check(item('S16-02').checks, { reply: r }), []);
});

test('spend: less than, and the same as', () => {
  const less = M.spend([tx('2026-08-03', -9000, 'KROGER'), tx('2026-09-03', -4000, 'KROGER')], 'groceries last month', NOW);
  assert.match(less, /That's \$50\.00 less than in August, when it was \$90\.00\./);
  const same = M.spend([tx('2026-08-03', -4000, 'KROGER'), tx('2026-09-03', -4000, 'KROGER')], 'groceries last month', NOW);
  assert.match(same, /That's the same as in August: \$40\.00\./);
});

test('spend: an unknown merchant is never guessed into a category; how much was uncategorized is said', () => {
  const r = M.spend(TX, 'how much did i spend on food last month', NOW);
  assert.doesNotMatch(r, /Blue Heron/, 'the hardware store is not food');
  // Uncategorized in September: rent 1,850 + hardware 40 (transfer and card payment are not spending).
  assert.match(r, /\$1,890\.00 of your other spending in that period didn't match a category I know, so I didn't count any of it as food\./);
  assert.equal(M.classify('BLUE HERON HARDWARE'), null);
  assert.equal(M.classify('JOES PLACE'), null);
  assert.equal(M.classify('UBER *EATS').group, 'delivery');
  assert.equal(M.classify('UBER *TRIP').group, 'transport');
  assert.equal(M.classify('COSTCO GAS #123').group, 'gas');
  assert.equal(M.classify('T-MOBILE AUTOPAY'), null, 'Mobil the gas brand is not T-Mobile');
  assert.equal(M.classify('AMAZON PRIME*1A2B').group, 'subscriptions');
  assert.equal(M.classify('AMZN MKTP US').group, 'shopping');
});

test('spend: transfers, card payments and pending charges are left out of every total', () => {
  const r = M.spend(TX.concat([tx(null, -99900, 'TRADER JOE S #552', { is_pending: true, posted_on: null })]), 'how much did i spend last month', NOW);
  // September spending: 1850 + 90 + 12.50 + 30 + 40 + 60 + 45 + 17.99 = 2145.49; the 500 transfer and the 200 card payment are out.
  assert.match(r, /^You spent \$2,145\.49 last month \(Sep 1-30\)\./);
  assert.match(r, /Top: Mock Property Management Rent \$1,850\.00, Trader Joe's \$90\.00, Whole Foods \$60\.00\./);
  const thisMonth = M.spend(TX.concat([tx(null, -99900, 'TRADER JOE S #552', { is_pending: true, posted_on: null })]), 'groceries this month', NOW);
  assert.match(thisMonth, /^You spent \$120\.00 on groceries this month so far \(Oct 1-12\)\./, 'the pending $999 is not counted');
  assert.match(thisMonth, /That's \$30\.00 less than at the same point last month \(Sep 1-12\), when it was \$150\.00\./, 'Trader Joe\'s 90 + Whole Foods 60 by Sep 12');
});

test('spend: gas, subscriptions, shopping, transport categories and a named merchant', () => {
  assert.match(M.spend(TX, 'how much did i spend on gas in september', NOW), /^You spent \$45\.00 on gas in September \(Sep 1-30\)\./);
  assert.match(M.spend(TX, 'how much have i spent on subscriptions this month', NOW), /^You spent \$17\.99 on subscriptions this month so far/);
  assert.match(M.spend([tx('2026-10-02', -1500, 'UBER *TRIP'), tx('2026-10-03', -900, 'LYFT RIDE')], 'what did i spend on rides this month', NOW), /^You spent \$24\.00 on transport/);
  assert.match(M.spend([tx('2026-10-02', -2599, 'AMZN MKTP US*2K3'), tx('2026-10-03', -1000, 'TARGET 0001')], 'how much did i spend on shopping', NOW), /^You spent \$35\.99 on shopping this month so far/);
  const sb = M.spend(TX, 'how much did i spend at starbucks last month', NOW);
  assert.match(sb, /^You spent \$12\.50 at Starbucks last month \(Sep 1-30\), 1 charge\./);
  assert.match(sb, /That's \$12\.50 more than in August, when it was \$0\.00\./);
});

test('spend: a word that is neither a category nor any merchant is said, never guessed; the period total still comes from rows', () => {
  const r = M.spend(TX, 'how much did i spend on concerts last month', NOW);
  assert.match(r, /^No charge in your linked accounts mentions "concerts", and it isn't a category I track, so I won't guess\.\nAll your spending last month \(Sep 1-30\): \$2,145\.49\./);
  assert.match(r, SOURCE);
});

test('spend: history that does not reach the asked period says so instead of a $0.00 total; one that does not reach the prior period says so instead of comparing; a partial one is compared with a caveat', () => {
  const short = [tx('2026-10-02', -4000, 'KROGER')];
  const r = M.spend(short, 'groceries last month', NOW);
  // History that starts after the asked period: nothing to add up, said plainly, never "$0.00" (overnight G2 finding).
  assert.match(r, /^Your linked transactions start Oct 2, 2026, so I can't see last month \(Sep 1-30\): there's nothing from then to add up\./);
  assert.doesNotMatch(r, /\$0\.00/);
  const noPrior = M.spend([tx('2026-09-03', -4000, 'KROGER')], 'groceries last month', NOW);
  assert.match(noPrior, /^You spent \$40\.00 on groceries last month/);
  assert.match(noPrior, /Your linked transactions start Sep 3, 2026, so there's nothing to compare with in August yet\./);
  const partial = M.spend([tx('2026-08-20', -4000, 'KROGER'), tx('2026-09-10', -5000, 'KROGER')], 'groceries last month', NOW);
  assert.match(partial, /That's \$10\.00 more than in August, when it was \$40\.00\. Your linked transactions start Aug 20, 2026, so that earlier total may be missing a few days\./);
  assert.match(M.spend([], 'how much did i spend', NOW), /^I don't see any posted transactions in your linked accounts yet/);
});

test('checkup: cash now, in vs out this month so far vs the same day last month, one sentence of what changed, cited (S16-14)', () => {
  const r = M.checkup(ACCOUNTS, TX, NOW);
  assert.match(r, /^Cash: \$6,234\.56 across 2 accounts, as of Oct 12, 7:30 AM UTC\.\n/);
  assert.match(r, /This month so far \(Oct 1-12\): \$2,500\.00 in, \$204\.99 out\.\n/);
  // Sep 1-12: rent 1850, TJ 90, Starbucks 12.50, Uber Eats 30, hardware 40, Whole Foods 60 = 2082.50; no pay yet.
  assert.match(r, /Same point last month: \$0\.00 in, \$2,082\.50 out\.\n/);
  assert.match(r, /You've spent \$1,877\.51 less than at this point last month, mostly Mock Property Management Rent \(-\$1,850\.00\)\./);
  assert.match(r, /From your linked accounts, transactions through Oct 6, 2026, as of Oct 12, 8:00 AM UTC\./);
  assert.ok(r.length <= 900);
  assert.deepEqual(check(item('S16-14').checks, { reply: r }), []);
});

test('checkup: more than last month names the biggest increase by category', () => {
  const r = M.checkup([acct({})], [tx('2026-09-02', -2000, 'CHIPOTLE 1'), tx('2026-10-02', -9000, 'CHIPOTLE 1'), tx('2026-10-03', -1000, 'KROGER')], NOW);
  assert.match(r, /You've spent \$80\.00 more than at this point last month, mostly restaurants \(\+\$70\.00\)\./);
});

test('did it go through: posted with its date and account (S16-16)', () => {
  const r = M.didItGoThrough(TX.concat([tx('2026-10-01', -185000, 'MOCK PROPERTY MANAGEMENT RENT')]), 'did rent go through', NOW, { accounts: ACCOUNTS });
  assert.match(r, /^Yes, it posted: \$1,850\.00 to Mock Property Management Rent on Oct 1 \(Mock Bank Everyday Checking\)\./);
  assert.match(r, SOURCE);
  assert.deepEqual(check(item('S16-16').checks, { reply: r }), []);
});

test('did it go through: a pending charge is pending, not posted', () => {
  const r = M.didItGoThrough(TX.concat([tx(null, -185000, 'MOCK PROPERTY MANAGEMENT RENT', { is_pending: true, fetched_at: '2026-10-11T12:00:00Z' })]), 'did rent go through', NOW);
  assert.match(r, /^It's pending: \$1,850\.00 to Mock Property Management Rent, first seen Oct 11\. It hasn't posted yet/);
  assert.deepEqual(check(item('S16-16').checks, { reply: r }), []);
});

test('did it go through: not yet, with the date searched from and the last one that did post', () => {
  const r = M.didItGoThrough(TX, 'did rent go through', NOW);
  assert.match(r, /^Not yet: no rent charge has posted since Sep 11\. The last one posted Sep 1, 2026: \$1,850\.00 to Mock Property Management Rent\./);
  assert.match(r, /say "did <that name> go through"/);
  assert.deepEqual(check(item('S16-16').checks, { reply: r }), []);
  const none = M.didItGoThrough(TX, 'did my spotify payment go through', NOW);
  assert.match(none, /^Not yet: no spotify charge has posted since Sep 11\.\n/);
});

test('did it go through: a named merchant and a paycheck', () => {
  assert.match(M.didItGoThrough(TX, 'did my netflix payment go through', NOW), /^Yes, it posted: \$17\.99 to Netflix on Oct 5\./);
  assert.match(M.didItGoThrough(TX, 'did my paycheck come in', NOW), /^Yes, it posted: \$2,500\.00 from Mock Employer Payroll on Oct 1\./);
  assert.equal(M.goThroughTarget('did the payment to sam go through').label, 'sam');
  assert.equal(M.goThroughTarget('what is rent'), null);
  assert.equal(M.goThroughTarget('did it go through'), null);
});

test('every answer is plain text with a source and as-of line, no NaN or undefined, no question back', () => {
  const answers = [
    M.balance(ACCOUNTS, NOW), M.spend(TX, 'food last month', NOW), M.spend(TX, 'how much did i spend this week', NOW), M.spend(TX, 'gas in august', NOW),
    M.checkup(ACCOUNTS, TX, NOW), M.didItGoThrough(TX, 'did rent go through', NOW), M.didItGoThrough(TX, 'did my netflix go through', NOW),
  ];
  for (const a of answers) {
    assert.equal(typeof a, 'string');
    assert.match(a, /From your linked accounts/, a);
    assert.match(a, /as of [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M/, a);
    assert.doesNotMatch(a, /NaN|undefined|null|\[object/, a);
    assert.doesNotMatch(a, /\?/, a);
    assert.doesNotMatch(a, /\b(?:should (?:buy|sell|invest)|guarantee)/i, a);
  }
});

test('non-USD rows are never added into dollars', () => {
  const r = M.spend([tx('2026-10-02', -4000, 'KROGER'), tx('2026-10-03', -99999, 'KROGER', { currency: 'EUR' })], 'groceries this month', NOW);
  assert.match(r, /^You spent \$40\.00 on groceries/);
});

// Found building the MONEY-ANSWERS depth packet (2026-10-12): with history starting Oct 10, "how am I doing" said
// "This month so far (Oct 1-12): $0.00 in" as if Oct 1-9 were known; spend already said its rows start later.
test('checkup: history that starts inside this month says so, never a bare total for days it cannot see', () => {
  const r = M.checkup([acct({})], [tx('2026-10-10', -5000, 'TRADER JOE S #552'), tx('2026-10-11', -2000, 'SHELL OIL 57444')], NOW);
  assert.match(r, /\nThis month so far \(Oct 1-12\): \$0\.00 in, \$70\.00 out\. Your linked transactions start Oct 10, 2026, so this covers only from then\.\n/);
  assert.doesNotMatch(M.checkup(ACCOUNTS, TX, NOW), /covers only from then/, 'history from August covers all of this month');
});

test("a refund follow-up looks for the credit, never a charge (the follow-up the price-drop, airline and escrow replies invite)", () => {
  const MA = require("../packages/domain/80-money-answers.js");
  const now = Date.parse("2026-10-12T15:00:00Z");
  const r = (d, c, m) => ({ account_id: "mock-card", provider_transaction_id: `mock-${d}-${c}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T08:00:00Z" });
  const rows = [r("2026-10-03", -9630, "TARGET 00012345"), r("2026-10-09", 2000, "TARGET 00012345"), r("2026-09-28", -48900, "DELTA AIR LINES"), r("2026-10-08", 48900, "DELTA AIR LINES")];
  assert.match(MA.didItGoThrough(rows, "did my target credit post?", now), /^Yes, it posted: \$20\.00 from Target on Oct 9/);
  assert.match(MA.didItGoThrough(rows, "did the delta refund post?", now), /^Yes, it posted: \$489\.00 from Delta Air Lines on Oct 8/);
  // Only the charge so far: not yet, said as a refund or credit, never "charge".
  assert.match(MA.didItGoThrough(rows.slice(0, 1), "did the target refund come through", now), /^Not yet: no target refund or credit has posted since/);
  assert.match(MA.didItGoThrough(rows, "did my refund come in?", now), /^Which refund\? Name the store, airline or company/);
  // A credit card payment or a credit union transfer is not a refund.
  assert.equal(MA.goThroughTarget("did my credit card payment go through").refund, undefined);
  assert.equal(MA.goThroughTarget("did my credit union transfer go through").refund, undefined);
});

// spendRows (the rows behind a total, used to recheck one the person disputes) and spend() must never disagree: the same
// period, filters and category rules give the same total for every kind of ask.
test('spendRows gives the same total spend() reports, for categories, merchants, all spending and category rules', () => {
  const asks = ['how much did i spend on groceries last month', 'how much did i spend on food in september', 'what did i spend at trader joes in september', 'how much have i spent this month', 'how much did i spend on gas in october', 'how much did i spend at netflix this month', 'how much did i spend on groceries in august'];
  const rules = [{ term: 'blue heron hardware', group: 'groceries' }];
  for (const r of [null, rules]) for (const a of asks) {
    const said = /^You spent (\$[\d,]+\.\d\d)/.exec(M.spend(TX, a, NOW, { tz: 'America/New_York', rules: r }));
    const d = M.spendRows(TX, a, NOW, { tz: 'America/New_York', rules: r });
    assert.ok(said, a);
    assert.equal(M.money(d.total), said[1], `${a} ${r ? '(with a rule)' : ''}`);
    assert.equal(d.rows.reduce((s, x) => s - x.amount_cents, 0), d.total, a);
  }
});
