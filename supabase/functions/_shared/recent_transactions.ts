// The person's recent transactions, read through their own RLS client: observed rows from the last 400 days plus
// pending rows with no posted date, newest first in pages of 1,000, up to 5,000. Newest first because the cap must cut
// the oldest rows, never this month's: an oldest-first limit of 3,000 used to drop a long history's newest charges (the
// chat's find-me-money and dispute answers, and the flows' subscription finder). A failed page throws; the caller says
// the accounts can't be read rather than answering from part of them. tests/edge/recent-transactions.test.ts.
export const TX_COLUMNS = "account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,is_pending,is_transfer,fetched_at";

export async function readRecentTransactions(supabase: any, userId: string, nowMs: number, opts: { days?: number; max?: number; page?: number } = {}): Promise<any[]> {
  const days = opts.days ?? 400, max = opts.max ?? 5000, page = opts.page ?? 1000;
  const since = new Date(nowMs - days * 86400000).toISOString().slice(0, 10), rows: any[] = [];
  for (let from = 0; from < max; from += page) {
    const r = await supabase.from("agent_financial_transactions").select(TX_COLUMNS)
      .eq("user_id", userId).eq("presence", "observed").or(`posted_on.gte.${since},posted_on.is.null`)
      .order("posted_on", { ascending: false, nullsFirst: true }).order("provider_transaction_id", { ascending: true })
      .range(from, Math.min(from + page, max) - 1);
    if (r.error) throw new Error("Transactions unavailable.");
    const got = r.data || [];
    rows.push(...got);
    if (got.length < page) break;
  }
  return rows;
}
