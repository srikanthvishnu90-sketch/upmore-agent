// Bills read from a connected biller (docs/depth/BILLER-MODEL.md): packages/domain/38-agent-biller-model.js checks a
// batch of server-fetched biller records before any of it is stored: the connection must be active with read permission,
// each record must belong to that connection's account, carry a version, an observation time no later than now and the
// currency the biller states; "paid" needs the creditor's application reference; "verified" needs the biller's own
// confirmation that the amount is unpaid. One bad record rejects the batch. Reached through
// supabase/functions/_shared/biller_service.ts (ingestBillerRecords, refreshBiller, agent-workflows "refresh_biller"),
// but BILLER_ADAPTERS is empty: no biller adapter is verified, so no real biller record reaches this module today.
// It loads with 36-agent-workflows.js (normalize), the only module it needs.
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Connections and records are MOCK.
// Check: node --test tests/depth-BILLER-MODEL.test.cjs && node evals/depth/run.cjs BILLER-MODEL
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["36-agent-workflows.js", "38-agent-biller-model.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.B = AgentBillerModel;", ctx);
const { B } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const NOW = "2026-10-12T12:00:00Z";
const conn = o => Object.assign({ id: "mock-conn-1", status: "active", provider_key: "mock-power", provider_account_id: "mock-acct-9", capabilities: { read_obligations: true } }, o);
const rec = o => Object.assign({ external_id: "mock-inv-1", provider_account_id: "mock-acct-9", source_version: 1, observed_at: "2026-10-12T10:00:00Z", creditor: "Mock Power Co",
  amount_due_cents: 8432, due_on: "2026-10-20", status: "verified", unpaid_confirmed: true, currency: "USD", kind: "utility" }, o);
const batch = (records, c, now) => plain(B.normalizeBatch(c || conn(), records, now || NOW));
const one = o => batch([rec(o)]);
const ob = o => one(o).records[0].obligation;
const refused = (r, code) => { assert.deepEqual([r.ok, r.records], [false, []]); assert.ok(r.errors.includes(code), r.errors.join(",")); };

test("[S01] only an active connection is read", () => {
  for (const status of ["revoked", "pending", undefined]) assert.deepEqual(batch([rec()], conn({ status })), { ok: false, errors: ["biller_connection_unavailable"], records: [] }, String(status));
});

test("[S02] the connection needs read permission for bills", () => {
  for (const capabilities of [{}, { read_obligations: "true" }, null]) assert.deepEqual(batch([rec()], conn({ capabilities })).errors, ["biller_connection_unavailable"], JSON.stringify(capabilities));
});

test("[S03] a bill the biller says is unpaid is verified, with every fact from the biller", () => {
  const r = one();
  assert.deepEqual([r.ok, r.errors, r.records[0].external_id, r.records[0].source_version], [true, [], "mock-inv-1", 1]);
  const o = r.records[0].obligation;
  assert.deepEqual([o.creditor, o.amount_due_cents, o.currency, o.due_on, o.status, o.source_type, o.reference, o.provider_account_id, o.observed_at, o.kind, o.direction],
    ["Mock Power Co", 8432, "USD", "2026-10-20", "verified", "biller", "mock-inv-1", "mock-acct-9", "2026-10-12T10:00:00.000Z", "utility", "payable"]);
});

test("[S04] \"verified\" without the biller confirming it is unpaid is only asserted", () => {
  assert.equal(ob({ unpaid_confirmed: undefined }).status, "asserted");
  assert.equal(ob({ unpaid_confirmed: "yes" }).status, "asserted");
  assert.equal(ob({ unpaid_confirmed: true }).status, "verified");
});

test("[S05] \"partially paid\" also needs the biller's unpaid confirmation", () => {
  assert.equal(ob({ status: "partially_paid", unpaid_confirmed: false }).status, "asserted");
  assert.equal(ob({ status: "partially_paid" }).status, "partially_paid");
});

test("[S06] \"paid\" needs the creditor's application reference; a bank debit is not proof", () => {
  refused(one({ status: "settled" }), "creditor_application_evidence_required");
  refused(one({ status: "settled", evidence: { bank_debit: "mock-t1" } }), "creditor_application_evidence_required");
  assert.equal(ob({ status: "settled", evidence: { applied_reference: "MOCK-APPLIED-77" } }).status, "settled");
});

test("[S07] a record for another account at the biller is refused", () => {
  refused(one({ provider_account_id: "mock-acct-OTHER" }), "invalid_biller_identity_or_version");
});

test("[S08] every record carries a version of 1 or more", () => {
  for (const v of [0, -1, 1.5, "2", undefined]) refused(one({ source_version: v }), "invalid_biller_identity_or_version");
  assert.equal(one({ source_version: 7 }).records[0].source_version, 7);
});

test("[S09] the same bill twice in one batch is refused", () => {
  refused(batch([rec(), rec({ amount_due_cents: 1 })]), "invalid_biller_identity_or_version");
  assert.equal(batch([rec(), rec({ external_id: "mock-inv-2" })]).records.length, 2);
});

test("[S10] an observation later than now is refused; one at exactly now is kept", () => {
  refused(one({ observed_at: "2026-10-12T12:00:00.001Z" }), "invalid_source_timestamp");
  assert.equal(ob({ observed_at: NOW }).observed_at, "2026-10-12T12:00:00.000Z");
});

test("[S11] a record without its own observation time is refused; now is never put in its place", () => {
  for (const observed_at of [undefined, "", "yesterday"]) refused(one({ observed_at }), "invalid_source_timestamp");
});

test("[S12] one bad record rejects the whole batch, so a broken correction never looks like a clean refresh", () => {
  const r = batch([rec(), rec({ external_id: "mock-inv-2", amount_due_cents: -1 })]);
  assert.deepEqual(r, { ok: false, errors: ["invalid_amount"], records: [] });
});

test("[S13] up to 500 records are read; 501 are refused", () => {
  const many = k => Array.from({ length: k }, (_, i) => rec({ external_id: "mock-inv-" + i }));
  assert.equal(batch(many(500)).records.length, 500);
  assert.deepEqual(batch(many(501)), { ok: false, errors: ["invalid_biller_batch"], records: [] });
});

test("[S14] a bill must state its currency; none is never read as dollars", () => {
  for (const currency of [undefined, "", "  "]) refused(one({ currency }), "biller_currency_required");
  assert.deepEqual([ob({ currency: "cad", amount_due_cents: 150000 }).currency, ob({ currency: "cad" }).amount_due_cents], ["CAD", 8432]);
  refused(one({ currency: "C$" }), "invalid_currency");
});

test("[S15] the connection, not the record, names the biller and stamps the evidence", () => {
  const o = ob({ provider_key: "mock-other-biller", unpaid_confirmed: undefined, evidence: { connector_id: "spoofed", unpaid_confirmed: true, source_version: 99, note: "MOCK" } });
  assert.deepEqual([o.provider_key, o.status, o.evidence], ["mock-power", "asserted", { connector_id: "mock-conn-1", note: "MOCK", source_version: 1, unpaid_confirmed: false }]);
});

test("[S16] a negative amount, a bad due date or an unknown status is refused", () => {
  refused(one({ amount_due_cents: -100 }), "invalid_amount");
  refused(one({ due_on: "2026-02-30" }), "invalid_due_date");
  refused(one({ status: "paid" }), "invalid_status");
  refused(one({ creditor: " " }), "creditor_required");
});

test("[S17] without a real current time nothing is read", () => {
  for (const now of ["not a date", "", undefined]) assert.deepEqual(plain(B.normalizeBatch(conn(), [rec()], now)), { ok: false, errors: ["invalid_biller_batch"], records: [] }, String(now));
});

test("[S18] an id with control characters or over 160 characters is refused", () => {
  refused(one({ external_id: "mock\ninv" }), "invalid_biller_identity_or_version");
  refused(one({ external_id: "x".repeat(161) }), "invalid_biller_identity_or_version");
  assert.equal(one({ external_id: "x".repeat(160) }).ok, true);
});

test("[ADV] hostile or broken input never becomes a stored bill", () => {
  assert.deepEqual(batch(null).errors, ["invalid_biller_batch"]);
  assert.deepEqual(batch([null, rec()]), { ok: false, errors: ["invalid_biller_identity_or_version"], records: [] });
  assert.deepEqual(plain(B.normalizeBatch(null, [rec()], NOW)).errors, ["biller_connection_unavailable"]);
  assert.deepEqual(batch([rec()], conn({ provider_account_id: "" })).errors, ["biller_connection_unavailable"]);
  assert.equal(ob({ biller_url: "javascript:alert(1)" }).biller_url, null);
  assert.equal(ob({ source_type: "user" }).source_type, "biller");
});
