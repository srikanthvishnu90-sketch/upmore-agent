// Wave 1 NUMBERS end-to-end through chat (agent-chat/_shared/money_answers.ts -> TheNumbers in the router bundle):
//   C3  "how much can i spend" — the reply subtracts the person's buffer (their settings row, read through the
//       optional settings reader) and scheduled transfers due before payday (the optional scheduledTransfers reader).
//   C4  "forecast" — a projection below zero carries the specific fix (delay a named bill by exact days).
//   C9  "can i afford a $1,200 couch" — the reply states goal impact from the person's savings-goal watches
//       (the settings reader's watches), old date -> new date and the slip.
// All rows are MOCK fixtures. Check: deno test -A --no-check tests/edge/wave1-numbers-e2e.test.ts
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { moneyKind, moneyReply, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";

const NOW = new Date("2026-10-12T15:05:00Z");
const SYNC = "2026-10-12T08:00:00Z";
const ACCOUNTS: AccountRow[] = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 400000, available_cents: 400000, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: SYNC, status: "active" },
  { account_id: "mock-sav", name: "High Yield Savings", institution: "Mock Bank", account_kind: "savings", balance_cents: 200000, available_cents: 200000, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: SYNC, status: "active" },
];
let n = 0;
const tx = (posted_on: string, amount_cents: number, merchant_raw: string): MoneyTxRow =>
  ({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, fetched_at: SYNC });
const PAYDAYS = ["2026-08-21", "2026-09-04", "2026-09-18", "2026-10-02"];
const TX: MoneyTxRow[] = [
  ...PAYDAYS.map((d) => tx(d, 250000, "MOCK EMPLOYER PAYROLL")),
  ...["2026-08-01", "2026-09-01", "2026-10-01"].map((d) => tx(d, -185000, "MOCK PROPERTY MGMT RENT")),
  ...["2026-08-14", "2026-09-14"].map((d) => tx(d, -4500, "MOCK FITNESS CLUB")),
];
const baseRead = { accounts: async () => ACCOUNTS, transactions: async () => TX };

Deno.test("C3 e2e: safe to spend in chat subtracts the settings buffer and scheduled transfers due by payday", async () => {
  assertEquals(moneyKind("how much can i spend"), "safe");
  // Baseline on these rows: cash $6,000.00, only the $45.00 gym bill is due before the Oct 16 payday -> $5,955.00.
  const plain = (await moneyReply("how much can i spend", NOW, baseRead))!;
  assertMatch(plain, /^Safe to spend until payday \(Oct 16\): \$5,955\.00/);
  const read = {
    ...baseRead,
    settings: async () => ({ buffer_cents: 10000 }),
    scheduledTransfers: async () => [{ on: "2026-10-15", amount_cents: 20000, name: "Transfer to brokerage" }, { on: "2026-10-20", amount_cents: 99900, name: "After payday" }],
  };
  const r = (await moneyReply("how much can i spend", NOW, read))!;
  // $6,000.00 - $45.00 bills - $200.00 scheduled (Oct 15 only; Oct 20 is after payday) - $100.00 buffer = $5,655.00.
  assertMatch(r, /^Safe to spend until payday \(Oct 16\): \$5,655\.00, about \$1,413\.75 a day for 4 days\./);
  assertMatch(r, /minus \$200\.00 of scheduled transfers due by then: Transfer to brokerage \$200\.00 \(Oct 15\)/);
  assertMatch(r, /minus your \$100\.00 buffer/);
  assertMatch(r, /\nFrom your linked accounts\b/);
});

Deno.test("C4 e2e: forecast in chat offers the specific delay fix when the projection goes below zero", async () => {
  const accts: AccountRow[] = [{ ...ACCOUNTS[0], balance_cents: 200000, available_cents: 200000 }];
  const rows: MoneyTxRow[] = [
    ...["2026-07-10", "2026-07-24", "2026-08-07", "2026-08-21", "2026-09-04", "2026-09-18", "2026-10-02"].map((d) => tx(d, 250000, "MOCK EMPLOYER PAYROLL")),
    ...["2026-07-15", "2026-08-15", "2026-09-15"].map((d) => tx(d, -300000, "MOCK TUITION")),
  ];
  const r = (await moneyReply("forecast", NOW, { accounts: async () => accts, transactions: async () => rows }))!;
  assertMatch(r, /Lowest: -\$1,000\.00 on Oct 15, below zero\./);
  assertMatch(r, /Fix: delay Mock Tuition \(\$3,000\.00\) by 1 day, from Oct 15 to Oct 16\. With that change the lowest point is \$1,500\.00 on Oct 16, at or above zero\./);
});

Deno.test("C9 e2e: afford in chat states goal impact from the person's savings-goal watches", async () => {
  assertEquals(moneyKind("can i afford a $1,200 couch"), "afford");
  // The stored goal: $3,000 vacation by Jun 30, 2027 in High Yield Savings (balance $2,000.00 on these rows):
  // $1,000.00 to go over 8 months -> $125.00/month derived; re-saving $1,200.00 takes 10 monthly steps.
  const read = { ...baseRead, settings: async () => ({ buffer_cents: null, watches: [{ kind: "savings_goal", name: "vacation", target_cents: 300000, by: "2027-06-30", account: "High Yield Savings" }] }) };
  const r = (await moneyReply("can i afford a $1,200 couch", NOW, read))!;
  assertMatch(r, /^For \$1,200\.00 today: yes\./);
  assertMatch(r, /Goal impact: buying this delays your vacation goal — it would finish Apr 30, 2028 instead of Jun 30, 2027, 10 months later\./);
  assertMatch(r, /re-save \$1,200\.00 at \$125\.00 a month/);
  // With no goal anywhere, the answer still states the goal clause plainly instead of omitting it.
  const r2 = (await moneyReply("can i afford a $1,200 couch", NOW, baseRead))!;
  assertMatch(r2, /Goal impact: none stated — no savings goals were supplied/);
  assert(!/delays your/.test(r2));
});
