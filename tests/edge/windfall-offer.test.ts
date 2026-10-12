// SAVE-022 windfall offer (C30), the answer side: plan() attaches a windfall_sweep offer to the windfall finding,
// and offerMessage answers the person's yes/no in the thread. A no leaves the money where it landed. A yes wants
// the sweep, but the move is an own-account transfer (PAY-009) and chat has no transfer card to stage for its own
// confirmation yet, so the answer must say nothing moved — never claim a sweep that did not happen.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, offerMessage, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";

const NOW = Date.UTC(2026, 9, 11, 14, 0, 0); // Sun 2026-10-11 10:00 a.m. New York
const accounts = () => [
  { account_id: "chk-1", name: "Everyday Checking", institution: "First Bank", currency: "USD", account_kind: "checking", balance_cents: 500000, available_cents: 500000, balance_as_of: "2026-10-11T13:30:00Z", fetched_at: "2026-10-11T13:30:00Z", sync_error: false, status: "active" },
  { account_id: "sav-1", name: "High Yield Savings", institution: "First Bank", currency: "USD", account_kind: "savings", balance_cents: 1280000, available_cents: 1280000, balance_as_of: "2026-10-11T13:30:00Z", fetched_at: "2026-10-11T13:30:00Z", sync_error: false, status: "active" },
];
const tx = (on: string, cents: number, merchant: string, id: string) => ({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });
const paychecks = ["2026-07-24", "2026-08-07", "2026-08-21", "2026-09-04", "2026-09-18", "2026-10-02"].map((d, i) => tx(d, 180000, "ACME CORP PAYROLL DIR DEP", "pay" + i));
const windfallInput = () => ({ accounts: mapAccounts(accounts()), transactions: mapTransactions(paychecks.concat([tx("2026-10-11", 420000, "IRS TREASURY REFUND", "wf1")])), settings: null, sent: [] });

function storedOffer() {
  const p = plan(windfallInput(), NOW);
  const m = p.messages.find((x: any) => /windfall/.test(x.key));
  assert(m && m.offer, JSON.stringify(p.messages.map((x: any) => [x.key, x.text])));
  return Object.assign({}, m.offer, { thread_id: "thread-1", message_key: m.key });
}
const deps = (offer: any, cleared: { n: number }) => ({
  offer, threadId: "thread-1",
  liveCard: async () => false,
  runFlow: async () => null,
  clear: async () => { cleared.n++; return true; },
  watch: async () => false,
});

Deno.test("windfall offer: plan() attaches the exact sweep the alert named", () => {
  const o = storedOffer();
  assertEquals(o.kind, "windfall_sweep");
  assertEquals(o.transaction_id, "chk-1:wf1");
  assertEquals(o.deposit_cents, 420000);
  assertEquals(o.sweep_cents, 210000); // no sweep rule reaches plan(): the stated 50% share
  assertEquals(o.from_account_id, "chk-1");
  assertEquals(o.to_account_id, "sav-1");
  assertEquals(o.classification, "tax refund");
});

Deno.test("windfall offer: a yes moves nothing and says so, with the sweep restated", async () => {
  const cleared = { n: 0 };
  const r = await offerMessage("yes", deps(storedOffer(), cleared), NOW);
  assert(r, "the yes is answered");
  assert(/nothing moved/.test(r!.reply), r!.reply);
  assert(/\$2,100\.00 to savings/.test(r!.reply), r!.reply);
  assert(!/moved \$|swept|transferred/.test(r!.reply), r!.reply);
  assertEquals(cleared.n, 1, "the offer is consumed by the answer");
});

Deno.test("windfall offer: a no leaves the deposit where it landed", async () => {
  const cleared = { n: 0 };
  const r = await offerMessage("no", deps(storedOffer(), cleared), NOW);
  assert(r, "the no is answered");
  assert(/leave the \$4,200\.00 where it landed/.test(r!.reply), r!.reply);
  assert(/Nothing moved/.test(r!.reply), r!.reply);
  assertEquals(cleared.n, 1);
});

Deno.test("windfall offer: an answer in another thread is not this offer's answer", async () => {
  const cleared = { n: 0 };
  const d = deps(storedOffer(), cleared); d.threadId = "thread-2";
  assertEquals(await offerMessage("yes", d, NOW), null);
  assertEquals(cleared.n, 0);
});
