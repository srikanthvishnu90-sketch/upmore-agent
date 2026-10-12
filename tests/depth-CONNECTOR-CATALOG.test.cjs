// The connector catalog's rules, one sub-capability at a time (docs/depth/CONNECTOR-CATALOG.md):
// packages/domain/52-connector-catalog.js (ConnectorCatalog, Instinct spec doc 05) validates every row of
// packages/connectors/catalog.json (a known way to sign in, registry capabilities, a wave, a reliability class, a
// last-checked date, write actions at T3 or above that are gated unless a live adapter exists, a live session labeled the
// least reliable class), answers "what can you connect" from the table, and runs the coverage check over real lives.
// Not reachable in production today: only the developer CLI `scripts/connectors` (--check, --list, --can) and tests load
// it; the live chat answers "connect my X" from the connector matrix (77-brokerage-connectors.js) instead. It needs no
// other module.
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Rows prefixed mock- are MOCK; S01 and the answer tests also read the real catalog and registry as data.
// Check: node --test tests/depth-CONNECTOR-CATALOG.test.cjs && node evals/depth/run.cjs CONNECTOR-CATALOG
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dir, "52-connector-catalog.js"), "utf8") + "\nthis.K = ConnectorCatalog;", ctx);
const { K } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "packages/connectors/catalog.json"), "utf8"));
const registry = JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8"));
const MOCK_REG = { capabilities: [{ id: "ACCT-001" }, { id: "TXN-001" }, { id: "PAY-009" }, { id: "INV-011" }] };
const row = o => Object.assign({ provider: "mock-bank", display_name: "Mock Bank", domain: "mock bank accounts", auth_method: "AGGREGATOR", wave: 1, scopes: ["READ_BALANCES"], data_entities: ["Account"],
  capabilities: ["ACCT-001"], write_actions: [], reliability_class: "high", gated_reason: null, adapter_state: "none", last_checked: "2026-10-10" }, o);
const errs = (...rows) => plain(K.validate({ connectors: rows }, MOCK_REG));
const write = o => [Object.assign({ action: "ACH between own accounts", capability: "PAY-009", tier: "T3" }, o)];

test("[S01] the real catalog validates clean against the registry, and a well-formed row has no errors", () => {
  assert.deepEqual(plain(K.validate(catalog, registry)), []);
  assert.equal(catalog.connectors.length, 126);
  assert.deepEqual(errs(row()), []);
});

test("[S02] a row signs in one of the known ways; a stored password is not one", () => {
  assert.deepEqual(errs(row({ auth_method: "VAULTED_CREDENTIALS" })), ["mock-bank: invalid auth method VAULTED_CREDENTIALS"]);
  assert.deepEqual(errs(row({ auth_method: "PUBLIC_DATA", reliability_class: "medium (public records; accuracy labeled)" })), []);
  assert.deepEqual([...K.AUTH], ["AGGREGATOR", "OAUTH", "PERSONAL_API_KEY", "LIVE_SESSION", "MANUAL", "PUBLIC_DATA"]);
});

test("[S03] every provider id is present and appears once", () => {
  assert.deepEqual(errs(row(), row({ display_name: "Mock Bank again" })), ["mock-bank: missing or duplicate provider id"]);
  assert.deepEqual(errs(row({ provider: "" })), ["?: missing or duplicate provider id"]);
});

test("[S04] the wave is 1, 2 or 3", () => {
  for (const wave of [0, 4, "1", null]) assert.deepEqual(errs(row({ wave })), ["mock-bank: wave must be 1, 2 or 3"], String(wave));
  for (const wave of [1, 2, 3]) assert.deepEqual(errs(row({ wave })), []);
});

test("[S05] a row states how reliable it is", () => {
  assert.deepEqual(errs(row({ reliability_class: "" })), ["mock-bank: reliability class missing"]);
});

test("[S06] a row says the day it was last checked, as a date", () => {
  for (const last_checked of [undefined, "", "Oct 10", "2026-10-1", "10/10/2026"]) assert.deepEqual(errs(row({ last_checked })), ["mock-bank: last_checked date missing"], String(last_checked));
  // A date of the right shape that is not on the calendar was accepted ("2026-02-30" passed validation).
  for (const last_checked of ["2026-02-30", "2026-13-45", "2026-00-10", "2025-02-29", "2026-04-31"]) assert.deepEqual(errs(row({ last_checked })), [`mock-bank: last_checked ${last_checked} is not a real date`], last_checked);
  for (const last_checked of ["2024-02-29", "2026-12-31", "2026-01-01"]) assert.deepEqual(errs(row({ last_checked })), [], last_checked);
});

test("[S07] a row powers at least one capability", () => {
  assert.deepEqual(errs(row({ capabilities: [] })), ["mock-bank: no capabilities"]);
  assert.deepEqual(errs(row({ capabilities: undefined })), ["mock-bank: no capabilities"]);
});

test("[S08] every capability a row claims is in the registry, by its exact id", () => {
  assert.deepEqual(errs(row({ capabilities: ["ACCT-001", "ZZZ-999", "acct-001"] })), ["mock-bank: capability ZZZ-999 is not in the registry", "mock-bank: capability acct-001 is not in the registry"]);
});

test("[S09] a write action cites a capability that exists", () => {
  assert.deepEqual(errs(row({ write_actions: write({ capability: "PAY-999", gated: "needs a partner" }) })), ["mock-bank: write action cites unknown capability PAY-999"]);
  assert.deepEqual(errs(row({ write_actions: write({ capability: undefined, gated: "needs a partner" }) })), ["mock-bank: write action cites unknown capability undefined"]);
});

test("[S10] a write action is T3 or above, never a lower tier", () => {
  for (const tier of ["T2", "T0", "T6", "t3", undefined]) assert.deepEqual(errs(row({ write_actions: write({ tier, gated: "needs a partner" }) })), [`mock-bank: write action ACH between own accounts must be T3 or above`], String(tier));
  for (const tier of ["T3", "T4", "T5"]) assert.deepEqual(errs(row({ write_actions: write({ tier, gated: "needs a partner" }) })), []);
});

test("[S11] a write without a gate needs a live adapter: \"not live\", a delivery partner or a sandbox is not live", () => {
  const bad = "mock-bank: write action ACH between own accounts promised without a live adapter and no gated reason";
  for (const adapter_state of ["none", "not live: awaiting partner", "delivery partner contract pending", "live sandbox only", "edge function exists; not yet wrapped"])
    assert.deepEqual(errs(row({ adapter_state, write_actions: write() })), [bad], adapter_state);
  for (const adapter_state of ["live", "live since 2026-10-01"]) assert.deepEqual(errs(row({ adapter_state, write_actions: write() })), [], adapter_state);
  assert.deepEqual(errs(row({ adapter_state: "none", write_actions: write({ gated: "needs a money-movement partner" }) })), []);
});

test("[S12] a gated reason, when given, says something", () => {
  assert.deepEqual(errs(row({ gated_reason: "" })), ["mock-bank: empty gated reason"]);
  assert.deepEqual(errs(row({ gated_reason: "FCRA permissible purpose" })), []);
});

test("[S13] a live session is labeled the least reliable class; a label that only contains the letters \"low\" is not that", () => {
  const msg = ["mock-bank: a live session must be labeled the least reliable class"];
  for (const reliability_class of ["high", "high (follows the bank's own app)", "slow but steady", "below average"]) assert.deepEqual(errs(row({ auth_method: "LIVE_SESSION", reliability_class })), msg, reliability_class);
  for (const reliability_class of ["low (a live session the person logs into; least reliable class)", "low", "Low (least reliable class)"]) assert.deepEqual(errs(row({ auth_method: "LIVE_SESSION", reliability_class })), [], reliability_class);
});

test("[S14] \"can you connect Gusto\" is answered from the table, word for word, with its gated writes", () => {
  const g = plain(K.answer(catalog, "Gusto"));
  assert.deepEqual([g.covered, g.rows.map(r => r.provider)], [true, ["gusto"]]);
  assert.equal(g.text, "Gusto payroll: not yet; it would connect via oauth (high); adapter not built yet");
  assert.equal(plain(K.answer(catalog, "Zelle")).text, "Zelle (inside the user's bank): not yet; it would connect via aggregator (high); adapter not built yet; send gated: bank partnership required; handoff pattern");
});

test("[S15] a row whose adapter exists but is not live says so, never a bare yes", () => {
  const p = plain(K.answer(catalog, "Plaid"));
  assert.equal(p.text, "Plaid (banks, cards, loans, investments): not yet; it would connect via aggregator (high); adapter not live yet (edge function exists (plaid, plaid-sync); not yet wrapped in the five verbs); ACH between own accounts gated: needs a money-movement partner; Plaid Transfer requires its own agreement");
  assert.equal(plain(K.answer({ connectors: [row({ adapter_state: "live" })] }, "Mock Bank")).text, "Mock Bank: yes, via aggregator (high)");
});

test("[S21] \"yes\" only when the adapter is live: with nothing live, every answer opens \"not yet\"", () => {
  // Every catalog row's adapter is none, an edge function not yet wrapped, or a reference adapter; the answers opened "yes" anyway.
  const all = catalog.connectors.map(c => plain(K.answer({ connectors: [c] }, c.provider)).text);
  assert.equal(all.filter(t => / yes, via /.test(t)).length, 0, "an answer opened \"yes\" for a row with no live adapter");
  assert.equal(all.filter(t => /: not yet; it would connect via /.test(t)).length, catalog.connectors.length);
  assert.equal(plain(K.answer(catalog, "Venmo")).text.split(";")[0], "Venmo: not yet");
  for (const adapter_state of ["none", "not live: awaiting partner", "live sandbox only"]) assert.match(plain(K.answer({ connectors: [row({ adapter_state })] }, "Mock Bank")).text, /^Mock Bank: not yet; it would connect via aggregator \(high\); adapter not /, adapter_state);
  assert.equal(plain(K.answer({ connectors: [row({ adapter_state: "live since 2026-10-01" })] }, "Mock Bank")).text, "Mock Bank: yes, via aggregator (high)");
});

test("[S16] a service not in the catalog is an honest gap, with no promise of a CSV import that is not live", () => {
  const no = plain(K.answer(catalog, "Mock Bolivar Wallet"));
  assert.deepEqual(no, { covered: false, text: "I can't connect Mock Bolivar Wallet yet; it isn't in the connector catalog.", rows: [] });
  const live = { connectors: [row({ provider: "manual-csv", display_name: "CSV import", domain: "any CSV export", auth_method: "MANUAL", reliability_class: "exact (user-entered)", adapter_state: "live" })] };
  assert.equal(plain(K.answer(live, "Mock Bolivar Wallet")).text, "I can't connect Mock Bolivar Wallet yet; it isn't in the connector catalog. CSV import works as the floor.");
});

test("[S17] a blank question is not a yes to every row", () => {
  for (const s of ["", "   ", null, undefined]) {
    const a = plain(K.answer(catalog, s));
    assert.deepEqual([a.covered, a.rows.length, a.text], [false, 0, "Which service? Name the bank, app or company you want to connect."], String(s));
  }
});

test("[S18] coverage names every surface with no row as a gap, per life", () => {
  const c = plain(K.coverage(catalog, [{ id: "mock-L1", surfaces: ["Gusto", "Chime", "Mock Bolivar Wallet"] }, { id: "mock-L2", surfaces: ["Plaid"] }]));
  assert.deepEqual(c, { lives: [{ id: "mock-L1", surfaces: 3, gaps: ["Chime", "Mock Bolivar Wallet"] }, { id: "mock-L2", surfaces: 1, gaps: [] }], ok: false, gaps: ["mock-L1: Chime", "mock-L1: Mock Bolivar Wallet"] });
  assert.equal(plain(K.coverage(catalog, [{ id: "mock-L3", surfaces: ["Plaid"] }])).ok, true);
});

test("[S19] the waves list each provider once, in its own wave", () => {
  const w = plain(K.byWave({ connectors: [row({ provider: "mock-a", wave: 1 }), row({ provider: "mock-b", wave: 3 }), row({ provider: "mock-c", wave: 1 }), row({ provider: "mock-d", wave: 4 })] }));
  assert.deepEqual(w, [{ wave: 1, connectors: ["mock-a", "mock-c"] }, { wave: 2, connectors: [] }, { wave: 3, connectors: ["mock-b"] }]);
});

test("[S20] the question matches a row by name in any case, by provider id with spaces, or by what it covers", () => {
  assert.deepEqual(plain(K.answer(catalog, "CASH APP")).rows.map(r => r.provider), ["cash-app"]);
  assert.deepEqual(plain(K.answer(catalog, "chase ur")).rows.map(r => r.provider), ["chase-ur"], "by the provider id alone");
  assert.deepEqual(plain(K.answer(catalog, "  venmo ")).rows.map(r => r.provider), ["venmo"]);
  assert.ok(plain(K.answer(catalog, "credit unions")).rows.some(r => r.provider === "plaid"), "by domain");
});
