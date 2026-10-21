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
export interface Manifest { version: string; sha256: string; item_count: number; category_counts: Record<string, number>; synthetic_only: boolean; items?: { id: string; category: string; sha256: string }[] }
const FIXTURE_KEYS = ["postings", "wants", "standing", "alerts", "interviews", "connections", "dependency_errors", "history", "threads", "situation_rows"];
export async function validateCorpus(raw: string, manifest: Manifest): Promise<Corpus> {
  insist(manifest.version === "brain-reliability-320-manifest-v1" && manifest.item_count === 320 && manifest.synthetic_only === true, "manifest is not the approved synthetic 320-case corpus");
  insist(/^[a-f0-9]{64}$/.test(manifest.sha256) && await sha256(raw) === manifest.sha256, "corpus bytes do not match manifest");
  insist(canonical(manifest.category_counts) === canonical(CATEGORY_COUNTS), "manifest category counts differ");
  const corpus = JSON.parse(raw) as Corpus;
  insist(corpus.version === VERSION && ["string", "number"].includes(typeof corpus.seed) && Number.isFinite(Date.parse(corpus.clock_utc)), "invalid corpus envelope");
  insist(Array.isArray(corpus.items) && corpus.items.length === 320, "expected exactly 320 cases");
  const ids = new Set<string>(), contents = new Set<string>(), counts: Record<string, number> = {};
  for (const it of corpus.items) {
    insist(typeof it.id === "string" && it.id.length > 0 && !ids.has(it.id), "case IDs must be unique"); ids.add(it.id);
    insist(typeof it.task_type === "string" && it.task_type.length > 0, "task type label required");
    const content = canonical({ turns: it.turns, initial_state: it.initial_state ?? null, fixture: it.fixture ?? null, turn_contexts: it.turn_contexts ?? null });
    insist(!contents.has(content), "duplicate scenario content"); contents.add(content);
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
  if (manifest.items) {
    insist(manifest.items.length === corpus.items.length && new Set(manifest.items.map((i) => i.id)).size === corpus.items.length, "manifest per-item inventory differs");
    for (const it of corpus.items) { const m = manifest.items.find((i) => i.id === it.id); insist(m && m.category === it.category && m.sha256 === await sha256(canonical(it)), "manifest per-item digest differs"); }
  }
  return corpus;
}

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
const count = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
function validUsage(usage: unknown): usage is Usage {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return false;
  const u = usage as Usage;
  return [u.input_tokens, u.output_tokens, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0].every(count);
}
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
    const valid = validUsage(usage);
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
  return { charged_micros, unknown_charges, unsettled_calls: open.size, reserved_micros: [...open.values()].reduce((a, n) => a + n, 0), charges_reconciled: open.size === 0 && unknown_charges === 0, score_valid: false, note: "A recovered cost journal alone does not establish a score; validate the complete result artifact." };
}

export interface Identity { source_commit: string; corpus_sha256: string; rubric_sha256: string; clock_utc: string; seed: string | number; concurrency: number; params: Record<string, unknown> }
export interface ItemResult { id: string; category: string; development_overlap: boolean; pass: boolean | null; latency_ms: number; evaluation_latency_ms?: number; input_tokens: number; output_tokens: number; cached_tokens: number; usd_micros: number; judges: { model: string; pass: boolean; failed?: string[]; score?: number; note?: string }[]; error?: string; product_failures?: string[]; replies?: string[]; state?: unknown; trace?: unknown; judging_packet?: string; judging_packet_sha256?: string }
export interface ArmResult { model: string; identity: Identity; status: "SCORED" | "NOT_SCORED"; planned: number; items: ItemResult[]; calls: Settlement[]; ledger: ReturnType<BudgetJournal["snapshot"]> }
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
  const counts: Record<string, number> = {}; for (const i of arm.items) counts[i.category] = (counts[i.category] || 0) + 1;
  const calls = arm.calls ?? [], callTotal = calls.reduce((s, c) => s + (c.usd_micros ?? 0), 0);
  const callIDs = new Set(calls.map((c) => c.call_id)), itemIDs = new Set(arm.items.map((i) => i.id));
  // Artifact validation repeats the journal's domain checks: matching arithmetic cannot make negative/fractional
  // token counts, an unknown role or a missing meter field into provider usage evidence.
  const meterValid = callIDs.size === calls.length && calls.every((c) => count(c.call_id) && c.call_id > 0 && count(c.turn) && count(c.reserve_micros) && c.reserve_micros > 0 && count(c.usd_micros) && Number.isFinite(c.latency_ms) && c.latency_ms >= 0 && ["brain", "judge"].includes(c.role) && itemIDs.has(c.case_id) && c.status === "settled" && validUsage(c.usage) && costMicros(c.model, c.usage) === c.usd_micros && c.reserve_micros >= c.usd_micros && (c.role === "brain" ? c.model === arm.model : JUDGES.includes(c.model as any))) && callTotal === arm.ledger.usd_micros && callTotal === arm.items.reduce((s, i) => s + i.usd_micros, 0) && arm.items.every((i) => {
    const mine = calls.filter((c) => c.case_id === i.id);
    return mine.every((c) => c.category === i.category) && JUDGES.every((m) => mine.filter((c) => c.role === "judge" && c.model === m).length === 1) && mine.reduce((s, c) => s + c.usd_micros!, 0) === i.usd_micros && mine.reduce((s, c) => s + c.usage!.input_tokens, 0) === i.input_tokens && mine.reduce((s, c) => s + c.usage!.output_tokens, 0) === i.output_tokens && mine.reduce((s, c) => s + (c.usage!.cache_read_input_tokens ?? 0), 0) === i.cached_tokens;
  });
  const valid = MODELS.includes(arm.model as any) && arm.status === "SCORED" && arm.planned === 320 && arm.items.length === arm.planned && itemIDs.size === arm.items.length && canonical(counts) === canonical(CATEGORY_COUNTS) && meterValid && arm.items.every((i) => [i.input_tokens, i.output_tokens, i.cached_tokens, i.usd_micros].every(count) && Number.isFinite(i.latency_ms) && i.latency_ms >= 0 && typeof i.development_overlap === "boolean" && typeof i.pass === "boolean" && !i.error && i.judges.length === 2 && i.judges.every((j) => typeof j.pass === "boolean") && JUDGES.every((m) => i.judges.filter((j) => j.model === m).length === 1) && i.pass === (i.judges.every((j) => j.pass) && !(i.product_failures?.length))) && arm.ledger.stopped === false && arm.ledger.unsettled_calls === 0 && arm.ledger.reserved_micros === 0 && arm.ledger.unpriced_calls === 0 && arm.ledger.unknown_charges === 0;
  const costByRole = Object.fromEntries(["brain", "judge"].map((role) => [role, calls.filter((c) => c.role === role).reduce((s, c) => s + (c.usd_micros ?? 0), 0) / 1000000]));
  return { model: arm.model, status: valid ? "SCORED" : "NOT_SCORED", score_kind: "CI_INTERSECTION", final_acceptance: "NOT_RUN: independent owner-appointed third judge required", planned: arm.planned, completed: arm.items.length, full: valid ? rateSummary(arm.items) : null, clean: valid ? rateSummary(arm.items.filter((i) => !i.development_overlap)) : null,
    categories: valid ? Object.fromEntries(Object.keys(CATEGORY_COUNTS).map((c) => { const rows = arm.items.filter((i) => i.category === c); return [c, { ...rateSummary(rows), ...metrics(rows) }]; })) : null, metrics: metrics(arm.items), cost_usd: { ...costByRole, total: callTotal / 1000000 }, ledger: arm.ledger };
}
export function compareArms(a: ArmResult, b: ArmResult) {
  insist(a.model === MODELS[0] && b.model === MODELS[1], "comparison must be mini versus GPT-5");
  insist(canonical(a.identity) === canonical(b.identity), "candidate/corpus/rubric/clock/seed/parameters differ");
  insist(armSummary(a).status === "SCORED" && armSummary(b).status === "SCORED", "stopped or incomplete arms are not scores");
  const right = new Map(b.items.map((i) => [i.id, i])); insist(right.size === b.items.length && a.items.length === b.items.length && new Set(a.items.map((i) => i.id)).size === a.items.length, "case IDs differ or repeat");
  const paired = a.items.map((x) => { const y = right.get(x.id); insist(y && y.category === x.category && y.development_overlap === x.development_overlap, "paired case metadata differ"); return { category: x.category, development_overlap: x.development_overlap, delta: Number(y.pass) - Number(x.pass), latency_delta_ms: y.latency_ms - x.latency_ms }; });
  const summarize = (rows: typeof paired) => {
    const n = rows.length; if (!n) return { n, score_delta: null, mean_latency_delta_ms: null, paired95: null, variance_across_cases: null };
    const mean = rows.reduce((s, x) => s + x.delta, 0) / n, variance = n > 1 ? rows.reduce((s, x) => s + (x.delta - mean) ** 2, 0) / (n - 1) : 0, half = 1.96 * Math.sqrt(variance / n);
    const latencyMean = rows.reduce((s, x) => s + x.latency_delta_ms, 0) / n, latencyVariance = n > 1 ? rows.reduce((s, x) => s + (x.latency_delta_ms - latencyMean) ** 2, 0) / (n - 1) : 0, latencyHalf = 1.96 * Math.sqrt(latencyVariance / n);
    return { n, score_delta: mean, mean_latency_delta_ms: latencyMean, latency_paired95_ms: [latencyMean - latencyHalf, latencyMean + latencyHalf], latency_variance_across_cases_ms2: latencyVariance, paired95: [Math.max(-1, mean - half), Math.min(1, mean + half)], variance_across_cases: variance,
      discordant_improved: rows.filter((x) => x.delta === 1).length, discordant_regressed: rows.filter((x) => x.delta === -1).length };
  };
  return { identity: a.identity, mini: armSummary(a), higher: armSummary(b), paired: summarize(paired), paired_clean: summarize(paired.filter((x) => !x.development_overlap)), categories: Object.fromEntries(Object.keys(CATEGORY_COUNTS).map((c) => [c, summarize(paired.filter((x) => x.category === c))])), uncertainty: "Approximate 95% paired intervals over this fixed corpus. Case dispersion is not repeat-run model variance; one pass per model cannot estimate run-to-run variance." };
}
export interface IndependentVerdicts { judge_id: "Instinct"; owner_appointment_ref: string; model: string; identity: Identity; items: { id: string; judging_packet_sha256: string; pass: boolean; note: string }[] }
export function independentSummary(arm: ArmResult, verdicts: IndependentVerdicts) {
  insist(armSummary(arm).status === "SCORED" && verdicts.judge_id === "Instinct" && verdicts.owner_appointment_ref.trim() && verdicts.model === arm.model && canonical(verdicts.identity) === canonical(arm.identity), "independent verdicts are not bound to this arm and owner-appointed judge");
  insist(verdicts.items.length === 320 && new Set(verdicts.items.map((i) => i.id)).size === 320, "independent verdict coverage incomplete");
  const combined = arm.items.map((it) => { const j = verdicts.items.find((j) => j.id === it.id); insist(j && typeof j.pass === "boolean" && it.judging_packet_sha256 && j.judging_packet_sha256 === it.judging_packet_sha256, "independent packet identity differs"); return { ...it, pass: !!it.pass && j.pass }; });
  const full = rateSummary(combined), clean = rateSummary(combined.filter((i) => !i.development_overlap));
  return { score_kind: "THREE_WAY_INTERSECTION", full, clean, categories: Object.fromEntries(Object.keys(CATEGORY_COUNTS).map((c) => [c, rateSummary(combined.filter((i) => i.category === c))])), clean_heldout_threshold_met: clean.rate !== null && clean.rate >= .95, full_descriptive_threshold_met: full.rate !== null && full.rate >= .95, deploy_approval: "NOT_GRANTED: live gate and owner decision remain separate" };
}

export async function modelPreflight(apiKey: string, models: string[], request: typeof fetch = fetch) {
  insist(apiKey, "OPENAI_API_KEY missing");
  for (const model of models) {
    const r = await request(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) });
    insist(r.ok, `model availability preflight failed: ${model} HTTP ${r.status}`);
    const body = await r.json(); insist(body.id === model, "model availability response differs from pinned model");
  }
}

export async function fixtureBrain(it: Case, clock: string, model: (payload: any, turn: number) => Promise<any>) {
  const [{ handleInbound, memoryStore }, core, { CareerHost }, { agentTurn }, { memoryAlertStore, startWatching }, { memoryBriefStores }, { memoryStandingStore }, { memoryWantStore }, { memoryEventStore }, { situationFrom }] = await Promise.all([
    import("../../supabase/functions/_shared/conversation.ts"), import("../../supabase/functions/_shared/router_core.career.js"), import("../../supabase/functions/_shared/career_host.js"), import("../../supabase/functions/agent-chat/career_brain.ts"),
    import("../../supabase/functions/_shared/career_alert_store.ts"), import("../../supabase/functions/_shared/career_brief_store.ts"), import("../../supabase/functions/_shared/agent/memory.ts"), import("../../supabase/functions/_shared/career_apply_want.ts"), import("../../supabase/functions/_shared/agent/timeline.ts"), import("../../supabase/functions/_shared/career_situation.ts"),
  ]);
  const host = CareerHost.createCareerHost({ CareerAccess: core.CareerAccess, CareerOnboarding: core.CareerOnboarding, CareerRouter: core.CareerRouter, CareerDoorstep: core.CareerDoorstep, CareerReply: core.CareerReply, CareerContainment: core.CareerContainment });
  const fixture = copy(it.fixture ?? {}), contact = "+15550001000", userId = `synthetic-${it.id}`;
  const alerts = memoryAlertStore(), { interviews, digest, dump: briefDump } = memoryBriefStores({ interviews: { [userId]: fixture.interviews ?? [] } });
  const memory = memoryStandingStore({ [userId]: fixture.standing ?? [] }), events = memoryEventStore(), baseWants = memoryWantStore();
  const seeded = fixture.wants ?? [];
  const wants = { async put(u: string, rows: any[]) { const exists = new Set((await wants.list(u)).map((r) => r.posting_key)); const r = await baseWants.put(u, rows.filter((r) => !exists.has(r.posting_key))); return { added: r.added, already: [...r.already, ...rows.filter((r) => exists.has(r.posting_key)).map((r) => r.posting_key)] }; },
    async list(u: string): Promise<any[]> { return [...copy(seeded), ...await baseWants.list(u)]; }, async queuedSince(u: string, since: string) { return (await wants.list(u)).filter((r) => r.queued_at >= since).length; } };
  const errors = fixture.dependency_errors ?? {}, fail = (key: string) => { if (errors[key]) throw new Error(errors[key]); };
  const alertDeps = { ...alerts, async get(u: string) { fail("alerts"); return alerts.get(u); }, async save(row: any) { fail("alerts"); return alerts.save(row); } };
  const wantDeps = { async put(u: string, r: any[]) { fail("wants"); return wants.put(u, r); }, async list(u: string) { fail("wants"); return wants.list(u); }, async queuedSince(u: string, s: string) { fail("wants"); return wants.queuedSince(u, s); } };
  let now = Date.parse(clock), currentThread = "default", turn = 0;
  if (fixture.alerts) await alerts.save(startWatching(null, { userId, prefs: fixture.alerts.prefs, tz: fixture.alerts.tz, now }));
  const initial = copy(it.initial_state ?? {}), snapshots: Record<string, any> = {}, histories: Record<string, any[]> = copy(fixture.history ?? {});
  for (const [id, stores] of Object.entries(fixture.threads ?? {})) snapshots[id] = { v: 1, scope: { userId }, stores: copy(stores) };
  let account: any = { stated_facts: initial.statedFacts ? { facts: copy(initial.statedFacts.facts ?? []), keyed: [], offer: null } : {} }, accountProfile = initial.profile;
  const baseStore = memoryStore({ people: [{id:userId,contact,created:now}], history:{},stores:{},queue:[],delivered:[],seq:1 }), store = { ...baseStore, async history(_u: string) { return copy(histories[currentThread] ?? []); }, async append(_u: string, m: any) { (histories[currentThread] ??= []).push(copy(m)); },
    async stores(_u: string) { return { snapshot: snapshots[currentThread] ?? { v: 1, scope: { userId }, stores: copy(initial) } }; }, async setStores(_u: string, s: any) { snapshots[currentThread] = copy(s.snapshot); } };
  const replies: string[] = [], trace: any[] = [];
  const brainImpl = async (a: any) => {
    const ctx: any = host.createTurnCtx({ userId, threadId: currentThread, now, accountPersistence: true, snapshot: a.stores.snapshot, account, ...(accountProfile === undefined ? {} : { profile: copy(accountProfile) }) });
    const row = await alertDeps.get(userId).catch(() => null), standing = await memory.standing(userId), wanted = await wantDeps.list(userId).catch(() => []);
    const raw = fixture.situation_rows ?? {}, lastSearch = (await events.recall(userId, { kinds: ["search"], limit: 1 }))[0] ?? raw.last_search ?? null;
    const situation = situationFrom({ jobs: raw.jobs ?? [], wanted, prepared: raw.prepared ?? [], card: raw.card ?? null, questions: raw.questions ?? [], outreach: raw.outreach ?? [], mail_drafts: raw.mail_drafts ?? [], interviews: (await interviews.list(userId)).map((r) => ({ id: r.key, company: r.company, role: r.role, starts_at: r.starts_at, interview_date: r.date })),
      alerts: row ? { prefs: row.prefs, tz: row.tz } : null, standing, daily_limit: raw.daily_limit, threads: [...Object.entries(snapshots).filter(([id]) => id !== currentThread).map(([id, s]: [string, any]) => ({ thread_id: id, rows: s.stores?.trackStore?.rows ?? [] })), { thread_id: currentThread, rows: ctx.trackStore?.rows ?? [] }], connections: fixture.connections ?? [], cloud: raw.cloud ?? null, channel: raw.channel ?? null, last_search: lastSearch, unreadable: [...raw.unreadable ?? [], ...(errors.alerts ? ["alerts"] : []), ...(errors.wants ? ["wanted"] : [])] }, now);
    const result = await agentTurn({ message: a.message, history: a.history, stores: ctx, userId, threadId: currentThread, now, tz: fixture.alerts?.tz ?? "America/Chicago", alerts: alertDeps, interviews, digest, memory, events, wants: wantDeps,
      postings: async () => { fail("postings"); return copy(fixture.postings ?? []); }, posting: async (id) => { fail("posting"); return copy((fixture.postings ?? []).find((p: any) => p.job_id === id) ?? null); },
      known: { standing, alerts: row ? { prefs: row.prefs, tz: row.tz } : null, pipeline: null, situation }, model: (payload) => model(payload, turn) });
    trace.push({ stopped: result.stopped, steps: result.steps, tools: result.tool_calls });
    if (result.stopped === "model_error") throw new Error(`brain stopped: ${result.stopped}`);
    const snapshot = host.extractSnapshot(ctx); if (ctx._hostPatch?.stated_facts) account = { ...account, stated_facts: copy(ctx._hostPatch.stated_facts) };
    accountProfile = copy(ctx.profile ?? null);
    return { reply: result.reply, stores: { snapshot } };
  };
  let turnFailure: unknown;
  const brain = async (a: any) => { try { return await brainImpl(a); } catch (e) { turnFailure = e; throw e; } };
  for (turn = 0; turn < it.turns.length; turn++) {
    currentThread = it.turn_contexts?.[turn]?.thread_id ?? "default";
    now += it.turn_contexts?.[turn]?.advance_ms ?? 0;
    const out = await handleInbound({ contact, text: it.turns[turn], at: now }, { brain, store });
    // The channel honestly catches failures to show its safe outage reply. Such a turn is still NOT a scored eval.
    if (turnFailure) throw turnFailure;
    replies.push(out.bubbles.join("\n\n")); now += 60000;
  }
  return { replies, trace, state: { profile: accountProfile ?? null, account, threads: Object.fromEntries(Object.entries(snapshots).map(([id, s]) => [id, s.stores])), alerts: alerts.dump(), standing: memory.dump(), wants: await wants.list(userId), briefs: briefDump(), events: events.dump() } };
}

export const COMPARISON_RUBRIC = JUDGE_PROMPT.replace("one reply", "one complete conversation").replace("Agent's final reply:", "Complete user/assistant transcript (grade EVERY assistant turn):") + "\nGrade the complete user/assistant transcript and full saved state. An earlier unsupported claim or incomplete answer is still a failure even when the final turn is correct. Do not infer a task completed from an acknowledgement. A refusal or blocker must name what could not be completed. Every assertion about the person must be supported by their own words or the fixture state. State/tool records outrank prose claims.\n";
export interface Approval {
  owner_approval_ref: string; model: string; source_commit: string; corpus_sha256: string; cap_usd: number;
  new_budget_spent_usd: number | null; other_reserved_usd: number | null; ledger_snapshot_at: string | null; approved_over_ten?: boolean;
  owner_allocated_pool_ref?: string;
  comparison_cap_usd: number; comparison_spent_usd: number;
  first_arm_evidence?: { result_path: string; sha256: string; verified_by: string; verification_ref: string };
  mini_over_estimate_recheck_ref?: string;
}
function usdMicros(usd: number): number {
  const micros = Math.round(usd * 1000000);
  insist(Number.isFinite(usd) && usd >= 0 && Number.isSafeInteger(micros) && Math.abs(micros - usd * 1000000) < .000001, "USD limits must be nonnegative amounts at micro-dollar precision");
  return micros;
}
const presentRef = (ref: unknown) => typeof ref === "string" && !!ref.trim() && ref.trim() !== "NOT_APPROVED";
export function validateApproval(a: Approval, model: string, source: string, corpusHash: string, now = Date.now()) {
  insist(typeof a.owner_approval_ref === "string" && a.owner_approval_ref.trim().length > 0 && a.model === model && a.source_commit === source && a.corpus_sha256 === corpusHash, "owner approval is missing or not bound to this arm/candidate/corpus");
  insist(Number.isFinite(a.cap_usd) && a.cap_usd > 0 && [a.new_budget_spent_usd, a.other_reserved_usd].every((n) => n === null || typeof n === "number" && Number.isFinite(n) && n >= 0), "approval needs explicit known or null shared ledger amounts");
  const sharedKnown = a.new_budget_spent_usd !== null && a.other_reserved_usd !== null;
  insist(sharedKnown || presentRef(a.owner_allocated_pool_ref), "unknown shared totals need the owner's allocated $20 pool reference");
  if (sharedKnown) {
    insist(typeof a.ledger_snapshot_at === "string" && Number.isFinite(Date.parse(a.ledger_snapshot_at)), "approval needs current shared ledger snapshot");
    const age = now - Date.parse(a.ledger_snapshot_at); insist(age >= -300000 && age <= 1800000, "owner ledger snapshot must be no older than30minutes or more than5minutes in the future");
  }
  insist(a.comparison_cap_usd === 20 && Number.isFinite(a.comparison_spent_usd) && a.comparison_spent_usd >= 0, "owner-approved comparison HARD CAP is $20 and needs its verified spent amount");
  insist(usdMicros(a.comparison_spent_usd) + usdMicros(a.cap_usd) <= 20000000, "arm reservation exceeds comparison HARD CAP $20");
  if (model === "gpt-5-mini") insist(a.cap_usd <= 5 && a.comparison_spent_usd === 0, "mini arm must run first with at most $5 reserved");
  if (model === "gpt-5") {
    const e = a.first_arm_evidence;
    insist(e && typeof e.result_path === "string" && e.result_path && /^[a-f0-9]{64}$/.test(e.sha256) && presentRef(e.verified_by) && presentRef(e.verification_ref), "higher arm needs verified first-arm result evidence");
  }
  insist(a.cap_usd <= 10 || a.approved_over_ten === true, "over-$10 arm requires explicit owner word");
  if (sharedKnown) {
    insist(usdMicros(a.new_budget_spent_usd!) >= usdMicros(a.comparison_spent_usd), "owner shared ledger snapshot omits comparison spend");
    insist(usdMicros(a.new_budget_spent_usd!) + usdMicros(a.other_reserved_usd!) + usdMicros(a.cap_usd) <= 35000000, "arm reservation exceeds new $35 working budget");
  }
}
export async function verifyFirstArm(a: Approval, identity: Identity, rawResult: string) {
  insist(a.model === "gpt-5" && a.first_arm_evidence, "first-arm evidence is required only for the higher arm");
  insist(await sha256(rawResult) === a.first_arm_evidence.sha256, "first-arm result byte hash differs");
  const first = JSON.parse(rawResult) as ArmResult;
  insist(first.model === "gpt-5-mini" && armSummary(first).status === "SCORED", "first arm must be a complete, reconciled mini result");
  insist(canonical(first.identity) === canonical(identity), "first-arm candidate/corpus/rubric/clock/parameters differ");
  await verifyJudgingPackets(first);
  const spent = first.ledger.usd_micros;
  insist(spent === usdMicros(a.comparison_spent_usd), "comparison spent amount differs from verified mini metered cost");
  insist(spent <= 2143269 || presentRef(a.mini_over_estimate_recheck_ref), "mini exceeded $2.143269; explicit owner re-check is required before higher arm");
  insist(spent + usdMicros(a.cap_usd) <= 20000000, "verified mini cost plus higher cap exceeds $20");
  return { model: first.model, source_commit: first.identity.source_commit, corpus_sha256: first.identity.corpus_sha256, sha256: a.first_arm_evidence.sha256, exact_metered_usd: spent / 1000000, comparison_remaining_usd: (20000000 - spent) / 1000000, over_estimate_recheck_ref: a.mini_over_estimate_recheck_ref ?? null };
}
export async function verifyJudgingPackets(arm: ArmResult) {
  await Promise.all(arm.items.map(async (it) => {
    insist(typeof it.judging_packet === "string" && it.judging_packet.length > 0 && typeof it.judging_packet_sha256 === "string" && /^[a-f0-9]{64}$/.test(it.judging_packet_sha256), "judging packet evidence is missing");
    insist(await sha256(it.judging_packet) === it.judging_packet_sha256, "judging packet bytes differ from their digest");
  }));
}
export async function runArm(corpus: Corpus, identity: Identity, model: string, journal: BudgetJournal, append: Append, apiKey: string, request: typeof fetch = fetch): Promise<ArmResult> {
  insist(MODELS.includes(model as any) && identity.concurrency >= 1 && identity.concurrency <= 4, "unsupported arm/concurrency");
  let at = 0, halt = false; const items: ItemResult[] = [];
  const call = async (meta: CallMeta, payload: any) => {
    insist(!halt, "arm halted; no further call dispatched");
    const cfg: ModelConfig = { provider: "openai", model: meta.model, apiKey, reasoningEffort: meta.model.startsWith("gpt-5") ? "minimal" : null };
    const id = journal.reserve(meta, reservationMicros(cfg, payload)), started = performance.now();
    let output: any;
    try {
      output = await callModel(cfg, payload, { request: (async (...args: Parameters<typeof fetch>) => {
        const res = await request(...args);
        if (res.ok) { const body = await res.clone().json(), u = body.usage, cached = u?.prompt_tokens_details?.cached_tokens ?? 0; insist(u && Number.isSafeInteger(u.prompt_tokens) && u.prompt_tokens >= 0 && Number.isSafeInteger(u.completion_tokens) && u.completion_tokens >= 0 && Number.isSafeInteger(cached) && cached >= 0 && cached <= u.prompt_tokens, "provider response has no valid metered usage"); }
        return res;
      }) as typeof fetch });
    } catch (e) { journal.settle(id, meta, null, performance.now() - started); throw e; }
    journal.settle(id, meta, output.usage, performance.now() - started); return output;
  };
  const worker = async () => { while (!halt && at < corpus.items.length) {
    const it = corpus.items[at++], started = performance.now(); let judged: any[] = [], result: any = null, error: string | undefined, brainLatency = 0, packet: string | undefined;
    try {
      result = await fixtureBrain(it, corpus.clock_utc, (payload, turn) => call({ case_id: it.id, category: it.category, role: "brain", model, turn }, payload));
      brainLatency = performance.now() - started;
      const transcript = JSON.stringify({ turns: it.turns.map((user, i) => ({ user, assistant: result.replies[i] })), trace: result.trace });
      insist(bytes(transcript).length <= 120000, "judge evidence exceeds explicit size limit; nothing was truncated");
      const fill: Record<string, string> = { persona: it.persona, turns: JSON.stringify(it.turns), reply: transcript, state: JSON.stringify(result.state), must: JSON.stringify(it.must), must_not: JSON.stringify(it.must_not), state_expectation: it.state ?? "(none)" };
      const prompt = COMPARISON_RUBRIC.replace(/\{(\w+)\}/g, (_, key) => fill[key] ?? "");
      packet = prompt;
      for (const judge of JUDGES) {
        const out = await call({ case_id: it.id, category: it.category, role: "judge", model: judge, turn: it.turns.length }, { system: "Grade strictly. Return only the requested JSON object.", messages: [{ role: "user", content: prompt }], max_tokens: 700 });
        insist(out.stop_reason === "end_turn", "judge response was truncated or did not finish");
        judged.push({ model: judge, ...strictVerdict(out.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")) });
      }
    } catch (e) { halt = true; error = e instanceof Error ? e.message : String(e); }
    const mine = journal.settled.filter((c) => c.case_id === it.id);
    const product_failures = (result?.trace ?? []).filter((t: any) => ["incomplete_reply", "max_steps"].includes(t.stopped)).map((t: any) => t.stopped);
    const item: ItemResult = { id: it.id, category: it.category, development_overlap: it.development_overlap, pass: error ? null : completeJudgment(judged) && !product_failures.length, product_failures, latency_ms: brainLatency || performance.now() - started, evaluation_latency_ms: performance.now() - started, input_tokens: mine.reduce((s, c) => s + (c.usage?.input_tokens ?? 0), 0), output_tokens: mine.reduce((s, c) => s + (c.usage?.output_tokens ?? 0), 0), cached_tokens: mine.reduce((s, c) => s + (c.usage?.cache_read_input_tokens ?? 0), 0), usd_micros: mine.reduce((s, c) => s + (c.usd_micros ?? 0), 0), judges: judged, ...(error ? { error } : {}), ...(result ?? {}), ...(packet ? { judging_packet: packet, judging_packet_sha256: await sha256(packet) } : {}) };
    append({ type: "item", item }); items.push(item);
  } };
  await Promise.all(Array.from({ length: identity.concurrency }, worker));
  items.sort((a, b) => corpus.items.findIndex((i) => i.id === a.id) - corpus.items.findIndex((i) => i.id === b.id));
  return { model, identity, status: halt ? "NOT_SCORED" : "SCORED", planned: corpus.items.length, items, calls: journal.settled, ledger: journal.snapshot() };
}

export function corpusInventory(c: Corpus, rawBytes: number) {
  return { count: c.items.length, turns: c.items.reduce((n, i) => n + i.turns.length, 0), multi_turn_items: c.items.filter((i) => i.turns.length > 1).length, utf8_bytes: rawBytes,
    scenario_input_chars: c.items.reduce((n, i) => n + i.turns.join("").length + JSON.stringify(i.initial_state ?? {}).length + JSON.stringify(i.fixture ?? {}).length, 0), rubric_chars: c.items.reduce((n, i) => n + i.persona.length + i.must.join("").length + i.must_not.join("").length + (i.state ?? "").length, 0),
    category_counts: Object.fromEntries(Object.keys(CATEGORY_COUNTS).map((cat) => [cat, c.items.filter((i) => i.category === cat).length])), clean_count: c.items.filter((i) => !i.development_overlap).length,
    cost_status: "UNPRICED_PROPOSAL: inventory is not model-call telemetry; hidden steps/output/reasoning/history length remain uncertain" };
}
// CLI is manual only; exactly one owner-approved arm, never automatic retries or both arms in one invocation.
if (import.meta.main) {
  const opt = (key: string) => { const at = Deno.args.indexOf(key); return at >= 0 ? Deno.args[at + 1] : undefined; };
  if (opt("--compare-mini") && opt("--compare-higher")) {
    const mini = JSON.parse(await Deno.readTextFile(opt("--compare-mini")!)), higher = JSON.parse(await Deno.readTextFile(opt("--compare-higher")!));
    await Promise.all([verifyJudgingPackets(mini), verifyJudgingPackets(higher)]);
    console.log(JSON.stringify(compareArms(mini, higher), null, 2));
  } else {
    const corpusPath = opt("--corpus"), manifestPath = opt("--manifest");
    insist(corpusPath && manifestPath, "NOT RUN: --corpus and --manifest required");
    const raw = await Deno.readTextFile(corpusPath), manifestRaw = await Deno.readTextFile(manifestPath), manifest = JSON.parse(manifestRaw) as Manifest, corpus = await validateCorpus(raw, manifest);
    if (Deno.args.includes("--inventory")) console.log(JSON.stringify(corpusInventory(corpus, bytes(raw).length), null, 2));
    else {
      insist(Deno.args.includes("--run-approved") && opt("--approval-file") && opt("--model") && opt("--out"), "NOT RUN: explicit --run-approved, bound owner approval file, one model and output prefix required");
      const model = opt("--model")!, out = opt("--out")!, approval = JSON.parse(await Deno.readTextFile(opt("--approval-file")!)) as Approval;
      insist(MODELS.includes(model as any), "unsupported brain model");
      const git = async (...args: string[]) => { const r = await new Deno.Command("git", { args, stdout: "piped", stderr: "piped" }).output(); insist(r.success, "git provenance check failed"); return new TextDecoder().decode(r.stdout).trim(); };
      const source = await git("rev-parse", "HEAD"); insist(/^[a-f0-9]{40}$/.test(source) && !await git("status", "--porcelain"), "candidate checkout must be clean and pinned");
      validateApproval(approval, model, source, manifest.sha256);
      const identity: Identity = { source_commit: source, corpus_sha256: manifest.sha256, rubric_sha256: await sha256(COMPARISON_RUBRIC), clock_utc: corpus.clock_utc, seed: corpus.seed, concurrency: 4,
        params: { judges: [...JUDGES], reasoning_effort: "minimal", brain_max_tokens: 1200, judge_max_tokens: 700, provider_retry_count: 0, turn_advance_ms: 60000, fixture_version: "deterministic-local-stores-v1", manifest_sha256: await sha256(manifestRaw), harness_sha256: await sha256(await Deno.readTextFile(new URL(import.meta.url))), prices_sha256: await sha256(canonical(Object.fromEntries([...MODELS, ...JUDGES].map((m) => [m, PRICES[m]])))) } };
      const firstArm = model === "gpt-5" ? await verifyFirstArm(approval, identity, await Deno.readTextFile(approval.first_arm_evidence!.result_path)) : null;
      // Local, same-approval-file replay guard only. The owner's shared ledger and once-only publication remain authoritative.
      const receipt = Deno.openSync(opt("--approval-file")! + ".consumed", { write: true, createNew: true, mode: 0o600 });
      try { receipt.writeSync(bytes(canonical({ approval, consumed_at: new Date().toISOString() }))); receipt.syncSync(); } finally { receipt.close(); }
      const file = durableAppend(out + ".journal.jsonl");
      try {
        file.append({ type: "arm", model, identity, approval, first_arm_verified: firstArm, budget_scope: approval.new_budget_spent_usd === null || approval.other_reserved_usd === null ? "OWNER_ALLOCATED_POOL_ONLY; shared $35 working/$40 hard ledger is owner-consolidated and unknown here" : "PER_ARM_PLUS_KNOWN_OWNER_SHARED_SNAPSHOT; not cross-machine enforcement", prior_settled_before_comparison_usd: .139984, started_at: new Date().toISOString(), acceptance: "CI_INTERSECTION only; independent Instinct verdict required" });
        const key = Deno.env.get("OPENAI_API_KEY") ?? ""; await modelPreflight(key, [...new Set([model, ...JUDGES])]);
        file.append({ type: "preflight", models: [...new Set([model, ...JUDGES])], status: "available" });
        const journal = new BudgetJournal(usdMicros(approval.cap_usd), file.append);
        const arm = await runArm(corpus, identity, model, journal, file.append, key), summary = armSummary(arm);
        file.append({ type: "complete", summary, finished_at: new Date().toISOString() });
        const resultFile = Deno.openSync(out + ".json", { write: true, createNew: true, mode: 0o600 }), data = bytes(JSON.stringify(arm));
        try { let offset = 0; while (offset < data.length) offset += resultFile.writeSync(data.subarray(offset)); resultFile.syncSync(); } finally { resultFile.close(); }
        console.log(JSON.stringify({ ...summary, result_sha256: await sha256(data), comparison_cap_usd: 20, comparison_spent_before_usd: approval.comparison_spent_usd, comparison_spent_after_known_usd: (usdMicros(approval.comparison_spent_usd) + arm.ledger.usd_micros) / 1000000, prior_settled_before_comparison_usd: .139984, shared_ledger: "Owner consolidates $35 working/$40 hard budget; unknown external balances are not inferred as zero" }, null, 2)); if (summary.status !== "SCORED") Deno.exitCode = 2;
      } finally { file.close(); }
    }
  }
}
