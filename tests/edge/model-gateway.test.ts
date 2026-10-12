// The model gateway (owner decision 2026-10-11: OpenAI, cheapest model with forced tool calls). One door for the chat,
// the router and the planner: the same Anthropic-shaped request goes to OpenAI or Anthropic by secret, the reply comes
// back in the same shape, failures carry the provider's cause (never the key), every call is metered and reported to
// health. The provider here is a stub fetch; nothing in this file reaches a real provider.
import { modelConfig, toOpenAI, fromOpenAI, callModel, chatReply, plannerModel, costMicros, newMeter, meterAdd, OUTAGE_REPLY, OPENAI_DEFAULT_MODEL, REASONING_HEADROOM } from "../../supabase/functions/_shared/model_gateway.ts";
import { ModelUnavailableError } from "../../supabase/functions/_shared/model_calls.ts";
import { routeExtractor } from "../../supabase/functions/_shared/flow_router.ts";
import { runFinancialPlanner } from "../../supabase/functions/_shared/financial_planner.ts";
import { fixture, user } from "./lib/financial_fixture.ts";
function assert(v: unknown, m = "assertion failed") { if (!v) throw new Error(m); }
const eq = (a: unknown, b: unknown, m = "") => assert(JSON.stringify(a) === JSON.stringify(b), `${m} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
const KEY = "sk-proj-TESTKEY-should-never-appear-anywhere-0000";
const OPENAI = { provider: "openai" as const, model: "gpt-5-nano", apiKey: KEY, reasoningEffort: "minimal" };
const admin = () => ({ calls: [] as any[], async rpc(name: string, args: any) { this.calls.push({ name, args }); return { data: { ok: true, call_id: "slot" }, error: null }; } });
const completion = (message: any, usage: any = { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 200 } }, finish = "stop") =>
  Response.json({ id: "chatcmpl-1", model: "gpt-5-nano", choices: [{ index: 0, finish_reason: finish, message: Object.assign({ role: "assistant", content: null }, message) }], usage });

Deno.test("provider choice: OpenAI gpt-5-nano at minimal reasoning by default; Anthropic only when MODEL_PROVIDER=anthropic is set on purpose", () => {
  const o = modelConfig(env({ OPENAI_API_KEY: KEY }));
  eq([o.provider, o.model, o.reasoningEffort, o.apiKey === KEY], ["openai", "gpt-5-nano", "minimal", true]);
  eq(OPENAI_DEFAULT_MODEL, "gpt-5-nano", "the cheapest model with forced tool calls is the default");
  eq(modelConfig(env({ OPENAI_API_KEY: KEY, MODEL_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a" })).provider, "anthropic");
  eq(modelConfig(env({ MODEL_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a" })).model, "claude-haiku-4-5-20251001");
  // Owner, 2026-10-12: this app runs on OpenAI only and never spends Anthropic API credits by accident. A missing OpenAI
  // key (or only an Anthropic key in the environment) stays OpenAI and fails as "not configured"; it never falls back.
  const noKey = modelConfig(env({ ANTHROPIC_API_KEY: "a" }));
  eq([noKey.provider, noKey.apiKey], ["openai", ""], "an Anthropic key alone never selects Anthropic");
  eq(modelConfig(env({})).provider, "openai", "no key at all is OpenAI, not configured");
  eq(modelConfig(env({ MODEL_PROVIDER: "claude" })).provider, "openai", "an unknown provider name is OpenAI");
  eq(modelConfig(env({ OPENAI_API_KEY: KEY, OPENAI_ROUTER_MODEL: "gpt-4.1-nano" }), "router").model, "gpt-4.1-nano");
  eq(modelConfig(env({ OPENAI_API_KEY: KEY, OPENAI_MODEL: "gpt-4.1-nano" })).reasoningEffort, null, "a non-reasoning model gets no reasoning_effort");
});

Deno.test("request translation: system, tools, forced and any tool choice, tool_use/tool_result history and photos map to OpenAI; no cache_control leaks", () => {
  const body = toOpenAI({
    max_tokens: 400, temperature: 0.2,
    system: [{ type: "text", text: "rules", cache_control: { type: "ephemeral" } }, { type: "text", text: "cards" }],
    tools: [{ name: "route_message", description: "d", input_schema: { type: "object", properties: { intent: { type: "string" } } } }],
    tool_choice: { type: "tool", name: "route_message" },
    messages: [
      { role: "user", content: "what's my balance" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "read_balance", input: { account: "checking" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{\"cents\":12345}" }, { type: "tool_result", tool_use_id: "t2", content: "nope", is_error: true }] },
      { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } }, { type: "text", text: "is this a scam" }] },
    ],
  }, OPENAI);
  eq(body.model, "gpt-5-nano"); eq(body.max_completion_tokens, 400 + REASONING_HEADROOM); eq(body.reasoning_effort, "minimal");
  assert(!("temperature" in body), "a reasoning model rejects a custom temperature"); assert(!("max_tokens" in body));
  eq(body.messages[0], { role: "system", content: "rules\n\ncards" });
  eq(body.tools[0], { type: "function", function: { name: "route_message", description: "d", parameters: { type: "object", properties: { intent: { type: "string" } } } } });
  eq(body.tool_choice, { type: "function", function: { name: "route_message" } });
  eq(body.messages[2].tool_calls, [{ id: "t1", type: "function", function: { name: "read_balance", arguments: "{\"account\":\"checking\"}" } }]);
  eq(body.messages[3], { role: "tool", tool_call_id: "t1", content: "{\"cents\":12345}" });
  eq(body.messages[4], { role: "tool", tool_call_id: "t2", content: "ERROR: nope" });
  eq(body.messages[5].content, [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } }, { type: "text", text: "is this a scam" }]);
  assert(!JSON.stringify(body).includes("cache_control"));
  eq(toOpenAI({ tools: [{ name: "x", input_schema: {} }], tool_choice: { type: "any" }, messages: [] }, OPENAI).tool_choice, "required", "the planner's 'any' is OpenAI's 'required'");
  eq(toOpenAI({ max_tokens: 50, temperature: 0, messages: [] }, { ...OPENAI, model: "gpt-4.1-nano", reasoningEffort: null }).temperature, 0);
});

Deno.test("response translation: tool calls become tool_use (even when OpenAI says finish 'stop'), usage maps with cached tokens apart, bad arguments are a provider failure", () => {
  const r = fromOpenAI({ choices: [{ finish_reason: "stop", message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "route_message", arguments: "{\"intent\":\"send_money\"}" } }] } }], usage: { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 200 } } });
  eq(r.stop_reason, "tool_use"); eq(r.content, [{ type: "tool_use", id: "c1", name: "route_message", input: { intent: "send_money" } }]);
  eq(r.usage, { input_tokens: 800, output_tokens: 500, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 });
  eq(fromOpenAI({ choices: [{ finish_reason: "length", message: { content: "Hi" } }], usage: {} }).stop_reason, "max_tokens");
  eq(fromOpenAI({ choices: [{ finish_reason: "stop", message: { content: "Hi there" } }], usage: {} }).content, [{ type: "text", text: "Hi there" }]);
  let err: any = null; try { fromOpenAI({ choices: [{ message: { tool_calls: [{ id: "c", type: "function", function: { name: "x", arguments: "{oops" } }] } }] }); } catch (e) { err = e; }
  assert(err instanceof ModelUnavailableError && err.type === "bad_tool_call", String(err));
});

Deno.test("a live OpenAI refusal keeps the provider's cause, never the key; the call is metered as failed and reported to health", async () => {
  const meter = newMeter(), events: any[] = []; let sent: any = null;
  const refuse = async (url: string, init: any) => { sent = { url, auth: init.headers.authorization }; return Response.json({ error: { message: `Incorrect API key provided: ${KEY.slice(0, 12)}********0000. You can find your API key at https://platform.openai.com/account/api-keys.`, type: "invalid_request_error", code: "invalid_api_key" } }, { status: 401 }); };
  let err: any = null; try { await callModel(OPENAI, { max_tokens: 10, messages: [{ role: "user", content: "hi" }] }, { request: refuse as any, meter, health: e => { events.push(e); } }); } catch (e) { err = e; }
  eq(sent.url, "https://api.openai.com/v1/chat/completions"); eq(sent.auth, `Bearer ${KEY}`);
  assert(err instanceof ModelUnavailableError && err.status === 401 && err.type === "invalid_request_error", String(err));
  assert(/Incorrect API key provided: \[key\]/.test(err.detail), err.detail);
  assert(!(err.message + err.detail + JSON.stringify(events)).includes("sk-proj"), "no key fragment in the error or the health row");
  eq([meter.calls, meter.failed], [1, 1]);
  eq(events.map(e => [e.provider, e.model, e.role, e.ok, e.status, e.error_type]), [["openai", "gpt-5-nano", "chat", false, 401, "invalid_request_error"]]);
  const none = newMeter(); let missing: any = null;
  try { await callModel({ ...OPENAI, apiKey: "" }, { messages: [] }, { request: (async () => { throw new Error("must not send"); }) as any, meter: none }); } catch (e) { missing = e; }
  assert(missing instanceof ModelUnavailableError && /not configured/.test(missing.message), String(missing)); eq(none.failed, 1);
  let net: any = null; try { await callModel(OPENAI, { messages: [] }, { request: (async () => { throw new TypeError("connection reset"); }) as any }); } catch (e) { net = e; }
  assert(net instanceof ModelUnavailableError && net.type === "network", String(net));
});

Deno.test("chat: an OpenAI reply comes back as text with its cost; a dead provider is the outage sentence with the cause, never silence", async () => {
  const meter = newMeter(), events: any[] = [];
  const ok = await chatReply(OPENAI, { max_tokens: 400, system: "s", messages: [{ role: "user", content: "hi" }] }, { request: (async () => completion({ content: "Hey! What can I help with?" })) as any, meter, health: e => { events.push(e); } });
  assert(ok.ok); eq((ok as any).message.content, [{ type: "text", text: "Hey! What can I help with?" }]);
  eq([meter.calls, meter.failed, meter.input_tokens, meter.output_tokens, meter.cached_tokens, meter.usd_micros, meter.provider], [1, 0, 800, 500, 200, 241, "openai"]);
  eq(events.map(e => [e.ok, e.role]), [[true, "chat"]]);
  const dead = await chatReply(OPENAI, { messages: [] }, { request: (async () => Response.json({ error: { message: "You exceeded your current quota, please check your plan and billing details.", type: "insufficient_quota" } }, { status: 429 })) as any });
  assert(!dead.ok); eq((dead as any).reply, OUTAGE_REPLY);
  eq((dead as any).model_error, "HTTP 429 insufficient_quota: You exceeded your current quota, please check your plan and billing details.");
  assert(!/payment|plan|bill/i.test(OUTAGE_REPLY.replace("I can't answer", "")), "the outage sentence has no payment words");
});

Deno.test("router through OpenAI: one forced route_message call, the extraction comes back, usage is recorded against the reserved slot", async () => {
  const a = admin(); let body: any = null;
  const x = routeExtractor(a, user, "thread", OPENAI, { request: (async (_u: string, init: any) => { body = JSON.parse(init.body); return completion({ tool_calls: [{ id: "c1", type: "function", function: { name: "route_message", arguments: JSON.stringify({ intent: "send_money", amount_span: "$40", recipient_span: "sam" }) } }] }); }) as any });
  eq(await x("send sam $40"), { intent: "send_money", amount_span: "$40", recipient_span: "sam" });
  eq(body.tool_choice, { type: "function", function: { name: "route_message" } }); eq(body.model, "gpt-5-nano");
  eq(a.calls.map(c => c.name), ["agent_model_call_reserve", "agent_model_call_record"]);
  eq(a.calls[1].args.p_usage, { input_tokens: 800, output_tokens: 500, cache_read_tokens: 200, cache_write_tokens: 0 });
  const dead = routeExtractor(admin(), user, "thread", OPENAI, { request: (async () => new Response("upstream", { status: 503 })) as any });
  let err: any = null; try { await dead("send sam $40"); } catch (e) { err = e; } assert(/router model HTTP 503/.test(String(err)), String(err));
});

Deno.test("planner through OpenAI: the tool loop runs on OpenAI tool calls and a dead OpenAI gives the outage sentence, never payment wording", async () => {
  const f = fixture(); const bodies: any[] = []; let n = 0;
  const steps = [
    { tool_calls: [{ id: "call_a", type: "function", function: { name: "finish_financial_reply", arguments: JSON.stringify({ evidence_ids: [], questions: ["connect_bank"] }) } }] },
  ];
  const m = plannerModel(admin(), user, "thread", OPENAI, { request: (async (_u: string, init: any) => { bodies.push(JSON.parse(init.body)); return completion(steps[Math.min(n++, steps.length - 1)]); }) as any });
  const r = await runFinancialPlanner(f.session, m, "what's my balance");
  eq(bodies[0].tool_choice, "required"); assert(bodies[0].tools.some((t: any) => t.function.name === "finish_financial_reply"));
  assert(!JSON.stringify(bodies[0].messages[0]).includes("STYLE EXAMPLES"), "no style block unless one is passed");
  const styled: any[] = [];
  const sm = plannerModel(admin(), user, "thread", OPENAI, { style: "STYLE EXAMPLES: copy the mannerisms, not the words", request: (async (_u: string, init: any) => { styled.push(JSON.parse(init.body)); return completion(steps[0]); }) as any });
  await runFinancialPlanner(fixture().session, sm, "what's my balance");
  assert(styled[0].messages[0].role === "system" && /You are Upmore's financial tool planner[\s\S]*\n\nSTYLE EXAMPLES: copy the mannerisms/.test(styled[0].messages[0].content), "the style block follows the planner's own rules");
  eq(r.reply, "Connect your bank and refresh it so I can see current cash evidence."); assert(!r.incomplete, JSON.stringify(r));
  const dead = plannerModel(admin(), user, "thread", OPENAI, { request: (async () => Response.json({ error: { message: "Incorrect API key provided: sk-proj-abc", type: "invalid_request_error" } }, { status: 401 })) as any });
  const d = await runFinancialPlanner(fixture().session, dead, "what's my balance");
  eq(d.failure_code, "model_unavailable"); eq(d.reply, OUTAGE_REPLY); assert(!String(d.model_error).includes("sk-proj"), d.model_error);
});

Deno.test("cost per call: tokens times the model's price, in micro-dollars; an unpriced model is counted as unpriced, never as free", () => {
  eq(costMicros("gpt-5-nano", { input_tokens: 800, output_tokens: 500, cache_read_input_tokens: 200 }), 241);
  eq(costMicros("claude-haiku-4-5-20251001", { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }), 1500);
  eq(costMicros("some-new-model", { input_tokens: 1 }), null);
  const m = newMeter(); meterAdd(m, { ...OPENAI, model: "some-new-model" }, { input_tokens: 5, output_tokens: 5 });
  eq([m.calls, m.unpriced, m.usd_micros], [1, 1, 0]);
});
