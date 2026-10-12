// The person's recent transactions, read once per turn by the chat's direct answers and the flow router: observed rows
// from the last 400 days plus pending rows with no posted date, newest first in pages, up to 5,000. An oldest-first
// limit used to cut off this month for anyone with a long history (the flows' subscription finder never saw the newest
// charges). The fake client below honours order, range, limit and the filters, so a wrong query shape fails here.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { supabaseFlowDb } from "../../supabase/functions/_shared/flow_router.ts";
import { readRecentTransactions } from "../../supabase/functions/_shared/recent_transactions.ts";

const NOW = Date.parse("2026-10-12T15:00:00Z");
const day = (n: number) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);

// MOCK rows: 6,000 observed charges over the last ~380 days, oldest first, one pending row with no date, one removed row.
function rows() {
  const out: any[] = [];
  for (let i = 0; i < 6000; i++) out.push({ user_id: "u1", account_id: "mock-chk", provider_transaction_id: `t${String(i).padStart(5, "0")}`, amount_cents: -1000 - i, posted_on: day(380 - Math.floor(i / 16)), merchant_raw: i === 5999 ? "NEWEST CHARGE" : "MOCK SHOP", is_pending: false, is_transfer: false, presence: "observed", currency: "USD" });
  out.push({ user_id: "u1", account_id: "mock-chk", provider_transaction_id: "pend", amount_cents: -500, posted_on: null, merchant_raw: "PENDING", is_pending: true, is_transfer: false, presence: "observed", currency: "USD" });
  out.push({ user_id: "u1", account_id: "mock-chk", provider_transaction_id: "gone", amount_cents: -9999, posted_on: day(1), merchant_raw: "REMOVED", is_pending: false, is_transfer: false, presence: "removed", currency: "USD" });
  out.push({ user_id: "u2", account_id: "other", provider_transaction_id: "x", amount_cents: -1, posted_on: day(1), merchant_raw: "SOMEONE ELSE", is_pending: false, is_transfer: false, presence: "observed", currency: "USD" });
  return out;
}

// A fake Supabase client with real query semantics for the calls these reads make.
function semanticClient(tables: Record<string, any[]>) {
  const from = (table: string) => {
    let data = (tables[table] || []).slice(), orders: [string, boolean, boolean][] = [], lo = 0, hi = Infinity;
    const b: any = {
      select() { return b; },
      eq(c: string, v: unknown) { data = data.filter((r) => r[c] === v); return b; },
      gte(c: string, v: string) { data = data.filter((r) => r[c] !== null && r[c] >= v); return b; },
      or(expr: string) { // "posted_on.gte.<date>,posted_on.is.null"
        const parts = expr.split(",").map((p) => p.split("."));
        data = data.filter((r) => parts.some(([c, op, v]) => (op === "gte" ? r[c] !== null && r[c] >= v : op === "is" && v === "null" ? r[c] === null : false)));
        return b;
      },
      order(c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) { orders.push([c, o.ascending !== false, !!o.nullsFirst]); return b; },
      range(a: number, z: number) { lo = a; hi = z + 1; return b; },
      limit(n: number) { hi = lo + n; return b; },
      then(res: any, rej: any) {
        const sorted = data.slice().sort((x, y) => {
          for (const [c, asc, nullsFirst] of orders) {
            if (x[c] === y[c]) continue;
            if (x[c] === null) return nullsFirst ? -1 : 1;
            if (y[c] === null) return nullsFirst ? 1 : -1;
            return (x[c] < y[c] ? -1 : 1) * (asc ? 1 : -1);
          }
          return 0;
        });
        return Promise.resolve({ data: sorted.slice(lo, hi), error: null }).then(res, rej);
      },
    };
    return b;
  };
  return { from };
}

Deno.test("readRecentTransactions: newest first, the person's observed rows only, pending kept, capped at 5,000", async () => {
  const got = await readRecentTransactions(semanticClient({ agent_financial_transactions: rows() }) as any, "u1", NOW);
  assertEquals(got.length, 5000, "capped");
  assertEquals(got[0].provider_transaction_id, "pend", "pending rows with no date come first");
  assert(got.some((r) => r.merchant_raw === "NEWEST CHARGE"), "the newest charge is never cut off");
  assert(!got.some((r) => r.presence === "removed" || r.merchant_raw === "SOMEONE ELSE"), "removed rows and other people's rows stay out");
});

Deno.test("readRecentTransactions: a failed page throws, so the caller says so instead of answering from half the rows", async () => {
  const client = { from: () => { const b: any = { select: () => b, eq: () => b, or: () => b, order: () => b, range: () => b, then: (res: any, rej: any) => Promise.resolve({ data: null, error: { message: "boom" } }).then(res, rej) }; return b; } };
  let threw = false;
  try { await readRecentTransactions(client as any, "u1", NOW); } catch { threw = true; }
  assert(threw);
});

Deno.test("the flow router's data load sees this month's charges for a person with a long history (the subscription finder used to miss them)", async () => {
  const empty = { brokerage_accounts: [], portfolio_snapshots: [], saved_recipients: [], standing_payments: [], agent_financial_accounts: [], agent_account_preferences: [] };
  const d: any = await supabaseFlowDb(semanticClient({ agent_financial_transactions: rows(), ...empty }) as any, "u1", "t1", () => NOW).loadData();
  assertEquals(d.ok, true);
  assert(d.transactions.some((t: any) => t.merchant_raw === "NEWEST CHARGE"), "the newest posted charge is in the data the flows see");
  assert(!d.transactions.some((t: any) => t.merchant_raw === "REMOVED" || t.merchant_raw === "PENDING"), "removed and pending rows are not flow data");
  const dates = d.transactions.map((t: any) => t.posted_at);
  assertEquals(dates.slice().sort(), dates, "the flows still get them oldest first, as before");
});
