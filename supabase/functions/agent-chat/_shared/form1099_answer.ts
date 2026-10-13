// C165 reconcile my 1099 income, in chat: "reconcile my 1099s", "do my 1099s match what I actually got
// paid", "check my 1099 income". Collected 1099 forms (the forms reader; empty until a forms/documents
// source is wired, exactly like tip_fees_answer's receipts reader) are matched against the person's real
// deposits for the forms' tax year: every payer's deposits are grouped from the rows, each form is compared
// with the deposits under its payer's name, and the delta is named in dollars — a form that is short against
// deposits, deposits with no form, and the corrected income total (all deposits the forms should cover,
// whether or not a form arrived). Person-to-person credits are listed apart: a friend repaying through
// Zelle is not 1099 income and is never counted into the total. Transfers-in are excluded throughout.
// Every figure comes from the rows; the last line is the source and as-of. Pure apart from the injected
// readers, so tests/edge/k1-form1099.test.ts drives it with fixtures.
import { MoneyAnswers } from "../../_shared/router_core.js";
import type { AccountRow, MoneyTxRow } from "./money_answers.ts";

export type Form1099 = { payer: string; amount_cents: number; kind?: string; year: number };
export type Form1099Readers = { accounts(): Promise<AccountRow[]>; transactions(): Promise<MoneyTxRow[]>; forms1099(): Promise<Form1099[]> };
export const FORM1099_UNAVAILABLE = "I can't read your linked accounts right now, so I won't guess at your 1099s. Try again in a minute.";

const ASKS: RegExp[] = [
  /\b1099/i,
];
const NOT_ASK = /\b(?:what|when|how much|threshold|limit|deadline|penalty|file|filing|form itself)\b[^?.!]*\b1099/i;
export function isForm1099Ask(message: string): boolean {
  const m = String(message || "");
  if (!ASKS.some((re) => re.test(m))) return false;
  // Pure information questions about 1099 rules ("what's the 1099 threshold") belong to finance_facts.
  if (/^(?:what|when|how|why)\b/i.test(m.trim()) && !/\bmy\b/i.test(m)) return false;
  return /\b(?:my|reconcile|match|check|verify|got|received|paid|income)\b/i.test(m);
}

const DAY = 86400000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (ymd: string) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}, ${ymd.slice(0, 4)}`;

// The payer a credit came from, in the person's words: the merchant knowledge name when there is one
// (Venmo, Rebet, Kalshi), else the bank's own display name.
function payerOf(raw: string): { name: string; p2p: boolean } {
  const MA: any = MoneyAnswers as any;
  const c = MA.classify(raw);
  if (c && c.group === "person_to_person") {
    // Zelle and Apple Cash never issue 1099s — money over them is person-to-person, named sender or not.
    // Venmo, PayPal and Cash App are platforms that DO issue 1099-Ks, so their payouts stay on the business
    // side where a form can be matched against them.
    if (/\bvenmo\b|\bpaypal\b|\bcash app\b/i.test(raw)) return { name: c.kname || c.name || MA.display(raw), p2p: false };
    return { name: c.name || MA.display(raw), p2p: true };
  }
  return { name: MA.display(raw), p2p: false };
}

export async function form1099Reply(message: string, now: Date | number | string, read: Form1099Readers, opts?: { tz?: string }): Promise<string | null> {
  if (!isForm1099Ask(message)) return null;
  const tz = opts?.tz || "UTC";
  const MA: any = MoneyAnswers as any;
  let accounts: AccountRow[];
  try { accounts = ((await read.accounts()) || []).filter((a) => a && a.status !== "disconnected"); } catch { return FORM1099_UNAVAILABLE; }
  if (!accounts.length) return null;
  let tx: MoneyTxRow[];
  try { tx = (await read.transactions()) || []; } catch { return FORM1099_UNAVAILABLE; }
  let forms: Form1099[] = [];
  try { forms = (await read.forms1099()) || []; } catch { forms = []; }

  const today = MA.todayIn(now, tz);
  const year = forms.length ? Math.max(...forms.map((f) => f.year)) : +today.slice(0, 4);
  const from = `${year}-01-01`, to = `${year}-12-31` > today ? today : `${year}-12-31`;
  // Deposits for the year: posted credits, transfers-in excluded, grouped by payer.
  const byPayer = new Map<string, { total: number; count: number; p2p: boolean }>();
  for (const r of tx as any[]) {
    if (!r || r.is_pending || r.is_transfer) continue;
    const cents = Math.round(Number(r.amount_cents));
    if (!Number.isFinite(cents) || cents <= 0) continue;
    const d = String(r.posted_on || "").slice(0, 10);
    if (d < from || d > to) continue;
    const p = payerOf(String(r.merchant_raw || ""));
    const b = byPayer.get(p.name) || { total: 0, count: 0, p2p: p.p2p };
    b.total += cents; b.count++; b.p2p = b.p2p && p.p2p;
    byPayer.set(p.name, b);
  }
  const src = MA.txSource(tx, tz);
  const lines: string[] = [];
  const business = [...byPayer.entries()].filter(([, b]) => !b.p2p).sort((a, b) => b[1].total - a[1].total);
  const personal = [...byPayer.entries()].filter(([, b]) => b.p2p).sort((a, b) => b[1].total - a[1].total);
  const businessTotal = business.reduce((s, [, b]) => s + b.total, 0);

  if (!forms.length) {
    lines.push(`1099 reconciliation for ${year}: no 1099 forms are on file yet, so there is nothing to match against — here is the deposit side from your linked accounts, ready to check the day a form arrives.`);
  } else {
    lines.push(`1099 reconciliation for ${year}: ${forms.length} form${forms.length === 1 ? "" : "s"} on file, matched against your deposits.`);
    const matched = new Set<string>();
    for (const f of forms.slice().sort((a, b) => b.amount_cents - a.amount_cents)) {
      const hit = business.find(([name]) => MA.termMatch(name, f.payer) || MA.termMatch(f.payer, name));
      if (!hit) { lines.push(`- ${f.payer} ${f.kind || "1099"}: ${MA.money(f.amount_cents)} reported, but no deposits from that payer appear in ${year} — ask ${f.payer} whether it was paid to a different account.`); continue; }
      matched.add(hit[0]);
      const dep = hit[1].total, delta = dep - f.amount_cents;
      if (delta === 0) lines.push(`- ${f.payer} ${f.kind || "1099"}: ${MA.money(f.amount_cents)} — matches your deposits to the cent.`);
      else if (delta > 0) lines.push(`- ${f.payer} ${f.kind || "1099"}: the form says ${MA.money(f.amount_cents)} but your deposits from ${hit[0]} total ${MA.money(dep)} — the form is ${MA.money(delta)} SHORT. Contact ${f.payer} for a corrected form before filing; your corrected income from them is ${MA.money(dep)}.`);
      else lines.push(`- ${f.payer} ${f.kind || "1099"}: the form says ${MA.money(f.amount_cents)} but your deposits from ${hit[0]} total ${MA.money(dep)} — the form is ${MA.money(-delta)} MORE than you received. Contact ${f.payer} for a corrected form; do not file the higher figure without one.`);
    }
    for (const [name, b] of business) if (!matched.has(name)) lines.push(`- No form on file from ${name}: ${MA.money(b.total)} in deposits (${b.count} deposit${b.count === 1 ? "" : "s"}). If that was business or platform income, they owe you a form — ask them for it.`);
  }
  if (business.length) {
    lines.push(`Deposits by payer, ${year} (business and platform payers):`);
    for (const [name, b] of business) lines.push(`- ${name}: ${MA.money(b.total)} (${b.count} deposit${b.count === 1 ? "" : "s"})`);
    lines.push(`Corrected income total from these payers: ${MA.money(businessTotal)} — this is the figure your forms together should equal.`);
  } else {
    lines.push(`No business or platform deposits appear in ${year} in your linked accounts.`);
  }
  if (personal.length) {
    const pt = personal.reduce((s, [, b]) => s + b.total, 0);
    lines.push(`Person-to-person money in (${personal.map(([n, b]) => `${n} ${MA.money(b.total)}`).join(", ")}; ${MA.money(pt)} total) is listed apart — repayments from people are not 1099 income and are not in the total above.`);
  }
  if (!forms.length) lines.push(`To finish the match, add your 1099s (a photo or PDF of each form is enough) and ask me again — every form gets checked against these deposits to the cent.`);
  lines.push(src);
  return lines.join("\n");
}
