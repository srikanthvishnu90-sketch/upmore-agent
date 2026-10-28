// One door to the AI provider (owner decision 2026-10-11: OpenAI, the cheapest model that makes forced tool calls).
//
// Every caller (the chat reply, the flow router, the financial planner) keeps building the request it always built, in
// the Anthropic Messages shape, and reads back the same shape. This module sends it to the configured provider and
// translates both ways, so the planner's tool loop, the router's forced tool call and the chat's text reply keep one shape.
//
// Provider: OpenAI, always (owner rule: OpenAI only, no Anthropic API spend; CLAUDE.md). No secret can switch it:
// MODEL_PROVIDER, ANTHROPIC_API_KEY, ANTHROPIC_MODEL and ANTHROPIC_ROUTER_MODEL are ignored (Q3, 2026-10-28; the launch
// audit's SEC11 found one secret change would have moved spend to Anthropic). A missing OPENAI_API_KEY fails as
// "not configured" with the honest outage reply. Model: OPENAI_MODEL (default gpt-5-nano); the router may use
// OPENAI_ROUTER_MODEL. Keys are read from the environment only and never logged. The Anthropic request branch in
// callModel is reachable only from a hand-built ModelConfig (the finance planner's tests); it is on the removal list.
import { ModelUnavailableError, providerError, recordModelUsage, reserveModelCall } from "./model_calls.ts";

export type Provider = "openai" | "anthropic";
export type ModelRole = "chat" | "router" | "planner" | "probe";
export interface ModelConfig { provider: Provider; model: string; apiKey: string; reasoningEffort: string | null }
type Env = { get(name: string): string | undefined };

export const OPENAI_DEFAULT_MODEL = "gpt-5-nano";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const PROVIDER_NAME: Record<Provider, string> = { openai: "OpenAI", anthropic: "Anthropic" };

export function modelConfig(env: Env, role: ModelRole = "chat"): ModelConfig {
  const base = env.get("OPENAI_MODEL") || OPENAI_DEFAULT_MODEL;
  const model = (role === "router" && env.get("OPENAI_ROUTER_MODEL")) || base;
  return { provider: "openai", model, apiKey: env.get("OPENAI_API_KEY") || "", reasoningEffort: reasoningModel(model) ? (env.get("OPENAI_REASONING_EFFORT") || "minimal") : null };
}
export const providerName = (c: ModelConfig) => PROVIDER_NAME[c.provider];
// Reasoning models (gpt-5 family, o-series) take max_completion_tokens and reasoning_effort, and reject a custom temperature.
const reasoningModel = (model: string) => /^(gpt-5|o\d)/i.test(model);
// Owner, 2026-10-11: keep OpenAI spend small. At minimal effort gpt-5-nano rarely thinks; 512 is a cap, not a spend.
export const REASONING_HEADROOM = 512;

// Anthropic request -> OpenAI chat completions request.
export function toOpenAI(payload: any, cfg: ModelConfig): any {
  const messages: any[] = [];
  const system = Array.isArray(payload.system) ? payload.system.map((b: any) => b && b.text || "").filter(Boolean).join("\n\n") : payload.system;
  if (system) messages.push({ role: "system", content: String(system) });
  for (const m of payload.messages || []) {
    if (typeof m.content === "string") { messages.push({ role: m.role, content: m.content }); continue; }
    const blocks: any[] = Array.isArray(m.content) ? m.content : [];
    if (m.role === "assistant") {
      const text = blocks.filter(b => b.type === "text").map(b => b.text).join("");
      const calls = blocks.filter(b => b.type === "tool_use").map(b => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push(Object.assign({ role: "assistant", content: text || null }, calls.length ? { tool_calls: calls } : {}));
      continue;
    }
    // A user turn: tool results become "tool" messages (in order, before any text the turn also carries).
    for (const b of blocks.filter(b => b.type === "tool_result")) {
      const content = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.map((x: any) => x && x.text || "").join("") : JSON.stringify(b.content ?? "");
      messages.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.is_error ? `ERROR: ${content}` : content });
    }
    const parts = blocks.filter(b => b.type === "text" || b.type === "image").map(b => b.type === "text"
      ? { type: "text", text: b.text }
      : { type: "image_url", image_url: { url: `data:${b.source && b.source.media_type};base64,${b.source && b.source.data}` } });
    if (parts.length) messages.push({ role: "user", content: parts.every(p => p.type === "text") ? parts.map(p => p.text).join("") : parts });
  }
  // A reasoning model spends part of max_completion_tokens thinking; the headroom keeps a forced tool call from being cut off.
  // WO-061: decided by the model this request names, never by the config it was copied from. Callers write
  // { ...modelConfig(env), model: X }, so the effort chosen for the default model rode along to X: gpt-4.1-mini got
  // reasoning_effort and answered HTTP 400 on every call (run 39541224991), and a gpt-5 model under a non-reasoning default
  // got a temperature and no headroom.
  const effort = reasoningModel(cfg.model) ? (cfg.reasoningEffort || "minimal") : null;
  const body: any = { model: cfg.model, messages, max_completion_tokens: (payload.max_tokens || 1024) + (effort ? REASONING_HEADROOM : 0) };
  if (effort) body.reasoning_effort = effort;
  else if (typeof payload.temperature === "number") body.temperature = payload.temperature;
  if (Array.isArray(payload.tools) && payload.tools.length) {
    body.tools = payload.tools.map((t: any) => ({ type: "function", function: { name: t.name, description: t.description || "", parameters: t.input_schema || { type: "object", properties: {} } } }));
    const tc = payload.tool_choice;
    body.tool_choice = !tc || tc.type === "auto" ? "auto" : tc.type === "any" ? "required" : tc.type === "tool" ? { type: "function", function: { name: tc.name } } : tc.type === "none" ? "none" : "auto";
  }
  if (Array.isArray(payload.stop_sequences) && payload.stop_sequences.length) body.stop = payload.stop_sequences.slice(0, 4);
  // WO-040: a caller that reads a person's mail asks OpenAI not to keep the completion (store: false).
  if (payload.store === false) body.store = false;
  // WO-051: a caller that needs a fixed answer shape asks for OpenAI's structured output (a strict JSON schema).
  if (payload.response_format?.type === "json_schema") body.response_format = payload.response_format;
  return body;
}

// OpenAI chat completion -> Anthropic message. Malformed completed tool calls fail; truncated calls are discarded.
export function fromOpenAI(body: any): any {
  const choice = body && Array.isArray(body.choices) ? body.choices[0] : null;
  if (!choice || !choice.message) throw new ModelUnavailableError(502, "bad_response", "OpenAI returned no message");
  const msg = choice.message, content: any[] = [];
  const truncated = choice.finish_reason === "length";
  const text = typeof msg.content === "string" ? msg.content : msg.refusal ? String(msg.refusal) : "";
  if (text) content.push({ type: "text", text });
  // Truncation can cut JSON arguments mid-value. None of that response's calls are executable, including calls
  // that happen to parse before the cut: retain its usage and let the caller handle max_tokens without decoding them.
  for (const c of truncated ? [] : msg.tool_calls || []) {
    if (!c || c.type !== "function" || !c.function) continue;
    let input: any;
    try { input = JSON.parse(c.function.arguments || "{}"); } catch (_) { throw new ModelUnavailableError(502, "bad_tool_call", `OpenAI returned unreadable arguments for ${c.function.name}`); }
    content.push({ type: "tool_use", id: c.id, name: c.function.name, input });
  }
  const used = content.some(b => b.type === "tool_use");
  // A parsed call does not override the provider saying the generation was cut off; the loop must repair without effects.
  const stop_reason = truncated ? "max_tokens" : used ? "tool_use" : choice.finish_reason === "content_filter" ? "refusal" : "end_turn";
  const u = body.usage || {};
  const cached = Number(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
  const usage = { input_tokens: Math.max(0, (Number(u.prompt_tokens) || 0) - cached), output_tokens: Number(u.completion_tokens) || 0, cache_read_input_tokens: cached, cache_creation_input_tokens: 0 };
  return { id: body.id, type: "message", role: "assistant", model: body.model, content, stop_reason, usage };
}

// USD per million tokens. Sources: Anthropic's published Haiku 4.5 prices; gpt-5-nano from third-party price tables
// (usagepricing.com, g2.com) as of 2026-10-11, because OpenAI's pricing page cannot be reached from the build machine.
// Update here when the invoice disagrees; the cost is an estimate until it is reconciled with the provider's bill.
export const PRICES: Record<string, { input: number; cached: number; cache_write: number; output: number; source: string }> = {
  "gpt-5": { input: 1.25, cached: 0.125, cache_write: 0, output: 10.00, source: "https://developers.openai.com/api/docs/models/gpt-5 (verified 2026-10-21)" },
  "gpt-5-nano": { input: 0.05, cached: 0.005, cache_write: 0, output: 0.40, source: "third-party tables 2026-10-11 (OpenAI page unreachable)" },
  "gpt-5-mini": { input: 0.25, cached: 0.025, cache_write: 0, output: 2.00, source: "third-party tables 2026-10-11 (OpenAI page unreachable)" },
  "gpt-4.1-nano": { input: 0.10, cached: 0.025, cache_write: 0, output: 0.40, source: "third-party tables 2026-10-11 (OpenAI page unreachable)" },
  // WO-061: the second, independent eval judge (owner, 2026-10-21: two judges, both must pass). OpenAI's published
  // gpt-4.1-mini rates as known at its launch; not re-checked from here (OpenAI's page is unreachable from this sandbox).
  "gpt-4.1-mini": { input: 0.40, cached: 0.10, cache_write: 0, output: 1.60, source: "OpenAI published pricing at gpt-4.1 launch (not re-checked 2026-10-21)" },
  "claude-haiku-4-5-20251001": { input: 1.00, cached: 0.10, cache_write: 1.25, output: 5.00, source: "Anthropic published pricing" },
};
// Cost of one call in micro-dollars (1e-6 USD), from the tokens the provider reported. null when the model has no price.
export function costMicros(model: string, usage: any): number | null {
  const p = PRICES[model]; if (!p || !usage) return null;
  const n = (k: string) => Number(usage[k]) || 0;
  return Math.round(n("input_tokens") * p.input + n("cache_read_input_tokens") * p.cached + n("cache_creation_input_tokens") * p.cache_write + n("output_tokens") * p.output);
}

// Per-turn meter: every call in one user turn adds to it; the turn's message meta carries the total.
export interface TurnMeter { calls: number; failed: number; input_tokens: number; output_tokens: number; cached_tokens: number; usd_micros: number; unpriced: number; provider: string | null; models: string[] }
export const newMeter = (): TurnMeter => ({ calls: 0, failed: 0, input_tokens: 0, output_tokens: 0, cached_tokens: 0, usd_micros: 0, unpriced: 0, provider: null, models: [] });
export function meterAdd(m: TurnMeter | undefined, cfg: ModelConfig, usage: any, failed = false) {
  if (!m) return;
  m.calls++; m.provider = cfg.provider; if (!m.models.includes(cfg.model)) m.models.push(cfg.model);
  if (failed) { m.failed++; return; }
  m.input_tokens += Number(usage && usage.input_tokens) || 0; m.output_tokens += Number(usage && usage.output_tokens) || 0;
  m.cached_tokens += Number(usage && usage.cache_read_input_tokens) || 0;
  const c = costMicros(cfg.model, usage); if (c === null) m.unpriced++; else m.usd_micros += c;
}

// Every user turn leaves one cost row, so a missing row can never be read as zero spend (2026-10-28).
//   metered, calls = 0   the turn made no model call (the row says zero, in so many words);
//   metered, calls > 0   the turn's calls, tokens and estimated cost;
//   unrecorded           the sink was missing or refused the write, so how many calls the turn made is NOT KNOWN
//                        (calls is null, never 0). A reader must count these turns as unknown, not as free.
// Meters are tracked, so a turn that throws after calling the model is still recorded. finish() runs once, at the end of
// the turn, whatever the reply was. It returns what the turn is now recorded as. Recording never breaks a reply.
export type TurnRecord = "metered" | "zero" | "unrecorded" | "skipped";
export function turnLedger(admin: any, userId: string, threadId: string | null) {
  const tracked: TurnMeter[] = [], done = new Set<TurnMeter>();
  let wrote = 0, failed = false, skipped = false;
  const put = async (row: Record<string, unknown>): Promise<string | null> => {
    if (!admin || typeof admin.from !== "function") return "no cost sink is wired";
    try { const r = await admin.from("agent_turn_costs").insert({ user_id: userId, thread_id: threadId, ...row }); return r && r.error ? String(r.error.message || r.error) : null; }
    catch (e) { return e instanceof Error ? e.message : String(e); }
  };
  const record = async (m: TurnMeter) => {
    if (!m.calls || done.has(m)) return; // a meter with no calls adds nothing; the turn's zero row says so
    done.add(m);
    const err = await put({ meter_state: "metered", provider: m.provider, models: m.models, calls: m.calls, failed: m.failed, input_tokens: m.input_tokens, output_tokens: m.output_tokens, cached_tokens: m.cached_tokens, usd_micros: m.usd_micros, unpriced: m.unpriced });
    if (err) { failed = true; console.error("turn cost not recorded:", err); } else wrote++;
  };
  return {
    track(m: TurnMeter): TurnMeter { tracked.push(m); return m; },
    record,
    // A replayed turn (same turn key) is the first run's answer again: its row is the first run's.
    skip() { skipped = true; },
    async finish(): Promise<TurnRecord> {
      if (skipped) return "skipped";
      for (const m of tracked) await record(m);
      if (!failed && wrote > 0) return "metered";
      if (!failed) {
        const err = await put({ meter_state: "metered", calls: 0 });
        if (!err) return "zero";
        console.error("turn cost not recorded:", err);
      }
      const err = await put({ meter_state: "unrecorded", calls: null });
      if (err) console.error("turn marked unrecorded failed (the turn is unrecorded and has no row):", err);
      return "unrecorded";
    },
  };
}

// Health events: one row per provider call outcome, so a dead key shows within minutes (model-health reads them).
export type HealthSink = (e: { provider: Provider; model: string; role: ModelRole; ok: boolean; status: number | null; error_type: string | null; detail: string | null; latency_ms: number }) => Promise<void> | void;
export function adminHealthSink(admin: any): HealthSink {
  return async (e) => { try { await admin.from("agent_provider_events").insert(e); } catch (_) { /* health logging never breaks a reply */ } };
}

export interface CallOptions { role?: ModelRole; request?: typeof fetch; timeoutMs?: number; meter?: TurnMeter; health?: HealthSink }
// The one call. Returns an Anthropic-shaped message; throws ModelUnavailableError (provider status, type and message,
// never the key) when the provider refuses, fails or is not configured.
export async function callModel(cfg: ModelConfig, payload: any, o: CallOptions = {}): Promise<any> {
  const role = o.role || "chat", request = o.request || fetch, started = Date.now();
  const report = async (ok: boolean, status: number | null, type: string | null, detail: string | null) => { if (o.health) await o.health({ provider: cfg.provider, model: cfg.model, role, ok, status, error_type: type, detail, latency_ms: Date.now() - started }); };
  if (!cfg.apiKey) { const e = new ModelUnavailableError(0, "not_configured", `${providerName(cfg)} API key is not configured`); meterAdd(o.meter, cfg, null, true); await report(false, null, e.type, e.detail); throw e; }
  let res: Response;
  try {
    res = cfg.provider === "openai"
      ? await request(OPENAI_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify(toOpenAI(payload, cfg)), signal: AbortSignal.timeout(o.timeoutMs || 30000) })
      : await request(ANTHROPIC_URL, { method: "POST", headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify(Object.assign({}, payload, { model: cfg.model })), signal: AbortSignal.timeout(o.timeoutMs || 30000) });
  } catch (err) {
    const e = new ModelUnavailableError(0, err && (err as any).name === "TimeoutError" ? "timeout" : "network", `${providerName(cfg)}: ${err instanceof Error ? err.message : String(err)}`);
    meterAdd(o.meter, cfg, null, true); await report(false, null, e.type, e.detail); throw e;
  }
  if (!res.ok) { const e = await providerError(res); meterAdd(o.meter, cfg, null, true); await report(false, e.status, e.type, e.detail); throw e; }
  const raw = await res.text();
  if (raw.length > 200000) { const e = new ModelUnavailableError(502, "too_large", `${providerName(cfg)} response is too large`); meterAdd(o.meter, cfg, null, true); await report(false, 502, e.type, e.detail); throw e; }
  let out: any;
  try { const body = JSON.parse(raw); out = cfg.provider === "openai" ? fromOpenAI(body) : body; }
  catch (err) { const e = err instanceof ModelUnavailableError ? err : new ModelUnavailableError(502, "bad_response", `${providerName(cfg)} returned unreadable JSON`); meterAdd(o.meter, cfg, null, true); await report(false, e.status, e.type, e.detail); throw e; }
  meterAdd(o.meter, cfg, out.usage); await report(true, res.status, null, null);
  return out;
}

// What a person reads when the provider is down: the same sentence everywhere, never planner wording, never silence.
export const OUTAGE_REPLY = "I can't answer that right now: the AI service Upmore uses isn't responding, so I didn't look anything up and nothing was changed. Try again in a few minutes.";

// The financial planner's model: one reserved budget slot per round, the provider's usage recorded against it.
// style: the response-style examples for this message (StyleCorpus.render), appended to the planner's system prompt.
export function plannerModel(admin: any, userId: string, threadId: string, cfg: ModelConfig, o: CallOptions & { style?: string } = {}): any {
  const requestId = crypto.randomUUID(), deadline = Date.now() + 70000;
  return { async complete(payload: any, step: number) {
    if (!cfg.apiKey) throw new ModelUnavailableError(0, "not_configured", `${providerName(cfg)} API key is not configured`);
    if (Date.now() > deadline - 5000) throw new Error("Financial model deadline reached.");
    const callId = await reserveModelCall(admin, userId, threadId, requestId, step, cfg.model);
    let response: any;
    const system = o.style && typeof payload.system === "string" ? `${payload.system}\n\n${o.style}` : payload.system;
    try { response = await callModel(cfg, Object.assign({}, payload, { system, max_tokens: 1200 }), Object.assign({}, o, { role: "planner", timeoutMs: Math.min(18000, deadline - Date.now()) })); }
    catch (e) { if (e instanceof ModelUnavailableError) console.error(`[model] planner ${e.summary()}`); throw e; }
    await recordModelUsage(admin, callId, response.usage);
    return response;
  } };
}

// The chat reply's model call. A provider failure becomes the outage sentence with its cause for the message meta;
// anything else (a bug, a budget error) still throws.
export async function chatReply(cfg: ModelConfig, payload: any, o: CallOptions = {}): Promise<{ ok: true; message: any } | { ok: false; reply: string; model_error: string }> {
  try { return { ok: true, message: await callModel(cfg, payload, Object.assign({}, o, { role: "chat" as ModelRole })) }; }
  catch (e) {
    if (!(e instanceof ModelUnavailableError)) throw e;
    console.error(`[model] chat ${e.summary()}`);
    return { ok: false, reply: OUTAGE_REPLY, model_error: e.summary() };
  }
}
