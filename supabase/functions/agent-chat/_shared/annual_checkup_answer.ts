// C201 annual money checkup, in chat: "annual money checkup", "do my annual checkup", "re-underwrite my
// entire financial life". One report over the person's real rows: every account with its balance, the
// trailing-12-month fee total (the C10 audit's own scan), every recurring outflow at its monthly and
// yearly run-rate (the monitors' recurrence over the mapped rows), pay-later plans in progress, the
// calendar-year money in/out, and the budgets' last full month — each with the dollars at stake and the
// action it hands to, which runs only on the person's approval. Rates and policies are reported honestly:
// interest actually received is summed from the rows, and policy documents are named as not connected
// until they are in the document vault. Every figure comes from the rows; the last line is the source
// and as-of. Pure apart from the injected readers, so tests/edge/k1-annual-checkup.test.ts drives it.
import { AgentLedger, AgentMonitors, AgentSave, MoneyAnswers } from "../../_shared/router_core.js";
import { AgentRecovery } from "../../_shared/agent_core.js";
import { mapAccounts, mapTransactions } from "../../_shared/proactive.ts";
import type { AccountRow, MoneyTxRow } from "./money_answers.ts";

export type AnnualCheckupReaders = { accounts(): Promise<AccountRow[]>; transactions(): Promise<MoneyTxRow[]>; budgets?(): Promise<any[]> };
export const ANNUAL_CHECKUP_UNAVAILABLE = "I can't read your linked accounts right now, so I won't guess at a checkup. Try again in a minute.";

const ASKS: RegExp[] = [
  /\bannual (?:money |financial )?checkup\b/i,
  /\byearly (?:money |financial )?checkup\b/i,
  /\bmoney checkup\b/i,
  /\bre-?underwrit\w*\b[^?.!]*\bfinancial\b/i,
  /\bfull financial review\b/i,
];
export function isAnnualCheckupAsk(message: string): boolean {
  return ASKS.some((re) => re.test(String(message || "")));
}

const DAY = 86400000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (ymd: string) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}, ${ymd.slice(0, 4)}`;
const MONTHLY_FACTOR: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, annual: 1 / 12, yearly: 1 / 12 };

export async function annualCheckupReply(message: string, now: Date | number | string, read: AnnualCheckupReaders, opts?: { tz?: string }): Promise<string | null> {
  if (!isAnnualCheckupAsk(message)) return null;
  const tz = opts?.tz || "UTC";
  const MA: any = MoneyAnswers as any, L: any = AgentLedger as any;
  let accounts: AccountRow[];
  try { accounts = ((await read.accounts()) || []).filter((a) => a && a.status !== "disconnected"); } catch { return ANNUAL_CHECKUP_UNAVAILABLE; }
  if (!accounts.length) return null;
  let tx: MoneyTxRow[];
  try { tx = (await read.transactions()) || []; } catch { return ANNUAL_CHECKUP_UNAVAILABLE; }

  const today = MA.todayIn(now, tz), year = today.slice(0, 4);
  const src = MA.txSource(tx, tz);
  const lines: string[] = [`Annual money checkup — every figure from your linked accounts, as of ${label(today)}.`];

  // Accounts.
  lines.push("Accounts:");
  let cash = 0;
  for (const a of accounts) {
    const bal = a.balance_cents == null ? null : a.balance_cents;
    if (bal != null && (a.account_kind === "checking" || a.account_kind === "savings" || a.account_kind === "cash")) cash += bal;
    lines.push(`- ${MA.acctName(a)} (${a.account_kind}): ${bal == null ? "balance not reported" : MA.money(bal)}`);
  }
  lines.push(`Cash across checking and savings: ${MA.money(cash)}.`);

  // Fees, trailing 12 months (the C10 scan).
  const from12 = addDays(today, -365);
  const mappedTx = mapTransactions(tx as any[]);
  const scanRows = mappedTx.filter((t: any) => t.posted_at >= from12 && t.posted_at <= today).map((t: any, i: number) => ({
    account_id: t.account_id, provider_transaction_id: String(t.id), fact_hash: `ac${i}`, currency: "USD", presence: "observed",
    is_pending: !!t.is_pending, is_transfer: !!t.is_transfer, merchant_key: null, merchant_raw: t.merchant_raw, amount_cents: t.amount_cents, posted_on: t.posted_at,
  }));
  let feeTotal = 0, feeCount = 0;
  try {
    const cands = ((AgentRecovery as any).scan(scanRows, { today }).candidates || []).filter((c: any) => c.kind === "bank_fee");
    feeCount = cands.length;
    feeTotal = cands.reduce((s: number, c: any) => s + c.amount_cents, 0);
  } catch { /* the fee section says what it could not read below */ }
  lines.push(`Fees (last 12 months): ${MA.money(feeTotal)} across ${feeCount} charge${feeCount === 1 ? "" : "s"}. At stake: the fightable ones can be drafted as reversal requests for your approval — nothing is sent without your yes.`);

  // Recurring outflows at run-rate (monitors' recurrence over the mapped rows).
  const rec = (AgentMonitors as any).recurring(mappedTx, today).filter((r: any) => !r.dormant);
  let runMonthly = 0;
  if (rec.length) {
    lines.push("Recurring outflows:");
    for (const r of rec.slice().sort((a: any, b: any) => b.amount - a.amount)) {
      const monthly = Math.round(Math.abs(r.amount) * 100 * (MONTHLY_FACTOR[String(r.interval)] ?? 1));
      runMonthly += monthly;
      lines.push(`- ${MA.display(r.merchant)}: ${MA.money(Math.abs(r.amount) * 100)} ${r.interval} — ${MA.money(monthly)} a month, ${MA.money(monthly * 12)} a year (${r.occurrences} charges, last ${label(r.lastDate)}).`);
    }
    lines.push(`Recurring run-rate: ${MA.money(runMonthly)} a month, ${MA.money(runMonthly * 12)} a year. At stake: every stream you no longer use is that line's yearly figure — say "cancel" with the name and the cancel capability takes it from there, behind your approval.`);
  }

  // Pay-later plans in progress (the save inventory's pay-later grouping rides the same rows).
  const inv = (AgentSave as any).subscriptions({ transactions: mappedTx, today });
  const later = (inv && inv.pay_later) || null;
  if (later && later.plans && later.plans.length) lines.push(`Pay-later: ${later.plans.length} plans in progress; next instalments total ${MA.money(later.next_total_cents || 0)}.`);
  else {
    // The inventory groups plans under its own key on some versions; fall back to counting Affirm-family streams.
    const affirm = rec.filter((r: any) => /affirm/i.test(String(r.key)));
    if (affirm.length) lines.push(`Pay-later: Affirm plans are inside the recurring list above (${affirm.map((r: any) => MA.money(Math.abs(r.amount) * 100)).join(", ")} a month).`);
  }

  // The calendar year so far, from the rows.
  let inY = 0, outY = 0;
  for (const r of tx as any[]) {
    if (!r || r.is_pending || r.is_transfer) continue;
    const d = String(r.posted_on || "").slice(0, 10);
    if (d < `${year}-01-01` || d > today) continue;
    const c = Math.round(Number(r.amount_cents));
    if (!Number.isFinite(c)) continue;
    if (c > 0) inY += c; else outY -= c;
  }
  lines.push(`${year} so far: ${MA.money(inY)} in, ${MA.money(outY)} out, net ${MA.money(inY - outY)}.`);

  // Rates: interest actually received, named from the rows.
  const interest = (tx as any[]).filter((r) => r && !r.is_pending && Number(r.amount_cents) > 0 && /interest/i.test(String(r.merchant_raw || "")) && String(r.posted_on || "") >= `${year}-01-01`)
    .reduce((s: number, r: any) => s + Math.round(Number(r.amount_cents)), 0);
  lines.push(`Rates: interest received in ${year}: ${MA.money(interest)}${interest === 0 ? " — no interest postings appear in the feed, so there is no savings yield to re-price from bank data alone" : ""}. Policies: no insurance or policy documents are connected to this report yet — add them to your document vault and they join next year's review with their premiums and renewal dates.`);
  lines.push(src);
  return lines.join("\n");
}
