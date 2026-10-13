// Bank-action packets through the production bundle (agent-chat/_shared/bank_actions_answer.ts over
// router_core's BankActions). Fixtures are MOCK except the fee rows, which are the owner's real rows as
// twinned in tests/phase2-real-feed.test.cjs (three $25.00 MONTHLY SERVICE FEE rows). Expected dollars
// were computed by hand first (see tests/bank-actions.test.cjs for the full parity suite).
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { feePacketText, disputeCaseText, bonusText, retentionText, aprText, closureText } from "../../supabase/functions/agent-chat/_shared/bank_actions_answer.ts";

let n = 0;
const rtx = (posted_on: string, amount_cents: number, merchant_raw: string, o: any = {}) => Object.assign({ account_id: "chk", provider_transaction_id: "sf-" + (++n), fact_hash: "h" + n, currency: "USD", presence: "observed", amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false }, o);
const TODAY = "2026-10-12";

Deno.test("C79 through the bundle: the real $75.00 of service fees becomes one packet with the courtesy draft", () => {
  const fees = [rtx("2026-07-20", -2500, "MONTHLY SERVICE FEE"), rtx("2026-08-20", -2500, "MONTHLY SERVICE FEE"), rtx("2026-09-21", -2500, "MONTHLY SERVICE FEE")];
  const text = feePacketText(fees, TODAY, "Chase", "From your linked accounts, as of 2026-09-21.")!;
  assertMatch(text, /3 bank fees totaling \$75\.00/);
  assertMatch(text, /requesting a courtesy refund from Chase/);
});

Deno.test("C77 through the bundle: a case id, both deadlines, and the pre-filled draft", () => {
  const charge = rtx("2026-09-16", -30240, "PEPTIRA 402-5550199 NE 09/15");
  const text = disputeCaseText(charge, { today: TODAY, statement_close_on: "2026-09-30", source: "From your linked accounts, as of 2026-09-16.", unauthorized: true });
  assertMatch(text, /Dispute case DSP-[0-9A-F]{8} opened/);
  assertMatch(text, /by Oct 22, 2026/);
  assertMatch(text, /by Nov 29, 2026/);
  assertMatch(text, /\$302\.40/);
});

Deno.test("C96/C99/C168/C199 through the bundle: the four packets carry their hand-computed dollars", () => {
  const pay = ["2026-07-02", "2026-08-02", "2026-09-02", "2026-10-02"].map((d) => rtx(d, 220000, "ACME CORP PAYROLL DIR DEP"));
  const offers = [{ id: "a", bank: "Example Bank One", bonus_cents: 40000, checked_on: "2026-10-06", source: { title: "Example Bank offer page (stand-in offer data)", url: "https://example.com/offers" }, requirements: [{ kind: "dd_total", amount_cents: 200000, within_days: 90 }] }];
  assertMatch(bonusText(offers, pay, TODAY, "src"), /projects \$6,387\.10 in that window: met/);
  const cardTx = [rtx("2026-09-15", -9500, "ANNUAL FEE", { account_id: "card-1" }), rtx("2026-03-01", 2500, "STATEMENT CREDIT", { account_id: "card-1" }), rtx("2026-06-01", 1500, "STATEMENT CREDIT", { account_id: "card-1" })];
  assertMatch(retentionText({ account_id: "card-1", account_name: "Chase Sapphire Preferred", issuer: "Chase", transactions: cardTx, today: TODAY }), /\$55\.00 behind|fee is \$55\.00 more/);
  assertMatch(aprText({ card_name: "Chase Sapphire Preferred", issuer: "Chase", balance_cents: 480000, apr_bps: 2699 }), /\$240\.00 a year saved/);
  const accts = [
    { id: "co1", name: "Capital One Quicksilver", type: "credit_card", balance_cents: 0, limit_cents: 300000, opened_on: "2019-03-01", status: "open" },
    { id: "cs1", name: "Chase Sapphire Preferred", type: "credit_card", balance_cents: 120000, limit_cents: 700000, opened_on: "2022-06-01", status: "open" },
  ];
  assertMatch(closureText({ accounts: accts, target_id: "co1", issuer: "Capital One", transactions: [], today: TODAY }), /5\.14 points higher/);
  assertEquals(1, 1);
});
