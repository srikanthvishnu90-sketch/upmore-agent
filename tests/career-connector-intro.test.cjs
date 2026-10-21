// Career connector INTRO COMPOSER (module 156): warm double-opt-in intro text,
// booking offer (never a booking claim), and the 72h follow-up + due marker.
// Check: node --test tests/career-connector-intro.test.cjs
// Pure composition: no LLM, no clock, no I/O. All people below are TEST FIXTURES.
// The composer reads ONLY the consented public fields (name, headline, need,
// offer) plus the match reasoning; anything else on a profile object must
// never reach the output (INTRO-008).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const C = require(path.join(root, 'packages/domain/156-career-connector-intro.js'));

const H72 = 72 * 60 * 60 * 1000;

// --- Fixtures (synthetic people, invented for this test only) ---------------
const FIX1 = {
  matchId: 'm-001', introId: 'i-001',
  introAt: '2026-10-21T17:00:00.000Z',
  a: { id: 'u-daniel', name: 'Daniel Osei',
       headline: 'DePaul junior, recruiting for summer 2027 IB internships',
       need: 'mock-interview practice with someone who has been through a JPMorgan superday',
       offer: "a current read on DePaul's recruiting timeline and which firms are still interviewing" },
  b: { id: 'u-priya', name: 'Priya Nair',
       headline: '2024 JPMorgan alum, third-year analyst',
       need: 'to mentor one DePaul student this recruiting cycle',
       offer: 'superday prep and straight feedback on technicals' },
  reasoning: {
    forA: 'Priya sat the exact superday Daniel is preparing for, at the firm at the top of his list',
    forB: "Daniel is recruiting for the same seat Priya once held as an intern, and his questions are specific enough to make the call worth her time",
  },
  proposedTimes: [
    { start: '2026-10-23T20:00:00.000Z', label: 'Thu Oct 23, 3:00 PM CT' },
    { start: '2026-10-24T15:30:00.000Z', label: 'Fri Oct 24, 10:30 AM CT' },
  ],
};

const FIX2 = {
  matchId: 'm-002', introId: 'i-002',
  introAt: '2026-10-21T18:30:00.000Z',
  a: { id: 'u-maya', name: 'Maya Chen',
       need: 'a partner for weekly case-interview practice',
       offer: 'behavioral mock swaps and a shared question bank from two past cycles' },
  b: { id: 'u-jordan', name: 'Jordan Ellis',
       need: 'case practice with someone on the same timeline',
       offer: "a consulting-firm deadline tracker kept current through the season" },
  reasoning: {
    forA: "Jordan is drilling cases on the same weekly cadence Maya wants, for the same firm set",
    forB: "Maya brings a question bank from two past cycles, which is the piece Jordan's practice has been missing",
  },
  firstStep: 'swap one case each this week and compare notes after',
};

const FIX3 = {
  matchId: 'm-003', introId: 'i-003',
  introAt: '2026-10-21T15:00:00.000Z',
  a: { id: 'u-sam', name: 'Sam Whitfield',
       offer: 'thirty minutes of portfolio teardown for early-stage founders' },
  b: { id: 'u-leah', name: 'Leah Brooks',
       headline: 'founder, pre-seed, building scheduling tools for clinics',
       need: 'a teardown of her demo-day deck' },
  reasoning: {
    forA: 'Leah\'s deck is at the stage Sam gives feedback on, and she asked for a teardown specifically',
    forB: 'Sam offered exactly the teardown Leah is looking for, this week',
  },
  proposedTimes: [{ start: '2026-10-22T16:00:00.000Z' }],
};

// --- INTRO-001..003: golden outputs -----------------------------------------
test('INTRO-001 golden: student x alum, headlines, two proposed times', () => {
  const r = C.composeIntro(FIX1);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'composed');
  assert.equal(r.message, [
    'Daniel Osei, meet Priya Nair. Priya Nair, meet Daniel Osei.',
    '',
    'Daniel — DePaul junior, recruiting for summer 2027 IB internships. Priya — 2024 JPMorgan alum, third-year analyst.',
    '',
    "Why I'm connecting you: Priya sat the exact superday Daniel is preparing for, at the firm at the top of his list. Daniel is recruiting for the same seat Priya once held as an intern, and his questions are specific enough to make the call worth her time.",
    '',
    "What you're each after:",
    "Daniel wants mock-interview practice with someone who has been through a JPMorgan superday. Daniel can offer a current read on DePaul's recruiting timeline and which firms are still interviewing.",
    'Priya wants to mentor one DePaul student this recruiting cycle. Priya can offer superday prep and straight feedback on technicals.',
    '',
    'First step: reply in this thread and lock a time — even a rough one — while this is in front of you both.',
    '',
    "For the call: Thu Oct 23, 3:00 PM CT or Fri Oct 24, 10:30 AM CT could work. Nothing is booked yet — if one of those works for you both, say so here and I'll book it.",
    '',
    '— Trainee',
  ].join('\n'));
});

test('INTRO-002 golden: peers, no headlines, no times, custom first step', () => {
  const r = C.composeIntro(FIX2);
  assert.equal(r.ok, true);
  assert.equal(r.message, [
    'Maya Chen, meet Jordan Ellis. Jordan Ellis, meet Maya Chen.',
    '',
    "Why I'm connecting you: Jordan is drilling cases on the same weekly cadence Maya wants, for the same firm set. Maya brings a question bank from two past cycles, which is the piece Jordan's practice has been missing.",
    '',
    "What you're each after:",
    'Maya wants a partner for weekly case-interview practice. Maya can offer behavioral mock swaps and a shared question bank from two past cycles.',
    "Jordan wants case practice with someone on the same timeline. Jordan can offer a consulting-firm deadline tracker kept current through the season.",
    '',
    'First step: swap one case each this week and compare notes after.',
    '',
    'For the call: I can book a 20-minute call once you reply with times that suit you both. Nothing is booked yet.',
    '',
    '— Trainee',
  ].join('\n'));
});

test('INTRO-003 golden: one-sided fields omitted cleanly, bare time slot echoed as data', () => {
  const r = C.composeIntro(FIX3);
  assert.equal(r.ok, true);
  assert.equal(r.message, [
    'Sam Whitfield, meet Leah Brooks. Leah Brooks, meet Sam Whitfield.',
    '',
    'Leah — founder, pre-seed, building scheduling tools for clinics.',
    '',
    "Why I'm connecting you: Leah's deck is at the stage Sam gives feedback on, and she asked for a teardown specifically. Sam offered exactly the teardown Leah is looking for, this week.",
    '',
    "What you're each after:",
    'Sam can offer thirty minutes of portfolio teardown for early-stage founders.',
    'Leah wants a teardown of her demo-day deck.',
    '',
    'First step: reply in this thread and lock a time — even a rough one — while this is in front of you both.',
    '',
    "For the call: 2026-10-22T16:00:00.000Z could work. Nothing is booked yet — if that works for you both, say so here and I'll book it.",
    '',
    '— Trainee',
  ].join('\n'));
});

// --- INTRO-004: every load-bearing element present ---------------------------
test('INTRO-004 both full names, both whys, booking offer present in every compose', () => {
  for (const fix of [FIX1, FIX2, FIX3]) {
    const r = C.composeIntro(fix);
    assert.ok(r.message.includes(fix.a.name), 'side A full name');
    assert.ok(r.message.includes(fix.b.name), 'side B full name');
    assert.ok(r.message.includes(fix.reasoning.forA), 'why for A verbatim from input');
    assert.ok(r.message.includes(fix.reasoning.forB), 'why for B verbatim from input');
    assert.match(r.message, /For the call:/);
    assert.equal(r.booking.status, 'offered_not_booked');
  }
});

// --- INTRO-005/006: no invention — an absent field's claim is absent ---------
test('INTRO-005 no-invention: removing an offer removes its claim and its sentence frame', () => {
  const cut = structuredClone(FIX1);
  delete cut.b.offer;
  const r = C.composeIntro(cut);
  assert.equal(r.ok, true);
  assert.ok(!r.message.includes('superday prep and straight feedback'), 'removed offer text is gone');
  assert.ok(!r.message.includes('Priya can offer'), 'no empty offer frame left behind');
  assert.ok(r.message.includes('Priya wants to mentor'), 'the surviving field still renders');
});

test('INTRO-006 no-invention: removing a headline removes the descriptor line for that side only', () => {
  const cut = structuredClone(FIX1);
  delete cut.a.headline;
  const r = C.composeIntro(cut);
  assert.ok(!r.message.includes('recruiting for summer 2027 IB internships'), 'removed headline is gone');
  assert.ok(r.message.includes('Priya — 2024 JPMorgan alum'), 'other side headline intact');
  assert.ok(!r.message.includes('Daniel —'), 'no dangling descriptor for the cut side');
});

// --- INTRO-007: both needs/offers gone for everyone -> section omitted -------
test('INTRO-007 no needs or offers on either side: the after-section is omitted, intro still composes', () => {
  const cut = structuredClone(FIX2);
  delete cut.a.need; delete cut.a.offer; delete cut.b.need; delete cut.b.offer;
  const r = C.composeIntro(cut);
  assert.equal(r.ok, true);
  assert.ok(!r.message.includes("What you're each after:"));
  assert.ok(!r.message.includes(' wants '));
});

// --- INTRO-008: only consented public fields are read ------------------------
test('INTRO-008 private fields on the profile objects never reach any output', () => {
  const loaded = structuredClone(FIX1);
  loaded.a.email = 'daniel.private@example.com';
  loaded.a.phone = '+1 555 010 2030';
  loaded.a.internal_note = 'INTERNAL-NOTE-A-SECRET';
  loaded.b.email = 'priya.private@example.com';
  loaded.b.contact_card = 'CONTACT-CARD-B-SECRET';
  loaded.b.private_tags = ['TAG-B-SECRET'];
  const r = C.composeIntro(loaded);
  const all = JSON.stringify(r);
  for (const leak of ['daniel.private@example.com', 'priya.private@example.com', '+1 555 010 2030',
                      'INTERNAL-NOTE-A-SECRET', 'CONTACT-CARD-B-SECRET', 'TAG-B-SECRET']) {
    assert.ok(!all.includes(leak), `leaked: ${leak}`);
  }
  assert.equal(r.message, C.composeIntro(FIX1).message, 'extra fields change nothing');
});

// --- INTRO-009: booking is an offer, never a claim ---------------------------
test('INTRO-009 booking payload: offered, no calendar event, real booking gated on google connect', () => {
  const r = C.composeIntro(FIX1);
  assert.equal(r.booking.calendar_event_created, false);
  assert.equal(r.booking.payload.kind, 'connector_booking_offer');
  assert.equal(r.booking.payload.status, 'offered_not_booked');
  assert.equal(r.booking.payload.calendar_event_created, false);
  assert.equal(r.booking.payload.requires, 'google_connect');
  assert.deepEqual(r.booking.payload.proposed_times, FIX1.proposedTimes);
  assert.ok(!/is booked|I've booked|you're booked|has been booked/i.test(r.message), 'message never claims a booking');
  assert.ok(r.message.includes('Nothing is booked yet'));
});

// --- INTRO-010/011: follow-up marker + skeleton ------------------------------
test('INTRO-010 follow-up record: due exactly intro + 72h, full shape', () => {
  const r = C.composeIntro(FIX1);
  const rec = r.follow_up.record;
  assert.equal(rec.kind, 'connector_follow_up');
  assert.equal(rec.intro_id, 'i-001');
  assert.equal(rec.match_id, 'm-001');
  assert.equal(rec.a_name, 'Daniel Osei');
  assert.equal(rec.b_name, 'Priya Nair');
  assert.equal(rec.intro_at, FIX1.introAt);
  assert.equal(rec.due_at, new Date(Date.parse(FIX1.introAt) + H72).toISOString());
  assert.equal(rec.due_at, '2026-10-24T17:00:00.000Z');
  assert.equal(rec.status, 'pending');
});

test('INTRO-011 follow-up message: names filled, outcome asked — never asserted', () => {
  const r = C.composeIntro(FIX1);
  assert.equal(r.follow_up.message, [
    'Hi Daniel and Priya — checking in on the intro I made three days ago.',
    '',
    "Did the two of you get to talk? If you did, was it useful? If it stalled, reply here and I'll nudge it once.",
    '',
    '— Trainee',
  ].join('\n'));
  assert.ok(!/glad it went|great call|you (met|talked) on/i.test(r.follow_up.message), 'no invented outcome');
});

test('INTRO-012 no intro time: message composes, follow-up is null with a named warning (no invented due time)', () => {
  const cut = structuredClone(FIX1);
  delete cut.introAt;
  const r = C.composeIntro(cut);
  assert.equal(r.ok, true);
  assert.equal(r.follow_up, null);
  assert.ok(r.warnings.some((w) => w.includes('follow_up_not_scheduled')));
  const bad = C.composeIntro({ ...structuredClone(FIX1), introAt: 'not-a-date' });
  assert.equal(bad.follow_up, null);
});

// --- INTRO-013..015: refusals — no fact, no intro -----------------------------
test('INTRO-013 refuses without a why for BOTH sides (zero unexplained intros)', () => {
  const noB = structuredClone(FIX1); delete noB.reasoning.forB;
  const r = C.composeIntro(noB);
  assert.equal(r.ok, false);
  assert.equal(r.status, 'refused');
  assert.deepEqual(r.missing, ['reasoning.forB']);
  assert.equal(r.message, null);
  const noWhy = structuredClone(FIX1); delete noWhy.reasoning;
  assert.deepEqual(C.composeIntro(noWhy).missing, ['reasoning.forA', 'reasoning.forB']);
});

test('INTRO-014 refuses without both names, and on same person both sides', () => {
  const noName = structuredClone(FIX1); delete noName.b.name;
  const r = C.composeIntro(noName);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['b.name']);
  const same = structuredClone(FIX1); same.b = structuredClone(FIX1.a);
  const s = C.composeIntro(same);
  assert.equal(s.ok, false);
  assert.equal(s.reason, 'same_person_both_sides');
});

test('INTRO-015 garbage input refuses cleanly, never throws', () => {
  for (const junk of [null, undefined, {}, { a: null, b: null }, { a: { name: 42 }, b: { name: [] } }]) {
    const r = C.composeIntro(junk);
    assert.equal(r.ok, false);
    assert.equal(r.status, 'refused');
  }
});

// --- INTRO-016/017: normalization + determinism -------------------------------
test('INTRO-016 punctuation: supplied sentences keep exactly one terminal mark', () => {
  const dotted = structuredClone(FIX2);
  dotted.reasoning.forA = 'Jordan is drilling cases on the same weekly cadence Maya wants, for the same firm set.';
  dotted.a.need = 'a partner for weekly case-interview practice.';
  const r = C.composeIntro(dotted);
  assert.ok(!r.message.includes('..'), 'no doubled periods');
  assert.ok(r.message.includes('firm set. Maya brings'), 'single period survives the join');
  assert.ok(r.message.includes('Maya wants a partner for weekly case-interview practice. Maya can offer'));
});

test('INTRO-017 deterministic: same input composes byte-identical output twice', () => {
  assert.deepEqual(C.composeIntro(FIX1), C.composeIntro(structuredClone(FIX1)));
  assert.deepEqual(C.composeIntro(FIX3), C.composeIntro(FIX3));
});

test('INTRO-018 proposed times dedupe by start; entries without a start are dropped with a warning', () => {
  const dup = structuredClone(FIX1);
  dup.proposedTimes = [
    { start: '2026-10-23T20:00:00.000Z', label: 'Thu Oct 23, 3:00 PM CT' },
    { start: '2026-10-23T20:00:00.000Z', label: 'DUPLICATE LABEL' },
    { label: 'NO START SLOT' },
  ];
  const r = C.composeIntro(dup);
  assert.equal(r.booking.payload.proposed_times.length, 1);
  assert.ok(!r.message.includes('DUPLICATE LABEL'));
  assert.ok(!r.message.includes('NO START SLOT'));
  assert.ok(r.warnings.some((w) => w.includes('proposed_time_dropped')));
});
