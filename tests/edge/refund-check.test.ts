// "Did my refund arrive?" (megadoc K07; capability list item 38, the asking half) through moneyReply, the function the
// handler's direct answers call (packages/domain/98-refund-check.js via _shared/money_answers.ts). Rows are MOCK.
// Permission-free.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { moneyKind, moneyReply, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-10-12T15:00:00Z");
const SYNC = "2026-10-12T12:00:00Z";
const ACCOUNTS: AccountRow[] = [{ account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 100000, available_cents: null, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" }];
let n = 0;
const tx = (posted_on: string, amount_cents: number, merchant_raw: string, o: Partial<MoneyTxRow> = {}): MoneyTxRow =>
  ({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: SYNC, ...o });
const TX: MoneyTxRow[] = [tx("2026-07-01", -9000, "AMAZON.COM*AB12"), tx("2026-09-20", -48900, "DELTA AIR LINES 0062"), tx("2026-10-08", 48900, "DELTA AIR LINES 0062"), tx("2026-10-09", 1200, "AMAZON.COM REFUND"), tx("2026-10-10", 250000, "ACME PAYROLL DIR DEP")];
const read = { accounts: async () => ACCOUNTS, transactions: async () => TX };

Deno.test("routing: refund asks are the refund answer, before 'did it go through'; money-owed and airline asks keep theirs", () => {
  for (const m of ["did my refund arrive?", "did the delta refund post", "did amazon refund me", "has the $489 refund from delta posted yet", "any refunds", "did i get refunded"]) assertEquals(moneyKind(m), "refund", m);
  for (const [m, k] of [["did my rent go through?", "through"], ["any refunds coming to me?", null], ["did my tax refund arrive", null], ["i cancelled my flight can i get a refund", null]] as [string, string | null][]) assertEquals(moneyKind(m), k, m);
});

Deno.test("a named refund that posted: yes, to the cent, with the source", async () => {
  const r = (await moneyReply("did the delta refund post", NOW, read, { tz: TZ }))!;
  assertEquals(r, "Yes, one credit from Delta since Jul 14: $489.00 from Delta Air Lines on Oct 8.\nFrom your linked accounts, transactions through Oct 10, 2026, as of Oct 12, 8:00 AM EDT.");
});

Deno.test("no merchant: what looks like refunds is listed, pay never is", async () => {
  const r = (await moneyReply("did my refund arrive?", NOW, read, { tz: TZ }))!;
  assertMatch(r, /^2 credits that look like refunds since Jul 14: \$12\.00 from Amazon on Oct 9; \$489\.00 from Delta Air Lines on Oct 8\.\n/);
  assert(!/Payroll|2,500/.test(r), r);
});

Deno.test("none: the days checked and the watch offered; nothing linked or a failed read is not 'no refund'", async () => {
  const r = (await moneyReply("did i get my refund from united", NOW, read, { tz: TZ }))!;
  assertMatch(r, /^I don't see a refund from United in your linked accounts since Jul 14: no credit from them\.\nIf they gave you a date, say "tell me if my refund from United doesn't arrive by" and that date, and I'll watch for it\.\n/);
  assertEquals(await moneyReply("did my refund arrive?", NOW, { accounts: async () => [], transactions: async () => TX }, { tz: TZ }), null, "nothing linked: the handler's NO_ACCOUNTS line answers");
  const failed = await moneyReply("did my refund arrive?", NOW, { accounts: async () => ACCOUNTS, transactions: async () => { throw new Error("down"); } }, { tz: TZ });
  assertMatch(failed!, /^I can't read your linked accounts right now/);
});
