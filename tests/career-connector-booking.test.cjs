// Career connector INTRO BOOKING (module 160): in-product time agreement —
// both sides confirm the SAME proposed slot, the confirmed record + a
// byte-stable .ics file are the booking artifact. No Google, no calendar
// API, no sends. Check: node --test tests/career-connector-booking.test.cjs
// All people below are TEST FIXTURES, invented for this suite only.
// Timezone expectations were grounded with `date -d` against the host tz
// database on 2026-10-21 (see BOOK-012..014 comments for the groundings).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const B = require(path.join(root, 'packages/domain/160-career-connector-booking.js'));

const T0 = '2026-10-21T17:00:00.000Z'; // a Wednesday, 12:00 CDT
const TTL = 72 * 60 * 60 * 1000;

function makeClock(startIso) {
  let t = Date.parse(startIso || T0);
  return { now: () => t, set: (iso) => { t = Date.parse(iso); }, addMs: (ms) => { t += ms; } };
}
function makeIds() { let n = 0; return () => 'bk-test-' + (++n); }
function make(clock) { return B.createConnectorBooking({ now: (clock || makeClock()).now, nextId: makeIds() }); }

const PEOPLE = { aId: 'u-daniel', bId: 'u-priya', aName: 'Daniel Osei', bName: 'Priya Nair', matchId: 'm-001', introId: 'i-001' };
// r1s1: Fri 2026-10-23 14:00 Chicago = 19:00Z · r1s2: 15:30 Chicago = 20:30Z
// r1s3: Sat 2026-10-24 09:30 Kolkata = 04:00Z
const SLOTS1 = [
  { start: '2026-10-23T14:00', timezone: 'America/Chicago' },
  { start: '2026-10-23T15:30', timezone: 'America/Chicago' },
  { start: '2026-10-24T09:30', timezone: 'Asia/Kolkata' },
];
const SLOTS2 = [
  { start: '2026-10-26T10:00', timezone: 'America/Chicago' },
  { start: '2026-10-26T16:00', timezone: 'America/Chicago' },
];

function proposed(clock) {
  const bk = make(clock);
  const r = bk.propose({ ...PEOPLE, slots: SLOTS1 });
  assert.equal(r.ok, true);
  return { bk, rec: r.record };
}

// --- Agreement semantics -----------------------------------------------------

test('BOOK-001 both sides confirm the same slot -> booked, with both timestamps', () => {
  const clock = makeClock();
  const { bk, rec } = proposed(clock);
  assert.equal(rec.state, 'awaiting_confirmations');
  assert.equal(rec.round, 1);
  clock.set('2026-10-21T18:00:00.000Z');
  const c1 = bk.confirm(rec.id, 'a', ['r1s1', 'r1s2']);
  assert.equal(c1.ok, true);
  assert.equal(c1.record.state, 'awaiting_confirmations');
  clock.set('2026-10-21T19:30:00.000Z');
  const c2 = bk.confirm(rec.id, 'b', ['r1s1']);
  assert.equal(c2.ok, true);
  assert.equal(c2.record.state, 'booked');
  const booked = c2.record.booked;
  assert.equal(booked.status, 'booked');
  assert.equal(booked.slotId, 'r1s1');
  assert.equal(booked.startUtc, '2026-10-23T19:00:00.000Z');
  assert.equal(booked.endUtc, '2026-10-23T19:20:00.000Z'); // default 20 min
  assert.equal(booked.timezone, 'America/Chicago');
  assert.equal(booked.localStart, '2026-10-23T14:00');
  assert.equal(booked.aConfirmedAt, '2026-10-21T18:00:00.000Z');
  assert.equal(booked.bConfirmedAt, '2026-10-21T19:30:00.000Z');
  assert.equal(booked.calendar_event_created, false); // no Google event exists
  const ev = bk.drainEvents();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'booking_booked');
  assert.equal(ev[0].slotId, 'r1s1');
  assert.equal(bk.drainEvents().length, 0);
});

test('BOOK-002 first common slot in PROPOSAL order wins when both accept several', () => {
  const { bk, rec } = proposed();
  bk.confirm(rec.id, 'a', ['r1s3', 'r1s1']); // A lists s3 first
  const c = bk.confirm(rec.id, 'b', ['r1s1', 'r1s3']); // B lists s1 first
  assert.equal(c.record.state, 'booked');
  assert.equal(c.record.booked.slotId, 'r1s1'); // proposal order, not answer order
});

test('BOOK-003 mismatched confirmations never book; round closes to needs_new_times', () => {
  const { bk, rec } = proposed();
  bk.confirm(rec.id, 'a', ['r1s1']);
  const c = bk.confirm(rec.id, 'b', ['r1s2']);
  assert.equal(c.record.state, 'needs_new_times');
  assert.equal(c.record.booked, null);
  assert.equal(c.record.round, 1);
  const ev = bk.drainEvents();
  assert.deepEqual(ev.map((e) => e.type), ['booking_needs_new_times']);
});

test('BOOK-004 one side declining all slots sends it back to propose immediately', () => {
  const { bk, rec } = proposed();
  bk.confirm(rec.id, 'a', ['r1s1']);
  const d = bk.declineAll(rec.id, 'b');
  assert.equal(d.record.state, 'needs_new_times'); // even though A had confirmed
  assert.equal(d.record.booked, null);
  // A late confirm from the other side against the closed round is a no-op.
  const late = bk.confirm(rec.id, 'a', ['r1s2']);
  assert.equal(late.noop, true);
  assert.equal(bk.get(rec.id).state, 'needs_new_times');
});

test('BOOK-005 round 2 with fresh times can still book', () => {
  const { bk, rec } = proposed();
  bk.declineAll(rec.id, 'a');
  const p2 = bk.proposeTimes(rec.id, SLOTS2);
  assert.equal(p2.ok, true);
  assert.equal(p2.record.round, 2);
  assert.equal(p2.record.state, 'awaiting_confirmations');
  assert.deepEqual(p2.record.slots.map((s) => s.id), ['r2s1', 'r2s2']);
  bk.confirm(rec.id, 'a', ['r2s2']);
  const c = bk.confirm(rec.id, 'b', ['r2s2']);
  assert.equal(c.record.state, 'booked');
  assert.equal(c.record.booked.slotId, 'r2s2');
  assert.equal(c.record.booked.round, 2);
  assert.equal(c.record.booked.startUtc, '2026-10-26T21:00:00.000Z'); // 16:00 CDT
});

test('BOOK-006 two failed rounds -> honestly unbooked, terminal', () => {
  const { bk, rec } = proposed();
  bk.declineAll(rec.id, 'a'); // round 1 dead
  bk.proposeTimes(rec.id, SLOTS2);
  const d = bk.declineAll(rec.id, 'b'); // round 2 dead
  assert.equal(d.record.state, 'unbooked');
  assert.equal(d.record.unbookedReason, 'rounds_exhausted');
  assert.equal(d.record.booked, null);
  const ev = bk.drainEvents();
  assert.equal(ev[ev.length - 1].type, 'booking_unbooked');
  // Terminal: nothing moves it again.
  assert.equal(bk.proposeTimes(rec.id, SLOTS2).ok, false);
  assert.equal(bk.confirm(rec.id, 'a', ['r2s1']).noop, true);
  assert.equal(bk.get(rec.id).state, 'unbooked');
});

// --- Expiry and staleness ----------------------------------------------------

test('BOOK-007 a confirmation after the proposal expires is a no-op; record expires', () => {
  const clock = makeClock();
  const { bk, rec } = proposed(clock);
  clock.addMs(TTL + 1000); // past expiresAt
  const c = bk.confirm(rec.id, 'a', ['r1s1']);
  assert.equal(c.noop, true);
  assert.equal(c.expired, true);
  assert.equal(bk.get(rec.id).state, 'expired');
  assert.equal(bk.get(rec.id).unbookedReason, 'expired');
  const ev = bk.drainEvents();
  assert.deepEqual(ev.map((e) => e.type), ['booking_expired']);
});

test('BOOK-008 a confirmation naming superseded (round-1) slots in round 2 is a no-op', () => {
  const { bk, rec } = proposed();
  bk.declineAll(rec.id, 'a');
  bk.proposeTimes(rec.id, SLOTS2);
  const stale = bk.confirm(rec.id, 'b', ['r1s1', 'r1s3']); // round-1 ids only
  assert.equal(stale.noop, true);
  assert.equal(stale.reason, 'stale_slots');
  assert.equal(bk.get(rec.id).responses.b, null); // nothing recorded
  // The same side can still answer the live round properly.
  const ok = bk.confirm(rec.id, 'b', ['r2s1']);
  assert.equal(ok.ok, true);
  assert.equal(ok.noop, undefined);
  assert.deepEqual(bk.get(rec.id).responses.b.slotIds, ['r2s1']);
});

test('BOOK-009 exactly one response per side per round; the first stands', () => {
  const { bk, rec } = proposed();
  bk.confirm(rec.id, 'a', ['r1s1']);
  const again = bk.confirm(rec.id, 'a', ['r1s2']);
  assert.equal(again.noop, true);
  assert.deepEqual(bk.get(rec.id).responses.a.slotIds, ['r1s1']);
  const flip = bk.declineAll(rec.id, 'a'); // cannot flip a confirm into a decline
  assert.equal(flip.noop, true);
  assert.equal(bk.get(rec.id).responses.a.declinedAll, false);
});

test('BOOK-010 a booked record is terminal: later answers change nothing', () => {
  const { bk, rec } = proposed();
  bk.confirm(rec.id, 'a', ['r1s1']);
  bk.confirm(rec.id, 'b', ['r1s1']);
  const before = JSON.stringify(bk.get(rec.id));
  assert.equal(bk.confirm(rec.id, 'a', ['r1s2']).noop, true);
  assert.equal(bk.declineAll(rec.id, 'b').noop, true);
  assert.equal(bk.proposeTimes(rec.id, SLOTS2).ok, false);
  assert.equal(JSON.stringify(bk.get(rec.id)), before);
});

test('BOOK-020 needs_new_times expires if no new times arrive in the window', () => {
  const clock = makeClock();
  const { bk, rec } = proposed(clock);
  bk.declineAll(rec.id, 'a'); // round closes at T0; new-times window = T0 + TTL
  clock.addMs(TTL + 1000);
  const swept = bk.expireSweep();
  assert.deepEqual(swept, [rec.id]);
  assert.equal(bk.get(rec.id).state, 'expired');
  assert.equal(bk.proposeTimes(rec.id, SLOTS2).ok, false);
  assert.equal(bk.get(rec.id).state, 'expired'); // never resurrects
});

// --- Validation ----------------------------------------------------------------

test('BOOK-011 invalid proposals are refused with named codes', () => {
  const bk = make();
  const bad = (input, code) => {
    const r = bk.propose(input);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.equal(r.code, code, JSON.stringify(input));
  };
  bad({ ...PEOPLE, slots: [] }, 'INVALID_SLOTS');
  bad({ ...PEOPLE, slots: [...SLOTS1, { start: '2026-10-25T10:00', timezone: 'America/Chicago' }] }, 'INVALID_SLOTS'); // 4 slots
  bad({ ...PEOPLE, slots: [{ start: '2026-10-23T14:00', timezone: 'Mars/Olympus_Mons' }] }, 'INVALID_SLOT');
  bad({ ...PEOPLE, slots: [{ start: '2026-13-40T99:99', timezone: 'America/Chicago' }] }, 'INVALID_SLOT');
  bad({ ...PEOPLE, slots: [{ start: 'not-a-time', timezone: 'America/Chicago' }] }, 'INVALID_SLOT');
  bad({ ...PEOPLE, slots: [{ start: '2026-10-23T14:00', timezone: 'America/Chicago', durationMin: 0 }] }, 'INVALID_SLOT');
  bad({ ...PEOPLE, slots: [{ start: '2026-10-20T14:00', timezone: 'America/Chicago' }] }, 'INVALID_SLOT'); // in the past at T0
  bad({ bId: 'u-priya', aName: 'Daniel Osei', bName: 'Priya Nair', slots: SLOTS1 }, 'INVALID_INPUT'); // no aId
  bad({ ...PEOPLE, bId: PEOPLE.aId, slots: SLOTS1 }, 'INVALID_INPUT'); // same person both sides
  bad({ ...PEOPLE, slots: SLOTS1, ttlMs: 0 }, 'INVALID_TTL');
});

test('BOOK-014 the same instant in two timezones is a duplicate slot', () => {
  const bk = make();
  // Grounded: 2026-10-23 14:00 EDT and 11:00 PDT are the same instant, 18:00Z.
  const r = bk.propose({ ...PEOPLE, slots: [
    { start: '2026-10-23T14:00', timezone: 'America/New_York' },
    { start: '2026-10-23T11:00', timezone: 'America/Los_Angeles' },
  ] });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_SLOT');
});

test('BOOK-023 unknown booking id is NOT_FOUND on every method', () => {
  const bk = make();
  assert.equal(bk.get('nope'), null);
  assert.equal(bk.confirm('nope', 'a', ['r1s1']).code, 'NOT_FOUND');
  assert.equal(bk.declineAll('nope', 'a').code, 'NOT_FOUND');
  assert.equal(bk.proposeTimes('nope', SLOTS2).code, 'NOT_FOUND');
  assert.equal(bk.ics('nope').code, 'NOT_FOUND');
});

test('BOOK-024 proposeTimes outside needs_new_times is refused, record unchanged', () => {
  const { bk, rec } = proposed();
  const before = JSON.stringify(rec);
  const r = bk.proposeTimes(rec.id, SLOTS2);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'WRONG_STATE');
  assert.equal(JSON.stringify(bk.get(rec.id)), before);
});

// --- Timezone math (grounded with `date -d`, 2026-10-21) -----------------------

test('BOOK-012 Chicago daylight time: 2026-10-23 14:00 CDT = 19:00Z', () => {
  // Grounding: TZ=America/Chicago date -d "2026-10-23 14:00" +%s = 1792782000.
  const { rec } = proposed();
  assert.equal(rec.slots[0].startMin, 1792782000 * 1000);
  assert.equal(rec.slots[0].startUtc, '2026-10-23T19:00:00.000Z');
});

test('BOOK-013 Chicago standard time: 2026-11-06 14:00 CST = 20:00Z', () => {
  // Grounding: TZ=America/Chicago date -d "2026-11-06 14:00" +%s = 1793995200 (DST ended Nov 1).
  const bk = make();
  const r = bk.propose({ ...PEOPLE, slots: [{ start: '2026-11-06T14:00', timezone: 'America/Chicago' }] });
  assert.equal(r.record.slots[0].startMin, 1793995200 * 1000);
  assert.equal(r.record.slots[0].startUtc, '2026-11-06T20:00:00.000Z');
});

test('BOOK-014b Kolkata half-hour zone: 2026-10-24 09:30 IST = 04:00Z', () => {
  // Grounding: TZ=Asia/Kolkata date -d "2026-10-24 09:30" +%s = 1792814400.
  const { rec } = proposed();
  assert.equal(rec.slots[2].startMin, 1792814400 * 1000);
  assert.equal(rec.slots[2].startUtc, '2026-10-24T04:00:00.000Z');
});

test('BOOK-022 per-slot duration override flows into the booked end time', () => {
  const bk = make();
  const r = bk.propose({ ...PEOPLE, slots: [{ start: '2026-10-23T14:00', timezone: 'America/Chicago', durationMin: 30 }] });
  bk.confirm(r.record.id, 'a', ['r1s1']);
  const c = bk.confirm(r.record.id, 'b', ['r1s1']);
  assert.equal(c.record.booked.durationMin, 30);
  assert.equal(c.record.booked.endUtc, '2026-10-23T19:30:00.000Z');
});

// --- The .ics artifact -----------------------------------------------------------

function bookedFixture() {
  const clock = makeClock();
  const { bk, rec } = proposed(clock);
  clock.set('2026-10-21T18:00:00.000Z');
  bk.confirm(rec.id, 'a', ['r1s1', 'r1s2']);
  clock.set('2026-10-21T19:30:00.000Z');
  bk.confirm(rec.id, 'b', ['r1s1']);
  return { bk, rec: bk.get(rec.id) };
}

test('BOOK-015 the .ics is golden: UTC times, first names only, nothing invented', () => {
  const { bk, rec } = bookedFixture();
  const out = bk.ics(rec.id);
  assert.equal(out.ok, true);
  const ics = out.ics;
  // Structural law: CRLF endings, no line over 75 octets.
  assert.ok(ics.endsWith('\r\n'));
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'line too long: ' + line);
  }
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DTSTART:20261023T190000Z\r\n'));
  assert.ok(unfolded.includes('DTEND:20261023T192000Z\r\n'));
  assert.ok(unfolded.includes('DTSTAMP:20261021T193000Z\r\n'));
  assert.ok(unfolded.includes('SUMMARY:Intro call: Daniel + Priya\r\n'));
  // Nothing invented, nothing private: no location, no link, no surnames, no emails.
  assert.ok(!/LOCATION/i.test(ics));
  assert.ok(!/http/i.test(ics));
  assert.ok(!ics.includes('Osei') && !ics.includes('Nair'));
  assert.equal(ics, GOLDEN_ICS);
});

test('BOOK-016 the .ics is byte-stable: repeated builds and snapshot/restore agree', () => {
  const { bk, rec } = bookedFixture();
  const first = bk.ics(rec.id).ics;
  assert.equal(bk.ics(rec.id).ics, first);
  assert.equal(B.buildICalendar(rec), first);
  const restored = B.createConnectorBooking({ now: makeClock().now, nextId: makeIds() }, bk.snapshot());
  assert.equal(restored.ics(rec.id).ics, first);
});

test('BOOK-017 no .ics before booked=true', () => {
  const { bk, rec } = proposed();
  const out = bk.ics(rec.id);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'NOT_BOOKED');
  assert.equal(B.buildICalendar(rec), null);
});

test('BOOK-018 planted private fields never reach the record or the .ics', () => {
  const clock = makeClock();
  const bk = make(clock);
  const r = bk.propose({ ...PEOPLE, aEmail: 'daniel@example.com', bPhone: '+1-555-0100', slots: SLOTS1 });
  clock.set('2026-10-21T18:00:00.000Z');
  bk.confirm(r.record.id, 'a', ['r1s1']);
  bk.confirm(r.record.id, 'b', ['r1s1']);
  const blob = JSON.stringify(bk.get(r.record.id)) + bk.ics(r.record.id).ics;
  assert.ok(!blob.includes('daniel@example.com'));
  assert.ok(!blob.includes('555-0100'));
});

test('BOOK-021 a mixed stale+live confirmation applies the live slots only', () => {
  const { bk, rec } = proposed();
  bk.declineAll(rec.id, 'a');
  bk.proposeTimes(rec.id, SLOTS2);
  const c = bk.confirm(rec.id, 'b', ['r1s1', 'r2s2']); // one stale, one live
  assert.equal(c.ok, true);
  assert.deepEqual(bk.get(rec.id).responses.b.slotIds, ['r2s2']);
});

test('BOOK-019 the booked event fires exactly once across snapshot/restore', () => {
  const clock = makeClock();
  const { bk, rec } = proposed(clock);
  bk.confirm(rec.id, 'a', ['r1s1']);
  bk.confirm(rec.id, 'b', ['r1s1']);
  const snap = bk.snapshot(); // snapshot BEFORE the event is drained
  const restored = B.createConnectorBooking({ now: clock.now, nextId: makeIds() }, snap);
  assert.equal(restored.drainEvents().filter((e) => e.type === 'booking_booked').length, 1);
  assert.equal(restored.drainEvents().length, 0);
  const restored2 = B.createConnectorBooking({ now: clock.now, nextId: makeIds() }, restored.snapshot());
  assert.equal(restored2.drainEvents().length, 0); // drained events never re-emit
});

// Pinned after byte inspection against the grounded values (BOOK-015 checks
// every field independently before this equality runs).
const GOLDEN_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Trainee//Connector Booking 2026-10-21//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'BEGIN:VEVENT',
  'UID:bk-test-1@trainee.connector',
  'DTSTAMP:20261021T193000Z',
  'DTSTART:20261023T190000Z',
  'DTEND:20261023T192000Z',
  'SUMMARY:Intro call: Daniel + Priya',
  'DESCRIPTION:Booked in Trainee: both sides confirmed this slot. 2026-10-23T14',
  ' :00 America/Chicago (20261023T190000Z). Daniel confirmed 2026-10-21T18:00:0',
  ' 0.000Z\\; Priya confirmed 2026-10-21T19:30:00.000Z.',
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');
