// People-finding's web search (career_people_provider.ts openAiWebSearch) spends model money, so it goes through the gateway's
// budget door (model_gateway.ts webSearchCall) like every other paid call (owner, 2026-10-28: $15 today, $20 on 10-29, missing
// costs counted at their worst case). Fakes only: a fake provider and the in-process budget twin; no key, no network, no spend.
import assertNode from "node:assert/strict";
import { openAiWebSearch } from "../../supabase/functions/_shared/career_people_provider.ts";
import { PRICES, WEB_SEARCH_CALL_FEE, WEB_SEARCH_MAX_CALLS, webSearchCall } from "../../supabase/functions/_shared/model_gateway.ts";
import { type BudgetGate, memoryBudgetGate } from "../../supabase/functions/_shared/model_budget.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const MODEL = "gpt-4.1-mini";
const answer = (usage: unknown, searches = 1) => ({
  output: [...Array.from({ length: searches }, () => ({ type: "web_search_call", action: { sources: [{ url: "https://example.com/team" }] } })),
    { type: "message", content: [{ type: "output_text", text: "x", annotations: [{ type: "url_citation", url: "https://example.com/about", title: "About" }] }] }],
  ...(usage === undefined ? {} : { usage }),
});
function provider(reply: () => Response) {
  const sent: any[] = [];
  return { sent, fetch: (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return reply(); }) as unknown as typeof fetch };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

Deno.test("web search reserves its worst case before it sends, and settles to the proven cost plus the per-search fee", async () => {
  const gate = memoryBudgetGate(15_000_000);
  const p = provider(() => json(answer({ input_tokens: 10_000, output_tokens: 500 }, 2)));
  let reservedAtSend = -1;
  const watched: BudgetGate = { ...gate, reserve: async (m, meta) => { const r = await gate.reserve(m, meta); reservedAtSend = gate.snapshot().reserved; return r; } };
  const r = await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: ["linkedin.com"], request: p.fetch, budget: watched });
  ok(r.ok); ok(reservedAtSend > 0, "reserved before the request");
  eq(p.sent[0].max_tool_calls, WEB_SEARCH_MAX_CALLS, "searches per call are capped, so the worst case is bounded");
  const want = Math.round(10_000 * PRICES[MODEL].input + 500 * PRICES[MODEL].output) + 2 * WEB_SEARCH_CALL_FEE;
  eq(gate.snapshot(), { spent: want, reserved: 0, limit: 15_000_000 }, "settled: tokens at the model's price + the fee for each search made");
});

Deno.test("a missing cost record keeps the whole worst case as spent", async () => {
  const gate = memoryBudgetGate(15_000_000);
  const p = provider(() => json(answer(undefined)));
  ok((await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: [], request: p.fetch, budget: gate })).ok);
  const s = gate.snapshot();
  ok(s.spent >= WEB_SEARCH_MAX_CALLS * WEB_SEARCH_CALL_FEE, `worst case kept (${s.spent})`); eq(s.reserved, 0);
});

Deno.test("an unknown model is reserved at the table's highest price; a timeout keeps the worst case; a refusal gives it back", async () => {
  const g1 = memoryBudgetGate(15_000_000);
  await webSearchCall({ apiKey: "k", model: "no-such-model", input: "q", blockedDomains: [], request: provider(() => json(answer({ input_tokens: 1, output_tokens: 1 }))).fetch, budget: g1 });
  const g2 = memoryBudgetGate(15_000_000);
  await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: [], request: provider(() => json(answer(undefined))).fetch, budget: g2 });
  ok(g1.snapshot().spent > g2.snapshot().spent, "an unpriced model is never cheaper than a priced one");
  const g3 = memoryBudgetGate(15_000_000);
  const r = await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: [], request: (async () => { throw new DOMException("t", "TimeoutError"); }) as unknown as typeof fetch, budget: g3 });
  ok(!r.ok); ok(g3.snapshot().spent > 0, "a timeout (the provider may have run it) keeps the worst case");
  const g4 = memoryBudgetGate(15_000_000);
  const r4 = await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: [], request: provider(() => json({ error: { type: "rate_limit" } }, 429)).fetch, budget: g4 });
  ok(!r4.ok && r4.status === 429); eq(g4.snapshot(), { spent: 0, reserved: 0, limit: 15_000_000 }, "refused before generation: nothing billed, given back");
});

Deno.test("a used-up or unreachable budget sends nothing, and the people finder says so plainly", async () => {
  const gate = memoryBudgetGate(1);
  const p = provider(() => json(answer({ input_tokens: 1, output_tokens: 1 })));
  const out = await openAiWebSearch({ fetch: p.fetch, apiKey: "k", model: MODEL, budget: gate })("Stripe recruiter");
  eq(p.sent.length, 0, "no request when the budget cannot hold the worst case");
  eq(out.status, "not_wired"); ok(/budget/.test((out as any).reason));
  const down: BudgetGate = { reserve: async () => ({ ok: false, reason: "unavailable" }), settle: async () => true, release: async () => true };
  const out2 = await openAiWebSearch({ fetch: p.fetch, apiKey: "k", model: MODEL, budget: down })("Stripe recruiter");
  eq(p.sent.length, 0, "fail closed when the budget cannot be checked"); eq(out2.status, "not_wired");
});

Deno.test("the people finder reads the URLs back unchanged through the gateway", async () => {
  const p = provider(() => json(answer({ input_tokens: 100, output_tokens: 10 })));
  const out = await openAiWebSearch({ fetch: p.fetch, apiKey: "k", model: MODEL, budget: memoryBudgetGate(15_000_000) })("Stripe recruiter");
  eq(out.status, "ok"); eq((out as any).urls.map((u: any) => u.url), ["https://example.com/team", "https://example.com/about"]);
  eq(p.sent[0].tools[0].filters.blocked_domains.includes("linkedin.com"), true, "LinkedIn, Indeed and Handshake stay blocked");
});
