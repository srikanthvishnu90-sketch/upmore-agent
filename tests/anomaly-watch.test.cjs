// C15 statement anomaly watch, detector half (packages/domain/59-agent-alerts.js detect()): an international charge
// (a posted charge whose row currency is not USD) fires an anomaly finding naming the merchant, the amount in its
// own currency (and the row's USD figure when the row carries one) and the date; the large-transaction and
// first-time-merchant firings carry the transaction reference the proactive anomaly_check offer is built from.
// Check: node --test tests/anomaly-watch.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({});
vm.runInContext(["33-agent-monitors.js", "35-agent-intents.js", "36-agent-workflows.js", "41-agent-recovery.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "49-agent-save.js", "44-agent-earn.js", "55-agent-news.js", "57-agent-ledger.js", "59-agent-alerts.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.A=AgentAlerts;", ctx);
const A = ctx.A;
const TODAY = "2026-10-11";
const row = (id, cents, merchant, extra) => Object.assign({ id, account_id: "cc1", posted_at: TODAY, amount_cents: cents, merchant_raw: merchant, is_pending: false, is_transfer: false }, extra || {});
const history = [
  { id: "h1", account_id: "cc1", posted_at: "2026-10-04", amount_cents: -5200, merchant_raw: "KROGER", is_pending: false },
  { id: "h2", account_id: "cc1", posted_at: "2026-09-27", amount_cents: -6100, merchant_raw: "KROGER", is_pending: false },
];
const detect = rows => A.detect({ today: TODAY, transactions: history.concat(rows), accounts: [] });

test("C15(a) an international charge fires an anomaly finding naming merchant, amount in its currency, the USD figure the row carries, and the date", () => {
  const f = detect([row("intl1", -4500, "HOTEL LUTETIA PARIS", { currency: "EUR", usd_amount_cents: -4860 })]);
  const hit = f.find(x => x.kind === "international_charge");
  assert.ok(hit, JSON.stringify(f.map(x => x.kind)));
  assert.equal(hit.capability_id, "ALRT-003");
  assert.match(hit.text, /Hotel Lutetia Paris/);
  assert.match(hit.text, /45\.00 EUR/);
  assert.match(hit.text, /\$48\.60/);
  assert.match(hit.text, /Oct 11, 2026/);
  assert.equal(JSON.stringify(hit.evidence.rows), JSON.stringify(["intl1"]));
  assert.equal(hit.evidence.computed.currency, "EUR");
  assert.equal(hit.evidence.computed.transaction_id, "intl1");
  assert.equal(hit.evidence.computed.merchant, "Hotel Lutetia Paris");
  assert.equal(hit.evidence.computed.posted_on, "2026-10-11");
  assert.equal(hit.evidence.computed.usd_cents, 4860);
  assert.equal(hit.amount_cents, 4500);
});

test("C15(a) an international charge whose row carries no USD figure states none (no conversion is invented)", () => {
  const f = detect([row("intl2", -4500, "HOTEL LUTETIA PARIS", { currency: "EUR" })]);
  const hit = f.find(x => x.kind === "international_charge");
  assert.ok(hit);
  assert.match(hit.text, /45\.00 EUR/);
  assert.doesNotMatch(hit.text, /\$\d/);
  assert.equal(hit.evidence.computed.usd_cents, null);
});

test("C15(a) a USD charge is not an international charge, and a pending foreign charge does not fire (posted only)", () => {
  const f = detect([row("usd1", -4500, "CAFE", { currency: "USD" }), row("pend1", -4500, "HOTEL LUTETIA PARIS", { currency: "EUR", is_pending: true })]);
  assert.ok(!f.some(x => x.kind === "international_charge"), JSON.stringify(f.map(x => x.kind)));
});

test("C15(b) the large-transaction firing carries the transaction reference for the anomaly offer", () => {
  const f = A.detect({ today: TODAY, transactions: history.concat([row("big1", -64000, "BEST BUY")]), accounts: [], large_threshold_cents: 50000 });
  const hit = f.find(x => x.kind === "large_transaction");
  assert.ok(hit, JSON.stringify(f.map(x => x.kind)));
  assert.equal(hit.capability_id, "ALRT-002");
  assert.equal(hit.evidence.computed.transaction_id, "big1");
  assert.equal(hit.evidence.computed.merchant, "Best Buy");
  assert.equal(hit.evidence.computed.amount_cents, 64000);
  assert.equal(hit.evidence.computed.posted_on, "2026-10-11");
});

test("C15(b) the first-time-merchant firing carries the transaction reference for the anomaly offer", () => {
  const f = detect([row("ft1", -30000, "ACME WIDGETS")]);
  const hit = f.find(x => x.kind === "unusual_spending");
  assert.ok(hit, JSON.stringify(f.map(x => x.kind)));
  assert.equal(hit.capability_id, "ALRT-003");
  assert.equal(hit.evidence.computed.first_time, true);
  assert.equal(hit.evidence.computed.transaction_id, "ft1");
  assert.equal(hit.evidence.computed.merchant, "Acme Widgets");
  assert.equal(hit.evidence.computed.amount_cents, 30000);
  assert.equal(hit.evidence.computed.posted_on, "2026-10-11");
});
