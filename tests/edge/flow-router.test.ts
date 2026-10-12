// Phase 1 wiring of the chat handler (supabase/functions/_shared/flow_router.ts). These run the real wiring code in Deno
// with an in-memory database and a STUB model. They prove the wiring, not the spec 16 score: the score comes only from
// evals/gauntlet/run-live.cjs against the deployed handler with the real model.
import { routeFlows as routeFlowsTyped, routeExtractor, mapFlowData, hasLiveCard, flowErrorReply, merchantDirectory, userBroker, brokerSource, LIVE_PARTNERS, type FlowDb } from "../../supabase/functions/_shared/flow_router.ts";
const anthropicRouteExtractor = (a: any, u: string, t: string, model: string, apiKey: string, request: any) => routeExtractor(a, u, t, { provider: "anthropic", model, apiKey, reasoningEffort: null }, { request });
import { AgentRouter, AgentCards } from "../../supabase/functions/_shared/router_core.js";
function assert(v: unknown, m = "assertion failed") { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
import corpusJson from "../../evals/gauntlet/sloppy-20.json" with { type: "json" };
const corpus: any = corpusJson;
// The tests read reply and route from flow replies and note from fallthrough notes; one loose type for both.
const routeFlows = (m: string, d: any): Promise<any> => routeFlowsTyped(m, d);
// The published-terms reader (Rail 3) fetches with the global fetch. These tests never touch the network: Netflix's terms
// URL is served from the SYNTHETIC fixture, everything else answers 403.
// A minimal SYNTHETIC page with the same structure as tests/fixtures/terms/netflix.html (inline, so the recorder's
// no-permission run needs no file read).
const NETFLIX_TERMS_FIXTURE = `<h2>3. Billing and Cancellation</h2><h3>3.3 Cancellation</h3><p>You can cancel your Netflix membership at any time, and you will continue to have access to the Netflix service through the end of your billing period. We do not provide refunds or credits for any partial membership periods.</p><h2>4. Netflix Service</h2><p>x</p>`;
const offlineFetch = (async (u: any) => String(u) === "https://help.netflix.com/legal/termsofuse" && NETFLIX_TERMS_FIXTURE ? new Response(NETFLIX_TERMS_FIXTURE) : new Response("forbidden", { status: 403 })) as unknown as typeof fetch;
globalThis.fetch = offlineFetch;
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);

function txRows() {
  const out: any[] = []; let n = 0;
  for (const d of ["2026-07-03", "2026-08-03", "2026-09-03", "2026-10-03"]) out.push({ account_id: "visa", provider_transaction_id: "nf" + (++n), amount_cents: -1799, posted_on: d, merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false });
  out.push({ account_id: "visa", provider_transaction_id: "p1", amount_cents: -5000, posted_on: null, merchant_raw: "PENDING THING", is_pending: true, is_transfer: false });
  return out;
}
function memDb(opts: { fail?: string; people?: any[]; recipients?: any[]; tx?: any[]; failSave?: boolean } = {}) {
  const store: { state: any; saves: number; recipients: any[]; recipientWrites: any[] } = { state: null, saves: 0, recipients: (opts.recipients || []).slice(), recipientWrites: [] };
  const db: FlowDb = {
    async loadState() { if (opts.fail === "state") throw new Error("Flow state unavailable."); return store.state ? JSON.parse(JSON.stringify(store.state)) : null; },
    async saveState(s: any) { store.saves++; store.state = JSON.parse(JSON.stringify(s)); },
    async loadData() { if (opts.fail === "data") return { ok: false, missing: "transactions", transactions: [], brokerageAccounts: [], people: [], instruments: [], directory: {} }; const d = mapFlowData(txRows().concat(opts.tx || []), [{ id: "acct-1", provider: "alpaca", label: "main", paper: true, status: "active" }], [{ brokerage_account_id: "acct-1", cash: 2500, snapshot_at: "2026-10-12T13:00:00Z" }], opts.fail === "recipients" ? null : JSON.parse(JSON.stringify(store.recipients))); if (opts.people) d.people = opts.people; return { ok: true, ...d }; },
    async saveRecipients(rows: any[]) { if (opts.failSave) throw new Error("recipient store down"); for (const r of rows) { store.recipientWrites.push(r); if (r.op === "insert") store.recipients.push({ id: "rec-" + store.recipients.length, handle: r.handle, display_name: r.display_name, channel: r.channel, source: r.source, rail: r.rail, last_used_at: r.last_used_at }); } },
  };
  return { db, store };
}
// A stub model: the extraction a correct model would return for each corpus text. Used only to exercise the wiring.
const STUB: Record<string, any> = {
  "buy $500 of VOO": { intent: "buy_security", amount_span: "$500", amount_cents: 50000, unit: "dollars", instrument_span: "VOO" },
  "buy $5 of VOO": { intent: "buy_security", amount_span: "$5", amount_cents: 500, unit: "dollars", instrument_span: "VOO" },
  "buy $6 of VOO": { intent: "buy_security", amount_span: "$6", amount_cents: 600, unit: "dollars", instrument_span: "VOO" },
  "cancel netflix": { intent: "cancel_subscription", merchant_span: "netflix" },
  "pay sam back forty": { intent: "send_money", amount_span: "forty", amount_cents: 4000, recipient_span: "sam" },
  "venmo sam 40 for pizza": { intent: "send_money", amount_span: "40", amount_cents: 4000, recipient_span: "sam", memo_span: "pizza" },
};
const stubModel = async (m: string) => STUB[m] ?? { intent: "other" };

Deno.test("data mapping: pending rows are excluded, cents are exact, a paper account is never listed (everything is live), and no partner is live", () => {
  const d = mapFlowData(txRows(), [{ id: "p", provider: "alpaca", label: "practice", paper: true, status: "active" }, { id: "a", provider: "alpaca", label: "main", paper: false, status: "active" }, { id: "b", provider: "alpaca", label: "old", paper: false, status: "revoked" }], [{ brokerage_account_id: "a", cash: 12.34 }]);
  eq(d.transactions.length, 4); eq(d.transactions[0].amount, -17.99); eq(d.brokerageAccounts.length, 1); eq(d.brokerageAccounts[0].name, "alpaca main"); eq(d.brokerageAccounts[0].id, "a"); eq(d.brokerageAccounts[0].cash_cents, 1234);
  eq(d.people, [], "people come only from saved_recipients rows"); eq(d.recipients, []); eq(d.recipients_ok, true);
  eq(mapFlowData([], [], [], null).recipients_ok, false, "an unreadable recipient table is reported, never treated as empty");
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
  assert(/^I can't read Netflix's account page/.test(r!.reply), r!.reply); assert(/Netflix's terms \(help\.netflix\.com\/legal\/termsofuse, 14:00 UTC\): access to the end of the billing period/.test(r!.reply), r!.reply); assert(/Nothing was changed/.test(r!.reply));
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
  eq(calls, 1, "a reply to a live card never reaches the model"); eq(late!.route.source, "deterministic");
  // The stale yes fires nothing; a fresh card is re-offered for a fresh yes (spec 16 item 4, corpus 2.09).
  eq(late!.route.outcome, "confirm"); assert(/^That card expired, so nothing was sent\. Here's a fresh one: Set up \$40\.00 to Sam K/.test(late!.reply), late!.reply);
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

Deno.test("Rail 1 live wiring: pay and split share saved_recipients; a stranger is confirmed in full, saved only when the debit posts, then goes straight to the card", async () => {
  const sarah = { id: "r1", handle: "@sarah_m", display_name: "Sarah M", channel: "sms", source: "completed_send", rail: "venmo", last_used_at: "2026-10-01T00:00:00Z" };
  const { db, store } = memDb({ recipients: [sarah] }); let now = T0; let calls = 0;
  const model: Record<string, any> = {
    "venmo dana 25 for tickets": { intent: "send_money", amount_span: "25", amount_cents: 2500, recipient_span: "dana", memo_span: "tickets" },
    "split $60 with sarah and dana": { intent: "split_expense", amount_span: "$60", amount_cents: 6000, recipient_span: "sarah and dana" },
  };
  const extract = async (m: string) => { calls++; return model[m] ?? { intent: "other" }; };
  const go = (m: string) => routeFlows(m, { db, extract, now: () => now, channel: "sms" });
  const a = await go("venmo dana 25 for tickets");
  eq(a!.route.flow, "send"); eq(a!.route.outcome, "ask"); eq(a!.route.ask_reason, "new_recipient"); assert(/^I don't have Dana on file\. New recipients are confirmed in full, every time\. What's Dana's Venmo handle\?$/.test(a!.reply), a!.reply);
  const b = await go("@dana-k"); assert(/^New recipient: Dana, Venmo @dana-k\./.test(b!.reply), b!.reply); eq(calls, 1, "the handle never reaches the model");
  const c = await go("@dana-k"); eq(c!.route.outcome, "confirm"); assert(/^New recipient, first send: set up \$25\.00 to Dana \(@dana-k\) in Venmo/.test(c!.reply), c!.reply); assert(AgentCards.segments(c!.reply).segments <= 2);
  const y = await go("yes"); eq(y!.route.outcome, "staged"); eq(store.recipientWrites.length, 0, "staged is not sent: nobody saved");
  // The debit posts; the next routed message announces it and the recipient is saved with the transaction as evidence.
  const { db: db2, store: store2 } = memDb({ recipients: [sarah], tx: [{ account_id: "chk", provider_transaction_id: "v-555", amount_cents: -2500, posted_on: "2026-10-12", merchant_raw: "VENMO *DANA K", is_pending: false, is_transfer: false }] });
  store2.state = store.state; now += 3600000;
  const go2 = (m: string) => routeFlows(m, { db: db2, extract, now: () => now, channel: "sms" });
  const s = await go2("split $60 with sarah and dana");
  assert(/^Landed\. \$25\.00 to Dana/.test(s!.reply), s!.reply);
  eq(store2.recipientWrites.length, 1); eq(store2.recipientWrites[0].source, "completed_send"); eq(store2.recipientWrites[0].evidence_ref, "txn:v-555"); eq(store2.recipientWrites[0].channel, "sms");
  eq(s!.route.flow, "split"); eq(s!.route.outcome, "confirm", "Dana, saved from the pay flow, resolves by name in the split flow");
  assert(/Request \$20\.00 each from Sarah M \(@sarah_m\) and Dana \(@dana-k\) in Venmo: \$60\.00 split 3 ways, yours \$20\.00/.test(s!.reply), s!.reply);
});

Deno.test("Rail 1 live wiring: unreadable recipients are said plainly; a SAVE that cannot be written is never claimed", async () => {
  const { db } = memDb({ fail: "recipients" });
  const r = await routeFlows("venmo sam 40 for pizza", { db, extract: stubModel, now: () => T0 });
  eq(r!.route.outcome, "unavailable"); eq(r!.reply, "I can't read your saved recipients right now, so I can't pay or request from anyone yet. Nothing was changed.");
  const { db: d2, store } = memDb({ failSave: true }); let now = T0;
  const model = async (m: string) => m === "venmo dana 25" ? { intent: "send_money", amount_span: "25", amount_cents: 2500, recipient_span: "dana" } : { intent: "other" };
  for (const m of ["venmo dana 25", "@dana-k", "@dana-k", "yes"]) await routeFlows(m, { db: d2, extract: model, now: () => now });
  const s = await routeFlows("SAVE", { db: d2, extract: model, now: () => now });
  eq(s!.route.outcome, "not_saved"); eq(s!.reply, "I couldn't save that right now, so nothing was saved. Reply SAVE again in a moment."); assert(s!.route.problems.includes("recipient save failed"));
  eq(store.recipients.length, 0);
});

// Brokerage connect wiring (live only, each person's own Alpaca account). The broker below is a STUBBED fetch shaped like
// Alpaca's Trading API v2: it proves the edge resolves the caller's own connection and labels it LIVE, not that Alpaca
// accepts these requests.
function stubAlpaca(now: () => number, tokens: Record<string, string>) {
  const calls: { method: string; url: string; body: any; auth: string | null }[] = [];
  const orders: any[] = [];
  const f = async (input: any, init: any = {}) => {
    const url = String(input), u = new URL(url), method = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
    const auth = (init.headers || {}).authorization || null;
    calls.push({ method, url, body, auth });
    const ok = (j: any, status = 200) => new Response(j === undefined ? null : JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
    const acct = tokens[String(auth || "").replace(/^Bearer /, "")];
    if (!acct) return ok({ message: "unauthorized" }, 401);
    const t = new Date(now() - 30000).toISOString();
    if (u.pathname === "/v2/account") return ok({ id: acct, status: "ACTIVE", buying_power: "10000.00", cash: "10000.00" });
    if (u.pathname === "/v2/clock") return ok({ is_open: true, next_open: "2026-10-13T09:30:00-04:00" });
    if (u.pathname === "/v2/assets/VOO") return ok({ symbol: "VOO", name: "Vanguard S&P 500 ETF", tradable: true, fractionable: true, status: "active" });
    if (u.pathname === "/v2/stocks/VOO/quotes/latest") return ok({ symbol: "VOO", quote: { t, ap: 512.1, bp: 512.0 } });
    if (u.pathname === "/v2/orders" && method === "POST") { const o = { id: "ord-" + (orders.length + 1), client_order_id: body.client_order_id, symbol: body.symbol, side: body.side, type: body.type, time_in_force: body.time_in_force, notional: body.notional ?? null, qty: body.qty ?? null, filled_qty: "0.0097", filled_avg_price: "512.10", status: "filled", submitted_at: t, filled_at: t, account: acct }; orders.push(o); return ok(o); }
    const m = /\/v2\/orders\/([^/]+)$/.exec(u.pathname); if (m && method === "GET") { const o = orders.find(x => x.id === m[1] && x.account === acct); return o ? ok(o) : ok({ message: "not found" }, 404); }
    if (u.pathname === "/v2/positions") return ok([{ symbol: "VOO", qty: "0.0097", market_value: "4.97" }]);
    return ok({ message: "not found" }, 404);
  };
  return { f: f as unknown as typeof fetch, calls };
}
const envOf = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
const U1 = "u-1", U2 = "u-2";
const liveRow = (user: string, acct: string, extra: Record<string, unknown> = {}) => ({ id: "row-" + user, user_id: user, provider: "alpaca", label: "main", paper: false, account_id: acct, account_mask: "****1111", status: "active", created_at: "2026-10-02", ...extra });
// The Vault read as broker_token_read does it: by the caller and the row.
const TOKENS: Record<string, string> = { "u-1|row-u-1": JSON.stringify({ access_token: "tok-1" }), "u-2|row-u-2": JSON.stringify({ access_token: "tok-2" }) };
const srcOf = (rows: any[] | null, marks: any[] = []): any => ({ rows: async () => rows, token: async (q: any) => TOKENS[`${q.user_id}|${q.account}`] ?? null, markReconnect: async (q: any) => { marks.push(q); return true; } });

Deno.test("Brokerage wiring: no connection, an unreadable table, a leaked row, a revoked link and a provider not built each give the trade flow the honest answer, never a broker", async () => {
  const lines: string[] = [];
  eq((await userBroker(envOf({}), U1, null)).connect!.code, "unavailable");
  eq((await userBroker(envOf({}), U1, srcOf(null), l => lines.push(l))).connect!.code, "unavailable"); eq(lines.pop(), "[LIVE] NOT_WIRED: brokerage connections could not be read");
  const leak = await userBroker(envOf({}), U1, srcOf([liveRow(U2, "acct-2"), liveRow(U1, "acct-1")]), l => lines.push(l));
  eq(leak.connect!.code, "isolation"); eq(lines.pop(), "[LIVE] ISOLATION: 1 brokerage row(s) for another user reached this request, so no account was opened");
  const none = await userBroker(envOf({}), U1, srcOf([]));
  eq(none.connect!.code, "connect"); eq(none.connectors, undefined);
  eq((await userBroker(envOf({}), U1, srcOf([liveRow(U1, "acct-1", { status: "reconnect" })]))).connect!.code, "reconnect");
  eq((await userBroker(envOf({}), U1, srcOf([liveRow(U1, "acct-1", { provider: "schwab" })]))).connect!.code, "not_wired");
  const { db } = memDb();
  const b = await routeFlows("buy $5 of VOO", { db, extract: stubModel, now: () => T0, broker: none });
  eq(b!.route.outcome, "blocked"); eq(b!.reply, "No brokerage is connected yet, so nothing was placed - here's the link.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca");
});

Deno.test("Brokerage wiring: brokerSource reads the caller's rows through the RLS client, the token and the Reconnect mark through service-role RPCs keyed by caller and row", async () => {
  const seen: any[] = [];
  const caller = { from: (t: string) => ({ select: (c: string) => ({ eq: async (k: string, v: string) => { seen.push({ t, c, k, v }); return { data: [liveRow(U1, "acct-1")], error: null }; } }) }) };
  const admin = { rpc: async (fn: string, args: any) => { seen.push({ fn, args }); return { data: fn === "broker_token_read" ? "tok-1" : true, error: null }; } };
  const src = brokerSource(caller, admin, U1);
  eq((await src.rows())!.length, 1); eq(await src.token({ user_id: U1, account: "row-u-1" }), "tok-1"); eq(await src.markReconnect({ user_id: U1, account: "row-u-1" }), true);
  eq(seen[0].t, "brokerage_accounts"); eq(seen[0].k, "user_id"); eq(seen[0].v, U1); assert(!seen[0].c.includes("vault_key_ref"), "the client never selects the vault reference");
  eq(seen[1].fn, "broker_token_read"); eq(JSON.stringify(seen[1].args), JSON.stringify({ p_user: U1, p_account: "row-u-1" }));
  eq(seen[2].fn, "broker_mark_reconnect"); eq(JSON.stringify(seen[2].args), JSON.stringify({ p_user: U1, p_account: "row-u-1" }));
  const failing = brokerSource({ from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "denied" } }) }) }) }, { rpc: async () => ({ data: null, error: { message: "x" } }) }, U1);
  eq(await failing.rows(), null);
});

Deno.test("Brokerage wiring: with the caller's own live account, a $5 buy cards with LIVE and a sourced quote, a yes places one order with the caller's token, the receipt is LIVE, and $6 is over the cap", async () => {
  const lines: string[] = []; let now = T0; const stub = stubAlpaca(() => now, { "tok-1": "acct-1", "tok-2": "acct-2" });
  const broker = await userBroker(envOf({}), U1, srcOf([liveRow(U1, "acct-1")]), l => lines.push(l), stub.f);
  assert(broker.connectors, "bound"); eq(broker.label, "LIVE (your Alpaca account)"); eq(broker.account.account_id, "acct-1"); eq(broker.account.order_cap_cents, 500);
  const { db } = memDb();
  const go = (m: string) => routeFlows(m, { db, extract: stubModel, now: () => now, broker });
  const over = await go("buy $6 of VOO"); eq(over!.route.outcome, "stop"); eq(over!.reply, "That's about $6.00; live orders are limited to $5.00 each while Upmore is in testing. Nothing was placed.");
  const c = await go("buy $5 of VOO");
  eq(c!.route.outcome, "confirm"); assert(/^LIVE: Buy \$5\.00 of VOO \(Vanguard S&P 500 ETF\) in your Alpaca account \(\*\*\*\*1111\)\. No fee\. Quote \$512\.10 \(your Alpaca account, IEX ask, 13:59 UTC\)\./.test(c!.reply), c!.reply);
  eq(stub.calls.filter(x => x.method === "POST").length, 0, "nothing before the yes");
  now += 60000;
  const y = await go("yes");
  eq(y!.route.outcome, "filled"); assert(/^LIVE: Done: bought 0\.0097 VOO .* order ord-1, filled/.test(y!.reply), y!.reply);
  const posts = stub.calls.filter(x => x.method === "POST"); eq(posts.length, 1); eq(posts[0].body.notional, "5.00");
  eq(posts[0].url, "https://api.alpaca.markets/v2/orders"); eq(posts[0].auth, "Bearer tok-1");
  assert(lines.length > 4); for (const l of lines) { assert(l.startsWith("[LIVE (your Alpaca account)]"), l); assert(!l.includes("tok-1"), "no token in any log line"); }
});

Deno.test("Brokerage wiring: two people trade in their own accounts with their own tokens; a revoked token is marked for Reconnect and said, nothing placed", async () => {
  let now = T0; const stub = stubAlpaca(() => now, { "tok-1": "acct-1", "tok-2": "acct-2" });
  const b1 = await userBroker(envOf({}), U1, srcOf([liveRow(U1, "acct-1")]), () => {}, stub.f);
  const b2 = await userBroker(envOf({}), U2, srcOf([liveRow(U2, "acct-2")]), () => {}, stub.f);
  const m1 = memDb(), m2 = memDb();
  eq((await routeFlows("buy $5 of VOO", { db: m1.db, extract: stubModel, now: () => now, broker: b1 }))!.route.outcome, "confirm");
  eq((await routeFlows("buy $5 of VOO", { db: m2.db, extract: stubModel, now: () => now, broker: b2 }))!.route.outcome, "confirm");
  now += 60000;
  eq((await routeFlows("yes", { db: m1.db, extract: stubModel, now: () => now, broker: b1 }))!.route.outcome, "filled");
  eq((await routeFlows("yes", { db: m2.db, extract: stubModel, now: () => now, broker: b2 }))!.route.outcome, "filled");
  const posts = stub.calls.filter(x => x.method === "POST"); eq(posts.map(p => p.auth).join(" "), "Bearer tok-1 Bearer tok-2", "each person's order went with that person's own token");
  const marks: any[] = [];
  const revoked = await userBroker(envOf({}), U1, { rows: async () => [liveRow(U1, "acct-1")], token: async () => "tok-revoked", markReconnect: async (q: any) => { marks.push(q); return true; } }, () => {}, stub.f);
  const m3 = memDb();
  const r = await routeFlows("buy $5 of VOO", { db: m3.db, extract: stubModel, now: () => now, broker: revoked });
  await revoked.flush!();
  eq(r!.route.outcome, "blocked"); eq(r!.reply, "Your brokerage connection was revoked or has expired, so nothing was placed - here's the link to reconnect.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca");
  eq(JSON.stringify(marks), JSON.stringify([{ user_id: U1, account: "row-u-1" }])); eq(stub.calls.filter(x => x.method === "POST").length, 2, "nothing new was sent");
});

// L3, state-machine adversarial (spec 16), in SIMULATION: the real wiring, an in-memory store, a stub model and a test clock.
// This proves the wiring's behavior per case; it is not the live gauntlet and is never reported as one.
const L3_MODEL: Record<string, any> = {
  "send sam $40": { intent: "send_money", amount_span: "$40", amount_cents: 4000, recipient_span: "sam" },
  "what's my balance": { intent: "other" },
  "cancel netflix": { intent: "cancel_subscription", merchant_span: "netflix" },
  "send $40 to marcus": { intent: "send_money", amount_span: "$40", amount_cents: 4000, recipient_span: "marcus" },
};
const l3Model = async (m: string) => L3_MODEL[m] ?? { intent: "other" };
const SAM = [{ id: "r1", handle: "@samk", display_name: "Sam K", channel: "sms", source: "completed_send", rail: "venmo", last_used_at: "2026-10-01T00:00:00Z" }];
const MARCUSES = SAM.concat([{ id: "r2", handle: "@marcusl", display_name: "Marcus L", channel: "sms", source: "completed_send", rail: "venmo", last_used_at: null }, { id: "r3", handle: "@mtee", display_name: "Marcus T", channel: "sms", source: "confirmed", rail: "venmo", last_used_at: null }] as any);

Deno.test("L3 interrupt mid-flow: a question while a card is live drops the card and says so; a later yes fires nothing", async () => {
  const { db, store } = memDb({ recipients: SAM }); let now = T0;
  const a = await routeFlows("send sam $40", { db, extract: l3Model, now: () => now }); eq(a.route.outcome, "confirm");
  const b = await routeFlows("what's my balance", { db, extract: l3Model, now: () => now });
  eq(b.fallthrough, true, "the question goes to the normal handler"); eq(b.note, "(I dropped the $40.00 to Sam K since you moved on; nothing was sent. Say it again when you want it.)");
  assert(!hasLiveCard(store.state), "no card is left live");
  const y = await routeFlows("yes", { db, extract: l3Model, now: () => now });
  assert(y === null || y.route.outcome === "nothing_pending", "a yes after the drop fires nothing");
});

Deno.test("spec16 item 6 (found live 2026-10-11): \"actually make it $50\" after a $40 card puts up a $50 card, the $40 one is dead, a yes stages $50 once", async () => {
  const { db } = memDb({ recipients: SAM }); const now = T0;
  const a = await routeFlows("send sam $40", { db, extract: l3Model, now: () => now }); eq(a.route.outcome, "confirm");
  const b = await routeFlows("actually make it $50", { db, extract: l3Model, now: () => now + 1000 });
  eq(b.route.outcome, "confirm"); assert(/^Got it\. Set up \$50\.00 to Sam K/.test(b.reply), b.reply); assert(!/Yes or no\?/.test(b.reply), b.reply);
  const y = await routeFlows("yes", { db, extract: l3Model, now: () => now + 2000 });
  eq(y.route.outcome, "staged"); assert(/\$50\.00/.test(y.reply) && !/\$40\.00/.test(y.reply), y.reply);
});

Deno.test("L3 a yes three hours late fires nothing, says it expired and re-offers; only a yes to the fresh card stages, once", async () => {
  const { db } = memDb({ recipients: SAM }); let now = T0;
  await routeFlows("send sam $40", { db, extract: l3Model, now: () => now });
  now += 3 * 3600000;
  const y = await routeFlows("yes", { db, extract: l3Model, now: () => now });
  eq(y.route.outcome, "confirm"); assert(/^That card expired, so nothing was sent\. Here's a fresh one:/.test(y.reply), y.reply); assert(!/Staged\b/.test(y.reply));
  const fresh = await routeFlows("yes", { db, extract: l3Model, now: () => now + 60000 }); eq(fresh.route.outcome, "staged", "the yes to the fresh card");
  const third = await routeFlows("yes", { db, extract: l3Model, now: () => now + 70000 }); assert(third === null || third.route.outcome !== "staged", "never twice");
});

Deno.test("L3 two yes replies: one staging, the second fires nothing", async () => {
  const { db } = memDb({ recipients: SAM }); const now = T0;
  await routeFlows("send sam $40", { db, extract: l3Model, now: () => now });
  const y1 = await routeFlows("yes", { db, extract: l3Model, now: () => now + 1000 });
  const y2 = await routeFlows("yes", { db, extract: l3Model, now: () => now + 2000 });
  eq(y1.route.outcome, "staged"); assert(y2 === null || y2.route.outcome !== "staged", "the second yes stages nothing");
});

Deno.test("L3 two requests in one text: handled in order, one card at a time, the second starts when the first settles", async () => {
  const { db, store } = memDb({ recipients: SAM }); const now = T0;
  const a = await routeFlows("send sam $40 and cancel netflix", { db, extract: l3Model, now: () => now });
  eq(a.route.flow, "send"); eq(a.route.outcome, "confirm");
  assert(/^Two things, one at a time\. First: .*\$40\.00 to Sam K \(@samk\).*Reply YES or NO.* Then I'll do: cancel netflix\.$/.test(a.reply), a.reply);
  assert(!store.state.cancel.pending_index, "nothing staged for the second ask yet");
  // Settling the first card (here a no) starts the second in the same reply, as a second message.
  const b = await routeFlows("no", { db, extract: l3Model, now: () => now + 1000 });
  eq(b.route.flow, "cancel"); assert(/nothing/i.test(b.reply.split("\n\n")[0]), b.reply); assert(/\n\nNext: .*Netflix/.test(b.reply), b.reply);
  assert(!store.state.send.pending, "the declined send is gone");
  // A new request in between drops the queued one: it never comes back on its own.
  const { db: db2 } = memDb({ recipients: SAM });
  await routeFlows("send sam $40 and cancel netflix", { db: db2, extract: l3Model, now: () => now });
  await routeFlows("send $40 to marcus", { db: db2, extract: l3Model, now: () => now + 1000 });
  const after = await routeFlows("no", { db: db2, extract: l3Model, now: () => now + 2000 });
  assert(!after || !/Next:/.test(after.reply), "the queued cancel was dropped by the new request");
});

Deno.test("L3 two requests whose first part is not read as a flow: both named, nothing dropped, the person picks", async () => {
  const { db, store } = memDb({ recipients: SAM }); const now = T0;
  const two = await routeFlows("send $40 to sam and $20 to marcus", { db, extract: l3Model, now: () => now });
  eq(two.route.outcome, "ask"); eq(two.route.ask_reason, "two_requests");
  eq(two.reply, "That's two requests: 1) send $40 to sam, 2) send $20 to marcus. Which first? Reply 1 or 2.");
  assert(!store.state.send.pending, "nothing staged");
});

Deno.test("L3 answering a question with a new request: the question is dropped and the new request is handled", async () => {
  const { db } = memDb({ recipients: MARCUSES }); const now = T0;
  const q = await routeFlows("send $40 to marcus", { db, extract: l3Model, now: () => now });
  eq(q.reply, "Which Marcus: Marcus L (@marcusl) or Marcus T (@mtee)?");
  const c = await routeFlows("cancel netflix", { db, extract: l3Model, now: () => now + 1000 });
  eq(c.route.flow, "cancel"); assert(c.route.outcome !== "confirm" || /Cancel Netflix/.test(c.reply), c.reply);
  const late = await routeFlows("marcus t", { db, extract: l3Model, now: () => now + 2000 });
  assert(late === null || late.route.flow !== "send" || late.route.outcome !== "confirm", "the dropped question does not come back as a card");
});

Deno.test("Brokerage wiring: the connection (and its Vault token) is resolved only for a message that can be a flow, never for small talk", async () => {
  let calls = 0; const stub = stubAlpaca(() => T0, { "tok-1": "acct-1" });
  const factory = async () => { calls++; return await userBroker(envOf({}), U1, srcOf([liveRow(U1, "acct-1")]), () => {}, stub.f); };
  const { db } = memDb();
  eq(await routeFlows("hi, how are you", { db, extract: stubModel, now: () => T0, brokerFactory: factory } as any), null);
  eq(calls, 0, "small talk never touches the brokerage connection");
  const r = await routeFlows("buy $5 of VOO", { db, extract: stubModel, now: () => T0, brokerFactory: factory } as any);
  eq(calls, 1, "a trade resolves it once"); eq(r!.route.outcome, "confirm");
});

// Monthly rent as a standing flow (packages/domain/81-standing-rent.js; real-world C110; spec 16 item S16-15). The rule
// lives in public.standing_payments (here an in-memory MOCK of it); the flow's writes reach it before the reply; a write
// that fails is never claimed; nothing is staged without the person's yes, and no rail is ever written.
function rentDb(o: { rows?: any[]; failRead?: boolean; failWrite?: boolean; recipients?: any[] } = {}) {
  const store: { state: any; rows: any[]; ops: any[] } = { state: null, rows: (o.rows || []).map(r => Object.assign({}, r)), ops: [] };
  const db: FlowDb = {
    async loadState() { return store.state ? JSON.parse(JSON.stringify(store.state)) : null; },
    async saveState(s: any) { store.state = JSON.parse(JSON.stringify(s)); },
    async loadData() { return { ok: true, ...mapFlowData([], [], [], o.recipients || [], o.failRead ? null : store.rows.filter(r => r.status === "active").map(r => Object.assign({}, r))) }; },
    async saveRecipients() {},
    async saveStanding(ops: any[]) {
      if (o.failWrite) throw new Error("standing store down");
      for (const op of ops) {
        store.ops.push(JSON.parse(JSON.stringify(op)));
        if (op.op === "insert") store.rows.push(Object.assign({ id: "sp-" + store.rows.length, created_at: new Date(T0).toISOString(), last_staged_month: null }, op.row));
        if (op.op === "update") Object.assign(store.rows.find(r => r.id === op.id), op.set);
      }
    },
  };
  return { db, store };
}
const MIKE = [{ id: "r-mike", handle: "mike@example.com", display_name: "Mike", channel: "in-app", source: "confirmed", rail: "zelle", last_used_at: new Date(T0).toISOString() }];
Deno.test("rent wiring: ask, card, yes saves the rule to standing_payments before the reply; the month card's yes stages it for the person to send", async () => {
  const { db, store } = rentDb({ recipients: MIKE }); let calls = 0;
  const model = async () => { calls++; return { intent: "send_money", recipient_span: "rent" }; };
  const go = (m: string, at = T0) => routeFlows(m, { db, extract: model, now: () => at });
  const ask = await go("pay my rent");
  eq(ask.reply, "Who do you pay rent to, how much, and which day of the month? e.g. 'Mike $1,450 on the 1st via Zelle'");
  eq(ask.route.flow, "rent"); eq(ask.route.route, "pay_rent"); eq(ask.route.outcome, "ask");
  assert(hasLiveCard(store.state), "the open question is saved with the thread, so the answer routes back to it");
  const card = await go("Mike $1,450 on the 1st via Zelle", T0 + 60000);
  eq(card.reply, "Set up rent: $1,450.00 to Mike on Zelle, monthly on the 1st, from checking, for you to send each month. Each month I'll put up the card and wait for your yes; one message ('stop rent') turns it off. Reply YES or NO within 10 min.");
  eq(store.rows.length, 0, "a card saves nothing");
  const yes = await go("yes", T0 + 120000);
  eq(yes.route.outcome, "rent_set"); assert(/^Rent is set up: \$1,450\.00 to Mike on Zelle/.test(yes.reply), yes.reply);
  eq(store.rows.length, 1); eq([store.rows[0].status, store.rows[0].amount_cents, store.rows[0].day_of_month, store.rows[0].rail, store.rows[0].payee_handle], ["active", 145000, 1, "zelle", "mike@example.com"]);
  eq(calls, 0, "no model call anywhere in the rent dialogue");
  // Three days before the 1st: the month card, then the yes stages it (handoff), and the month is recorded.
  const oct29 = Date.UTC(2026, 9, 29, 14);
  const month = await go("pay my rent", oct29);
  eq(month.reply, "Rent for November: $1,450.00 to Mike on Zelle, due Nov 1, from checking, for you to send. Reply YES to stage it or NO to skip this month, within 10 min.");
  for (const re of [/[Rr]ent/, /month|monthly/, /Reply YES|Confirm below/]) assert(re.test(month.reply), `spec 16 S16-15 check ${re}`);
  const staged = await go("yes", oct29 + 60000);
  eq(staged.route.outcome, "staged"); assert(/^Rent for November: Staged, not sent\. In your bank app: .*Upmore didn't move any money; you send it\.$/.test(staged.reply), staged.reply);
  eq(store.rows[0].last_staged_month, "2026-11");
  const again = await go("pay my rent", oct29 + 120000);
  eq(again.route.outcome, "already_done");
  // One message turns it off.
  const off = await go("stop rent", oct29 + 180000);
  eq(off.route.outcome, "rent_stopped"); eq(store.rows[0].status, "stopped");
  eq(store.ops.map(x => x.op), ["insert", "update", "update"]);
});
Deno.test("rent wiring: a write that fails is never claimed; an unreadable table says so; pay sam 900 for rent is still a send to Sam", async () => {
  const RULE = { id: "sp-9", kind: "rent", payee_name: "Mike", payee_handle: "mike@example.com", rail: "zelle", amount_cents: 145000, day_of_month: 1, funding: "checking", status: "active", created_at: "2026-09-01T00:00:00Z", last_staged_month: null };
  const { db, store } = rentDb({ rows: [RULE], recipients: MIKE, failWrite: true });
  const at = Date.UTC(2026, 9, 29, 14);
  await routeFlows("pay my rent", { db, extract: null, now: () => at });
  const y = await routeFlows("yes", { db, extract: null, now: () => at + 1000 });
  eq(y.reply, "I couldn't save that right now, so nothing was staged. Nothing was sent. Try again in a moment.");
  eq(y.route.outcome, "not_saved"); assert(y.route.problems.includes("standing payment save failed"));
  eq(store.rows[0].last_staged_month, null);
  const u = rentDb({ failRead: true });
  eq((await routeFlows("pay my rent", { db: u.db, extract: null, now: () => at }))!.reply, "I can't read your rent setup right now, so I can't do that yet. Nothing was changed.");
  const s = rentDb({ rows: [RULE], recipients: [{ id: "r-sam", handle: "@sam", display_name: "Sam", channel: "in-app", source: "completed_send", rail: "venmo", last_used_at: new Date(T0).toISOString() }] });
  const send = await routeFlows("pay sam 900 for rent", { db: s.db, extract: null, now: () => at });
  eq(send.route.flow, "send"); assert(/\$900\.00 to Sam/.test(send.reply), send.reply);
});
