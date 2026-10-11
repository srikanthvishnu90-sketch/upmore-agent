// Testing agent, LIVE family (L-01): one real $5 buy through the deployed chat handler, in the tester's own connected
// Alpaca account, inside the owner's $200 envelope. It runs only on an explicit trigger and never on CI.
//   UPMORE_CHAT_URL=https://<project>.supabase.co/functions/v1/agent-chat UPMORE_TEST_JWT=<token> \
//     deno run -A evals/agent/live.ts --spend-real-money --line manual_and_dividends [--symbol SPY] [--cents 500]
// What it does, in order, and it stops at the first thing that is not exactly right:
//   1. reads the committed ledger (evals/agent/live-ledger.json) and refuses before any request if this order would cross
//      $5 an order, the line's budget or the $200 total (live_guard.ts);
//   2. sends "buy $<amount> of <SYMBOL>" and requires a LIVE card for exactly that amount, from the person's own account;
//   3. answers "yes" and requires a receipt that names the order id (placed, working or filled);
//   4. writes the receipt to the ledger before printing anything else. A yes whose reply is unreadable is still counted as
//      spent, so the envelope can only ever be over-counted, never under-counted.
// Without both variables and the flag it prints NOT RUN and exits 2. The token is never printed or written anywhere.
import { guardPlan, ENVELOPE_CENTS, ORDER_CAP_CENTS, BUDGET_LINES } from "./live_guard.ts";

export type LedgerRow = { at: string; line: string; cents: number; symbol: string; order_id: string | null; status: string; receipt: string };
export type Ledger = { envelope_cents: number; order_cap_cents: number; rows: LedgerRow[] };
type Send = (message: string, thread_id?: string) => Promise<{ reply?: string; thread_id?: string; error?: string; route?: any }>;

export const spent = (l: Ledger) => l.rows.reduce((a, r) => a + r.cents, 0);
export const lineSpent = (l: Ledger) => l.rows.reduce((a: Record<string, number>, r) => (a[r.line] = (a[r.line] || 0) + r.cents, a), {});
const usd = (c: number) => "$" + (c / 100).toFixed(2);

export async function runLive(o: { send: Send; ledger: Ledger; line: string; symbol: string; cents: number; now: () => Date; save: (l: Ledger) => void }) {
  const g = guardPlan({ spent_cents: spent(o.ledger), line_spent: lineSpent(o.ledger), orders: [{ cents: o.cents, line: o.line }] });
  if (!g.ok) return { status: "REFUSED", why: g.reason, sent: 0 };
  const card = await o.send(`buy ${usd(o.cents)} of ${o.symbol}`);
  const text = String(card.reply || "");
  if (card.error) return { status: "FAIL", why: `handler error: ${card.error}`, sent: 0 };
  // The card must be LIVE, for exactly this amount, ask for a yes, and say nothing of paper.
  const problems = [!/^LIVE\b/.test(text) && "the card is not marked LIVE", !text.includes(usd(o.cents)) && `the card does not say ${usd(o.cents)}`, !/Reply YES or NO/i.test(text) && "the card does not ask for a yes", /\bpaper\b/i.test(text) && "the card mentions paper trading"].filter(Boolean);
  if (problems.length) { await o.send("no", card.thread_id); return { status: "FAIL", why: `${problems.join("; ")}. Answered no; nothing was placed. Card: ${text.slice(0, 200)}`, sent: 0 }; }
  const yes = await o.send("yes", card.thread_id);
  const r = String(yes.reply || "");
  const order_id = (/\border ([\w-]{6,})/.exec(r) || [])[1] || null;
  // "Placed, not filled" says "filled" too, so the working and partial forms are read first.
  const status = /Placed, not filled|\bworking\b/i.test(r) ? "working" : /\bPartly\b/i.test(r) ? "partial" : /^LIVE: Done\b|\bfilled at\b/i.test(r) ? "filled" : yes.error ? "unknown" : /Nothing was placed/i.test(r) ? "not_placed" : "unknown";
  // Counted unless the reply says plainly that nothing was placed.
  const cents = status === "not_placed" ? 0 : o.cents;
  const row: LedgerRow = { at: o.now().toISOString(), line: o.line, cents, symbol: o.symbol, order_id, status, receipt: r.slice(0, 600) };
  o.ledger.rows.push(row); o.save(o.ledger);
  const ok = !!order_id && ["filled", "working", "partial"].includes(status);
  return { status: ok ? "PASS" : "FAIL", why: ok ? `order ${order_id} ${status}` : `receipt has no order id or an unclear status (${status}): ${r.slice(0, 200)}`, sent: cents, row };
}

if (import.meta.main) {
  const args = Deno.args, arg = (k: string) => args.includes(k) ? args[args.indexOf(k) + 1] : undefined;
  const url = Deno.env.get("UPMORE_CHAT_URL"), jwt = Deno.env.get("UPMORE_TEST_JWT");
  const ledgerUrl = new URL("live-ledger.json", import.meta.url);
  const ledger: Ledger = (() => { try { return JSON.parse(Deno.readTextFileSync(ledgerUrl)); } catch { return { envelope_cents: ENVELOPE_CENTS, order_cap_cents: ORDER_CAP_CENTS, rows: [] }; } })();
  const line = arg("--line") || "manual_and_dividends", symbol = (arg("--symbol") || "SPY").toUpperCase(), cents = Number(arg("--cents") || ORDER_CAP_CENTS);
  console.log(`live envelope: ${usd(spent(ledger))} of ${usd(ENVELOPE_CENTS)} spent; ${line} line ${usd(lineSpent(ledger)[line] || 0)} of ${usd(BUDGET_LINES[line] ?? 0)}`);
  if (!url || !jwt || !args.includes("--spend-real-money")) { console.log("live: NOT RUN (needs UPMORE_CHAT_URL, UPMORE_TEST_JWT and --spend-real-money; this places a real order)"); Deno.exit(2); }
  const send: Send = async (message, thread_id) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify(thread_id ? { message, thread_id } : { message }) });
    const j = await r.json().catch(() => ({ error: `HTTP ${r.status}, not JSON` })); if (!r.ok && !j.error) j.error = `HTTP ${r.status}`; return j;
  };
  const out = await runLive({ send, ledger, line, symbol, cents, now: () => new Date(), save: l => Deno.writeTextFileSync(ledgerUrl, JSON.stringify(l, null, 1) + "\n") });
  console.log(`live: ${out.status}: ${out.why}`);
  console.log(`live envelope now: ${usd(spent(ledger))} of ${usd(ENVELOPE_CENTS)} spent`);
  Deno.exit(out.status === "PASS" ? 0 : 1);
}
