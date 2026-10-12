// Dispute drafting (packages/domain/79-dispute.js), live gauntlet S16-17 "dispute this charge". Every row here is a
// MOCK fixture (account MOCK-card); no provider, no network.
const test = require('node:test'), assert = require('node:assert/strict');
const D = require('../packages/domain/79-dispute.js');

const TODAY = '2026-10-12';
const row = (id, on, cents, m, pending) => ({ account_id: 'MOCK-card', provider_transaction_id: `MOCK-${id}`, amount_cents: cents, posted_on: on, merchant_raw: m, is_pending: !!pending });
const ROWS = [
  row('1', '2026-09-03', -4820, 'STREAMFLIX*PREMIUM'),
  row('2', '2026-10-03', -4820, 'STREAMFLIX*PREMIUM'),
  row('3', '2026-10-05', -1250, 'UBER *TRIP'),
  row('4', '2026-10-08', -6400, 'TRADER JOES #552'),
  row('5', '2026-10-09', 250000, 'PAYROLL ACME'), // money in: never a candidate
];
const SOURCE = 'From your linked accounts, as of 2026-10-09.';
const neverClaims = (t) => { assert.doesNotMatch(t, /Done:|[Ff]iled\b|\bsubmitted\b|\bI sent\b/, t); };

test('fires only on dispute words; a question about disputes in general is left to the model', () => {
  for (const t of ['dispute this charge', 'chargeback on uber', 'i want to charge back the uber ride', 'wrong charge at trader joes', "i didn't authorize this", 'unauthorized charge on my card', 'refund this charge']) assert.ok(D.isDisputeAsk(t), t);
  for (const t of ['what is a chargeback', "what's a dispute", 'find me money', 'cancel netflix', 'how much did i spend', 'any update on my dispute']) assert.equal(D.isDisputeAsk(t), false, t);
  assert.deepEqual(D.answer('find me money', ROWS, { today: TODAY }), { kind: 'not_dispute', text: null });
});

test('the Streamflix $48.20 case (gauntlet media): amount and date pick one charge and the draft is pre-filled', () => {
  const a = D.answer('dispute the $48.20 streamflix charge from oct 3', ROWS, { today: TODAY });
  assert.equal(a.kind, 'draft');
  assert.equal(a.charge.provider_transaction_id, 'MOCK-2');
  assert.match(a.text, /^Here's a dispute for the Streamflix charge, pre-filled for you to send yourself\. Nothing has been sent\./);
  assert.match(a.text, /Charge: STREAMFLIX\*PREMIUM, \$48\.20, posted Oct 3, 2026\./);
  assert.match(a.text, /Step 1, ask Streamflix for a refund/);
  assert.match(a.text, /"Hi, I'm writing about a charge of \$48\.20 from Streamflix on Oct 3, 2026\./);
  assert.match(a.text, new RegExp(`Step 2, if Streamflix says no or hasn't answered in ${D.WAIT_DAYS} days, dispute it with your card issuer or bank`));
  assert.match(a.text, /Fair Credit Billing Act gives you 60 days from the date of the statement/);
  assert.match(a.text, /debit card, the dispute goes to your bank under Regulation E/);
  assert.ok(a.text.endsWith(SOURCE), 'the source and as-of date close the reply');
  neverClaims(a.text);
  // The gauntlet's own checks for S16-17.
  assert.match(a.text, /[Dd]ispute/); assert.match(a.text, /48\.20|STREAMFLIX|Streamflix/);
  assert.doesNotMatch(a.text, /Done:|[Ff]iled\b(?! for you to)/);
});

test('exact match by merchant', () => {
  const a = D.answer('wrong charge at trader joes', ROWS, { today: TODAY });
  assert.equal(a.kind, 'draft');
  assert.equal(a.charge.provider_transaction_id, 'MOCK-4');
  assert.match(a.text, /\$64\.00/);
  assert.match(a.text, /This charge isn't right\./);
  const u = D.answer("i didn't authorize the uber charge", ROWS, { today: TODAY });
  assert.equal(u.charge.provider_transaction_id, 'MOCK-3');
  assert.match(u.text, /I didn't authorize this charge\./);
  neverClaims(u.text);
});

test('exact match by amount alone, and by date alone', () => {
  const a = D.answer('dispute 12.50', ROWS, { today: TODAY });
  assert.equal(a.kind, 'draft'); assert.equal(a.charge.provider_transaction_id, 'MOCK-3');
  const b = D.answer('dispute the charge on 10/8', ROWS, { today: TODAY });
  assert.equal(b.kind, 'draft'); assert.equal(b.charge.provider_transaction_id, 'MOCK-4', 'an exact date wins over the posting window');
});

test('"the last one" keeps the newest of the matches', () => {
  const a = D.answer('dispute the last streamflix charge', ROWS, { today: TODAY });
  assert.equal(a.kind, 'draft'); assert.equal(a.charge.posted_on, '2026-10-03');
});

test('ambiguous: a numbered list to pick from, newest first, with the source', () => {
  const a = D.answer('dispute the streamflix charge', ROWS, { today: TODAY });
  assert.equal(a.kind, 'pick');
  assert.equal(a.candidates.length, 2);
  assert.match(a.text, /^I found 2 charges that could be it\. Which one do you want to dispute\?\n1\. Streamflix, \$48\.20, posted Oct 3, 2026\n2\. Streamflix, \$48\.20, posted Sep 3, 2026\n/);
  assert.match(a.text, /Say "dispute" with the amount and date of the one you mean, like "dispute Streamflix \$48\.20 on Oct 3"\./);
  assert.ok(a.text.endsWith(SOURCE));
  // Nothing said about which charge: the newest charges to pick from, never a credit.
  const b = D.answer('dispute this charge', ROWS, { today: TODAY });
  assert.equal(b.kind, 'pick');
  assert.match(b.text, /^Which charge do you want to dispute\?\n1\. Trader Joes, \$64\.00/);
  assert.doesNotMatch(b.text, /Payroll|2,500/);
  neverClaims(b.text);
});

test('none: one honest line, and nothing linked says so', () => {
  const a = D.answer('dispute the lyft charge', ROWS, { today: TODAY });
  assert.equal(a.kind, 'none');
  assert.equal(a.text, "I couldn't find that charge in your linked accounts (I checked 4 charges through 2026-10-09). Tell me the merchant, amount and date as they show on your statement, or send a photo of it, and I'll draft the dispute.");
  assert.equal(D.answer('dispute 999.99', ROWS, { today: TODAY }).kind, 'none');
  const n = D.answer('dispute this charge', [], { today: TODAY });
  assert.equal(n.kind, 'none'); assert.match(n.text, /^I don't see a connected bank or card, so I can't find that charge\./);
  neverClaims(n.text);
});

test('a photo with nothing in the text is left to the photo reader; a photo plus named details still drafts', () => {
  assert.deepEqual(D.answer('dispute this charge', ROWS, { today: TODAY, has_photo: true }), { kind: 'defer', text: null });
  assert.equal(D.answer('dispute this uber charge', ROWS, { today: TODAY, has_photo: true }).kind, 'draft');
});

test('photo path: extracted fields match a linked charge the same way', () => {
  const a = D.fromPhoto({ merchant: 'STREAMFLIX', amount_cents: 4820, date: '2026-10-03' }, ROWS, { today: TODAY });
  assert.equal(a.kind, 'draft'); assert.equal(a.charge.provider_transaction_id, 'MOCK-2');
  assert.match(a.text, /Matched to your photo\.\nFrom your linked accounts, as of 2026-10-09\.$/);
  const many = D.fromPhoto({ merchant: 'Streamflix', amount_cents: 4820 }, ROWS, { today: TODAY });
  assert.equal(many.kind, 'pick'); assert.match(many.text, /^Your photo matches 2 charges\./);
});

test('photo path: no linked rows, the draft comes from the photo and says so; not found in rows says that too', () => {
  const a = D.fromPhoto({ merchant: 'STREAMFLIX', amount_cents: 4820, date: '2026-10-03' }, [], { today: TODAY });
  assert.equal(a.kind, 'draft_from_photo');
  assert.match(a.text, /\$48\.20/); assert.match(a.text, /Streamflix/);
  assert.match(a.text, /These details come from your photo \(there's no linked account to check them against\)/);
  assert.ok(a.text.endsWith('From your photo, charge dated 2026-10-03.'));
  neverClaims(a.text);
  const b = D.fromPhoto({ merchant: 'GYMCO', amount_cents: 3999, date: '2026-10-01' }, ROWS, { today: TODAY });
  assert.equal(b.kind, 'draft_from_photo');
  assert.match(b.text, /I don't see this charge in your linked accounts \(checked through 2026-10-09\), so these details come from your photo/);
  const c = D.fromPhoto({}, ROWS, { today: TODAY });
  assert.equal(c.kind, 'none'); assert.match(c.text, /couldn't read the merchant or the amount/);
});

test('an old charge warns that the 60-day window may be closing; a pending charge says the card dispute waits for it to post', () => {
  const old = D.answer('dispute the gymco charge', [row('9', '2026-06-01', -3999, 'GYMCO 0042')], { today: TODAY });
  assert.equal(old.kind, 'draft');
  assert.match(old.text, /This charge posted 133 days ago, so the 60-day window may already be closing or closed/);
  const p = D.answer('dispute the gymco charge', [row('9', '2026-10-11', -3999, 'GYMCO 0042', true)], { today: TODAY });
  assert.match(p.text, /pending since Oct 11, 2026/);
  assert.match(p.text, /It's still pending: step 1 works now; the card dispute can start once it posts\./);
});

test('every amount and date in a draft comes from the rows', () => {
  const a = D.answer('dispute the uber charge', ROWS, { today: TODAY });
  const amounts = a.text.match(/\$[\d,]+\.\d{2}/g);
  assert.ok(amounts.every((x) => x === '$12.50'), amounts.join(','));
  const dates = a.text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}|\d{4}-\d{2}-\d{2}/g);
  assert.ok(dates.every((x) => x === 'Oct 5, 2026' || x === '2026-10-09'), dates.join(','));
  assert.equal(D.merchantName('NETFLIX.COM 866-579'), 'Netflix');
});
