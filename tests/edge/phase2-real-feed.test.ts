// Phase 2 real-feed validation regressions at the chat/proactive surfaces (2026-10-12). Fixture twins of the owner's
// real SimpleFIN rows (digit runs, codes and counterparty names twinned; amounts and dates are the real rows'
// values, which are the assertions). Three defects the fixture worlds never had:
//   C10 — the capability's own headline ask ("how much did the bank take from me this year?") routed nowhere.
//   C14 — the weekly recap counted only credits the categorizer calls "income", so a week with $432.06 of Zelle and
//         Venmo money in reported "$0.00 in" and a net of -$20.00 instead of +$412.06.
//   C28 — the Affirm bill due in 3 days got no reminder: the pay-later status finding for the same charge
//         suppressed it under the "one charge is never pushed twice" rule meant for renewal alerts.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { feeAuditReply, isFeeAuditAsk } from "../../supabase/functions/agent-chat/_shared/fee_audit_answer.ts";

let n = 0;
const row = (posted_on: string, amount_cents: number, merchant_raw: string) =>
  ({ account_id: "chk", provider_transaction_id: "t" + (++n), currency: "USD", amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, presence: "observed", fetched_at: "2026-10-12T14:00:00Z" });
const ACCTS = [{ account_id: "chk", name: "Everyday Checking", institution: "Chase", currency: "USD", account_kind: "checking", balance_cents: 41329, available_cents: 399, balance_as_of: "2026-10-12T14:00:00Z", fetched_at: "2026-10-12T14:00:00Z", sync_error: false, status: "active" }];

Deno.test("C10: the headline fee-audit ask routes, and the audit totals the real fees to the cent", async () => {
  assert(isFeeAuditAsk("how much did the bank take from me this year?"));
  const tx = [row("2026-07-20", -2500, "MONTHLY SERVICE FEE"), row("2026-08-20", -2500, "MONTHLY SERVICE FEE"), row("2026-09-21", -2500, "MONTHLY SERVICE FEE"), row("2026-09-14", -8500, "APPLE CASH INST XFER SENT MONEY CUPERTINO CA")];
  const reply = await feeAuditReply("how much did the bank take from me this year?", new Date("2026-10-12T15:05:00Z"), { accounts: async () => ACCTS, transactions: async () => tx }, { tz: "America/Chicago" });
  assert(reply && reply.includes("$75.00 in bank fees across 3 charges"), String(reply));
  assert(reply!.includes("Monthly maintenance and service charges: $75.00 (3 charges)"), String(reply));
});

Deno.test("C14: the weekly recap counts person-to-person money in — the week nets +$412.06, not -$20.00", () => {
  const rtp = (ref: string) => `REAL TIME TRANSFER RECD FROM ABA/CONTR BNK-021000021 FROM: VENMO REF: ${ref} INFO: TEXT-RmtInf-INSTANT TRANSFER`;
  const tx = [
    row("2026-10-06", 2000, "Zelle payment from AVERY 55512340011"),
    row("2026-10-07", -2000, "ANTHROPIC ANTHROPIC.COM CA 10/07"),
    row("2026-10-09", 4500, "Zelle payment from AVERY 55512340012"),
    row("2026-10-09", 8900, "Zelle payment from B NOVAK 55512340013"),
    row("2026-10-09", 4913, rtp("26100921023460001")),
    row("2026-10-09", 5208, rtp("26100918495720002")),
    row("2026-10-09", 17685, rtp("26100921663510003")),
    // History before the week so the feed has its context (an August charge and an old fee).
    row("2026-08-24", -158250, "WWW.FIVERR.COM NEW YORK NY"),
    row("2026-09-21", -2500, "MONTHLY SERVICE FEE"),
  ];
  const p = plan({ accounts: mapAccounts(ACCTS), transactions: mapTransactions(tx), settings: { weekly_recap_dow: 0, time_zone: "America/Chicago" }, sent: [] }, Date.UTC(2026, 9, 11, 14, 0, 0));
  const recap = p.messages.find((m: any) => m.key.startsWith("recap:"));
  assert(recap, JSON.stringify(p.messages.map((m: any) => m.key)));
  assert(recap!.text.includes("$432.06 in, $20.00 out"), recap!.text);
  assert(recap!.text.includes("Net cash flow: $412.06"), recap!.text);
});

Deno.test("C28: a pay-later plan's bill still gets its 3-day reminder — the status finding does not suppress it", () => {
  const tx = [
    row("2026-08-17", -6144, "AFFIRM.COM PAYMENTS 185-55501234 CA"),
    row("2026-09-15", -6144, "AFFIRM.COM PAYMENTS 185-55501234 CA"),
    row("2026-09-21", -2500, "MONTHLY SERVICE FEE"),
    row("2026-08-24", -158250, "WWW.FIVERR.COM NEW YORK NY"),
  ];
  // The plan projects the next Affirm payment to 2026-10-15; the run is 2026-10-12, exactly 3 days ahead.
  const p = plan({ accounts: mapAccounts(ACCTS), transactions: mapTransactions(tx), settings: { time_zone: "America/New_York" }, sent: [] }, Date.UTC(2026, 9, 12, 14, 0, 0));
  const keys = p.messages.map((m: any) => m.key);
  assert(keys.some((k: string) => k.includes("pay_later")), JSON.stringify(keys));
  const due = p.messages.filter((m: any) => m.key.startsWith("finding:bill_due_3d:"));
  assertEquals(due.length, 1, JSON.stringify(keys));
  assert(due[0].text.includes("$61.44 is due in 3 days, on 2026-10-15"), due[0].text);
  assert(due[0].text.includes("a late fee applies"), due[0].text);
});
