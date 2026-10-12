// The numbers in chat (agent-chat/_shared/money_answers.ts over packages/domain/86-the-numbers.js through the router
// bundle): which messages fire, which go on to the flows and the model, what each reads, and that every answer ends
// with its source and as-of time. Accounts and transactions here are MOCK fixtures.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { moneyKind, moneyReply, MONEY_UNAVAILABLE, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";

const NOW = new Date("2026-10-12T15:05:00Z");
const SYNC = "2026-10-12T08:00:00Z";
const ACCOUNTS: AccountRow[] = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 400000, available_cents: 400000, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: SYNC, status: "active" },
  { account_id: "mock-card", name: "Rewards Card", institution: "Mock Bank", account_kind: "credit", balance_cents: -51230, available_cents: null, balance_as_of: "2026-10-12T09:00:00Z", fetched_at: SYNC, status: "active" },
];
let n = 0;
const tx = (posted_on: string | null, amount_cents: number, merchant_raw: string, is_pending = false): MoneyTxRow =>
  ({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending, is_transfer: false, fetched_at: SYNC });
const TX: MoneyTxRow[] = [
  ...["2026-08-21", "2026-09-04", "2026-09-18", "2026-10-02"].map((d) => tx(d, 250000, "MOCK EMPLOYER PAYROLL")),
  ...["2026-08-01", "2026-09-01", "2026-10-01"].map((d) => tx(d, -185000, "MOCK PROPERTY MGMT RENT")),
  ...["2026-08-14", "2026-09-14"].map((d) => tx(d, -4500, "MOCK FITNESS CLUB")),
  ...["2026-08-05", "2026-09-05", "2026-10-05"].map((d) => tx(d, -1799, "NETFLIX.COM")),
  tx("2026-09-02", -6000, "TRADER JOE S #552"), tx("2026-09-17", -7500, "TRADER JOE S #552"), tx("2026-10-03", -5500, "TRADER JOE S #552"),
];
type Msg = { role: string; content: string };
function readers(accounts: AccountRow[] = ACCOUNTS, transactions: MoneyTxRow[] = TX, previous: Msg[] = []) {
  const calls = { accounts: 0, transactions: 0, previous: 0 };
  return { calls, read: {
    accounts: async () => { calls.accounts++; return accounts; },
    transactions: async () => { calls.transactions++; return transactions; },
    previous: async () => { calls.previous++; return previous; },
  } };
}
const SOURCE = /\nFrom your linked accounts\b[^\n]*\.$/;

Deno.test("routing: the numbers fire, in the person's own words", () => {
  const cases: [string, string][] = [
    ["how much can i spend", "safe"], ["How much can I spend until payday?", "safe"], ["safe to spend", "safe"], ["what's my safe to spend", "safe"],
    ["how much money can i spend this week", "safe"], ["what can i spend", "safe"],
    ["what bills are coming up", "upcoming"], ["what bills are due this month", "upcoming"], ["upcoming bills", "upcoming"], ["show me my upcoming payments", "upcoming"],
    ["how long will my money last", "runway"], ["how long will my savings last if i lost my job", "runway"], ["what's my runway", "runway"], ["runway", "runway"],
    ["can i afford a $600 trip next month", "afford"], ["can i afford $50", "afford"], ["could i afford a $1,200 laptop by dec 1", "afford"],
    ["what's my net worth", "networth"], ["net worth", "networth"], ["how much am i worth", "networth"], ["calculate my net worth", "networth"],
    ["forecast", "forecast"], ["show me my cash flow forecast", "forecast"], ["90 day forecast", "forecast"], ["what will my balance be in 90 days", "forecast"],
    ["show me the math on my safe to spend", "math"], ["show me the math for net worth", "math"],
    ["show me the math", "explain"], ["how did you get that number", "explain"], ["walk me through the math", "explain"], ["show your work", "explain"],
  ];
  for (const [m, k] of cases) assertEquals(moneyKind(m), k, m);
});

Deno.test("routing: near misses go on to the flows and the model", () => {
  for (const m of [
    "how much should i spend on rent", "how much can i spend on groceries", "can i afford a house", "can i afford $500 a month", "can i afford to invest $500",
    "should i buy a $600 trip", "can i afford it", "what is net worth", "what's the weather forecast", "what's the forecast", "how long will it take to pay off my card",
    "what bills should i cut", "show me the money", "help me budget", "how do i build runway", "is it safe to spend $50 on a crypto coin", "can i afford a $40 bet on the game",
    "what's a good net worth for my age", "pay my rent", "send sam 40", "connect my chase", "find me money", "cancel netflix",
  ]) assertEquals(moneyKind(m), null, m);
});

Deno.test("the four existing asks keep their place", () => {
  assertEquals(moneyKind("what's my balance"), "balance");
  assertEquals(moneyKind("how much did i spend on food last month"), "spend");
  assertEquals(moneyKind("how am i doing"), "checkup");
  assertEquals(moneyKind("did rent go through"), "through");
});

Deno.test("safe to spend: from the person's rows, a total and per day, payday from deposits, source last", async () => {
  const { calls, read } = readers();
  const r = (await moneyReply("how much can i spend", NOW, read))!;
  // $4,000.00 cash; the gym on Oct 14 is due before the Oct 16 payday.
  assertMatch(r, /^Safe to spend until payday \(Oct 16\): \$3,955\.00, about \$988\.75 a day for 4 days\./);
  assertMatch(r, SOURCE);
  assert(!r.includes("?"));
  assertEquals(calls, { accounts: 1, transactions: 1, previous: 0 });
});

Deno.test("upcoming, runway, afford and forecast read accounts and transactions; net worth reads accounts only", async () => {
  const up = (await moneyReply("what bills are coming up", NOW, readers().read))!;
  assertMatch(up, /^Coming up in the next 30 days \(Oct 12-Nov 11\): /);
  assertMatch(up, /- Oct 16: payday, \$2,500\.00 from Mock Employer Payroll \(every 14 days\)/);
  assertMatch(up, SOURCE);
  const run = (await moneyReply("how long will my money last", NOW, readers().read))!;
  assertMatch(run, /^Runway: about \d+ days\./);
  assertMatch(run, SOURCE);
  const aff = (await moneyReply("can i afford a $600 trip next month", NOW, readers().read))!;
  assertMatch(aff, /^For \$600\.00 next month \(Nov 1-30\): yes, from Nov 1\./);
  assertMatch(aff, SOURCE);
  const fc = (await moneyReply("forecast", NOW, readers().read))!;
  assertMatch(fc, /^90-day forecast, from your repeating bills and paychecks only: /);
  assertMatch(fc, /\nAssumptions:\n/);
  const nw = readers();
  const worth = (await moneyReply("what's my net worth", NOW, nw.read))!;
  assertMatch(worth, /^Net worth: \$3,487\.70\. That's \$4,000\.00 you own minus \$512\.30 you owe, across 2 accounts\./);
  assertMatch(worth, SOURCE);
  assertEquals(nw.calls, { accounts: 1, transactions: 0, previous: 0 });
});

Deno.test("show me the math explains the last answer in the thread, line by line", async () => {
  const safe = (await moneyReply("how much can i spend", NOW, readers().read))!;
  const m = readers(ACCOUNTS, TX, [{ role: "assistant", content: safe }, { role: "user", content: "how much can i spend" }]);
  const math = (await moneyReply("show me the math", NOW, m.read))!;
  assertMatch(math, /^The math for safe to spend:\nCash now: \$4,000\.00\n/);
  assertMatch(math, /\$4,000\.00 - \$45\.00 = \$3,955\.00\n\$3,955\.00 \/ 4 days = \$988\.75 a day/);
  assertMatch(math, SOURCE);
  assertEquals(m.calls.previous, 1);
  const aff = readers(ACCOUNTS, TX, [{ role: "assistant", content: "For $600.00 next month (Nov 1-30): yes, from Nov 1." }, { role: "user", content: "can i afford a $600 trip next month" }]);
  assertMatch((await moneyReply("how did you get that", NOW, aff.read))!, /^The math for affordability:\nAmount: \$600\.00; window: next month \(Nov 1-30\)/);
  const named = (await moneyReply("show me the math on my net worth", NOW, readers().read))!;
  assertMatch(named, /^The math for net worth:\nOwned: \$4,000\.00 = \$4,000\.00\nOwed: \$512\.30 = \$512\.30\n\$4,000\.00 - \$512\.30 = \$3,487\.70/);
  // After another kind of answer (the model's own arithmetic, a balance), or with no readable history, it is not ours:
  // null, and the model explains.
  assertEquals(await moneyReply("show me the math", NOW, readers(ACCOUNTS, TX, [{ role: "assistant", content: "You have $4,000.00 in cash." }]).read), null);
  assertEquals(await moneyReply("how did you get that", NOW, readers(ACCOUNTS, TX, [{ role: "assistant", content: "5% of $200 is $10." }]).read), null);
  const broken = { accounts: async () => ACCOUNTS, transactions: async () => TX, previous: async (): Promise<Msg[]> => { throw new Error("db down"); } };
  assertEquals(await moneyReply("show me the math", NOW, broken), null);
});

Deno.test("handler wiring: the thread's last messages are read for the math; a bare math ask never gets the nothing-linked line", () => {
  const src = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
  // One shared thread reader (also used by "what's new"), passed as previous().
  assert(src.includes('const readPrevious = async () => { const h = await supabase.from("agent_messages").select("role,content").eq("thread_id", tid)') && src.includes("previous: readPrevious,"), "previous() reads this thread through the RLS client");
  assert(src.includes('linkedCount === 0 && moneyKind(message) && moneyKind(message) !== "explain" ? NO_ACCOUNTS : null'), "bare 'show me the math' goes on to the model when nothing is linked");
});

Deno.test("nothing linked returns null (the nothing-linked line answers); a failed read is said, never guessed", async () => {
  for (const m of ["how much can i spend", "what bills are coming up", "how long will my money last", "can i afford $50", "what's my net worth", "forecast", "show me the math"]) {
    const none = readers([], []);
    assertEquals(await moneyReply(m, NOW, none.read), null, m);
    assertEquals(none.calls.transactions, 0, m);
  }
  const brokenTx = { accounts: async () => ACCOUNTS, transactions: async (): Promise<MoneyTxRow[]> => { throw new Error("db down"); } };
  assertEquals(await moneyReply("how much can i spend", NOW, brokenTx), MONEY_UNAVAILABLE);
  const brokenAcc = { accounts: async (): Promise<AccountRow[]> => { throw new Error("db down"); }, transactions: async () => TX };
  assertEquals(await moneyReply("what's my net worth", NOW, brokenAcc), MONEY_UNAVAILABLE);
});

Deno.test("other currencies are never added into dollars; a stale balance is said", async () => {
  const accts: AccountRow[] = [{ ...ACCOUNTS[0], balance_as_of: "2026-10-10T09:00:00Z" }, { ...ACCOUNTS[0], account_id: "mock-eur", name: "Euro Account", currency: "EUR", balance_cents: 100000 }];
  const r = (await moneyReply("safe to spend", NOW, readers(accts).read))!;
  assertMatch(r, /^Safe to spend until payday \(Oct 16\): \$3,955\.00/);
  assertMatch(r, /Euro Account \(1,000\.00 EUR\) is in another currency, so it isn't added into dollars\./);
  assertMatch(r, /Heads up: Mock Bank Everyday Checking was last updated Oct 10, 9:00 AM UTC, 2 days ago/);
});
