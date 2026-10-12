// Wave 1 C13 end-to-end: shared-expense ledger, settle-up requests, and clearing only against a received payment.
// The loop, on fixtures only, following tests/money.test.cjs's harness (domain files in a vm, a fake rail):
//   a real transaction row the user tags as shared -> per-person ledger lines in the IOU log's own shape (105)
//   -> a settle-up request generated through AgentMoneyPlans (60, PAY-003) carrying its rail reference, staged and
//      never called delivered (a person with no rail on file gets the repo's NOT_WIRED, not a pretend send)
//   -> the line stays open until a matching incoming payment row posts; then, and only then, the line clears.
// Probed 2026-10-12: neither 105 nor 60 had a transaction->ledger or request->IOU seam (settleRequests settled the
// request and left the IOU entry "open"). The bridge built for it lives in 60: fromTaggedTransaction, requestFromIou,
// settleIous. Check: node --test tests/iou-settle-e2e.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({});
vm.runInContext(['48-money-math.js', '42-agent-recipients.js', '43-agent-loop.js', '47-data-guard.js', '54-agent-money.js', '60-agent-money-plans.js', '105-iou-log.js'].map(f => fs.readFileSync(path.join(root, 'packages/domain', f), 'utf8')).join('\n') + '\nthis.MP=AgentMoneyPlans;this.IouLog=IouLog;this.Loop=AgentLoop;', ctx);
const MP = ctx.MP, IouLog = ctx.IouLog, Loop = ctx.Loop;
const TODAY = '2026-10-10', NOW = Date.parse('2026-10-10T14:00:00Z');
const people = [
  { id: 'p1', name: 'Sarah M', handle: '@sarah-m', rails: ['venmo'], history: [{ amount_cents: 8500, on: '2026-09-01' }] },
  { id: 'p5', name: 'Maya', handle: '@maya', rails: ['cash_app'], history: [] },
  { id: 'p6', name: 'Priya N', handle: '@priya-n', rails: [], history: [] },
];
// The fake rail from tests/money.test.cjs: staging a request must never write to it — staged is not delivered.
const fakeRail = () => { const writes = []; return { writes, read: async () => ({ value: 1, source: 'x', as_of: NOW }), write: async (id, p, key) => { writes.push(key); return { reference: 'ref-' + writes.length }; }, verify: async () => ({ confirmed: true, source: 'Example Bank' }) }; };
// A real posted charge, tagged by the user as a shared expense: I paid, split equally with Sarah M and Maya.
const DINNER = { id: 'tx-dinner', account_id: 'chk', posted_at: '2026-10-08', posted_on: '2026-10-08', amount_cents: -9600, merchant_raw: 'SQ *ALLEY CAT CAFE', is_pending: false, is_transfer: false };
const TAG = { shared_with: ['Sarah M', 'Maya'], paid_by: 'me', what: 'Alley Cat Cafe dinner' };

test('a tagged transaction row creates the per-person ledger lines, in the IOU log shape, exact to the cent', () => {
  const led = MP.fromTaggedTransaction(DINNER, TAG);
  assert.equal(led.total_cents, 9600);
  assert.equal(led.transaction_id, 'tx-dinner');
  assert.equal(led.entries.length, 2, 'one line per person who owes a share; my own share is not a line');
  const byName = Object.fromEntries(led.entries.map(e => [e.name, e]));
  // Independent split: $96.00 over 3 people (me + 2) is $32.00 each.
  assert.equal(byName['Sarah M'].amount_cents, 3200);
  assert.equal(byName['Maya'].amount_cents, 3200);
  assert.equal(led.entries.reduce((s, e) => s + e.amount_cents, 0) + 3200, 9600, 'the lines plus the payer share reconcile to the charge');
  for (const e of led.entries) {
    assert.equal(e.direction, 'owes_me');
    assert.equal(e.status, 'open');
    assert.equal(e.original_cents, e.amount_cents);
    assert.equal(e.created_on, '2026-10-08', 'dated from the transaction, not from today');
    assert.equal(e.transaction_id, 'tx-dinner', 'the line carries the transaction it came from');
    assert.equal(e.note, 'Alley Cat Cafe dinner');
  }
  // The lines live in the IOU log's world unchanged: 105 lists and describes them as-is.
  assert.match(IouLog.describe(led.entries), /Sarah M owes you \$32\.00/);
  const listed = IouLog.command('who owes me', led.entries, NOW);
  assert.match(listed.reply, /Owed to you: Sarah M \$32\.00 \(Alley Cat Cafe dinner\); Maya \$32\.00 \(Alley Cat Cafe dinner\)\. \$64\.00 in all\./);
  // Not a charge, pending, or untagged: no lines are invented.
  assert.equal(MP.fromTaggedTransaction({ ...DINNER, amount_cents: 9600 }, TAG), null, 'a credit is not a shared expense');
  assert.equal(MP.fromTaggedTransaction({ ...DINNER, is_pending: true }, TAG), null, 'a pending charge makes no line yet');
  assert.equal(MP.fromTaggedTransaction(DINNER, { shared_with: [] }), null);
  assert.equal(MP.fromTaggedTransaction(DINNER, null), null);
});

test('when someone else paid, my share is an i_owe line to them — and a request for it is refused', () => {
  const led = MP.fromTaggedTransaction({ ...DINNER, id: 'tx-brunch' }, { shared_with: ['Maya'], paid_by: 'Sarah M', what: 'brunch' });
  assert.equal(led.entries.length, 1, 'only my line is mine; Maya\u2019s share is between Maya and Sarah');
  assert.equal(led.entries[0].name, 'Sarah M');
  assert.equal(led.entries[0].direction, 'i_owe');
  assert.equal(led.entries[0].amount_cents, 3200);
  const r = MP.requestFromIou(led.entries[0], { people, today: TODAY });
  assert.match(r.ask, /You owe Sarah M/, 'a request is only for money owed to you');
  assert.equal(r.request, undefined);
});

test('the settle-up request is generated through money-plans (PAY-003), carries its rail reference, and is staged — never delivered', () => {
  const rail = fakeRail();
  Loop.create({ registry: { get: () => null, answer: () => ({ text: '' }) }, connectors: rail, clock: () => NOW });
  const [sarah, maya] = MP.fromTaggedTransaction(DINNER, TAG).entries;
  const rm = MP.requestFromIou(maya, { people, today: TODAY });
  assert.equal(rm.request.rail_reference, 'cash_app', 'each person\u2019s request carries their own rail reference');
  assert.equal(rm.request.delivery, 'staged');
  const r = MP.requestFromIou(sarah, { people, today: TODAY });
  assert.equal(r.request.capability_id, 'PAY-003');
  assert.equal(r.request.rail, 'venmo');
  assert.equal(r.request.rail_reference, 'venmo', 'the rail the request is staged on, by reference');
  assert.equal(r.request.delivery, 'staged');
  assert.equal(r.request.iou_id, sarah.id, 'the request names the ledger line it settles');
  assert.equal(r.request.source_transaction_id, 'tx-dinner');
  assert.equal(r.request.amount_cents, sarah.amount_cents);
  assert.equal(r.request.status, 'open');
  assert.match(r.text, /staged, you tap Request/, 'the handoff says staged in words');
  assert.ok(!/delivered|has been sent|was sent/i.test(r.text), 'staged is never called delivered');
  assert.equal(rail.writes.length, 0, 'nothing was written to any rail');
  // A person with no request rail on file: NOT_WIRED, honestly, instead of a pretend rail.
  const priya = { id: 'iou-tx-x-priya-n', name: 'Priya N', direction: 'owes_me', amount_cents: 1500, original_cents: 1500, note: 'taxi', created_on: '2026-10-09', status: 'open', transaction_id: 'tx-x' };
  const rn = MP.requestFromIou(priya, { people, today: TODAY });
  assert.equal(rn.request.rail, null);
  assert.equal(rn.request.rail_reference, 'NOT_WIRED');
  assert.equal(rn.request.delivery, 'NOT_WIRED');
  assert.match(rn.text, /no request rail on file/);
});

test('the line stays open until the matching payment posts; then the request settles and the line clears, per person', () => {
  const entries = MP.fromTaggedTransaction(DINNER, TAG).entries;
  const reqs = entries.map(e => MP.requestFromIou(e, { people, today: TODAY }).request);
  // No payment yet: nothing settles, both lines and both requests stay open.
  let out = MP.settleIous(entries, reqs, [], people);
  assert.equal(out.settled.length, 0);
  assert.ok(out.ious.every(e => e.status === 'open'));
  assert.ok(reqs.every(r => r.status === 'open'));
  // A credit that does not match (wrong amount, then right amount from the wrong person): still open.
  out = MP.settleIous(entries, reqs, [{ id: 'w1', posted_at: '2026-10-15', amount_cents: 3100, merchant_raw: 'VENMO FROM SARAH-M' }], people);
  assert.equal(out.settled.length, 0);
  out = MP.settleIous(entries, reqs, [{ id: 'w2', posted_at: '2026-10-15', amount_cents: 3200, merchant_raw: 'VENMO FROM SOMEONE ELSE' }], people);
  assert.equal(out.settled.length, 0);
  assert.ok(out.ious.every(e => e.status === 'open'), 'only a received, matching payment clears a line');
  // Sarah's payment posts: her request settles against that exact row and her line clears; Maya's stays open.
  const pay = { id: 'pay-sarah-1', account_id: 'chk', posted_at: '2026-10-19', amount_cents: 3200, merchant_raw: 'VENMO FROM SARAH-M' };
  out = MP.settleIous(entries, reqs, [pay], people);
  assert.equal(out.settled.length, 1);
  assert.equal(out.settled[0].transaction_id, 'pay-sarah-1');
  assert.equal(out.settled[0].iou_id, entries[0].id);
  assert.equal(reqs[0].status, 'settled');
  assert.equal(reqs[0].settled_by, 'pay-sarah-1');
  const sarahLine = out.ious.find(e => e.name === 'Sarah M');
  assert.equal(sarahLine.status, 'settled');
  assert.equal(sarahLine.settled_on, '2026-10-19');
  assert.equal(sarahLine.settled_by, 'pay-sarah-1', 'the line clears against the received payment row, by id');
  const mayaLine = out.ious.find(e => e.name === 'Maya');
  assert.equal(mayaLine.status, 'open', 'Maya has not paid: her line is untouched');
  assert.equal(reqs[1].status, 'open');
  assert.match(IouLog.describe(out.ious), /^IOUs: Maya owes you \$32\.00/);
  assert.ok(!/Sarah/.test(IouLog.describe(out.ious)), 'a settled line no longer shows as open');
});
