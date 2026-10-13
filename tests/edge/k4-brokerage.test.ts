// K4 / C40, C41, C55 + the C22 broker boundary, edge harness: the production bundle (router_core.js) —
// AgentTrade over stand-in connectors (the owner's real brokerage is not connected; every source line
// names the stand-in). The same conversations run in tests/final-k4-brokerage.test.cjs; transcripts at
// ~/workspace/your_files/upmore-conversations/C40-portfolio-x-ray.md, C41-what-if-scenarios.md,
// C55-pre-ipo-offerings.md and C22-dividends.md (the boundary case).
import { AgentTrade, BrokerAccounts, Compliance, CapabilityRegistry, REGISTRY_JSON } from "../../supabase/functions/_shared/router_core.js";

const eq = (a: unknown, b: unknown, m?: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m ?? "not equal"}:\n  ${JSON.stringify(a)}\n  ${JSON.stringify(b)}`); };
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);
const registry = CapabilityRegistry.load(REGISTRY_JSON, () => true);
const FUND = {
  VOO: { expense_ratio_pct: 0.03, holdings: [{ symbol: "AAPL", weight_pct: 6.8 }, { symbol: "MSFT", weight_pct: 6.2 }, { symbol: "NVDA", weight_pct: 5.9 }] },
  VTI: { expense_ratio_pct: 0.03, holdings: [{ symbol: "AAPL", weight_pct: 6.0 }, { symbol: "MSFT", weight_pct: 5.5 }, { symbol: "NVDA", weight_pct: 5.0 }] },
  BND: { expense_ratio_pct: 0.03, duration_years: 6.0, holdings: [{ label: "U.S. bonds", weight_pct: 100 }] },
};
const HOLDINGS: Record<string, unknown[]> = {
  "acct-a": [{ symbol: "VOO", qty: 40, market_value_cents: 2200000 }, { symbol: "AAPL", qty: 10, market_value_cents: 230000 }],
  "acct-b": [{ symbol: "VTI", qty: 20, market_value_cents: 580000 }, { symbol: "BND", qty: 30, market_value_cents: 219000 }],
};
function session(state: { now: number }) {
  const cal = [{ company: "Helio Dynamics", provider: "Robinhood", app: "Robinhood", access_label: "IPO Access", opens_at: "2026-10-12T13:00:00Z", closes_at: "2026-10-14T04:00:00Z", price_low_cents: 1800, price_high_cents: 2100, allocation: null }];
  const connectors = {
    read: async (kind: string, p: { account?: string }) => {
      if (kind === "brokerage_accounts") return { value: [{ id: "acct-a", name: "your Brokerage A account", live: true, cash_cents: 70000, fee_cents: 0 }, { id: "acct-b", name: "your Brokerage B account", live: true, cash_cents: 0, fee_cents: 0 }], source: "stand-in brokerage feed", as_of: state.now };
      if (kind === "holdings") return { value: HOLDINGS[p.account || "acct-a"] || [], source: "stand-in brokerage feed", as_of: state.now };
      if (kind === "ipo_offerings") return { value: cal, source: "stand-in offering calendar", as_of: state.now };
      throw new Error("NOT_WIRED: " + kind);
    },
    write: async () => { throw new Error("K4 is read-only"); }, verify: async () => ({ confirmed: false }),
  };
  return (AgentTrade as any).create({ registry, connectors, clock: () => state.now, instruments: [], partners: { broker_dealer: { live: true, paper: false, name: "Alpaca (your account)" } }, compliance: Compliance, fund_data: FUND, fund_data_source: "stand-in fund composition data" });
}

Deno.test("K4 C40: the X-ray on the bundle path matches the hand parity (AAPL $4,144.00 look-through, $9.00/yr drag)", async () => {
  const s = session({ now: T0 });
  const r = await s.start("what do i actually own underneath all my funds");
  eq(r.reason, "xray");
  if (!String(r.text).includes("AAPL $4,144.00 (12.8%)") || !String(r.text).includes("cost about $9.00 a year")) throw new Error("xray parity missing: " + r.text);
});

Deno.test("K4 C41: the monthly what-if on the bundle path ($500/mo, 10y, 4/7/10% -> $73,624.90 / $86,542.40 / $102,422.49)", async () => {
  const s = session({ now: T0 });
  const r = await s.start("what if i invest $500 a month for 10 years");
  eq(r.reason, "whatif_monthly");
  if (!String(r.text).includes("$73,624.90 at an assumed 4% a year; $86,542.40 at an assumed 7% a year; $102,422.49 at an assumed 10% a year")) throw new Error("whatif parity missing: " + r.text);
  const rates = await s.start("what if rates drop 1%");
  eq(rates.move_cents, 13140);
});

Deno.test("K4 C55: watch, one in-window alert, walkthrough, tracked request — on the bundle path", async () => {
  const s = session({ now: T0 });
  eq((await s.start("alert me the second a pre-IPO offering opens")).reason, "ipo_watch");
  const alert = await s.ipoCheck();
  eq(alert.reason, "ipo_alert");
  eq(await s.ipoCheck(), null);
  await s.start("walk me through it");
  await s.start("done"); await s.start("done"); await s.start("done");
  eq((await s.start("i submitted it")).reason, "ipo_request_recorded");
  const st = await s.start("ipo status");
  if (!String(st.text).includes("window is still open until Oct 14, 2026")) throw new Error("status wrong: " + st.text);
});

Deno.test("K4 C22 boundary: no broker connected -> the connect card a user sees, on the bundle path", async () => {
  const s = (AgentTrade as any).create({ registry, connectors: { read: async () => { throw new Error("unused"); }, write: async () => ({}), verify: async () => ({}) }, clock: () => T0, instruments: [], partners: {}, compliance: Compliance, connect: { code: "connect", message: (BrokerAccounts as any).MESSAGES.connect } });
  const r = await s.start("what dividends did I get");
  eq(r.text, "No brokerage is connected yet, so nothing was placed - here's the link.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca");
});
