// Balance-aware sends through the live wiring (supabase/functions/_shared/flow_router.ts): the person's own bank rows are
// read through the caller's RLS client with the account kinds they set merged in, handed to the send flow, and a send
// above their checking is said before any card (response-style corpus 1.05). Every bank row here is a MOCK row (mock:
// true) in an in-memory store or a fake Supabase client; no network, no real account.
import { routeFlows as routeFlowsTyped, supabaseFlowDb, mapFlowData, mergeAccountKinds, hasLiveCard, needsRouter, type FlowDb } from "../../supabase/functions/_shared/flow_router.ts";
function assert(v: unknown, m = "assertion failed") { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
const routeFlows = (m: string, d: any): Promise<any> => routeFlowsTyped(m, d);
const T0 = Date.UTC(2026, 9, 14, 19, 14, 0);
const iso = (t: number) => new Date(t).toISOString();
const bankRow = (o: Record<string, unknown> = {}) => ({ mock: true, account_id: "chk-4417", name: "Checking ••4417", institution: null, currency: "USD", account_kind: "checking", balance_cents: 61218, available_cents: 61218, balance_as_of: iso(T0 - 4 * 60000), fetched_at: iso(T0 - 4 * 60000), sync_error: false, status: "active", ...o });
const jordan = { id: "r5", handle: "@jlee", display_name: "Jordan Lee", channel: "in-app", source: "completed_send", rail: "venmo", last_used_at: "2026-10-01T00:00:00Z" };

function memDb(bank: any[] | null) {
  const store: { state: any } = { state: null };
  const db: FlowDb = {
    async loadState() { return store.state ? JSON.parse(JSON.stringify(store.state)) : null; },
    async saveState(s: any) { store.state = JSON.parse(JSON.stringify(s)); },
    async loadData() { return { ok: true, ...mapFlowData([], [], [], [jordan], [], bank) }; },
    async saveRecipients() {},
  };
  return { db, store };
}

Deno.test("balance-aware send, wired: the question comes before any card with the number, account, source and as-of; a money move is refused; the answer is routed without the model", async () => {
  const { db, store } = memDb([bankRow(), bankRow({ account_id: "sav-9921", name: "Savings ••9921", account_kind: "savings", balance_cents: 340000, available_cents: 340000 })]);
  let calls = 0; const extract = async () => { calls++; throw new Error("router model off"); };
  const a = await routeFlows("send 900 to jordan", { db, extract, now: () => T0, termsFetch: null });
  eq(a.route.outcome, "ask"); eq(a.route.ask_reason, "funds_short"); eq(a.route.understood_first, true);
  eq(a.reply, "Checking ••4417 has $612.18 available (from your linked account, as of Oct 14, 7:10 PM UTC), less than $900.00. If Venmo pays from it, $900.00 to Jordan Lee won't go through; Venmo can also pay from your Venmo balance or a card I can't see. Set up $900.00 anyway, $612.18, or a different amount?");
  assert(store.state.send.funds_check && !store.state.send.pending, "the question is saved; no card is live");
  assert(hasLiveCard(store.state) && needsRouter(store.state, T0), "the question waits on its answer like a card, so a proactive offer never takes the yes");
  const before = calls;
  const m = await routeFlows("move it from savings", { db, extract, now: () => T0 + 20000, termsFetch: null });
  eq(m.route.outcome, "not_built"); eq(m.route.flow, "send"); eq(calls, before, "the answer never reaches the model");
  assert(/^I can't move money between your accounts, so nothing was moved or sent\./.test(m.reply), m.reply);
  const c = await routeFlows("send it", { db, extract, now: () => T0 + 40000, termsFetch: null });
  eq(c.route.outcome, "confirm"); assert(/\$900\.00 to Jordan Lee \(@jlee\) in Venmo/.test(c.reply), c.reply);
  const y = await routeFlows("yes", { db, extract, now: () => T0 + 60000, termsFetch: null });
  eq(y.route.outcome, "staged"); assert(/^Staged, not sent\./.test(y.reply), y.reply);
});

Deno.test("balance-aware send, wired: an unreadable, stale or missing balance is never a guess; the card goes up as before", async () => {
  for (const [k, bank] of [["unreadable", null], ["none linked", []], ["stale", [bankRow({ balance_as_of: iso(T0 - 26 * 3600000) })]]] as [string, any][]) {
    const { db } = memDb(bank);
    const r = await routeFlows("send 900 to jordan", { db, extract: null, now: () => T0, termsFetch: null });
    eq(r.route.outcome, "confirm", k); assert(!/available/.test(r.reply), k);
  }
});

// A fake Supabase client: every query is recorded, and each table answers from the map (or with an error).
function fakeSupabase(tables: Record<string, { data?: any[]; error?: any }>) {
  const queries: { table: string; select: string; filters: [string, string, unknown][] }[] = [];
  const from = (table: string) => {
    const q = { table, select: "", filters: [] as [string, string, unknown][] }; queries.push(q);
    const b: any = {
      select(s: string) { q.select = s; return b; },
      eq(c: string, v: unknown) { q.filters.push(["eq", c, v]); return b; },
      gte(c: string, v: unknown) { q.filters.push(["gte", c, v]); return b; },
      order() { return b; }, limit() { return b; },
      then(res: any, rej: any) { const t = tables[table] || { data: [] }; return Promise.resolve(t.error ? { data: null, error: t.error } : { data: t.data || [], error: null }).then(res, rej); },
    };
    return b;
  };
  return { client: { from }, queries };
}

Deno.test("supabaseFlowDb reads the caller's own active bank rows and the kinds they set; an unreadable account table only switches the check off", async () => {
  const u = "user-1";
  const ok = fakeSupabase({
    agent_financial_accounts: { data: [bankRow({ account_id: "a1", name: "Main", account_kind: "unknown" }), bankRow({ account_id: "a2", name: "Old", status: "disconnected" })] },
    agent_account_preferences: { data: [{ account_id: "a1", account_kind: "checking" }] },
  });
  const d = await supabaseFlowDb(ok.client, u, "t-1", () => T0).loadData();
  eq(d.ok, true); eq(d.bankAccounts!.map((a: any) => [a.account_id, a.account_kind]), [["a1", "checking"]], "the person's type wins; a disconnected row is left out");
  const q = ok.queries.find((x) => x.table === "agent_financial_accounts")!;
  assert(q.filters.some((f) => f[1] === "user_id" && f[2] === u) && q.filters.some((f) => f[1] === "status" && f[2] === "active"), "scoped to the caller's active rows");
  assert(/available_cents/.test(q.select) && /balance_as_of/.test(q.select), "reads the available balance and its as-of time");
  const bad = fakeSupabase({ agent_financial_accounts: { error: { message: "permission denied" } }, agent_account_preferences: { error: { message: "x" } } });
  const d2 = await supabaseFlowDb(bad.client, u, "t-1", () => T0).loadData();
  eq(d2.ok, true, "the flows still run"); eq(d2.bankAccounts, null, "unknown, never empty-as-zero");
  eq(mergeAccountKinds([{ account_id: "x", account_kind: "unknown" }], []), [{ account_id: "x", account_kind: "unknown" }]);
});
