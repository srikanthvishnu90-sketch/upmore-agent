// Phase 1 wiring of the chat handler (supabase/functions/_shared/flow_router.ts). These run the real wiring code in Deno
// with an in-memory database and a STUB model. They prove the wiring, not the spec 16 score: the score comes only from
// evals/gauntlet/run-live.cjs against the deployed handler with the real model.
import { routeFlows, anthropicRouteExtractor, mapFlowData, hasLiveCard, flowErrorReply, merchantDirectory, LIVE_PARTNERS, type FlowDb } from "../../supabase/functions/_shared/flow_router.ts";
import { AgentRouter, AgentCards } from "../../supabase/functions/_shared/router_core.js";
function assert(v: unknown, m = "assertion failed") { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
import corpusJson from "../../evals/gauntlet/sloppy-20.json" with { type: "json" };
const corpus: any = corpusJson;
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);

function txRows() {
  const out: any[] = []; let n = 0;
  for (const d of ["2026-07-03", "2026-08-03", "2026-09-03", "2026-10-03"]) out.push({ account_id: "visa", provider_transaction_id: "nf" + (++n), amount_cents: -1799, posted_on: d, merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false });
  out.push({ account_id: "visa", provider_transaction_id: "p1", amount_cents: -5000, posted_on: null, merchant_raw: "PENDING THING", is_pending: true, is_transfer: false });
  return out;
}
function memDb(opts: { fail?: string; people?: any[] } = {}) {
  const store: { state: any; saves: number } = { state: null, saves: 0 };
  const db: FlowDb = {
    async loadState() { if (opts.fail === "state") throw new Error("Flow state unavailable."); return store.state ? JSON.parse(JSON.stringify(store.state)) : null; },
    async saveState(s: any) { store.saves++; store.state = JSON.parse(JSON.stringify(s)); },
    async loadData() { if (opts.fail === "data") return { ok: false, missing: "transactions", transactions: [], brokerageAccounts: [], people: [], instruments: [], directory: {} }; const d = mapFlowData(txRows(), [{ id: "acct-1", provider: "alpaca", label: "main", paper: true, status: "active" }], [{ brokerage_account_id: "acct-1", cash: 2500, snapshot_at: "2026-10-12T13:00:00Z" }]); if (opts.people) d.people = opts.people; return { ok: true, ...d }; },
  };
  return { db, store };
}
// A stub model: the extraction a correct model would return for each corpus text. Used only to exercise the wiring.
const STUB: Record<string, any> = {
  "buy $500 of VOO": { intent: "buy_security", amount_span: "$500", amount_cents: 50000, unit: "dollars", instrument_span: "VOO" },
  "cancle netflix": { intent: "cancel_subscription", merchant_span: "netflix" },
  "pay sam back forty": { intent: "send_money", amount_span: "forty", amount_cents: 4000, recipient_span: "sam" },
  "venmo sam 40 for pizza": { intent: "send_money", amount_span: "40", amount_cents: 4000, recipient_span: "sam", memo_span: "pizza" },
};
const stubModel = async (m: string) => STUB[m] ?? { intent: "other" };

Deno.test("data mapping: pending rows are excluded, cents are exact, paper accounts say paper, and no partner is live", () => {
  const d = mapFlowData(txRows(), [{ id: "a", provider: "alpaca", label: "main", paper: true, status: "active" }, { id: "b", provider: "alpaca", label: "old", paper: false, status: "revoked" }], [{ brokerage_account_id: "a", cash: 12.34 }]);
  eq(d.transactions.length, 4); eq(d.transactions[0].amount, -17.99); eq(d.brokerageAccounts.length, 1); eq(d.brokerageAccounts[0].name, "alpaca main (paper)"); eq(d.brokerageAccounts[0].cash_cents, 1234);
  eq(d.people, [], "no saved-recipient table exists, so nobody is presented as saved");
  eq(Object.keys(LIVE_PARTNERS).length, 0, "no rail is live; nothing can be configured to look live");
  assert(Object.keys(merchantDirectory()).length > 0, "the researched cancellation pages are available as guidance");
});

Deno.test("the extractor forces the route_message tool inside the model budget and returns only its input; failures throw so the regex net takes over", async () => {
  const calls: any[] = [];
  const admin = { async rpc(name: string, args: any) { calls.push(name); return { data: name === "agent_model_call_reserve" ? { ok: true, call_id: "c1" } : null, error: null }; } };
  let body: any = null;
  const ok = anthropicRouteExtractor(admin, "u", "t", "test-model", "key", async (_u: any, init: any) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "route_message", input: { intent: "send_money", recipient_span: "sam" } }], usage: { input_tokens: 10, output_tokens: 5 } })); });
  eq(await ok("send sam $40"), { intent: "send_money", recipient_span: "sam" });
  eq(body.tool_choice, { type: "tool", name: "route_message" }); eq(body.tools[0].name, "route_message"); eq(body.system, AgentRouter.SYSTEM); eq(body.model, "test-model");
  eq(calls, ["agent_model_call_reserve", "agent_model_call_record"]);
  let sent = 0;
  const noKey = anthropicRouteExtractor(admin, "u", "t", "m", "", async () => { sent++; return new Response("{}"); });
  let threw = false; try { await noKey("x"); } catch { threw = true; } assert(threw && sent === 0, "no key: no call, a throw");
  const bad = anthropicRouteExtractor(admin, "u", "t", "m", "key", async () => new Response("overloaded", { status: 529 }));
  threw = false; try { await bad("x"); } catch { threw = true; } assert(threw, "HTTP failure throws");
  const none = anthropicRouteExtractor(admin, "u", "t", "m", "key", async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 1, output_tokens: 1 } })));
  threw = false; try { await none("x"); } catch { threw = true; } assert(threw, "no tool call throws");
});

Deno.test("ordinary chat falls through without a model call; a flow message is routed and its state saved before the reply", async () => {
  const { db, store } = memDb(); let calls = 0; const count = async (m: string) => { calls++; return stubModel(m); };
  eq(await routeFlows("what's a roth ira", { db, extract: count, now: () => T0 }), null); eq(calls, 0); eq(store.saves, 0);
  const r = await routeFlows("cancle netflix", { db, extract: count, now: () => T0 });
  assert(r, "routed"); eq(calls, 1); eq(r!.route.flow, "cancel"); eq(r!.route.source, "model"); eq(r!.route.understood, true); eq(r!.route.outcome, "needs_terms");
  assert(/^I can't read Netflix's account page from here yet/.test(r!.reply), r!.reply); assert(/Nothing was changed/.test(r!.reply));
  eq(store.saves, 1);
});

Deno.test("live rails answer honestly: a buy stops at the compliance gate before any question, a Venmo send is staged for the person to send, nothing is ever written", async () => {
  const { db } = memDb();
  const b = await routeFlows("buy $500 of VOO", { db, extract: stubModel, now: () => T0 });
  eq(b!.route.flow, "trade"); eq(b!.route.understood, true); eq(b!.route.outcome, "blocked"); assert(/^I can't place orders yet: that needs a broker-dealer partner\./.test(b!.reply), b!.reply);
  const s = await routeFlows("venmo sam 40 for pizza", { db, extract: stubModel, now: () => T0 });
  eq(s!.route.flow, "send"); eq(s!.route.understood, true); assert(s!.route.outcome === "ask" || s!.route.outcome === "confirm", s!.route.outcome!);
  assert(/sam/i.test(s!.reply), s!.reply); assert(s!.route.outcome !== "confirm" || /Set up/.test(s!.reply), "a send is only ever staged for the person to send");
});

Deno.test("a model failure falls back to the regex net and says so in the route data", async () => {
  const { db } = memDb();
  const r = await routeFlows("cancel netflix", { db, extract: async () => { throw new Error("overloaded"); }, now: () => T0 });
  eq(r!.route.source, "regex_net"); eq(r!.route.flow, "cancel"); eq(r!.route.understood, true);
  const s = await routeFlows("cancel netflix", { db, extract: null, now: () => T0 });
  eq(s!.route.source, "regex_net");
});

Deno.test("a flow-layer failure gives one honest line for flow-shaped messages and leaves ordinary chat alone", async () => {
  const e = flowErrorReply("send sam $40"); assert(e && /I did nothing\. Nothing was changed\./.test(e.reply)); eq(e!.route.route, "error");
  eq(flowErrorReply("what's a roth ira"), null);
  eq(flowErrorReply("482913")!.withhold_user_text, true, "a code is never stored, even on the error path");
  const { db } = memDb({ fail: "data" });
  const u = await routeFlows("cancel netflix", { db, extract: stubModel, now: () => T0 });
  eq(u!.route.outcome, "unavailable"); eq(u!.reply, "I can't read your transactions right now, so I can't do that yet. Nothing was changed.");
});

Deno.test("state survives between messages through the store: the card is restored, a reply skips the model, a stale yes fires nothing, and one yes stages once", async () => {
  // A saved recipient is supplied here because no recipient table exists live; this exercises the restore path only.
  const people = [{ id: "p1", name: "Sam K", handle: "@samk", rails: ["venmo"], history: [{ amount_cents: 2000, on: "2026-09-01" }] }];
  const { db, store } = memDb({ people }); let now = T0; let calls = 0; const count = async (m: string) => { calls++; return stubModel(m); };
  const a = await routeFlows("pay sam back forty", { db, extract: count, now: () => now });
  eq(a!.route.outcome, "confirm"); assert(/^Set up \$40\.00 to Sam K \(@samk\) in Venmo/.test(a!.reply), a!.reply); assert(AgentCards.segments(a!.reply).segments <= 2);
  assert(hasLiveCard(store.state), "the card is in the saved state");
  now += 11 * 60000;
  const late = await routeFlows("yes", { db, extract: count, now: () => now });
  eq(calls, 1, "a reply to a live card never reaches the model"); eq(late!.route.source, "deterministic"); eq(late!.route.outcome, "expired");
  const b = await routeFlows("pay sam back forty", { db, extract: count, now: () => now });
  eq(b!.route.outcome, "confirm");
  const y = await routeFlows("yes", { db, extract: count, now: () => now + 60000 });
  eq(y!.route.outcome, "staged", "the handoff is staged for the person to send; no rail is written");
  const again = await routeFlows("yes", { db, extract: count, now: () => now + 120000 });
  assert(again === null || again.route.outcome !== "staged", "a second yes stages nothing");
});

Deno.test("with the model down, the regex net still routes the corpus to the right flow, and every reply fits two SMS segments", async () => {
  const misses: string[] = [];
  for (const item of corpus.items) {
    const { db } = memDb();
    const r = await routeFlows(item.text, { db, extract: null, now: () => T0 });
    if (!r || r.route.flow !== item.flow) { misses.push(`${item.id} ${item.text} -> ${r ? r.route.flow : "fallthrough"}`); continue; }
    eq(r.route.source, "regex_net");
    const seg = AgentCards.segments(r.reply).segments;
    assert(seg <= 2, `${item.id} reply is ${seg} segments: ${r.reply}`);
  }
  eq(misses, [], "regex-net routing misses");
});
