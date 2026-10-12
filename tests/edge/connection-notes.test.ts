// Item 5 (ACCT-005) in the hourly run: plan() says a connection that stopped updating, or rows nobody refreshed
// (AgentProactive.connections), as a finding within the daily budget, held in quiet hours, once by its key, and never
// when nothing is wrong. Rows and accounts are MOCK, in the database's own shapes. Permission-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows, NOW } from "./lib/proactive_fixture.ts";

const DAY = 86400000;
const withDates = (balance_as_of: string, fetched_at: string) => accountRows().map((a: any) => ({ ...a, balance_as_of, fetched_at }));
const run = (accts: any[], now: number, sent: any[] = [], settings: any = {}) => plan({ accounts: mapAccounts(accts), transactions: mapTransactions(txRows()), settings: { time_zone: "America/New_York", ...settings }, sent }, now);
const notes = (p: any) => p.messages.filter((m: any) => m.key.startsWith("finding:connection:"));

Deno.test("nothing wrong, nothing said: the fixture's fresh accounts give no connection note", () => {
  assertEquals(notes(run(accountRows(), NOW)), []);
});

Deno.test("a bank stuck at SimpleFIN is said once, before the day's findings, with where to fix it", () => {
  const p = run(withDates("2026-10-06T12:00:00Z", "2026-10-11T13:30:00Z"), NOW);
  const n = notes(p);
  assertEquals(n.map((m: any) => m.key), ["finding:connection:chk-1:2026-10-06:1"]);
  assert(n[0].text.startsWith("First Bank Everyday Checking hasn't updated since Oct 6 (5 days), though I read SimpleFIN today."), n[0].text);
  assertEquals(p.messages.filter((m: any) => m.kind === "finding")[0].key, n[0].key, "it takes the day's one unrequested slot first");
  assertEquals(notes(run(withDates("2026-10-06T12:00:00Z", "2026-10-11T13:30:00Z"), NOW + 3600000, [{ key: n[0].key, sent_at: NOW }])), [], "once only");
});

Deno.test("rows nobody refreshed name the button; quiet hours hold the note", () => {
  const stale = withDates("2026-10-08T12:00:00Z", "2026-10-08T13:00:00Z");
  const n = notes(run(stale, NOW));
  assertEquals(n.map((m: any) => m.key), ["finding:connection:refresh:2026-10-08:1"]);
  assert(n[0].text.includes('Tap "Refresh connected bank" in Upmore'), n[0].text);
  const night = run(stale, Date.UTC(2026, 9, 12, 3, 0)); // 11 p.m. Oct 11 in New York
  assertEquals(notes(night), []);
  assert(night.suppressed.some((x: any) => x.key === "connection:refresh:2026-10-08:1" && x.reason === "quiet_hours"), JSON.stringify(night.suppressed));
});

Deno.test("with alerts off, no connection note (the person turned unrequested messages off)", () => {
  assertEquals(notes(run(withDates("2026-10-06T12:00:00Z", "2026-10-11T13:30:00Z"), NOW, [], { alerts: false })), []);
});
