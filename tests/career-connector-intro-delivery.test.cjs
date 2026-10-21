// Career connector INTRO DELIVERY (module 163): turns a match unlock event
// into a delivery plan on the in-product inbox surface, with an honest state
// machine (planned -> written -> read_back_verified | failed_named) and a
// terminal "refused" state that is RECORDED, never silent.
// Check: node --test tests/career-connector-intro-delivery.test.cjs
// Fixtures only: no I/O, no sends, no live writes. All people below are
// TEST FIXTURES.
//
// Composition is module 159's, injected as deps.composeIntro. The suite
// injects the byte-faithful fixture copy of 159 @ 29a67280
// (tests/fixtures/159-career-connector-intro.fixture.js,
//  sha256 8688472aa5b68244f2d0e91dee2b25c4680d255e288424a89b7a777f4e64069f);
// the assembly lane injects the real 159 — identical export surface.
// Consent is module 157's, injected as deps.isConsented(personId, scope);
// the suite wires the real 157 fixture @ 0c0b71fa
// (sha256 2892aab776b3add0226da644c6df9ce50ccb79c7617102eccfef5d15e5b19d1d)
// so grant/revoke flows run end to end.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const D = require(path.join(root, 'packages/domain/163-career-connector-intro-delivery.js'));
const Intro = require(path.join(__dirname, 'fixtures/159-career-connector-intro.fixture.js'));
const Consent = require(path.join(__dirname, 'fixtures/157-career-connector-consent.fixture.js'));

const H72 = 72 * 60 * 60 * 1000;
const T0 = '2026-10-21T16:00:00.000Z';           // consent grants
const T_UNLOCK = Date.parse('2026-10-21T17:00:00.000Z');
const INTRO_ISO = '2026-10-21T17:00:00.000Z';

// --- Fixtures (synthetic people, invented for this test only) ---------------
const A = { id: 'u-daniel', name: 'Daniel Osei',
  headline: 'DePaul junior, recruiting for summer 2027 IB internships',
  need: 'mock-interview practice with someone who has been through a JPMorgan superday',
  offer: "a current read on DePaul's recruiting timeline and which firms are still interviewing" };
const B = { id: 'u-priya', name: 'Priya Nair',
  headline: '2024 JPMorgan alum, third-year analyst',
  need: 'to mentor one DePaul student this recruiting cycle',
  offer: 'superday prep and straight feedback on technicals' };
const REASONING = {
  forA: 'Priya sat the exact superday Daniel is preparing for, at the firm at the top of his list',
  forB: "Daniel is recruiting for the same seat Priya once held as an intern, and his questions are specific enough to make the call worth her time",
};
const TIMES = [
  { start: '2026-10-23T20:00:00.000Z', label: 'Thu Oct 23, 3:00 PM CT' },
  { start: '2026-10-24T15:30:00.000Z', label: 'Fri Oct 24, 10:30 AM CT' },
];
const EVENT = { type: 'intro_unlocked', proposalId: 'prop-001', aId: 'u-daniel', bId: 'u-priya', at: T_UNLOCK };

// --- Consent wiring over the real 157 fixture --------------------------------
function makeConsentLedger() {
  const states = new Map();
  const grant = (uid, at) => {
    let s = states.get(uid);
    if (!s) { s = Consent.emptyConsentState(uid, T0).state; }
    s = Consent.grantConsent(s, 'matched', { at, source_surface: 'app' }).state;
    s = Consent.grantConsent(s, 'introduced', { at, source_surface: 'app' }).state;
    states.set(uid, s);
  };
  const revoke = (uid, scope, at) => {
    states.set(uid, Consent.revokeConsent(states.get(uid), scope, { at, source_surface: 'app' }).state);
  };
  const isConsented = (uid, scope) => {
    const s = states.get(uid);
    return s ? Consent.isConsented(s, scope) : false;
  };
  return { grant, revoke, isConsented };
}

function makeDelivery(ledger) {
  let clock = T_UNLOCK;
  const eng = D.createIntroDelivery({
    composeIntro: Intro.composeIntro,
    isConsented: ledger.isConsented,
    now: () => clock,
  });
  return { eng, setClock: (ms) => { clock = ms; } };
}

function happyInput() {
  return { event: EVENT, a: A, b: B, reasoning: REASONING, proposedTimes: TIMES };
}

// --- DELIV-001: no unlock event = no delivery, no record ----------------------
test('DELIV-001 no unlock event produces no delivery and no record', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  for (const bad of [null, undefined, {}, { event: null }, { event: { type: 'something_else', proposalId: 'x', aId: 'u-daniel', bId: 'u-priya', at: T_UNLOCK } }]) {
    const r = eng.plan(bad);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'NO_UNLOCK_EVENT');
    assert.equal(r.delivery, undefined);
  }
  assert.equal(JSON.parse(eng.snapshot()).deliveries.length, 0);
});

// --- DELIV-002: malformed unlock event ---------------------------------------
test('DELIV-002 malformed unlock event is refused by code, never recorded', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const r = eng.plan({ event: { type: 'intro_unlocked', aId: 'u-daniel', bId: 'u-priya', at: T_UNLOCK }, a: A, b: B, reasoning: REASONING });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_UNLOCK_EVENT');
  assert.equal(JSON.parse(eng.snapshot()).deliveries.length, 0);
  const self = eng.plan({ event: { type: 'intro_unlocked', proposalId: 'p-x', aId: 'u-daniel', bId: 'u-daniel', at: T_UNLOCK }, a: A, b: B, reasoning: REASONING });
  assert.equal(self.ok, false);
  assert.equal(self.code, 'INVALID_UNLOCK_EVENT');
});

// --- DELIV-003: happy path — plan, rows, shapes -------------------------------
test('DELIV-003 unlock + consent + profiles plans two inbox rows carrying the 159 text', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const r = eng.plan(happyInput());
  assert.equal(r.ok, true);
  assert.equal(r.duplicate, undefined);
  const d = r.delivery;
  assert.equal(d.state, 'planned');
  assert.equal(d.proposal_id, 'prop-001');
  assert.equal(d.intro_id, 'intro:prop-001');
  assert.equal(d.a_id, 'u-daniel');
  assert.equal(d.b_id, 'u-priya');
  assert.equal(d.booking_status, 'offered_not_booked');

  const introRows = d.rows.filter((x) => x.purpose === 'intro');
  assert.equal(introRows.length, 2);
  const expectedText = Intro.composeIntro({ a: A, b: B, reasoning: REASONING, proposedTimes: TIMES, introAt: INTRO_ISO, matchId: 'prop-001', introId: 'intro:prop-001' }).message;
  for (const side of ['a', 'b']) {
    const row = introRows.find((x) => x.side === side);
    assert.equal(row.surface, 'inbox');
    assert.equal(row.user_id, side === 'a' ? 'u-daniel' : 'u-priya');
    assert.equal(row.outbox.kind, 'status');
    assert.equal(row.outbox.key, `status:intro:prop-001:${side}`);
    assert.equal(row.outbox.user_id, row.user_id);
    assert.equal(row.outbox.text, expectedText);
    assert.equal(row.outbox.deliver_at, INTRO_ISO);
    assert.equal(row.outbox_row_id, null);
  }
});

// --- DELIV-004: follow-up rows ride the live 'followup' kind, due exactly ----
test('DELIV-004 follow-up rows are planned at intro + 72h exactly', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const d = eng.plan(happyInput()).delivery;
  const fu = d.rows.filter((x) => x.purpose === 'follow_up');
  assert.equal(fu.length, 2);
  assert.equal(d.follow_up_due_at, new Date(T_UNLOCK + H72).toISOString());
  for (const side of ['a', 'b']) {
    const row = fu.find((x) => x.side === side);
    assert.equal(row.outbox.kind, 'followup');
    assert.equal(row.outbox.key, `followup:intro:prop-001:${side}`);
    assert.equal(Date.parse(row.outbox.deliver_at) - Date.parse(INTRO_ISO), H72);
    assert.ok(row.outbox.text.includes('checking in on the intro'));
  }
});

// --- DELIV-005: consent revoked between unlock and delivery ------------------
test('DELIV-005 consent revoked after unlock: delivery refused AND recorded, zero rows', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  // The unlock fired while both consented (module 158's world). Then Priya
  // revokes "introduced" — retroactively (157 semantics) — before delivery.
  ledger.revoke('u-priya', 'introduced', '2026-10-21T16:30:00.000Z');
  const { eng } = makeDelivery(ledger);
  const r = eng.plan(happyInput());
  assert.equal(r.ok, false);
  assert.equal(r.code, 'CONSENT_NOT_HELD_AT_DELIVERY');
  assert.ok(r.delivery, 'a refusal is a recorded delivery, not silence');
  assert.equal(r.delivery.state, 'refused');
  assert.equal(r.delivery.reason, 'CONSENT_NOT_HELD_AT_DELIVERY');
  assert.equal(r.delivery.refused_side, 'b');
  assert.equal(r.delivery.rows.length, 0);
  // and it persists: the refusal is in the snapshot, and a re-plan is a duplicate
  const again = eng.plan(happyInput());
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(again.delivery.state, 'refused');
  assert.equal(JSON.parse(eng.snapshot()).deliveries.length, 1);
});

// --- DELIV-006: consent never held --------------------------------------------
test('DELIV-006 a side that never granted "introduced" is refused and recorded', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); // Priya never grants
  const { eng } = makeDelivery(ledger);
  const r = eng.plan(happyInput());
  assert.equal(r.ok, false);
  assert.equal(r.code, 'CONSENT_NOT_HELD_AT_DELIVERY');
  assert.equal(r.delivery.refused_side, 'b');
  assert.equal(r.delivery.rows.length, 0);
});

// --- DELIV-007: planted private fields never reach text or record -------------
test('DELIV-007 planted email/phone/notes/internal fields appear nowhere in the delivery', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const planted = {
    a: { ...A, email: 'daniel.secret@example.com', phone: '+1-312-555-0147', notes: 'INTERNAL: legacy banker, do not pitch', internal_note: 'flag: vip-relative', tags: ['stealth'] },
    b: { ...B, email: 'priya.private@example.com', phone: '+1-646-555-0199', notes: 'INTERNAL: asked not to be named', ssn_fragment: '078-05' },
  };
  const r = eng.plan({ event: EVENT, a: planted.a, b: planted.b, reasoning: REASONING, proposedTimes: TIMES });
  assert.equal(r.ok, true);
  const blob = JSON.stringify(r.delivery) + eng.snapshot();
  for (const s of ['daniel.secret@example.com', 'priya.private@example.com', '+1-312-555-0147', '+1-646-555-0199',
                   'INTERNAL: legacy banker', 'INTERNAL: asked not to be named', 'vip-relative', 'stealth', '078-05']) {
    assert.ok(!blob.includes(s), `leaked: ${s}`);
  }
  for (const row of r.delivery.rows) {
    assert.ok(!row.outbox.text.includes('@example.com'));
  }
});

// --- DELIV-008: duplicate event = one delivery, incl. across restore ----------
test('DELIV-008 duplicate unlock events plan exactly one delivery, even across snapshot/restore', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const first = eng.plan(happyInput());
  const second = eng.plan(happyInput());
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.delivery.id, first.delivery.id);
  assert.equal(second.delivery.rows.length, first.delivery.rows.length);
  assert.equal(JSON.parse(eng.snapshot()).deliveries.length, 1);

  const restored = D.createIntroDelivery(
    { composeIntro: Intro.composeIntro, isConsented: ledger.isConsented, now: () => T_UNLOCK },
    eng.snapshot());
  const third = restored.plan(happyInput());
  assert.equal(third.duplicate, true);
  assert.equal(third.delivery.state, 'planned');
  assert.equal(JSON.parse(restored.snapshot()).deliveries.length, 1);
});

// --- DELIV-009: state machine happy transitions --------------------------------
test('DELIV-009 planned -> written -> read_back_verified, transitions enforced in order', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const d = eng.plan(happyInput()).delivery;

  const early = eng.markReadBack(d.id, { aText: 'x', bText: 'y' });
  assert.equal(early.ok, false);
  assert.equal(early.code, 'INVALID_TRANSITION');

  const w = eng.markWritten(d.id, { 'status:intro:prop-001:a': 101, 'status:intro:prop-001:b': 102, 'followup:intro:prop-001:a': 103, 'followup:intro:prop-001:b': 104 });
  assert.equal(w.ok, true);
  assert.equal(w.delivery.state, 'written');
  assert.equal(w.delivery.rows.find((x) => x.outbox.key === 'status:intro:prop-001:a').outbox_row_id, 101);

  const text = d.rows.find((x) => x.purpose === 'intro').outbox.text;
  const rb = eng.markReadBack(d.id, { aText: text, bText: text });
  assert.equal(rb.ok, true);
  assert.equal(rb.delivery.state, 'read_back_verified');

  const after = eng.markFailed(d.id, 'LATE_FAILURE');
  assert.equal(after.ok, false);
  assert.equal(after.code, 'INVALID_TRANSITION');
});

// --- DELIV-010: partial write report is refused, state unchanged ---------------
test('DELIV-010 markWritten without both intro row ids fails named and changes nothing', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const d = eng.plan(happyInput()).delivery;
  const w = eng.markWritten(d.id, { 'status:intro:prop-001:a': 101 });
  assert.equal(w.ok, false);
  assert.equal(w.code, 'INCOMPLETE_WRITE_REPORT');
  assert.equal(eng.get(d.id).state, 'planned');
});

// --- DELIV-011: read-back mismatch fails named, with the side ------------------
test('DELIV-011 read-back text mismatch transitions to failed_named with the side named', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const d = eng.plan(happyInput()).delivery;
  eng.markWritten(d.id, { 'status:intro:prop-001:a': 101, 'status:intro:prop-001:b': 102 });
  const text = d.rows.find((x) => x.purpose === 'intro').outbox.text;
  const rb = eng.markReadBack(d.id, { aText: text, bText: text + ' (edited)' });
  assert.equal(rb.ok, false);
  assert.equal(rb.code, 'READBACK_MISMATCH');
  const after = eng.get(d.id);
  assert.equal(after.state, 'failed_named');
  assert.equal(after.reason, 'READBACK_MISMATCH');
  assert.equal(after.failed_side, 'b');
});

// --- DELIV-012: host-reported failure ------------------------------------------
test('DELIV-012 markFailed from planned records the named failure, terminally', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const d = eng.plan(happyInput()).delivery;
  const f = eng.markFailed(d.id, 'OUTBOX_INSERT_CONFLICT');
  assert.equal(f.ok, true);
  assert.equal(f.delivery.state, 'failed_named');
  assert.equal(f.delivery.reason, 'OUTBOX_INSERT_CONFLICT');
  const retry = eng.markWritten(d.id, { 'status:intro:prop-001:a': 1, 'status:intro:prop-001:b': 2 });
  assert.equal(retry.ok, false);
  assert.equal(retry.code, 'INVALID_TRANSITION');
});

// --- DELIV-013: event/profile identity mismatch ---------------------------------
test('DELIV-013 profiles that do not match the unlock event are refused and recorded', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const wrong = { ...B, id: 'u-someone-else' };
  const r = eng.plan({ event: EVENT, a: A, b: wrong, reasoning: REASONING });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'EVENT_PROFILE_MISMATCH');
  assert.equal(r.delivery.state, 'refused');
  assert.equal(r.delivery.rows.length, 0);
});

// --- DELIV-014: composer refusal is recorded, not papered over -------------------
test('DELIV-014 when 159 refuses (missing why for one side) the delivery is refused and recorded', () => {
  const ledger = makeConsentLedger(); ledger.grant('u-daniel', T0); ledger.grant('u-priya', T0);
  const { eng } = makeDelivery(ledger);
  const r = eng.plan({ event: EVENT, a: A, b: B, reasoning: { forA: REASONING.forA } });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'COMPOSER_REFUSED');
  assert.equal(r.delivery.state, 'refused');
  assert.deepEqual(r.delivery.composer_missing, ['reasoning.forB']);
  assert.equal(r.delivery.rows.length, 0);
});

// --- DELIV-015: constructor contract --------------------------------------------
test('DELIV-015 createIntroDelivery requires composeIntro and isConsented', () => {
  assert.throws(() => D.createIntroDelivery({ isConsented: () => true }), TypeError);
  assert.throws(() => D.createIntroDelivery({ composeIntro: Intro.composeIntro }), TypeError);
  assert.throws(() => D.createIntroDelivery(), TypeError);
});
