// Final A1 through the chat's money answers (agent-chat/_shared/money_answers.ts -> Bnpl in the router bundle):
// the owner's real-row twins (Chase checking, Jul 15-Sep 25 2026; 15 Affirm payments, $317.63) are SIX plans,
// counted by hand before any code read them. Fixture rows are MOCK twins of the real rows' shapes; the provider
// terms and descriptor structure are the real dated file, read through the router bundle.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { moneyKind, moneyReply, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";

const TZ = "America/Chicago";
const NOW = new Date("2026-10-12T15:05:00Z"); // Oct 12, 10:05 a.m. in Chicago
const SYNC = "2026-10-12T14:00:00Z";
const ACCOUNTS: AccountRow[] = [
  { account_id: "chk", name: "Everyday Checking", institution: "Chase", account_kind: "checking", balance_cents: 41329, available_cents: 399, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" },
];
let n = 0;
const tx = (posted_on: string, amount_cents: number, merchant_raw: string): MoneyTxRow =>
  ({ account_id: "chk", provider_transaction_id: `sf-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: SYNC });
const P = (d: string, cents: number, code: string) => tx(d, -cents, `AFFIRM * PAY ${code} SAN FRANCISCO CA`);
const CODES = ["Y8PRUXM0", "KJ4OR9CH", "SD6B2XRK", "WJSJ24AL", "3U3M7JEN", "N7Q3CCLN", "OIDHK430", "IAYRAUTH", "ZQILNSJX", "6KHJY9TY", "D15Z7DSK", "6GGIXBJA"];
const TX: MoneyTxRow[] = [
  tx("2026-07-15", -6144, "AFFIRM.COM PAYMENTS 185-54233729 CA"), tx("2026-08-17", -6144, "AFFIRM.COM PAYMENTS 185-54233729 CA"), tx("2026-09-15", -6144, "AFFIRM.COM PAYMENTS 185-54233729 CA"),
  P("2026-07-27", 1084, "SD6B2XRK"), P("2026-08-24", 1084, "ZQILNSJX"), P("2026-09-25", 1084, "Y8PRUXM0"),
  P("2026-07-29", 603, "WJSJ24AL"), P("2026-08-31", 603, "6KHJY9TY"), P("2026-09-25", 603, "3U3M7JEN"),
  P("2026-08-03", 1600, "N7Q3CCLN"), P("2026-09-02", 1600, "KJ4OR9CH"),
  P("2026-08-11", 1142, "OIDHK430"), P("2026-09-21", 1142, "D15Z7DSK"),
  P("2026-08-12", 1393, "IAYRAUTH"), P("2026-09-25", 1393, "6GGIXBJA"),
];
const read = () => ({ accounts: async () => ACCOUNTS, transactions: async () => TX });

Deno.test("the twins through moneyReply: the chat says 6 Affirm plans, each by amount and cadence, no code shown", async () => {
  assertEquals(moneyKind("show my bnpl plans"), "bnpl");
  const r = (await moneyReply("show my bnpl plans", NOW, read(), { tz: TZ }))!;
  assertEquals(r.split("\n")[0], "Buy now, pay later: 6 plans in progress in your bank and card rows.");
  assertEquals((r.match(/^- Affirm: \$/gm) || []).length, 6);
  assertMatch(r, /- Affirm: \$61\.44 a month, 3 payments seen \(Jul 15, Aug 17, Sep 15\)\. Next expected Oct 15 \(inferred from the monthly pattern\)\./);
  assertMatch(r, /- Affirm: \$10\.84 a month, 3 payments seen \(Jul 27, Aug 24, Sep 25\)\./);
  assertMatch(r, /- Affirm: \$6\.03 a month, 3 payments seen \(Jul 29, Aug 31, Sep 25\)\./);
  assertMatch(r, /- Affirm: \$13\.93 a month, 2 payments seen \(Aug 12, Sep 25\)\./);
  for (const code of CODES) assert(!new RegExp(code, "i").test(r), `the code ${code} is never shown`);
  const a = (await moneyReply("how much do i owe on affirm", NOW, read(), { tz: TZ }))!;
  assertEquals(a.split("\n")[0], "Affirm: 6 plans in progress in your bank and card rows.");
});
