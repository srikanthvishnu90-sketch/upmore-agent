// Investing without recommending, the arithmetic (docs/depth/INVEST.md): packages/domain/50-agent-invest.js reads the
// person's own holdings across accounts (value to the cent, share in basis points, unrealized gain only when every cost
// is known), states concentration and drift as facts with their source and as-of, runs screens only on the person's
// criteria, does tax-lot math (harvest candidates, the wash-sale window, short vs long term by the calendar, realized
// gains), contribution room against limits the caller supplies, the order restatement the loop confirms before any rail
// fires, the portfolio read, the person's own price alerts on fresh quotes, and the rollover's 60-day clock. Nothing here
// is advice: no function returns a buy, sell or hold. The module is in the router bundle (scripts/build-router-core.py);
// AgentTrade (66-agent-trade.js) requires it loaded. It needs no other module; 45-advice-guard.js is loaded only to show
// a statement passes the guard's grounding rule. One test per sub-capability, tagged so evals/depth/run.cjs can prove its
// planted defect makes exactly this test fail. Holdings, lots, quotes and plans are MOCK.
// Check: node --test tests/depth-INVEST.test.cjs && node evals/depth/run.cjs INVEST
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["45-advice-guard.js", "50-agent-invest.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.I = AgentInvest; this.G = AdviceGuard;", ctx);
const { I, G } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));

const FIDELITY = { id: "mock-fidelity", source: "Fidelity (MOCK)", as_of: "2026-10-12T14:00:00Z", holdings: [
  { symbol: "VTI", quantity: 10, price_cents: 30000, asset_class: "equity", cost_cents: 250000 },
  { symbol: "BND", quantity: 20, price_cents: 7250, asset_class: "bond", cost_cents: 150000 }] };
const SCHWAB = { id: "mock-schwab", source: "Schwab (MOCK)", as_of: "2026-10-10T13:00:00Z", holdings: [{ symbol: "VTI", quantity: 2.5, price_cents: 30000, asset_class: "equity", cost_cents: 60000 }] };
const ACCTS = [FIDELITY, SCHWAB];
const one = (holdings, o) => [Object.assign({ id: "mock-brokerage", source: "Mock Brokerage", as_of: "2026-10-12T14:00:00Z", holdings }, o)];
const QUOTE = { price_cents: 30000, source: "Mock Quotes", as_of: "2026-10-12T14:30:00Z" };
const NOW = Date.UTC(2026, 9, 12, 15, 0, 0);

test("[S01] holdings are valued to the cent, fractional shares rounded half up, and merged across accounts", () => {
  const c = plain(I.consolidate(one([{ symbol: "ABC", quantity: 0.5, price_cents: 12345 }])));
  assert.equal(c.total_cents, 6173, "0.5 x $123.45 = $61.725, which is $61.73");
  const all = plain(I.consolidate(ACCTS));
  const vti = all.holdings.find(h => h.symbol === "VTI");
  assert.deepEqual([vti.value_cents, vti.quantity, vti.accounts], [375000, 12.5, ["mock-fidelity", "mock-schwab"]]);
  assert.deepEqual([all.total_cents, all.holdings.map(h => h.symbol)], [520000, ["VTI", "BND"]]);
});

test("[S02] each holding's share of the whole is in basis points, rounded", () => {
  const c = plain(I.consolidate(one([{ symbol: "AAA", value_cents: 200 }, { symbol: "BBB", value_cents: 100 }])));
  assert.deepEqual(c.holdings.map(h => [h.symbol, h.share_bps]), [["AAA", 6667], ["BBB", 3333]]);
});

test("[S03] an unrealized gain is shown only when every lot's cost is known; one account without cost basis makes it unknown", () => {
  const all = plain(I.consolidate(ACCTS));
  assert.equal(all.holdings.find(h => h.symbol === "VTI").unrealized_cents, 65000, "$3,750.00 against $3,100.00 of cost");
  assert.equal(all.holdings.find(h => h.symbol === "BND").unrealized_cents, -5000);
  // A transferred-in position often arrives without cost basis: $3,750.00 against only Fidelity's $2,500.00 is not a $1,250.00 gain.
  const partial = plain(I.consolidate([FIDELITY, Object.assign({}, SCHWAB, { holdings: [{ symbol: "VTI", quantity: 2.5, price_cents: 30000 }] })]));
  assert.equal(partial.holdings.find(h => h.symbol === "VTI").unrealized_cents, null);
  assert.equal(plain(I.consolidate(one([{ symbol: "AAA", value_cents: 100, cost_cents: 0 }]))).holdings[0].unrealized_cents, null, "a zero cost is not on file");
});

test("[S04] a concentration share is said to one decimal, rounded half up: 10.35 percent is 10.4, not 10.3", () => {
  const con = plain(I.concentration(one([{ symbol: "AAA", value_cents: 103500 }, { symbol: "BBB", value_cents: 896500 }]), 1000));
  assert.deepEqual(con.flagged.map(f => f.statement.split(" of your")[0]), ["BBB is 89.7 percent", "AAA is 10.4 percent"]);
  const quarter = plain(I.concentration(one([{ symbol: "AAA", value_cents: 2250 }, { symbol: "BBB", value_cents: 7750 }]), 1000));
  assert.deepEqual(quarter.flagged.map(f => f.statement.split(" of your")[0]), ["BBB is 77.5 percent", "AAA is 22.5 percent"]);
});

test("[S05] a concentration statement names its source and as-of, so the advice guard's grounding rule accepts it", () => {
  const con = plain(I.concentration(one([{ symbol: "AAA", value_cents: 103500 }, { symbol: "BBB", value_cents: 896500 }]), 1000));
  assert.equal(con.flagged[1].statement, "AAA is 10.4 percent of your invested assets ($1,035.00 of $10,000.00), per Mock Brokerage, as of 2026-10-12T14:00:00Z.");
  assert.equal(G.response(con.flagged[1].statement, { analytics: true }).ok, true);
  // Two accounts read at different times: the total is only as current as the older read.
  const both = plain(I.concentration(ACCTS, 2000));
  assert.equal(both.as_of, "2026-10-10T13:00:00Z", "the result's own as-of is the older read too (grounded)");
  assert.equal(plain(I.consolidate(ACCTS)).as_of, "2026-10-10T13:00:00Z");
  assert.equal(both.flagged[0].statement, "VTI is 72.1 percent of your invested assets ($3,750.00 of $5,200.00), per Fidelity (MOCK) and Schwab (MOCK), as of 2026-10-10T13:00:00Z.");
  assert.equal(plain(I.concentration(one([{ symbol: "AAA", value_cents: 100 }], { source: undefined }), 1000)).flagged[0].statement,
    "AAA is 100.0 percent of your invested assets ($1.00 of $1.00), source or as-of time not on file.");
});

test("[S06] the concentration line is inclusive and defaults to 10 percent", () => {
  assert.deepEqual(plain(I.concentration(one([{ symbol: "AAA", value_cents: 1000 }, { symbol: "BBB", value_cents: 9000 }]))).flagged.map(f => f.symbol), ["BBB", "AAA"]);
  assert.deepEqual(plain(I.concentration(one([{ symbol: "AAA", value_cents: 999 }, { symbol: "BBB", value_cents: 9001 }]))).flagged.map(f => f.symbol), ["BBB"]);
  assert.equal(plain(I.concentration(one([{ symbol: "AAA", value_cents: 1000 }]))).threshold_bps, 1000);
});

test("[S07] allocation groups by asset class unless told otherwise; a holding with no class is \"unknown\", not dropped", () => {
  const a = plain(I.allocation(ACCTS.concat(one([{ symbol: "XYZ", value_cents: 80000 }]))));
  assert.deepEqual(a.buckets.map(b => [b.bucket, b.value_cents, b.share_bps]), [["equity", 375000, 6250], ["bond", 145000, 2417], ["unknown", 80000, 1333]]);
  assert.equal(a.by, "asset_class");
});

test("[S08] drift is the distance from the person's own target, with the math to get back as a list, never an instruction", () => {
  const d = plain(I.drift(ACCTS, { equity: 6000, bond: 4000 }));
  assert.deepEqual(d.rows.map(r => [r.bucket, r.current_bps, r.drift_bps, r.target_cents, r.trade_cents]), [["equity", 7212, 1212, 312000, -63000], ["bond", 2788, -1212, 208000, 63000]]);
  assert.deepEqual(d.trade_list, [{ bucket: "equity", side: "sell", amount_cents: 63000 }, { bucket: "bond", side: "buy", amount_cents: 63000 }]);
  assert.equal(d.note, "Distance from the target you set. The trade list is the math to get back to it; running it is your decision and a confirmed action.");
});

test("[S09] a holding outside the target shows as drift to zero; a target that is not 100 percent is refused", () => {
  const d = plain(I.drift(ACCTS, { equity: 10000 }));
  assert.deepEqual(d.trade_list, [{ bucket: "equity", side: "buy", amount_cents: 145000 }, { bucket: "bond", side: "sell", amount_cents: 145000 }]);
  assert.throws(() => I.drift(ACCTS, { equity: 6000, bond: 3000 }), /sum to 10000 basis points/);
});

test("[S10] a screen runs only the person's criteria, bounds inclusive, missing data never matching, with source and as-of", () => {
  const universe = [{ symbol: "AAA", pe: 15, sector: "tech" }, { symbol: "BBB", pe: 14.9, sector: "energy" }, { symbol: "CCC", pe: null, sector: "tech" }, { symbol: "DDD", pe: 22, sector: "tech" }];
  const s = plain(I.screen(universe, [{ field: "sector", op: "in", value: ["tech", "energy"] }, { field: "pe", op: "lte", value: 15 }], { source: "Mock Data", as_of: "2026-10-12" }));
  assert.deepEqual(s.matches, ["AAA", "BBB"]);
  assert.equal(s.statement, "2 of 4 match your criteria (sector in tech/energy, pe <= 15), data as of 2026-10-12 per Mock Data.");
  assert.throws(() => I.screen(universe, []), /criteria the user defined/);
});

test("[S11] harvest math leaves wash-sale-blocked losses out of what would offset gains, and says the person decides", () => {
  const lots = [{ id: "mock-l1", symbol: "ARKK", quantity: 100, cost_cents: 600000, acquired: "2024-03-01" }, { id: "mock-l2", symbol: "AAPL", quantity: 5, cost_cents: 120000, acquired: "2026-02-01" },
    { id: "mock-l3", symbol: "VTI", quantity: 10, cost_cents: 250000, acquired: "2025-01-02" }];
  const h = plain(I.harvest(lots, { ARKK: 4200, AAPL: 17000, VTI: 30000 }, "2026-10-12", [{ symbol: "ARKK", date: "2026-09-25", quantity: 10 }]));
  assert.deepEqual(h.candidates.map(c => [c.lot_id, c.unrealized_loss_cents, c.term, c.wash_sale.disallowed]), [["mock-l1", 180000, "long", true], ["mock-l2", 35000, "short", false]]);
  assert.equal(h.harvestable_loss_cents, 35000);
  assert.equal(h.statement, "You hold $2,150.00 in unrealized losses across 2 lots; $350.00 is outside any wash-sale window and would offset gains if realized. You decide and direct.");
});

test("[S12] the wash-sale window is 30 days before and after the sale, inclusive", () => {
  const w = (date, symbol) => plain(I.washSale("VTI", "2026-10-12", [{ symbol: symbol || "VTI", date, quantity: 1 }], []));
  assert.deepEqual([w("2026-11-11").disallowed, w("2026-11-11").triggers[0].days_from_sale], [true, 30]);
  assert.deepEqual([w("2026-09-12").disallowed, w("2026-09-12").triggers[0].days_from_sale], [true, -30]);
  assert.equal(w("2026-11-12").disallowed, false);
  assert.equal(w("2026-09-11").disallowed, false);
});

test("[S13] long term means held more than one year by the calendar, so a year with Feb 29 in it is still one year", () => {
  const lot = acquired => [{ id: "mock-l4", symbol: "VTI", quantity: 10, cost_cents: 200000, acquired }];
  const term = (acquired, date) => plain(I.realized(lot(acquired), [{ symbol: "VTI", date, quantity: 10, proceeds_cents: 250000, lot_id: "mock-l4" }], date.slice(0, 4))).rows[0].term;
  assert.equal(term("2024-01-15", "2025-01-15"), "short", "exactly one year (366 days across Feb 29, 2024) is not more than one year");
  assert.equal(term("2024-01-15", "2025-01-16"), "long");
  assert.equal(term("2025-03-01", "2026-03-01"), "short");
  assert.equal(term("2025-03-01", "2026-03-02"), "long");
  assert.equal(term("2024-02-29", "2025-02-28"), "short");
  assert.equal(term("2024-02-29", "2025-03-01"), "long");
  const h = plain(I.harvest([{ id: "mock-l5", symbol: "VTI", quantity: 1, cost_cents: 40000, acquired: "2023-10-12" }], { VTI: 30000 }, "2024-10-12", []));
  assert.equal(h.candidates[0].term, "short", "a harvest on the anniversary is short term too");
});

test("[S14] a partial sale carries its share of the lot's cost, and gains are summed by term for the year", () => {
  const lots = [{ id: "mock-l6", symbol: "AAPL", quantity: 10, cost_cents: 200000, acquired: "2025-03-01" }, { id: "mock-l7", symbol: "VTI", quantity: 4, cost_cents: 80000, acquired: "2023-06-01" }];
  const r = plain(I.realized(lots, [{ symbol: "AAPL", date: "2025-11-02", quantity: 4, proceeds_cents: 70000, lot_id: "mock-l6" }, { symbol: "VTI", date: "2025-12-30", quantity: 4, proceeds_cents: 120000, lot_id: "mock-l7" },
    { symbol: "VTI", date: "2026-01-05", quantity: 1, proceeds_cents: 30000, lot_id: "mock-l7" }], 2025));
  assert.deepEqual(r.rows.map(x => [x.symbol, x.basis_cents, x.gain_cents, x.term]), [["AAPL", 80000, -10000, "short"], ["VTI", 80000, 40000, "long"]]);
  assert.deepEqual([r.short_term_cents, r.long_term_cents, r.total_cents], [-10000, 40000, 30000]);
});

test("[S15] contribution room comes from the limits supplied, and a contribution over the limit is said, not hidden as $0 of room", () => {
  const room = plain(I.contributionRoom({ ira: 750000, hsa: 100000 }, { ira: 700000, hsa: 430000 }));
  assert.equal(room.hsa.statement, "hsa: $3,300.00 of room left this year ($1,000.00 of $4,300.00 contributed).");
  assert.equal(room.ira.statement, "ira: $0.00 of room left this year ($7,500.00 of $7,000.00 contributed). That is $500.00 over the limit.");
  assert.deepEqual([room.ira.room_cents, room.ira.excess_cents, room.hsa.excess_cents], [0, 50000, 0]);
});

test("[S16] an order's side is buy or sell as the person said it, never guessed: \"BUY\" is a buy, anything else is refused", () => {
  assert.equal(I.restateOrder({ symbol: "VTI", side: "BUY", quantity: 2, account: "mock-fidelity" }, QUOTE).statement.slice(0, 9), "Buy 2 VTI");
  assert.equal(I.restateOrder({ symbol: "VTI", side: " Sell", quantity: 2, account: "mock-fidelity" }, QUOTE).action, "Sell");
  for (const side of ["short", "sell_short", "cover", "hold"]) assert.throws(() => I.restateOrder({ symbol: "VTI", side, quantity: 2, account: "mock-fidelity" }, QUOTE), /side must be buy or sell/, side);
});

test("[S17] an estimate cites its quote's source and as-of; a quote without them gives no estimate, only \"price at execution\"", () => {
  const cited = plain(I.restateOrder({ symbol: "VTI", side: "buy", quantity: 2, account: "mock-fidelity" }, QUOTE));
  assert.equal(cited.statement, "Buy 2 VTI market in mock-fidelity, about $600.00 at $300.00 (Mock Quotes, as of 2026-10-12T14:30:00Z). Confirm?");
  for (const q of [{ price_cents: 30000 }, { price_cents: 30000, source: "Mock Quotes" }, { price_cents: 30000, as_of: "2026-10-12T14:30:00Z" }]) {
    const o = plain(I.restateOrder({ symbol: "VTI", side: "buy", quantity: 2, account: "mock-fidelity" }, q));
    assert.deepEqual([o.statement, o.estimated_cents, o.confirm.amount], ["Buy 2 VTI market in mock-fidelity. Confirm?", null, "price at execution"], JSON.stringify(q));
  }
});

test("[S18] a limit price makes it a limit order; a market order with a limit price is refused, never restated as both", () => {
  const o = plain(I.restateOrder({ symbol: "VTI", side: "buy", quantity: 2.5, account: "mock-fidelity", limit_cents: 29950 }, QUOTE));
  assert.equal(o.statement, "Buy 2.5 VTI limit at $299.50 in mock-fidelity, about $750.00 at $300.00 (Mock Quotes, as of 2026-10-12T14:30:00Z). Confirm?");
  assert.deepEqual([o.type, o.confirm.action, o.limit_cents], ["limit", "Buy 2.5 VTI (limit at $299.50)", 29950]);
  assert.throws(() => I.restateOrder({ symbol: "VTI", side: "buy", quantity: 2, account: "mock-fidelity", type: "market", limit_cents: 29950 }, QUOTE), /market order has no limit price/);
});

test("[S19] an order needs a positive quantity and an account", () => {
  for (const quantity of [0, -1, NaN, undefined]) assert.throws(() => I.restateOrder({ symbol: "VTI", side: "buy", quantity, account: "mock-fidelity" }, QUOTE), /needs symbol, side, quantity and account/, String(quantity));
  assert.throws(() => I.restateOrder({ symbol: "VTI", side: "buy", quantity: 1 }, QUOTE), /needs symbol, side, quantity and account/);
});

test("[S20] the portfolio read names each account's value, source and as-of, and names an account older than a day", () => {
  const p = plain(I.portfolio(ACCTS, NOW));
  assert.equal(p.text, "$5,200.00 across 2 accounts (mock-fidelity $4,450.00 per Fidelity (MOCK) as of 2026-10-12 14:00; mock-schwab $750.00 per Schwab (MOCK) as of 2026-10-10 13:00). mock-schwab is older than a day.");
  assert.deepEqual([p.total_cents, p.stale], [520000, ["mock-schwab"]]);
  assert.deepEqual(p.positions.find(x => x.symbol === "VTI").by_account.map(b => [b.account_id, b.quantity]), [["mock-fidelity", 10], ["mock-schwab", 2.5]]);
});

test("[S21] an account with no as-of time says so, rather than read as current", () => {
  const p = plain(I.portfolio([{ id: "mock-manual", source: "manual", holdings: [{ symbol: "CASH", value_cents: 100000 }] }], NOW));
  assert.equal(p.text, "$1,000.00 across 1 account (mock-manual $1,000.00 per manual, as-of time unknown).");
});

test("[S22] a price alert fires at the person's line, inclusive, citing the quote", () => {
  const q = [{ symbol: "NVDA", price_cents: 19000, as_of: "2026-10-12T14:30:00Z", source: "Mock Quotes" }];
  const r = plain(I.priceAlerts([{ id: "a1", symbol: "NVDA", kind: "above", price_cents: 19000 }, { id: "a2", symbol: "NVDA", kind: "below", price_cents: 18999 }], q, NOW));
  assert.deepEqual(r.fired.map(f => f.text), ["NVDA is $190.00, above your $190.00 line (Mock Quotes, 2026-10-12T14:30:00Z)."]);
  assert.equal(r.checked.find(c => c.alert_id === "a2").reason, "condition not met");
});

test("[S23] a quote with no as-of time never fires an alert", () => {
  const r = plain(I.priceAlerts([{ id: "a1", symbol: "NVDA", kind: "above", price_cents: 100 }], [{ symbol: "NVDA", price_cents: 19000, source: "Mock Quotes" }], NOW));
  assert.deepEqual([r.fired.length, r.checked[0].reason], [0, "quote has no as-of time"]);
  const bad = plain(I.priceAlerts([{ id: "a1", symbol: "NVDA", kind: "above", price_cents: 100 }], [{ symbol: "NVDA", price_cents: 19000, source: "Mock Quotes", as_of: "yesterday" }], NOW));
  assert.equal(bad.fired.length, 0);
});

test("[S24] a quote more than a day old never fires; exactly a day old still does", () => {
  const at = as_of => plain(I.priceAlerts([{ id: "a1", symbol: "NVDA", kind: "above", price_cents: 100 }], [{ symbol: "NVDA", price_cents: 19000, source: "Mock Quotes", as_of }], NOW));
  assert.equal(at("2026-10-11T15:00:00Z").fired.length, 1);
  assert.deepEqual([at("2026-10-11T14:59:59Z").fired.length, at("2026-10-11T14:59:59Z").checked[0].reason], [0, "quote is stale (2026-10-11T14:59:59Z)"]);
});

test("[S25] a move alert fires on a drop as well as a rise, and says it to one decimal, half up", () => {
  const q = [{ symbol: "NVDA", price_cents: 8965, prev_close_cents: 10000, as_of: "2026-10-12T14:30:00Z", source: "Mock Quotes" }];
  const r = plain(I.priceAlerts([{ id: "a1", symbol: "NVDA", kind: "pct_move", bps: 1000 }], q, NOW));
  assert.deepEqual(r.fired.map(f => f.text), ["NVDA moved down 10.4 percent today to $89.65 (Mock Quotes, 2026-10-12T14:30:00Z)."]);
});

test("[S26] the indirect rollover's 60-day clock is said in plain words: 1 day, the last day, and a missed deadline", () => {
  const r = sent => plain(I.rolloverStatus({ from: "Old 401k (MOCK)", to: "Mock IRA", method: "indirect", stage: "funds_sent", funds_sent_on: sent }, "2026-10-12"));
  const tail = "; if 20 percent was withheld, you must make it up from other money or that part becomes a taxable distribution.";
  assert.equal(r("2026-09-01").text, "Old 401k (MOCK) to Mock IRA (indirect): funds sent. Next: deposit the full amount into Mock IRA within 19 days" + tail);
  assert.equal(r("2026-08-14").text, "Old 401k (MOCK) to Mock IRA (indirect): funds sent. Next: deposit the full amount into Mock IRA within 1 day" + tail);
  assert.equal(r("2026-08-13").text, "Old 401k (MOCK) to Mock IRA (indirect): funds sent. Next: deposit the full amount into Mock IRA today, the last day of the 60-day window" + tail);
  const late = r("2026-08-01");
  assert.deepEqual([late.days_left_on_60_day_clock, late.overdue], [-12, true]);
  assert.equal(late.text, "Old 401k (MOCK) to Mock IRA (indirect): funds sent. Next: the deadline to deposit the full amount into Mock IRA was 12 days ago. The 60-day window has passed; talk to a tax professional about a waiver.");
  assert.equal(plain(I.rolloverStatus({ method: "direct" }, "2026-10-12")).text, "Old plan to new account (direct): stage unknown. Next: tell me the stage.");
});

test("[ADV] hostile numbers and words never become a value, an order or advice", () => {
  assert.throws(() => I.consolidate(one([{ symbol: "AAA", value_cents: 12.5 }])), /integer number of cents/);
  assert.throws(() => I.consolidate(one([{ symbol: "AAA", quantity: 1, price_cents: NaN }])), /integer number of cents/);
  assert.throws(() => I.screen([], [{ field: "pe", op: "<", value: 20 }]), /field, op and value/);
  const everything = JSON.stringify([I.concentration(ACCTS, 1000), I.drift(ACCTS, { equity: 6000, bond: 4000 }), I.harvest([{ id: "x", symbol: "VTI", quantity: 1, cost_cents: 40000, acquired: "2026-01-02" }], { VTI: 30000 }, "2026-10-12", []), I.portfolio(ACCTS, NOW)]);
  assert.ok(!/\b(should|recommend|you must sell|you must buy)\b/i.test(everything));
});
