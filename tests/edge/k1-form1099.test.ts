// C165 reconcile my 1099 income (K1, 2026-10-12): the deposit side runs on twins of the owner's REAL Chase
// rows — hand oracle from the raw rows: business/platform deposits Venmo $1,257.59 (18), Rebet $864.17 (6:
// Visa Direct $752.17 + Settlement $112.00 under one payer name), Kalshi $39.90 (1), an unattributed bank
// deposit $1,360.00 (1); corrected total $3,521.66. Person-to-person money in (Zelle $319.01 + Apple Cash
// $11.51 = $330.52) is listed apart and never counted. Form matching is proven on stand-in forms (the owner
// has no 2026 1099s yet — they are issued in January): a short form and an over-stated form, deltas exact.
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { form1099Reply, isForm1099Ask } from "../../supabase/functions/agent-chat/_shared/form1099_answer.ts";
import { K1_ACCOUNTS, K1_TX } from "./k1-fixtures.ts";

const NOW = new Date("2026-10-12T20:05:00Z");
const TZ = { tz: "America/Chicago" };
const base = { accounts: async () => K1_ACCOUNTS, transactions: async () => K1_TX };

Deno.test("C165 routing: reconciliation asks route; a rules question does not", () => {
  assert(isForm1099Ask("Reconcile my 1099 income"));
  assert(isForm1099Ask("do my 1099s match what I actually got paid?"));
  assert(!isForm1099Ask("what is the 1099 threshold for 2026?"));
  assert(!isForm1099Ask("what's my balance?"));
});

Deno.test("C165: the deposit side ties to the hand count; person-to-person stays out of the total", async () => {
  const r = await form1099Reply("Reconcile my 1099 income", NOW, { ...base, forms1099: async () => [] }, TZ);
  assertStringIncludes(r!, "no 1099 forms are on file yet");
  assertStringIncludes(r!, "Venmo: $1,257.59 (18 deposits)");
  assertStringIncludes(r!, "Rebet: $864.17 (6 deposits)");
  assertStringIncludes(r!, "Kalshi: $39.90 (1 deposit)");
  assertStringIncludes(r!, "Corrected income total from these payers: $3,521.66");
  assertStringIncludes(r!, "$330.52 total) is listed apart");
});

Deno.test("C165 adversarial (stand-in forms): a short form and an over-stated form are flagged with exact deltas", async () => {
  const forms = [
    { payer: "Venmo", amount_cents: 100000, kind: "1099-K", year: 2026 },
    { payer: "Rebet", amount_cents: 90000, kind: "1099-MISC", year: 2026 },
  ];
  const r = await form1099Reply("do my 1099s match what I actually got paid?", NOW, { ...base, forms1099: async () => forms }, TZ);
  assertStringIncludes(r!, "the form is $257.59 SHORT");
  assertStringIncludes(r!, "the form is $35.83 MORE than you received");
  assertStringIncludes(r!, "No form on file from Kalshi: $39.90 in deposits");
});
