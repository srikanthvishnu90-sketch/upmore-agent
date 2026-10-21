import { costMicros, toOpenAI } from "../../supabase/functions/_shared/model_gateway.ts";
import { armSummary, BudgetJournal, canonical, CATEGORY_COUNTS, compareArms, completeJudgment, modelPreflight, recoverJournal, reservationMicros, sha256, strictVerdict, validateCorpus, VERSION, type ArmResult, type CallMeta, type Corpus } from "../../evals/brain-reliability/run-comparison.ts";

function assert(ok: unknown, why = "assertion failed"): asserts ok { if (!ok) throw new Error(why); }
Deno.test("comparison: higher brain model has explicit uncached, cached and output prices", () => {
  assert(costMicros("gpt-5", { input_tokens: 1000000, cache_read_input_tokens: 1000000, output_tokens: 1000000 }) === 11375000,
    "gpt-5 is unpriced or its public token prices are wrong");
});
Deno.test("comparison: GPT-5 adapter retains reasoning token headroom and omits temperature", () => {
  const body = toOpenAI({ max_tokens: 1000, temperature: 0, messages: [{ role: "user", content: "fixture" }] },
    { provider: "openai", model: "gpt-5", apiKey: "not-a-key", reasoningEffort: "minimal" });
  assert(body.max_completion_tokens === 1512 && body.reasoning_effort === "minimal" && !("temperature" in body));
});
const meta: CallMeta = { case_id: "fixture-1", category: "help_scope", model: "gpt-5-mini", role: "brain", turn: 0 };
function throws(fn: () => unknown, needle = "") { try { fn(); } catch (e) { assert(String(e).includes(needle)); return; } throw new Error("expected failure"); }
async function rejects(fn: () => Promise<unknown>, needle = "") { try { await fn(); } catch (e) { assert(String(e).includes(needle)); return; } throw new Error("expected failure"); }
function corpus(): Corpus { let id = 0; return { version: VERSION, seed: "fixture-seed", clock_utc: "2026-10-21T12:00:00Z", items: Object.entries(CATEGORY_COUNTS).flatMap(([category, n]) => Array.from({ length: n }, () => ({ id: `fixture-${++id}`, task_type: `distinct-${id}`, category, persona: "synthetic unit fixture", turns: ["unit-only task"], must: ["unit-only rubric"], must_not: [], development_overlap: false }))) }; }
async function validated(c: Corpus) { const raw = JSON.stringify(c); return validateCorpus(raw, { version: VERSION, corpus_sha256: await sha256(raw), count: 320, category_counts: CATEGORY_COUNTS, synthetic_only: true }); }
Deno.test("comparison: corpus validates fixed count, categories, uniqueness and aligned threads", async () => {
  assert((await validated(corpus())).items.length === 320);
  const repeated = corpus(); repeated.items[1].task_type = repeated.items[0].task_type;
  await rejects(() => validated(repeated), "task types");
  const misaligned = corpus(); misaligned.items[0].turn_contexts = [];
  await rejects(() => validated(misaligned), "align");
});
Deno.test("comparison: corpus rejects tampered bytes, non-synthetic data and injected tool outputs", async () => {
  const c = corpus(), raw = JSON.stringify(c), m = { version: VERSION, corpus_sha256: await sha256(raw), count: 320, category_counts: CATEGORY_COUNTS, synthetic_only: true };
  await rejects(() => validateCorpus(raw + " ", m), "bytes");
  await rejects(() => validateCorpus(raw, { ...m, synthetic_only: false }), "synthetic");
  c.items[0].fixture = { tool_outcomes: { magical_success: true } };
  await rejects(() => validated(c), "unsupported fixture");
});
Deno.test("comparison: synchronous reservations prevent concurrent workers exceeding a shared cap", () => {
  const events: any[] = [], journal = new BudgetJournal(100, (e) => events.push(e));
  const a = journal.reserve(meta, 60); throws(() => journal.reserve(meta, 50), "exhausted");
  journal.settle(a, meta, { input_tokens: 40, output_tokens: 0 }, 8);
  journal.reserve(meta, 90); assert(events.length === 3 && journal.snapshot().usd_micros === 10);
});
Deno.test("comparison: reservation is durable before a call can start and append failures fail closed", () => {
  const journal = new BudgetJournal(100, () => { throw new Error("disk full"); });
  throws(() => journal.reserve(meta, 60), "disk full"); assert(journal.snapshot().reserved_micros === 0);
});
Deno.test("comparison: lost response stays UNKNOWN, holds its reservation and poisons further calls", () => {
  const events: any[] = [], journal = new BudgetJournal(100, (e) => events.push(e));
  journal.settle(journal.reserve(meta, 60), meta, null, 15);
  assert(journal.snapshot().unknown_charges === 1 && journal.snapshot().reserved_micros === 60);
  throws(() => journal.reserve(meta, 1), "unresolved");
  const recovered = recoverJournal(events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  assert(!recovered.score_valid && recovered.unknown_charges === 1 && recovered.reserved_micros === 60);
});
Deno.test("comparison: crash recovery retains dispatched reservation and rejects torn journal records", () => {
  const events: any[] = [], journal = new BudgetJournal(100, (e) => events.push(e)); journal.reserve(meta, 60);
  const raw = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  assert(recoverJournal(raw).unsettled_calls === 1); throws(() => recoverJournal(raw + '{"type":'));
});
Deno.test("comparison: metered cost over reservation is recorded and invalidates the arm", () => {
  const journal = new BudgetJournal(10, () => {}), call = journal.reserve(meta, 5);
  throws(() => journal.settle(call, meta, { input_tokens: 100, output_tokens: 0 }, 2), "exceeded");
  assert(journal.snapshot().usd_micros === 25 && journal.snapshot().stopped);
});
Deno.test("comparison: cost bound includes input, framing and reasoning output; media and unknown models fail", () => {
  const cfg = { provider: "openai" as const, model: "gpt-5", apiKey: "fixture", reasoningEffort: "minimal" };
  const payload = { messages: [{ role: "user", content: "unit" }], max_tokens: 1000 };
  assert(reservationMicros(cfg, payload) > 1512 * 10 + 4096 * 1.25);
  throws(() => reservationMicros({ ...cfg, model: "unpriced" }, payload), "unpriced");
  throws(() => reservationMicros(cfg, { ...payload, messages: [{ role: "user", content: [{ type: "image", source: { media_type: "image/png", data: "abc" } }] }] }), "non-text");
});
Deno.test("comparison: both fixed judges are required and contradictory verdicts are errors", () => {
  assert(!completeJudgment([{ model: "gpt-5-mini", pass: true }, { model: "gpt-4.1-mini", pass: false }]));
  throws(() => completeJudgment([{ model: "gpt-5-mini", pass: true }, { model: "gpt-5-mini", pass: true }]), "distinct");
  throws(() => strictVerdict(JSON.stringify({ pass: true, failed: ["required task"], score: 5, note: "contradiction" })), "contradicts");
});
function arm(model = "gpt-5-mini"): ArmResult { return { model, identity: { source_commit: "a".repeat(40), corpus_sha256: "b".repeat(64), rubric_sha256: "c".repeat(64), clock_utc: "2026-10-21T12:00:00Z", seed: "fixed", concurrency: 4, params: { reasoning_effort: "minimal" } }, status: "SCORED", planned: 320,
  ledger: new BudgetJournal(100000, () => {}).snapshot(), items: corpus().items.map((i) => ({ id: i.id, category: i.category, development_overlap: false, pass: true, latency_ms: 10, input_tokens: 2, output_tokens: 1, cached_tokens: 0, usd_micros: 3, judges: [{ model: "gpt-5-mini", pass: true }, { model: "gpt-4.1-mini", pass: true }] })) }; }
Deno.test("comparison: stopped or judge-incomplete arms never produce a score", () => {
  const a = arm(); a.items[0].judges.pop(); assert(armSummary(a).full === null);
  const b = arm(); b.status = "NOT_SCORED"; assert(armSummary(b).full === null);
});
Deno.test("comparison: paired comparison checks identity and uses case-paired deltas with denominators", () => {
  const a = arm(), b = arm("gpt-5"); b.items[0].pass = false; b.items[0].judges[1].pass = false; b.items[0].latency_ms = 330;
  const r = compareArms(a, b); assert(r.paired.n === 320 && r.paired.score_delta === -1 / 320 && r.paired.mean_latency_delta_ms === 1);
  assert(r.categories.search_refinement.n === 56 && r.categories.search_refinement.discordant_regressed === 1);
  b.identity.source_commit = "d".repeat(40); throws(() => compareArms(a, b), "differ");
});
Deno.test("comparison: canonical identity ignores object-key ordering only", () => {
  assert(canonical({ z: 1, a: [2, 1] }) === '{"a":[2,1],"z":1}'); assert(canonical([1, 2]) !== canonical([2, 1]));
});
Deno.test("comparison: availability preflight uses read-only model GET and fails closed", async () => {
  let calls = 0;
  await modelPreflight("fixture-key", ["gpt-5"], (async (url: string | URL | Request, init?: RequestInit) => { calls++; assert(String(url).endsWith("/models/gpt-5") && !init?.method && !init?.body); return Response.json({ id: "gpt-5" }); }) as typeof fetch);
  assert(calls === 1); await rejects(() => modelPreflight("fixture-key", ["gpt-5"], (async () => new Response("", { status: 404 })) as typeof fetch), "preflight failed");
});
