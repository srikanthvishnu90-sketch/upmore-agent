// Wave 1 PROACTIVE COMPOSITION: C2 daily money briefing, C14 weekly recap, C28 bill due-date reminders, end to end
// through plan() (supabase/functions/_shared/proactive.ts) and the feed (packages/domain/56-agent-proactive.js).
// Fixture rows only, in the database's own shapes, in the style of tests/edge/creep-radar.test.ts. MOCK rows.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows, NOW } from "./lib/proactive_fixture.ts";

const DAY = 86400000;
const row = (on: string, cents: number, merchant: string, id: string, more: any = {}) => Object.assign({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" }, more);
const SAV = { account_id: "sav-1", name: "High Yield Savings", institution: "First Bank", currency: "USD", account_kind: "savings", balance_cents: 128000, available_cents: 128000, balance_as_of: "2026-10-11T13:30:00Z", fetched_at: "2026-10-11T13:30:00Z", sync_error: false, status: "active" };
const sentOf = (p: any, at: number) => p.messages.map((m: any) => ({ key: m.key, sent_at: at, cadence: m.cadence }));

// ---------- C2: the daily brief carries yesterday's spend, a new recurring charge, per-account balances,
// bills due in the next 7 days, and an "anything unusual" line — all five in one delivered brief.
const C2_EXTRA = [
  row("2026-08-13", -8999, "COMCAST XFINITY", "c1"), row("2026-09-13", -8999, "COMCAST XFINITY", "c2"),
  row("2026-09-05", -1299, "HEADSPACE", "h1"), row("2026-10-05", -1299, "HEADSPACE", "h2"),
  row("2026-10-10", -4250, "TRADER JOE'S", "y1"), row("2026-10-10", -1575, "SHELL OIL", "y2"),
  row("2026-10-10", -9999, "BEST BUY 00123", "y3", { is_pending: true }),
  row("2026-10-10", 5000, "STORE REFUND", "y4"),
];
const c2Input = (sent: any[] = []) => ({ accounts: mapAccounts(accountRows().concat([SAV])), transactions: mapTransactions(txRows(C2_EXTRA)), settings: { morning_brief: true, weekly_recap_dow: null, time_zone: "America/New_York" }, sent });

Deno.test("C2 brief: yesterday's spend is the posted debits of 2026-10-10, total and count ($58.25 across 2 charges; the pending $99.99 and the $50.00 credit are not spend)", () => {
  const brief = plan(c2Input(), NOW).messages.find((m: any) => m.kind === "morning_brief");
  assert(brief, "a brief is delivered");
  assert(brief.text.includes("Yesterday you spent $58.25 across 2 charges."), brief.text);
});
Deno.test("C2 brief: a new recurring charge is named with its amount (Headspace $12.99, first charged 2026-09-05)", () => {
  const brief = plan(c2Input(), NOW).messages.find((m: any) => m.kind === "morning_brief")!;
  assert(/New recurring charge: Headspace \$12\.99/.test(brief.text), brief.text);
});
Deno.test("C2 brief: per-account balances list each account named with its balance", () => {
  const brief = plan(c2Input(), NOW).messages.find((m: any) => m.kind === "morning_brief")!;
  assert(brief.text.includes("Balances: Everyday Checking $412.00, High Yield Savings $1,280.00."), brief.text);
});
Deno.test("C2 brief: bills due in the next 7 days are named with dates and amounts, not only today's", () => {
  const brief = plan(c2Input(), NOW).messages.find((m: any) => m.kind === "morning_brief")!;
  assert(brief.text.includes("Bills due in the next 7 days:"), brief.text);
  assert(brief.text.includes("Comcast Xfinity $89.99 on 2026-10-13"), brief.text);
  assert(brief.text.includes("Oak Property Mgmt Rent $1,450.00 on 2026-10-15"), brief.text);
});
Deno.test("C2 brief: anything unusual names yesterday's first-time merchant charge; a quiet yesterday says nothing unusual, explicitly", () => {
  const brief = plan(c2Input(), NOW).messages.find((m: any) => m.kind === "morning_brief")!;
  assert(/Anything unusual: Trader Joe's charged \$42\.50 yesterday, the first charge from that merchant/.test(brief.text), brief.text);
  const monday = plan(c2Input(), NOW + DAY).messages.find((m: any) => m.kind === "morning_brief")!;
  assert(monday.text.includes("Yesterday you spent $0.00 across 0 charges."), monday.text);
  assert(monday.text.includes("Anything unusual: nothing unusual in yesterday's charges."), monday.text);
});
Deno.test("C2 brief: the pre-existing lines still lead (cash, safe to spend, due today, source + as-of)", () => {
  const brief = plan(c2Input(), NOW).messages.find((m: any) => m.kind === "morning_brief")!;
  assert(/^Good morning\. Cash: \$1,692\.00\. Safe to spend/.test(brief.text), brief.text);
  assert(/\(First Bank via SimpleFIN, as of Oct 11, 9:30 AM\)$/.test(brief.text), brief.text);
});

// ---------- C14: the weekly recap carries spend-vs-average by category, top merchants, the biggest single
// charge, and an explicit net cash-flow figure.
const C14_ROWS = [
  row("2026-10-09", 180000, "ACME CORP PAYROLL DIR DEP", "p1"),
  row("2026-09-06", -10000, "WHOLE FOODS MARKET", "g1"), row("2026-09-13", -10000, "WHOLE FOODS MARKET", "g2"),
  row("2026-09-20", -10000, "WHOLE FOODS MARKET", "g3"), row("2026-09-27", -10000, "WHOLE FOODS MARKET", "g4"),
  row("2026-10-04", -10000, "WHOLE FOODS MARKET", "g5"), row("2026-10-08", -5000, "WHOLE FOODS MARKET", "g6"),
  row("2026-09-09", -2500, "CHIPOTLE 1234", "d1"), row("2026-09-23", -2500, "CHIPOTLE 1234", "d2"),
  row("2026-10-06", -4000, "CHIPOTLE 1234", "d3"),
  row("2026-09-15", -8000, "AMZN MKTP", "s1"), row("2026-10-09", -12000, "AMZN MKTP", "s2"),
  row("2026-07-15", -145000, "OAK PROPERTY MGMT RENT", "r1"), row("2026-08-15", -145000, "OAK PROPERTY MGMT RENT", "r2"), row("2026-09-15", -145000, "OAK PROPERTY MGMT RENT", "r3"),
];
const c14 = () => plan({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(C14_ROWS), settings: { weekly_recap_dow: 0, time_zone: "America/New_York" }, sent: [] }, NOW).messages.find((m: any) => m.kind === "weekly_recap")!;

Deno.test("C14 recap: net cash flow is stated explicitly, signed (in $1,800.00 − out $310.00 = $1,490.00)", () => {
  const recap = c14();
  assert(recap, "a recap is delivered");
  assert(recap.text.includes("$1,800.00 in, $310.00 out"), recap.text);
  assert(recap.text.includes("Net cash flow: $1,490.00."), recap.text);
});
Deno.test("C14 recap: top merchants are named with amounts, not only categories", () => {
  const recap = c14();
  assert(recap.text.includes("Top merchants: Whole Foods $150.00, Amazon $120.00, Chipotle $40.00."), recap.text);
});
Deno.test("C14 recap: the biggest single charge is named with merchant, amount and date", () => {
  const recap = c14();
  assert(recap.text.includes("Biggest single charge: Amazon $120.00 on 2026-10-09."), recap.text);
});
Deno.test("C14 recap: spend versus the average week over the prior 4 weeks, per category, in dollars", () => {
  const recap = c14();
  assert(recap.text.includes("groceries $150.00 vs $100.00 average"), recap.text);
  assert(recap.text.includes("shopping $120.00 vs $20.00 average"), recap.text);
  assert(recap.text.includes("dining $40.00 vs $12.50 average"), recap.text);
});

// ---------- C28: a universal reminder 3 days ahead for every detected recurring bill, with the exact
// missed-payment consequence for its kind, once per bill per cycle, deduped against the C8 radar.
const billInput = (rows: any[], settings: any = {}) => ({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(rows), settings: { time_zone: "America/New_York", ...settings }, sent: [] as any[] });
const monthly = (merchant: string, cents: number, idp: string) => [row("2026-08-14", cents, merchant, idp + "1"), row("2026-09-14", cents, merchant, idp + "2")];
const billDue = (p: any) => p.messages.filter((m: any) => m.key.startsWith("finding:bill_due_3d:"));

Deno.test("C28 subscription: Netflix $17.99 due 2026-10-14 is reminded on 2026-10-11 (3 days ahead), and missing it stops Netflix", () => {
  const p = plan(billInput(monthly("NETFLIX.COM", -1799, "n")), NOW);
  const m = billDue(p);
  assertEquals(m.length, 1, JSON.stringify(p.messages.map((x: any) => x.key)));
  assert(m[0].text.includes("Netflix $17.99 is due in 3 days, on 2026-10-14."), m[0].text);
  assert(m[0].text.includes("If it's missed, Netflix stops until you pay."), m[0].text);
  assertEquals(m[0].capability_id, "ALRT-005");
});
Deno.test("C28 utility: Comcast $89.99 due in 3 days names a late fee and a possible service cut", () => {
  const m = billDue(plan(billInput(monthly("COMCAST XFINITY", -8999, "u")), NOW));
  assertEquals(m.length, 1);
  assert(m[0].text.includes("Comcast Xfinity $89.99 is due in 3 days, on 2026-10-14."), m[0].text);
  assert(/late fee/.test(m[0].text) && /service could be cut off/.test(m[0].text), m[0].text);
});
Deno.test("C28 credit card: a card bill due in 3 days names a late fee and a penalty APR", () => {
  const rows = [row("2026-07-14", -45000, "CHASE CARD PAYMENT", "k1"), row("2026-08-14", -45000, "CHASE CARD PAYMENT", "k2"), row("2026-09-14", -45000, "CHASE CARD PAYMENT", "k3")];
  const m = billDue(plan(billInput(rows), NOW));
  assertEquals(m.length, 1, "the card bill is reminded");
  assert(/late fee and a penalty APR/.test(m[0].text), m[0].text);
});
Deno.test("C28 generic bill: a tuition bill due in 3 days names a late fee and nothing invented beyond it", () => {
  const m = billDue(plan(billInput(monthly("SPRINGFIELD TUITION", -30000, "t")), NOW));
  assertEquals(m.length, 1);
  assert(m[0].text.includes("Springfield Tuition $300.00 is due in 3 days, on 2026-10-14."), m[0].text);
  assert(/late fee/.test(m[0].text) && !/penalty APR|cut off|stops until/.test(m[0].text), m[0].text);
});
Deno.test("C28 timing and once-only: not 4 days ahead, not 2 days ahead, and never twice for the same cycle", () => {
  const rows = monthly("NETFLIX.COM", -1799, "n");
  assertEquals(billDue(plan(billInput(rows), NOW - DAY)).length, 0, "4 days ahead is too early");
  assertEquals(billDue(plan(billInput(rows), NOW + DAY)).length, 0, "2 days ahead is too late for the 3-day reminder");
  const first = plan(billInput(rows), NOW);
  const again = plan({ ...billInput(rows), sent: sentOf(first, NOW) }, NOW + 3600000);
  assertEquals(billDue(again).length, 0, "once per bill per cycle");
});
Deno.test("C28 dedupe: a bill at the C8 radar line due in 3 days is pushed once, by the radar, never also by the 3-day reminder", () => {
  const rows = [row("2024-10-14", -120000, "STATE FARM INSURANCE PREMIUM", "i1"), row("2025-10-14", -120000, "STATE FARM INSURANCE PREMIUM", "i2")];
  const p = plan(billInput(rows, { large_threshold_cents: 100000 }), NOW);
  assertEquals(billDue(p).length, 0, JSON.stringify(p.messages.map((x: any) => x.key)));
  const radar = p.messages.filter((m: any) => m.key.startsWith("finding:upcoming_large:"));
  assertEquals(radar.length, 1, JSON.stringify(p.messages.map((x: any) => `${x.key}: ${x.text}`)));
  assert(radar[0].text.includes("State Farm Insurance Premium $1,200.00 on 2026-10-14"), radar[0].text);
});
