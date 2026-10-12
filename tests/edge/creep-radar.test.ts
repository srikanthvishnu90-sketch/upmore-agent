// C5 subscription creep watch + C8 big-purchase radar, end to end through plan() (supabase/functions/_shared/proactive.ts).
// The detectors are tested at module level (33-agent-monitors.js priceRises/newSubscriptions, 49-agent-save.js price
// increases, 57-agent-ledger.js recurrence); these tests prove the findings reach the person through the feed
// (56-agent-proactive.js) and plan()'s budget/once-only rules, with every Done-when element in the text:
//   C5: Netflix $15.49 x3 then $17.99 -> exactly one creep finding naming Netflix, both prices, the $2.50 delta,
//       its yearly cost, and a cancel path; a merchant recurring for the first time is flagged as new.
//   C8: a $1,200 annual insurance premium due in 5 days and rent due in 3 days are pushed days ahead with date and
//       amount (not only in the Sunday recap); a $17.99 monthly subscription is not a big upcoming outflow.
// Fixture rows only, in the database's own shapes, in the style of tests/edge/proactive.test.ts.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, NOW } from "./lib/proactive_fixture.ts";

const DAY = 86400000;
const row = (on: string, cents: number, merchant: string, id: string) => ({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });
// A year-plus of monthly payroll: the history a new merchant is measured against (a charge present from the start of
// the history is never "new"), and the income the forecasts read.
const payroll = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((d, i) => row(d, 180000, "ACME CORP PAYROLL DIR DEP", "pay" + i));
const input = (extra: any[], settings: any = null, sent: any[] = [], accounts: any[] = accountRows()) => ({ accounts: mapAccounts(accounts), transactions: mapTransactions(payroll.concat(extra)), settings, sent });
// The same account, refreshed on the day of the run (a stale-connection note would otherwise take the day's slot).
const freshAccounts = (iso: string) => accountRows().map((a: any) => Object.assign({}, a, { balance_as_of: iso, fetched_at: iso }));
const sentOf = (p: any) => p.messages.map((m: any) => ({ key: m.key, sent_at: NOW, cadence: m.cadence }));

const NETFLIX_CREEP = [
  row("2026-06-20", -1549, "NETFLIX.COM", "n1"), row("2026-07-20", -1549, "NETFLIX.COM", "n2"),
  row("2026-08-20", -1549, "NETFLIX.COM", "n3"), row("2026-09-20", -1799, "NETFLIX.COM", "n4"),
];
Deno.test("C5 creep: a planted price rise ($15.49 to $17.99) is caught the first cycle it posts, quantified, with a cancel path", () => {
  const p = plan(input(NETFLIX_CREEP), NOW);
  const creep = p.messages.filter((m: any) => m.kind === "finding" && /went up/.test(m.text));
  assertEquals(creep.length, 1, JSON.stringify(p.messages.map((m: any) => m.text)));
  const t = creep[0].text;
  assert(/Netflix/i.test(t), t);
  assert(t.includes("$15.49"), `the old price is named: ${t}`);
  assert(t.includes("$17.99"), `the new price is named: ${t}`);
  assert(t.includes("$2.50"), `the delta is named: ${t}`);
  assert(/\$30\.00/.test(t) && /12 months|a year/.test(t), `the yearly cost is named: ${t}`);
  assert(/cancel/i.test(t), `a one-tap path to the cancel capability is in the message: ${t}`);
  assertEquals(creep[0].capability_id, "BILL-002");
});

Deno.test("C5 creep: once only — the same rise is never planned twice", () => {
  const first = plan(input(NETFLIX_CREEP), NOW);
  const again = plan(input(NETFLIX_CREEP, null, sentOf(first)), NOW + 3600000);
  assert(!again.messages.some((m: any) => /went up/.test(m.text)), JSON.stringify(again.messages.map((m: any) => m.key)));
});

Deno.test("C5 new subscription: a recurring merchant appearing for the first time in the window is flagged as new", () => {
  const headspace = [row("2026-09-05", -1299, "HEADSPACE", "h1"), row("2026-10-05", -1299, "HEADSPACE", "h2")];
  const p = plan(input(headspace), NOW);
  const f = p.messages.find((m: any) => m.kind === "finding" && /new/i.test(m.text) && /Headspace/i.test(m.text));
  assert(f, JSON.stringify(p.messages.map((m: any) => m.text)));
  assert(f.text.includes("$12.99") && f.text.includes("2026-09-05"), f.text);
  assertEquals(f.capability_id, "subscriptions.cancel", "the new subscription carries its path to the cancel capability");
});

// Annual insurance ($1,200, yearly cadence, last charges 2024/2025-10-16 -> due 2026-10-16, 5 days out), rent
// ($1,450 monthly, due 2026-10-14, 3 days out), plus two small monthly subscriptions due inside the same week.
const RADAR = [
  row("2024-10-16", -120000, "STATE FARM INSURANCE PREMIUM", "i1"), row("2025-10-16", -120000, "STATE FARM INSURANCE PREMIUM", "i2"),
  row("2026-07-14", -145000, "OAK PROPERTY MGMT RENT", "r1"), row("2026-08-14", -145000, "OAK PROPERTY MGMT RENT", "r2"), row("2026-09-14", -145000, "OAK PROPERTY MGMT RENT", "r3"),
  row("2024-10-17", -200000, "DEPAUL UNIVERSITY TUITION", "u1"), row("2025-10-17", -200000, "DEPAUL UNIVERSITY TUITION", "u2"),
  row("2026-08-18", -1799, "NETFLIX.COM", "n5"), row("2026-09-18", -1799, "NETFLIX.COM", "n6"),
  row("2026-08-18", -299, "ICLOUD STORAGE", "c1"), row("2026-09-18", -299, "ICLOUD STORAGE", "c2"),
];
const THRESHOLD = { large_threshold_cents: 100000 }; // the user's line: $1,000

Deno.test("C8 radar: upcoming large outflows are pushed days ahead with date and amount — on an ordinary day, not only in the Sunday recap", () => {
  const tuesday = NOW + 2 * DAY; // Tue 2026-10-13: rent is 1 day out, the premium 3 days out, no weekly recap is due
  const p = plan(input(RADAR, THRESHOLD, [], freshAccounts("2026-10-13T13:30:00Z")), tuesday);
  assert(!p.messages.some((m: any) => m.kind === "weekly_recap"), "this is the push, not the recap");
  const radar = p.messages.find((m: any) => m.kind === "finding" && /Oak Property Mgmt Rent/.test(m.text) && /State Farm Insurance Premium/.test(m.text));
  assert(radar, JSON.stringify(p.messages.map((m: any) => `${m.kind}: ${m.text}`)));
  assert(radar.text.includes("$1,450.00") && radar.text.includes("2026-10-14"), radar.text);
  assert(radar.text.includes("$1,200.00") && radar.text.includes("2026-10-16"), radar.text);
  assert(radar.text.includes("$2,000.00") && radar.text.includes("2026-10-17") && /Tuition/i.test(radar.text), `tuition is listed too: ${radar.text}`);
  assert(!/Netflix|Icloud/i.test(radar.text), `small subscriptions are not big outflows: ${radar.text}`);
});

Deno.test("C8 radar: nothing at or under the small-subscription size is presented as a big upcoming outflow", () => {
  const p = plan(input(RADAR, THRESHOLD, [], freshAccounts("2026-10-13T13:30:00Z")), NOW + 2 * DAY);
  for (const m of p.messages.filter((x: any) => x.kind === "finding"))
    assert(!/coming up|upcoming/i.test(m.text) || !/Netflix|Icloud/i.test(m.text), m.text);
});

Deno.test("C8 radar: once only — a second run with the first run's sent keys repeats nothing", () => {
  const tuesday = NOW + 2 * DAY;
  const first = plan(input(RADAR, THRESHOLD, [], freshAccounts("2026-10-13T13:30:00Z")), tuesday);
  const radar = first.messages.find((m: any) => m.kind === "finding" && /Oak Property Mgmt Rent/.test(m.text));
  assert(radar, JSON.stringify(first.messages.map((m: any) => m.key)));
  const sent = first.messages.map((m: any) => ({ key: m.key, sent_at: tuesday, cadence: m.cadence }));
  const again = plan(input(RADAR, THRESHOLD, sent, freshAccounts("2026-10-13T13:30:00Z")), tuesday + 3600000);
  assertEquals(again.messages.filter((m: any) => first.messages.some((f: any) => f.key === m.key)).length, 0, JSON.stringify(again.messages.map((m: any) => m.key)));
});
