// Connector match HOST adapter (162). Check: node --test tests/career-connector-match-host.test.cjs
// Lane B: host persistence + proposal surfacing for the 158 double opt-in
// state machine. FAIL-FIRST: this suite was committed before module 162
// existed (suite red: module not found). Every invariant in the module
// header is pinned here. Fixtures only; no I/O beyond the modules.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const M = require(path.join(root, "packages/domain/158-career-connector-match.js"));
const H = require(path.join(root, "packages/domain/162-career-connector-match-host.js"));

const T0 = 1_800_000_000_000; // 2027-01-15T08:00:00.000Z — fixed clock base
const TTL = 72 * 3600 * 1000;
const EXP_ISO = "2027-01-18T08:00:00.000Z"; // T0 + TTL

function harness(consentedIds, startAt = T0) {
  let now = startAt;
  let n = 0;
  const consented = new Set(consentedIds);
  const deps = {
    createMatch: M.createConnectorMatch,
    isConsented: (id) => consented.has(id),
    now: () => now,
    nextId: () => "cm-" + (++n),
  };
  return { deps, setNow: (t) => { now = t; }, advance: (ms) => { now += ms; }, now: () => now };
}
const PITCH_A = { need: "a peer who has prepped for a superday", offer: "mock-interview practice" };
const PITCH_B = { need: "an alum perspective on analyst life", offer: "a warm referral path" };
const PITCH_C = { need: "a second pair of eyes on a model test", offer: "a careful red-pen" };
const PITCH_D = { need: "a mock LBO partner this weekend", offer: "coffee and honest feedback" };

function boot(h) {
  const empty = H.emptyStore(h.now());
  assert.equal(empty.ok, true, JSON.stringify(empty));
  const r = H.restoreMachine(empty.store, h.deps);
  assert.equal(r.ok, true, JSON.stringify(r));
  return { store: empty.store, machine: r.machine };
}
function proposeOk(machine, over = {}) {
  const r = machine.propose(Object.assign({
    aId: "user-a", bId: "user-b", aPitch: PITCH_A, bPitch: PITCH_B,
    why: "same target firm, complementary prep stage", ttlMs: TTL,
  }, over));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.proposal;
}
function persistOk(h, store, machine) {
  const r = H.persistMachine(store, machine, h.now());
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.store;
}

// ---------- store lifecycle ----------

test("emptyStore: canonical empty shape; bad timestamp refused by name", () => {
  const h = harness([]);
  const r = H.emptyStore(h.now());
  assert.equal(r.ok, true);
  assert.equal(r.store.kind, "connector_match_store");
  assert.equal(r.store.index.kind, "connector_match_index");
  assert.equal(r.store.index.seq, 0);
  assert.deepEqual(r.store.index.entries, []);
  assert.deepEqual(r.store.snapshots, {});
  assert.deepEqual(r.store.outbox, []);
  const bad = H.emptyStore("not-a-time");
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "INVALID_TIMESTAMP");
});

test("serialize -> parse -> serialize is byte-stable", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  proposeOk(machine);
  const s1 = persistOk(h, store, machine);
  const j1 = H.serializeStore(s1);
  assert.equal(typeof j1, "string");
  const back = H.parseStore(j1);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.equal(H.serializeStore(back.store), j1);
});

// ---------- restore after restart ----------

test("restore-after-restart resumes open proposals exactly (state, answers, payload)", () => {
  const h = harness(["user-a", "user-b", "user-c", "user-d"]);
  const { store, machine } = boot(h);
  const p1 = proposeOk(machine);
  const p2 = proposeOk(machine, { aId: "user-c", bId: "user-d", aPitch: PITCH_C, bPitch: PITCH_D, why: "model-test swap" });
  machine.answer(p1.id, "a", "yes");
  let s = persistOk(h, store, machine);

  // restart: serialize to the carried string, parse, restore a fresh machine
  const back = H.parseStore(H.serializeStore(s));
  assert.equal(back.ok, true);
  const r = H.restoreMachine(back.store, h.deps);
  assert.equal(r.ok, true, JSON.stringify(r));
  const m2 = r.machine;
  const open1 = m2.openProposalFor("user-a");
  assert.equal(open1.id, p1.id);
  assert.equal(open1.state, "a_answered");
  assert.equal(open1.aAnswer, "yes");
  assert.equal(open1.bAnswer, null);
  const open2 = m2.openProposalFor("user-c");
  assert.equal(open2.id, p2.id);
  assert.equal(open2.state, "proposed");
  const payload = m2.payloadForB(p1.id);
  assert.equal(payload.ok, true);
  assert.equal(payload.payload.need, PITCH_B.need);

  // finish the flow on the restored machine; exactly one unlock delivery
  m2.answer(p1.id, "b", "yes");
  s = persistOk(h, back.store, m2);
  assert.equal(s.snapshots[p1.id].record.state, "both_yes");
  assert.equal(s.outbox.length, 1);
  assert.equal(s.outbox[0].proposal_id, p1.id);

  // second restart: state survives, no second delivery is minted
  const back2 = H.parseStore(H.serializeStore(s));
  const r2 = H.restoreMachine(back2.store, h.deps);
  assert.equal(r2.machine.get(p1.id).state, "both_yes");
  const s2 = persistOk(h, back2.store, r2.machine);
  assert.equal(s2.outbox.length, 1);
});

test("two proposals for disjoint pairs coexist in index + snapshots", () => {
  const h = harness(["user-a", "user-b", "user-c", "user-d"]);
  const { store, machine } = boot(h);
  const p1 = proposeOk(machine);
  const p2 = proposeOk(machine, { aId: "user-c", bId: "user-d", aPitch: PITCH_C, bPitch: PITCH_D, why: "model-test swap" });
  const s = persistOk(h, store, machine);
  assert.equal(s.index.entries.length, 2);
  assert.deepEqual(Object.keys(s.snapshots).sort(), [p1.id, p2.id].sort());
  const e2 = s.index.entries.find((e) => e.proposal_id === p2.id);
  assert.equal(e2.a_id, "user-c");
  assert.equal(e2.b_id, "user-d");
  assert.equal(e2.state, "proposed");
});

test("same person in two pairs: 158's OPEN_PROPOSAL_EXISTS refusal passes through; store keeps one", () => {
  const h = harness(["user-a", "user-b", "user-c"]);
  const { store, machine } = boot(h);
  proposeOk(machine);
  const r = machine.propose({ aId: "user-a", bId: "user-c", aPitch: PITCH_A, bPitch: PITCH_C, why: "second pair", ttlMs: TTL });
  assert.equal(r.ok, false);
  assert.equal(r.code, "OPEN_PROPOSAL_EXISTS");
  const s = persistOk(h, store, machine);
  assert.equal(s.index.entries.length, 1);
  assert.equal(s.index.entries.filter((e) => e.a_id === "user-a" || e.b_id === "user-a").length, 1);
});

// ---------- corrupt records: named refusal, never a crash or a drop ----------

test("corrupt: truncated JSON string -> CORRUPT_RECORD, no throw", () => {
  const r = H.parseStore('{"kind":"connector_match_store","ind');
  assert.equal(r.ok, false);
  assert.equal(r.code, "CORRUPT_RECORD");
});

test("corrupt: proposal record with an impossible state -> refusal naming the snapshot", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  const p = proposeOk(machine);
  const s = persistOk(h, store, machine);
  const raw = JSON.parse(H.serializeStore(s));
  raw.snapshots[p.id].record.state = "banana";
  const r = H.parseStore(JSON.stringify(raw));
  assert.equal(r.ok, false);
  assert.equal(r.code, "CORRUPT_RECORD");
  assert.ok(String(r.where).includes(p.id), JSON.stringify(r));
});

test("corrupt: index entry without a snapshot record -> refusal", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  const p = proposeOk(machine);
  const s = persistOk(h, store, machine);
  const raw = JSON.parse(H.serializeStore(s));
  delete raw.snapshots[p.id];
  const r = H.parseStore(JSON.stringify(raw));
  assert.equal(r.ok, false);
  assert.equal(r.code, "CORRUPT_RECORD");
});

test("corrupt: future store version -> named refusal, not a guess", () => {
  const h = harness([]);
  const { store } = boot(h);
  const raw = JSON.parse(H.serializeStore(store));
  raw.version = 99;
  const r = H.parseStore(JSON.stringify(raw));
  assert.equal(r.ok, false);
  assert.equal(r.code, "CORRUPT_RECORD");
  assert.ok(/version/.test(r.reason), JSON.stringify(r));
});

test("corrupt: restoreMachine refuses bad deps and bad stores by name, never throws", () => {
  const h = harness(["user-a"]);
  const { store } = boot(h);
  const noFactory = H.restoreMachine(store, { isConsented: () => true });
  assert.equal(noFactory.ok, false);
  assert.equal(noFactory.code, "INVALID_DEPS");
  const noStore = H.restoreMachine(null, h.deps);
  assert.equal(noStore.ok, false);
  assert.equal(noStore.code, "CORRUPT_RECORD");
});

test("corrupt: a machine whose snapshot cannot be read -> named refusal, store untouched", () => {
  const h = harness([]);
  const { store } = boot(h);
  const broken = { snapshot: () => "this is not json" };
  const r = H.persistMachine(store, broken, h.now());
  assert.equal(r.ok, false);
  assert.equal(r.code, "SNAPSHOT_UNREADABLE");
  const empty = H.emptyStore(h.now()).store;
  assert.deepEqual(store, empty);
});

test("corrupt: an unknown machine event type -> named refusal, never silently dropped", () => {
  const h = harness([]);
  const { store } = boot(h);
  const weird = { snapshot: () => JSON.stringify({ v: 1, seq: 0, proposals: [], events: [{ type: "mystery_event", at: T0 }] }) };
  const r = H.persistMachine(store, weird, h.now());
  assert.equal(r.ok, false);
  assert.equal(r.code, "UNKNOWN_EVENT");
});

// ---------- forward compatibility ----------

test("forward-compat: unknown fields on records and store survive parse + persist verbatim", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  const p = proposeOk(machine);
  const s = persistOk(h, store, machine);
  const raw = JSON.parse(H.serializeStore(s));
  raw.snapshots[p.id].record.future_field = { nested: [1, 2, 3] };
  raw.future_top_level = "keep me";
  const back = H.parseStore(JSON.stringify(raw));
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.deepEqual(back.store.snapshots[p.id].record.future_field, { nested: [1, 2, 3] });
  assert.equal(back.store.future_top_level, "keep me");
  const r = H.restoreMachine(back.store, h.deps);
  assert.equal(r.ok, true);
  const s2 = persistOk(h, back.store, r.machine);
  assert.deepEqual(s2.snapshots[p.id].record.future_field, { nested: [1, 2, 3] });
});

// ---------- unlock outbox: at-least-once, deduped ----------

test("outbox: unlock lands exactly once across re-persist, restore, and pre-drained events", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  const p = proposeOk(machine);
  machine.answer(p.id, "a", "yes");
  machine.answer(p.id, "b", "yes");
  // host drained the events itself this turn and hands them over
  const drained = machine.drainEvents();
  assert.equal(drained.length, 1);
  let s = H.persistMachine(store, machine, h.now(), { events: drained });
  assert.equal(s.ok, true, JSON.stringify(s));
  s = s.store;
  assert.equal(s.outbox.length, 1);
  const d = s.outbox[0];
  assert.equal(d.kind, "connector_intro_delivery");
  assert.equal(d.dedupe_key, p.id + "@" + new Date(T0).toISOString());
  assert.equal(d.delivered_at, null);
  // re-persist the same machine state: no duplicate
  s = persistOk(h, s, machine);
  assert.equal(s.outbox.length, 1);
  // restart + persist again: still exactly one
  const back = H.parseStore(H.serializeStore(s));
  const r = H.restoreMachine(back.store, h.deps);
  s = persistOk(h, back.store, r.machine);
  assert.equal(s.outbox.length, 1);
});

test("outbox: an unlocked record with a lost outbox entry is backfilled exactly once", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  const p = proposeOk(machine);
  machine.answer(p.id, "a", "yes");
  machine.answer(p.id, "b", "yes");
  let s = persistOk(h, store, machine);
  assert.equal(s.outbox.length, 1);
  // simulate the lost write: outbox emptied, records intact
  const raw = JSON.parse(H.serializeStore(s));
  raw.outbox = [];
  const back = H.parseStore(JSON.stringify(raw));
  assert.equal(back.ok, true, JSON.stringify(back));
  const r = H.restoreMachine(back.store, h.deps);
  s = persistOk(h, back.store, r.machine);
  assert.equal(s.outbox.length, 1);
  assert.equal(s.outbox[0].proposal_id, p.id);
});

test("outbox: pending + ack lifecycle — ack is idempotent, unknown key refused by name", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  const p = proposeOk(machine);
  machine.answer(p.id, "a", "yes");
  machine.answer(p.id, "b", "yes");
  const s = persistOk(h, store, machine);
  const pend = H.pendingDeliveries(s);
  assert.equal(pend.ok, true);
  assert.equal(pend.deliveries.length, 1);
  const key = pend.deliveries[0].dedupe_key;
  const acked = H.ackDelivery(s, key, h.now());
  assert.equal(acked.ok, true, JSON.stringify(acked));
  assert.equal(acked.already, false);
  assert.equal(H.pendingDeliveries(acked.store).deliveries.length, 0);
  const again = H.ackDelivery(acked.store, key, h.now());
  assert.equal(again.ok, true);
  assert.equal(again.already, true);
  const unknown = H.ackDelivery(acked.store, "nope@never", h.now());
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "DELIVERY_NOT_FOUND");
});

// ---------- carriage (profile-carried pattern, mirrors 157) ----------

test("carriage: attach/read round-trip; original profile untouched; corrupt carriage refused by name", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  proposeOk(machine);
  const s = persistOk(h, store, machine);
  const profile = { user_id: "host-record", name: "Matcher" };
  const attached = H.attachToProfile(profile, s);
  assert.equal(attached.ok, true, JSON.stringify(attached));
  assert.equal(profile[H.CARRIAGE_KEY], undefined); // input never mutated
  const back = H.readFromProfile(attached.profile);
  assert.equal(back.ok, true);
  assert.equal(H.serializeStore(back.store), H.serializeStore(s));
  const absent = H.readFromProfile({ user_id: "x" });
  assert.equal(absent.ok, true);
  assert.equal(absent.store, null);
  const corruptProfile = { [H.CARRIAGE_KEY]: { kind: "connector_match_store", version: 1, index: { entries: "nope" } } };
  const refused = H.readFromProfile(corruptProfile);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "CORRUPT_RECORD");
});

test("persistMachine never mutates the input store", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  proposeOk(machine);
  const before = H.serializeStore(store);
  persistOk(h, store, machine);
  assert.equal(H.serializeStore(store), before);
});

// ---------- surfacing texts ----------

test("surfacing: proposal text is the golden rendering and carries no identity", () => {
  const text = H.renderProposalText({ proposalId: "cm-1", need: PITCH_B.need, offer: PITCH_B.offer, why: "same target firm, complementary prep stage", expiresAt: T0 + TTL });
  const expected =
    "Found someone for you to meet.\n" +
    "What they need: an alum perspective on analyst life\n" +
    "What they offer: a warm referral path\n" +
    "Why you two: same target firm, complementary prep stage\n" +
    "Nothing about you is shared unless you both say yes. Reply YES to meet them, or NO to pass. This one's open until " + EXP_ISO + ".";
  assert.equal(text, expected);
  assert.ok(!text.includes("user-a") && !text.includes("user-b") && !text.includes("cm-1"));
});

test("surfacing: current proposal for a user — open, then waiting after their yes", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  const p = proposeOk(machine);
  let s = persistOk(h, store, machine);
  const forB = H.currentProposalText(s, "user-b", h.now());
  assert.equal(forB.ok, true);
  assert.equal(forB.status, "open");
  assert.ok(forB.text.includes(PITCH_B.need));
  machine.answer(p.id, "b", "yes");
  s = persistOk(h, s, machine);
  const waiting = H.currentProposalText(s, "user-b", h.now());
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.text, H.TEXTS.WAITING);
  const stillOpen = H.currentProposalText(s, "user-a", h.now());
  assert.equal(stillOpen.status, "open");
  const nobody = H.currentProposalText(s, "user-z", h.now());
  assert.equal(nobody.status, "none");
  assert.equal(nobody.text, null);
});

test("surfacing: expiry is honest — past the deadline the text says so, record left for the machine", () => {
  const h = harness(["user-a", "user-b"]);
  const { store, machine } = boot(h);
  proposeOk(machine);
  const s = persistOk(h, store, machine);
  h.advance(TTL + 1);
  const r = H.currentProposalText(s, "user-a", h.now());
  assert.equal(r.status, "expired");
  assert.equal(r.text, H.TEXTS.EXPIRED);
  assert.equal(s.index.entries[0].state, "proposed"); // surfacing never mutates the record
});

test("surfacing: decline reads differently for the decliner and the other side; both-yes reads as good news", () => {
  const h = harness(["user-a", "user-b", "user-c", "user-d"]);
  const { store, machine } = boot(h);
  const p1 = proposeOk(machine);
  const p2 = proposeOk(machine, { aId: "user-c", bId: "user-d", aPitch: PITCH_C, bPitch: PITCH_D, why: "model-test swap" });
  machine.answer(p1.id, "a", "no");
  machine.answer(p2.id, "a", "yes"); // user-c is side a of p2
  machine.answer(p2.id, "b", "yes"); // user-d is side b of p2
  const s = persistOk(h, store, machine);
  const decliner = H.currentProposalText(s, "user-a", h.now());
  assert.equal(decliner.status, "declined_self");
  assert.equal(decliner.text, H.TEXTS.DECLINED_SELF);
  const other = H.currentProposalText(s, "user-b", h.now());
  assert.equal(other.status, "closed");
  assert.equal(other.text, H.TEXTS.CLOSED);
  const yes = H.currentProposalText(s, "user-c", h.now());
  assert.equal(yes.status, "both_yes");
  assert.equal(yes.text, H.TEXTS.BOTH_YES);
});

// ---------- answer parser ----------

test("parser: only an explicit standalone yes/no counts as an answer", () => {
  const open = { hasOpenProposal: true };
  for (const t of ["yes", "Yes", "YES!", "  yes  ", "yes please", "I'm in", "count me in", "yeah", "yep"]) {
    assert.deepEqual(H.parseAnswer(t, open), { type: "answer", value: "yes" }, t);
  }
  for (const t of ["no", "No.", "no thanks", "pass", "I'll pass", "nope", "not for me"]) {
    assert.deepEqual(H.parseAnswer(t, open), { type: "answer", value: "no" }, t);
  }
});

test("parser: everything else is conversation, never an answer", () => {
  const open = { hasOpenProposal: true };
  for (const t of ["yes but not this week", "yeah maybe", "what do you mean?", "tell me more first", "yess", "no way jose", "", "   ", "maybe later"]) {
    const r = H.parseAnswer(t, open);
    assert.equal(r.type, "not_an_answer", t);
  }
  assert.equal(H.parseAnswer(null, open).type, "not_an_answer");
  assert.equal(H.parseAnswer(42, open).type, "not_an_answer");
});

test("parser: a yes with no open proposal is conversation, not an answer", () => {
  const r = H.parseAnswer("yes", { hasOpenProposal: false });
  assert.equal(r.type, "not_an_answer");
  assert.equal(r.reason, "no_open_proposal");
});
