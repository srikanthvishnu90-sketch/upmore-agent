// Career connector 72H FOLLOW-UP (module 161): the follow-up plan that fires
// 72 hours after a delivered intro — due math exact to the millisecond,
// idempotent scheduling, honest cancellation on consent revocation, quiet
// hours shifted AND recorded, and no re-fire across a restart.
// Check: node --test tests/career-connector-followup.test.cjs
// Pure state machine: no I/O, no clock reads (every time is injected), no
// sends. All people below are TEST FIXTURES. The composer dependency is a
// contract double implementing module 159's composeFollowUp contract
// ({a, b, introAt, matchId, introId} -> { message, record } | null, record
// .due_at = introAt + 72h exactly); FU72-004 proves the module PINS that
// contract instead of trusting it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const F = require(path.join(root, 'packages/domain/161-career-connector-followup.js'));

const H72 = 72 * 60 * 60 * 1000;

// --- 159 contract double ----------------------------------------------------
// Mirrors 159's composeFollowUp output shape field for field: a joint
// message naming both people, and a record with due_at = introAt + 72h.
function composeFollowUp159(input) {
  const c = input && typeof input === 'object' ? input : {};
  const aName = c.a && typeof c.a.name === 'string' ? c.a.name.trim() : '';
  const bName = c.b && typeof c.b.name === 'string' ? c.b.name.trim() : '';
  const t = Date.parse(typeof c.introAt === 'string' ? c.introAt : '');
  if (!aName || !bName || !Number.isFinite(t)) return null;
  const record = {
    kind: 'connector_follow_up',
    version: '2026-10-21',
    intro_id: typeof c.introId === 'string' && c.introId.trim() ? c.introId.trim() : null,
    match_id: typeof c.matchId === 'string' && c.matchId.trim() ? c.matchId.trim() : null,
    a_id: c.a && typeof c.a.id === 'string' ? c.a.id : null,
    b_id: c.b && typeof c.b.id === 'string' ? c.b.id : null,
    a_name: aName,
    b_name: bName,
    intro_at: new Date(t).toISOString(),
    due_at: new Date(t + H72).toISOString(),
    status: 'pending',
  };
  const message = [
    `Hi ${aName.split(' ')[0]} and ${bName.split(' ')[0]} — checking in on the intro I made three days ago.`,
    '',
    'Did the two of you get to talk? If you did, was it useful? If it stalled, reply here and I\'ll nudge it once.',
    '',
    '— Trainee',
  ].join('\n');
  return { message, record };
}

function machine(extraDeps) {
  return F.createConnectorFollowUp(Object.assign({ composeFollowUp: composeFollowUp159 }, extraDeps || {}));
}

// --- Fixtures (synthetic people, invented for this test only) ---------------
// deliveredAt 2026-10-22T04:30Z -> due 2026-10-25T04:30Z, which is 23:30 CDT
// (UTC-5) on Oct 24 in America/Chicago — inside quiet hours — and 04:30 UTC.
const INTRO1 = {
  introId: 'i-001', matchId: 'm-001',
  aId: 'u-daniel', bId: 'u-priya',
  aName: 'Daniel Osei', bName: 'Priya Nair',
  deliveredAt: '2026-10-22T04:30:00.000Z',
};
const DUE1_MS = Date.parse(INTRO1.deliveredAt) + H72; // 2026-10-25T04:30:00.000Z

test('FU72-001 due math is exact to the millisecond; keys and kind are the contract shapes', () => {
  const m = machine();
  const r = m.schedule(INTRO1, { now: Date.parse(INTRO1.deliveredAt) });
  assert.equal(r.ok, true);
  const p = r.plan;
  assert.equal(Date.parse(p.due_at), DUE1_MS);
  assert.equal(Date.parse(p.due_at) - Date.parse(p.delivered_at), 259200000);
  assert.equal(p.idempotency_key, 'i-001:fu72');
  assert.equal(p.id, 'i-001:fu72');
  assert.equal(p.status, 'scheduled');
  assert.equal(p.sides.length, 2);
  for (const s of p.sides) {
    assert.equal(s.key, 'followup:i-001:fu72');
    assert.equal(Date.parse(s.due_at), DUE1_MS);
    assert.equal(typeof s.text, 'string');
    assert.ok(s.text.length >= 1 && s.text.length <= 4000);
  }
  assert.equal(p.sides[0].user_id, 'u-daniel');
  assert.equal(p.sides[1].user_id, 'u-priya');
  assert.equal(F.FOLLOW_UP_AFTER_MS, 259200000);
  assert.equal(F.OUTBOX_KIND, 'followup');
});

test('FU72-002 duplicate scheduling is one plan, first schedule wins verbatim', () => {
  const m = machine();
  const first = m.schedule(INTRO1, { now: 1000, aTimeZone: 'America/Chicago' });
  const second = m.schedule(INTRO1, { now: 2000, aTimeZone: 'UTC' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.plan, first.plan);
  assert.equal(m.list().length, 1);
  // The retry did not rewrite the recorded quiet-hours shift.
  assert.equal(second.plan.sides[0].fire_at, first.plan.sides[0].fire_at);
});

test('FU72-003 scheduling refuses named: missing fields, same person, bad time, missing name', () => {
  const m = machine();
  assert.equal(m.schedule(null).code, 'INVALID_INPUT');
  assert.equal(m.schedule({ aId: 'u-a', bId: 'u-b', deliveredAt: INTRO1.deliveredAt }).code, 'INVALID_INPUT');
  assert.equal(m.schedule(Object.assign({}, INTRO1, { bId: 'u-daniel' })).code, 'SAME_PERSON');
  assert.equal(m.schedule(Object.assign({}, INTRO1, { deliveredAt: 'not-a-time' })).code, 'INVALID_DELIVERED_AT');
  assert.equal(m.schedule(Object.assign({}, INTRO1, { aName: '' })).code, 'MISSING_NAME');
  assert.equal(m.list().length, 0);
});

test('FU72-004 the module pins 159\'s contract: a composer 1ms off on due_at is refused, a null composer is refused', () => {
  const off = (input) => {
    const out = composeFollowUp159(input);
    if (out) out.record.due_at = new Date(Date.parse(out.record.due_at) + 1).toISOString();
    return out;
  };
  const m1 = F.createConnectorFollowUp({ composeFollowUp: off });
  const r1 = m1.schedule(INTRO1, {});
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'COMPOSER_CONTRACT_VIOLATION');
  const m2 = F.createConnectorFollowUp({ composeFollowUp: () => null });
  assert.equal(m2.schedule(INTRO1, {}).code, 'COMPOSER_REFUSED');
  assert.throws(() => F.createConnectorFollowUp({}), TypeError);
  assert.throws(() => F.createConnectorFollowUp(), TypeError);
});

test('FU72-005 quiet hours: a 23:30-local due shifts to next-day 08:00 local, both timestamps recorded', () => {
  const m = machine();
  const r = m.schedule(INTRO1, { now: 0, aTimeZone: 'America/Chicago', bTimeZone: 'UTC' });
  const [a, b] = r.plan.sides;
  // A: due 23:30 CDT Oct 24 -> fire 08:00 CDT Oct 25 = 13:00Z.
  assert.equal(a.due_at, '2026-10-25T04:30:00.000Z');
  assert.equal(a.fire_at, '2026-10-25T13:00:00.000Z');
  assert.deepEqual(a.quiet_shift, {
    applied: true,
    from: '2026-10-25T04:30:00.000Z',
    to: '2026-10-25T13:00:00.000Z',
    time_zone: 'America/Chicago',
    reason: 'quiet_hours_22_08',
  });
  // B: due 04:30 UTC -> fire same-day 08:00 UTC.
  assert.equal(b.fire_at, '2026-10-25T08:00:00.000Z');
  assert.equal(b.quiet_shift.applied, true);
  assert.equal(b.quiet_shift.from, '2026-10-25T04:30:00.000Z');
  assert.equal(b.quiet_shift.to, '2026-10-25T08:00:00.000Z');
});

test('FU72-006 quiet-hours boundaries: exactly 08:00 local fires unshifted, exactly 22:00 local shifts', () => {
  // deliveredAt chosen so due = 08:00:00 CDT exactly (13:00Z).
  const at8 = Object.assign({}, INTRO1, { introId: 'i-008', deliveredAt: '2026-10-22T13:00:00.000Z' });
  const m = machine();
  const r8 = m.schedule(at8, { now: 0, aTimeZone: 'America/Chicago' });
  assert.equal(r8.plan.sides[0].fire_at, '2026-10-25T13:00:00.000Z');
  assert.equal(r8.plan.sides[0].quiet_shift, null);
  // due = 22:00:00 CDT exactly (03:00Z next day).
  const at22 = Object.assign({}, INTRO1, { introId: 'i-022', deliveredAt: '2026-10-22T03:00:00.000Z' });
  const r22 = m.schedule(at22, { now: 0, aTimeZone: 'America/Chicago' });
  assert.equal(r22.plan.sides[0].quiet_shift.applied, true);
  assert.equal(r22.plan.sides[0].fire_at, '2026-10-25T13:00:00.000Z');
});

test('FU72-007 no time zone is never silently assumed: fire time stays the due time, warning recorded', () => {
  const m = machine();
  const r = m.schedule(INTRO1, { now: 0 });
  for (const s of r.plan.sides) {
    assert.equal(s.fire_at, s.due_at);
    assert.equal(s.quiet_shift, null);
    assert.ok(s.warnings.includes('quiet_hours_not_applied:no_time_zone'));
  }
  const bad = m.schedule(Object.assign({}, INTRO1, { introId: 'i-tz' }), { now: 0, aTimeZone: 'Mars/Olympus' });
  assert.equal(bad.plan.sides[0].fire_at, bad.plan.sides[0].due_at);
  assert.ok(bad.plan.sides[0].warnings.includes('quiet_hours_not_applied:invalid_time_zone'));
});

test('FU72-008 revocation before due cancels the whole plan honestly; nothing fires after', () => {
  const m = machine();
  m.schedule(INTRO1, { now: 0 });
  const rv = m.applyRevoke('i-001:fu72', 'u-priya', Date.parse(INTRO1.deliveredAt) + 60000);
  assert.equal(rv.ok, true);
  assert.equal(rv.plan.status, 'cancelled_on_revoke');
  assert.equal(rv.plan.cancel.by_user_id, 'u-priya');
  assert.equal(rv.plan.cancel.by_side, 'b');
  assert.ok(rv.plan.sides.every((s) => s.status === 'cancelled_on_revoke'));
  const late = Date.parse(INTRO1.deliveredAt) + H72 + 1000;
  assert.deepEqual(m.tick(late), []);
  assert.deepEqual(m.fireCandidates(late), []);
  assert.equal(m.fire('i-001:fu72', late).code, 'PLAN_TERMINAL');
  assert.equal(m.applyRevoke('i-001:fu72', 'u-daniel', late).code, 'PLAN_NOT_OPEN');
  assert.equal(m.applyRevoke('nope:fu72', 'u-daniel', late).code, 'NOT_FOUND');
});

test('FU72-009 fire-time consent re-check: a side no longer consented at due cancels instead of firing', () => {
  const m = machine({ isConsented: (userId) => userId !== 'u-priya' });
  m.schedule(INTRO1, { now: 0 });
  const late = DUE1_MS + 1;
  m.tick(late);
  const f = m.fire('i-001:fu72', late);
  assert.equal(f.ok, false);
  assert.equal(f.code, 'CONSENT_REVOKED_AT_FIRE');
  assert.equal(f.plan.status, 'cancelled_on_revoke');
  assert.equal(f.plan.cancel.via, 'fire_time_consent_check');
  assert.equal(f.plan.cancel.by_user_id, 'u-priya');
});

test('FU72-010 happy path: due -> fire payloads per side -> written -> read_back_verified', () => {
  const m = machine();
  m.schedule(INTRO1, { now: 0 });
  assert.equal(m.fire('i-001:fu72', DUE1_MS - 1).code, 'NOT_DUE');
  const due = m.tick(DUE1_MS);
  assert.equal(due.length, 1);
  assert.equal(due[0].status, 'due');
  const f = m.fire('i-001:fu72', DUE1_MS);
  assert.equal(f.ok, true);
  assert.equal(f.payloads.length, 2);
  for (const p of f.payloads) {
    assert.equal(p.kind, 'followup');
    assert.equal(p.key, 'followup:i-001:fu72');
    assert.equal(p.deliver_at, '2026-10-25T04:30:00.000Z');
    assert.equal(p.text, f.payloads[0].text);
  }
  assert.deepEqual(f.payloads.map((p) => p.user_id).sort(), ['u-daniel', 'u-priya']);
  assert.equal(m.markWritten('i-001:fu72', 'a', 101, DUE1_MS + 10).ok, true);
  const w = m.markWritten('i-001:fu72', 'b', 102, DUE1_MS + 20);
  assert.equal(w.plan.status, 'written');
  const rowFor = (side) => {
    const s = w.plan.sides.find((x) => x.side === side);
    return { key: s.key, text: s.text, deliver_at: s.fire_at };
  };
  assert.equal(m.markReadBack('i-001:fu72', 'a', rowFor('a'), DUE1_MS + 30).ok, true);
  const done = m.markReadBack('i-001:fu72', 'b', rowFor('b'), DUE1_MS + 40);
  assert.equal(done.plan.status, 'read_back_verified');
  assert.ok(F.TERMINAL_STATES.includes(done.plan.status));
});

test('FU72-011 a delivered follow-up never re-fires across a simulated restart', () => {
  const m = machine();
  m.schedule(INTRO1, { now: 0 });
  m.tick(DUE1_MS);
  m.fire('i-001:fu72', DUE1_MS);
  m.markWritten('i-001:fu72', 'a', 101, DUE1_MS + 10);
  m.markWritten('i-001:fu72', 'b', 102, DUE1_MS + 20);
  const plan = m.get('i-001:fu72');
  const rowFor = (side) => {
    const s = plan.sides.find((x) => x.side === side);
    return { key: s.key, text: s.text, deliver_at: s.fire_at };
  };
  m.markReadBack('i-001:fu72', 'a', rowFor('a'), DUE1_MS + 30);
  m.markReadBack('i-001:fu72', 'b', rowFor('b'), DUE1_MS + 40);
  assert.equal(m.get('i-001:fu72').status, 'read_back_verified');

  const restored = machine(null, m.snapshot());
  assert.equal(restored.snapshot(), m.snapshot()); // byte-stable round trip
  const again = restored.schedule(INTRO1, { now: DUE1_MS + 999999 });
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(again.plan.status, 'read_back_verified');
  assert.equal(restored.list().length, 1);
  assert.deepEqual(restored.tick(DUE1_MS + 999999), []);
  assert.deepEqual(restored.fireCandidates(DUE1_MS + 999999), []);
  assert.equal(restored.fire('i-001:fu72', DUE1_MS + 999999).code, 'PLAN_TERMINAL');
});

test('FU72-012 a mid-flight plan restored from snapshot still fires exactly once', () => {
  const m = machine();
  m.schedule(INTRO1, { now: 0, aTimeZone: 'America/Chicago' });
  const restored = machine(null, m.snapshot());
  assert.equal(restored.list().length, 1);
  // Side B (no tz) is fireable at the 04:30Z due time; side A is quiet-shifted
  // to 13:00Z. Firing in between returns exactly one payload, exactly once.
  const between = Date.parse('2026-10-25T05:00:00.000Z');
  restored.tick(between);
  const f = restored.fire('i-001:fu72', between);
  assert.equal(f.ok, true);
  assert.equal(f.payloads.length, 1);
  assert.equal(f.payloads[0].user_id, 'u-priya');
  const dup = restored.schedule(INTRO1, { now: between });
  assert.equal(dup.duplicate, true);
  assert.equal(restored.list().length, 1);
});

test('FU72-013 transitions are ordered and failures are named, never silent', () => {
  const m = machine();
  m.schedule(INTRO1, { now: 0 });
  assert.equal(m.markWritten('i-001:fu72', 'a', 1, 0).code, 'INVALID_TRANSITION');
  m.tick(DUE1_MS);
  m.fire('i-001:fu72', DUE1_MS);
  m.markWritten('i-001:fu72', 'a', 101, DUE1_MS + 10);
  const bad = m.markReadBack('i-001:fu72', 'a',
    { key: 'followup:i-001:fu72', text: 'tampered text', deliver_at: '2026-10-25T04:30:00.000Z' }, DUE1_MS + 30);
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'READ_BACK_MISMATCH');
  assert.equal(bad.plan.status, 'failed_named');
  assert.equal(bad.plan.failure.side, 'a');
  assert.equal(bad.plan.failure.field, 'text');
  assert.equal(bad.plan.failure.reason, 'read_back_mismatch');
  // Terminal is terminal: no further writes.
  assert.equal(m.markWritten('i-001:fu72', 'b', 102, DUE1_MS + 40).code, 'PLAN_TERMINAL');
});

test('FU72-014 markFailed names the failure on the plan and the side', () => {
  const m = machine();
  m.schedule(INTRO1, { now: 0 });
  m.tick(DUE1_MS);
  m.fire('i-001:fu72', DUE1_MS);
  const r = m.markFailed('i-001:fu72', 'b', 'outbox_insert_conflict_unexpected', DUE1_MS + 5);
  assert.equal(r.ok, true);
  assert.equal(r.plan.status, 'failed_named');
  assert.equal(r.plan.failure.reason, 'outbox_insert_conflict_unexpected');
  assert.equal(r.plan.sides[1].status, 'failed_named');
  assert.equal(m.fire('i-001:fu72', DUE1_MS + 10).code, 'PLAN_TERMINAL');
});

test('FU72-015 quiet-hours shift moves the fire time, never the recorded due time', () => {
  const m = machine();
  const r = m.schedule(INTRO1, { now: 0, aTimeZone: 'America/Chicago', bTimeZone: 'America/Chicago' });
  assert.equal(r.plan.due_at, '2026-10-25T04:30:00.000Z'); // the +72h record never moves
  const early = Date.parse('2026-10-25T05:00:00.000Z'); // after due, before the shifted fire
  assert.deepEqual(m.tick(early), []);
  assert.deepEqual(m.fireCandidates(early), []);
  const atFire = Date.parse('2026-10-25T13:00:00.000Z'); // 08:00 CDT
  assert.equal(m.tick(atFire).length, 1);
  const f = m.fire('i-001:fu72', atFire);
  assert.equal(f.ok, true);
  assert.equal(f.payloads.length, 2);
  for (const p of f.payloads) assert.equal(p.deliver_at, '2026-10-25T13:00:00.000Z');
});
