// The batch runner's cap prices web search exactly as the product's responsesCall does (tokens at the worst case + search content
// + the per-search fee), so a run with CAREER_KNOWLEDGE=on cannot exceed --max-usd.   deno test -A --no-check tests/architect/batch-web-search-cap.test.ts
import assertNode from "node:assert/strict";
import { CapExceededError, guardFetch, RunCap, type GuardState } from "../../evals/career/batch/entries.ts";
import { runBatch } from "../../evals/career/batch/run.ts";
import { memoryBudgetGate, worstCaseMicros, type BudgetGate } from "../../supabase/functions/_shared/model_budget.ts";
import { PRICES, responsesCall, responsesSettle, responsesWorst, WEB_SEARCH_CONTENT_TOKENS, WEB_SEARCH_FEE_MICROS } from "../../supabase/functions/_shared/model_gateway.ts";
import { openAiGroundSearch } from "../../supabase/functions/_shared/agent/research/ground.ts";
import { DEFAULT_SEARCH_MODEL } from "../../supabase/functions/_shared/career_people_provider.ts";

const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const BODY = { tool_choice: "required", max_tool_calls: 1, max_output_tokens: 1400, include: ["web_search_call.action.sources"], tools: [{ type: "web_search", filters: { blocked_domains: ["linkedin.com"] } }], input: "Search: nurses" };
const RESPONSE = { output: [{ type: "web_search_call", action: { sources: [{ url: "https://www.bls.gov/ooh/x.htm" }] } }, { type: "message", content: [{ text: JSON.stringify({ facts: [{ kind: "pay", text: "The median wage was $61,590.", quote: "The median annual wage was $61,590.", url: "https://www.bls.gov/ooh/x.htm" }] }), annotations: [] }] }], usage: { input_tokens: 9000, output_tokens: 300 } };
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });

Deno.test("a web-search call reserves tokens + search content + the fee, the same number on the product path and on the cap", async () => {
  const M = DEFAULT_SEARCH_MODEL, w = responsesWorst(M, BODY);
  const chatStyle = worstCaseMicros(M, PRICES, { bytes: new TextEncoder().encode(JSON.stringify({ ...BODY, model: M })).length, images: 0, maxOutputTokens: 1400 });
  ok(w.micros - chatStyle >= WEB_SEARCH_FEE_MICROS + WEB_SEARCH_CONTENT_TOKENS * 0.4 - 1, `the old chat-style price undercounted by ${w.micros - chatStyle} micro-USD`);
  eq(responsesWorst(M, { ...BODY, max_tool_calls: 50 }).micros, w.micros, "the model cannot ask for more searches than the product allows");
  // the product path: what responsesCall asks its gate to reserve
  let productReserve = 0;
  const spy: BudgetGate = { reserve: async (m) => { productReserve = m; return { ok: true, id: "x" }; }, settle: async () => {}, release: async () => {} } as unknown as BudgetGate;
  await responsesCall({ apiKey: "k", model: M, body: BODY, request: (async () => json(RESPONSE)) as typeof fetch, budget: spy });
  eq(productReserve, w.micros);
  // the cap path: what the guard reserves on the run cap before the request leaves
  const cap = new RunCap(1), state: GuardState = { blocked: [], calls: 0 };
  let during = 0;
  const g = guardFetch({ cap, state, allowOrigins: [], inner: (async () => { during = cap.gate.snapshot().reserved; return json(RESPONSE); }) as typeof fetch });
  await g("https://api.openai.com/v1/responses", { method: "POST", body: JSON.stringify({ ...BODY, model: M, max_tool_calls: 1 }) });
  eq(during, w.micros, "the cap reserved exactly the product's worst case");
  // settled to proven tokens + one search fee, never below
  const proven = responsesSettle(M, RESPONSE)!;
  eq(cap.gate.snapshot().spent, proven); ok(proven >= WEB_SEARCH_FEE_MICROS);
  eq(responsesSettle(M, { output: [], usage: {} }), null, "an unproven answer keeps the worst case");
});

Deno.test("search after search under a small cap: the total never passes the cap and the run fails closed", async () => {
  const limit = 0.5, cap = new RunCap(limit), state: GuardState = { blocked: [], calls: 0 };
  let seen = 0, top = 0;
  const g = guardFetch({ cap, state, allowOrigins: [], inner: (async () => { seen++; top = Math.max(top, cap.spentUsd()); return json(RESPONSE); }) as typeof fetch });
  const search = openAiGroundSearch({ apiKey: "k", model: DEFAULT_SEARCH_MODEL, fetch: g });
  let tripped: unknown = null;
  for (let i = 0; i < 400 && !tripped; i++) {
    try { await search({ q: `q${i}`, kinds: ["pay"] }, { field: "trades", stage: "x", geo: "us" }); } catch (e) { tripped = e; }
    // openAiGroundSearch turns a refusal into a status, so also look at the cap itself
    if (cap.tripped) tripped = new CapExceededError("tripped");
    ok(cap.spentUsd() <= limit + 1e-9, `spent ${cap.spentUsd()} passed the cap after ${i + 1} searches`);
  }
  ok(tripped, "the cap tripped");
  const perSearch = responsesWorst(DEFAULT_SEARCH_MODEL, BODY).micros / 1e6;
  ok(seen >= 1 && seen <= Math.floor(limit / (responsesSettle(DEFAULT_SEARCH_MODEL, RESPONSE)! / 1e6)) + 1, `${seen} searches`);
  ok(top <= limit && perSearch > 0.025, "each search was reserved at more than its fee alone");
  ok(Math.max(0, ...[limit - cap.spentUsd()]) < perSearch + 1e-9 || cap.tripped);
});

Deno.test("a whole batch run with CAREER_KNOWLEDGE=on: web searches are priced on the cap and --max-usd holds", async () => {
  const saved = ["OPENAI_API_KEY", "MODEL_PROVIDER", "CAREER_KNOWLEDGE", "CAREER_MODEL"].map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("OPENAI_API_KEY", "sk-test-not-real"); Deno.env.set("MODEL_PROVIDER", "openai"); Deno.env.set("CAREER_KNOWLEDGE", "on"); Deno.env.set("CAREER_MODEL", "gpt-4.1-mini");
  const hits = { search: 0, chat: 0 };
  const upstream = (async (input: Request | URL | string, init?: RequestInit) => {
    const req = new Request(input as any, init), u = new URL(req.url), body = await req.json();
    if (u.pathname.endsWith("/responses")) { hits.search++; return json(RESPONSE); }
    hits.chat++;
    const usage = { prompt_tokens: 1500, completion_tokens: 80 };
    const msgs: any[] = body.messages ?? [];
    if (!body.tools?.length && /name the occupation/i.test(String(msgs[0]?.content ?? ""))) return json({ choices: [{ finish_reason: "stop", message: { content: '{"field":"dental hygienist","licensed":true,"stage":"unknown"}' } }], usage });
    if (body.tools?.length && !msgs.some((m) => m.role === "tool")) return json({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "research_career_question", arguments: JSON.stringify({ question: "how do I become a dental hygienist" }) } }] } }], usage });
    return json({ choices: [{ finish_reason: "stop", message: { content: "Right now this is workable, and later it gets easier." } }], usage });
  }) as typeof fetch;
  try {
    const maxUsd = 0.4;
    const r = await runBatch({ mode: "live", entry: "inbound", brain: "agent", n: 30, runSeed: 3, maxUsd, upstream, judgePct: 0 });
    ok(r.meta.spentUsd <= maxUsd + 1e-9, `spent ${r.meta.spentUsd} of ${maxUsd}`);
    ok(hits.search >= 1, "the research search ran inside the chat");
    ok(hits.search * (WEB_SEARCH_FEE_MICROS / 1e6) <= r.meta.spentUsd, "every search's fee is in the spend");
  } finally { for (const [k, v] of saved) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v); }
});
void memoryBudgetGate;
