// C12 income reconciliation in chat (real-world list C12): "did my paycheck land", "did i get paid", "when is my
// next paycheck", "is my paycheck short", "did my pay come in". Every real deposit is identified and classified
// from the person's own rows: the payroll pattern (packages/domain/57-agent-ledger.js TXN-005 recurring over
// credits the ledger categorizes as income, with ANL-010 paycheckAllocation naming the paychecks), side income
// (other posted credits) said apart and never counted as payroll, and transfers-in excluded throughout (the
// ledger's recurring and categorize both drop is_transfer rows first, so a transfer wearing payroll words is
// never a paycheck). A missing cycle (the expected date passed with no deposit in that cycle) or a short
// paycheck is flagged against the pattern's trailing median — AgentLedger.recurring's amount_cents — with the
// exact delta in dollars. Rows are mapped the way _shared/proactive.ts maps them (mapAccounts /
// mapTransactions). Every figure comes from the rows; the last line is the source and as-of
// (MoneyAnswers.txSource). Pure apart from the injected readers, so tests/edge/paycheck-answer.test.ts drives
// it with fixtures.
import { AgentLedger, MoneyAnswers } from "../../_shared/router_core.js";
import { mapAccounts, mapTransactions } from "../../_shared/proactive.ts";
import type { AccountRow, MoneyTxRow } from "./money_answers.ts";

export type PaycheckReaders = { accounts(): Promise<AccountRow[]>; transactions(): Promise<MoneyTxRow[]> };
export const PAYCHECK_UNAVAILABLE = "I can't read your linked accounts right now, so I won't guess about your paycheck. Try again in a minute.";

const LEAD = String.raw`^\s*(?:hey|hi|ok|okay|so|yo|pls|please)?[,\s]*`;
const END = String.raw`\s*[?.!]*\s*$`;
const SUBJ = String.raw`(?:paycheck|pay ?check|payday|pay day|salary|pay)`;
const ASKS: RegExp[] = [
  new RegExp(LEAD + String.raw`(?:did|has|have) (?:my )?` + SUBJ + String.raw` (?:land(?:ed)?|come in|came in|post(?:ed)?|arrive(?:d)?|clear(?:ed)?|hit|show up)` + END, "i"),
  new RegExp(LEAD + String.raw`(?:did|have) i (?:get|got) paid(?: yet| today)?` + END, "i"),
  new RegExp(LEAD + String.raw`when (?:is|'s) (?:my )?next ` + SUBJ + END, "i"),
  new RegExp(LEAD + String.raw`when (?:do|will) i (?:get paid|receive my (?:paycheck|pay))(?: next)?` + END, "i"),
  new RegExp(LEAD + String.raw`(?:is|was) (?:my )?` + SUBJ + String.raw` (?:short|less|lower|smaller)(?: than usual)?` + END, "i"),
];
// A send waiting on the paycheck ("pay maya 40 only if my paycheck landed") is paycheck_send.ts's, never this.
const SEND_FIRST = /^\s*(?:send|pay|venmo|zelle|cash ?app|paypal)\s+\S/i;
export function isPaycheckAsk(message: string): boolean {
  const m = String(message || "");
  if (SEND_FIRST.test(m)) return false;
  return ASKS.some((re) => re.test(m));
}

const DAY = 86400000;
const DAY_MS = (ymd: string) => Date.parse(ymd + "T00:00:00Z");
const addDays = (ymd: string, n: number) => new Date(DAY_MS(ymd) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((DAY_MS(b) - DAY_MS(a)) / DAY);
const addMonths = (ymd: string, n: number) => { const d = new Date(DAY_MS(ymd)); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
// The ledger's own cadence step (57-agent-ledger.js stepFrom), so the next expected date is the pattern's date.
const stepFrom = (on: string, cadence: string) => cadence === "monthly" ? addMonths(on, 1) : cadence === "quarterly" ? addMonths(on, 3) : cadence === "yearly" ? addMonths(on, 12) : cadence === "weekly" ? addDays(on, 7) : cadence === "biweekly" ? addDays(on, 14) : (+on.slice(8, 10) <= 14 ? `${on.slice(0, 7)}-15` : `${addMonths(`${on.slice(0, 7)}-01`, 1).slice(0, 7)}-01`);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (ymd: string) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}, ${ymd.slice(0, 4)}`;

export async function paycheckReply(message: string, now: Date | number | string, read: PaycheckReaders, opts?: { tz?: string }): Promise<string | null> {
  if (!isPaycheckAsk(message)) return null;
  const tz = opts?.tz || "UTC";
  let rawAccounts: AccountRow[];
  try { rawAccounts = ((await read.accounts()) || []).filter((a) => a && a.status !== "disconnected"); } catch { return PAYCHECK_UNAVAILABLE; }
  if (!rawAccounts.length) return null;
  let rawTx: MoneyTxRow[];
  try { rawTx = (await read.transactions()) || []; } catch { return PAYCHECK_UNAVAILABLE; }

  const L: any = AgentLedger as any, MA: any = MoneyAnswers as any;
  const today = MA.todayIn(now, tz), src = MA.txSource(rawTx, tz);
  const mappedAccounts = mapAccounts(rawAccounts as any[]);
  const mappedTx = mapTransactions(rawTx as any[]);
  const noPattern = [`No regular paycheck pattern is visible in your linked accounts yet.`, src].join("\n");

  // The payroll pattern: a recurring credit the ledger categorizes as income (payroll words), transfers-in
  // already excluded by recurring itself. With several, the one whose last deposit is newest is the paycheck.
  const patterns = (L.recurring(mappedTx, today) || []).filter((r: any) => r.direction === "credit" && r.category === "income");
  if (!patterns.length) return noPattern;
  const pattern = patterns.slice().sort((a: any, b: any) => String(b.last_on).localeCompare(String(a.last_on)))[0];

  const enriched = L.enrich(mappedTx);
  const groupRows = enriched.filter((t: any) => !t.is_transfer && !t.is_pending && t.amount_cents > 0 && t.merchant_key === pattern.key)
    .sort((a: any, b: any) => a.posted_at.localeCompare(b.posted_at));
  if (!groupRows.length) return noPattern;
  // ANL-010: the paychecks themselves, from paycheckAllocation over the same mapped rows; the last one in the
  // pattern's group is the last paycheck.
  const groupDates = new Set(groupRows.map((t: any) => t.posted_at));
  const allocPays = (L.paycheckAllocation(mappedTx, null, mappedAccounts).paychecks || []).filter((p: any) => groupDates.has(p.on));
  const lastRow = groupRows[groupRows.length - 1];
  const lastAlloc = allocPays[allocPays.length - 1];
  const last = lastAlloc && lastAlloc.on === lastRow.posted_at ? { on: lastAlloc.on, amount_cents: lastAlloc.amount_cents } : { on: lastRow.posted_at, amount_cents: lastRow.amount_cents };
  const expected = pattern.amount_cents; // the pattern's trailing median
  const rawAcct = rawAccounts.find((a) => a.account_id === lastRow.account_id);
  const acct = rawAcct ? MA.acctName(rawAcct) : "an account";

  const lines: string[] = [
    `Your last paycheck: ${MA.money(last.amount_cents)} from ${MA.display(lastRow.merchant_raw)} on ${label(last.on)}, into ${acct}.`,
    `Your usual paycheck is ${MA.money(expected)} (the median of the last ${pattern.count}).`,
  ];
  if (last.amount_cents < expected) lines.push(`The ${label(last.on)} paycheck is ${MA.money(expected - last.amount_cents)} short of that.`);
  else if (last.amount_cents > expected) lines.push(`The ${label(last.on)} paycheck is ${MA.money(last.amount_cents - expected)} more than that.`);

  // Side income: every other real deposit in the last 90 days — posted credits that are not transfers-in and
  // not this payroll pattern — named apart, never counted toward the paycheck.
  const since = addDays(today, -90);
  const others = enriched.filter((t: any) => !t.is_transfer && !t.is_pending && t.amount_cents > 0 && t.merchant_key !== pattern.key && t.posted_at >= since && t.posted_at <= today)
    .sort((a: any, b: any) => a.posted_at.localeCompare(b.posted_at));
  if (others.length) {
    const sum = others.reduce((s: number, t: any) => s + t.amount_cents, 0), latest = others[others.length - 1];
    lines.push(`Other deposits in the last 90 days: ${MA.money(sum)} of side income (${others.length} deposit${others.length === 1 ? "" : "s"}: ${MA.display(latest.merchant_raw)} ${MA.money(latest.amount_cents)} on ${label(latest.posted_at)}), not counted as payroll.`);
  }

  // Missing cycles and the next expected date, stepped on the pattern's own cadence: a cycle counts as paid
  // when a paycheck of this pattern posted on or after its expected date and before the next one.
  const payDates = groupRows.map((t: any) => t.posted_at);
  const missed: string[] = [];
  let next = pattern.next_expected, guard = 0;
  while (next <= today && guard++ < 24) {
    const following = stepFrom(next, pattern.cadence);
    if (!payDates.some((d: string) => d >= next && d < following)) missed.push(next);
    next = following;
  }
  if (missed.length) {
    const m = missed[missed.length - 1], days = daysBetween(m, today);
    lines.push(`A paycheck is missing: ${MA.money(expected)} was expected on ${label(m)}, ${days} day${days === 1 ? "" : "s"} ago, and no deposit has posted for that cycle.`);
  }
  lines.push(`Next paycheck expected: ${label(next)}.`);
  lines.push(src);
  return lines.join("\n");
}
