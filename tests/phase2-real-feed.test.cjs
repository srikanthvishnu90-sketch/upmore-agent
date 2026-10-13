// Phase 2 real-feed validation regressions (2026-10-12): the owner's real SimpleFIN rows exposed merchant-identity
// and routing defects the fixture worlds never had, because real Chase descriptors carry tails the clean fixtures
// lack — a trailing state code and the charge's own MM/DD date ("REBET 5550134477 NH 09/22"), a masked account tail
// ("ROBINHOOD DEBITS XXXXX0000"), and a fresh reference code on every payment ("AFFIRM * PAY KX4OR9CH ..."). Every
// descriptor below is a TWIN of a real row's shape (digit runs and codes twinned; amounts and dates are the real
// rows' values, which are the assertions). The oracle numbers were recomputed from the raw rows by hand:
// September debits total $834.94; Rebet out $146.79 in September, $154.35 in the last 30 days, $514.35 in 90.
// Check: node --test tests/phase2-real-feed.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const load = (files, expr) => { const ctx = vm.createContext({ setTimeout, clearTimeout }); vm.runInContext(files.map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\n" + expr, ctx); return ctx; };

// ---- domain rows (monitors / save shape) ----
let n = 0;
const dtx = (posted_at, amount, merchant_raw) => ({ id: "t" + (++n), account_id: "chk", amount, amount_cents: Math.round(amount * 100), posted_at, merchant_raw, is_pending: false, is_transfer: false, currency: "USD" });
// ---- database rows (chat shape) ----
const btx = (posted_on, amount_cents, merchant_raw) => ({ account_id: "chk", provider_transaction_id: "sf-" + (++n), amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T14:00:00Z" });

const ROBINHOOD = [dtx("2026-08-04", -5, "ROBINHOOD DEBITS 555001999 WEB ID:"), dtx("2026-09-01", -5, "ROBINHOOD DEBITS 555001999 WEB ID:"), dtx("2026-10-01", -5, "ROBINHOOD DEBITS XXXXX0000 WEB ID:")];
const AFFIRM_COM = [dtx("2026-08-17", -61.44, "AFFIRM.COM PAYMENTS 185-55501234 CA"), dtx("2026-09-15", -61.44, "AFFIRM.COM PAYMENTS 185-55501234 CA")];
const FEES = [dtx("2026-07-20", -25, "MONTHLY SERVICE FEE"), dtx("2026-08-20", -25, "MONTHLY SERVICE FEE"), dtx("2026-09-21", -25, "MONTHLY SERVICE FEE")];

const M = load(["33-agent-monitors.js", "36-agent-workflows.js", "41-agent-recovery.js", "49-agent-save.js"], "this.Mo=AgentMonitors;this.Sv=AgentSave;");

test("merchant identity: masked tails, per-payment codes and date tails do not split one merchant", () => {
  const k = M.Mo.merchantKey;
  assert.equal(k("ROBINHOOD DEBITS XXXXX0000 WEB ID:"), k("ROBINHOOD DEBITS 555001999 WEB ID:"), "the masked Robinhood row keys with the clean ones");
  assert.equal(k("KALSHI KALSHI.COM NY 09/22"), k("KALSHI KALSHI.COM NY 08/04"), "Kalshi rows key together across their embedded dates");
  assert.equal(k("AFFIRM * PAY QW7ER2TY SAN FRANCISCO CA"), k("AFFIRM * PAY KX4OR9CH SAN FRANCISCO CA"), "Affirm Pay rows key together across their per-payment codes");
  assert.equal(k("REBET 5550134477 NH 09/06"), k("REBET 5550134477 NH 09/22"), "Rebet rows key together across their embedded dates");
  assert.notEqual(k("REBET INC VISA DIRECT NH XXXX31 09/25"), k("REBET 5550134477 NH 09/22"), "Rebet payouts stay a different merchant from Rebet debits");
  // Names a person would recognise are never eaten by the code strip.
  assert.equal(k("MICROSOFT*365"), "microsoft 365");
  assert.equal(k("1PASSWORD"), "1password");
});

test("recurring: the Robinhood series is three charges, not two (C5 inventory evidence)", () => {
  const rec = M.Mo.recurring([...ROBINHOOD, ...AFFIRM_COM, ...FEES], "2026-10-12");
  const rh = rec.find(r => r.key.includes("robinhood"));
  assert.ok(rh, JSON.stringify(rec.map(r => r.key)));
  assert.equal(rh.occurrences, 3);
  assert.equal(rh.lastDate, "2026-10-01");
});

test("save inventory: Robinhood is listed with all three charges and a next date after the last one", () => {
  const inv = M.Sv.subscriptions({ transactions: [...ROBINHOOD, ...AFFIRM_COM, ...FEES], today: "2026-10-12" }).inventory;
  const rh = inv.find(i => i.key.includes("robinhood"));
  assert.ok(rh, JSON.stringify(inv.map(i => i.key)));
  assert.equal(rh.occurrences, 3);
  assert.ok(rh.next > "2026-10-01", rh.next);
});

// ---- the September twin set (the real month's rows, twinned descriptors) ----
const SEPT = [
  btx("2026-09-16", -30240, "PEPTIRA 402-5550199 NE 09/15"), btx("2026-09-17", -2799, "PEPTIRA 402-5550199 NE 09/15"),
  btx("2026-09-08", -2000, "Rebet 5550134477 NH 09/06"), btx("2026-09-22", -5513, "Rebet 5550134477 NH 09/22"), btx("2026-09-23", -7166, "Rebet 5550134477 NH 09/22"),
  btx("2026-09-15", -6144, "AFFIRM.COM PAYMENTS 185-55501234 CA"), btx("2026-09-21", -1142, "AFFIRM * PAY D15Z7DSK SAN FRANCISCO CA"),
  btx("2026-09-25", -1393, "AFFIRM * PAY 6GGIXBJA SAN FRANCISCO CA"), btx("2026-09-25", -1084, "AFFIRM * PAY Y8PRUXM0 SAN FRANCISCO CA"), btx("2026-09-25", -603, "AFFIRM * PAY 3U3M7JEN SAN FRANCISCO CA"),
  btx("2026-09-02", -1600, "AFFIRM * PAY KJ4OR9CH SAN FRANCISCO CA"),
  btx("2026-09-25", -10000, "Zelle payment to Avery"), btx("2026-09-14", -8500, "APPLE CASH INST XFER SENT MONEY CUPERTINO CA"),
  btx("2026-09-21", -2500, "MONTHLY SERVICE FEE"), btx("2026-09-23", -1021, "KALSHI KALSHI.COM NY 09/22"),
  btx("2026-09-21", -1000, "POLYMARKET CLEARING POLYMARKETCLE FL"), btx("2026-09-01", -500, "ROBINHOOD DEBITS 555001999 WEB ID:"),
  btx("2026-09-18", -289, "GELATOTECA SUSO VENEZIA 09/17 EURO 2.50 X 1.156000 (EXCHG RTE)"),
  // August rows exist so the month comparison has its period (only the total is asserted, from the real rows).
  btx("2026-08-24", -158250, "WWW.FIVERR.COM NEW YORK NY"),
];
const MA = require(path.join(root, "packages/domain/80-money-answers.js"));
const SV = require(path.join(root, "packages/domain/94-spending-views.js"));
const NOW = new Date("2026-10-12T15:05:00Z");

test("C1 September: the total ties to the raw rows and Rebet is ONE merchant at $146.79 in the top places", () => {
  const reply = MA.spend(SEPT, "where did my money go in september", NOW, { tz: "America/Chicago" });
  assert.ok(reply.includes("You spent $834.94 in September"), reply);
  assert.ok(reply.includes("Peptira $330.39"), reply);
  assert.ok(reply.includes("Rebet $146.79"), reply);
  assert.ok(!/Peptira Ne|Rebet Nh/.test(reply), reply);
});

test("C6 routing: a merchant ask about a merchant who is not a known brand still routes to the merchant answer", () => {
  assert.equal(SV.merchantAsk("how much am I spending on Rebet, really?"), "rebet");
  assert.equal(SV.merchantAsk("how much am i spending on food"), null, "a category ask is still not a merchant ask");
});

test("C6 numbers: Rebet's trailing windows tie to the raw rows to the cent", () => {
  const rows = [
    btx("2026-07-24", -5000, "Rebet 5550134477 NH 07/24"), btx("2026-08-05", -5000, "Rebet 5550134477 NH 08/04"), btx("2026-08-05", -2500, "Rebet 5550134477 NH 08/04"),
    btx("2026-08-11", -8500, "Rebet 5550134477 NH 08/08"), btx("2026-08-20", -8000, "Rebet 5550134477 NH 08/19"), btx("2026-08-24", -2500, "Rebet 5550134477 NH 08/21"),
    btx("2026-08-26", -2500, "Rebet 5550134477 NH 08/25"), btx("2026-09-08", -2000, "Rebet 5550134477 NH 09/06"), btx("2026-09-22", -5513, "Rebet 5550134477 NH 09/22"),
    btx("2026-09-23", -7166, "Rebet 5550134477 NH 09/22"), btx("2026-10-02", -2756, "REBET XXXXXX0000 NH 10/02"),
  ];
  const reply = SV.merchantSpend(rows, "how much am I spending on Rebet, really?", NOW, { tz: "America/Chicago" });
  assert.ok(reply.includes("$154.35 in the last 30 days"), reply);
  assert.ok(reply.includes("Last 90 days (Jul 15-Oct 12): $514.35, 11 orders"), reply);
  assert.ok(reply.startsWith("Rebet:"), reply);
});

test("C16 report: person-to-person money is named as its own total, not buried in uncategorized", () => {
  const B = require(path.join(root, "packages/domain/93-budgets.js"));
  const budgets = [{ id: "tb1", kind: "category_budget", category: "shopping", amount_cents: 40000, period: "month", status: "active" }];
  const report = B.monthlyReport(budgets, SEPT, "2026-09", { tz: "America/Chicago" });
  assert.ok(report, "a report exists");
  assert.ok(/person-to-person/i.test(report.text), report.text);
  assert.ok(report.text.includes("Zelle $100.00"), report.text);
  assert.equal(report.uncategorized_cents, 83494, "the uncategorized remainder still ties to the month total");
});
