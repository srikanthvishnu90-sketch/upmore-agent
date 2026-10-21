// Connector consent model (157). Check: node --test tests/career-connector-consent.test.cjs
// Fail-first guard for Lane B Package 1: the consent data model Trainee's
// Connector stands on. Consent is load-bearing (spec §CONNECTOR): default is
// NO consent, scopes are isolated, revocation wins over any earlier grant
// regardless of storage order, and malformed records fail CLOSED.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const C = require(path.join(root, "packages/domain/157-career-connector-consent.js"));

const T0 = "2026-10-21T12:00:00.000Z";
const T1 = "2026-10-21T13:00:00.000Z";
const T2 = "2026-10-21T14:00:00.000Z";
const T3 = "2026-10-21T15:00:00.000Z";
const UID = "user-test-1";

function deepFreeze(o) {
  if (o && typeof o === "object") { for (const k of Object.keys(o)) deepFreeze(o[k]); Object.freeze(o); }
  return o;
}
function freshState() {
  const r = C.emptyConsentState(UID, T0);
  assert.equal(r.ok, true);
  return r.state;
}
function granted(scopes) {
  let st = freshState();
  const times = [T1, T2, T3];
  scopes.forEach((sc, i) => {
    const r = C.grantConsent(st, sc, { at: times[i], source_surface: "imessage" });
    assert.equal(r.ok, true, `grant ${sc}: ${r.reason || ""}`);
    st = r.state;
  });
  return st;
}

test("surface: scopes, chain, kinds are the pinned constants", () => {
  assert.deepEqual(C.SCOPES, ["matched", "introduced", "contacted"]);
  assert.deepEqual(C.SCOPE_REQUIRES, { matched: [], introduced: ["matched"], contacted: ["introduced"] });
  assert.equal(C.PROFILE_KIND, "connector_match_profile");
  assert.equal(C.CONSENT_KIND, "connector_consent_state");
  assert.equal(C.PROFILE_CARRIAGE_KEY, "_careerConnector");
});

test("default: a fresh consent state consents to NOTHING", () => {
  const st = freshState();
  assert.deepEqual(st.events, []);
  for (const sc of C.SCOPES) assert.equal(C.isConsented(st, sc), false, sc);
  assert.deepEqual(C.consentSummary(st), { matched: false, introduced: false, contacted: false, fully_opted_in: false });
});

test("match profile: create normalizes needs/offers and stamps created=updated", () => {
  const r = C.createMatchProfile({ user_id: UID, needs: ["  intro to a JPM analyst ", "intro to a JPM analyst", "GS superday prep"], offers: ["Datadog referral"] }, T0);
  assert.equal(r.ok, true);
  assert.deepEqual(r.profile.needs, ["intro to a JPM analyst", "GS superday prep"]); // trimmed + deduped
  assert.deepEqual(r.profile.offers, ["Datadog referral"]);
  assert.equal(r.profile.visibility_scope, "internal_only"); // spec: internal-only by default
  assert.equal(r.profile.created_at, T0);
  assert.equal(r.profile.updated_at, T0);
  assert.equal(C.validateMatchProfile(r.profile).ok, true);
});

test("match profile: update bumps updated_at, never created_at, never user_id", () => {
  const p = C.createMatchProfile({ user_id: UID, needs: ["a"] }, T0).profile;
  const u = C.updateMatchProfile(p, { offers: ["mock interviews"] }, T2);
  assert.equal(u.ok, true);
  assert.equal(u.profile.created_at, T0);
  assert.equal(u.profile.updated_at, T2);
  assert.deepEqual(u.profile.offers, ["mock interviews"]);
  assert.deepEqual(u.profile.needs, ["a"]);
  assert.equal(C.updateMatchProfile(p, { user_id: "someone-else" }, T2).ok, false);
  assert.equal(C.updateMatchProfile(p, {}, "not-a-time").ok, false);
});

test("per-scope isolation: granting matched implies nothing else", () => {
  const st = granted(["matched"]);
  assert.equal(C.isConsented(st, "matched"), true);
  assert.equal(C.isConsented(st, "introduced"), false);
  assert.equal(C.isConsented(st, "contacted"), false);
  const st2 = granted(["matched", "introduced"]);
  assert.equal(C.isConsented(st2, "introduced"), true);
  assert.equal(C.isConsented(st2, "contacted"), false);
});

test("chain: a scope grant is inert until its prerequisite scope is granted", () => {
  const st = granted(["contacted"]); // granted out of chain order
  assert.equal(C.isConsented(st, "contacted"), false); // introduced + matched missing
  const st2 = granted(["contacted", "introduced"]);
  assert.equal(C.isConsented(st2, "introduced"), false); // matched still missing
  assert.equal(C.isConsented(st2, "contacted"), false);
  const st3 = granted(["contacted", "introduced", "matched"]);
  assert.equal(C.isConsented(st3, "contacted"), true);
  assert.equal(C.consentSummary(st3).fully_opted_in, true);
});

test("revocation is immediate", () => {
  let st = granted(["matched"]);
  const r = C.revokeConsent(st, "matched", { at: T3, source_surface: "app" });
  assert.equal(r.ok, true);
  assert.equal(C.isConsented(r.state, "matched"), false);
});

test("revocation is retroactive for pending scopes: revoking matched kills introduced + contacted", () => {
  let st = granted(["matched", "introduced", "contacted"]);
  assert.equal(C.consentSummary(st).fully_opted_in, true);
  st = C.revokeConsent(st, "matched", { at: T3, source_surface: "imessage" }).state;
  assert.equal(C.isConsented(st, "matched"), false);
  assert.equal(C.isConsented(st, "introduced"), false); // grant stands in the log; chain is broken
  assert.equal(C.isConsented(st, "contacted"), false);
  // the underlying grants are still in history (audit), they are just inert:
  assert.equal(st.events.filter((e) => e.type === "grant").length, 3);
});

test("revocation wins over any earlier grant regardless of storage order", () => {
  // Crafted via parse: events stored OUT of seq order, plus a stale replayed
  // grant stamped BEFORE the revocation but appended after it.
  const json = JSON.stringify({
    kind: C.CONSENT_KIND, version: 1, user_id: UID, created_at: T0, updated_at: T3,
    events: [
      { seq: 3, type: "grant", scope: "matched", at: T1, source_surface: "imessage", note: null },
      { seq: 1, type: "grant", scope: "matched", at: T1, source_surface: "imessage", note: null },
      { seq: 2, type: "revoke", scope: "matched", at: T2, source_surface: "app", note: null },
    ],
  });
  const p = C.parseConsentState(json);
  assert.equal(p.ok, true);
  assert.deepEqual(p.state.events.map((e) => e.seq), [1, 2, 3]); // canonical order restored
  assert.equal(C.isConsented(p.state, "matched"), false); // revoke @T2 beats grants @T1, any order
});

test("revocation wins a same-timestamp tie, whichever seq it carries", () => {
  const json = JSON.stringify({
    kind: C.CONSENT_KIND, version: 1, user_id: UID, created_at: T0, updated_at: T2,
    events: [
      { seq: 1, type: "revoke", scope: "matched", at: T1, source_surface: "app", note: null },
      { seq: 2, type: "grant", scope: "matched", at: T1, source_surface: "app", note: null },
    ],
  });
  const p = C.parseConsentState(json);
  assert.equal(p.ok, true);
  assert.equal(C.isConsented(p.state, "matched"), false);
});

test("a genuinely later re-grant after revocation restores consent", () => {
  let st = granted(["matched"]);
  st = C.revokeConsent(st, "matched", { at: T2, source_surface: "app" }).state;
  assert.equal(C.isConsented(st, "matched"), false);
  st = C.grantConsent(st, "matched", { at: T3, source_surface: "imessage" }).state;
  assert.equal(C.isConsented(st, "matched"), true);
});

test("grant/revoke reject unknown scope, unknown surface, missing timestamp", () => {
  const st = freshState();
  assert.equal(C.grantConsent(st, "emailed", { at: T1, source_surface: "imessage" }).ok, false);
  assert.equal(C.grantConsent(st, "matched", { at: T1, source_surface: "carrier_pigeon" }).ok, false);
  assert.equal(C.grantConsent(st, "matched", { source_surface: "imessage" }).ok, false);
  assert.equal(C.revokeConsent(st, "matched", { at: "garbage", source_surface: "app" }).ok, false);
  assert.equal(C.grantConsent(null, "matched", { at: T1, source_surface: "app" }).ok, false);
  assert.equal(C.isConsented(st, "emailed"), false); // unknown scope reads closed
});

test("malformed consent records are rejected by validate/parse and fail closed in isConsented", () => {
  const bad = [
    null, undefined, 42, "state", [],
    { kind: "other_kind", version: 1, user_id: UID, events: [], created_at: T0, updated_at: T0 },
    { kind: C.CONSENT_KIND, version: 99, user_id: UID, events: [], created_at: T0, updated_at: T0 },
    { kind: C.CONSENT_KIND, version: 1, user_id: "", events: [], created_at: T0, updated_at: T0 },
    { kind: C.CONSENT_KIND, version: 1, user_id: UID, events: "nope", created_at: T0, updated_at: T0 },
    { kind: C.CONSENT_KIND, version: 1, user_id: UID, created_at: T0, updated_at: T0,
      events: [{ seq: 1, type: "grant", scope: "everywhere", at: T1, source_surface: "app", note: null }] },
    { kind: C.CONSENT_KIND, version: 1, user_id: UID, created_at: T0, updated_at: T0,
      events: [{ seq: 1, type: "grant", scope: "matched", at: "not-a-time", source_surface: "app", note: null }] },
    { kind: C.CONSENT_KIND, version: 1, user_id: UID, created_at: T0, updated_at: T0,
      events: [{ seq: 1, type: "grant", scope: "matched", at: T1, source_surface: "app", note: null },
               { seq: 1, type: "revoke", scope: "matched", at: T2, source_surface: "app", note: null }] }, // duplicate seq
    { kind: C.CONSENT_KIND, version: 1, user_id: UID, created_at: T1, updated_at: T0, events: [] }, // updated < created
  ];
  for (const b of bad) {
    assert.equal(C.validateConsentState(b).ok, false, JSON.stringify(b));
    assert.equal(C.isConsented(b, "matched"), false);
    assert.deepEqual(C.consentSummary(b), { matched: false, introduced: false, contacted: false, fully_opted_in: false });
  }
  assert.equal(C.parseConsentState("{not json").ok, false);
  assert.equal(C.parseConsentState(JSON.stringify({ kind: "nope" })).ok, false);
});

test("malformed match profiles are rejected", () => {
  const bad = [
    null, "profile", [],
    { kind: "other", version: 1, user_id: UID, needs: [], offers: [], visibility_scope: "internal_only", created_at: T0, updated_at: T0 },
    { kind: C.PROFILE_KIND, version: 1, user_id: UID, needs: "a string", offers: [], visibility_scope: "internal_only", created_at: T0, updated_at: T0 },
    { kind: C.PROFILE_KIND, version: 1, user_id: UID, needs: [""], offers: [], visibility_scope: "internal_only", created_at: T0, updated_at: T0 },
    { kind: C.PROFILE_KIND, version: 1, user_id: UID, needs: [], offers: [], visibility_scope: "public_directory", created_at: T0, updated_at: T0 },
    { kind: C.PROFILE_KIND, version: 1, user_id: UID, needs: [], offers: [], visibility_scope: "internal_only", created_at: T2, updated_at: T0 },
  ];
  for (const b of bad) assert.equal(C.validateMatchProfile(b).ok, false, JSON.stringify(b));
  assert.equal(C.createMatchProfile({ needs: [] }, T0).ok, false); // no user_id
  assert.equal(C.createMatchProfile({ user_id: UID, needs: ["x".repeat(281)] }, T0).ok, false); // over-long entry
  assert.equal(C.createMatchProfile({ user_id: UID, needs: Array(13).fill("n") }, T0).ok, false); // over cap
  assert.equal(C.createMatchProfile({ user_id: UID, visibility_scope: "public_directory" }, T0).ok, false);
});

test("round-trip: serialize -> parse -> serialize is byte-stable for state and profile", () => {
  const st = granted(["matched", "introduced"]);
  const s1 = C.serializeConsentState(st);
  assert.equal(typeof s1, "string");
  const back = C.parseConsentState(s1);
  assert.equal(back.ok, true);
  assert.deepEqual(back.state, st);
  assert.equal(C.serializeConsentState(back.state), s1);

  const p = C.createMatchProfile({ user_id: UID, needs: ["b", "a"], offers: ["x"], visibility_scope: "matched_peers" }, T0).profile;
  const ps1 = C.serializeMatchProfile(p);
  const pback = C.parseMatchProfile(ps1);
  assert.equal(pback.ok, true);
  assert.deepEqual(pback.profile, p);
  assert.equal(C.serializeMatchProfile(pback.profile), ps1);
  assert.equal(C.serializeConsentState({ garbage: true }), null);
  assert.equal(C.serializeMatchProfile(null), null);
});

test("purity: grant/revoke/update/attach never mutate their inputs", () => {
  const st = deepFreeze(granted(["matched"]));
  const before = JSON.stringify(st);
  const g = C.grantConsent(st, "introduced", { at: T3, source_surface: "app" });
  assert.equal(g.ok, true);
  assert.equal(JSON.stringify(st), before);
  assert.notEqual(g.state, st);

  const p = deepFreeze(C.createMatchProfile({ user_id: UID, needs: ["a"] }, T0).profile);
  const pBefore = JSON.stringify(p);
  assert.equal(C.updateMatchProfile(p, { needs: ["b"] }, T1).ok, true);
  assert.equal(JSON.stringify(p), pBefore);
});

test("carriage: attach/read round-trips through a 122-shaped profile under _careerConnector", () => {
  const profile122 = deepFreeze({ id: "profile-1", basics: { name: "Alex Testcase (TEST)", email: null, phone: null, location: null, links: {} }, facts: [], _careerGraphPeople: [] });
  const mp = C.createMatchProfile({ user_id: UID, needs: ["analyst intro"] }, T0).profile;
  const st = granted(["matched"]);
  const att = C.attachToProfile(profile122, { match_profile: mp, consent: st });
  assert.equal(att.ok, true);
  assert.notEqual(att.profile, profile122);
  assert.equal(att.profile._careerConnector.match_profile.user_id, UID);
  assert.equal(att.profile._careerConnector.consent.events.length, 1);
  const read = C.readFromProfile(att.profile);
  assert.deepEqual(read.match_profile, mp);
  assert.deepEqual(read.consent, st);
  assert.equal(C.isConsented(read.consent, "matched"), true);
  // a bare profile carries nothing and reads closed:
  const bare = C.readFromProfile({ id: "profile-9" });
  assert.equal(bare.match_profile, null);
  assert.equal(bare.consent, null);
  // corrupted carriage fails closed, never throws:
  const corrupt = C.readFromProfile({ _careerConnector: { match_profile: { kind: "nope" }, consent: { events: "x" } } });
  assert.equal(corrupt.match_profile, null);
  assert.equal(corrupt.consent, null);
  assert.equal(C.attachToProfile(profile122, { match_profile: { kind: "nope" }, consent: st }).ok, false);
});
