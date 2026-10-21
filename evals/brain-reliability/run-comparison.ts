// Manual, one approved arm at a time. Importing this file never makes a provider call.
import { callModel, costMicros, PRICES, toOpenAI, type ModelConfig } from "../../supabase/functions/_shared/model_gateway.ts";
import { JUDGE_PROMPT } from "../career/run.ts";

export const VERSION = "brain-reliability-320-v1";
export const JUDGES = ["gpt-5-mini", "gpt-4.1-mini"] as const;
export const MODELS = ["gpt-5-mini", "gpt-5"] as const;
export const CATEGORY_COUNTS: Record<string, number> = { search_refinement: 56, memory_goals: 40, application_answers: 40, forms_materials: 40, queue_followthrough: 32, tracking: 24, interview_negotiation: 24, alerts_discovery: 24, channel_handoff: 16, interrupted_retry: 16, help_scope: 8 };
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const bytes = (s: string) => new TextEncoder().encode(s);
function insist(ok: unknown, why: string): asserts ok { if (!ok) throw new Error(why); }
export async function sha256(s: string | Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(typeof s === "string" ? bytes(s) : s)))].map((n) => n.toString(16).padStart(2, "0")).join("");
}
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") return "{" + Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical((x as any)[k])}`).join(",") + "}";
  return JSON.stringify(x);
}
export interface Case {
  id: string; category: string; task_type: string; persona: string; turns: string[]; must: string[]; must_not: string[];
  state?: string; initial_state?: Record<string, any>; fixture?: Record<string, any>; development_overlap: boolean;
  turn_contexts?: { thread_id: string; advance_ms?: number }[];
}
export interface Corpus { version: string; seed: string | number; clock_utc: string; items: Case[] }
export interface Manifest { version: string; corpus_sha256: string; count: number; category_counts: Record<string, number>; synthetic_only: boolean }
const FIXTURE_KEYS = ["postings", "wants", "standing", "alerts", "interviews", "connections", "dependency_errors", "history", "threads", "situation_rows"];
export async function validateCorpus(raw: string, manifest: Manifest): Promise<Corpus> {
  insist(manifest.version === VERSION && manifest.count === 320 && manifest.synthetic_only === true, "manifest is not the approved synthetic 320-case corpus");
  insist(/^[a-f0-9]{64}$/.test(manifest.corpus_sha256) && await sha256(raw) === manifest.corpus_sha256, "corpus bytes do not match manifest");
  insist(canonical(manifest.category_counts) === canonical(CATEGORY_COUNTS), "manifest category counts differ");
  const corpus = JSON.parse(raw) as Corpus;
  insist(corpus.version === VERSION && ["string", "number"].includes(typeof corpus.seed) && Number.isFinite(Date.parse(corpus.clock_utc)), "invalid corpus envelope");
  insist(Array.isArray(corpus.items) && corpus.items.length === 320, "expected exactly 320 cases");
  const ids = new Set<string>(), types = new Set<string>(), counts: Record<string, number> = {};
  for (const it of corpus.items) {
    insist(typeof it.id === "string" && it.id.length > 0 && !ids.has(it.id), "case IDs must be unique"); ids.add(it.id);
    insist(typeof it.task_type === "string" && it.task_type.length > 0 && !types.has(it.task_type), "task types must be unique"); types.add(it.task_type);
    insist(Object.hasOwn(CATEGORY_COUNTS, it.category), "unknown category"); counts[it.category] = (counts[it.category] || 0) + 1;
    insist(typeof it.persona === "string" && typeof it.development_overlap === "boolean", "missing persona or development overlap flag");
    for (const k of ["turns", "must", "must_not"] as const) insist(Array.isArray(it[k]) && it[k].every((s) => typeof s === "string"), `invalid ${k}`);
    insist(it.turns.length > 0 && it.must.length > 0 && it.turns.every((s) => s.trim()), "empty conversation or rubric");
    if (it.turn_contexts) insist(it.turn_contexts.length === it.turns.length && it.turn_contexts.every((c) => typeof c.thread_id === "string" && c.thread_id && (c.advance_ms === undefined || Number.isSafeInteger(c.advance_ms) && c.advance_ms >= 0)), "turn contexts must align with turns");
    if (it.fixture) insist(Object.keys(it.fixture).every((k) => FIXTURE_KEYS.includes(k)), "unsupported fixture dependency");
    for (const k of ["postings", "wants", "standing", "interviews", "connections"]) if (it.fixture?.[k] !== undefined) insist(Array.isArray(it.fixture[k]), `fixture ${k} must be an array`);
    if (it.fixture?.dependency_errors) insist(Object.entries(it.fixture.dependency_errors).every(([k, v]) => ["postings", "posting", "wants", "alerts"].includes(k) && typeof v === "string"), "unsupported dependency failure");
  }
  insist(canonical(counts) === canonical(CATEGORY_COUNTS), "corpus category counts differ");
  return corpus;
}

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
export interface CallMeta { case_id: string; category: string; role: "brain" | "judge"; model: string; turn: number }
export interface Settlement extends CallMeta { call_id: number; latency_ms: number; usage: Usage | null; usd_micros: number | null; status: "settled" | "unknown"; reserve_micros: number }
export type Append = (event: Record<string, unknown>) => void;
// Synchronous append+fsync before dispatch is the budget lock. Concurrent workers share this one object.
export class BudgetJournal {
  private next = 0; private open = new Map<number, number>(); private spent = 0; private poisoned = false;
  readonly settled: Settlement[] = [];
  constructor(readonly cap_micros: number, private append: Append) { insist(Number.isSafeInteger(cap_micros) && cap_micros > 0, "invalid arm budget"); }
  reserve(meta: CallMeta, max_micros: number): number {
    insist(!this.poisoned, "unresolved provider charge: arm stopped");
    insist(Number.isSafeInteger(max_micros) && max_micros > 0, "invalid reservation");
    const held = [...this.open.values()].reduce((a, n) => a + n, 0);
    insist(this.spent + held + max_micros <= this.cap_micros, "arm budget exhausted before provider call");
    const call_id = ++this.next;
    this.append({ type: "reserved", call_id, ...meta, reserve_micros: max_micros });
    this.open.set(call_id, max_micros); return call_id;
  }
  settle(call_id: number, meta: CallMeta, usage: Usage | null, latency_ms: number): Settlement {
    const reserve_micros = this.open.get(call_id); insist(reserve_micros !== undefined, "unknown or duplicate settlement");
    const valid = usage && [usage.input_tokens, usage.output_tokens, usage.cache_read_input_tokens ?? 0, usage.cache_creation_input_tokens ?? 0].every((n) => Number.isSafeInteger(n) && n >= 0);
    const usd_micros = valid ? costMicros(meta.model, usage) : null;
    const s: Settlement = { ...meta, call_id, reserve_micros, latency_ms, usage: valid ? copy(usage) : null, usd_micros, status: usd_micros === null ? "unknown" : "settled" };
    this.append({ type: "settlement", ...s }); this.settled.push(s);
    if (usd_micros === null) { this.poisoned = true; } else {
      this.open.delete(call_id); this.spent += usd_micros;
      if (usd_micros > reserve_micros || this.spent > this.cap_micros) { this.poisoned = true; throw new Error("provider usage exceeded conservative reservation; arm invalid"); }
    }
    return s;
  }
  snapshot() { return { usd_micros: this.spent, unsettled_calls: this.open.size, reserved_micros: [...this.open.values()].reduce((a, n) => a + n, 0), unknown_charges: this.settled.filter((s) => s.status === "unknown").length, unpriced_calls: this.settled.filter((s) => !PRICES[s.model]).length, stopped: this.poisoned }; }
}
// A text-only UTF-8 byte upper bound, plus framing allowance, avoids optimistic chars/4 estimates.
// Actual output cap includes the gateway's 512 reasoning-token headroom. Images/audio are rejected.
export function reservationMicros(cfg: ModelConfig, payload: any): number {
  insist(cfg.provider === "openai" && !!PRICES[cfg.model], "unpriced or unsupported provider/model");
  const body = toOpenAI(payload, cfg), raw = JSON.stringify(body);
  insist(!raw.includes('"image_url"') && !raw.includes('"input_audio"'), "non-text input has no approved cost bound");
  const n = bytes(raw).length; insist(n <= 500000 && Number.isSafeInteger(body.max_completion_tokens) && body.max_completion_tokens > 0 && body.max_completion_tokens <= 8192, "provider payload exceeds approved token limits");
  return Math.ceil((n + 4096) * PRICES[cfg.model].input + body.max_completion_tokens * PRICES[cfg.model].output);
}
export function strictVerdict(raw: string) {
  const j = JSON.parse(raw);
  insist(typeof j.pass === "boolean" && Array.isArray(j.failed) && j.failed.every((s: unknown) => typeof s === "string") && Number.isFinite(j.score) && j.score >= 1 && j.score <= 5 && typeof j.note === "string", "invalid judge result");
  insist(!(j.pass && j.failed.length), "judge pass contradicts failed rubric items");
  return j as { pass: boolean; failed: string[]; score: number; note: string };
}
export function completeJudgment(judges: { model: string; pass: boolean }[]) {
  insist(judges.length === 2 && JUDGES.every((m) => judges.filter((j) => j.model === m).length === 1), "both distinct fixed judges are required");
  return judges.every((j) => j.pass);
}
export function durableAppend(path: string): { append: Append; close(): void } {
  const file = Deno.openSync(path, { write: true, createNew: true, mode: 0o600 });
  return { append(event) { const raw = bytes(JSON.stringify(event) + "\n"); let at = 0; while (at < raw.length) at += file.writeSync(raw.subarray(at)); file.syncSync(); }, close() { file.close(); } };
}
export function recoverJournal(raw: string) {
  const open = new Map<number, number>(), settled = new Set<number>(); let charged_micros = 0, unknown_charges = 0;
  const lines = raw.split("\n"); if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    const e = JSON.parse(line); // A partial last line is NOT silently discarded.
    if (e.type === "reserved") { insist(!open.has(e.call_id), "duplicate reservation"); open.set(e.call_id, e.reserve_micros); }
    if (e.type === "settlement") {
      insist(open.has(e.call_id) && !settled.has(e.call_id), "settlement without reservation or duplicate settlement"); settled.add(e.call_id);
      if (e.usd_micros === null) unknown_charges++; else { charged_micros += e.usd_micros; open.delete(e.call_id); }
    }
  }
  return { charged_micros, unknown_charges, unsettled_calls: open.size, reserved_micros: [...open.values()].reduce((a, n) => a + n, 0), score_valid: open.size === 0 && unknown_charges === 0 };
}

export interface Identity { source_commit: string; corpus_sha256: string; rubric_sha256: string; clock_utc: string; seed: string | number; concurrency: number; params: Record<string, unknown> }
export interface ItemResult { id: string; category: string; development_overlap: boolean; pass: boolean | null; latency_ms: number; input_tokens: number; output_tokens: number; cached_tokens: number; usd_micros: number; judges: { model: string; pass: boolean; failed?: string[]; score?: number; note?: string }[]; error?: string; replies?: string[]; state?: unknown; trace?: unknown }
export interface ArmResult { model: string; identity: Identity; status: "SCORED" | "NOT_SCORED"; planned: number; items: ItemResult[]; ledger: ReturnType<BudgetJournal["snapshot"]> }
export function rateSummary(items: ItemResult[]) {
  const n = items.length, passed = items.filter((i) => i.pass === true).length;
  if (!n) return { n, passed, rate: null, wilson95: null, variance_across_cases: null };
  const p = passed / n, z2 = 1.96 ** 2, center = (p + z2 / (2 * n)) / (1 + z2 / n), half = 1.96 * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / (1 + z2 / n);
  return { n, passed, rate: p, wilson95: [center - half, center + half], variance_across_cases: n > 1 ? p * (1 - p) * n / (n - 1) : null };
}
export function metrics(items: ItemResult[]) {
  const sorted = items.map((i) => i.latency_ms).sort((a, b) => a - b), n = items.length;
  return { n, input_tokens: items.reduce((s, i) => s + i.input_tokens, 0), output_tokens: items.reduce((s, i) => s + i.output_tokens, 0), cached_tokens: items.reduce((s, i) => s + i.cached_tokens, 0), usd_micros: items.reduce((s, i) => s + i.usd_micros, 0), latency_ms: { mean: n ? sorted.reduce((s, t) => s + t, 0) / n : null, p50: n ? sorted[Math.ceil(n * .5) - 1] : null, p95: n ? sorted[Math.ceil(n * .95) - 1] : null } };
}
export function armSummary(arm: ArmResult) {
  const valid = arm.status === "SCORED" && arm.planned === 320 && arm.items.length === arm.planned && arm.items.every((i) => i.pass !== null && !i.error && i.judges.length === 2 && JUDGES.every((m) => i.judges.filter((j) => j.model === m).length === 1) && i.pass === i.judges.every((j) => j.pass)) && !arm.ledger.stopped && !arm.ledger.unsettled_calls && !arm.ledger.unpriced_calls && !arm.ledger.unknown_charges;
  return { model: arm.model, status: valid ? "SCORED" : "NOT_SCORED", planned: arm.planned, completed: arm.items.length, full: valid ? rateSummary(arm.items) : null, clean: valid ? rateSummary(arm.items.filter((i) => !i.development_overlap)) : null,
    categories: valid ? Object.fromEntries(Object.keys(CATEGORY_COUNTS).map((c) => { const rows = arm.items.filter((i) => i.category === c); return [c, { ...rateSummary(rows), ...metrics(rows) }]; })) : null, metrics: metrics(arm.items), ledger: arm.ledger };
}
export function compareArms(a: ArmResult, b: ArmResult) {
  insist(a.model === MODELS[0] && b.model === MODELS[1], "comparison must be mini versus GPT-5");
  insist(canonical(a.identity) === canonical(b.identity), "candidate/corpus/rubric/clock/seed/parameters differ");
  insist(armSummary(a).status === "SCORED" && armSummary(b).status === "SCORED", "stopped or incomplete arms are not scores");
  const right = new Map(b.items.map((i) => [i.id, i])); insist(right.size === b.items.length && a.items.length === b.items.length && new Set(a.items.map((i) => i.id)).size === a.items.length, "case IDs differ or repeat");
  const paired = a.items.map((x) => { const y = right.get(x.id); insist(y && y.category === x.category && y.development_overlap === x.development_overlap, "paired case metadata differ"); return { category: x.category, delta: Number(y.pass) - Number(x.pass), latency_delta_ms: y.latency_ms - x.latency_ms }; });
  const summarize = (rows: typeof paired) => {
    const n = rows.length; if (!n) return { n, score_delta: null, mean_latency_delta_ms: null, paired95: null, variance_across_cases: null };
    const mean = rows.reduce((s, x) => s + x.delta, 0) / n, variance = n > 1 ? rows.reduce((s, x) => s + (x.delta - mean) ** 2, 0) / (n - 1) : 0, half = 1.96 * Math.sqrt(variance / n);
    return { n, score_delta: mean, mean_latency_delta_ms: rows.reduce((s, x) => s + x.latency_delta_ms, 0) / n, paired95: [Math.max(-1, mean - half), Math.min(1, mean + half)], variance_across_cases: variance,
      discordant_improved: rows.filter((x) => x.delta === 1).length, discordant_regressed: rows.filter((x) => x.delta === -1).length };
  };
  return { identity: a.identity, mini: armSummary(a), higher: armSummary(b), paired: summarize(paired), categories: Object.fromEntries(Object.keys(CATEGORY_COUNTS).map((c) => [c, summarize(paired.filter((x) => x.category === c))])), uncertainty: "Approximate 95% paired intervals over this fixed corpus. Case dispersion is not repeat-run model variance; one pass per model cannot estimate run-to-run variance." };
}

export async function modelPreflight(apiKey: string, models: string[], request: typeof fetch = fetch) {
  insist(apiKey, "OPENAI_API_KEY missing");
  for (const model of models) {
    const r = await request(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) });
    insist(r.ok, `model availability preflight failed: ${model} HTTP ${r.status}`);
    const body = await r.json(); insist(body.id === model, "model availability response differs from pinned model");
  }
}

// The executable arm and dependency world are below; --compare is entirely offline.
if (import.meta.main) {
  const opt = (key: string) => { const at = Deno.args.indexOf(key); return at >= 0 ? Deno.args[at + 1] : undefined; };
  if (opt("--compare-mini") && opt("--compare-higher")) {
    console.log(JSON.stringify(compareArms(JSON.parse(await Deno.readTextFile(opt("--compare-mini")!)), JSON.parse(await Deno.readTextFile(opt("--compare-higher")!))), null, 2));
  } else throw new Error("NOT RUN: arm execution is not yet enabled; no provider call was made");
}
