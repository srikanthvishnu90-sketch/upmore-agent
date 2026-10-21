// Own-account transfers wired into chat (PAY-009; real-world C30): routeFlows stages the transfer session's
// confirmation card from the person's words, the card's own yes executes on the injected sandbox rail and is
// verified before the receipt, and with no rail injected (the production shape) the compliance gate stops the
// staging with its specific partner message — no card, no claim. The windfall chain runs end to end: plan()
// attaches the sweep offer with both account names, a yes restates the move into this same flow, and the card's
// yes is what moves the money. In-memory database, stub model, fake rail (mocks live only in tests).
import { routeFlows as routeFlowsTyped, mapFlowData, hasLiveCard, type FlowDb } from "../../supabase/functions/_shared/flow_router.ts";
import { plan, offerMessage, mapAccounts, mapTransactions, type WindfallOffer } from "../../supabase/functions/_shared/proactive.ts";
import { assert, assertEquals } from "jsr:@std/assert@1";
const routeFlows = (m: string, d: any): Promise<any> => routeFlowsTyped(m, d);
const T0 = Date.UTC(2026, 9, 15, 14, 0, 0);

const bankRows = () => [
  { account_id: "chk-1", name: "Everyday Checking", institution: "First Bank", currency: "USD", account_kind: "checking", balance_cents: 500000, available_cents: 500000, balance_as_of: "2026-10-15T13:30:00Z", fetched_at: "2026-10-15T13:30:00Z", sync_error: false, status: "active" },
  { account_id: "sav-1", name: "High Yield Savings", institution: "First Bank", currency: "USD", account_kind: "savings", balance_cents: 1280000, available_cents: 1280000, balance_as_of: "2026-10-15T13:30:00Z", fetched_at: "2026-10-15T13:30:00Z", sync_error: false, status: "active" },
];
function memDb() {
  const store: { state: any; saves: number } = { state: null, saves: 0 };
  const db: FlowDb = {
    async loadState() { return store.state ? JSON.parse(JSON.stringify(store.state)) : null; },
    async saveState(s: any) { store.saves++; store.state = JSON.parse(JSON.stringify(s)); },
    async loadData() { const d = mapFlowData([], [], [], [], [], bankRows()); return { ok: true, ...d }; },
    async saveRecipients() {},
  };
  return { db, store };
}
// A fake rail (mock, tests only): balances live on the rail; verify reads them back.
function sandboxRail(balances: Record<string, number>) {
  const writes: string[] = [];
  return { writes, balances, rail: { connectors: {
    read: async () => ({ value: 1, source: "Sandbox Bank", as_of: T0 }),
    write: async (_id: string, p: any, key: string) => { writes.push(key); balances[p.from] -= p.amount_cents; balances[p.to] += p.amount_cents; return { reference: "sbx-" + writes.length }; },
    verify: async () => ({ confirmed: true, source: "Sandbox Bank" }),
  }, partners: { money_movement: { live: true, name: "Sandbox Bank" } }, kyc: { state: "verified" } } };
}
const noModel = async () => { throw new Error("the transfer path never needs the model"); };
const MOVE = "move $500 from Everyday Checking to High Yield Savings";

Deno.test("chat stages the transfer card, and only the card's own yes moves the money on the rail", async () => {
  const { db, store } = memDb();
  const rail = sandboxRail({ "chk-1": 500000, "sav-1": 1280000 });
  const card = await routeFlows(MOVE, { db, extract: noModel, now: () => T0, transfer: rail.rail });
  assert(card, "routed");
  assertEquals(card.route.flow, "transfer"); assertEquals(card.route.route, "own_transfer"); assertEquals(card.route.outcome, "confirm");
  assert(/Move \$500\.00 from Everyday Checking to High Yield Savings\? No fee\./.test(card.reply), card.reply);
  assertEquals(rail.writes.length, 0, "nothing moves before the yes");
  assert(hasLiveCard(store.state), "the saved state carries the live card");
  const done = await routeFlows("yes", { db, extract: noModel, now: () => T0, transfer: rail.rail });
  assert(done, "the yes is routed");
  assertEquals(done.route.outcome, "confirmed");
  assert(/\(ref sbx-1\)/.test(done.reply), done.reply);
  assert(/Confirmed by Sandbox Bank\./.test(done.reply), done.reply);
  assertEquals(rail.balances, { "chk-1": 450000, "sav-1": 1330000 }, "both balances moved by exactly $500.00");
  assertEquals(rail.writes.length, 1);
  assert(!hasLiveCard(store.state), "the card is settled");
});

Deno.test("a no in chat drops the transfer card and moves nothing", async () => {
  const { db, store } = memDb();
  const rail = sandboxRail({ "chk-1": 500000, "sav-1": 1280000 });
  await routeFlows(MOVE, { db, extract: noModel, now: () => T0, transfer: rail.rail });
  const no = await routeFlows("no", { db, extract: noModel, now: () => T0, transfer: rail.rail });
  assert(no, "the no is routed");
  assertEquals(no.route.outcome, "declined");
  assertEquals(rail.writes.length, 0);
  assertEquals(rail.balances, { "chk-1": 500000, "sav-1": 1280000 });
  assert(!hasLiveCard(store.state));
});

Deno.test("production shape: no rail injected, the staging stops at the compliance gate and no card exists", async () => {
  const { db, store } = memDb();
  const r = await routeFlows(MOVE, { db, extract: noModel, now: () => T0 });
  assert(r, "the message is still answered by the flow");
  assertEquals(r.route.flow, "transfer"); assertEquals(r.route.outcome, "blocked");
  assert(/licensed money-movement partner/.test(r.reply), r.reply);
  assert(!/Move \$500\.00 from/.test(r.reply), "no card is shown that the stack cannot honor");
  assert(!hasLiveCard(store.state), "nothing is left pending");
});

Deno.test("a transfer to a person is never captured by the transfer flow", async () => {
  const { db, store } = memDb();
  const rail = sandboxRail({ "chk-1": 500000, "sav-1": 1280000 });
  const r = await routeFlows("transfer $50 to Maya", { db, extract: async () => ({ intent: "other" }), now: () => T0, transfer: rail.rail });
  assert(!r || r.route.flow !== "transfer", JSON.stringify(r && r.route));
  assert(!(store.state && store.state.transfer && store.state.transfer.pending), "no transfer card was staged");
  assertEquals(rail.writes.length, 0);
});

// ---- The windfall chain, end to end (C30's Done-when): finding -> offer -> yes -> card -> yes -> moved. ----
const tx = (on: string, cents: number, merchant: string, id: string) => ({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });
const paychecks = ["2026-07-24", "2026-08-07", "2026-08-21", "2026-09-04", "2026-09-18", "2026-10-02"].map((d, i) => tx(d, 180000, "ACME CORP PAYROLL DIR DEP", "pay" + i));

Deno.test("windfall chain: the offer's yes stages the sweep's own card, and the card's yes sweeps exactly the offered amount", async () => {
  const { db } = memDb();
  const rail = sandboxRail({ "chk-1": 500000, "sav-1": 1280000 });
  const input = { accounts: mapAccounts(bankRows()), transactions: mapTransactions(paychecks.concat([tx("2026-10-11", 420000, "IRS TREASURY REFUND", "wf1")])), settings: null, sent: [] };
  const p = plan(input as any, Date.UTC(2026, 9, 11, 14, 0, 0));
  const m = p.messages.find((x: any) => /windfall/.test(x.key));
  assert(m && m.offer, "the windfall finding carries its offer");
  assertEquals((m.offer as WindfallOffer).from_name, "Everyday Checking"); assertEquals((m.offer as WindfallOffer).to_name, "High Yield Savings");
  assertEquals((m.offer as WindfallOffer).sweep_cents, 210000);
  const offer = Object.assign({}, m.offer, { thread_id: "thread-1", message_key: m.key });
  const restated: string[] = [];
  const ans = await offerMessage("yes", { offer, threadId: "thread-1", liveCard: async () => false,
    runFlow: async (text: string) => { restated.push(text); return routeFlows(text, { db, extract: noModel, now: () => T0, transfer: rail.rail }); },
    clear: async () => true, watch: async () => false }, T0);
  assert(ans, "the yes is answered");
  assertEquals(restated, ["move $2,100.00 from Everyday Checking to High Yield Savings"], "the offer restates the exact move in the flow's words");
  assert(/Move \$2,100\.00 from Everyday Checking to High Yield Savings\?/.test(ans!.reply), ans!.reply);
  assertEquals(rail.writes.length, 0, "the offer's yes alone moves nothing — the card still needs its own yes");
  const done = await routeFlows("yes", { db, extract: noModel, now: () => T0, transfer: rail.rail });
  assert(done, "the card's yes is routed");
  assertEquals(done.route.outcome, "confirmed");
  assertEquals(rail.balances, { "chk-1": 290000, "sav-1": 1490000 }, "exactly the offered $2,100.00 sweep moved");
});
