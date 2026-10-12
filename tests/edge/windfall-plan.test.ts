// SAVE-022 windfall routing (C30), at the scheduler seam: plan() in supabase/functions/_shared/proactive.ts turns
// database-shaped rows into the person's messages. A deposit well above the learned paycheck pattern must reach
// plan() output exactly once, with amount, classification, the suggested sweep, and source + as-of; an ordinary
// week must produce none. Fixture rows mirror tests/edge/proactive.test.ts (First Bank via SimpleFIN).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";

const NOW = Date.UTC(2026, 9, 11, 14, 0, 0); // Sun 2026-10-11 10:00 a.m. New York
const accounts = () => [
  { account_id: "chk-1", name: "Everyday Checking", institution: "First Bank", currency: "USD", account_kind: "checking", balance_cents: 500000, available_cents: 500000, balance_as_of: "2026-10-11T13:30:00Z", fetched_at: "2026-10-11T13:30:00Z", sync_error: false, status: "active" },
  { account_id: "sav-1", name: "High Yield Savings", institution: "First Bank", currency: "USD", account_kind: "savings", balance_cents: 1280000, available_cents: 1280000, balance_as_of: "2026-10-11T13:30:00Z", fetched_at: "2026-10-11T13:30:00Z", sync_error: false, status: "active" },
];
const tx = (on: string, cents: number, merchant: string, id: string) => ({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });
// The learned pattern: $1,800 paychecks every two weeks (trailing median deposit $1,800, so the line is $3,600).
const paychecks = ["2026-07-24", "2026-08-07", "2026-08-21", "2026-09-04", "2026-09-18", "2026-10-02"].map((d, i) => tx(d, 180000, "ACME CORP PAYROLL DIR DEP", "pay" + i));
const input = (extra: any[]) => ({ accounts: mapAccounts(accounts()), transactions: mapTransactions(paychecks.concat(extra)), settings: null, sent: [] });

Deno.test("windfall plan: the $4,200 tax refund appears exactly once with classification, suggestion, source and as-of", () => {
  const p = plan(input([tx("2026-10-11", 420000, "IRS TREASURY REFUND", "wf1")]), NOW);
  const hits = p.messages.filter((m: any) => /windfall/.test(m.key));
  assertEquals(hits.length, 1, JSON.stringify(p.messages.map((m: any) => [m.key, m.text])));
  const m = hits[0];
  assertEquals(m.capability_id, "SAVE-022");
  assert(/Your \$4,200\.00 tax refund landed/.test(m.text), m.text);
  assert(/IRS, TREASURY, REFUND/.test(m.text), m.text);
  // No sweep rule reaches plan(), so the stated share is 50% to the savings account the rows carry, named as mapped.
  assert(/Sweep \$2,100\.00 \(50% of it\) to High Yield Savings\?/.test(m.text), m.text);
  assert(/\(First Bank via SimpleFIN, as of Oct 11, 9:30 AM\)$/.test(m.text), m.text);
  assertEquals(m.source, "First Bank via SimpleFIN");
  // Once only: a second run with the first run's keys sent plans nothing under the windfall key again.
  const sent = p.messages.map((x: any) => ({ key: x.key, sent_at: NOW, cadence: x.cadence }));
  const again = plan(Object.assign(input([tx("2026-10-11", 420000, "IRS TREASURY REFUND", "wf1")]), { sent }), NOW + 3600000);
  assert(!again.messages.some((x: any) => /windfall/.test(x.key)), "the windfall is never planned twice");
});

Deno.test("windfall plan: a week with only ordinary deposits produces no windfall message", () => {
  const p = plan(input([tx("2026-10-11", 180000, "ACME CORP PAYROLL DIR DEP", "pay-today"), tx("2026-10-11", 20000, "IRS TREASURY REFUND", "small")]), NOW);
  assert(!p.messages.some((m: any) => /windfall/.test(m.key)), JSON.stringify(p.messages.map((m: any) => m.key)));
  assert(!p.messages.some((m: any) => /tax refund landed/.test(m.text)), JSON.stringify(p.messages.map((m: any) => m.text)));
});
