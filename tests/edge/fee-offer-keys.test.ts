// A fee refund offer is keyed by the fee's own row (overnight 2026-10-12). The delivery log is unique per (person, key)
// for good, and the feed keeps the save engine's offer over the monitors' per-fee finding for the same charge, so a
// kind-only key ("save:fee_refund:overdraft") let the first overdraft fee be said and silenced every later one. MOCK rows.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows, NOW } from "./lib/proactive_fixture.ts";

const fee = (id: string, on: string, cents = 3500) => ({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: -cents, posted_on: on, merchant_raw: "OVERDRAFT FEE", is_pending: false, is_transfer: false, presence: "observed" });
const input = (rows: any[], sent: any[]) => ({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows(rows)), settings: null, sent });

Deno.test("a new overdraft fee is offered even after an earlier fee's offer went out", () => {
  const first = plan(input([fee("od-sep", "2026-09-02")], []), NOW);
  const said = first.messages.find((m) => /overdraft fee/i.test(m.text));
  assert(said, JSON.stringify(first.messages.map((m) => m.key)));
  assert(said.key.endsWith(":od-sep"), said.key);
  const sent = [{ key: said.key, sent_at: NOW - 30 * 86400000, cadence: false }];
  // Weeks later a second fee of another amount posts; the first offer is in the delivery log. It is its own offer.
  const later = plan(input([fee("od-sep", "2026-09-02"), fee("od-oct", "2026-10-09", 3400)], sent), NOW);
  const again = later.messages.find((m) => /overdraft fee/i.test(m.text));
  assert(again, JSON.stringify({ messages: later.messages.map((m) => m.key), suppressed: later.suppressed }));
  assert(again.key.endsWith(":od-oct"), again.key);
  // The same $35.00 again a month later is the monthly-fee offer, also said.
  const monthly = plan(input([fee("od-sep", "2026-09-02"), fee("od-oct", "2026-10-09")], sent), NOW);
  assert(monthly.messages.some((m) => /overdraft fee every month/i.test(m.text)), JSON.stringify(monthly.messages.map((m) => m.key)));
});
