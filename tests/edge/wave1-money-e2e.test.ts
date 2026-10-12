// Wave 1 end-to-end proofs, fixtures only (two linked accounts, ~100 days of rows):
//   C1  "Where did my money go in September?" — feed tie: the answer's September total equals the sum of the posted
//       charges, which equals the sum of the per-category sums, which equals the sum of the merchant rows; garbled
//       descriptors (AMZN MKTP, APL*ITUNES, SQ *) are never shown raw — Amazon is named as the merchant.
//   C6  "How much am I spending on DoorDash, really?" — merchant-level totals across every card for trailing 30/90
//       days, trend versus the prior period, per-order average. Probed 2026-10-12: moneyKind returns null for this
//       exact ask (it goes to the model), so the numbers are proven against SpendingViews.merchantSpend — the domain
//       function the coordinator wires into money_answers.ts as a new "merchant" kind (see merchantAsk).
// Every expected number below is computed from the fixture specs in this file, never copied from a reply.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { moneyKind, moneyReply, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
// @ts-ignore: the generated bundle is plain JS
import { SpendingViews } from "../../supabase/functions/_shared/router_core.js";

const NOW = new Date("2026-10-12T15:05:00Z");
const ACCOUNTS: AccountRow[] = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 200000, available_cents: 200000, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: "2026-10-12T09:00:00Z", status: "active" },
  { account_id: "mock-cc", name: "Mock Rewards Card", institution: "Mock Card Co", account_kind: "credit", balance_cents: -30000, available_cents: null, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: "2026-10-12T09:00:00Z", status: "active" },
];
// One row per spec: [posted_on, amount_cents, merchant_raw, account, my own category label for the tie-out].
type Spec = [string, number, string, string, string];
const SPECS: Spec[] = [
  ["2026-07-05", -7000, "TRADER JOE S #552", "mock-chk", "groceries"],
  ["2026-07-08", -5000, "DOORDASH *ORDER", "mock-chk", "delivery"],
  ["2026-07-20", -4500, "DOORDASH *ORDER", "mock-cc", "delivery"],
  ["2026-08-04", -8000, "TRADER JOE S #552", "mock-chk", "groceries"],
  ["2026-08-20", -2000, "DOORDASH *ORDER", "mock-chk", "delivery"],
  ["2026-08-27", -2000, "DOORDASH *ORDER", "mock-cc", "delivery"],
  ["2026-09-02", -5410, "AMZN MKTP*2A US", "mock-cc", "shopping"],
  ["2026-09-03", -9000, "TRADER JOE S #552", "mock-chk", "groceries"],
  ["2026-09-05", -1599, "APL*ITUNES", "mock-chk", "uncategorized"],
  ["2026-09-05", -3000, "DOORDASH *ORDER", "mock-chk", "delivery"],
  ["2026-09-09", -4830, "AMZN MKTP*2B US", "mock-cc", "shopping"],
  ["2026-09-12", -2450, "SQ *ALLEY", "mock-chk", "uncategorized"],
  ["2026-09-17", -11000, "TRADER JOE S #552", "mock-chk", "groceries"],
  ["2026-09-18", -6725, "AMZN MKTP*2C US", "mock-chk", "shopping"],
  ["2026-09-20", -3200, "DOORDASH *ORDER", "mock-chk", "delivery"],
  ["2026-09-25", -4275, "AMZN MKTP*2D US", "mock-cc", "shopping"],
  ["2026-09-28", -2800, "DOORDASH *ORDER", "mock-cc", "delivery"],
  ["2026-10-01", -185000, "MOCK PROPERTY MANAGEMENT RENT", "mock-chk", "housing"],
  ["2026-10-01", 250000, "MOCK EMPLOYER PAYROLL", "mock-chk", "income"],
  ["2026-10-05", -3600, "DOORDASH *ORDER", "mock-chk", "delivery"],
  ["2026-10-11", -2400, "DOORDASH *ORDER", "mock-cc", "delivery"],
];
let n = 0;
const tx = (posted_on: string | null, amount_cents: number, merchant_raw: string, account_id: string, o: Partial<MoneyTxRow> = {}): MoneyTxRow =>
  ({ account_id, provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, fetched_at: "2026-10-12T08:00:00Z", ...o });
const TX: MoneyTxRow[] = SPECS.map(([d, c, m, a]) => tx(d, c, m, a));
// Never counted: a pending DoorDash charge and an internal transfer.
TX.push(tx(null, -9999, "DOORDASH *ORDER", "mock-cc", { is_pending: true }));
TX.push(tx("2026-10-03", -50000, "ONLINE TRANSFER TO SAV 9921", "mock-chk", { is_transfer: true }));
const read = { accounts: async () => ACCOUNTS, transactions: async () => TX };

const centsOf = (s: string) => Math.round(parseFloat(s.replace(/[$,]/g, "")) * 100);
const DAY = 86400000;
const addDays = (ymd: string, k: number) => new Date(Date.parse(ymd + "T00:00:00Z") + k * DAY).toISOString().slice(0, 10);
// Posted charges only (negative, the spec rows): what "spending" may add up.
const charges = SPECS.filter(([, c]) => c < 0);
const sum = (rows: Spec[]) => rows.reduce((a, [, c]) => a - c, 0);

Deno.test("C1: September ties out — total = category sums = merchant sums = posted charges; Amazon named, raw descriptor never shown; source + as-of", async () => {
  assertEquals(moneyKind("Where did my money go in September?"), "spend");
  const r = (await moneyReply("Where did my money go in September?", NOW, read))!;
  const sept = charges.filter(([d]) => d.startsWith("2026-09"));
  const total = sum(sept);
  const m = r.match(/^You spent \$([\d,]+\.\d{2}) in September \(Sep 1-30\)\./);
  assert(m, r);
  assertEquals(centsOf(m[1]), total, "the answer's September total is the sum of the posted September charges");
  // Category tie: my own labels on the fixture rows; their sums add back to the same total.
  const byCat = new Map<string, number>();
  for (const s of sept) byCat.set(s[4], (byCat.get(s[4]) || 0) - s[1]);
  assertEquals([...byCat.values()].reduce((a, b) => a + b, 0), total, "category sums tie to the total");
  assertEquals(byCat.get("shopping"), sum(sept.filter(([, , raw]) => raw.startsWith("AMZN"))), "shopping is exactly the Amazon rows");
  // Merchant tie: the Top line's merchant sums are the sums of that merchant's rows.
  const top = r.match(/^Top: (.+)\.$/m);
  assert(top, r);
  const topBy = new Map([...top[1].matchAll(/([\p{L}'& ]+?) \$([\d,]+\.\d{2})/gu)].map((x) => [x[1].trim(), centsOf(x[2])]));
  assertEquals(topBy.get("Amazon"), sum(sept.filter(([, , raw]) => raw.startsWith("AMZN"))), "Amazon = the 4 AMZN MKTP rows");
  assertEquals(sept.filter(([, , raw]) => raw.startsWith("AMZN")).length, 4);
  assertEquals(topBy.get("Trader Joe's"), sum(sept.filter(([, , raw]) => raw.startsWith("TRADER JOE"))));
  assertEquals(topBy.get("DoorDash"), sum(sept.filter(([, , raw]) => raw.startsWith("DOORDASH"))));
  // The garbled descriptors are never presented as merchant names; the real merchant is.
  assert(!r.includes("AMZN MKTP"), r);
  assert(!r.includes("APL*ITUNES"), r);
  assert(!r.includes("SQ *ALLEY"), r);
  assert(r.includes("Amazon"), r);
  // The two garbled rows are still counted, in the tie: they are the fixture's uncategorized bucket.
  assertEquals(byCat.get("uncategorized"), sum(sept.filter(([, , raw]) => raw.startsWith("APL") || raw.startsWith("SQ"))));
  // August comparison in the answer is the sum of the posted August charges.
  const aug = sum(charges.filter(([d]) => d.startsWith("2026-08")));
  const cmp = r.match(/That's \$([\d,]+\.\d{2}) more than in August, when it was \$([\d,]+\.\d{2})\./);
  assert(cmp, r);
  assertEquals(centsOf(cmp[2]), aug);
  assertEquals(centsOf(cmp[1]), total - aug);
  // Source + as-of.
  assertMatch(r, /From your linked accounts, transactions through Oct 11, 2026, as of Oct 12, 8:00 AM UTC\./);
});

Deno.test("C6 routing: the exact DoorDash ask is a money kind and moneyReply answers it end to end", async () => {
  // Was a probe (2026-10-12: the ask routed to no money kind and fell to the model); the coordinator's routing in
  // money_answers.ts (merchantAsk -> kind "merchant" -> merchantSpend) is what this now pins.
  assertEquals(moneyKind("how much am I spending on DoorDash, really?"), "merchant");
  const r = await moneyReply("how much am I spending on DoorDash, really?", NOW, read);
  assert(r, "moneyReply answers the merchant ask");
  assertMatch(r!, /^DoorDash: \$120\.00 in the last 30 days/);
  assertMatch(r!, /Last 90 days/);
  assertEquals(SpendingViews.merchantAsk("how much am I spending on DoorDash, really?"), "doordash");
  assertEquals(SpendingViews.merchantAsk("how much am i spending on food"), null, "a category ask is not a merchant ask");
  assertEquals(SpendingViews.merchantAsk("how do i cut my doordash spending"), null, "advice goes on");
});

Deno.test("C6: merchantSpend — DoorDash trailing 30/90 across both accounts, prior-period trend in dollars, per-order average", () => {
  const today = "2026-10-12";
  const dd = charges.filter(([, , raw]) => raw.startsWith("DOORDASH"));
  const win = (days: number, end: string) => {
    const from = addDays(end, -(days - 1)), rows = dd.filter(([d]) => d >= from && d <= end);
    return { from, total: sum(rows), count: rows.length };
  };
  const t30 = win(30, today), p30 = win(30, addDays(t30.from, -1)), t90 = win(90, today);
  assert(t30.count >= 4 && dd.some(([, , , a]) => a === "mock-cc") && t30.total > sum(dd.filter(([d, , , a]) => d >= t30.from && a === "mock-chk")), "the trailing-30 total needs both accounts");
  const r: string = SpendingViews.merchantSpend(TX, "how much am I spending on DoorDash, really?", NOW, { tz: "UTC" });
  assert(r, "merchantSpend answers the ask");
  const first = r.match(/^DoorDash: \$([\d,]+\.\d{2}) in the last 30 days \((.+)\), (\d+) orders?, \$([\d,]+\.\d{2}) an order on average, across all your linked accounts\./);
  assert(first, r);
  assertEquals(centsOf(first[1]), t30.total, "trailing-30 DoorDash total across every card");
  assertEquals(+first[3], t30.count, "trailing-30 order count");
  assertEquals(centsOf(first[4]), Math.round(t30.total / t30.count), "per-order average, trailing 30");
  const trend = r.match(/That's \$([\d,]+\.\d{2}) (more|less) than the 30 days before \((.+)\), when it was \$([\d,]+\.\d{2}) \((\d+) orders?\)\./);
  assert(trend, r);
  assertEquals(centsOf(trend[4]), p30.total, "prior-30 DoorDash total");
  assertEquals(centsOf(trend[1]), Math.abs(t30.total - p30.total), "trend dollars");
  assertEquals(trend[2], t30.total > p30.total ? "more" : "less", "trend direction");
  assertEquals(+trend[5], p30.count);
  const w90 = r.match(/^Last 90 days \((.+)\): \$([\d,]+\.\d{2}), (\d+) orders?, \$([\d,]+\.\d{2}) an order on average\./m);
  assert(w90, r);
  assertEquals(centsOf(w90[2]), t90.total, "trailing-90 DoorDash total");
  assertEquals(+w90[3], t90.count);
  assertEquals(centsOf(w90[4]), Math.round(t90.total / t90.count), "per-order average, trailing 90");
  const p90 = win(90, addDays(t90.from, -1));
  const trend90 = r.match(/That's \$([\d,]+\.\d{2}) (more|less) than the 90 days before \((.+)\), when it was \$([\d,]+\.\d{2}) \((\d+) orders?\)\./);
  assert(trend90, r);
  assertEquals(centsOf(trend90[4]), p90.total, "prior-90 DoorDash total");
  assertEquals(centsOf(trend90[1]), Math.abs(t90.total - p90.total), "trend dollars, 90 days");
  assertEquals(trend90[2], t90.total > p90.total ? "more" : "less", "trend direction, 90 days");
  assertEquals(+trend90[5], p90.count);
  assertMatch(r, /Your linked transactions start Jul 5, 2026, so that earlier total may be missing a few days\./);
  // The pending DoorDash charge ($99.99) is disclosed as pending; the exact totals above prove it is not added in.
  assertMatch(r, /Pending, not added yet: \$99\.99 \(1 charge\)\./);
  assertMatch(r, /From your linked accounts, transactions through Oct 11, 2026, as of Oct 12, 8:00 AM UTC\./);
});
