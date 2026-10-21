// A3 / C15 production intake: a non-USD row must reach the anomaly detector end to end.
//
// Before this fix, supabase/functions/_shared/proactive.ts mapTransactions filtered every row whose
// currency was not USD out of the intake, and numbersRows re-stamped every row currency: "USD". The
// detector in packages/domain/59-agent-alerts.js (ALRT-003 international charge) was working, but in
// production it never saw a foreign charge, so no anomaly_check offer was ever planned for one.
//
// These tests drive the production code path only: raw stored rows (the database's own shapes) ->
// mapAccounts / mapTransactions -> plan() (the hourly proactive path) -> offerMessage (the chat reply
// handling), with the "no" answer's dispute restatement fed to the real dispute answer
// (agent-chat/_shared/dispute_answer.ts disputeReply) over the same stored rows. Fixtures are synthetic.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, offerMessage, mapAccounts, mapTransactions, numbersRows } from "../../supabase/functions/_shared/proactive.ts";
import { disputeReply } from "../../supabase/functions/agent-chat/_shared/dispute_answer.ts";

const NOW = Date.UTC(2026, 9, 11, 14, 0, 0); // Sun 2026-10-11 10:00 a.m. New York
const DAY = 24 * 3600000;
// weekly_recap_dow: null — the person has no recap set, so the anomaly message is the run's only message
// and the transcript is unambiguous.
const SETTINGS: any = { weekly_recap_dow: null };

const accounts = () => [
  { account_id: "chk-1", name: "Everyday Checking", institution: "First Bank", currency: "USD", account_kind: "checking", balance_cents: 500000, available_cents: 500000, balance_as_of: "2026-10-11T13:30:00Z", fetched_at: "2026-10-11T13:30:00Z", sync_error: false, status: "active" },
];
const tx = (on: string, cents: number, merchant: string, id: string, more: any = {}) => Object.assign(
  { account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" }, more);
const history = [tx("2026-10-04", -5200, "KROGER", "h1"), tx("2026-09-27", -6100, "KROGER", "h2")];

// The EUR charge the owner would have missed before: posted today, -45.00 EUR, carrying its USD figure.
const EUR_ROW = tx("2026-10-11", -4500, "HOTEL LUTETIA PARIS", "intl1", { currency: "EUR", usd_amount_cents: -4860 });
const GBP_ROW = tx("2026-10-11", -3200, "PRET A MANGER LONDON", "intl2", { currency: "GBP" });

const inputFor = (raw: any[], settings: any = SETTINGS, sent: any[] = []) => ({
  accounts: mapAccounts(accounts()), transactions: mapTransactions(raw), settings, sent,
});
const anomaly = (p: any) => p.messages.find((x: any) => x.offer && x.offer.kind === "anomaly_check");
const storedOffer = (p: any) => Object.assign({}, anomaly(p).offer, { thread_id: "thread-1", message_key: anomaly(p).key });

// The chat-side deps the handler builds (agent-chat/handler.ts supabaseOfferDeps): runFlow here is the real
// dispute answer over the person's stored rows, the way routeFlows reaches the dispute flow for that text.
function deps(offer: any, raw: any[], flows: string[], cleared: { n: number }) {
  return {
    offer, threadId: "thread-1",
    liveCard: async () => false,
    runFlow: async (text: string) => {
      flows.push(text);
      const reply = await disputeReply(text, "2026-10-11", async () => raw as any);
      return reply ? { reply, route: { outcome: "draft" } } : null;
    },
    clear: async () => { cleared.n++; return true; },
    watch: async () => false,
  };
}

Deno.test("A3 intake: mapTransactions passes a non-USD row through with its real currency and its USD figure; the other filters stand", () => {
  const mapped = mapTransactions(history.concat([EUR_ROW]));
  const hit = mapped.find((t: any) => t.id === "chk-1:intl1");
  assert(hit, "the EUR row survives the intake");
  assertEquals(hit.currency, "EUR");
  assertEquals(hit.usd_amount_cents, -4860, "the USD figure the detector reads (usd_amount_cents) is carried, not dropped");
  assertEquals(hit.amount_cents, -4500);
  // The detector's other USD-figure field names are carried too, and only as safe integers.
  const alt = mapTransactions([tx("2026-10-11", -1000, "CAFE PARIS", "alt1", { currency: "EUR", amount_usd_cents: -1080 }),
    tx("2026-10-11", -1000, "CAFE PARIS", "alt2", { currency: "EUR", usd_cents: -1080 }),
    tx("2026-10-11", -1000, "CAFE PARIS", "alt3", { currency: "EUR", usd_amount_cents: 10.5 })]);
  assertEquals((alt.find((t: any) => t.id.endsWith("alt1")) as any).amount_usd_cents, -1080);
  assertEquals((alt.find((t: any) => t.id.endsWith("alt2")) as any).usd_cents, -1080);
  assertEquals("usd_amount_cents" in (alt.find((t: any) => t.id.endsWith("alt3")) as any), false, "a non-integer USD figure is not carried, and no conversion is invented");
  // No filter was weakened: superseded rows, non-integer amounts and rows with no posted date stay out, in any currency.
  const dropped = mapTransactions([
    tx("2026-10-11", -4500, "HOTEL LUTETIA PARIS", "bad1", { currency: "EUR", presence: "superseded" }),
    Object.assign(tx("2026-10-11", -4500, "HOTEL LUTETIA PARIS", "bad2", { currency: "EUR" }), { amount_cents: -4500.5 }),
    Object.assign(tx("2026-10-11", -4500, "HOTEL LUTETIA PARIS", "bad3", { currency: "EUR" }), { posted_on: null }),
  ]);
  assertEquals(dropped, []);
});

Deno.test("A3 intake: numbersRows (the chat-side shape) no longer re-stamps a foreign row as USD", () => {
  const mapped = mapTransactions(history.concat([EUR_ROW, GBP_ROW]));
  const nr = numbersRows(mapAccounts(accounts()), mapped);
  const eur = nr.transactions.find((t: any) => String(t.provider_transaction_id).endsWith("intl1"));
  const gbp = nr.transactions.find((t: any) => String(t.provider_transaction_id).endsWith("intl2"));
  assert(eur, "the EUR row survives intake mapping");
  assert(gbp, "the GBP row survives intake mapping");
  assertEquals(eur.currency, "EUR");
  assertEquals(eur.usd_amount_cents, -4860);
  assertEquals(gbp.currency, "GBP");
});

Deno.test("A3 E2E: a posted EUR charge today plans the anomaly_check offer naming merchant, EUR amount and the USD figure, asking 'was this you?'", () => {
  const p = plan(inputFor(history.concat([EUR_ROW])), NOW);
  const m = anomaly(p);
  assert(m, JSON.stringify(p.messages.map((x: any) => [x.key, x.text])));
  assertEquals(m.key, "finding:international:chk-1:intl1");
  assertEquals(m.capability_id, "ALRT-003");
  assert(/Hotel Lutetia Paris charged 45\.00 EUR \(\$48\.60 in USD\) on Oct 11, 2026\. A charge in another currency is worth a second look\. Was this you\? Reply YES or NO/.test(m.text), m.text);
  assertEquals(m.offer, { kind: "anomaly_check", key: "international:chk-1:intl1", transaction_id: "chk-1:intl1", merchant: "Hotel Lutetia Paris", amount_cents: 4500, currency: "EUR", posted_on: "2026-10-11" });
});

Deno.test("A3 E2E: user replies 'no' — the dispute restatement runs for that exact charge, the real dispute answer drafts it in EUR, and the reply states the case is opened", async () => {
  const raw = history.concat([EUR_ROW]);
  const p = plan(inputFor(raw), NOW);
  const flows: string[] = [], cleared = { n: 0 };
  const r = await offerMessage("no", deps(storedOffer(p), raw, flows, cleared), NOW);
  assert(r, "the no is answered");
  assertEquals(flows, ["dispute the Hotel Lutetia Paris charge for $45.00 EUR on Oct 11"], "the dispute flow is run once, on the offer's exact transaction reference");
  assert(/^Dispute case opened for the Hotel Lutetia Paris charge of \$45\.00 EUR on Oct 11: /.test(r!.reply), r!.reply);
  assert(/Here's a dispute for the Hotel Lutetia Paris charge/.test(r!.reply), r!.reply);
  assert(/Charge: HOTEL LUTETIA PARIS, 45\.00 EUR, posted Oct 11, 2026\./.test(r!.reply), "the real dispute answer matched that charge and said it in EUR, not dollars");
  assert(/Nothing has been sent\./.test(r!.reply), r!.reply);
  assertEquals(cleared.n, 1, "the offer is consumed by the answer");
});

Deno.test("A3 E2E (separate run): user replies 'yes' — closed quietly, no case, no flow run", async () => {
  const raw = history.concat([EUR_ROW]);
  const p = plan(inputFor(raw), NOW);
  const flows: string[] = [], cleared = { n: 0 };
  const r = await offerMessage("yes", deps(storedOffer(p), raw, flows, cleared), NOW);
  assertEquals(r!.reply, "Okay, that was you — the Hotel Lutetia Paris charge of $45.00 EUR stands, and no dispute was opened. Nothing else was done.");
  assertEquals(flows, [], "a yes runs no dispute flow");
  assertEquals(cleared.n, 1);
});

Deno.test("A3 variant: a GBP row without a USD figure is said in GBP only — no conversion is invented", () => {
  const p = plan(inputFor(history.concat([GBP_ROW])), NOW);
  const m = anomaly(p);
  assert(m, JSON.stringify(p.messages.map((x: any) => [x.key, x.text])));
  assertEquals(m.offer.currency, "GBP");
  assert(/Pret A Manger London charged 32\.00 GBP on Oct 11, 2026\. A charge in another currency is worth a second look\. Was this you\?/.test(m.text), m.text);
  assert(!/in USD/.test(m.text), m.text);
  assert(!/\$\d/.test(m.text.split(" (First Bank")[0]), `no dollar figure anywhere in the finding itself: ${m.text}`);
});

Deno.test("A3 variant: a USD row the same day gets no international offer; the large-charge detector is unaffected", () => {
  const normal = plan(inputFor(history.concat([tx("2026-10-11", -2350, "CHIPOTLE 1234", "usd1")])), NOW);
  assert(!normal.messages.some((x: any) => /international/.test(x.key)), JSON.stringify(normal.messages.map((x: any) => x.key)));
  assert(!anomaly(normal), "an ordinary USD charge is not asked about");
  const large = plan(inputFor(history.concat([tx("2026-10-11", -64000, "BEST BUY", "big1")]), { ...SETTINGS, large_threshold_cents: 50000 }), NOW);
  const m = anomaly(large);
  assert(m && m.key.startsWith("finding:large:"), JSON.stringify(large.messages.map((x: any) => x.key)));
  assertEquals([m.offer.currency, m.offer.amount_cents, m.offer.merchant], ["USD", 64000, "Best Buy"]);
  assert(/Best Buy charged \$640\.00 today/.test(m.text) && /Was this you\?/.test(m.text), m.text);
});

Deno.test("A3 variant: a pending non-USD row gets no offer — the international detector requires a posted charge", () => {
  const pending = tx("2026-10-11", -4500, "HOTEL LUTETIA PARIS", "pend1", { currency: "EUR", usd_amount_cents: -4860, is_pending: true });
  const p = plan(inputFor(history.concat([pending])), NOW);
  assert(!p.messages.some((x: any) => /international/.test(x.key)), JSON.stringify(p.messages.map((x: any) => x.key)));
  assert(!anomaly(p), JSON.stringify(p.messages.map((x: any) => [x.key, x.text])));
});

Deno.test("A3 variant: the same foreign row tomorrow is not offered again — the once-only delivery log holds", () => {
  const raw = history.concat([EUR_ROW]);
  const first = plan(inputFor(raw), NOW);
  assert(anomaly(first), "day one: the offer is planned");
  const sent = first.messages.map((x: any) => ({ key: x.key, sent_at: NOW, cadence: x.cadence }));
  const sameDay = plan(inputFor(raw, SETTINGS, sent), NOW + 3600000);
  assert(!anomaly(sameDay), "an hour later, with the delivery log carrying the key, nothing repeats");
  const tomorrow = plan(inputFor(raw, SETTINGS, sent), NOW + DAY);
  assert(!anomaly(tomorrow), "tomorrow: no duplicate anomaly offer for the same row");
  assert(!tomorrow.messages.some((x: any) => /international/.test(x.key)), JSON.stringify(tomorrow.messages.map((x: any) => x.key)));
});
