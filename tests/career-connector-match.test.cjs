// Connector double opt-in state machine (158). Check: node --test tests/career-connector-match.test.cjs
// Lane B package 2 of 4: pure state machine — consent comes from the injected
// isConsented predicate (package 1 owns the consent model); the intro composer
// (package 4) consumes the single intro_unlocked event. This file is the
// fail-first guard: every invariant in the module header is pinned here.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const M = require(path.join(root, "packages/domain/158-career-connector-match.js"));

const T0 = 1_800_000_000_000; // fixed clock base — deterministic tests
function harness(consentedIds, startAt = T0) {
  let now = startAt;
  const consented = new Set(consentedIds);
  const machine = M.createConnectorMatch({
    isConsented: (id) => consented.has(id),
    now: () => now,
  });
  return { machine, consented, setNow: (t) => { now = t; }, advance: (ms) => { now += ms; } };
}
const PITCH_A = { need: "a peer who has prepped for a superday", offer: "mock-interview practice" };
const PITCH_B = { need: "an alum perspective on analyst life", offer: "a warm referral path" };
function proposeOk(machine, over = {}) {
  const r = machine.propose(Object.assign({
    aId: "user-a", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B,
    why: "same target firm, complementary prep stage", ttlMs: 72 * 3600 * 1000,
  }, over));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.proposal;
}

// ---------- creation + consent gate ----------

test("propose: both sides consented -> state proposed, expiry = created + ttl", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  assert.equal(p.state, "proposed");
  assert.equal(p.aAnswer, null); assert.equal(p.bAnswer, null);
  assert.equal(p.createdAt, T0); assert.equal(p.expiresAt, T0 + 72 * 3600 * 1000);
  assert.equal(p.introUnlocked, false);
});

test("propose: A not consented -> refused NOT_CONSENTED, nothing stored", () => {
  const { machine } = harness(["user-b"]);
  const r = machine.propose({ aId: "user-a", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 1000 });
  assert.equal(r.ok, false); assert.equal(r.code, "NOT_CONSENTED"); assert.equal(r.side, "a");
  assert.equal(machine.openProposalFor("user-b"), null);
});

test("propose: B not consented -> refused NOT_CONSENTED side b", () => {
  const { machine } = harness(["user-a"]);
  const r = machine.propose({ aId: "user-a", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 1000 });
  assert.equal(r.ok, false); assert.equal(r.code, "NOT_CONSENTED"); assert.equal(r.side, "b");
});

test("propose: consent revoked after opt-in still refuses (predicate read at creation)", () => {
  const { machine, consented } = harness(["user-a", "user-b"]);
  consented.delete("user-b");
  const r = machine.propose({ aId: "user-a", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 1000 });
  assert.equal(r.ok, false); assert.equal(r.code, "NOT_CONSENTED");
});

test("propose: self match refused", () => {
  const { machine } = harness(["user-a"]);
  const r = machine.propose({ aId: "user-a", bId: "user-a", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 1000 });
  assert.equal(r.ok, false); assert.equal(r.code, "SELF_MATCH");
});

test("propose: missing/invalid fields refused", () => {
  const { machine } = harness(["user-a", "user-b"]);
  assert.equal(machine.propose({ aId: "user-a", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 0 }).code, "INVALID_TTL");
  assert.equal(machine.propose({ aId: "user-a", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: -5 }).code, "INVALID_TTL");
  assert.equal(machine.propose({ aId: "", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 1000 }).code, "INVALID_INPUT");
  assert.equal(machine.propose({ aId: "user-a", bId: "user-b", aPitch: { offer: "x" }, bPitch: PITCH_B, why: "w", ttlMs: 1000 }).code, "INVALID_INPUT");
  assert.equal(machine.propose({ aId: "user-a", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B, why: "", ttlMs: 1000 }).code, "INVALID_INPUT");
});

// ---------- one open proposal per person ----------

test("one-open: second proposal involving A (either side) refused while first is open", () => {
  const { machine } = harness(["user-a", "user-b", "user-c"]);
  proposeOk(machine);
  const r1 = machine.propose({ aId: "user-a", bId: "user-c", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 1000 });
  assert.equal(r1.ok, false); assert.equal(r1.code, "OPEN_PROPOSAL_EXISTS");
  const r2 = machine.propose({ aId: "user-c", bId: "user-a", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 1000 });
  assert.equal(r2.ok, false); assert.equal(r2.code, "OPEN_PROPOSAL_EXISTS");
  const r3 = machine.propose({ aId: "user-c", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 1000 });
  assert.equal(r3.ok, false); assert.equal(r3.code, "OPEN_PROPOSAL_EXISTS");
});

test("one-open: after a terminal state the same people can be proposed again", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  machine.answer(p.id, "a", "no");
  const p2 = proposeOk(machine);
  assert.notEqual(p2.id, p.id); assert.equal(p2.state, "proposed");
});

// ---------- transition table ----------

test("transitions: A yes -> a_answered; B yes -> both_yes with exactly one unlock event", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  let r = machine.answer(p.id, "a", "yes");
  assert.equal(r.ok, true); assert.equal(r.proposal.state, "a_answered"); assert.equal(r.proposal.aAnswer, "yes");
  assert.equal(machine.drainEvents().length, 0);
  r = machine.answer(p.id, "b", "yes");
  assert.equal(r.proposal.state, "both_yes"); assert.equal(r.proposal.introUnlocked, true);
  const ev = machine.drainEvents();
  assert.equal(ev.length, 1); assert.equal(ev[0].type, "intro_unlocked");
  assert.equal(ev[0].proposalId, p.id); assert.equal(ev[0].aId, "user-a"); assert.equal(ev[0].bId, "user-b");
});

test("transitions: B yes first -> b_answered; A yes -> both_yes", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  assert.equal(machine.answer(p.id, "b", "yes").proposal.state, "b_answered");
  assert.equal(machine.answer(p.id, "a", "yes").proposal.state, "both_yes");
});

test("transitions: A no from proposed -> declined (terminal, no reason demanded)", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  const r = machine.answer(p.id, "a", "no");
  assert.equal(r.proposal.state, "declined"); assert.equal(r.proposal.aAnswer, "no");
  assert.equal(machine.drainEvents().length, 0);
});

test("transitions: B no after A yes -> declined", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  machine.answer(p.id, "a", "yes");
  assert.equal(machine.answer(p.id, "b", "no").proposal.state, "declined");
});

test("transitions: B no from proposed -> declined", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  assert.equal(machine.answer(p.id, "b", "no").proposal.state, "declined");
});

// ---------- exactly once per side / replay safety ----------

test("exactly-once: repeat answer from the same side is a no-op returning current state", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  machine.answer(p.id, "a", "yes");
  const r = machine.answer(p.id, "a", "no"); // tries to flip — must NOT decline
  assert.equal(r.ok, true); assert.equal(r.noop, true);
  assert.equal(r.proposal.state, "a_answered"); assert.equal(r.proposal.aAnswer, "yes");
});

test("double-fire: replaying both yeses after both_yes emits no second unlock event", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  machine.answer(p.id, "a", "yes"); machine.answer(p.id, "b", "yes");
  assert.equal(machine.drainEvents().length, 1);
  machine.answer(p.id, "a", "yes"); machine.answer(p.id, "b", "yes"); machine.answer(p.id, "a", "no");
  assert.equal(machine.get(p.id).state, "both_yes");
  assert.equal(machine.drainEvents().length, 0);
});

test("terminal: answers after declined are no-ops; state never leaves declined", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  machine.answer(p.id, "b", "no");
  const r = machine.answer(p.id, "a", "yes");
  assert.equal(r.noop, true); assert.equal(r.proposal.state, "declined");
  assert.equal(machine.drainEvents().length, 0);
});

test("snapshot/restore: a restored both_yes machine still emits no second unlock", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  machine.answer(p.id, "a", "yes"); machine.answer(p.id, "b", "yes");
  machine.drainEvents();
  const snap = machine.snapshot();
  const restored = M.createConnectorMatch({ isConsented: () => true, now: () => T0 }, snap);
  assert.equal(restored.get(p.id).state, "both_yes");
  restored.answer(p.id, "a", "yes");
  assert.equal(restored.drainEvents().length, 0);
  // ids stay unique after restore
  const p2 = restored.propose({ aId: "u1", bId: "u2", aPitch: PITCH_A, bPitch: PITCH_B, why: "w", ttlMs: 1000 });
  assert.equal(p2.ok, true); assert.notEqual(p2.proposal.id, p.id);
});

// ---------- illegal transitions / bad input ----------

test("illegal: answering an unknown proposal -> NOT_FOUND", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const r = machine.answer("nope", "a", "yes");
  assert.equal(r.ok, false); assert.equal(r.code, "NOT_FOUND");
});

test("illegal: bad side or bad answer value -> INVALID_ANSWER, state untouched", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  assert.equal(machine.answer(p.id, "c", "yes").code, "INVALID_ANSWER");
  assert.equal(machine.answer(p.id, "a", "maybe").code, "INVALID_ANSWER");
  assert.equal(machine.get(p.id).state, "proposed");
});

// ---------- expiry ----------

test("expiry: an answer at/after expiresAt is not applied — proposal goes expired", () => {
  const { machine, advance } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine, { ttlMs: 1000 });
  advance(1000); // exactly at the deadline
  const r = machine.answer(p.id, "a", "yes");
  assert.equal(r.ok, true); assert.equal(r.proposal.state, "expired"); assert.equal(r.proposal.aAnswer, null);
  assert.equal(machine.drainEvents().length, 0);
});

test("expiry: an answer one ms before the deadline still applies", () => {
  const { machine, advance } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine, { ttlMs: 1000 });
  advance(999);
  assert.equal(machine.answer(p.id, "a", "yes").proposal.state, "a_answered");
});

test("expiry: expireSweep moves open proposals past deadline, leaves live ones", () => {
  const { machine, advance } = harness(["user-a", "user-b", "user-c", "user-d"]);
  const p1 = proposeOk(machine, { ttlMs: 1000 });
  const p2 = proposeOk(machine, { aId: "user-c", bId: "user-d", ttlMs: 5000 });
  advance(2000);
  const swept = machine.expireSweep();
  assert.deepEqual(swept, [p1.id]);
  assert.equal(machine.get(p1.id).state, "expired");
  assert.equal(machine.get(p2.id).state, "proposed");
});

test("expiry: a past-deadline open proposal does not block a fresh proposal", () => {
  const { machine, advance } = harness(["user-a", "user-b"]);
  proposeOk(machine, { ttlMs: 1000 });
  advance(2000);
  const p2 = proposeOk(machine, { ttlMs: 1000 });
  assert.equal(p2.state, "proposed");
});

// ---------- identity containment (the consent-load-bearing invariant) ----------

test("identity: pitch intake strips every field except need/offer", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const stuffed = { need: "n", offer: "o", name: "Priya Nair", email: "priya@example.test", userId: "user-b", firm: "Example Bank", title: "Analyst", phone: "+1 555 0100" };
  const p = proposeOk(machine, { bPitch: stuffed, aPitch: stuffed });
  assert.deepEqual(Object.keys(p.bPitch).sort(), ["need", "offer"]);
  assert.deepEqual(Object.keys(p.aPitch).sort(), ["need", "offer"]);
});

test("identity: the B-facing payload cannot contain identity fields or values", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const stuffed = { need: "an alum perspective", offer: "a warm referral path", name: "Priya Nair", email: "priya@example.test", userId: "user-a", firm: "Example Bank" };
  const p = proposeOk(machine, { bPitch: stuffed });
  const r = machine.payloadForB(p.id);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.payload).sort(), ["expiresAt", "need", "offer", "proposalId", "why"]);
  const s = JSON.stringify(r.payload);
  for (const leak of ["Priya", "priya@example.test", "Example Bank", "user-a", "\"name\"", "\"email\"", "\"firm\""]) {
    assert.ok(!s.includes(leak), "payload leaked: " + leak);
  }
  assert.equal(r.payload.need, "an alum perspective");
});

test("identity: the A-facing payload is symmetric — summary only", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const stuffed = { need: "x", offer: "y", name: "Sam Reyes", email: "sam@example.test", userId: "user-b" };
  const p = proposeOk(machine, { aPitch: stuffed });
  const r = machine.payloadForA(p.id);
  assert.equal(r.ok, true);
  const s = JSON.stringify(r.payload);
  for (const leak of ["Sam", "sam@example.test", "user-b", "\"name\"", "\"email\""]) {
    assert.ok(!s.includes(leak), "payload leaked: " + leak);
  }
});

test("identity: payloads stay summary-only even after both_yes (reveal is the composer's job, not the machine's)", () => {
  const { machine } = harness(["user-a", "user-b"]);
  const p = proposeOk(machine);
  machine.answer(p.id, "a", "yes"); machine.answer(p.id, "b", "yes");
  const s = JSON.stringify(machine.payloadForB(p.id).payload);
  assert.ok(!s.includes("user-a") && !s.includes("user-b"));
});

test("factory: a missing isConsented predicate is a hard error, not a silent allow", () => {
  assert.throws(() => M.createConnectorMatch({ now: () => 0 }), TypeError);
  assert.throws(() => M.createConnectorMatch(), TypeError);
});
