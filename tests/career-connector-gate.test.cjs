// CONNECTOR GATE (Lane B, package 4 — allowlist gate): 156-career-connector-gate.js
// decides whether the people-matching Connector flow may run for a user.
// The gate is FAIL-CLOSED by construction, mirroring the codebase posture
// (channel_bridge.ts resolveTestUser returns null on anything unlisted):
// unset or malformed config means CLOSED, never an exception, never a guess.
//
// The decision keys on the REAL authenticated user id only — never the
// channel test-bridge identity (resolveTestUser collapses allowlisted
// senders onto one shared CHANNEL_TEST_USER_ID; the gate must never see
// that mapping). Integration: docs/connector/gate-integration-note-2026-10-21.md
//
// Check: node --test tests/career-connector-gate.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const G = require(path.join(__dirname, "..", "packages/domain/156-career-connector-gate.js"));

const ALICE = "11111111-2222-3333-4444-555555555555";
const BOB = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const envOf = (obj) => (name) => obj[name];
const ON = { CONNECTOR_ENABLED: "true", CONNECTOR_ALLOWLIST: ALICE };

test("unset env -> closed (disabled), no throw", () => {
  const d = G.decide(envOf({}), ALICE);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "disabled");
});

test("empty env object and missing getter values -> closed", () => {
  assert.equal(G.decide(envOf({ CONNECTOR_ENABLED: undefined }), ALICE).reason, "disabled");
  assert.equal(G.decide(() => undefined, ALICE).reason, "disabled");
  assert.equal(G.decide(null, ALICE).allowed, false);
  assert.equal(G.decide(undefined, ALICE).allowed, false);
});

test("master switch values other than true/1 -> disabled (garbage included, no throw)", () => {
  for (const v of ["false", "0", "off", "yes", "tru", "enabled", "", "  "]) {
    const d = G.decide(envOf({ CONNECTOR_ENABLED: v, CONNECTOR_ALLOWLIST: ALICE }), ALICE);
    assert.equal(d.allowed, false, `value ${JSON.stringify(v)} must not enable`);
    assert.equal(d.reason, "disabled");
  }
});

test("master switch off overrides the allowlist (listed user still closed)", () => {
  const d = G.decide(envOf({ CONNECTOR_ENABLED: "false", CONNECTOR_ALLOWLIST: ALICE }), ALICE);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "disabled");
});

test("master on + allowlist unset/empty -> not_listed", () => {
  assert.equal(G.decide(envOf({ CONNECTOR_ENABLED: "true" }), ALICE).reason, "not_listed");
  assert.equal(G.decide(envOf({ CONNECTOR_ENABLED: "true", CONNECTOR_ALLOWLIST: "" }), ALICE).reason, "not_listed");
  assert.equal(G.decide(envOf({ CONNECTOR_ENABLED: "true", CONNECTOR_ALLOWLIST: " , ," }), ALICE).reason, "not_listed");
});

test("listed user -> allowed", () => {
  const d = G.decide(envOf(ON), ALICE);
  assert.equal(d.allowed, true);
  assert.equal(d.reason, "allowed");
  assert.equal(d.userId, ALICE);
});

test("unlisted user -> not_listed", () => {
  const d = G.decide(envOf(ON), BOB);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "not_listed");
});

test("list formatting: whitespace, empty segments, duplicates, case all normalized", () => {
  const env = envOf({ CONNECTOR_ENABLED: " TRUE ", CONNECTOR_ALLOWLIST: ` ${BOB} , ,${ALICE.toUpperCase()}, ${ALICE} ` });
  assert.equal(G.decide(env, ALICE).allowed, true);
  assert.equal(G.decide(env, BOB).allowed, true);
  assert.equal(G.decide(env, ALICE.toUpperCase()).allowed, true);
  const cfg = G.parseConnectorConfig(env);
  assert.equal(cfg.allowlist.length, 2); // deduped, lowercased
});

test("malformed allowlist -> no throw, malformed entries never match, valid entries still work", () => {
  const junk = "not a uuid with spaces,💥,,x".repeat(3);
  const env = envOf({ CONNECTOR_ENABLED: "true", CONNECTOR_ALLOWLIST: `${junk},${ALICE}` });
  assert.equal(G.decide(env, ALICE).allowed, true);
  assert.equal(G.decide(env, "not a uuid with spaces").allowed, false);
  const cfg = G.parseConnectorConfig(env);
  assert.equal(cfg.malformed, true);
  assert.ok(cfg.allowlist.includes(ALICE));
  assert.ok(!cfg.allowlist.some((e) => e.includes(" ")));
});

test("oversized single entry is dropped as malformed, never matches", () => {
  const big = "z".repeat(5000);
  const env = envOf({ CONNECTOR_ENABLED: "true", CONNECTOR_ALLOWLIST: big });
  const d = G.decide(env, big);
  assert.equal(d.allowed, false);
  assert.equal(G.parseConnectorConfig(env).malformed, true);
});

test("throwing env getter -> closed, no throw escapes", () => {
  const boom = () => { throw new Error("env exploded"); };
  const d = G.decide(boom, ALICE);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "disabled");
});

test("missing/empty/non-string user id -> never allowed, no throw", () => {
  for (const bad of [undefined, null, "", "   ", 42, {}, []]) {
    const d = G.decide(envOf(ON), bad);
    assert.equal(d.allowed, false, `userId ${JSON.stringify(bad)} must not be allowed`);
    assert.equal(d.reason, "not_listed");
  }
});

test("decision is pure and deterministic: same inputs, deep-equal outputs, env untouched", () => {
  const obj = { CONNECTOR_ENABLED: "true", CONNECTOR_ALLOWLIST: `${ALICE},${BOB}` };
  const snapshot = JSON.stringify(obj);
  const a = G.decide(envOf(obj), ALICE);
  const b = G.decide(envOf(obj), ALICE);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(obj), snapshot);
  assert.ok(Object.isFrozen(a));
});

test("reasons are exactly the enumerated set", () => {
  assert.deepEqual({ ...G.REASONS }, { DISABLED: "disabled", NOT_LISTED: "not_listed", ALLOWED: "allowed" });
  const seen = new Set([
    G.decide(envOf({}), ALICE).reason,
    G.decide(envOf(ON), BOB).reason,
    G.decide(envOf(ON), ALICE).reason,
  ]);
  assert.deepEqual([...seen].sort(), ["allowed", "disabled", "not_listed"]);
});

test("parseConnectorConfig is fail-closed on non-string env values", () => {
  const cfg = G.parseConnectorConfig(envOf({ CONNECTOR_ENABLED: true, CONNECTOR_ALLOWLIST: 42 }));
  assert.equal(cfg.enabled, false);
  assert.deepEqual(cfg.allowlist, []);
});
