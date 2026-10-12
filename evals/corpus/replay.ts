// Offline replay of the response-style corpus through the REAL flow router (supabase/functions/_shared/flow_router.ts):
// the corpus's own fictional world (Mike Reyes, Checking ••4417, Netflix on ••8830, ...), the router model down (regex
// net, as offline), a stepped clock, and a MOCK Alpaca (inside this eval only; never a live claim). An example whose first
// message is not a flow (balance, advice, grief, ...) is answered by the chat model, so offline it is NEEDS_MODEL: it runs
// only in live mode against the deployed handler (evals/corpus/run.ts --live).
import { routeFlows, mapFlowData, userBroker, type FlowDb } from "../../supabase/functions/_shared/flow_router.ts";

export const T0 = Date.UTC(2026, 9, 14, 19, 14, 0); // Wed 2:14 PM CT
const person = (id: string, name: string, handle: string, rail = "venmo", nickname: string | null = null) => ({ id, handle, display_name: name, channel: "in-app", source: "completed_send", rail, last_used_at: "2026-10-01T00:00:00Z", nickname });
// Anita Srikanth is saved with the nickname "mom" (corpus 1.06: "Send $100.00 to Mom (Anita Srikanth, saved)").
export const PEOPLE = [
  person("r1", "Mike Reyes", "@mikereyes"), person("r2", "Priya Nair", "@priyan"), person("r3", "Sam Okafor", "@samokafor"), person("r4", "Sam Okoro", "@samokoro"),
  person("r5", "Jordan Lee", "@jlee"), person("r6", "Anita Srikanth", "@anitas", "venmo", "mom"), person("r7", "Chris Park", "@chrispark"), person("r8", "Ana Ruiz", "@anaruiz"),
  person("r9", "Dave Kim", "@davekim"), person("r10", "Jess Tran", "@jesstran"), person("r11", "Leo Marsh", "@leomarsh"), person("r12", "Tom Hale", "@tomhale"),
  person("r13", "Alex Cho", "@alexcho"), person("r14", "Jake Wu", "@jakewu"),
];
export const HANDLES = PEOPLE.map(p => p.handle.toLowerCase());
export function txs(extra: any[] = []) {
  const out: any[] = []; let n = 0;
  const add = (acct: string, cents: number, d: string, m: string) => out.push({ account_id: acct, provider_transaction_id: "t" + (++n), amount_cents: -cents, posted_on: d, merchant_raw: m, is_pending: false, is_transfer: false });
  for (const d of ["2026-07-24", "2026-08-24", "2026-09-24"]) { add("card-8830", 1549, d, "NETFLIX.COM"); add("card-8830", 1799, d.replace("-24", "-19"), "HULU 877-8244858"); add("card-8830", 1099, d.replace("-24", "-14"), "SPOTIFY USA"); }
  return out.concat(extra);
}
// Per-example world changes the corpus implies (4.04: Netflix on a second card).
const EXTRA_TX: Record<string, any[]> = {
  "4.14": ["2026-07-17", "2026-08-17", "2026-09-17"].map((d, i) => ({ account_id: "card-8830", provider_transaction_id: "pf" + i, amount_cents: -2499, posted_on: d, merchant_raw: "PLANET FITNESS", is_pending: false, is_transfer: false })),
  "4.04": ["2026-07-11", "2026-08-11", "2026-09-11"].map((d, i) => ({ account_id: "card-2201", provider_transaction_id: "x" + i, amount_cents: -699, posted_on: d, merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false })),
};
// Bank balances an example states (1.05: "Checking ••4417 has $612.18"), as agent_financial_accounts rows read 4 minutes
// before the first message. MOCK rows of the corpus's fictional world; every other example has no bank row, so no balance
// is ever claimed there.
const bank = (account_id: string, name: string, kind: string, cents: number) => ({ account_id, name, institution: null, currency: "USD", account_kind: kind, balance_cents: cents, available_cents: cents, balance_as_of: new Date(T0 - 4 * 60000).toISOString(), fetched_at: new Date(T0 - 4 * 60000).toISOString(), sync_error: false, status: "active", mock: true });
const BANK: Record<string, any[]> = {
  "1.05": [bank("chk-4417", "Checking ••4417", "checking", 61218), bank("sav-9921", "Savings ••9921", "savings", 340000)],
};
// Setup a context line describes: the earlier card the person is answering.
const SETUP: Record<string, string[]> = { "2.09": ["send ana 30"], "2.12": ["cancel hulu"] };
const QUOTES: Record<string, [string, number]> = { NVDA: ["NVIDIA Corp", 182.4], TSLA: ["Tesla Inc", 251.2], AMD: ["Advanced Micro Devices", 152.3], PLTR: ["Palantir Technologies", 41.1], AAPL: ["Apple Inc", 229.5], MSFT: ["Microsoft Corp", 418.2], GME: ["GameStop Corp", 24.6], VT: ["Vanguard Total World Stock ETF", 120.5], VOO: ["Vanguard S&P 500 ETF", 512.1] };
// MOCK Alpaca Trading API v2 (eval only): cash $1,340.22, 18.5 PLTR held; market open unless the example says closed.
export function mockAlpaca(now: () => number, open: boolean) {
  const orders: any[] = [];
  const f = async (input: any, init: any = {}) => {
    const u = new URL(String(input)), method = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
    const ok = (j: any, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
    const t = new Date(now() - 30000).toISOString();
    if (u.pathname === "/v2/account") return ok({ id: "acct-mock", status: "ACTIVE", buying_power: "1340.22", cash: "1340.22" });
    if (u.pathname === "/v2/clock") return ok({ is_open: open, next_open: "2026-10-19T09:30:00-04:00" });
    const a = /^\/v2\/assets\/([A-Z.]+)$/.exec(u.pathname); if (a) return QUOTES[a[1]] ? ok({ symbol: a[1], name: QUOTES[a[1]][0], tradable: true, fractionable: true, status: "active" }) : ok({ message: "not found" }, 404);
    const q = /^\/v2\/stocks\/([A-Z.]+)\/quotes\/latest$/.exec(u.pathname); if (q) return QUOTES[q[1]] ? ok({ symbol: q[1], quote: { t, ap: QUOTES[q[1]][1], bp: QUOTES[q[1]][1] - 0.05 } }) : ok({ message: "not found" }, 404);
    const held = [{ symbol: "PLTR", qty: "18.5", market_value: "760.35", current_price: "41.10", lastday_price: "41.80", unrealized_intraday_pl: "-12.95", unrealized_intraday_plpc: "-0.016746" }];
    if (u.pathname === "/v2/positions") return ok(held);
    const p = /^\/v2\/positions\/([A-Z.]+)$/.exec(u.pathname); if (p) { const h = held.find(x => x.symbol === p[1]); return h ? ok(h) : ok({ code: 40410000, message: "position does not exist" }, 404); }
    if (u.pathname === "/v2/orders" && method === "POST") { const o = { id: "mock-ord-" + (orders.length + 1), client_order_id: body.client_order_id, symbol: body.symbol, side: body.side, type: body.type, notional: body.notional ?? null, qty: body.qty ?? null, status: "accepted", submitted_at: t, filled_qty: "0", account: "acct-mock" }; orders.push(o); return ok(o); }
    const m = /\/v2\/orders\/([^/]+)$/.exec(u.pathname); if (m) { const o = orders.find(x => x.id === m[1]); return o ? ok(o) : ok({ message: "not found" }, 404); }
    return ok({ message: "not found" }, 404);
  };
  return { f: f as unknown as typeof fetch, orders };
}
export const EXECUTED = new Set(["sent", "filled", "executed", "cancelled", "confirmed", "accepted", "placed", "partially_filled"]);

export async function replay(example: any) {
  let now = T0, state: any = null;
  const tx = txs(EXTRA_TX[example.id] || []);
  const db: FlowDb = {
    async loadState() { return state ? JSON.parse(JSON.stringify(state)) : null; },
    async saveState(s: any) { state = JSON.parse(JSON.stringify(s)); },
    async loadData() { return { ok: true, ...mapFlowData(tx, [], [], PEOPLE, [], BANK[example.id] || []) }; },
    async saveRecipients() {},
  } as FlowDb;
  const closed = example.turns.some((t: any) => /markets? (are|is) closed/i.test(t.text));
  const alpaca = mockAlpaca(() => now, !closed);
  const row = { id: "row-u", user_id: "u", provider: "alpaca", label: "main", paper: false, account_id: "acct-mock", account_mask: "****4417", status: "active", created_at: "2026-10-01" };
  const brokerFactory = () => userBroker({ get: () => undefined }, "u", { rows: async () => [row], token: async () => JSON.stringify({ access_token: "mock-token" }), markReconnect: async () => true } as any, () => {}, alpaca.f, () => now);
  const send = (text: string) => routeFlows(text, { db, extract: async () => { throw new Error("router model off (offline replay)"); }, now: () => now, brokerFactory, termsFetch: null } as any);
  for (const s of SETUP[example.id] || []) await send(s);
  const actual: any[] = []; let first = true, needsModel = false;
  for (const t of example.turns) {
    if (t.role === "context") { const m = /(\d+) minutes? later/i.exec(t.text); if (m) now += Number(m[1]) * 60000; continue; }
    if (t.role !== "user") continue;
    let text = t.text; const pre = /^\((\w+day|\d{1,2}:\d{2} ?[AP]M)\)\s*/i.exec(text);
    if (pre) { if (/day$/i.test(pre[1])) now += 24 * 3600000; text = text.slice(pre[0].length); }
    now += 20000;
    const r: any = await send(text);
    if (!r || r.fallthrough) { if (first) needsModel = true; actual.push({ user: text, reply: null, outcome: "needs_model", executed: false }); first = false; continue; }
    first = false;
    actual.push({ user: text, reply: r.reply, outcome: r.route && r.route.outcome || null, flow: r.route && r.route.flow || null, executed: EXECUTED.has(r.route && r.route.outcome) });
  }
  return { needsModel, actual, mock_orders: alpaca.orders.length, state };
}
