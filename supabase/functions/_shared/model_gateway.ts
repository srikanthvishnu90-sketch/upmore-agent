// One door to the AI provider (owner decision 2026-10-11: OpenAI, the cheapest model that makes forced tool calls).
//
// Every caller (the chat reply, the flow router, the financial planner) keeps building the request it always built, in
// the Anthropic Messages shape, and reads back the same shape. This module sends it to the configured provider and
// translates both ways, so the planner's tool loop, the router's forced tool call and the chat's text reply do not change
// when the provider does. Switching back is one secret (MODEL_PROVIDER=anthropic), not a code change.
//
// Provider: OpenAI, always, unless MODEL_PROVIDER=anthropic is set on purpose (owner, 2026-10-12: this app runs on OpenAI
// only and never spends Anthropic API credits by accident). A missing OPENAI_API_KEY stays OpenAI and fails as
// "not configured" with the honest outage reply; it never falls back to Anthropic. Model: OPENAI_MODEL (default gpt-5-nano) or ANTHROPIC_MODEL (default claude-haiku-4-5-20251001); the router
// may use OPENAI_ROUTER_MODEL / ANTHROPIC_ROUTER_MODEL. Keys are read from the environment only and never logged.
import { ModelUnavailableError, providerError, recordModelUsage, reserveModelCall } from "./model_calls.ts";

export type Provider = "openai" | "anthropic";
export type ModelRole = "chat" | "router" | "planner" | "probe";
export interface ModelConfig { provider: Provider; model: string; apiKey: string; reasoningEffort: string | null }
type Env = { get(name: string): string | undefined };

export const OPENAI_DEFAULT_MODEL = "gpt-5-nano";
export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const PROVIDER_NAME: Record<Provider, string> = { openai: "OpenAI", anthropic: "Anthropic" };

export function modelConfig(env: Env, role: ModelRole = "chat"): ModelConfig {
  const asked = String(env.get("MODEL_PROVIDER") || "").trim().toLowerCase();
  const provider: Provider = asked === "anthropic" ? "anthropic" : "openai";
  if (provider === "openai") {
    const base = env.get("OPENAI_MODEL") || OPENAI_DEFAULT_MODEL;
    const model = (role === "router" && env.get("OPENAI_ROUTER_MODEL")) || base;
    return { provider, model, apiKey: env.get("OPENAI_API_KEY") || "", reasoningEffort: reasoningModel(model) ? (env.get("OPENAI_REASONING_EFFORT") || "minimal") : null };
  }
  const base = env.get("ANTHROPIC_MODEL") || ANTHROPIC_DEFAULT_MODEL;
  const model = (role === "router" && env.get("ANTHROPIC_ROUTER_MODEL")) || base;
  return { provider, model, apiKey: env.get("ANTHROPIC_API_KEY") || "", reasoningEffort: null };
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
  const body: any = { model: cfg.model, messages, max_completion_tokens: (payload.max_tokens || 1024) + (cfg.reasoningEffort ? REASONING_HEADROOM : 0) };
  if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;
  else if (typeof payload.temperature === "number") body.temperature = payload.temperature;
  if (Array.isArray(payload.tools) && payload.tools.length) {
    body.tools = payload.tools.map((t: any) => ({ type: "function", function: { name: t.name, description: t.description || "", parameters: t.input_schema || { type: "object", properties: {} } } }));
    const tc = payload.tool_choice;
    body.tool_choice = !tc || tc.type === "auto" ? "auto" : tc.type === "any" ? "required" : tc.type === "tool" ? { type: "function", function: { name: tc.name } } : tc.type === "none" ? "none" : "auto";
  }
  if (Array.isArray(payload.stop_sequences) && payload.stop_sequences.length) body.stop = payload.stop_sequences.slice(0, 4);
  return body;
}

// OpenAI chat completion -> Anthropic message. A malformed tool call is a provider failure, never a guess.
export function fromOpenAI(body: any): any {
  const choice = body && Array.isArray(body.choices) ? body.choices[0] : null;
  if (!choice || !choice.message) throw new ModelUnavailableError(502, "bad_response", "OpenAI returned no message");
  const msg = choice.message, content: any[] = [];
  const text = typeof msg.content === "string" ? msg.content : msg.refusal ? String(msg.refusal) : "";
  if (text) content.push({ type: "text", text });
  for (const c of msg.tool_calls || []) {
    if (!c || c.type !== "function" || !c.function) continue;
    let input: any;
    try { input = JSON.parse(c.function.arguments || "{}"); } catch (_) { throw new ModelUnavailableError(502, "bad_tool_call", `OpenAI returned unreadable arguments for ${c.function.name}`); }
    content.push({ type: "tool_use", id: c.id, name: c.function.name, input });
  }
  const used = content.some(b => b.type === "tool_use");
  const stop_reason = used ? "tool_use" : choice.finish_reason === "length" ? "max_tokens" : choice.finish_reason === "content_filter" ? "refusal" : "end_turn";
  const u = body.usage || {};
  const cached = Number(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
  const usage = { input_tokens: Math.max(0, (Number(u.prompt_tokens) || 0) - cached), output_tokens: Number(u.completion_tokens) || 0, cache_read_input_tokens: cached, cache_creation_input_tokens: 0 };
  return { id: body.id, type: "message", role: "assistant", model: body.model, content, stop_reason, usage };
}

// USD per million tokens. Sources: Anthropic's published Haiku 4.5 prices; gpt-5-nano from third-party price tables
// (usagepricing.com, g2.com) as of 2026-10-11, because OpenAI's pricing page cannot be reached from the build machine.
// Update here when the invoice disagrees; the cost is an estimate until it is reconciled with the provider's bill.
export const PRICES: Record<string, { input: number; cached: number; cache_write: number; output: number; source: string }> = {
  "gpt-5-nano": { input: 0.05, cached: 0.005, cache_write: 0, output: 0.40, source: "third-party tables 2026-10-11 (OpenAI page unreachable)" },
  "gpt-5-mini": { input: 0.25, cached: 0.025, cache_write: 0, output: 2.00, source: "third-party tables 2026-10-11 (OpenAI page unreachable)" },
  "gpt-4.1-nano": { input: 0.10, cached: 0.025, cache_write: 0, output: 0.40, source: "third-party tables 2026-10-11 (OpenAI page unreachable)" },
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

// Health events: one row per provider call outcome, so a dead key shows within minutes (model-health reads them).
export type HealthSink = (e: { provider: Provider; model: string; role: ModelRole; ok: boolean; status: number | null; error_type: string | null; detail: string | null; latency_ms: number }) => Promise<void> | void;
export function adminHealthSink(admin: any): HealthSink {
  return async (e) => { try { await admin.from("agent_provider_events").insert(e); } catch (_) { /* health logging never breaks a reply */ } };
}

export interface GatewayUsageReceiptV1 {version:'gateway_usage_receipt/v1';provider:Provider;configured_model:string;response_model:unknown;response_id:unknown;config_digest:string;request_body_sha256:string;response_body_sha256:string;usage:unknown}
export interface CallOptions { role?: ModelRole; request?: typeof fetch; timeoutMs?: number; signal?: AbortSignal; meter?: TurnMeter; health?: HealthSink; requireUsageReceipt?: boolean; receiptConfigDigest?:string; onUsageReceipt?:(receipt:GatewayUsageReceiptV1)=>Promise<void>|void }
// The same exact bytes are admitted, hashed and dispatched. No secrets in body.
export function modelRequestBody(cfg:ModelConfig,payload:any):string{return JSON.stringify(cfg.provider==='openai'?toOpenAI(payload,cfg):Object.assign({},payload,{model:cfg.model}));}
async function receiptDigest(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
// The one call. Returns an Anthropic-shaped message; throws ModelUnavailableError (provider status, type and message,
// never the key) when the provider refuses, fails or is not configured.
export async function callModel(cfg: ModelConfig, payload: any, o: CallOptions = {}): Promise<any> {
  const role = o.role || "chat", request = o.request || fetch, started = Date.now();
  const report = async (ok: boolean, status: number | null, type: string | null, detail: string | null) => { if (o.health) await o.health({ provider: cfg.provider, model: cfg.model, role, ok, status, error_type: type, detail, latency_ms: Date.now() - started }); };
  if (!cfg.apiKey) { const e = new ModelUnavailableError(0, "not_configured", `${providerName(cfg)} API key is not configured`); meterAdd(o.meter, cfg, null, true); await report(false, null, e.type, e.detail); throw e; }
  const controller=new AbortController();let expired=false;
  const stopped=()=>new ModelUnavailableError(0,expired?'timeout':'aborted',`${providerName(cfg)} request ${expired?'timed out':'was aborted'}`);
  const parentAbort=()=>controller.abort();
  o.signal?.addEventListener('abort',parentAbort,{once:true});
  if(o.signal?.aborted)controller.abort();
  const timeout=Number.isFinite(o.timeoutMs)?Math.max(0,o.timeoutMs!):30000;
  const timer=setTimeout(()=>{expired=true;controller.abort();},timeout);
  // Expired admission must not dispatch and only discover its deadline later.
  if(timeout===0){expired=true;controller.abort();}
  // The race also bounds injected/failed transports that ignore AbortSignal.
  // The same deadline remains active through headers, streamed bytes and parse.
  let rejectStop:(e:Error)=>void=()=>{};
  const stop=new Promise<never>((_,reject)=>{rejectStop=reject;});
  const onStop=()=>rejectStop(stopped());
  controller.signal.addEventListener('abort',onStop,{once:true});
  const guard=<T>(p:Promise<T>):Promise<T>=>Promise.race([p,stop]);
  try {
    if(controller.signal.aborted)throw stopped();
    const wireBody=modelRequestBody(cfg,payload);
    const pending=cfg.provider === "openai"
      ? request(OPENAI_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` }, body: wireBody, signal: controller.signal })
      : request(ANTHROPIC_URL, { method: "POST", headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" }, body: wireBody, signal: controller.signal });
    const res:Response=await guard<Response>(Promise.resolve(pending).then(r=>{if(controller.signal.aborted){void r.body?.cancel().catch(()=>{});throw stopped();}return r;}));
    let raw='';
    if(res.body){
      const reader=res.body.getReader(),chunks:Uint8Array[]=[];let length=0;
      const cancel=()=>{void reader.cancel().catch(()=>{});};
      controller.signal.addEventListener('abort',cancel,{once:true});
      try{
        if(controller.signal.aborted)throw stopped();
        while(true){
          const part=await guard(reader.read());if(controller.signal.aborted)throw stopped();if(part.done)break;
          length+=part.value.byteLength;
          if(length>200000){cancel();throw new ModelUnavailableError(502,'too_large',`${providerName(cfg)} response is too large`);}
          chunks.push(part.value);
        }
        const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        try{raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ModelUnavailableError(502,'bad_response',`${providerName(cfg)} returned invalid UTF-8`);}
      }finally{controller.signal.removeEventListener('abort',cancel);try{reader.releaseLock();}catch(_){/* pending abort cancellation releases the read */}}
    }
    if (!res.ok) throw await providerError({status:res.status,text:async()=>raw} as Response);
  let out: any;
  try {
    const body = JSON.parse(raw);
    // Capture uncoerced usage before content translation or strict validation
    // fails. Invalid receipts remain evidence for a conservative unknown bill.
    // The callback is server-selected and remains inside the response deadline.
    if(o.onUsageReceipt){
      if(!/^[a-f0-9]{64}$/.test(o.receiptConfigDigest||''))throw new ModelUnavailableError(502,'invalid_receipt_config','Missing receipt configuration identity');
      const receipt:GatewayUsageReceiptV1={version:'gateway_usage_receipt/v1',provider:cfg.provider,configured_model:cfg.model,response_model:body.model??null,response_id:body.id??null,config_digest:o.receiptConfigDigest!,request_body_sha256:await receiptDigest(wireBody),response_body_sha256:await receiptDigest(raw),usage:body.usage??null};
      await guard(Promise.resolve(o.onUsageReceipt(receipt)));
    }
    // Cash-bounded callers require actual integer receipts before the legacy
    // translator's numeric defaults/coercion can turn unknown usage into zero.
    // Existing callers retain their defaults; career coaching opts in.
    if (o.requireUsageReceipt) {
      const u = body.usage, prompt = u?.prompt_tokens, completion = u?.completion_tokens;
      const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
      if (cfg.provider !== 'openai' || ![prompt,completion,cached].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000) || cached>prompt || (u.total_tokens!==undefined&&u.total_tokens!==prompt+completion)) throw new ModelUnavailableError(502,'invalid_usage','Provider usage receipt is missing or invalid');
    }
    out = cfg.provider === "openai" ? fromOpenAI(body) : body;
  }
  catch (err) { throw err instanceof ModelUnavailableError ? err : new ModelUnavailableError(502, "bad_response", `${providerName(cfg)} returned unreadable JSON`); }
  if(controller.signal.aborted)throw stopped();
  meterAdd(o.meter, cfg, out.usage); await report(true, res.status, null, null);
  return out;
  }catch(err){
    const e=controller.signal.aborted?stopped():err instanceof ModelUnavailableError?err:new ModelUnavailableError(0,'network',`${providerName(cfg)}: ${err instanceof Error?err.message:String(err)}`);
    meterAdd(o.meter,cfg,null,true);await report(false,e.status||null,e.type,e.detail);throw e;
  }finally{clearTimeout(timer);o.signal?.removeEventListener('abort',parentAbort);controller.signal.removeEventListener('abort',onStop);}
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
