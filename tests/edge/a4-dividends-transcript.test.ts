// A4 / C22 transcript, edge harness: the production bundle (router_core.js) — AgentTrade over the Alpaca adapter —
// answering the dividend questions end to end. Alpaca is a MOCK: the adapter's fetch is stubbed with Alpaca's wire
// shapes (the corporate-actions response nested under corporate_actions.cash_dividends; NonTradeActivity rows for
// the activities reads), and every source line names the mock. The same conversations run over real HTTP against
// tests/fixtures/alpaca-mock.cjs in tests/final-a4-dividends.test.cjs; the transcript is saved at
// ~/workspace/your_files/upmore-conversations/C22-dividends.md. No real Alpaca read is possible today: the Alpaca
// partner/OAuth app is unregistered, so no person's token exists to read with.
import { AgentTrade, AlpacaTrading, Compliance, CapabilityRegistry, REGISTRY_JSON } from "../../supabase/functions/_shared/router_core.js";

const eq = (a: unknown, b: unknown, m?: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m ?? "not equal"}:\n  ${JSON.stringify(a)}\n  ${JSON.stringify(b)}`); };
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0), NOV2 = Date.UTC(2026, 10, 2, 14, 0, 0);
const registry = CapabilityRegistry.load(REGISTRY_JSON, () => true);

// The mock Alpaca server, as a fetch: the endpoints the two new reads and their neighbours use, in wire shape.
function mockFetch(state: { now: number; calendarDown?: boolean }) {
  const acts = [
    { id: "p1", activity_type: "DIV", date: "2026-10-30", net_amount: "74.00", description: "", status: "executed", symbol: "VOO", qty: "40", per_share_amount: "1.85" },
    { id: "w1", activity_type: "DIVWH", date: "2026-10-30", net_amount: "-3.70", description: "", status: "executed", symbol: "VOO", qty: "", per_share_amount: "" },
  ];
  const cal = [
    { id: "ca-voo-1", corporate_action_type: "cash_dividend", symbol: "VOO", cash_amount: 1.85, currency: "USD", declaration_date: "2026-10-05", ex_date: "2026-10-16", record_date: "2026-10-16", payable_date: "2026-10-30", process_date: "2026-10-06" },
    { id: "ca-msft-1", corporate_action_type: "cash_dividend", symbol: "MSFT", cash_amount: 0.91, currency: "USD", declaration_date: "2026-10-08", ex_date: "2026-11-19", record_date: "2026-11-20", payable_date: "2026-12-10", process_date: "2026-10-09" },
  ];
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
  return (async (url: string) => {
    const u = new URL(url), p = u.pathname;
    if (p === "/v2/account") return json({ id: "acct-live-1", status: "ACTIVE", currency: "USD", buying_power: "10000.00", cash: "10000.00", equity: "10000.00", last_equity: "10000.00" });
    if (p === "/v2/positions") return json([{ asset_id: "asset-VOO", symbol: "VOO", qty: "40", qty_available: "40", avg_entry_price: "500.00", market_value: "20480.00", current_price: "512.00", unrealized_intraday_pl: "0.00", unrealized_intraday_plpc: "0" }]);
    if (p === "/v1/corporate-actions") { if (state.calendarDown) return json({ message: "internal error" }, 500); return json({ corporate_actions: { cash_dividends: cal }, next_page_token: null }); }
    const one = /^\/v2\/account\/activities\/([A-Z]+)$/.exec(p);
    if (one) return json(acts.filter((a) => a.activity_type === one[1]));
    if (p === "/v2/account/activities") { const types = (u.searchParams.get("activity_types") || "").split(","); return json(acts.filter((a) => types.includes(a.activity_type))); }
    return json({ message: "not found" }, 404);
  }) as unknown as typeof fetch;
}

function session(state: { now: number; calendarDown?: boolean }) {
  const adapter = (AlpacaTrading as any).create({ base: "http://127.0.0.1:9", mock: true, token: "tok-mock", account_id: "acct-live-1", order_cap_cents: 1000000, clock: () => state.now, fetch: mockFetch(state) });
  const connectors = (AlpacaTrading as any).connectors(adapter, { clock: () => state.now });
  return (AgentTrade as any).create({ registry, connectors, clock: () => state.now, instruments: [], partners: { broker_dealer: { live: true, paper: false, name: "Alpaca (your account)" } }, compliance: Compliance });
}

Deno.test("A4 transcript (a)+(d): the announced dividend answers from the corporate-actions read; a symbol not held never surfaces", async () => {
  const s = session({ now: T0 });
  const r = await s.start("what dividends are coming up");
  eq(r.text, "Announced dividends on your holdings, coming up: VOO $1.85 a share, ex-date Oct 16, 2026, pays Oct 30, 2026 — $74.00 on your 40 shares. From Alpaca mock server market data, as of 14:00 UTC.");
});

Deno.test("A4 transcript (e): the calendar down is the honest unreadable answer, with no figure", async () => {
  const s = session({ now: T0, calendarDown: true });
  const r = await s.start("what dividends are coming up");
  eq(r.reason, "dividends_calendar_unreadable");
  eq(r.text, "I can't read announced dividends from the broker right now, so I won't guess at what's coming. Ask again in a moment.");
});

Deno.test("A4 transcript (b)+(c): the received $74.00 verifies against the cash read to the cent, and the $3.70 withholding is stated, never silently netted", async () => {
  const s = session({ now: NOV2 });
  const r = await s.start("what dividends did I get");
  eq(r.text, "Dividends this year (Jan 1 to Nov 2): $74.00 from 1 payment in your Alpaca account. VOO $74.00 (Oct 30). $3.70 was withheld or charged against them, so $70.30 landed. Checked against your cash activity: every one of the 1 payment matches its cash credit to the cent on its payment date. From Alpaca mock server's activity, as of 14:00 UTC.");
});
