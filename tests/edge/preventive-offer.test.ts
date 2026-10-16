// Low-balance early warning with the exact preventive transfer (SAVE-006; real-world C29): plan() attaches a
// preventive_transfer offer to the ALRT-001 warning and the warning's own text names the move — amount, both
// accounts, the day it must land. A yes restates the move into the transfer flow (PAY-009), whose card stages
// it; the card's yes executes it on the sandbox rail. A no moves nothing and restates the risk. When savings
// cannot cover a move, no offer is attached and the warning stands on its own.
import { routeFlows as routeFlowsTyped, mapFlowData, type FlowDb } from "../../supabase/functions/_shared/flow_router.ts";
import { plan, offerMessage, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { assert, assertEquals } from "jsr:@std/assert@1";
const routeFlows = (m: string, d: any): Promise<any> => routeFlowsTyped(m, d);
const NOW = Date.UTC(2026, 9, 15, 14, 0, 0); // Thu 2026-10-15

const bankRows = (savCents: number) => [
  { account_id: "chk-1", name: "Everyday Checking", institution: "First Bank", currency: "USD", account_kind: "checking", balance_cents: 60000, available_cents: 60000, balance_as_of: "2026-10-15T13:30:00Z", fetched_at: "2026-10-15T13:30:00Z", sync_error: false, status: "active" },
  { account_id: "sav-1", name: "High Yield Savings", institution: "First Bank", currency: "USD", account_kind: "savings", balance_cents: savCents, available_cents: savCents, balance_as_of: "2026-10-15T13:30:00Z", fetched_at: "2026-10-15T13:30:00Z", sync_error: false, status: "active" },
];
const tx = (on: string, cents: number, merchant: string, id: string) => ({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });
const rows = () => ["2026-08-02", "2026-09-02", "2026-10-02"].map((d, i) => tx(d, -100000, "LANDLORD RENT PAYMENT", "rent" + i));
function memDb() {
  const store: { state: any } = { state: null };
  const db: FlowDb = {
    async loadState() { return store.state ? JSON.parse(JSON.stringify(store.state)) : null; },
    async saveState(s: any) { store.state = JSON.parse(JSON.stringify(s)); },
    async loadData() { const d = mapFlowData(rows(), [], [], [], [], bankRows(128000)); return { ok: true, ...d }; },
    async saveRecipients() {},
  };
  return { db, store };
}
function sandboxRail(balances: Record<string, number>) {
  const writes: string[] = [];
  return { writes, balances, rail: { connectors: {
    read: async () => ({ value: 1, source: "Sandbox Bank", as_of: NOW }),
    write: async (_id: string, p: any, key: string) => { writes.push(key); balances[p.from] -= p.amount_cents; balances[p.to] += p.amount_cents; return { reference: "sbx-" + writes.length }; },
    verify: async () => ({ confirmed: true, source: "Sandbox Bank" }),
  }, partners: { money_movement: { live: true, name: "Sandbox Bank" } }, kyc: { state: "verified" } } };
}
const noModel = async () => { throw new Error("the transfer path never needs the model"); };

function planned(savCents: number) {
  const input = { accounts: mapAccounts(bankRows(savCents)), transactions: mapTransactions(rows()), settings: { buffer_cents: 20000 }, sent: [] };
  const p = plan(input as any, NOW);
  const m = p.messages.find((x: any) => /low_balance/.test(x.key));
  assert(m, JSON.stringify(p.messages.map((x: any) => [x.key, x.text])));
  return m;
}

Deno.test("the warning names the exact preventive transfer and carries it as an offer", () => {
  const m = planned(128000);
  assert(/goes under your \$200\.00 buffer on 2026-11-02/.test(m.text), m.text);
  assert(/Moving \$600\.00 from High Yield Savings to Everyday Checking by Nov 1 keeps it above the line\./.test(m.text), m.text);
  assert(/Reply YES and I'll put up that move\./.test(m.text), m.text);
  assert(m.offer, "the offer is attached");
  assertEquals(m.offer.kind, "preventive_transfer");
  assert(m.offer.kind === "preventive_transfer", "the attached offer has the preventive-transfer discriminant");
  assertEquals(m.offer.amount_cents, 60000, "the smallest move that keeps checking above the $200 buffer at the -$400 low point");
  assertEquals(m.offer.from_account_id, "sav-1"); assertEquals(m.offer.to_account_id, "chk-1");
  assertEquals(m.offer.first_below_on, "2026-11-02"); assertEquals(m.offer.land_by, "2026-11-01");
});

Deno.test("the warning's yes stages the move's own card, and the card's yes executes it on the rail", async () => {
  const m = planned(128000);
  const { db } = memDb();
  const rail = sandboxRail({ "chk-1": 60000, "sav-1": 128000 });
  const offer = Object.assign({}, m.offer, { thread_id: "thread-1", message_key: m.key });
  const restated: string[] = [];
  const ans = await offerMessage("yes", { offer, threadId: "thread-1", liveCard: async () => false,
    runFlow: async (text: string) => { restated.push(text); return routeFlows(text, { db, extract: noModel, now: () => NOW, transfer: rail.rail }); },
    clear: async () => true, watch: async () => false }, NOW);
  assert(ans, "the yes is answered");
  assertEquals(restated, ["move $600.00 from High Yield Savings to Everyday Checking"]);
  assert(/Move \$600\.00 from High Yield Savings to Everyday Checking\?/.test(ans!.reply), ans!.reply);
  assertEquals(rail.writes.length, 0, "the warning's yes alone moves nothing");
  const done = await routeFlows("yes", { db, extract: noModel, now: () => NOW, transfer: rail.rail });
  assertEquals(done.route.outcome, "confirmed");
  assertEquals(rail.balances, { "chk-1": 120000, "sav-1": 68000 }, "exactly the preventive $600.00 moved from savings to checking");
});

Deno.test("when the total-cash alert itself fires, the same offer rides on it — savings covering part of the need", () => {
  // Checking $600 + savings $300 = $900 total; the $1,000 rent takes the total under the buffer too, so
  // ALRT-001 fires from the feed, and the offer attaches to that message with the $300 savings can cover.
  const m = planned(30000);
  assert(/^Your cash is \$900\.00 now; it goes under your \$200\.00 buffer on 2026-11-02/.test(m.text), m.text);
  assert(/Moving \$300\.00 from High Yield Savings to Everyday Checking by Nov 1 keeps it above the line\./.test(m.text), m.text);
  assert(m.offer, "the offer is attached");
  assertEquals(m.offer.kind, "preventive_transfer");
  assert(m.offer.kind === "preventive_transfer", "the attached offer has the preventive-transfer discriminant");
  assertEquals(m.offer.amount_cents, 30000, "savings covers $300 of the $600 needed; the offer names what can actually move");
});

Deno.test("a no moves nothing and restates the risk; with nothing in savings no move is offered", async () => {
  const m = planned(128000);
  const offer = Object.assign({}, m.offer, { thread_id: "thread-1", message_key: m.key });
  let flowCalls = 0;
  const ans = await offerMessage("no", { offer, threadId: "thread-1", liveCard: async () => false,
    runFlow: async () => { flowCalls++; return null; }, clear: async () => true, watch: async () => false }, NOW);
  assert(ans, "the no is answered");
  assert(/won't move anything/.test(ans!.reply), ans!.reply);
  assert(/still goes under your buffer on Nov 2/.test(ans!.reply), ans!.reply);
  assertEquals(flowCalls, 0, "a no never reaches the flow");
  const bare = planned(0);
  assert(!bare.offer, "savings is empty: the warning stands alone, no move is offered");
  assert(!/Reply YES and I'll put up that move/.test(bare.text), bare.text);
});

Deno.test("K7 regression: the standalone warning (total cash above the buffer, checking alone dips) names the savings account and says the move once", () => {
  const m = planned(128000);
  assert(!/sav-1/.test(m.text), m.text);
  assertEquals((m.text.match(/Moving \$600\.00/g) || []).length, 1, m.text);
  assert(/Moving \$600\.00 from High Yield Savings to Everyday Checking by Nov 1 keeps it above the line\. Reply YES/.test(m.text), m.text);
});
