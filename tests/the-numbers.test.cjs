// The numbers (packages/domain/86-the-numbers.js, capability list section 1, overnight E1-E7): safe to spend, upcoming,
// runway, affordability, net worth, the 90-day forecast and "show me the math". Every account and transaction row here
// is MOCK test data in the database's own shapes; nothing is a real account. The module is loaded with the ledger and
// the monitors exactly as the chat's router bundle loads them, so merchant keys match production.
// Check: node --test tests/the-numbers.test.cjs
const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({});
vm.runInContext(['32-merchant-label.js', '33-agent-monitors.js', '57-agent-ledger.js', '80-money-answers.js', '86-the-numbers.js'].map((f) => fs.readFileSync(path.join(root, 'packages/domain', f), 'utf8')).join('\n') + '\nthis.N = TheNumbers; this.MA = MoneyAnswers;', ctx);
const { N, MA } = ctx;
const plain = (x) => JSON.parse(JSON.stringify(x)); // values from the vm context, compared with deepEqual

const NOW = '2026-10-12T15:05:00Z'; // a Monday
const SYNC = '2026-10-12T08:00:00Z';
const acct = (o) => Object.assign({ account_id: 'mock-chk', name: 'Everyday Checking', institution: 'Mock Bank', account_kind: 'checking', balance_cents: 400000, available_cents: 395000, balance_as_of: '2026-10-12T09:00:00Z', fetched_at: SYNC, status: 'active' }, o);
let n = 0;
const tx = (posted_on, amount_cents, merchant_raw, o) => Object.assign({ account_id: 'mock-chk', provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, fetched_at: SYNC }, o);
const ACCOUNTS = [
  acct({}),
  acct({ account_id: 'mock-sav', name: 'High Yield Savings', institution: 'Mock Savings Co', account_kind: 'savings', balance_cents: 200000, available_cents: 200000, balance_as_of: '2026-10-12T07:30:00Z' }),
  acct({ account_id: 'mock-card', name: 'Rewards Card', account_kind: 'credit', balance_cents: -51230, available_cents: null }),
  acct({ account_id: 'mock-eur', name: 'Euro Account', account_kind: 'checking', currency: 'EUR', balance_cents: 100000, available_cents: 100000 }),
  acct({ account_id: 'mock-ira', name: 'Mock Brokerage IRA', institution: 'Mock Brokerage', account_kind: 'investment', balance_cents: 1250000, available_cents: null }),
  acct({ account_id: 'mock-loan', name: 'Car Loan', account_kind: 'loan', balance_cents: -820000, available_cents: null }),
  acct({ account_id: 'mock-joint', name: 'Joint Account', account_kind: 'unknown', balance_cents: 30000, available_cents: 30000 }),
];
function history() {
  const T = [];
  for (const d of ['2026-07-10', '2026-07-24', '2026-08-07', '2026-08-21', '2026-09-04', '2026-09-18', '2026-10-02']) T.push(tx(d, 250000, 'MOCK EMPLOYER PAYROLL'));
  for (const d of ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']) T.push(tx(d, -185000, 'MOCK PROPERTY MGMT RENT'));
  for (const d of ['2026-07-14', '2026-08-14', '2026-09-14']) T.push(tx(d, -4500, 'MOCK FITNESS CLUB'));
  for (const d of ['2026-07-16', '2026-08-16', '2026-09-16']) T.push(tx(d, -12000, 'MOCK MUTUAL INSURANCE'));
  for (const d of ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05']) T.push(tx(d, -1799, 'NETFLIX.COM'));
  for (const d of ['2026-07-20', '2026-08-20', '2026-09-20']) T.push(tx(d, -8900, 'COMCAST XFINITY'));
  T.push(tx('2024-11-03', -9999, 'MOCK CLOUD STORAGE ANNUAL'), tx('2025-11-03', -9999, 'MOCK CLOUD STORAGE ANNUAL'));
  const groceries = [6140, 8325, 5710, 9180, 7455, 6620, 8890, 7015, 5560, 9930, 6475, 7740, 8105];
  groceries.forEach((c, i) => T.push(tx(new Date(Date.UTC(2026, 6, 13 + 7 * i)).toISOString().slice(0, 10), -c, 'TRADER JOE S #552')));
  for (const d of ['2026-09-08', '2026-09-23', '2026-10-06']) T.push(tx(d, -650, 'MOCK CORNER CAFE'));
  T.push(tx('2026-09-10', -50000, 'ONLINE TRANSFER TO SAV 9921'), tx('2026-09-25', -30000, 'CREDIT CARD PAYMENT THANK YOU'));
  T.push(tx('2026-10-03', -4200, 'MOCK LONDON SHOP', { currency: 'GBP' }), tx(null, -2100, 'MOCK DINER', { is_pending: true }));
  return T;
}
const TX = history();
const SOURCE = /^From your linked accounts\b.*\.$/;
const lastLine = (s) => s.split('\n').slice(-1)[0];

// ---- E1 safe to spend ----
test('E1: safe to spend is cash now minus the bills due on or before payday, total and per day, with source', () => {
  const r = N.safeToSpend(ACCOUNTS, TX, NOW, {});
  // cash: checking at its available $3,950.00 (a pending charge is out) + savings $2,000.00; the card, the euro
  // account, the IRA, the loan and the untyped joint account are not cash.
  assert.equal(r.cash_cents, 595000);
  assert.equal(r.payday, '2026-10-16', 'every 14 days from Oct 2');
  assert.deepEqual(plain(r.bills.map((b) => [b.on, b.name, b.amount_cents])), [['2026-10-14', 'Mock Fitness Club', 4500], ['2026-10-16', 'Mock Mutual Insurance', 12000]]);
  assert.equal(r.bills_cents, 16500);
  assert.equal(r.safe_cents, 578500);
  assert.equal(r.days, 4);
  assert.equal(r.per_day_cents, 144625);
  assert.match(r.text, /^Safe to spend until payday \(Oct 16\): \$5,785\.00, about \$1,446\.25 a day for 4 days\./);
  assert.match(r.text, /\$5,950\.00 in cash minus \$165\.00 of bills due by then: Mock Fitness Club \$45\.00 \(Oct 14\), Mock Mutual Insurance \$120\.00 \(Oct 16\)\./);
  assert.match(r.text, /Pay: \$2,500\.00 every 14 days from Mock Employer Payroll \(read from 7 deposits, the last on Oct 2\)\./);
  assert.match(r.text, /Euro Account \(1,000\.00 EUR\) is in another currency, so it isn't added into dollars\./);
  assert.match(r.text, /1 transaction in other currencies isn't counted\./);
  assert.match(lastLine(r.text), /^From your linked accounts \(Mock Bank, Mock Savings Co\): balances as of Oct 12, 7:30 AM UTC; transactions through Oct 6, 2026, synced Oct 12, 8:00 AM UTC\.$/);
  assert.ok(!/\?/.test(r.text), 'an answer, not a question back');
});

test('E1: no payday found: 30 days, said so', () => {
  const r = N.safeToSpend(ACCOUNTS, TX.filter((t) => !/PAYROLL/.test(t.merchant_raw)), NOW, {});
  assert.equal(r.payday_found, false);
  assert.equal(r.days, 30);
  assert.equal(r.until, '2026-11-11');
  assert.match(r.text, /^Safe to spend over the next 30 days \(to Nov 11\):/);
  assert.match(r.text, /I couldn't find a regular paycheck in your deposits, so this counts the next 30 days instead of until payday\./);
  // Bills to Nov 11: gym Oct 14, insurance Oct 16, Comcast Oct 20, rent Nov 1, the cloud renewal Nov 3, Netflix Nov 5.
  assert.equal(r.bills_cents, 4500 + 12000 + 8900 + 185000 + 9999 + 1799);
});

test('E1: bills over cash: $0 safe, the shortfall said, never a negative per day', () => {
  const poor = [acct({ balance_cents: 10000, available_cents: 10000 })];
  const r = N.safeToSpend(poor, TX, NOW, {});
  assert.equal(r.safe_cents, 0);
  assert.equal(r.raw_cents, 10000 - 16500);
  assert.equal(r.per_day_cents, 0);
  assert.match(r.text, /^Safe to spend until payday \(Oct 16\): \$0\.00\. Bills due by then come to \$165\.00, \$65\.00 more than your \$100\.00 in cash\./);
});

test('E1: a stale balance is said; no cash account says there is no number', () => {
  const stale = [acct({ balance_as_of: '2026-10-09T09:00:00Z' }), ACCOUNTS[1]];
  assert.match(N.safeToSpend(stale, TX, NOW, {}).text, /Heads up: Mock Bank Everyday Checking was last updated Oct 9, 9:00 AM UTC, 3 days ago, so its real balance may have changed\./);
  const r = N.safeToSpend([ACCOUNTS[2], ACCOUNTS[4]], TX, NOW, {});
  assert.equal(r.safe_cents, null);
  assert.match(r.text, /^Safe to spend: I can't work it out\. No checking or savings balance is linked/);
  assert.match(lastLine(r.text), SOURCE);
});

test('E1: a bill a few days late is still expected (today); a pending charge for a bill is not counted twice; a stopped one is left out', () => {
  const extra = [tx('2026-07-09', -6500, 'MOCK WIRELESS'), tx('2026-08-09', -6500, 'MOCK WIRELESS'), tx('2026-09-09', -6500, 'MOCK WIRELESS'),
    tx('2026-04-11', -2000, 'MOCK OLD GYM'), tx('2026-05-11', -2000, 'MOCK OLD GYM'), tx('2026-06-11', -2000, 'MOCK OLD GYM')];
  const late = N.safeToSpend(ACCOUNTS, TX.concat(extra), NOW, {});
  const w = late.bills.find((b) => b.name === 'Mock Wireless');
  assert.ok(w && w.on === '2026-10-12' && w.late && w.expected === '2026-10-09', 'Oct 9 not posted yet: expected, counted today');
  assert.ok(!late.bills.some((b) => /Old Gym/.test(b.name)), 'nothing since June: stopped');
  assert.match(late.text, /Mock Wireless \$65\.00 \(Oct 12\)/);
  const pend = N.safeToSpend(ACCOUNTS, TX.concat(extra, [tx(null, -6500, 'MOCK WIRELESS', { is_pending: true })]), NOW, {});
  assert.ok(!pend.bills.some((b) => b.name === 'Mock Wireless'), 'already pending, so already out of the available balance');
  assert.equal(late.bills_cents - pend.bills_cents, 6500);
});

// ---- E2 upcoming ----
test('E2: every bill, payday and renewal in the next 30 days, dated, totals equal their parts', () => {
  const r = N.upcoming(ACCOUNTS, TX, NOW, {});
  assert.deepEqual(plain(r.items.map((i) => [i.on, i.kind, i.amount_cents])), [
    ['2026-10-14', 'bill', 4500], ['2026-10-16', 'payday', 250000], ['2026-10-16', 'bill', 12000], ['2026-10-20', 'bill', 8900],
    ['2026-10-30', 'payday', 250000], ['2026-11-01', 'bill', 185000], ['2026-11-03', 'renewal', 9999], ['2026-11-05', 'bill', 1799]]);
  assert.equal(r.out_cents, 4500 + 12000 + 8900 + 185000 + 9999 + 1799);
  assert.equal(r.in_cents, 500000);
  assert.match(r.text, /^Coming up in the next 30 days \(Oct 12-Nov 11\): \$2,221\.98 out in 6 bills, \$5,000\.00 in from 2 paydays\./);
  assert.match(r.text, /- Nov 3: Mock Cloud Storage Annual, \$99\.99 \(yearly renewal\)/);
  assert.match(r.text, /- Oct 16: payday, \$2,500\.00 from Mock Employer Payroll \(every 14 days\)/);
  assert.ok(!/Trader Joe|Corner Cafe/.test(r.text), 'variable spending is not a bill');
  assert.match(lastLine(r.text), /^From your linked accounts: transactions through Oct 6, 2026, synced Oct 12, 8:00 AM UTC\.$/);
});

// ---- E3 runway ----
test('E3: runway is cash over the average daily outflow of the last 90 days, whole days, transfers and card payments out', () => {
  const r = N.runway(ACCOUNTS, TX, NOW, {});
  const from = '2026-07-15';
  // Oracle: the same rule written out by hand over the fixture.
  const spend = TX.filter((t) => !t.is_pending && !t.currency && t.posted_on >= from && t.posted_on <= '2026-10-12' && t.amount_cents < 0 && !/TRANSFER|CARD PAYMENT/.test(t.merchant_raw)).reduce((a, t) => a - t.amount_cents, 0);
  assert.equal(r.spend_cents, spend);
  assert.equal(r.basis_days, 90);
  assert.equal(r.days, Math.floor(595000 * 90 / spend));
  assert.equal(r.per_day_cents, Math.round(spend / 90));
  assert.match(r.text, new RegExp(`^Runway: about ${r.days} days\\. Your \\$5,950\\.00 in cash lasts to around [A-Z][a-z]{2} \\d+(, 2027)? at your average spending of \\$[\\d,]+\\.\\d\\d a day over the last 90 days \\(Jul 15-Oct 12\\), if no money came in\\.`));
  assert.match(lastLine(r.text), SOURCE);
});

test('E3: short history says so; under 14 days or no spending gives no number', () => {
  const short = N.runway(ACCOUNTS, TX.filter((t) => t.posted_on && t.posted_on >= '2026-09-14'), NOW, {});
  assert.equal(short.basis_days, 29);
  assert.match(short.text, /since your transactions start \(Sep 14-Oct 12\)/);
  assert.match(short.text, /Your linked transactions start Sep 14, so that's 29 days of history, not 90\./);
  const tiny = N.runway(ACCOUNTS, TX.filter((t) => t.posted_on && t.posted_on >= '2026-10-05'), NOW, {});
  assert.equal(tiny.days, null);
  assert.match(tiny.text, /^Runway: I can't measure it yet\. Your transactions cover only 8 days, and I need at least 14/);
  const none = N.runway(ACCOUNTS, TX.filter((t) => t.amount_cents > 0), NOW, {});
  assert.equal(none.days, null);
  assert.match(none.text, /^Runway: no spending posted since Jul 15/);
});

// ---- E4 affordability ----
test('E4: yes now when it fits in safe to spend, with what is left', () => {
  const r = N.afford(ACCOUNTS, TX, 'can i afford $600', NOW, {});
  assert.equal(r.answer, 'yes');
  assert.equal(r.left_cents, 578500 - 60000);
  assert.match(r.text, /^For \$600\.00 today: yes\. It fits in your safe to spend of \$5,785\.00 until payday \(Oct 16\), leaving \$5,185\.00 \(about \$1,296\.25 a day\)\./);
  assert.match(lastLine(r.text), SOURCE);
});

test('E4: not now, and the earliest day it fits, counting bills, paychecks and everyday spending', () => {
  const r = N.afford(ACCOUNTS, TX, 'can i afford $7,000', NOW, {});
  assert.equal(r.answer, 'no');
  assert.ok(r.on >= '2026-10-16', `on or after the payday: ${r.on}`);
  assert.match(r.text, /^For \$7,000\.00 today: not on these numbers\. Your safe to spend until payday \(Oct 16\) is \$5,785\.00\.\nThe earliest day it fits is [A-Z][a-z]{2} \d+, counting your repeating bills and paychecks and everyday spending at your 90-day average \(\$[\d.]+ a day\)\./);
  const never = N.afford(ACCOUNTS, TX, 'can i afford $90,000', NOW, {});
  assert.equal(never.on, null);
  assert.match(never.text, /It doesn't fit on any day in the next 90 days/);
});

test('E4: a window in the words: next month, by a date, past the forecast', () => {
  const r = N.afford(ACCOUNTS, TX, 'can i afford a $600 trip next month', NOW, {});
  assert.equal(r.window.from, '2026-11-01');
  assert.equal(r.window.to, '2026-11-30');
  assert.equal(r.answer, 'yes');
  assert.equal(r.on, '2026-11-01');
  assert.match(r.text, /^For \$600\.00 next month \(Nov 1-30\): yes, from Nov 1\. Spent then, your balance stays at least \$[\d,]+\.\d\d through Jan 10, 2027/);
  assert.equal(plain(N.parseWindow('by dec 1', '2026-10-12')).to, '2026-12-01');
  assert.equal(plain(N.parseWindow('on 3/1', '2026-10-12')).from, '2027-03-01');
  const far = N.afford(ACCOUNTS, TX, 'can i afford $600 in june', NOW, {});
  assert.equal(far.answer, null);
  assert.match(far.text, /that's past the 90 days I forecast \(to Jan 10, 2027\), so I won't guess\./);
});

test('E4: amounts are read exactly, in cents', () => {
  assert.equal(N.parseAmount('can i afford $600'), 60000);
  assert.equal(N.parseAmount('can i afford $1,250.5 shoes'), 125050);
  assert.equal(N.parseAmount('can i afford $2k'), 200000);
  assert.equal(N.parseAmount('can i afford 45 dollars'), 4500);
  assert.equal(N.parseAmount('can i afford $19.99'), 1999);
  assert.equal(N.parseAmount('can i afford a house'), null);
  assert.equal(N.parseAmount('can i afford $0'), null);
});

// ---- E5 net worth ----
test('E5: net worth is owned minus owed; unknown types and other currencies listed apart, never guessed', () => {
  const r = N.netWorth(ACCOUNTS, NOW, {});
  assert.equal(r.owned_cents, 400000 + 200000 + 1250000, 'balances, not available, for net worth');
  assert.equal(r.owed_cents, 51230 + 820000);
  assert.equal(r.net_cents, 1850000 - 871230);
  assert.deepEqual(plain(r.apart).sort(), ['mock-eur', 'mock-joint']);
  assert.match(r.text, /^Net worth: \$9,787\.70\. That's \$18,500\.00 you own minus \$8,712\.30 you owe, across 5 accounts\./);
  assert.match(r.text, /- Mock Bank Euro Account \(1,000\.00 EUR, another currency, not added into dollars\)/);
  assert.match(r.text, /- Mock Bank Joint Account \(type not set, so I don't know if it's owned or owed\)/);
  assert.match(r.text, /net worth over time isn't tracked yet/);
  assert.match(lastLine(r.text), /^From your linked accounts \(Mock Bank, Mock Savings Co, Mock Brokerage\): balances as of Oct 12, 7:30 AM UTC\.$/);
});

test('E5: a card with a credit in the person\'s favor adds; no countable account says so', () => {
  const r = N.netWorth([ACCOUNTS[0], acct({ account_id: 'c2', name: 'Store Card', account_kind: 'credit', balance_cents: 1500, available_cents: null })], NOW, {});
  assert.equal(r.favor_cents, 1500);
  assert.equal(r.net_cents, 400000 + 1500);
  assert.match(r.text, /- Mock Bank Store Card: \$15\.00 in your favor/);
  const none = N.netWorth([ACCOUNTS[3], ACCOUNTS[6]], NOW, {});
  assert.equal(none.counted, 0);
  assert.match(none.text, /^Net worth: I can't add it up\./);
});

// ---- E6 forecast ----
test('E6: 90 days on repeating bills and paychecks only, with the assumptions listed', () => {
  const r = N.forecast(ACCOUNTS, TX, NOW, {});
  assert.equal(r.start_cents, 595000);
  assert.equal(r.daily[90].balance_cents, r.start_cents + r.in_cents - r.out_cents);
  assert.deepEqual(plain(r.points.map((p) => [p.days, p.on])), [[30, '2026-11-11'], [60, '2026-12-11'], [90, '2027-01-10']]);
  assert.match(r.text, /^90-day forecast, from your repeating bills and paychecks only: \$[\d,]+\.\d\d on Nov 11 \(30 days\), \$[\d,]+\.\d\d on Dec 11 \(60 days\), \$[\d,]+\.\d\d on Jan 10, 2027 \(90 days\)\. Lowest: /);
  assert.match(r.text, /\nAssumptions:\n- Starts from \$5,950\.00 in cash \(Mock Bank Everyday Checking, Mock Savings Co High Yield Savings\)\.\n- Paychecks: \$2,500\.00 every 14 days from Mock Employer Payroll/);
  assert.match(r.text, /- Bills: .*Mock Property Mgmt Rent \$1,850\.00 monthly/);
  assert.match(r.text, /- Not included: everyday spending that doesn't repeat \(it averaged \$[\d.]+ a day over the last 90 days, about \$[\d,]+\.\d\d over 90 days\), one-off bills, and anything new\./);
  assert.ok(r.points.every((p) => p.balance_cents === r.daily[p.days].balance_cents));
  assert.ok(r.daily.every((d) => d.balance_cents >= r.low.balance_cents));
  assert.match(lastLine(r.text), SOURCE);
});

// ---- E7 show the math ----
test('E7: every answer shows its inputs and arithmetic line by line, ending with the source', () => {
  for (const kind of ['safe', 'upcoming', 'runway', 'networth', 'forecast']) {
    const r = N.answer(kind, ACCOUNTS, TX, '', NOW, {});
    const m = N.showMath(ACCOUNTS, TX, `show me the math for ${N.LABEL[kind]}`, NOW, {});
    assert.ok(m.startsWith(`The math for ${N.LABEL[kind]}:\n`), kind);
    assert.equal(lastLine(m), lastLine(r.text), `${kind}: the same source line`);
    assert.ok(r.math.length >= 3, kind);
  }
  const s = N.showMath(ACCOUNTS, TX, 'show me the math', NOW, { previous: [{ role: 'assistant', content: N.safeToSpend(ACCOUNTS, TX, NOW, {}).text }] });
  assert.match(s, /\$5,950\.00 - \$165\.00 = \$5,785\.00\n\$5,785\.00 \/ 4 days = \$1,446\.25 a day \(rounded down to the cent; \$0\.00 left over\)/);
  const a = N.showMath(ACCOUNTS, TX, 'how did you get that', NOW, { previous: [{ role: 'assistant', content: 'For $600.00 next month (Nov 1-30): yes, from Nov 1.' }, { role: 'user', content: 'can i afford a $600 trip next month' }] });
  assert.match(a, /^The math for affordability:\nAmount: \$600\.00; window: next month \(Nov 1-30\)/);
  // A bare ask after another kind of answer, or with no history, is not this module's: the model explains its own math.
  assert.equal(N.showMath(ACCOUNTS, TX, 'show me the math', NOW, { previous: [{ role: 'assistant', content: 'You have $1.00 in cash.' }] }), null);
  assert.equal(N.showMath(ACCOUNTS, TX, 'show me the math', NOW, {}), null);
  assert.equal(N.showMath(ACCOUNTS, TX, 'show me the math for can i afford', NOW, {}), N.MATH_MENU, 'named, but no amount was ever asked');
});

// ---- nothing linked ----
test('no linked account: every answer is null (the nothing-linked line answers)', () => {
  for (const accts of [[], [acct({ status: 'disconnected' })]]) {
    for (const kind of ['safe', 'upcoming', 'runway', 'afford', 'networth', 'forecast']) assert.equal(N.answer(kind, accts, TX, 'can i afford $5', NOW, {}), null, kind);
    assert.equal(N.showMath(accts, TX, 'show me the math', NOW, {}), null);
  }
});

// ---- paydays ----
test('paydays: every 14 days vs twice a month vs monthly vs weekly, from the deposits alone', () => {
  const fit = (ds) => plain(N.fitCadence(ds));
  assert.equal(fit(['2026-07-10', '2026-07-24', '2026-08-07', '2026-08-21', '2026-09-04']).cadence, 'biweekly');
  // The 15th and the last day; Aug 15 2026 is a Saturday, paid Friday Aug 14; Oct 31 2026 is a Saturday.
  const semi = fit(['2026-07-15', '2026-07-31', '2026-08-14', '2026-08-31', '2026-09-15', '2026-09-30']);
  assert.equal(semi.cadence, 'semimonthly');
  assert.deepEqual(semi.anchors, [15, 'last']);
  // The 1st and the 15th; Aug 1 and Aug 15 2026 fall on a Saturday, paid the Friday before.
  assert.deepEqual(fit(['2026-06-01', '2026-06-15', '2026-07-01', '2026-07-15', '2026-07-31', '2026-08-14', '2026-09-01', '2026-09-15']).anchors, [1, 15]);
  assert.equal(fit(['2026-07-31', '2026-08-31', '2026-09-30']).cadence, 'monthly');
  assert.equal(fit(['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']).cadence, 'weekly');
  // Every 14 days with one deposit a day early for a holiday: still every 14 days, not twice a month.
  assert.equal(fit(['2026-08-21', '2026-09-04', '2026-09-18', '2026-10-01']).cadence, 'biweekly');
  assert.equal(fit(['2026-08-03', '2026-08-29', '2026-09-03']), null, 'irregular');
  assert.equal(fit(['2026-09-04', '2026-09-18']), null, 'two deposits two weeks apart are not a schedule yet');
});

test('paydays: the next date, paid early before a weekend, and never one already paid early', () => {
  const rows = ['2026-07-15', '2026-07-31', '2026-08-14', '2026-08-31', '2026-09-15', '2026-09-30', '2026-10-15'].map((d) => tx(d, 210000, 'MOCK CO DIR DEP'));
  const r = N.safeToSpend([ACCOUNTS[0]], rows, '2026-10-16T12:00:00Z', {});
  assert.equal(r.payday, '2026-10-30', 'Oct 31 2026 is a Saturday: the Friday before');
  const bi = ['2026-08-21', '2026-09-04', '2026-09-18', '2026-10-01'].map((d) => tx(d, 180000, 'MOCK PAYROLL'));
  assert.equal(N.safeToSpend([ACCOUNTS[0]], bi, NOW, {}).payday, '2026-10-16', 'the schedule, not the holiday-early date, sets the next one');
  // Paid Friday Oct 30 for Saturday Oct 31: on Oct 31 the next payday is Nov 13 (biweekly) / Nov 13 for the 15th.
  const early = ['2026-08-14', '2026-08-31', '2026-09-15', '2026-09-30', '2026-10-15', '2026-10-30'].map((d) => tx(d, 210000, 'MOCK CO DIR DEP'));
  assert.equal(N.safeToSpend([ACCOUNTS[0]], early, '2026-10-31T12:00:00Z', {}).payday, '2026-11-13', 'Nov 15 2026 is a Sunday; Oct 31 was already paid on Oct 30');
});

// ---- calendar edges ----
test('month ends and the leap day 2028-02-29', () => {
  const leapNow = '2028-02-10T12:00:00Z';
  const rows = [tx('2027-12-31', -5000, 'MOCK STORAGE UNIT'), tx('2028-01-31', -5000, 'MOCK STORAGE UNIT'),
    tx('2027-11-29', -2500, 'MOCK PHONE PLAN'), tx('2027-12-29', -2500, 'MOCK PHONE PLAN'), tx('2028-01-29', -2500, 'MOCK PHONE PLAN')];
  const up = N.upcoming([acct({ balance_as_of: '2028-02-10T09:00:00Z' })], rows, leapNow, {});
  assert.deepEqual(plain(up.items.map((i) => [i.on, i.name])), [['2028-02-29', 'Mock Phone Plan'], ['2028-02-29', 'Mock Storage Unit']]);
  const f = N.forecast([acct({ balance_as_of: '2028-02-10T09:00:00Z' })], rows, leapNow, {});
  const storage = f.daily.filter((d) => d.out_cents >= 5000).map((d) => d.on);
  assert.deepEqual(plain(storage), ['2028-02-29', '2028-03-31', '2028-04-30']);
  // Payday on the 15th and the last day: Jan 15 2028 is a Saturday (paid Jan 14); the next after Feb 15 is Feb 29.
  const pay = ['2027-12-15', '2027-12-31', '2028-01-14', '2028-01-31', '2028-02-15'].map((d) => tx(d, 200000, 'MOCK EMPLOYER PAYROLL'));
  const s = N.safeToSpend([acct({ balance_as_of: '2028-02-20T09:00:00Z' })], pay, '2028-02-20T12:00:00Z', {});
  assert.equal(s.payday, '2028-02-29');
  assert.equal(s.days, 9);
  const on = N.safeToSpend([acct({ balance_as_of: '2028-02-27T09:00:00Z' })], pay.concat([tx('2028-02-29', 200000, 'MOCK EMPLOYER PAYROLL')]), '2028-02-29T12:00:00Z', {});
  assert.equal(on.payday, '2028-03-15', 'paid on the leap day itself; the next is the 15th');
  assert.equal(on.days, 15);
});

test('DST in America/Chicago: the person\'s own day, calendar days to payday, the zone in the as-of time', () => {
  const rows = ['2026-09-04', '2026-09-18', '2026-10-02', '2026-10-16', '2026-10-30'].map((d) => tx(d, 250000, 'MOCK EMPLOYER PAYROLL'));
  const a = [acct({ balance_as_of: '2026-11-01T03:00:00Z' })];
  // 2026-11-01T04:30Z is Oct 31, 11:30 PM CDT in Chicago; DST ends at 2 AM that night.
  const chi = N.safeToSpend(a, rows, '2026-11-01T04:30:00Z', { tz: 'America/Chicago' });
  const utc = N.safeToSpend(a, rows, '2026-11-01T04:30:00Z', {});
  assert.equal(chi.today, '2026-10-31');
  assert.equal(utc.today, '2026-11-01');
  assert.equal(chi.payday, '2026-11-13');
  assert.equal(chi.days, 13);
  assert.equal(utc.days, 12);
  assert.match(lastLine(chi.text), /balances as of Oct 31, 10:00 PM CDT/);
  // After the change, the same wall clock is CST; spring forward on Mar 8 2026 counts calendar days too.
  assert.match(lastLine(N.safeToSpend([acct({ balance_as_of: '2026-11-02T15:00:00Z' })], rows, '2026-11-02T16:00:00Z', { tz: 'America/Chicago' }).text), /9:00 AM CST/);
  assert.equal(N.todayIn('2026-03-08T07:30:00Z', 'America/Chicago'), '2026-03-08');
  assert.equal(N.todayIn('2026-03-08T05:30:00Z', 'America/Chicago'), '2026-03-07');
});

// ---- properties: cents never drift ----
function rng(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function scenario(seed) {
  const r = rng(seed), pick = (xs) => xs[Math.floor(r() * xs.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const days = ['2026-10-12', '2026-12-31', '2027-02-28', '2028-02-29', '2028-03-01', '2026-11-01', '2027-03-14'];
  const today = pick(days), nowIso = `${today}T${String(int(0, 23)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00Z`;
  const back = (k) => new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)) - k * 86400000).toISOString().slice(0, 10);
  const accounts = [], T = [];
  for (let i = 0; i < int(1, 3); i++) accounts.push(acct({ account_id: `mock-a${i}`, name: `Mock ${pick(['Checking', 'Savings', 'Cash'])} ${i}`, account_kind: pick(['checking', 'savings', 'cash']), balance_cents: int(-50000, 900000), available_cents: r() < 0.5 ? null : int(-50000, 900000), balance_as_of: nowIso }));
  if (r() < 0.5) accounts.push(acct({ account_id: 'mock-card', name: 'Mock Card', account_kind: 'credit', balance_cents: -int(0, 300000), available_cents: null, balance_as_of: nowIso }));
  if (r() < 0.3) accounts.push(acct({ account_id: 'mock-fx', name: 'Mock FX', currency: 'CAD', balance_cents: int(0, 500000), balance_as_of: nowIso }));
  const cadence = pick(['none', 'weekly', 'biweekly', 'semimonthly', 'monthly']), pay = int(50000, 400000);
  if (cadence === 'weekly' || cadence === 'biweekly') { const step = cadence === 'weekly' ? 7 : 14, off = int(1, step); for (let k = 0; k < 8; k++) T.push(tx(back(off + k * step), pay, 'MOCK EMPLOYER PAYROLL')); }
  if (cadence === 'semimonthly' || cadence === 'monthly') for (let k = 1; k <= 120; k++) { const d = back(k), dd = +d.slice(8, 10); if ((cadence === 'semimonthly' && (dd === 1 || dd === 15)) || (cadence === 'monthly' && dd === 1)) T.push(tx(d, pay, 'MOCK EMPLOYER PAYROLL')); }
  for (let b = 0; b < int(0, 6); b++) { const dom = int(1, 28), amt = int(500, 250000); for (let k = 1; k <= 120; k++) { const d = back(k); if (+d.slice(8, 10) === dom) T.push(tx(d, -amt, `MOCK BILLER ${b}`)); } }
  for (let k = 0; k < int(0, 60); k++) T.push(tx(back(int(0, 120)), -int(100, 20000), pick(['MOCK GROCER', 'MOCK CAFE', 'MOCK SHOP', 'MOCK DINER'])));
  return { accounts, T, nowIso };
}

test('properties over 300 MOCK scenarios: parts sum to totals, per day never exceeds the total, every answer ends with its source', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const { accounts, T, nowIso } = scenario(seed), why = `seed ${seed}`;
    const s = N.safeToSpend(accounts, T, nowIso, {});
    if (s.safe_cents !== null) {
      assert.equal(s.bills_cents, s.bills.reduce((a, b) => a + b.amount_cents, 0), why);
      assert.equal(s.raw_cents, s.cash_cents - s.bills_cents, why);
      assert.equal(s.safe_cents, Math.max(0, s.raw_cents), why);
      assert.ok(Number.isInteger(s.per_day_cents) && s.per_day_cents * s.days <= s.safe_cents && s.safe_cents - s.per_day_cents * s.days < s.days, why);
      assert.ok(s.bills.every((b) => b.on >= s.today && b.on <= s.until), why);
      assert.equal(s.cash_cents, accounts.filter((a) => !a.currency && a.account_kind !== 'credit').reduce((t, a) => t + Math.min(a.balance_cents, a.available_cents === null ? a.balance_cents : a.available_cents), 0), why);
    }
    const u = N.upcoming(accounts, T, nowIso, {});
    assert.equal(u.out_cents, u.items.filter((i) => i.direction === 'out').reduce((a, i) => a + i.amount_cents, 0), why);
    assert.equal(u.in_cents, u.items.filter((i) => i.direction === 'in').reduce((a, i) => a + i.amount_cents, 0), why);
    assert.ok(u.items.every((i, k) => k === 0 || u.items[k - 1].on <= i.on), why);
    const f = N.forecast(accounts, T, nowIso, {});
    if (f.daily) {
      assert.equal(f.daily[90].balance_cents, f.start_cents + f.in_cents - f.out_cents, why);
      for (let d = 1; d <= 90; d++) assert.equal(f.daily[d].balance_cents, f.daily[d - 1].balance_cents + f.daily[d].in_cents - f.daily[d].out_cents, why);
      if (s.safe_cents !== null) assert.equal(f.start_cents, s.cash_cents, why);
    }
    const w = N.netWorth(accounts, nowIso, {});
    assert.equal(w.net_cents, w.owned_cents - w.owed_cents + w.favor_cents, why);
    assert.ok(!accounts.some((a) => a.currency) || w.apart.includes('mock-fx'), why);
    for (const r of [s, u, f, w, N.runway(accounts, T, nowIso, {}), N.afford(accounts, T, 'can i afford $250', nowIso, {})]) {
      assert.match(lastLine(r.text), SOURCE, `${why} ${r.kind}`);
      assert.ok(!/NaN|undefined|Infinity|\$-/.test(r.text), `${why} ${r.kind}: ${r.text}`);
      assert.ok(!/NaN|undefined|Infinity/.test(r.math.join('\n')), `${why} ${r.kind} math`);
    }
  }
});

test('money is formatted from integer cents by the balance answer\'s own formatter', () => {
  assert.equal(MA.money(578500), '$5,785.00');
  assert.equal(MA.money(-1), '-$0.01');
});
