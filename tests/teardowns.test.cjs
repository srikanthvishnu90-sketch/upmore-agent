// The owner's feature teardowns (docs/teardowns): every feature row parsed once, counts equal to each doc's own "At a
// glance" numbers, ids stable, and the standing rules gate what they must (scripts/build-teardowns.cjs).
const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { build } = require("../scripts/build-teardowns.cjs");

const ROOT = path.join(__dirname, "..");
const { rows, counts, problems } = build();
const byId = id => rows.find(r => r.id === id);
const features = rows.filter(r => !r.not_a_feature);

test("every app's parsed rows equal the count its teardown states", () => {
  assert.deepStrictEqual(problems, []);
  assert.deepStrictEqual(Object.fromEntries(Object.entries(counts).map(([a, c]) => [a, c.features + c.not_a_feature])),
    { dub: 144, Alinea: 85, Autopilot: 67, Origin: 209, Albert: 148, "Rocket Money": 132, Monarch: 330, "Copilot Money": 311, YNAB: 242, Cleo: 156 });
  assert.strictEqual(features.length, 1818);
  assert.strictEqual(rows.length - features.length, 6); // Alinea's checked-and-not-found rows, kept but not features
});

test("ids are unique, stable and carry at least one permission tag", () => {
  assert.strictEqual(new Set(rows.map(r => r.id)).size, rows.length);
  assert.strictEqual(byId("T1-DUB-001").feature, "Account sign-up");
  assert.strictEqual(byId("T2-ROCKET-029").feature, "Bill Negotiation (Lower Bills)");
  for (const r of rows) assert.ok(r.tags.length, `${r.id} has no tag`);
});

test("[Flag] rows are hard-gated, every one", () => {
  for (const r of features.filter(r => r.tags.includes("Flag"))) assert.ok(r.hard_gated && r.gates.includes("flag"), r.id);
});

test("decisions 2 and 3 stay off: event contracts and crypto connections are hard-gated", () => {
  assert.ok(byId("T1-ALINEA-043").gates.includes("decision_2")); // Event contracts
  for (const id of ["T1-ALINEA-042", "T2-MONARCH-020", "T2-COPILOT-016", "T2-COPILOT-017", "T2-COPILOT-018"]) {
    assert.ok(byId(id).gates.includes("decision_3") && byId(id).hard_gated, id);
  }
  // Crypto named among other holdings: built without the crypto part, not dropped. "No crypto" is no gate.
  assert.deepStrictEqual(byId("T1-ORIGIN-083").gates, ["crypto_part_off"]);
  assert.ok(!byId("T1-DUB-064").gates.some(g => /crypto|decision/.test(g)));
});

test("identity digits, phone calls and lending are hard-gated; tracking a loan is not lending", () => {
  assert.ok(byId("T1-DUB-003").gates.includes("identity_digits")); // collects an SSN
  assert.ok(byId("T2-ROCKET-029").gates.includes("phone_calls")); // negotiators call the provider
  assert.ok(byId("T1-ALBERT-054").gates.includes("lending")); // Instant Advance
  assert.ok(!byId("T2-YNAB-066").gates.includes("lending")); // Loan accounts: tracking
  assert.ok(!byId("T2-ROCKET-017").gates.includes("lending")); // Payday View: a bills view
});

test("hand overrides name their reason and still match their row", () => {
  assert.ok(!byId("T1-DUB-005").gates.includes("identity_digits") && byId("T1-DUB-005").override);
  assert.ok(!byId("T2-ROCKET-125").gates.includes("phone_calls") && byId("T2-ROCKET-125").override);
});

test("automations that move money carry the per-run yes rule", () => {
  assert.ok(byId("T1-DUB-047").gates.includes("per_run_yes")); // Auto-Copy
  assert.ok(!byId("T2-COPILOT-022").gates.includes("per_run_yes")); // marks Venmo transfers: bookkeeping
});

test("features.json and README.md are current", () => {
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build-teardowns.cjs"), "--check"], { stdio: "pipe" });
});
