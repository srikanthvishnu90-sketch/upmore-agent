// People-finding's web search (career_people_provider.ts openAiWebSearch) spends model money, so it goes through the gateway's
// budget door (model_gateway.ts responsesCall) like every other paid call (owner, 2026-10-28: $15 today, $20 on 10-29, missing
// costs counted at their worst case). Fakes only: a fake provider and the in-process budget twin; no key, no network, no spend.
import assertNode from "node:assert/strict";
import { openAiWebSearch } from "../../supabase/functions/_shared/career_people_provider.ts";
import { PRICES, responsesCall, WEB_SEARCH_CONTENT_TOKENS, WEB_SEARCH_FEE_MICROS as WEB_SEARCH_CALL_FEE, WEB_SEARCH_MAX_CALLS } from "../../supabase/functions/_shared/model_gateway.ts";
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
const BODY = { tool_choice: "required", max_output_tokens: 400, tools: [{ type: "web_search", filters: { blocked_domains: ["linkedin.com"] } }], input: "q" };
const webSearchCall = async (o: { apiKey: string; model: string; input: string; blockedDomains: string[]; request: typeof fetch; budget: BudgetGate; body?: Record<string, unknown> }) => {
  try { const r = await responsesCall({ apiKey: o.apiKey, model: o.model, request: o.request, budget: o.budget, body: o.body ?? BODY }); return { ok: r.ok, status: r.status }; }
  catch (e) { return { ok: false, status: 0, error: e }; }
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

Deno.test("web search reserves its worst case before it sends, and settles to the proven cost plus the per-search fee", async () => {
  const gate = memoryBudgetGate(15_000_000);
  const p = provider(() => json(answer({ input_tokens: 10_000, output_tokens: 500 }, 1)));
  let reservedAtSend = -1;
  const watched: BudgetGate = { ...gate, reserve: async (m, meta) => { const r = await gate.reserve(m, meta); reservedAtSend = gate.snapshot().reserved; return r; } };
  const r = await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: ["linkedin.com"], request: p.fetch, budget: watched });
  ok(r.ok); ok(reservedAtSend > 0, "reserved before the request");
  eq(p.sent[0].max_tool_calls, WEB_SEARCH_MAX_CALLS, "searches per call are capped, so the worst case is bounded");
  // A caller asking for more searches than were reserved for is held to the cap.
  const p2 = provider(() => json(answer({ input_tokens: 1, output_tokens: 1 })));
  await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: [], request: p2.fetch, budget: memoryBudgetGate(15_000_000), body: { ...BODY, max_tool_calls: 50 } });
  eq(p2.sent[0].max_tool_calls, WEB_SEARCH_MAX_CALLS, "max_tool_calls is forced down to the cap");
  const want = Math.round(10_000 * PRICES[MODEL].input + 500 * PRICES[MODEL].output) + 1 * WEB_SEARCH_CALL_FEE;
  eq(gate.snapshot(), { spent: want, reserved: 0, limit: 15_000_000 }, "settled: tokens at the model's price + the fee for each search made");
});

Deno.test("a proven cost above the reservation is recorded in full, never trimmed to what was reserved", async () => {
  const gate = memoryBudgetGate(15_000_000);
  const p = provider(() => json(answer({ input_tokens: 5_000_000, output_tokens: 0 })));
  await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: [], request: p.fetch, budget: gate });
  eq(gate.snapshot().spent, Math.round(5_000_000 * PRICES[MODEL].input) + WEB_SEARCH_CALL_FEE, "the truth is counted");
});

Deno.test("a missing cost record keeps the whole worst case as spent", async () => {
  const gate = memoryBudgetGate(15_000_000);
  const p = provider(() => json(answer(undefined)));
  ok((await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: [], request: p.fetch, budget: gate })).ok);
  const s = gate.snapshot();
  ok(s.spent >= WEB_SEARCH_MAX_CALLS * (WEB_SEARCH_CALL_FEE + WEB_SEARCH_CONTENT_TOKENS * PRICES[MODEL].input), `worst case kept, search content and fee included (${s.spent})`); eq(s.reserved, 0);
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
  // Voice is off for the beta: a voice or speech model is refused before anything is reserved or sent.
  const g5 = memoryBudgetGate(15_000_000), p5 = provider(() => json(answer({ input_tokens: 1, output_tokens: 1 })));
  for (const m of ["gpt-realtime-mini", "gpt-4o-mini-tts", "whisper-1", "gpt-4o-transcribe"]) {
    const v = await webSearchCall({ apiKey: "k", model: m, input: "q", blockedDomains: [], request: p5.fetch, budget: g5 }); ok(!v.ok, `${m} refused`); }
  eq([p5.sent.length, g5.snapshot().spent, g5.snapshot().reserved], [0, 0, 0], "voice off: nothing sent, nothing reserved");
  const g4 = memoryBudgetGate(15_000_000);
  const r4 = await webSearchCall({ apiKey: "k", model: MODEL, input: "q", blockedDomains: [], request: provider(() => json({ error: { type: "rate_limit" } }, 429)).fetch, budget: g4 });
  ok(!r4.ok && r4.status === 429); eq(g4.snapshot(), { spent: 0, reserved: 0, limit: 15_000_000 }, "refused before generation: nothing billed, given back");
});

Deno.test("a used-up or unreachable budget sends nothing, and the people finder says so plainly", async () => {
  const gate = memoryBudgetGate(1);
  const p = provider(() => json(answer({ input_tokens: 1, output_tokens: 1 })));
  const out = await openAiWebSearch({ fetch: p.fetch, apiKey: "k", model: MODEL, budget: gate })("Stripe recruiter");
  eq(p.sent.length, 0, "no request when the budget cannot hold the worst case");
  eq(out.status, "out_of_credits", "the people finder treats a closed budget as no credit: it says so and guesses nothing");
  const down: BudgetGate = { reserve: async () => ({ ok: false, reason: "unavailable" }), settle: async () => true, release: async () => true };
  const out2 = await openAiWebSearch({ fetch: p.fetch, apiKey: "k", model: MODEL, budget: down })("Stripe recruiter");
  eq(p.sent.length, 0, "fail closed when the budget cannot be checked"); eq(out2.status, "out_of_credits");
});

Deno.test("the people finder reads the URLs back unchanged through the gateway", async () => {
  const p = provider(() => json(answer({ input_tokens: 100, output_tokens: 10 })));
  const out = await openAiWebSearch({ fetch: p.fetch, apiKey: "k", model: MODEL, budget: memoryBudgetGate(15_000_000) })("Stripe recruiter");
  eq(out.status, "ok"); eq((out as any).urls.map((u: any) => u.url), ["https://example.com/team", "https://example.com/about"]);
  for (const d of ["linkedin.com", "indeed.com", "joinhandshake.com"]) eq(p.sent[0].tools[0].filters.blocked_domains.includes(d), true, `${d} stays blocked`);
});
