// C11 (TXN-019) in chat (_shared/tip_fees_answer.ts over packages/domain/116-tip-fees.js through the router bundle):
// tip and fee-load percentages per merchant, current month vs the month before, from itemized receipt rows only.
// Fixture readers are MOCK; the percentages (DoorDash fees 24% in March, 31% in April) are computed by the domain
// functions from the fixture receipts below, never stated by the wrapper.
// Check: deno test -A --no-check tests/edge/tip-fees-answer.test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { tipFeesReply } from "../../supabase/functions/agent-chat/_shared/tip_fees_answer.ts";

const NOW = new Date("2026-04-15T15:00:00Z"), TZ = "UTC";
const rc = (merchant: string, on: string, o: any = {}) => Object.assign({
  merchant, on, total_cents: null, order: null,
  subtotal_cents: null, tip_cents: null, delivery_fee_cents: null, service_fee_cents: null, tax_cents: null,
  source: "receipt email",
}, o);
// March DoorDash: (700+500)/5000 = 24% fees, 10% tip. April DoorDash: (900+650)/5000 = 31% fees, 15% tip.
const RECEIPTS = [
  rc("DoorDash", "2026-03-05", { subtotal_cents: 5000, delivery_fee_cents: 700, service_fee_cents: 500, tip_cents: 500 }),
  rc("DoorDash", "2026-03-20", { subtotal_cents: 5000, delivery_fee_cents: 700, service_fee_cents: 500, tip_cents: 500 }),
  rc("DoorDash", "2026-04-03", { subtotal_cents: 5000, delivery_fee_cents: 900, service_fee_cents: 650, tip_cents: 750 }),
  rc("DoorDash", "2026-04-10", { subtotal_cents: 5000, delivery_fee_cents: 900, service_fee_cents: 650, tip_cents: 750 }),
];
const read = (receipts: any[] = RECEIPTS) => ({ receipts: async () => receipts, transactions: async () => [] });

Deno.test("are delivery fees getting worse: DoorDash 31% now vs 24% last month, order counts, source and as-of", async () => {
  const t = (await tipFeesReply("are delivery fees getting worse?", NOW, read(), { tz: TZ }))!;
  assertStringIncludes(t, "DoorDash");
  assertStringIncludes(t, "31% in fees, up from 24% in March");
  assertStringIncludes(t, "2 orders in April, 2 orders in March");
  assertStringIncludes(t, "From your itemized receipts");
  assertStringIncludes(t, "as of Apr 15");
});

Deno.test("how much do i tip on doordash: the tip percentage, tracked separately from fees", async () => {
  const t = (await tipFeesReply("how much do i tip on doordash", NOW, read(), { tz: TZ }))!;
  assertStringIncludes(t, "DoorDash");
  assertStringIncludes(t, "15%");
  assertStringIncludes(t, "up from 10% in March");
});

Deno.test("an unrelated message returns null and reads nothing", async () => {
  let reads = 0;
  const counting = { receipts: async () => { reads++; return RECEIPTS; }, transactions: async () => { reads++; return []; } };
  assertEquals(await tipFeesReply("what's my balance", NOW, counting, { tz: TZ }), null);
  assertEquals(await tipFeesReply("how much did i spend on groceries", NOW, counting, { tz: TZ }), null);
  assertEquals(reads, 0);
});

Deno.test("no itemized receipts on file: the honest line, never an estimate", async () => {
  const line = "Tips and fees can only be tracked from itemized receipts, and none are on file.";
  assertEquals(await tipFeesReply("are delivery fees getting worse?", NOW, read([]), { tz: TZ }), line);
  // A totals-only receipt is not itemized: still the honest line.
  const totalsOnly = [rc("DoorDash", "2026-04-03", { total_cents: 7685 })];
  assertEquals(await tipFeesReply("are delivery fees getting worse?", NOW, read(totalsOnly), { tz: TZ }), line);
});
