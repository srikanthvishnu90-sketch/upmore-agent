// C22 dividend tracker, the missing surface (packages/domain/66-agent-trade.js): announced dividends for the
// person's holdings from a dividends/calendar read on the same mock-brokerage read surface (declared amount per
// share, ex-date, payment date, upcoming list); a received dividend verified against the account's actual cash
// activity to the cent on the payment date, a mismatch stated not hidden; and a monthly dividend income total for
// a named month. Received dividends themselves stay depth-proven in tests/depth-PORTFOLIO-Q.test.cjs (S25-S28).
// Broker reads are MOCK. Check: node --test tests/dividend-tracker.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "packages/domain");
const ctx = vm.createContext({ setTimeout, clearTimeout });
vm.runInContext(["33-agent-monitors.js", "41-agent-recovery.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "50-agent-invest.js", "53-compliance.js", "66-agent-trade.js", "67-agent-cards.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.T=AgentTrade;this.C=Compliance;", ctx);
const { T, C } = ctx;
const Registry = require(path.join(root, "packages/capabilities/registry.js"));
const registry = Registry.load(JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")), rel => fs.existsSync(path.join(root, rel)));
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0); // Oct 12, 2026, 14:00 UTC
const instruments = [{ symbol: "VOO", name: "Vanguard S&P 500 ETF" }, { symbol: "SCHD", name: "Schwab US Dividend Equity ETF" }];
const HOLDINGS = [{ symbol: "VOO", qty: 2, market_value_cents: 102420 }, { symbol: "SCHD", qty: 10, market_value_cents: 28000 }, { symbol: "F", qty: 10, market_value_cents: 12000 }];
const DV = (date, cents, symbol, extra) => Object.assign({ id: `${symbol}-${date}`, type: "DIV", date, cents, symbol, qty: 2, per_share_cents: Math.round(cents / 2), withheld: false }, extra || {});
const DIVS = [DV("2026-09-30", 324, "VOO"), DV("2026-06-30", 310, "VOO"), DV("2026-03-28", 105, "SCHD"), DV("2026-09-30", -49, "VOO", { type: "DIVNRA", withheld: true })];
// The mock brokerage's announced-dividend calendar: VOO and SCHD are held; XYZ is not a holding and its ex-date
// naming must never surface; the VOO row with a past ex-date is no longer upcoming.
const CALENDAR = [
  { symbol: "VOO", per_share_cents: 162, ex_date: "2026-10-20", pay_date: "2026-10-30", declared_on: "2026-10-05" },
  { symbol: "SCHD", per_share_cents: 26, ex_date: "2026-12-11", pay_date: "2026-12-18", declared_on: "2026-10-01" },
  { symbol: "XYZ", per_share_cents: 500, ex_date: "2026-10-15", pay_date: "2026-10-22", declared_on: "2026-10-02" },
  { symbol: "VOO", per_share_cents: 150, ex_date: "2026-09-20", pay_date: "2026-09-30", declared_on: "2026-09-01" },
];

function world(extra) {
  const w = { now: T0, writes: [], divs: DIVS, calendar: CALENDAR, cash: null, noCalendar: false };
  Object.assign(w, extra || {});
  const read = async (kind, p) => {
    if (kind === "brokerage_accounts") return { value: [{ id: "acct-1", name: "Mock brokerage", fractional: true, cash_cents: 100000 }], source: "Mock Broker", as_of: w.now };
    if (kind === "holdings") return { value: HOLDINGS, source: "Mock Broker", as_of: w.now };
    if (kind === "dividends") return { value: w.divs.filter(r => !p.from || r.date >= p.from), unread: [], truncated: false, source: "Mock Broker", as_of: w.now };
    if (kind === "dividends_calendar") { if (w.noCalendar) throw new Error("NOT_WIRED: mock calendar read"); return { value: w.calendar, source: "Mock Broker", as_of: w.now }; }
    if (kind === "cash_activity") { if (!w.cash) return { value: 1, source: "x", as_of: w.now }; return { value: w.cash, source: "Mock Broker", as_of: w.now }; }
    if (kind === "quote") return { value: { price_cents: 50000 }, source: "Mock Quotes", as_of: w.now - 60000 };
    return { value: 1, source: "x", as_of: w.now };
  };
  w.conn = { read, write: async () => { w.writes.push(1); return { reference: "x" }; }, verify: async () => ({ confirmed: true, source: "Mock", reference: "x" }) };
  w.s = T.create({ registry, connectors: w.conn, clock: () => w.now, instruments, partners: { broker_dealer: { live: true } }, compliance: C });
  return w;
}
const say = async (w, m) => (await w.s.start(m)).text;

test("C22 routing: the new questions reach the announced-dividend surface; received-dividend questions keep their route", () => {
  assert.equal(T.parse("what dividends are coming up").action, "dividends_upcoming");
  assert.equal(T.parse("announced dividends").action, "dividends_upcoming");
  assert.equal(T.parse("what dividends did I get").action, "dividends");
  assert.equal(T.parse("how much in dividends this month").action, "dividends");
  assert.equal(T.parse("best dividend stocks to buy").action, "new", "picking dividend stocks is still advice, never the tracker");
});

test("C22(a) announced dividends for the person's holdings: declared amount per share, ex-date, payment date, upcoming list only", async () => {
  const w = world();
  const t = await say(w, "what dividends are coming up");
  assert.equal(t, "Announced dividends on your holdings, coming up: VOO $1.62 a share, ex-date Oct 20, 2026, pays Oct 30, 2026 — $3.24 on your 2 shares; SCHD $0.26 a share, ex-date Dec 11, 2026, pays Dec 18, 2026 — $2.60 on your 10 shares. From Mock Broker, as of 14:00 UTC.");
  assert.doesNotMatch(t, /XYZ/, "a name the person does not hold is never listed");
  assert.doesNotMatch(t, /Sep 20/, "a past ex-date is not upcoming");
  assert.equal(w.writes.length, 0);
});

test("C22(a) no announced read: said plainly, no dividend is invented", async () => {
  const w = world({ noCalendar: true });
  const r = await w.s.start("announced dividends");
  assert.equal(r.reason, "dividends_calendar_unreadable");
  assert.doesNotMatch(r.text, /\$\d/);
});

test("C22(c) a named month's dividend income total across holdings, to the cent", async () => {
  const t = await say(world(), "how much in dividends in September");
  assert.equal(t, "Dividends in September 2026: $3.24 from 1 payment in Mock brokerage. VOO $3.24 (Sep 30). $0.49 was withheld or charged against them, so $2.75 landed. From Mock Broker's activity, as of 14:00 UTC.");
});

test("C22(c) this month's total still answers through the same surface", async () => {
  const t = await say(world(), "how much in dividends this month");
  assert.equal(t, "No dividends were paid into Mock brokerage this month (Oct 1 to Oct 12). From Mock Broker's activity, as of 14:00 UTC.");
});

test("C22(b) a received dividend verified against the account's cash activity: the cash credit matches to the cent on the payment date", async () => {
  const w = world({ cash: [{ date: "2026-09-30", symbol: "VOO", cents: 275 }, { date: "2026-06-30", symbol: "VOO", cents: 310 }, { date: "2026-03-28", symbol: "SCHD", cents: 105 }] });
  const t = await say(w, "what dividends did I get");
  assert.match(t, /Checked against your cash activity: every one of the 3 payments matches its cash credit to the cent on its payment date\./);
});

test("C22(b) a withholding mismatch is stated, not hidden: activity net against the cash credit, with the difference", async () => {
  // The activity says VOO's Sep 30 dividend landed at $2.75 after $0.49 withheld; the cash credit that day is
  // $2.50 — $0.25 less than the activity implies. The other two payments match.
  const w = world({ cash: [{ date: "2026-09-30", symbol: "VOO", cents: 250 }, { date: "2026-06-30", symbol: "VOO", cents: 310 }, { date: "2026-03-28", symbol: "SCHD", cents: 105 }] });
  const t = await say(w, "what dividends did I get");
  assert.match(t, /Checked against your cash activity: VOO on Sep 30: the activity says \$2\.75 landed, but the cash credit that day is \$2\.50 — \$0\.25 short\./);
  assert.doesNotMatch(t, /every one of the .* matches/);
});
