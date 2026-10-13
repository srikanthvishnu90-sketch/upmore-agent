// FINAL A4 — C22 dividends, the two broker reads wired (packages/domain/71-alpaca.js):
//   dividends_calendar -> GET {data}/v1/corporate-actions?types=cash_dividend (Alpaca Market Data corporate
//     actions; rows nested under corporate_actions.cash_dividends: symbol, cash_amount per share, declaration_date,
//     ex_date, record_date, payable_date, process_date; paged by next_page_token)
//   cash_activity      -> GET /v2/account/activities?activity_types=DIV,DIVCGL,DIVCGS,DIVROC,DIVTXEX,DIVNRA,DIVFT,
//     DIVTW,DIVWH,DIVFEE (the activities reference's multi-type form), netted per day and symbol by the adapter.
// Every case runs through the production chat path (66-agent-trade.js) over the production adapter and connector
// layer, against the MOCK Alpaca server (tests/fixtures/alpaca-mock.cjs) over real HTTP. The broker is a mock and
// is named on every source line ("Alpaca mock server"); nothing here is evidence about Alpaca itself, and no real
// Alpaca read is possible today: the Alpaca partner/OAuth app is unregistered, so no person's token exists to read
// with. Before this wiring both reads threw NOT_WIRED in the connector, so the announced surface always answered
// "dividends_calendar_unreadable" and the cash cross-check never ran. The transcript of these exact conversations
// is ~/workspace/your_files/upmore-conversations/C22-dividends.md.
// Check: node --test tests/final-a4-dividends.test.cjs
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const domainDir = path.join(root, "packages/domain");
const Mock = require("./fixtures/alpaca-mock.cjs");
const ctx = vm.createContext({ fetch, AbortController, setTimeout, clearTimeout, URL, btoa, Buffer });
vm.runInContext(["35-agent-intents.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "50-agent-invest.js", "53-compliance.js", "66-agent-trade.js", "67-agent-cards.js", "71-alpaca.js", "76-connect-cards.js", "73-broker-accounts.js"].map(f => fs.readFileSync(path.join(domainDir, f), "utf8")).join("\n") + "\nthis.T=AgentTrade;this.A=AlpacaTrading;this.C=Compliance;", ctx);
const { T, A, C } = ctx;
const Registry = require(path.join(root, "packages/capabilities/registry.js"));
const registry = Registry.load(JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")), rel => fs.existsSync(path.join(root, rel)));
const TOKEN = "tok-person-1", ACCT = "acct-live-1";
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0), NOV2 = Date.UTC(2026, 10, 2, 14, 0, 0);
const servers = []; after(async () => { for (const s of servers) await s.close(); });
async function world(opts) {
  const o = opts || {}; const t = { now: o.now || T0 };
  const m = await Mock.start(Object.assign({ now: () => t.now, account: ACCT, tokens: { [TOKEN]: ACCT } }, o.mock || {})); servers.push(m);
  const adapter = A.create({ base: m.base, mock: true, token: TOKEN, account_id: ACCT, order_cap_cents: 1000000, clock: () => t.now });
  const conn = A.connectors(adapter, { clock: () => t.now });
  const s = T.create({ registry, connectors: conn, clock: () => t.now, instruments: [], partners: { broker_dealer: { live: true, paper: false, name: "Alpaca (your account)" } }, compliance: C });
  return { t, m, adapter, conn, s };
}
// A corporate-actions row in Alpaca's wire shape (cash_amount is a JSON number, as the Market Data API serves it).
const CA = (id, symbol, amt, decl, ex, pay, proc, extra) => Object.assign({ id, corporate_action_type: "cash_dividend", symbol, cash_amount: amt, currency: "USD", declaration_date: decl, ex_date: ex, record_date: ex, payable_date: pay, process_date: proc }, extra || {});
const ACT = (id, type, date, amt, sym, extra) => Object.assign({ id, activity_type: type, date, net_amount: amt, description: "", status: "executed", symbol: sym, qty: "40", per_share_amount: "1.85" }, extra || {});
const CAL = [
  CA("ca-voo-1", "VOO", 1.85, "2026-10-05", "2026-10-16", "2026-10-30", "2026-10-06"),
  CA("ca-msft-1", "MSFT", 0.91, "2026-10-08", "2026-11-19", "2026-12-10", "2026-10-09"),
  CA("ca-voo-old", "VOO", 1.62, "2026-08-28", "2026-09-18", "2026-09-25", "2026-09-01"),
];

test("(a) announced: VOO declares $1.85/share, ex-date and pay-date ahead, 40 shares held -> the answer names the symbol, $74.00 expected, both dates", async () => {
  const w = await world({ mock: { positions: { VOO: 40 }, corporate_actions: CAL } });
  const r = await w.s.start("what dividends are coming up");
  assert.equal(r.reason, "dividends_upcoming");
  assert.equal(r.text, "Announced dividends on your holdings, coming up: VOO $1.85 a share, ex-date Oct 16, 2026, pays Oct 30, 2026 — $74.00 on your 40 shares. From Alpaca mock server market data, as of 14:00 UTC.");
  assert.equal(JSON.stringify(r.upcoming), JSON.stringify([{ symbol: "VOO", per_share_cents: 185, ex_date: "2026-10-16", pay_date: "2026-10-30", declared_on: "2026-10-05", qty: 40 }]));
  const req = w.m.state.requests.filter(q => q.path === "/v1/corporate-actions");
  assert.equal(req.length, 1, "one corporate-actions read");
  assert.match(req[0].query, /types=cash_dividend/);
  assert.equal(req[0].authorization, "Bearer " + TOKEN);
  assert.equal(w.m.writes().length, 0, "a read-only surface places nothing");
});

test("(d) a declared dividend for a symbol NOT held is not surfaced, and a past ex-date is not upcoming", async () => {
  const w = await world({ mock: { positions: { VOO: 40 }, corporate_actions: CAL } });
  const r = await w.s.start("announced dividends");
  assert.doesNotMatch(r.text, /MSFT/, "MSFT is declared in the feed but not held");
  assert.doesNotMatch(r.text, /Sep 18|Sep 25/, "the September VOO dividend's ex-date has passed");
  const bare = await world({ mock: { positions: { SCHD: 10 }, corporate_actions: CAL } });
  assert.equal((await bare.s.start("what dividends are coming up")).text, "No announced dividends with an ex-date coming up for the holdings in this read. From Alpaca mock server market data, as of 14:00 UTC.");
});

test("(e) the calendar is down: the honest unreadable answer, unchanged, no figure invented", async () => {
  const w = await world({ mock: { positions: { VOO: 40 }, corporate_actions: CAL } });
  w.m.fault("calendar_down");
  const r = await w.s.start("what dividends are coming up");
  assert.equal(r.reason, "dividends_calendar_unreadable");
  assert.equal(r.text, "I can't read announced dividends from the broker right now, so I won't guess at what's coming. Ask again in a moment.");
  assert.doesNotMatch(r.text, /\$\d/);
});

test("(b) received, verified: the pay date passes and the cash activity shows DIV +$74.00 -> received == announced to the cent", async () => {
  const w = await world({ now: NOV2, mock: { positions: { VOO: 40 }, activities: [ACT("p1", "DIV", "2026-10-30", "74.00", "VOO")] } });
  const r = await w.s.start("what dividends did I get");
  assert.equal(r.text, "Dividends this year (Jan 1 to Nov 2): $74.00 from 1 payment in your Alpaca account. VOO $74.00 (Oct 30). Checked against your cash activity: every one of the 1 payment matches its cash credit to the cent on its payment date. From Alpaca mock server's activity, as of 14:00 UTC.");
  assert.equal(r.total_cents, 7400);
  const cash = w.m.state.requests.filter(q => q.path === "/v2/account/activities");
  assert.equal(cash.length, 1, "the cross-check is one multi-type activities read");
  assert.match(cash[0].query, /activity_types=DIV,DIVCGL,DIVCGS,DIVROC,DIVTXEX,DIVNRA,DIVFT,DIVTW,DIVWH,DIVFEE/);
});

test("(c) withholding: DIV +$74.00 with a DIVWH -$3.70 row -> both amounts and the withholding are stated, never silently netted", async () => {
  const w = await world({ now: NOV2, mock: { positions: { VOO: 40 }, activities: [ACT("p1", "DIV", "2026-10-30", "74.00", "VOO"), ACT("w1", "DIVWH", "2026-10-30", "-3.70", "VOO", { qty: "", per_share_amount: "" })] } });
  const r = await w.s.start("what dividends did I get");
  assert.equal(r.text, "Dividends this year (Jan 1 to Nov 2): $74.00 from 1 payment in your Alpaca account. VOO $74.00 (Oct 30). $3.70 was withheld or charged against them, so $70.30 landed. Checked against your cash activity: every one of the 1 payment matches its cash credit to the cent on its payment date. From Alpaca mock server's activity, as of 14:00 UTC.");
  assert.equal(r.total_cents, 7400); assert.equal(r.withheld_cents, 370);
});

test("(f) a named month's total ties to the cash rows to the cent (hand sum: 18.50 + 12.75 + 42.25 = 73.50 gross, 2.25 withheld, 71.25 landed)", async () => {
  const w = await world({ mock: { positions: { VOO: 40 }, activities: [
    ACT("s1", "DIV", "2026-09-04", "18.50", "VOO", { qty: "10" }),
    ACT("s2", "DIV", "2026-09-11", "12.75", "SCHD", { qty: "15", per_share_amount: "0.85" }),
    ACT("s3", "DIV", "2026-09-25", "42.25", "VOO", { qty: "25", per_share_amount: "1.69" }),
    ACT("s4", "DIVWH", "2026-09-25", "-2.25", "VOO", { qty: "", per_share_amount: "" }),
    ACT("o1", "DIV", "2026-08-14", "9.99", "VOO", { qty: "10", per_share_amount: "0.99" }),
  ] } });
  const r = await w.s.start("how much in dividends in September");
  assert.equal(r.text, "Dividends in September 2026: $73.50 from 3 payments in your Alpaca account. VOO $60.75 (2 payments, last Sep 25), SCHD $12.75 (Sep 11). $2.25 was withheld or charged against them, so $71.25 landed. Checked against your cash activity: every one of the 3 payments matches its cash credit to the cent on its payment date. From Alpaca mock server's activity, as of 14:00 UTC.");
  assert.equal(r.total_cents, 7350); assert.equal(r.withheld_cents, 225);
});

test("variants: the amount carried as rate, fractional shares, a symbol-specific ask, an empty calendar, and no verification claim when the cash read is down", async () => {
  const rate = await world({ mock: { positions: { VOO: 40 }, corporate_actions: [CA("r1", "VOO", undefined, "2026-10-05", "2026-10-16", "2026-10-30", "2026-10-06", { rate: 1.85 })] } });
  assert.match((await rate.s.start("what dividends are coming up")).text, /VOO \$1\.85 a share, ex-date Oct 16, 2026, pays Oct 30, 2026 — \$74\.00 on your 40 shares\./, "a row carrying the amount as rate still reads");
  const frac = await world({ mock: { positions: { VOO: 40.5 }, corporate_actions: CAL } });
  assert.match((await frac.s.start("what dividends are coming up")).text, /\$74\.93 on your 40\.5 shares/, "40.5 x $1.85 = $74.925, said as $74.93");
  const sym = await world({ mock: { positions: { VOO: 40, SCHD: 10 }, corporate_actions: CAL.concat([CA("ca-schd-1", "SCHD", 0.85, "2026-10-05", "2026-12-11", "2026-12-18", "2026-10-06")]) } });
  const one = await sym.s.start("what VOO dividends are coming up");
  assert.match(one.text, /VOO \$1\.85 a share/); assert.doesNotMatch(one.text, /SCHD/, "a VOO ask lists VOO only");
  const empty = await world({ mock: { positions: { VOO: 40 }, corporate_actions: [] } });
  assert.equal((await empty.s.start("announced dividends")).text, "No announced dividends with an ex-date coming up for the holdings in this read. From Alpaca mock server market data, as of 14:00 UTC.");
  // DIVWH refused: the per-type read says it is not counted, the combined cash read refuses with it, and NO
  // verification is claimed either way.
  const down = await world({ now: NOV2, mock: { positions: { VOO: 40 }, refuse_types: ["DIVWH"], activities: [ACT("p1", "DIV", "2026-10-30", "74.00", "VOO")] } });
  const dt = (await down.s.start("what dividends did I get")).text;
  assert.match(dt, /Some dividend kinds \(DIVWH\) couldn't be read from the broker, so they aren't counted here\.$/);
  assert.doesNotMatch(dt, /Checked against your cash activity/, "no cash read, no verification claim");
});

test("adapter level: the calendar read follows next_page_token; the cash read nets per day and symbol and drops canceled rows", async () => {
  const pages = { "": { corporate_actions: { cash_dividends: [{ id: "a", symbol: "VOO", cash_amount: 1.0, ex_date: "2026-10-16", payable_date: "2026-10-30", declaration_date: "2026-10-01", process_date: "2026-10-02" }] }, next_page_token: "a" },
    "a": { corporate_actions: { cash_dividends: [{ id: "b", symbol: "SCHD", cash_amount: 0.5, ex_date: "2026-11-01", payable_date: "2026-11-15", declaration_date: "2026-10-03", process_date: "2026-10-04" }] }, next_page_token: null } };
  const ad = A.create({ token: "t", account_id: "x", clock: () => T0, fetch: async (url) => ({ status: 200, text: async () => JSON.stringify(pages[new URL(url).searchParams.get("page_token") || ""]) }) });
  const cal = await ad.dividendsCalendar();
  assert.equal(JSON.stringify(cal.value.map(x => [x.symbol, x.per_share_cents])), JSON.stringify([["VOO", 100], ["SCHD", 50]]));
  const w = await world({ mock: { activities: [ACT("p1", "DIV", "2026-10-30", "74.00", "VOO"), ACT("w1", "DIVWH", "2026-10-30", "-3.70", "VOO"), ACT("x1", "DIV", "2026-10-30", "9.00", "VOO", { status: "canceled" })] } });
  const cash = await w.adapter.cashActivity("2026-01-01");
  assert.equal(JSON.stringify(cash.value), JSON.stringify([{ date: "2026-10-30", symbol: "VOO", cents: 7030 }]), "74.00 - 3.70 netted, the canceled $9.00 dropped");
  // Before this wiring the connector had no such kinds at all.
  assert.equal(typeof w.adapter.dividendsCalendar, "function"); assert.equal(typeof w.adapter.cashActivity, "function");
});
