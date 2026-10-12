// C15 statement anomaly watch, the push half: plan() pushes each anomaly kind (large charge over the person's
// line, first-time merchant at or over the limit, international charge) with the "was this you?" question and an
// anomaly_check offer carrying the exact transaction reference; offerMessage answers it — "yes" (it was me)
// consumes the offer with no action, "no" runs the dispute flow for that exact charge with the case opened.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, offerMessage, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";

const NOW = Date.UTC(2026, 9, 11, 14, 0, 0); // Sat 2026-10-11 10:00 a.m. New York
const accounts = () => [
  { account_id: "chk-1", name: "Everyday Checking", institution: "First Bank", currency: "USD", account_kind: "checking", balance_cents: 500000, available_cents: 500000, balance_as_of: "2026-10-11T13:30:00Z", fetched_at: "2026-10-11T13:30:00Z", sync_error: false, status: "active" },
];
const tx = (on: string, cents: number, merchant: string, id: string) => ({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });
const history = [tx("2026-10-04", -5200, "KROGER", "h1"), tx("2026-09-27", -6100, "KROGER", "h2")];
const input = (txs: any[], settings: any = null) => ({ accounts: mapAccounts(accounts()), transactions: txs, settings, sent: [] });

function anomalyMessage(p: any) {
  const m = p.messages.find((x: any) => x.offer && x.offer.kind === "anomaly_check");
  assert(m, JSON.stringify(p.messages.map((x: any) => [x.key, x.text])));
  return m;
}
const storedOffer = (p: any) => { const m = anomalyMessage(p); return Object.assign({}, m.offer, { thread_id: "thread-1", message_key: m.key }); };

Deno.test("anomaly offer: a large charge over the person's line is pushed with 'was this you?' and the offer naming the exact transaction", () => {
  const p = plan(input(mapTransactions(history.concat([tx("2026-10-11", -64000, "BEST BUY", "big1")])), { large_threshold_cents: 50000 }), NOW);
  const m = anomalyMessage(p);
  assert(m.key.startsWith("finding:large:"), m.key);
  assert(/Was this you\? Reply YES or NO/.test(m.text), m.text);
  assert(/Best Buy charged \$640\.00 today/.test(m.text), m.text);
  assertEquals(m.offer.transaction_id, "chk-1:big1");
  assertEquals(m.offer.merchant, "Best Buy");
  assertEquals(m.offer.amount_cents, 64000);
  assertEquals(m.offer.currency, "USD");
  assertEquals(m.offer.posted_on, "2026-10-11");
});

Deno.test("anomaly offer: a first-time merchant at the limit is pushed with 'was this you?' and its transaction reference", () => {
  const p = plan(input(mapTransactions(history.concat([tx("2026-10-11", -30000, "ACME WIDGETS", "ft1")]))), NOW);
  const m = anomalyMessage(p);
  assert(m.key.startsWith("finding:unusual:"), m.key);
  assert(/Was this you\? Reply YES or NO/.test(m.text), m.text);
  assertEquals(m.offer.transaction_id, "chk-1:ft1");
  assertEquals(m.offer.merchant, "Acme Widgets");
  assertEquals(m.offer.amount_cents, 30000);
});

Deno.test("anomaly offer: an international charge is pushed with 'was this you?', its amount in its own currency, and its transaction reference", () => {
  // plan()'s input shape is the mapped row; the mapped row below carries its currency, as mapTransactions now keeps it.
  const intl = { id: "chk-1:intl1", account_id: "chk-1", amount_cents: -4500, amount: -45, posted_at: "2026-10-11", merchant_raw: "HOTEL LUTETIA PARIS", is_pending: false, is_transfer: false, currency: "EUR" };
  const p = plan(input(mapTransactions(history).concat([intl])), NOW);
  const m = anomalyMessage(p);
  assert(m.key.startsWith("finding:international:"), m.key);
  assert(/45\.00 EUR/.test(m.text), m.text);
  assert(/Was this you\? Reply YES or NO/.test(m.text), m.text);
  assertEquals(m.offer.transaction_id, "chk-1:intl1");
  assertEquals(m.offer.merchant, "Hotel Lutetia Paris");
  assertEquals(m.offer.amount_cents, 4500);
  assertEquals(m.offer.currency, "EUR");
});

function deps(offer: any, cleared: { n: number }, flows: string[]) {
  return {
    offer, threadId: "thread-1",
    liveCard: async () => false,
    runFlow: async (text: string) => { flows.push(text); return { reply: `Here's a dispute for the charge, pre-filled for you to send yourself. Nothing has been sent.`, route: { outcome: "draft" } }; },
    clear: async () => { cleared.n++; return true; },
    watch: async () => false,
  };
}
const largePlan = () => plan(input(mapTransactions(history.concat([tx("2026-10-11", -64000, "BEST BUY", "big1")])), { large_threshold_cents: 50000 }), NOW);

Deno.test("anomaly offer: 'yes, it was me' consumes the offer and stages no dispute", async () => {
  const cleared = { n: 0 }, flows: string[] = [];
  const r = await offerMessage("yes", deps(storedOffer(largePlan()), cleared, flows), NOW);
  assert(r, "the yes is answered");
  assert(/that was you/.test(r!.reply), r!.reply);
  assert(/no dispute was opened/.test(r!.reply), r!.reply);
  assertEquals(flows.length, 0, "no flow is run on a yes");
  assertEquals(cleared.n, 1, "the offer is consumed by the answer");
});

Deno.test("anomaly offer: 'no' routes straight into the dispute flow for the exact charge, case opened, merchant and amount named", async () => {
  const cleared = { n: 0 }, flows: string[] = [];
  const r = await offerMessage("no", deps(storedOffer(largePlan()), cleared, flows), NOW);
  assert(r, "the no is answered");
  assertEquals(flows.length, 1, "the dispute flow is run once");
  assert(/dispute/.test(flows[0]) && /Best Buy/.test(flows[0]) && /\$640\.00/.test(flows[0]), flows[0]);
  assert(/Dispute case opened for the Best Buy charge of \$640\.00/.test(r!.reply), r!.reply);
  assert(/pre-filled for you to send yourself/.test(r!.reply), "the flow's own reply follows the opened-case statement");
  assertEquals(cleared.n, 1);
});

Deno.test("anomaly offer: an answer in another thread, or with a live card present, is not this offer's answer", async () => {
  const cleared = { n: 0 }, flows: string[] = [];
  const d1 = deps(storedOffer(largePlan()), cleared, flows); d1.threadId = "thread-2";
  assertEquals(await offerMessage("no", d1, NOW), null);
  const d2 = deps(storedOffer(largePlan()), cleared, flows); d2.liveCard = async () => true;
  assertEquals(await offerMessage("no", d2, NOW), null);
  assertEquals(cleared.n, 0);
  assertEquals(flows.length, 0);
});
