// C10 fee audit in chat (real-world list C10; capability TXN-018 / SAVE-004 / SAVE-005): "what did banks and cards
// charge me this year", "what fees did i pay", "fee audit", "how much have i paid in fees". Every bank fee, ATM fee,
// foreign transaction fee and service charge across all accounts over the trailing 12 months, pulled from the
// person's own statement rows and totaled in dollars by type; the fightable ones are named individually and handed
// to the fee-reversal capability (SAVE-005) by name — the reversal request itself is never drafted here.
// Detection is the tested detector, packages/domain/41-agent-recovery.js (AgentRecovery.scan, through the agent
// core bundle, the same import _shared/recovery_service.ts uses): its feeKind names the fee from the bank's own
// words, excludes reversal wording, a merchant's own service fee and anything over its fee cap, and each bank_fee
// candidate it returns carries the SAVE-005 draft_request action. Rows are mapped the way _shared/proactive.ts maps
// them (mapAccounts / mapTransactions), then shaped for the scan the way packages/domain/49-agent-save.js shapes
// them (presence "observed", a synthesized fact_hash). Every number comes from those candidates over the rows;
// the last line is the source and as-of (MoneyAnswers.txSource). Pure apart from the injected readers, so
// tests/edge/fee-audit-answer.test.ts drives it with fixtures.
import { AgentLedger, MoneyAnswers } from "../../_shared/router_core.js";
import { AgentRecovery } from "../../_shared/agent_core.js";
import { mapAccounts, mapTransactions } from "../../_shared/proactive.ts";
import type { AccountRow, MoneyTxRow } from "./money_answers.ts";

export type FeeAuditReaders = { accounts(): Promise<AccountRow[]>; transactions(): Promise<MoneyTxRow[]> };
export const FEE_AUDIT_UNAVAILABLE = "I can't read your linked accounts right now, so I won't guess at a fee total. Try again in a minute.";

const ASKS: RegExp[] = [
  /^\s*(?:please\s+)?(?:do\s+)?(?:a\s+)?fee audit\s*[?.!]*$/i,
  /\baudit (?:of )?my fees\b/i,
  /\bhow much\b[^?.!]*\b(?:fees?|charged)\b[^?.!]*\b(?:i|me|my)\b/i,
  /\bwhat did\b[^?.!]*\bcharge me\b/i,
  /\bwhat\b[^?.!]*\bfees\b[^?.!]*\b(?:i|me)\b/i,
  /\bwhat(?:'s| is| are) my\b[^?.!]*\bfees\b/i,
  /\bshow me\b[^?.!]*\bfees\b/i,
  /\blist\b[^?.!]*\bmy fees\b/i,
  /\bi paid\b[^?.!]*\bfees\b/i,
  /\bdid i pay\b[^?.!]*\bfees\b/i,
  // The capability's own headline phrasing (C10: "how much did the bank take from me this year?") names no fee
  // word at all — the bank taking money IS the fee audit. The take/took family, with the bank or the taking
  // itself as the anchor.
  /\bhow much\b[^?.!]*\b(?:bank|account)\b[^?.!]*\b(?:take|took|taken|charge|charged|charging)\b/i,
  /\bhow much\b[^?.!]*\b(?:take|took|taken)\b[^?.!]*\bfrom me\b/i,
  // C193's own headline ask ("Am I getting fleeced abroad?") names no fee word either — fleeced, abroad.
  /\bfleeced\b[^?.!]*\b(?:abroad|overseas|foreign)\b/i,
  /\bforeign (?:transaction )?fees?\b/i,
];
export function isFeeAuditAsk(message: string): boolean {
  const m = String(message || "");
  return ASKS.some((re) => re.test(m));
}

// The scan's fee kinds in the person's words.
const KIND_LABEL: Record<string, string> = {
  overdraft: "Overdraft fees",
  nsf: "NSF and returned item fees",
  monthly_maintenance: "Monthly maintenance and service charges",
  atm: "ATM fees",
  foreign_transaction: "Foreign transaction fees",
  late_payment: "Late payment fees",
  paper_statement: "Paper statement fees",
};
const DAY = 86400000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (ymd: string) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}, ${ymd.slice(0, 4)}`;
const charges = (n: number) => `${n} charge${n === 1 ? "" : "s"}`;

export async function feeAuditReply(message: string, now: Date | number | string, read: FeeAuditReaders, opts?: { tz?: string }): Promise<string | null> {
  if (!isFeeAuditAsk(message)) return null;
  const tz = opts?.tz || "UTC";
  let rawAccounts: AccountRow[];
  try { rawAccounts = ((await read.accounts()) || []).filter((a) => a && a.status !== "disconnected"); } catch { return FEE_AUDIT_UNAVAILABLE; }
  if (!rawAccounts.length) return null;
  let rawTx: MoneyTxRow[];
  try { rawTx = (await read.transactions()) || []; } catch { return FEE_AUDIT_UNAVAILABLE; }

  const L: any = AgentLedger as any, MA: any = MoneyAnswers as any;
  const today = MA.todayIn(now, tz), from = addDays(today, -365);
  const period = `${label(from)} to ${label(today)}`;
  const src = MA.txSource(rawTx, tz);
  const mappedAccounts = mapAccounts(rawAccounts as any[]);
  const acctLabel = (id: string) => {
    const raw = rawAccounts.find((a) => a.account_id === id);
    if (raw) return MA.acctName(raw);
    const m = mappedAccounts.find((a: any) => a.id === id);
    return m ? (m.institution && !String(m.name).toLowerCase().includes(String(m.institution).toLowerCase()) ? `${m.institution} ${m.name}` : String(m.name)) : "an account";
  };
  // The trailing 12 months only, then the recovery scan over exactly those rows (posted fees; pending rows are
  // holds to the scan, transfers and credits never candidates).
  const windowRows = mapTransactions(rawTx as any[]).filter((t: any) => t.posted_at >= from && t.posted_at <= today);
  const scanRows = windowRows.map((t: any, i: number) => ({
    account_id: t.account_id, provider_transaction_id: String(t.id), fact_hash: `f${i}`, currency: "USD", presence: "observed",
    is_pending: !!t.is_pending, is_transfer: !!t.is_transfer, merchant_key: null, merchant_raw: t.merchant_raw, amount_cents: t.amount_cents, posted_on: t.posted_at,
  }));
  let candidates: any[];
  try { candidates = ((AgentRecovery as any).scan(scanRows, { today }).candidates || []).filter((c: any) => c.kind === "bank_fee"); }
  catch { return FEE_AUDIT_UNAVAILABLE; }

  // Foreign transaction audit (capability C193): international charges in the window, the foreign fees among
  // the candidates, and the conversion each descriptor itself states. A charge converted at the rate printed
  // in its own descriptor ("EURO 2.50 X 1.156000 (EXCHG RTE)") was converted by the bank at that rate; a
  // merchant-side dollar conversion (dynamic currency conversion) would show as a USD amount with no rate in
  // the descriptor, so DCC is flagged as "not visible in the feed" rather than guessed at.
  const foreignAsk = /\bforeign\b|\binternational\b|\babroad\b|\boverseas\b|\bdcc\b|dynamic currency|\bconversion\b/i.test(message);
  const intlRows = windowRows.filter((t: any) => !t.is_transfer && (/exchg\s*rte|foreign|intl\b/i.test(String(t.merchant_raw || "")) || ((t as any).currency && String((t as any).currency).toUpperCase() !== "USD")));
  const fxFees = candidates.filter((c: any) => c.fee_kind === "foreign_transaction");
  const fxTotal = fxFees.reduce((s: number, c: any) => s + c.amount_cents, 0);
  const foreignSection: string[] = [];
  if (foreignAsk || intlRows.length || fxFees.length) {
    foreignSection.push("Foreign transaction check:");
    foreignSection.push(fxFees.length
      ? `- Foreign transaction fees charged: ${MA.money(fxTotal)} across ${charges(fxFees.length)} (listed under Fightable above). If one was charged on a purchase that was refunded or in a currency your card prices at 0%, say "dispute this charge" and I'll draft the dispute for your approval.`
      : "- Foreign transaction fees charged: $0.00 — no foreign transaction fee appears in the last 12 months.");
    for (const t of intlRows.slice(0, 5)) {
      const conv = String(t.merchant_raw || "").match(/([A-Za-z]{3,})\.?\s+([\d,]+\.\d{2})\s*[xX]\s*([\d.]+)/);
      const convText = conv ? ` — the descriptor states ${conv[1]} ${conv[2]} × ${conv[3]} = ${MA.money(Math.round(parseFloat(conv[2].replace(/,/g, "")) * parseFloat(conv[3]) * 100))}, converted at the bank's rate, with no separate conversion fee line` : "";
      foreignSection.push(`- International charge: ${MA.display(String(t.merchant_raw || ""))}: ${MA.money(Math.abs(t.amount_cents))} on ${label(t.posted_at)} (${acctLabel(t.account_id)})${convText}.`);
    }
    if (intlRows.length) foreignSection.push("- Dynamic currency conversion: no charge in the feed shows a merchant-side dollar conversion; when a terminal abroad offers to charge you in dollars, choose the local currency instead — merchant conversion typically adds 3–8% over the bank rate.");
  }

  if (!candidates.length) return [`No bank fees in the last 12 months (${period}) across your linked accounts.`, ...foreignSection, src].join("\n");

  const total = candidates.reduce((s: number, c: any) => s + c.amount_cents, 0);
  const byKind = new Map<string, { total: number; count: number }>();
  for (const c of candidates) { const b = byKind.get(c.fee_kind) || { total: 0, count: 0 }; b.total += c.amount_cents; b.count++; byKind.set(c.fee_kind, b); }
  const kindLines = [...byKind.entries()]
    .sort((a, b) => b[1].total - a[1].total || (KIND_LABEL[a[0]] || a[0]).localeCompare(KIND_LABEL[b[0]] || b[0]))
    .map(([kind, b]) => `- ${KIND_LABEL[kind] || `${kind.replace(/_/g, " ")} fees`}: ${MA.money(b.total)} (${charges(b.count)})`);
  const fightable = candidates.slice().sort((a, b) => String(a.evidence[0].posted_on).localeCompare(String(b.evidence[0].posted_on)) || b.amount_cents - a.amount_cents)
    .map((c: any) => { const e = c.evidence[0]; return `- ${L.normalizeMerchant(e.label).display}: ${MA.money(c.amount_cents)} on ${label(e.posted_on)} (${acctLabel(e.account_id)})`; });

  return [
    `Fee audit, last 12 months (${period}): ${MA.money(total)} in bank fees across ${charges(candidates.length)}.`,
    "By type:",
    ...kindLines,
    "Fightable: Upmore can draft a reversal request for each of these through SAVE-005 (the fee-reversal path); nothing is drafted or sent until you approve it:",
    ...fightable,
    ...foreignSection,
    src,
  ].join("\n");
}
