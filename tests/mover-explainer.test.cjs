// C19: portfolio mover explainer. Contribution analysis from real positions and real price moves: each position's day
// P&L in dollars from quantity x (quote - previous close), the portfolio total, drivers ranked, and for each top driver
// the best-matching story from the news provided, linked by AgentNews entity linking and named with its source. A driver
// with no matching story is reported with its dollars and explicitly no stated reason; reasons are never invented.
// All broker/news data here is MOCK fixture data. Check: node --test tests/mover-explainer.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({ setTimeout, clearTimeout });
vm.runInContext(["33-agent-monitors.js", "35-agent-intents.js", "41-agent-recovery.js", "42-agent-recipients.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "49-agent-save.js", "50-agent-invest.js", "53-compliance.js", "54-agent-money.js", "55-agent-news.js", "64-agent-send.js", "65-agent-realworld.js", "66-agent-trade.js", "67-agent-cards.js", "68-agent-cancel.js", "69-agent-router.js", "81-standing-rent.js"].map((f) => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.R=AgentRouter;this.T=AgentTrade;this.X=AgentCancel;this.S=AgentSend;this.C=Compliance;this.N=AgentNews;", ctx);
const { R, T, X, S, C } = ctx;
// The advice guard, imported the way tests/invest.test.cjs imports it.
const G = require(path.join(root, "packages/domain/45-advice-guard.js"));
const Registry = require(path.join(root, "packages/capabilities/registry.js"));
const registry = Registry.load(JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")), (rel) => fs.existsSync(path.join(root, rel)));
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);

// MOCK fixtures: NVDA 20 shares, $206.00 previous close -> $185.40 quote = -$412.00 (-10.0%);
// MSFT 12 shares, $450.00 -> $441.00 = -$108.00 (-2.0%). Portfolio total: -$520.00 on the day.
const POSITIONS = [
  { symbol: "NVDA", name: "Nvidia", qty: 20 },
  { symbol: "MSFT", name: "Microsoft", qty: 12 },
];
const QUOTES = {
  NVDA: { price_cents: 18540, prev_close_cents: 20600 },
  MSFT: { price_cents: 44100, prev_close_cents: 45000 },
};
// A MOCK earnings story for NVDA from a named source; nothing in the provided stories names MSFT.
const STORIES = [
  { id: "n1", title: "Nvidia earnings miss estimates as data center revenue slows", summary: "Nvidia reported quarterly earnings that missed estimates, with data center revenue slowing from a year ago.", source: "Reuters", link: "https://example.test/nvda-earnings", published_at: T0 - 3600000 },
];

test("mover explainer: drivers ranked in dollars with percents, the total, the linked story's source named, the storyless driver reasonless, and the guard lint passes", () => {
  const r = T.moverExplainer({ positions: POSITIONS, quotes: QUOTES, stories: STORIES, source: "Mock Broker", as_of: T0 });
  assert.equal(r.total_cents, -52000, "the portfolio total is the sum of the positions' day P&L");
  assert.equal(r.drivers[0].symbol, "NVDA");
  assert.equal(r.drivers[0].pnl_cents, -41200);
  assert.equal(Math.round(r.drivers[0].pct * 1000) / 10, -10.0, "pct is the price-move ratio; x100 it is -10.0 percent");
  assert.equal(r.drivers[1].symbol, "MSFT");
  assert.equal(r.drivers[1].pnl_cents, -10800);
  // NVDA named first, with its dollars and percent, ahead of MSFT.
  assert.ok(r.text.indexOf("NVDA") > -1 && r.text.indexOf("NVDA") < r.text.indexOf("MSFT"), r.text);
  assert.match(r.text, /NVDA -\$412\.00 \(-10\.0%\)/);
  assert.match(r.text, /down \$520\.00/);
  // The earnings reason is attached, with its source named.
  assert.match(r.text, /earnings/i);
  assert.match(r.text, /Reuters/);
  assert.equal(r.drivers[0].story.source, "Reuters");
  // The second driver has no story: dollars shown, reason explicitly absent.
  assert.equal(r.drivers[1].story, null);
  assert.match(r.text, /MSFT -\$108\.00 \(-2\.0%\)/);
  assert.match(r.text, /no story[\s\S]*MSFT|MSFT[\s\S]*no reason is stated/i);
  // The advice guard's lint passes on the produced text.
  assert.equal(G.response(r.text).ok, true, JSON.stringify(G.response(r.text).findings));
  assert.equal(r.lint_ok, true);
});

test("mover explainer: no stories supplied still answers the dollars, with every reason honestly absent", () => {
  const r = T.moverExplainer({ positions: POSITIONS, quotes: QUOTES, stories: [], source: "Mock Broker", as_of: T0 });
  assert.equal(r.total_cents, -52000);
  assert.match(r.text, /NVDA -\$412\.00/);
  assert.doesNotMatch(r.text, /Reuters|earnings/i);
  assert.ok(r.drivers.every((d) => d.story === null));
  assert.match(r.text, /no reason is stated/i);
  assert.equal(G.response(r.text).ok, true);
});

test("mover explainer: a flat day answers flat", () => {
  const flat = { NVDA: { price_cents: 20600, prev_close_cents: 20600 }, MSFT: { price_cents: 45000, prev_close_cents: 45000 } };
  const r = T.moverExplainer({ positions: POSITIONS, quotes: flat, stories: STORIES, source: "Mock Broker", as_of: T0 });
  assert.equal(r.total_cents, 0);
  assert.match(r.text, /flat/i);
  assert.equal(G.response(r.text).ok, true);
});

// Router level, in tests/router.test.cjs's harness pattern: mock world, real sessions, the ask reaches the explainer.
function world() {
  const w = { clock: { now: T0 }, writes: [], records: {}, n: 0 };
  const read = async (kind, p) => {
    if (kind === "brokerage_accounts") return { value: [{ id: "acct-1", name: "Mock brokerage", live: true, fractional: true, cash_cents: 1000000 }], source: "Mock Broker", as_of: w.clock.now };
    if (kind === "holdings") return { value: POSITIONS, source: "Mock Broker", as_of: w.clock.now };
    if (kind === "quote") return { value: QUOTES[p.symbol], source: "Mock Quotes", as_of: w.clock.now - 60000 };
    if (kind === "order") return { value: w.records[p.order_id], source: "Mock Broker", as_of: w.clock.now };
    return { value: 1, source: "x", as_of: w.clock.now };
  };
  w.conn = { read, write: async (id, p, key) => { w.writes.push({ id, key, params: p }); return { reference: "ref-" + (++w.n) }; }, verify: async () => ({ confirmed: true, source: "Mock", reference: "ref" }) };
  return w;
}
function sessions(w, tradeOpts) {
  const clock = () => w.clock.now;
  return {
    trade: T.create(Object.assign({ registry, connectors: w.conn, clock, instruments: [{ symbol: "NVDA", name: "Nvidia" }, { symbol: "MSFT", name: "Microsoft" }], partners: { broker_dealer: { live: true } }, compliance: C }, tradeOpts || {})),
    cancel: X.create({ registry, connectors: w.conn, clock, transactions: [], directory: {}, state: undefined }),
    send: S.create({ registry, connectors: w.conn, clock, people: [], partners: {}, limits: { per_day_cents: 1000000, per_week_cents: 3000000 }, large_cents: 50000 }),
  };
}
const parsers = { trade: (t) => T.parse(t), send: (t) => S.parse(t), cancel: (t) => X.parse(t) };

test("router: 'why is my portfolio down today' reaches the explainer and returns its text, stories supplied on the router context", async () => {
  const w = world(); const ss = sessions(w);
  const none = async () => { throw new Error("no model call for a mover question"); };
  const r = await R.handle("why is my portfolio down today", { extract: none, sessions: ss, parsers, stories: STORIES });
  assert.equal(r.flow, "trade");
  assert.equal(r.result.outcome, "answer", r.result && r.result.text);
  assert.match(r.result.text, /NVDA -\$412\.00 \(-10\.0%\)/);
  assert.match(r.result.text, /down \$520\.00/);
  assert.match(r.result.text, /Reuters/);
  assert.equal(w.writes.length, 0, "nothing is placed");
});

test("router: the other mover asks reach the explainer too; stories on the trade session's options work, and none supplied still answers dollars reasonlessly", async () => {
  const w = world(); const ss = sessions(w, { stories: STORIES });
  const none = async () => { throw new Error("no model call for a mover question"); };
  for (const q of ["why did my portfolio move", "what moved my portfolio", "why is my portfolio up"]) {
    const r = await R.handle(q, { extract: none, sessions: ss, parsers });
    assert.equal(r.flow, "trade", q);
    assert.match(r.result.text, /NVDA -\$412\.00/, q);
    assert.match(r.result.text, /Reuters/, q);
  }
  const bare = await R.handle("why is my portfolio down today", { extract: none, sessions: sessions(world()), parsers });
  assert.match(bare.result.text, /NVDA -\$412\.00/);
  assert.match(bare.result.text, /down \$520\.00/);
  assert.match(bare.result.text, /no reason is stated/i);
  assert.doesNotMatch(bare.result.text, /Reuters/);
});

test("broker day P&L fallback (megadoc G04 regression): positions carrying only today_pl_cents still explain, ranked, to the cent", () => {
  // The sim world's holdings read carries the broker's own intraday P&L per position and no quote with a
  // previous close; the explainer must use that broker-stated move, not refuse a total it can ground.
  const r = T.moverExplainer({
    positions: [
      { symbol: "PLTR", qty: 5, today_pl_cents: -1295, today_pct: -0.021 },
      { symbol: "VOO", qty: 2, today_pl_cents: 340, today_pct: 0.004 },
      { symbol: "CASHX", qty: 1 },
    ],
    quotes: {},
    stories: [],
    source: "Mock Broker positions",
    as_of: Date.UTC(2026, 9, 12, 14, 0),
  });
  assert.equal(r.total_cents, -955);
  assert.equal(r.drivers.map((d) => d.symbol).join(","), "PLTR,VOO");
  assert.equal(r.missing.join(","), "CASHX");
  assert.match(r.text, /down \$9\.55 today/);
  assert.match(r.text, /PLTR -\$12\.95 \(-2\.1%\)/);
  assert.match(r.text, /VOO \+\$3\.40 \(\+0\.4%\)/);
  assert.match(r.text, /No quote with a previous close for CASHX/);
});
