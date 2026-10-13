// FINAL K4 — brokerage reads: C22 (adopted; A4's wiring re-verified + the broker-boundary connect state),
// C40 Portfolio X-ray, C41 What-if scenarios, C55 pre-IPO offerings.
// All conversations run through the production chat path (66-agent-trade.js) over fake connectors that
// serve STAND-IN data, labeled as such on every source line: the owner's real brokerage is not connected
// (the Plaid path is built but blocked on his MSA acceptance, and no Alpaca OAuth token exists), so no
// number here is evidence about his real accounts. Muse parity was worked out by hand BEFORE the agent
// was asked (see the arithmetic in each test's comment) and the agent must match it to the cent.
// Check: node --test tests/final-k4-brokerage.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const domainDir = path.join(root, "packages/domain");
const ctx = vm.createContext({ fetch, AbortController, setTimeout, clearTimeout, URL, btoa, Buffer });
vm.runInContext(["35-agent-intents.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "50-agent-invest.js", "53-compliance.js", "66-agent-trade.js", "67-agent-cards.js", "71-alpaca.js", "76-connect-cards.js", "73-broker-accounts.js", "69-agent-router.js"].map(f => fs.readFileSync(path.join(domainDir, f), "utf8")).join("\n") + "\nthis.T=AgentTrade;this.BA=BrokerAccounts;this.C=Compliance;this.R=AgentRouter;", ctx);
const { T, BA, C, R } = ctx;
const Registry = require(path.join(root, "packages/capabilities/registry.js"));
const registry = Registry.load(JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")), rel => fs.existsSync(path.join(root, rel)));
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0), OCT15 = Date.UTC(2026, 9, 15, 14, 0, 0);

// Stand-in fund composition data (published-style weights, labeled stand-in everywhere it is cited).
const FUND = {
  VOO: { expense_ratio_pct: 0.03, holdings: [{ symbol: "AAPL", weight_pct: 6.8 }, { symbol: "MSFT", weight_pct: 6.2 }, { symbol: "NVDA", weight_pct: 5.9 }] },
  VTI: { expense_ratio_pct: 0.03, holdings: [{ symbol: "AAPL", weight_pct: 6.0 }, { symbol: "MSFT", weight_pct: 5.5 }, { symbol: "NVDA", weight_pct: 5.0 }] },
  BND: { expense_ratio_pct: 0.03, duration_years: 6.0, holdings: [{ label: "U.S. bonds", weight_pct: 100 }] },
};
// Stand-in holdings across two accounts. Hand parity (worked before asking):
//   invested = 22,000 + 2,300 + 5,800 + 2,190 = $32,290.00; cash $700.00 (acct A only).
//   AAPL look-through = 2,300 direct + 22,000x6.8% (1,496) + 5,800x6.0% (348) = $4,144.00 = 12.8% of invested.
//   MSFT = 22,000x6.2% (1,364) + 5,800x5.5% (319) = $1,683.00 = 5.2%. NVDA = 1,298 + 290 = $1,588.00 = 4.9%.
//   Remainders: VOO other = 22,000 - (1,496+1,364+1,298) = $17,842.00; VTI other = 5,800 - 957 = $4,843.00.
//   Drag = 0.03% x (22,000 + 5,800 + 2,190) = 0.0003 x 29,990 = $8.997 -> $9.00 a year.
const HOLDINGS = {
  "acct-a": [{ symbol: "VOO", qty: 40, market_value_cents: 2200000 }, { symbol: "AAPL", qty: 10, market_value_cents: 230000 }],
  "acct-b": [{ symbol: "VTI", qty: 20, market_value_cents: 580000 }, { symbol: "BND", qty: 30, market_value_cents: 219000 }],
};
const makeCalendar = () => [{ company: "Helio Dynamics", provider: "Robinhood", app: "Robinhood", access_label: "IPO Access", opens_at: "2026-10-12T13:00:00Z", closes_at: "2026-10-14T04:00:00Z", price_low_cents: 1800, price_high_cents: 2100, allocation: null }];

function connectors(o, t, cal) {
  return { live: true, label: "stand-in connectors",
    read: async (kind, p) => {
      if (kind === "brokerage_accounts") return { value: [{ id: "acct-a", name: "your Brokerage A account", live: true, cash_cents: 70000, fee_cents: 0 }, { id: "acct-b", name: "your Brokerage B account", live: true, cash_cents: 0, fee_cents: 0 }], source: "stand-in brokerage feed", as_of: t.now };
      if (kind === "holdings") { if (o.failHoldingsFor && (p && p.account) === o.failHoldingsFor) throw new Error("broker down"); return { value: (o.holdings || HOLDINGS)[(p && p.account) || "acct-a"] || [], source: "stand-in brokerage feed", as_of: t.now }; }
      if (kind === "ipo_offerings") { if (o.noCalendar) throw new Error("NOT_WIRED: ipo_offerings is not a wired read"); return { value: cal, source: "stand-in offering calendar", as_of: t.now }; }
      throw new Error("NOT_WIRED: " + kind);
    },
    write: async () => { throw new Error("K4 is read-only: writes must never be called"); }, verify: async () => ({ confirmed: false }) };
}
function world(opts) {
  const o = opts || {}; const t = { now: o.now || T0 };
  const cal = o.calendar || makeCalendar();
  const conn = connectors(o, t, cal);
  const s = T.create({ registry, connectors: conn, clock: () => t.now, instruments: [], partners: { broker_dealer: { live: true, paper: false, name: "Alpaca (your account)" } }, compliance: C, fund_data: o.fund_data !== undefined ? o.fund_data : FUND, fund_data_source: "stand-in fund composition data", state: o.state });
  return { t, s, cal, conn };
}

const XRAY_TEXT = "Portfolio X-ray across 2 accounts: $32,290.00 invested, plus $700.00 in cash. Looking through the funds, the named exposures are AAPL $4,144.00 (12.8%), U.S. bonds $2,190.00 (6.8%), MSFT $1,683.00 (5.2%), NVDA $1,588.00 (4.9%) — percentages of the invested total. The rest is inside the funds beyond their top names: $17,842.00 in VOO's other holdings, $4,843.00 in VTI's other holdings. Overlap: AAPL reaches you 3 ways (inside VOO, directly, inside VTI) — $4,144.00 combined (12.8%); MSFT reaches you 2 ways (inside VOO, inside VTI) — $1,683.00 combined (5.2%); NVDA reaches you 2 ways (inside VOO, inside VTI) — $1,588.00 combined (4.9%). Fund fees: expense ratios of VOO 0.03%, VTI 0.03%, BND 0.03% on $29,990.00 of funds cost about $9.00 a year. Direct stocks carry no fund fee. Concentration: AAPL at 12.8% of invested is over a tenth in one name, the biggest single-name exposure in this read. Holdings from stand-in brokerage feed, as of 14:00 UTC; fund composition from stand-in fund composition data.";

test("C40 (a) the X-ray sentence from the capability set: look-through, overlap, drag and concentration match the hand parity to the cent", async () => {
  const w = world();
  const r = await w.s.start("what do i actually own underneath all my funds");
  assert.equal(r.reason, "xray");
  assert.equal(r.text, XRAY_TEXT);
  assert.equal(r.total_invested_cents, 3229000);
  assert.equal(r.drag_cents, 900);
  assert.equal(r.overlaps.length, 3);
});

test("C40 (b) 'portfolio x-ray' phrasing routes the same; the pure function alone reproduces the text", async () => {
  const w = world();
  assert.equal((await w.s.start("portfolio x-ray")).text, XRAY_TEXT);
  const pure = T.portfolioXray({ positions: HOLDINGS["acct-a"].concat(HOLDINGS["acct-b"]), cash_cents: 70000, accounts: 2, fund_data: FUND, fund_source: "stand-in fund composition data", source: "stand-in brokerage feed", as_of: T0 });
  assert.equal(pure.text, XRAY_TEXT);
});

test("C40 variants: a fund with a fee but no composition is not looked through and says so; no fund data at all counts no drag; a holdings read failure refuses a partial X-ray", async () => {
  const fd = Object.assign({}, FUND, { SCHD: { fund: true, expense_ratio_pct: 0.06 } });
  const hold = { "acct-a": HOLDINGS["acct-a"].concat([{ symbol: "SCHD", qty: 10, market_value_cents: 500000 }]), "acct-b": HOLDINGS["acct-b"] };
  const w = world({ fund_data: fd, holdings: hold });
  const r = await w.s.start("portfolio x-ray");
  assert.match(r.text, /Not looked through \(no composition data in this read\): SCHD/);
  assert.match(r.text, /SCHD \$5,000\.00 \(13\.4%\)/, "SCHD counts as one block: 5,000 / 37,290 = 13.4%");
  const bare = world({ fund_data: {} });
  const rb = await bare.s.start("portfolio x-ray");
  assert.match(rb.text, /No fund expense-ratio data in this read, so no yearly fee drag is counted\./);
  assert.match(rb.text, /named exposures are VOO \$22,000\.00 \(68\.1%\)/, "with no composition every holding is its own exposure");
  const down = world({ failHoldingsFor: "acct-b" });
  const rd = await down.s.start("portfolio x-ray");
  assert.equal(rd.reason, "holdings_unreadable");
  assert.doesNotMatch(rd.text, /\$32,290/, "a partial portfolio is never x-rayed");
});

test("C41 (a) monthly: $500/mo x 10y at assumed 4/7/10% — hand parity (Python Decimal): $73,624.90 / $86,542.40 / $102,422.49 on $60,000.00 put in", async () => {
  const w = world();
  const r = await w.s.start("what if i invest $500 a month for 10 years");
  assert.equal(r.reason, "whatif_monthly");
  assert.equal(r.text, "If you invest $500.00 a month for 10 years, you'd put in $60,000.00. It ends at $73,624.90 at an assumed 4% a year; $86,542.40 at an assumed 7% a year; $102,422.49 at an assumed 10% a year. Math: monthly compounding, each payment at month-end — e.g. at 7%, $500.00 × (((1 + 7/1200)^120 − 1) / (7/1200)). The returns are assumptions to show the math, not predictions; real returns vary year to year. Nothing was invested.");
  assert.equal(T.fvMonthlyCents(50000, 10, 7), 8654240);
});

test("C41 (b) rates: a 1% drop on BND $2,190.00 at duration 6.0 is +$131.40 to $2,321.40 (hand parity); a 2% rise is -$262.80; no bond exposure says so", async () => {
  const w = world();
  const r = await w.s.start("what if rates drop 1%");
  assert.equal(r.reason, "whatif_rates");
  assert.equal(r.move_cents, 13140);
  assert.equal(r.text, "If rates drop 1%: your bond exposure is BND $2,190.00 ($2,190.00 in all), average duration 6.0 years (stand-in fund composition data). A 1% drop moves a bond fund by roughly duration × 1% ≈ 6.0%, so about +$131.40, to about $2,321.40. Math: $2,190.00 × 6.0 × 1%. That's the duration approximation — it ignores convexity and credit spreads — applied to your positions from stand-in brokerage feed, as of 14:00 UTC. It touches nothing else you hold directly.");
  const up = await world().s.start("what if rates rise 2%");
  assert.equal(up.move_cents, -26280);
  assert.match(up.text, /to about \$1,927\.20/, "2,190.00 - 262.80 = 1,927.20");
  const none = await world({ holdings: { "acct-a": [{ symbol: "VOO", qty: 40, market_value_cents: 2200000 }], "acct-b": [] } }).s.start("what if rates drop 1%");
  assert.match(none.text, /I don't see bond exposure with a duration in this read/);
  assert.doesNotMatch(none.text, /\+\$/, "no invented dollar effect without duration data");
});

test("C41 (c) shock and lump: VOO -20% is -$4,400.00 and the total $32,290.00 -> $27,890.00 (-13.6%); a $5,000 lump for 5 years matches the hand parity", async () => {
  const w = world();
  const r = await w.s.start("what if VOO drops 20%");
  assert.equal(r.text, "If VOO drops 20%: your VOO is worth $22,000.00, so it would fall $4,400.00 to $17,600.00, and your invested total would go from $32,290.00 to $27,890.00 (−13.6%). That's the direct position as read from stand-in brokerage feed, as of 14:00 UTC — a straight percent on today's value, not a forecast.");
  assert.equal(r.delta_cents, -440000);
  const lump = await w.s.start("what if i put $5,000 aside for 5 years");
  assert.equal(lump.text, "If you put $5,000.00 aside for 5 years, it becomes $6,083.26 at an assumed 4% a year; $7,012.76 at an assumed 7% a year; $8,052.55 at an assumed 10% a year. Math: $5,000.00 × (1 + r)^5, compounded yearly. The returns are assumptions to show the math, not predictions. Nothing was invested.");
  const named = await w.s.start("what if i invest $200 a month for 5 years at 8%");
  assert.match(named.text, /It ends at \$14,695\.37 at an assumed 8% a year\./, "named rate only, FV hand-checked: 200 x (((1+0.08/12)^60 - 1)/(0.08/12)) = $14,695.37");
  const noYears = await w.s.start("what if i invest $500 a month");
  assert.equal(noYears.reason, "whatif_years");
});

test("C41 guard: 'what if i sell all my tesla' is NOT a what-if scenario here — it stays an unstaged hypothetical (parse action 'new', no scenario runs)", async () => {
  assert.equal(T.parse("what if i sell all my tesla").action, "new");
  assert.equal(T.parse("what if i invest $500 a month for 10 years").action, "whatif");
  assert.equal(T.parse("what do i actually own underneath all my funds").action, "xray");
});

test("C55 (a) watch + alert inside the window: the watch is confirmed, ipoCheck fires exactly one alert inside the window, and the same check again is silent", async () => {
  const w = world();
  const set = await w.s.start("alert me the second a pre-IPO offering opens");
  assert.equal(set.reason, "ipo_watch");
  assert.equal(set.text, "You're set: I'll watch the offering calendar (stand-in offering calendar, as of 14:00 UTC) and alert you here the moment an offering opens. One is already inside its window: Helio Dynamics (open until Oct 14, 2026). Say \"walk me through it\" when you're ready — the request itself is always your tap in the provider app; I guide and track, I never submit it.");
  const alert = await w.s.ipoCheck();
  assert.equal(alert.reason, "ipo_alert");
  assert.equal(alert.text, "Offering window open: Helio Dynamics is taking IPO requests now through Robinhood (stand-in offering calendar), until Oct 14, 2026, 04:00 UTC. Indicative price $18.00–$21.00 a share. Say \"walk me through it\" and I'll step you through the request in the app — you tap submit there; I'll track the allocation to settlement.");
  assert.equal(await w.s.ipoCheck(), null, "the alert fires once per offering");
});

test("C55 (b) the walkthrough: 4 guided steps in the provider app, the submit stays the person's tap, and their confirmation records the tracked request", async () => {
  const w = world();
  await w.s.start("alert me the second a pre-IPO offering opens");
  await w.s.ipoCheck();
  const s1 = await w.s.start("walk me through it");
  assert.equal(s1.text, "Walkthrough for Helio Dynamics in Robinhood — 4 steps; you do each in the app and tell me when it's done. Step 1: open the Robinhood app and go to its IPO section (IPO Access). Say \"done\" when you're there, or \"stop\" to drop this.");
  assert.match((await w.s.start("walk me through it")).text, /already walking through Helio Dynamics/, "a repeated ask restates the live step, never restarts");
  assert.match((await w.s.start("done")).text, /^Step 2: find Helio Dynamics/);
  assert.match((await w.s.start("done")).text, /^Step 3: enter the request/);
  assert.match((await w.s.start("done")).text, /^Step 4: review it in the app and tap confirm — that tap is yours/);
  assert.match((await w.s.start("done")).text, /That's the last step I can guide from here/);
  const rec = await w.s.start("i submitted it");
  assert.equal(rec.reason, "ipo_request_recorded");
  assert.equal(rec.text, "Recorded, from your confirmation in the app: your Helio Dynamics IPO request is in (Oct 12, 2026). I didn't submit anything — that was your tap. Status: requested; the window closes Oct 14, 2026, and allocations are reported after it closes. Ask \"IPO status\" anytime — I'll track it to settlement.");
  assert.equal(w.s.snapshot().ipo.requests.length, 1);
});

test("C55 (c) allocation tracked to settlement: status before allocation, after the provider reports 25 shares at $20.00 ($500.00) settling Oct 16, and the not-allocated variant", async () => {
  const w = world();
  await w.s.start("alert me the second a pre-IPO offering opens");
  await w.s.start("walk me through it");
  await w.s.start("done"); await w.s.start("done"); await w.s.start("done");
  await w.s.start("i submitted it");
  const early = await w.s.start("ipo status");
  assert.equal(early.text, "Helio Dynamics: requested on Oct 12, 2026 (your confirmation in the app); the window is still open until Oct 14, 2026, so allocation comes after it closes. From stand-in offering calendar, as of 14:00 UTC.");
  w.t.now = OCT15; w.cal[0].allocation = { status: "allocated", shares: 25, price_cents: 2000, settle_date: "2026-10-16" };
  const done = await w.s.start("ipo status");
  assert.equal(done.text, "Helio Dynamics: the provider reports you were allocated 25 shares at $20.00 ($500.00 in all), settling Oct 16, 2026. Your request from Oct 12, 2026 is fully tracked — allocation in, settlement dated. From stand-in offering calendar, as of 14:00 UTC.");
  // The request survives a session restore from the snapshot (the host's stateless path).
  const restored = world({ now: OCT15, state: w.s.snapshot(), calendar: w.cal });
  assert.match((await restored.s.start("ipo status")).text, /allocated 25 shares at \$20\.00/);
  const w2 = world();
  await w2.s.start("alert me the second a pre-IPO offering opens");
  await w2.s.start("walk me through it");
  await w2.s.start("done"); await w2.s.start("done"); await w2.s.start("done");
  await w2.s.start("i submitted it");
  w2.t.now = OCT15; w2.cal[0].allocation = { status: "not_allocated" };
  assert.match((await w2.s.start("ipo status")).text, /no allocation for your request from Oct 12, 2026/);
});

test("C55 (d) the capability's own sentence does both: watch recorded AND walkthrough started; adversarials: no calendar = no watch claimed, credentials refused, a stop ends the walk, buying IPO shares stays refused with the pointer", async () => {
  const w = world();
  const both = await w.s.start("alert me the second a pre-IPO offering opens and walk me through it");
  assert.match(both.text, /^You're set: I'll watch the offering calendar and alert you here the moment an offering opens\. Walkthrough for Helio Dynamics/);
  assert.equal(w.s.snapshot().ipo.watches.length, 1);
  const stop = await w.s.start("stop");
  assert.equal(stop.reason, "ipo_walk_stop");
  assert.equal(w.s.snapshot().ipo.requests.length, 0, "a stopped walkthrough records no request");
  const nc = await world({ noCalendar: true }).s.start("alert me when a pre-IPO offering opens");
  assert.equal(nc.reason, "ipo_calendar_unreadable");
  assert.match(nc.text, /I won't pretend a watch is live/);
  const cred = await world().s.start("log in for me with my password and get me into the ipo");
  assert.equal(cred.reason, "ipo_no_credentials");
  const buy = await world().s.start("buy $500 of IPO shares");
  assert.equal(buy.reason, "ipo_private_unsupported");
  assert.match(buy.text, /alert you inside the window and walk you through the request in your provider's app/);
  assert.doesNotMatch(buy.text, /your request is in|I placed|request recorded/, "nothing about a buy ask is ever a placed request");
});

test("C22 boundary: with no brokerage connected, a dividend question gets the connect state a user actually sees (BrokerAccounts' connect card), word for word", async () => {
  const conn = { read: async () => { throw new Error("unused"); }, write: async () => {}, verify: async () => ({}) };
  const s = T.create({ registry, connectors: conn, clock: () => T0, instruments: [], partners: {}, compliance: C, connect: { code: "connect", message: BA.MESSAGES.connect } });
  const r = await s.start("what dividends did I get");
  assert.equal(r.reason, "broker_connect");
  assert.equal(r.text, "No brokerage is connected yet, so nothing was placed - here's the link.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca");
});

test("router: the K4 shapes route deterministically to the trade flow; a sell hypothetical still falls through", async () => {
  const w = world();
  const memo = {};
  const ctx = () => ({ sessions: { trade: w.s }, memo, now: () => w.t.now });
  const x = await R.handle("what do i actually own underneath all my funds", ctx());
  assert.equal(x.route, "trade_read"); assert.equal(x.result.reason, "xray");
  const wi = await R.handle("what if rates drop 1%", ctx());
  assert.equal(wi.route, "trade_read"); assert.equal(wi.result.reason, "whatif_rates");
  const ip = await R.handle("alert me the second a pre-IPO offering opens", ctx());
  assert.equal(ip.route, "trade_read"); assert.equal(ip.result.reason, "ipo_watch");
  const hyp = await R.handle("what if i sell all my tesla how much would i owe", ctx());
  assert.equal(hyp.route, "fallthrough", "a what-if about selling is never captured by C41");
});
