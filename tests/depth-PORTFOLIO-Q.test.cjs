// Portfolio questions and order status in the trade flow (megadoc G01, G06, E16, E18; docs/depth/PORTFOLIO-Q.md). One
// test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Broker reads are MOCK. Check: node --test tests/depth-PORTFOLIO-Q.test.cjs && node evals/depth/run.cjs PORTFOLIO-Q
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({ setTimeout, clearTimeout });
vm.runInContext(["33-agent-monitors.js", "41-agent-recovery.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "50-agent-invest.js", "53-compliance.js", "66-agent-trade.js", "67-agent-cards.js"].map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.T=AgentTrade;this.C=Compliance;", ctx);
const { T, C } = ctx;
const Registry = require(path.join(root, "packages/capabilities/registry.js"));
const registry = Registry.load(JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")), (rel) => fs.existsSync(path.join(root, rel)));
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);
const instruments = [{ symbol: "VOO", name: "Vanguard S&P 500 ETF" }, { symbol: "VTI", name: "Vanguard Total Stock Market ETF" }];

function world(holdings) {
  const w = { now: T0, writes: [], records: {}, n: 0, holdings, failOrder: false };
  const read = async (kind, p) => {
    if (kind === "brokerage_accounts") return { value: [{ id: "acct-1", name: "Mock brokerage", fractional: true, cash_cents: 100000 }], source: "Mock Broker", as_of: w.now };
    if (kind === "holdings") return { value: w.holdings, source: "Mock Broker", as_of: w.now };
    if (kind === "dividends") { w.divFrom = p.from; if (!w.divs) throw new Error("down"); return { value: w.divs.filter((r) => !p.from || r.date >= p.from), unread: w.unread || [], truncated: false, source: "Mock Broker", as_of: w.now }; }
    if (kind === "quote") return { value: { price_cents: 50000 }, source: "Mock Quotes", as_of: w.now - 60000 };
    if (kind === "order") { if (w.failOrder) throw new Error("down"); return { value: w.records[p.order_id], source: "Mock Broker", as_of: w.now }; }
    return { value: 1, source: "x", as_of: w.now };
  };
  const write = async (id, p) => { w.writes.push({ id, p }); const ref = `ord-${++w.n}`; w.records[ref] = { order_id: ref, status: "filled", quantity: p.quantity, fill_price_cents: 50000, filled_at: w.now }; return { reference: ref }; };
  w.conn = { read, write, verify: async (id, key, ref) => ({ confirmed: true, source: "Mock", reference: ref }) };
  w.s = T.create({ registry, connectors: w.conn, clock: () => w.now, instruments, partners: { broker_dealer: { live: true } }, compliance: C });
  return w;
}
const ROWS = [{ symbol: "PLTR", qty: 18.5, market_value_cents: 76035 }, { symbol: "VOO", qty: 2, market_value_cents: 102420 }, { symbol: "F", qty: 10, market_value_cents: 12000 }];
const say = async (w, m) => (await w.s.start(m)).text;
async function buy(w, sym) { await w.s.start(`buy $5 of ${sym}`); return w.s.reply("yes"); }

test("[S01] what do I own: every position with its value, buying power, the source and as-of", async () => {
  assert.equal(await say(world(ROWS), "what do I own"), "Portfolio in Mock brokerage, Mock Broker, as of 14:00 UTC: 18.5 PLTR ($760.35), 2 VOO ($1,024.20), 10 F ($120.00). Buying power $1,000.00.");
});

test("[S02] the source is said once when the account's name already carries it", async () => {
  const w = world(ROWS);
  w.conn.read = ((base) => async (k, p) => (k === "brokerage_accounts" ? { value: [{ id: "a", name: "your Mock Broker account", cash_cents: 100 }], source: "Mock Broker", as_of: w.now } : base(k, p)))(w.conn.read);
  w.s = T.create({ registry, connectors: w.conn, clock: () => w.now, instruments, partners: { broker_dealer: { live: true } }, compliance: C });
  assert.match(await say(w, "show my portfolio"), /^Portfolio in your Mock Broker account, as of 14:00 UTC: /);
});

test("[S03] the biggest position by the read's own value, with its share of the positions' value", async () => {
  assert.match(await say(world(ROWS), "what's my biggest position"), /^Your biggest position is VOO: \$1,024\.20, 53\.8% of your positions' value\.\nPortfolio in Mock brokerage/);
});

test("[S04] the smallest is the smallest", async () => {
  assert.match(await say(world(ROWS), "what's my smallest holding"), /^Your smallest position is F: \$120\.00, 6\.3% of your positions' value\./);
});

test("[S05] a single position is said as the only one, no share", async () => {
  assert.match(await say(world([ROWS[0]]), "what's my largest position"), /^Your biggest position is PLTR: \$760\.35, your only position\.\n/);
});

test("[S06] a holding the read gives no value for: nothing is ranked, and which one is said", async () => {
  const t = await say(world([ROWS[0], { symbol: "XYZ", qty: 1 }]), "what's my biggest position");
  assert.match(t, /^I can't rank your positions: the read doesn't carry a value for XYZ\.\nPortfolio/);
  assert.doesNotMatch(t, /biggest position is/);
});

test("[S07] order status with none placed from this chat says so and points to the brokerage app", async () => {
  assert.equal(await say(world(ROWS), "what's my order status"), "I don't see an order placed from this chat, so there's none to read back. Your brokerage app lists every order.");
});

test("[S08] a filled order: the side, size, price, total, id, fill time, source and as-of", async () => {
  const w = world(ROWS); await buy(w, "VOO");
  assert.match(await say(w, "did my buy fill?"), /^Filled: bought 0\.01 VOO at \$500\.00, \$5\.00 total, order ord-1, filled 14:00 UTC, per Mock Broker \(as of 14:00 UTC\)\.$/);
});

test("[S09] a working order is not called filled, and how to cancel it is said", async () => {
  const w = world(ROWS); await buy(w, "VOO"); w.records["ord-1"].status = "working";
  assert.match(await say(w, "is my VOO order filled"), /^Not filled yet: order ord-1 \(buy 0\.01 VOO\) is working, per Mock Broker \(as of 14:00 UTC\)\. Ask again anytime, or say "cancel my VOO order" to cancel it\.$/);
});

test("[S10] partly filled: how much filled at what price, and whether the rest still works", async () => {
  const w = world(ROWS); await buy(w, "VOO"); Object.assign(w.records["ord-1"], { status: "partial", filled_quantity: 0.004, fill_price_cents: 50000 });
  assert.match(await say(w, "did my buy fill"), /^Partly filled: 0\.004 of 0\.01 VOO at \$500\.00, order ord-1, per Mock Broker \(as of 14:00 UTC\)\. The rest is still working\.$/);
});

test("[S11] canceled: nothing filled is said", async () => {
  const w = world(ROWS); await buy(w, "VOO"); w.records["ord-1"].status = "canceled";
  assert.match(await say(w, "what's my order status"), /^Canceled: order ord-1 \(buy 0\.01 VOO\), nothing filled, per Mock Broker/);
});

test("[S12] rejected: the broker's reason, and that nothing was placed", async () => {
  const w = world(ROWS); await buy(w, "VOO"); Object.assign(w.records["ord-1"], { status: "rejected", reason: "insufficient buying power" });
  assert.match(await say(w, "what's my order status"), /^The broker rejected order ord-1 \(buy 0\.01 VOO\): insufficient buying power, per Mock Broker \(as of 14:00 UTC\)\. Nothing was placed\.$/);
});

test("[S13] a read that fails says the last status read, never a guess", async () => {
  const w = world(ROWS); await buy(w, "VOO"); w.failOrder = true;
  assert.equal(await say(w, "what's my order status"), "I can't read order ord-1 (buy 0.01 VOO) back right now. When I last read it, it was filled. Try again in a minute, or check your brokerage app.");
});

test("[S14] the ticker named picks that order; with several and none named, the latest, and the others are mentioned", async () => {
  const w = world(ROWS); await buy(w, "VOO"); w.now += 120000; await buy(w, "VTI");
  assert.match(await say(w, "did my VOO buy fill"), /^Filled: bought [\d.]+ VOO .*order ord-1,/);
  assert.match(await say(w, "what's my order status"), /^Filled: bought [\d.]+ VTI .*order ord-2, .* You placed 2 orders from this chat; name the ticker for another\.$/);
});

test("[S15] a status or portfolio question places nothing and never turns into an order prompt", async () => {
  const w = world(ROWS); await buy(w, "VOO");
  for (const m of ["what's my order status", "did my buy fill", "what do I own", "what's my biggest position"]) {
    const r = await w.s.start(m);
    assert.equal(r.outcome, "answer", `${m}: ${r.text}`);
    assert.doesNotMatch(r.text, /how much|confirm|reply yes/i, m);
  }
  assert.equal(w.writes.length, 1);
});

test("[S16] the ways people ask; a cancel stays a cancel", () => {
  const a = (m) => T.parse(m).action;
  for (const m of ["what's my order status", "did my buy fill?", "is my VOO order filled", "did my voo buy go through", "did it fill", "where is my sell"]) assert.equal(a(m), "status", m);
  for (const m of ["what do I own", "what's my biggest position", "what am I holding"]) assert.equal(a(m), "portfolio", m);
  assert.equal(a("cancel my VOO order"), "cancel");
  assert.equal(a("buy $5 of VOO"), "new");
});

test("[S17] a quote: the broker's own price with its source and time, said as what a buy pays; nothing staged", async () => {
  const w = world(ROWS);
  assert.equal(await say(w, "what's VOO trading at"), "VOO (Vanguard S&P 500 ETF): $500.00 (Mock Quotes, 13:59 UTC). That's the price a buy would pay right now; it moves while the market is open.");
  assert.equal(w.writes.length, 0);
});

test("[S18] an unknown ticker or no quote is said, never a number", async () => {
  const w = world(ROWS);
  w.conn.read = ((base) => async (k, p) => (k === "asset" ? { value: null, source: "Mock", as_of: w.now } : k === "assets" ? { value: [], source: "Mock", as_of: w.now } : base(k, p)))(w.conn.read);
  assert.match(await say(w, "what's ZZZZ trading at"), /^I don't know the ticker "ZZZZ"\./);
  const v = world(ROWS); v.conn.read = ((base) => async (k, p) => (k === "quote" ? null : base(k, p)))(v.conn.read);
  assert.equal(await say(v, "what's VOO trading at"), "I have no quote for VOO right now. Ask again in a moment.");
  const u = world(ROWS); u.conn.read = ((base) => async (k, p) => (k === "quote" ? { value: {}, source: "Mock Quotes", as_of: u.now } : base(k, p)))(u.conn.read);
  assert.equal(await say(u, "what's VOO trading at"), "I have no quote for VOO right now. Ask again in a moment.");
});

test("[S19] a ticker is a ticker only with stock words or in capitals: 'price of gas' is not GAS", () => {
  assert.equal(T.parse("price of VOO").action, "quote");
  assert.equal(T.parse("how much is aapl a share").action, "quote");
  assert.notEqual(T.parse("what's the price of gas").action, "quote");
  assert.notEqual(T.parse("price of eggs").action, "quote");
});

test("[S20] an asset record without a symbol is no instrument: nothing is quoted or carded for it", async () => {
  const w = world(ROWS);
  w.conn.read = ((base) => async (k, p) => (k === "asset" ? { value: { name: "Mystery" }, source: "Mock", as_of: w.now } : k === "assets" ? { value: 1, source: "Mock", as_of: w.now } : base(k, p)))(w.conn.read);
  const t = await say(w, "what's ZZZZ trading at");
  assert.match(t, /^I don't know the ticker "ZZZZ"\./);
  assert.doesNotMatch(t, /undefined/i);
  // The buy path reads the same record: no card for "undefined", nothing staged.
  const b = await w.s.start("buy $5 of ZZZZ");
  assert.notEqual(b.outcome, "confirm", b.text);
  assert.doesNotMatch(b.text, /undefined/i);
  assert.equal(w.writes.length, 0);
});

const LOTS = [{ symbol: "VOO", qty: 2, avg_entry_cents: 45000, market_value_cents: 102420 }, { symbol: "PLTR", qty: 18.5, avg_entry_cents: 5000, market_value_cents: 76035 }, { symbol: "F", qty: 10, market_value_cents: 12000 }];

test("[S21] a gain: the held shares' cost from the broker's average, their value now, up or down to the cent and in percent", async () => {
  assert.equal(await say(world(LOTS), "how much did I make on VOO"), "VOO: up $124.20 (+13.8%) on the 2 shares you hold. They cost $900.00 (average $450.00 a share, per Mock Broker) and are worth $1,024.20 now (as of 14:00 UTC). That's unrealized: shares you sold earlier and dividends aren't in this read.");
});

test("[S22] a loss is said as down", async () => {
  assert.match(await say(world(LOTS), "am i up on PLTR"), /^PLTR: down \$164\.65 \(-17\.8%\) on the 18\.5 shares you hold\. They cost \$925\.00 /);
});

test("[S23] not held, or no cost basis in the read: said, never estimated", async () => {
  assert.match(await say(world(LOTS), "how much did I make on NVDA"), /^You don't hold NVDA in Mock brokerage \(Mock Broker, as of 14:00 UTC\), so there's no open gain or loss on it here\. You hold VOO, PLTR, F\. Shares sold earlier aren't in this read\.$/);
  assert.match(await say(world(LOTS), "my gain on F"), /^I can't work out the gain on F: Mock brokerage doesn't give a cost basis for it /);
});

test("[S24] a month or a common word is never a ticker for a gain", () => {
  for (const m of ["how much did i make in august", "how much did i make on my house", "how much did i make on uber", "how much did i make this year"]) assert.notEqual(T.parse(m).action, "gain", m);
  assert.equal(T.parse("how much did I make on NVDA").action, "gain");
});

// Dividends received (megadoc G15): from the broker's activity rows, read-only.
const DV = (date, cents, symbol, extra) => Object.assign({ id: `${symbol}-${date}`, type: "DIV", date, cents, symbol, qty: 2, per_share_cents: Math.round(cents / 2), withheld: false }, extra || {});
const DIVS = [DV("2026-09-30", 324, "VOO"), DV("2026-06-30", 310, "VOO"), DV("2026-03-28", 105, "SCHD"), DV("2026-09-30", -49, "VOO", { type: "DIVNRA", withheld: true }), DV("2026-07-15", 40, "VNQ", { type: "DIVROC" }), DV("2025-12-22", 290, "VOO")];
const dw = (divs) => { const w = world(ROWS); w.divs = divs; return w; };
test("[S25] what dividends did I get: this year by default, to the cent, by holding, withholding and return of capital said, the source and as-of", async () => {
  const w = dw(DIVS);
  assert.equal(await say(w, "what dividends did I get"), "Dividends this year (Jan 1 to Oct 12): $7.79 from 4 payments in Mock brokerage. VOO $6.34 (2 payments, last Sep 30), SCHD $1.05 (Mar 28), VNQ $0.40 (Jul 15). $0.49 was withheld or charged against them, so $7.30 landed. $0.40 of it the broker labels return of capital. From Mock Broker's activity, as of 14:00 UTC.");
  assert.equal(w.divFrom, "2026-01-01");
  assert.equal(w.writes.length, 0);
});
test("[S26] one holding and a named period: each payment with its date, shares and per-share amount; last year is last year", async () => {
  assert.equal(await say(dw(DIVS), "VOO dividends last year"), "VOO paid you $2.90 last year (2025) in Mock brokerage, 1 payment: $2.90 on Dec 22 (2 shares at $1.45 a share). From Mock Broker's activity, as of 14:00 UTC.");
  assert.match(await say(dw(DIVS), "did VOO pay a dividend"), /^VOO paid you \$6\.34 this year \(Jan 1 to Oct 12\) in Mock brokerage, 2 payments: \$3\.24 on Sep 30 .*, \$3\.10 on Jun 30 /);
  assert.match(await say(dw(DIVS), "how much did I get in dividends in 2025"), /^Dividends in 2025: \$2\.90 from 1 payment/);
});
test("[S27] none, unreadable, or a kind not read: said, never a number made up", async () => {
  assert.equal(await say(dw([]), "any dividends this month"), "No dividends were paid into Mock brokerage this month (Oct 1 to Oct 12). From Mock Broker's activity, as of 14:00 UTC.");
  const u = await world(ROWS).s.start("what dividends did I get"); assert.equal(u.reason, "dividends_unreadable"); assert.doesNotMatch(u.text, /\$\d/);
  const w = dw(DIVS); w.unread = ["DIVWH"]; assert.match(await say(w, "what dividends did I get"), /Some dividend kinds \(DIVWH\) couldn't be read from the broker, so they aren't counted here\.$/);
});
test("[S28] the ways people ask: a savings 'dividend' is the bank's interest, reinvesting is not built, picking dividend stocks is advice", async () => {
  for (const t of ["what dividends did I get", "how much in dividends did i get this year", "did VOO pay a dividend", "my dividends", "VOO dividends last year"]) assert.equal(T.parse(t).action, "dividends", t);
  assert.equal(T.parse("what dividends did I get").query, null);
  assert.equal(T.parse("how much in dividends did i get in 2026").query, null, "a period is never a ticker");
  assert.equal(T.parse("did i get any dividends from schd").query, "SCHD");
  assert.match(await say(dw(DIVS), "how much dividend did my savings pay"), /^That sounds like your savings account's dividend: credit unions call the interest they pay a dividend\./);
  const d = await dw(DIVS).s.start("reinvest my dividends"); assert.equal(d.outcome, "not_built"); assert.match(d.text, /^Reinvesting dividends isn't built in Upmore yet, so nothing was set up\./);
  assert.notEqual(T.parse("best dividend stocks to buy").action, "dividends");
});
test("[S29] performance asks: the ways people ask reach it; a period not ending today is said, never worked out; missing history is never 'the account was empty'", async () => {
  for (const t of ["how are my investments doing this year", "what's my ytd return", "compare my portfolio to the S&P", "am I beating the market", "how did my portfolio do this year", "portfolio return this month", "how much have I made investing since I started"]) assert.equal(T.parse(t).action, "performance", t);
  for (const t of ["how is my portfolio doing", "should I buy SPY to beat the market", "what do I own"]) assert.notEqual(T.parse(t).action, "performance", t);
  assert.equal(await say(world(ROWS), "how did my portfolio do last year"), "I can work out a return only for a period that ends today, so not that one. Ask \"how did my portfolio do this year\", \"this month\", \"over the last 12 months\" or \"since I started\".");
  const w = world(ROWS);
  w.conn.read = ((base) => async (k, p) => k === "brokerage_accounts" ? { value: [{ id: "a", name: "Mock brokerage", equity_cents: 357345, last_equity_cents: 350000 }], source: "Mock Broker", as_of: w.now } : k === "portfolio_history" ? { value: [{ date: "2026-10-08", equity_cents: 348000 }, { date: "2026-10-09", equity_cents: 350000 }], source: "Mock Broker", as_of: w.now } : k === "cash_flows" ? { value: [], share_moves: [], source: "Mock Broker", as_of: w.now } : base(k, p))(w.conn.read);
  w.s = T.create({ registry, connectors: w.conn, clock: () => w.now, instruments, partners: { broker_dealer: { live: true } }, compliance: C });
  assert.match(await say(w, "portfolio return this month"), /^Since Oct 8, 2026, the first day with a value I can read for this period, Mock brokerage gained \$93\.45, \+2\.7%\./);
});
test("[S30] which of my stocks are up: each holding's close at the period's start against its latest, ranked, a holding without prices said, 'why' never guessed", async () => {
  const BARS = { PLTR: [["2026-04-10", 2000], ["2026-10-05", 4000], ["2026-10-09", 4110]], VOO: [["2026-04-10", 50000], ["2026-10-05", 51000], ["2026-10-09", 51210]] };
  const w = world(ROWS);
  w.conn.read = ((base) => async (k, p) => k === "bars" ? { value: (BARS[p.symbol] || []).filter((x) => x[0] >= p.from).map(([date, close_cents]) => ({ date, close_cents })), source: "Mock Market Data", as_of: w.now } : base(k, p))(w.conn.read);
  w.s = T.create({ registry, connectors: w.conn, clock: () => w.now, instruments, partners: { broker_dealer: { live: true } }, compliance: C });
  assert.equal(await say(w, "which of my stocks are up over 6 months and why"), "Your holdings over the last 6 months, by closing price with dividends and splits counted: up PLTR +105.5%, VOO +2.4%. From Mock Market Data, Apr 10, 2026 close to Oct 9, 2026 close; positions from Mock Broker, as of 14:00 UTC. No prices for F over that period, so it isn't ranked. Why they moved isn't something prices can say, and no news source is connected, so I won't guess at a reason.");
  assert.match(await say(w, "how did my stocks do this week"), /^Your holdings over the last 7 days, by closing price with dividends and splits counted: up PLTR \+2\.8%, VOO \+0\.4%\. From Mock Market Data, Oct 5, 2026 close to Oct 9, 2026 close;/);
  for (const t of ["which of my stocks are up over 6 months and why", "how did my stocks do this week", "which of my holdings are down", "top movers in my portfolio"]) assert.equal(T.parse(t).action, "moves", t);
  assert.notEqual(T.parse("how did my portfolio do this year").action, "moves");
  assert.equal(w.writes.length, 0);
});

