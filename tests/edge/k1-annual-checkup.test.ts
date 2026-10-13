// C201 annual money checkup (K1, 2026-10-12, built this run): one composed report over twins of the owner's
// REAL Chase rows. Hand oracles: cash $413.29 (+ $0.00 investment account); fees $75.00 across 3 charges;
// recurring run-rate $91.44/mo = $1,097.28/yr (Affirm $61.44, service fee $25.00, Robinhood $5.00);
// 2026 in $3,852.18, out $3,439.73, net $412.45 (feed starts Jul 16, so net need not equal the balance).
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { annualCheckupReply, isAnnualCheckupAsk } from "../../supabase/functions/agent-chat/_shared/annual_checkup_answer.ts";
import { moneyKind } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { K1_ACCOUNTS, K1_TX } from "./k1-fixtures.ts";

const NOW = new Date("2026-10-12T20:05:00Z");
const TZ = { tz: "America/Chicago" };
const read = { accounts: async () => K1_ACCOUNTS, transactions: async () => K1_TX };

Deno.test("C201 routing: the checkup asks route to the checkup; the year in money keeps its own", () => {
  assert(isAnnualCheckupAsk("Run my annual money checkup"));
  assert(isAnnualCheckupAsk("Re-underwrite my entire financial life"));
  assert(!isAnnualCheckupAsk("my year in money"));
  assert(moneyKind("annual money checkup") !== "year");
});

Deno.test("C201: every section ties to the hand count, with dollars at stake named", async () => {
  const r = await annualCheckupReply("Run my annual money checkup", NOW, read, TZ);
  assertStringIncludes(r!, "Chase PREMIER PLUS CKG (2963) (checking): $413.29");
  assertStringIncludes(r!, "Cash across checking and savings: $413.29.");
  assertStringIncludes(r!, "Fees (last 12 months): $75.00 across 3 charges.");
  assertStringIncludes(r!, "Affirm: $61.44 monthly — $61.44 a month, $737.28 a year");
  assertStringIncludes(r!, "Monthly Service Fee: $25.00 monthly — $25.00 a month, $300.00 a year");
  assertStringIncludes(r!, "Robinhood: $5.00 monthly — $5.00 a month, $60.00 a year");
  assertStringIncludes(r!, "Recurring run-rate: $91.44 a month, $1,097.28 a year.");
  assertStringIncludes(r!, "2026 so far: $3,852.18 in, $3,439.73 out, net $412.45.");
  assertStringIncludes(r!, "interest received in 2026: $0.00");
  assert(!/Unknown Merchant/.test(r!), r!);
});
