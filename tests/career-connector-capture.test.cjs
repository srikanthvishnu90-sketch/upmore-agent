// Connector consent capture (164). Check: node --test tests/career-connector-capture.test.cjs
// Fail-first guard for the Lane B consent-capture package: the deterministic
// chat state machine that asks a real user what they need / what they offer,
// shows the exact summary, and records a 157 consent grant ONLY on an
// unambiguous affirmative to that exact summary. Consent is load-bearing
// (spec §CONNECTOR): ambiguous replies never grant, an edit re-shows the
// summary and voids a prior yes, revoke ends capture at any point, and the
// gate (156's decision, injected) closes the whole flow when it says closed.
// The suite runs against the REAL 157 module (vendored byte-identical on
// this branch, sha256 2892aab776b3add0226da644c6df9ce50ccb79c7617102eccfef5d15e5b19d1d)
// so the consent arithmetic exercised here is the production arithmetic.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const C = require(path.join(root, "packages/domain/157-career-connector-consent.js"));
const Cap = require(path.join(root, "packages/domain/164-career-connector-capture.js"));

const T0 = "2026-10-21T12:00:00.000Z";
const T1 = "2026-10-21T12:05:00.000Z";
const T2 = "2026-10-21T12:10:00.000Z";
const T3 = "2026-10-21T12:15:00.000Z";
const T4 = "2026-10-21T12:20:00.000Z";
const T5 = "2026-10-21T12:25:00.000Z";
const T6 = "2026-10-21T12:30:00.000Z";
const UID = "user-capture-1";
const NEED = "an intro to an analyst at a bank I am applying to";
const OFFER = "I can walk through the interview process at my firm";
const OPEN = { allowed: true, reason: "allowed", userId: UID };
const SHUT = { allowed: false, reason: "disabled", userId: UID };
const NOT_LISTED = { allowed: false, reason: "not_listed", userId: UID };

function machine(extra) {
  return Cap.createConnectorCapture(Object.assign(
    { consentApi: C, gateDecision: OPEN, surface: "imessage", now: () => Date.parse(T0) }, extra || {}));
}
function toConfirm(m, need, offer) {
  const s = m.start(UID, { at: T0 });
  assert.equal(s.ok, true, `start: ${s.code}`);
  m.handle(need == null ? NEED : need, { at: T1 });
  return m.handle(offer == null ? OFFER : offer, { at: T2 });
}
function grantedMachine() {
  const m = machine();
  toConfirm(m);
  const r = m.handle("yes", { at: T3 });
  assert.equal(r.code, "GRANTED");
  return m;
}
function deepFreeze(o) {
  if (o && typeof o === "object") { for (const k of Object.keys(o)) deepFreeze(o[k]); Object.freeze(o); }
  return o;
}

test("surface: pinned constants, steps, and ask texts exist as constants", () => {
  assert.equal(Cap.VERSION, 1);
  assert.equal(Cap.KIND, "connector_capture_flow");
  assert.equal(Cap.GRANT_WORD, "yes");
  assert.deepEqual(Cap.STEPS, ["idle", "ask_need", "ask_offer", "confirm", "done", "declined", "revoked"]);
  for (const k of ["ASK_NEED", "ASK_OFFER", "GRANTED", "DECLINED", "REVOKED_RECORDED", "REVOKED_EMPTY", "GATE_CLOSED", "ENDED", "DONE_HELP"]) {
    assert.equal(typeof Cap.TEXTS[k], "string", k);
    assert.ok(Cap.TEXTS[k].length > 0, k);
  }
});

test("gate: a closed decision refuses start — nothing begins, nothing is recorded", () => {
  const m = machine({ gateDecision: SHUT });
  const r = m.start(UID, { at: T0 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "GATE_CLOSED");
  assert.equal(r.reason, "disabled");
  assert.equal(r.step, "idle");
  assert.equal(r.reply, Cap.TEXTS.GATE_CLOSED);
  assert.equal(m.step(), "idle");
  assert.equal(m.snapshot(), null);
});

test("gate: not_listed refuses with its reason; an ABSENT decision also refuses (fail closed)", () => {
  const a = machine({ gateDecision: NOT_LISTED });
  assert.equal(a.start(UID, { at: T0 }).reason, "not_listed");
  const b = machine({ gateDecision: null });
  const r = b.start(UID, { at: T0 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "GATE_CLOSED");
});

test("gate: a decision made for a DIFFERENT user refuses", () => {
  const m = machine({ gateDecision: { allowed: true, reason: "allowed", userId: "user-someone-else" } });
  const r = m.start(UID, { at: T0 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "GATE_USER_MISMATCH");
  assert.equal(m.step(), "idle");
});

test("gate: a decision that closes MID-FLOW blocks the grant turn and changes nothing", () => {
  const m = machine();
  toConfirm(m);
  const blocked = m.handle("yes", { at: T3, gateDecision: SHUT });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "GATE_CLOSED");
  assert.equal(m.step(), "confirm");
  assert.equal(m.flow().consent_state.events.length, 0);
  const r = m.handle("yes", { at: T4, gateDecision: OPEN });
  assert.equal(r.code, "GRANTED");
});

test("flow: handle before start is refused, and start asks the need first", () => {
  const m = machine();
  const early = m.handle(NEED, { at: T0 });
  assert.equal(early.ok, false);
  assert.equal(early.code, "NOT_STARTED");
  const s = m.start(UID, { at: T0 });
  assert.equal(s.ok, true);
  assert.equal(s.step, "ask_need");
  assert.equal(s.reply, Cap.TEXTS.ASK_NEED);
});

test("flow: need then offer then the exact summary — summary names all three scopes plainly", () => {
  const m = machine();
  m.start(UID, { at: T0 });
  const n = m.handle(NEED, { at: T1 });
  assert.equal(n.step, "ask_offer");
  assert.equal(n.reply, Cap.TEXTS.ASK_OFFER);
  const o = m.handle(OFFER, { at: T2 });
  assert.equal(o.step, "confirm");
  const expected = Cap.buildSummary(NEED, OFFER);
  assert.equal(o.reply, expected);
  assert.ok(expected.includes(`Need: ${NEED}`));
  assert.ok(expected.includes(`Offer: ${OFFER}`));
  assert.ok(expected.includes("consider you for matches"));
  assert.ok(expected.includes("introduce you"));
  assert.ok(expected.includes("share your contact details"));
  assert.ok(expected.includes("Reply YES to opt in"));
});

test("grant: exact 'yes' at confirm records the full chained grant + the match profile", () => {
  const m = machine();
  const shown = toConfirm(m);
  const r = m.handle("yes", { at: T3 });
  assert.equal(r.ok, true);
  assert.equal(r.code, "GRANTED");
  assert.equal(r.step, "done");
  assert.equal(r.reply, Cap.TEXTS.GRANTED);
  const res = m.result();
  assert.equal(res.status, "granted");
  assert.deepEqual(res.match_profile.needs, [NEED]);
  assert.deepEqual(res.match_profile.offers, [OFFER]);
  assert.equal(res.match_profile.visibility_scope, "internal_only");
  assert.equal(res.match_profile.user_id, UID);
  const ev = res.consent.events;
  assert.equal(ev.length, 3);
  assert.deepEqual(ev.map((e) => e.scope), ["matched", "introduced", "contacted"]);
  assert.ok(ev.every((e) => e.type === "grant" && e.at === T3 && e.source_surface === "imessage"));
  assert.deepEqual(C.consentSummary(res.consent), { matched: true, introduced: true, contacted: true, fully_opted_in: true });
  // the grant is bound to the EXACT summary that was shown
  assert.equal(m.flow().grant_digest, Cap.summaryDigest(shown.reply));
  assert.ok(ev.every((e) => e.note.includes(m.flow().grant_digest)));
});

test("grant grammar: case/space/trailing-punctuation variants of the exact word still grant", () => {
  for (const word of ["YES", " yes ", "Yes.", "yes!"]) {
    const m = machine();
    toConfirm(m);
    const r = m.handle(word, { at: T3 });
    assert.equal(r.code, "GRANTED", JSON.stringify(word));
  }
});

test("grant grammar: ambiguous replies NEVER grant — they re-show the identical summary", () => {
  const ambiguous = ["yeah", "yep", "sure", "ok", "okay", "yes please", "yes I do", "maybe", "add me", "y", "\u{1F44D}", "", "go ahead", "sounds good"];
  for (const word of ambiguous) {
    const m = machine();
    const shown = toConfirm(m);
    const r = m.handle(word, { at: T3 });
    assert.equal(r.ok, true, JSON.stringify(word));
    assert.equal(r.code, "REPROMPT", JSON.stringify(word));
    assert.equal(r.step, "confirm", JSON.stringify(word));
    assert.ok(r.reply.startsWith(shown.reply), JSON.stringify(word));
    assert.equal(m.flow().consent_state.events.length, 0, JSON.stringify(word));
    assert.equal(m.result().status, "in_progress", JSON.stringify(word));
  }
});

test("confirm: need-like free text is NOT consumed as an edit — it re-prompts, content unchanged", () => {
  const m = machine();
  toConfirm(m);
  const r = m.handle("actually I need intros to bankers instead", { at: T3 });
  assert.equal(r.code, "REPROMPT");
  assert.equal(m.flow().need, NEED);
  assert.equal(m.flow().consent_state.events.length, 0);
});

test("decline: 'no' at confirm ends capture with zero consent events and no profile", () => {
  const m = machine();
  toConfirm(m);
  const r = m.handle("no", { at: T3 });
  assert.equal(r.code, "DECLINED");
  assert.equal(r.step, "declined");
  assert.equal(r.reply, Cap.TEXTS.DECLINED);
  const res = m.result();
  assert.equal(res.status, "declined");
  assert.equal(res.match_profile, null);
  assert.equal(res.consent.events.length, 0);
  const after = m.handle("yes", { at: T4 });
  assert.equal(after.code, "ENDED");
  assert.equal(m.result().consent.events.length, 0);
});

test("asks: empty and over-280 answers re-ask in place; nothing advances, nothing records", () => {
  const m = machine();
  m.start(UID, { at: T0 });
  const e = m.handle("   ", { at: T1 });
  assert.equal(e.code, "EMPTY");
  assert.equal(e.step, "ask_need");
  const long = m.handle("x".repeat(281), { at: T1 });
  assert.equal(long.code, "TOO_LONG");
  assert.equal(long.step, "ask_need");
  const ok = m.handle(NEED, { at: T1 });
  assert.equal(ok.step, "ask_offer");
});

test("edit at confirm: EDIT NEED re-asks, re-shows a CHANGED summary, grant binds the new digest", () => {
  const m = machine();
  const shown = toConfirm(m);
  const e = m.handle("edit need", { at: T3 });
  assert.equal(e.code, "EDIT");
  assert.equal(e.step, "ask_need");
  const NEW_NEED = "a mock interview partner for next week";
  const back = m.handle(NEW_NEED, { at: T4 });
  assert.equal(back.step, "confirm");
  assert.equal(back.reply, Cap.buildSummary(NEW_NEED, OFFER));
  assert.notEqual(back.reply, shown.reply);
  const g = m.handle("yes", { at: T5 });
  assert.equal(g.code, "GRANTED");
  assert.equal(m.flow().grant_digest, Cap.summaryDigest(back.reply));
  assert.deepEqual(m.result().match_profile.needs, [NEW_NEED]);
});

test("edit AFTER a grant voids the yes: grants are revoked, re-grant needs a fresh yes to the new summary", () => {
  const m = grantedMachine();
  const before = m.result().consent.events.length;
  assert.equal(before, 3);
  const e = m.handle("EDIT OFFER", { at: T4 });
  assert.equal(e.code, "EDIT");
  assert.equal(e.step, "ask_offer");
  const mid = m.result();
  assert.equal(mid.match_profile, null);
  assert.deepEqual(C.consentSummary(mid.consent), { matched: false, introduced: false, contacted: false, fully_opted_in: false });
  assert.equal(mid.consent.events.length, 6); // 3 grants + 3 revokes, history kept
  assert.ok(mid.consent.events.slice(3).every((x) => x.type === "revoke"));
  const back = m.handle("I can review resumes", { at: T5 });
  assert.equal(back.step, "confirm");
  const g = m.handle("yes", { at: T6 });
  assert.equal(g.code, "GRANTED");
  assert.equal(m.result().consent.events.length, 9);
  assert.deepEqual(m.result().match_profile.offers, ["I can review resumes"]);
  assert.deepEqual(C.consentSummary(m.result().consent), { matched: true, introduced: true, contacted: true, fully_opted_in: true });
});

test("double yes: a second 'yes' after granting records nothing more", () => {
  const m = grantedMachine();
  const r = m.handle("yes", { at: T4 });
  assert.equal(r.code, "DONE_HELP");
  assert.equal(r.reply, Cap.TEXTS.DONE_HELP);
  assert.equal(m.result().consent.events.length, 3);
});

test("revoke mid-flow ends capture immediately — no grants, terminal", () => {
  const m = machine();
  m.start(UID, { at: T0 });
  m.handle(NEED, { at: T1 });
  const r = m.handle("revoke", { at: T2 });
  assert.equal(r.code, "REVOKED");
  assert.equal(r.step, "revoked");
  assert.equal(r.reply, Cap.TEXTS.REVOKED_EMPTY);
  assert.equal(m.result().consent.events.length, 0);
  assert.equal(m.handle(OFFER, { at: T3 }).code, "ENDED");
  assert.equal(m.step(), "revoked");
});

test("stop at confirm is a revoke path, not a decline and not a grant", () => {
  const m = machine();
  toConfirm(m);
  const r = m.handle("stop", { at: T3 });
  assert.equal(r.code, "REVOKED");
  assert.equal(r.step, "revoked");
  assert.equal(m.result().consent.events.length, 0);
});

test("revoke AFTER a grant appends revocations — consent reads back revoked for every scope", () => {
  const m = grantedMachine();
  const r = m.handle("REVOKE", { at: T4 });
  assert.equal(r.code, "REVOKED");
  assert.equal(r.step, "revoked");
  assert.equal(r.reply, Cap.TEXTS.REVOKED_RECORDED);
  const res = m.result();
  assert.equal(res.status, "revoked");
  assert.equal(res.match_profile, null);
  assert.equal(res.consent.events.length, 6);
  for (const sc of C.SCOPES) assert.equal(C.isConsented(res.consent, sc), false, sc);
});

test("serialize/restore mid-flow resumes EXACTLY — same flow, same summary, grant still binds it", () => {
  const m = machine();
  const shown = toConfirm(m);
  const snap = m.snapshot();
  assert.equal(typeof snap, "string");
  const restored = Cap.createConnectorCapture({ consentApi: C, gateDecision: OPEN, surface: "imessage", now: () => Date.parse(T0) }, snap);
  assert.deepEqual(restored.flow(), m.flow());
  assert.equal(restored.step(), "confirm");
  const g = restored.handle("yes", { at: T3 });
  assert.equal(g.code, "GRANTED");
  assert.equal(restored.flow().grant_digest, Cap.summaryDigest(shown.reply));

  // restore at an earlier step too
  const early = machine();
  early.start(UID, { at: T0 });
  early.handle(NEED, { at: T1 });
  const r2 = Cap.createConnectorCapture({ consentApi: C, gateDecision: OPEN, surface: "imessage" }, early.snapshot());
  assert.equal(r2.step(), "ask_offer");
  const o = r2.handle(OFFER, { at: T2 });
  assert.equal(o.step, "confirm");
  assert.equal(o.reply, Cap.buildSummary(NEED, OFFER));
});

test("restore: a malformed snapshot throws instead of guessing a state", () => {
  assert.throws(() => Cap.createConnectorCapture({ consentApi: C, gateDecision: OPEN }, "{not json"), TypeError);
  assert.throws(() => Cap.createConnectorCapture({ consentApi: C, gateDecision: OPEN }, JSON.stringify({ kind: "other", version: 1 })), TypeError);
  assert.throws(() => Cap.createConnectorCapture({ gateDecision: OPEN }), TypeError); // no consentApi
});

test("existing carriage: capture appends to the person's real consent log (seq continues, history kept)", () => {
  const pre = C.emptyConsentState(UID, T0).state;
  const preGrant = C.grantConsent(pre, "matched", { at: T1, source_surface: "app", note: "earlier partial opt-in" }).state;
  const existingProfile = C.createMatchProfile({ user_id: UID, needs: ["old need"], offers: ["old offer"] }, T0).profile;
  const m = machine();
  const s = m.start(UID, { at: T2, existing: { consent: preGrant, match_profile: existingProfile } });
  assert.equal(s.ok, true);
  m.handle(NEED, { at: T3 });
  m.handle(OFFER, { at: T4 });
  const g = m.handle("yes", { at: T5 });
  assert.equal(g.code, "GRANTED");
  const res = m.result();
  assert.equal(res.consent.events.length, 4); // 1 pre-existing + 3 capture grants
  assert.equal(res.consent.events[0].note, "earlier partial opt-in");
  assert.deepEqual(res.consent.events.map((e) => e.seq), [1, 2, 3, 4]);
  assert.deepEqual(res.match_profile.needs, [NEED]); // profile updated in place, not duplicated
  assert.equal(res.match_profile.created_at, T0);
});

test("existing carriage: a malformed non-null record refuses the start (fail closed)", () => {
  const m = machine();
  const s = m.start(UID, { at: T0, existing: { consent: { kind: "nope" }, match_profile: null } });
  assert.equal(s.ok, false);
  assert.equal(s.code, "BAD_EXISTING");
  assert.equal(m.step(), "idle");
});

test("purity: identical inputs give identical replies, and frozen inputs are never mutated", () => {
  const run = () => {
    const m = machine();
    const out = [];
    out.push(m.start(UID, { at: T0 }).reply);
    out.push(m.handle(NEED, { at: T1 }).reply);
    out.push(m.handle(OFFER, { at: T2 }).reply);
    out.push(m.handle("sure", { at: T3 }).reply);
    out.push(m.handle("yes", { at: T4 }).reply);
    return { out, res: JSON.stringify(m.result()) };
  };
  assert.deepEqual(run(), run());
  const frozenExisting = deepFreeze({
    consent: C.grantConsent(C.emptyConsentState(UID, T0).state, "matched", { at: T1, source_surface: "app" }).state,
    match_profile: C.createMatchProfile({ user_id: UID, needs: ["a"], offers: ["b"] }, T0).profile,
  });
  const m = machine();
  const s = m.start(UID, { at: T2, existing: frozenExisting });
  assert.equal(s.ok, true);
  m.handle(NEED, { at: T3 });
  m.handle(OFFER, { at: T4 });
  assert.equal(m.handle("yes", { at: T5 }).code, "GRANTED");
});
