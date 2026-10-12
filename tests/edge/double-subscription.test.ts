// Double subscriptions in the proactive push (real-world C7): plan() delivers the monitors'
// double_subscription finding as a finding with both streams' exact charges and the cancel capability
// attached, once. Detection and the kill chain are proven in tests/double-subscription.test.cjs.
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { assert, assertEquals } from "jsr:@std/assert@1";

const NOW = Date.UTC(2026, 9, 20, 14, 0, 0); // Tue 2026-10-20
const bankRows = [
  { account_id: "visa", name: "Visa", institution: "First Bank", currency: "USD", account_kind: "credit", balance_cents: 0, available_cents: 0, balance_as_of: "2026-10-20T13:30:00Z", fetched_at: "2026-10-20T13:30:00Z", sync_error: false, status: "active" },
  { account_id: "chk", name: "checking", institution: "First Bank", currency: "USD", account_kind: "checking", balance_cents: 300000, available_cents: 300000, balance_as_of: "2026-10-20T13:30:00Z", fetched_at: "2026-10-20T13:30:00Z", sync_error: false, status: "active" },
];
const tx = (id: string, on: string, cents: number, merchant: string, acct = "visa") => ({ account_id: acct, provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });
const rows = () => [
  ...["2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"].map((d, i) => tx("sd" + i, d, -1199, "SPOTIFY")),
  ...["2026-07-07", "2026-08-07", "2026-09-07", "2026-10-07"].map((d, i) => tx("sa" + i, d, -1199, "APL*ITUNES")),
  ...["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15"].map((d, i) => tx("ic" + i, d, -99, "ICLOUD", "chk")),
  ...["2026-07-18", "2026-08-18", "2026-09-18", "2026-10-18"].map((d, i) => tx("is" + i, d, -299, "ICLOUD STORAGE", "chk")),
];

Deno.test("plan() pushes the doubled Spotify with both exact streams and the cancel path, once", () => {
  const input = { accounts: mapAccounts(bankRows), transactions: mapTransactions(rows()), settings: null, sent: [] };
  const p = plan(input as any, NOW);
  const hits = p.messages.filter((m: any) => /paid for 2 times over/.test(m.text));
  assertEquals(hits.length, 1, JSON.stringify(p.messages.map((m: any) => [m.key, m.text])));
  const sp = hits[0];
  assert(/Spotify/i.test(sp.text), sp.text);
  assert(/\$11\.99 monthly billed direct, last charged 2026-10-05/.test(sp.text), sp.text);
  assert(/\$11\.99 monthly billed through the App Store \(matched by amount and cadence\), last charged 2026-10-07/.test(sp.text), sp.text);
  assert(/\$287\.76 a year/.test(sp.text), sp.text);
  assertEquals(sp.capability_id, "subscriptions.cancel", "the one-tap path to the cancel capability rides on the message");
  // The iCloud double is real too: the daily finding budget holds it for the next run, it is not lost.
  assert(p.suppressed.some((s: any) => /double_subscription:icloud/.test(s.key) && s.reason === "daily_budget"), JSON.stringify(p.suppressed));
  const sent = p.messages.map((m: any) => ({ key: m.key, sent_at: NOW, cadence: !!m.cadence }));
  const p2 = plan({ ...input, sent } as any, NOW + 86400000);
  const ic = p2.messages.find((m: any) => /paid for 2 times over/.test(m.text));
  assert(ic, JSON.stringify(p2.messages.map((m: any) => m.key)));
  assert(/\$0\.99 monthly/.test(ic!.text) && /\$2\.99 monthly/.test(ic!.text), ic!.text);
  // And once delivered, neither is ever raised again.
  const sent2 = sent.concat(p2.messages.map((m: any) => ({ key: m.key, sent_at: NOW + 86400000, cadence: !!m.cadence })));
  const p3 = plan({ ...input, sent: sent2 } as any, NOW + 2 * 86400000);
  assert(!p3.messages.some((m: any) => /paid for 2 times over/.test(m.text)), "never raised twice");
});
